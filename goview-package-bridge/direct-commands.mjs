// GO -> GOVIEW direct command mailbox, not a new Hub or a map authority.
// Durable R2 proposals stay separate from the owner phone's authoritative map journal.
const PREFIX="goview/direct/v1/";
const CID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const HEADER={"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff"};
const json=(status,value)=>new Response(JSON.stringify(value),{status,headers:HEADER});
const commandKey=id=>PREFIX+"commands/"+id+".json";
const receiptKey=id=>PREFIX+"receipts/"+id+".json";
const plain=o=>!!o&&typeof o==="object"&&!Array.isArray(o);
const fields=(o,keys)=>plain(o)&&Object.keys(o).every(k=>keys.includes(k));
function tokenEquals(given,expected){
 if(typeof given!=="string"||typeof expected!=="string"||!given||!expected||given.length>512||expected.length>512)return false;
 const a=new TextEncoder().encode(given),b=new TextEncoder().encode(expected);
 let different=a.length^b.length;
 for(let i=0;i<Math.max(a.length,b.length);i++)different|=(a[i]||0)^(b[i]||0);
 return different===0;
}
const authorized=(req,expected)=>tokenEquals((req.headers.get("authorization")||"").replace(/^Bearer /,""),expected);
const finitePoint=p=>fields(p,["latitude","longitude"])&&Number.isFinite(p.latitude)&&Number.isFinite(p.longitude)&&Math.abs(p.latitude)<=90&&Math.abs(p.longitude)<=180;
export function validateDirectCommand(command){
 if(!fields(command,["schema","commandId","type","point","label","expectedRevision"])||
    command.schema!=="goview.direct-command.v1"||!CID.test(command.commandId||"")||
    !["POINT_FOCUS","PIN_PROPOSAL"].includes(command.type)||!finitePoint(command.point))return null;
 if(command.type==="PIN_PROPOSAL"&&(typeof command.label!=="string"||command.label.trim().length<1||command.label.length>140))return null;
 if(command.type==="POINT_FOCUS"&&command.label!==undefined)return null;
 if(command.expectedRevision!==undefined&&(!Number.isSafeInteger(command.expectedRevision)||command.expectedRevision<0))return null;
 return {schema:command.schema,commandId:command.commandId.toLowerCase(),type:command.type,
   point:{latitude:command.point.latitude,longitude:command.point.longitude},
   ...(command.type==="PIN_PROPOSAL"?{label:command.label.trim()}:{}),
   ...(command.expectedRevision!==undefined?{expectedRevision:command.expectedRevision}:{})};
}
async function boundedBody(req,max=4096){
 const length=Number(req.headers.get("content-length")||0);
 if(length>max)return null;
 const s=await req.text();
 return new TextEncoder().encode(s).length>max?null:JSON.parse(s);
}
const compact=o=>JSON.stringify(o);
export async function directCommandRouter(req,env) {
 const url=new URL(req.url),path=url.pathname,parts=path.split("/").filter(Boolean);
 if(!env?.PACKAGES||!env.GO_WRITE_TOKEN||!env.ANDROID_READ_TOKEN||env.GO_WRITE_TOKEN===env.ANDROID_READ_TOKEN)
   return json(503,{error:"DIRECT_BRIDGE_NOT_CONFIGURED"});
 const writer=authorized(req,env.GO_WRITE_TOKEN),device=authorized(req,env.ANDROID_READ_TOKEN);
 if(!writer&&!device)return json(401,{error:"UNAUTHORIZED"});
 const bucket=env.PACKAGES;
 if(parts.length===3&&path==="/v1/direct/commands"&&req.method==="POST"){
   if(!writer)return json(403,{error:"GO_ONLY"});
   let source;try{source=await boundedBody(req);}catch{return json(400,{error:"INVALID_JSON"});}
   const command=validateDirectCommand(source);
   if(!command)return json(422,{error:"INVALID_COMMAND"});
   const key=commandKey(command.commandId),previous=await bucket.get(key);
   if(previous){
     const existing=JSON.parse(await previous.text());
     if(compact(existing.command)!==compact(command))return json(409,{error:"COMMAND_ID_CONFLICT"});
     return json(200,{ok:true,status:"ALREADY_QUEUED",commandId:command.commandId});
   }
   const saved=await bucket.put(key,compact({command,createdAt:Date.now()}),{
      onlyIf:{etagDoesNotMatch:"*"},httpMetadata:{contentType:"application/json"}});
   if(!saved)return json(409,{error:"CONCURRENT_COMMAND_WRITE"});
   return json(201,{ok:true,status:"QUEUED_NOT_APPLIED",commandId:command.commandId});
 }
 if(parts.length===4&&path==="/v1/direct/commands/pending"&&req.method==="GET"){
   if(!device)return json(403,{error:"DEVICE_ONLY"});
   const pending=[];let cursor=undefined;
   for(let page=0;page<6&&pending.length<5;page++){
     const batch=await bucket.list({prefix:PREFIX+"commands/",limit:100,...(cursor?{cursor}:{})});
     for(const object of batch.objects){
       if(pending.length>=5)break;
       const id=object.key.slice((PREFIX+"commands/").length).replace(/\.json$/,"");
       if(!CID.test(id)||await bucket.head(receiptKey(id)))continue;
       const stored=await bucket.get(object.key);
       if(!stored)continue;
       const item=JSON.parse(await stored.text());
       if(Date.now()-item.createdAt>7*86400000)continue;
       pending.push(item.command);
     }
     if(batch.list_complete||!batch.cursor)break;
     cursor=batch.cursor;
   }
   return json(200,{ok:true,status:"READY",commands:pending});
 }
 if(parts.length===5&&parts[0]==="v1"&&parts[1]==="direct"&&parts[2]==="commands"&&CID.test(parts[3])){
   const id=parts[3].toLowerCase(),item=await bucket.get(commandKey(id));
   if(!item)return json(404,{error:"COMMAND_NOT_FOUND"});
   if(parts[4]==="status"&&req.method==="GET"){
     if(!writer)return json(403,{error:"GO_ONLY"});
     const done=await bucket.get(receiptKey(id));
     return json(200,{ok:true,commandId:id,status:done?"DEVICE_RECEIPT_RECORDED":"QUEUED_NOT_APPLIED",
       receipt:done?JSON.parse(await done.text()):null});
   }
   if(parts[4]==="receipt"&&req.method==="POST"){
     if(!device)return json(403,{error:"DEVICE_ONLY"});
     let report;try{report=await boundedBody(req,2048);}catch{return json(400,{error:"INVALID_JSON"});}
     if(!fields(report,["commandId","status","revision","readbackVerified"])||
       report.commandId!==id||!["APPLIED","DISPLAY_REQUESTED","DECLINED","FAILED"].includes(report.status)||
       !Number.isSafeInteger(report.revision)||report.revision<0||
       typeof report.readbackVerified!=="boolean"||
       (report.status==="APPLIED"&&!report.readbackVerified))return json(422,{error:"INVALID_RECEIPT"});
     const receipt={commandId:id,status:report.status,revision:report.revision,readbackVerified:report.readbackVerified};
     const key=receiptKey(id),prior=await bucket.get(key);
     if(prior)return compact(JSON.parse(await prior.text()))===compact(receipt)
        ?json(200,{ok:true,status:"RECEIPT_ALREADY_STORED",receipt})
        :json(409,{error:"RECEIPT_CONFLICT"});
     const wrote=await bucket.put(key,compact(receipt),{
       onlyIf:{etagDoesNotMatch:"*"},httpMetadata:{contentType:"application/json"}});
     return wrote?json(201,{ok:true,status:"DEVICE_RECEIPT_STORED",receipt})
       :json(409,{error:"CONCURRENT_RECEIPT_WRITE"});
   }
 }
 return json(404,{error:"NOT_FOUND"});
}
