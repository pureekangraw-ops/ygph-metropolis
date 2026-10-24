import test from "node:test";
import assert from "node:assert/strict";
import {directCommandRouter} from "../direct-commands.mjs";
const uuid="94cdd7a2-1817-470c-bdf9-6a8cab11f001";
const base="https://goview-package-bridge.pureekangraw.workers.dev";
const shape={schema:"goview.direct-command.v1",commandId:uuid,type:"PIN_PROPOSAL",
  point:{latitude:13.81,longitude:100.67},label:"ตัวอย่างหมุดจาก GO"};
function setup(){
 const data=new Map();
 const bucket={
  get:async k=>data.has(k)?{text:async()=>data.get(k)}:null,
  head:async k=>data.has(k)?{}:null,
  put:async(k,value,opts)=>{
   if(opts?.onlyIf?.etagDoesNotMatch==="*"&&data.has(k))return null;
   data.set(k,String(value));return {};
  },
  list:async({prefix})=>({objects:[...data.keys()].filter(k=>k.startsWith(prefix)).sort().map(key=>({key})),
    list_complete:true})
 };
 const env={PACKAGES:bucket,GO_WRITE_TOKEN:"go_token_private_1234567890",ANDROID_READ_TOKEN:"android_token_private_1234567890"};
 const request=(path,token,method="GET",body)=>directCommandRouter(new Request(base+path,{
   method,headers:{authorization:"Bearer "+token,"content-type":"application/json"},
   ...(body?{body:JSON.stringify(body)}:{})
 }),env);
 return {data,env,request};
}
test("GO queues a proposal; only owner device may read; receipt proves the boundary",async()=>{
 const {env,request}=setup(),path="/v1/direct/commands";
 assert.equal((await request(path,env.ANDROID_READ_TOKEN,"POST",shape)).status,403);
 const created=await request(path,env.GO_WRITE_TOKEN,"POST",shape);
 assert.equal(created.status,201);
 assert.equal((await created.json()).status,"QUEUED_NOT_APPLIED");
 const items=await request(path+"/pending",env.ANDROID_READ_TOKEN);
 assert.equal((await items.json()).commands[0].label,shape.label);
 assert.equal((await request(path+"/pending",env.GO_WRITE_TOKEN)).status,403);
 assert.equal((await request(path+"/"+uuid+"/status",env.GO_WRITE_TOKEN)).status,200);
 const receipt={commandId:uuid,status:"APPLIED",revision:4,readbackVerified:true};
 assert.equal((await request(path+"/"+uuid+"/receipt",env.ANDROID_READ_TOKEN,"POST",receipt)).status,201);
 assert.equal((await request(path+"/"+uuid+"/receipt",env.ANDROID_READ_TOKEN,"POST",receipt)).status,200);
 assert.equal((await (await request(path+"/pending",env.ANDROID_READ_TOKEN)).json()).commands.length,0);
 const status=await (await request(path+"/"+uuid+"/status",env.GO_WRITE_TOKEN)).json();
 assert.equal(status.receipt.readbackVerified,true);
});
test("reject fabricated applied receipt, tampered id, conflicting command",async()=>{
 const {env,request}=setup(),path="/v1/direct/commands";
 assert.equal((await request(path,env.GO_WRITE_TOKEN,"POST",{...shape,type:"SEND_GPS"})).status,422);
 assert.equal((await request(path,"wrong_token","POST",shape)).status,401);
 assert.equal((await request(path,env.GO_WRITE_TOKEN,"POST",shape)).status,201);
 assert.equal((await request(path,env.GO_WRITE_TOKEN,"POST",{...shape,label:"changed"})).status,409);
 assert.equal((await request(path+"/"+uuid+"/receipt",env.ANDROID_READ_TOKEN,"POST",
 {commandId:uuid,status:"APPLIED",revision:5,readbackVerified:false})).status,422);
 assert.equal((await request(path+"/"+uuid+"/receipt",env.GO_WRITE_TOKEN,"POST",
 {commandId:uuid,status:"DECLINED",revision:5,readbackVerified:false})).status,403);
});
