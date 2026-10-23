import test from "node:test";
import assert from "node:assert/strict";
import {mcpResponse} from "../mcp.mjs";
const post=(method,params,id=1)=>new Request("https://worker.test/mcp",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({jsonrpc:"2.0",id,method,params})});
test("MCP advertises explicit scoped tools",async()=>{
  const init=await (await mcpResponse(post("initialize"),()=>{throw Error("should not call backend")})).json();
  assert.equal(init.result.serverInfo.name,"ygg-observatory-go-browser");
  const list=await (await mcpResponse(post("tools/list"),()=>{})).json();
  assert.equal(list.result.tools.length,7);
  assert.ok(list.result.tools.find(x=>x.name==="observatory_screenshot"));
});
test("MCP tool call carries only validated GO route",async()=>{
  let hit;
  const answer=await (await mcpResponse(post("tools/call",{name:"observatory_observe",arguments:{}}),async(method,path,args)=>{
    hit={method,path,args};return {url:"https://shop.yggmetro.com/",title:"Shop"};
  })).json();
  assert.deepEqual(hit,{method:"GET",path:"/v1/observe",args:{}});
  assert.equal(answer.result.isError,false);
  const miss=await (await mcpResponse(post("tools/call",{name:"admin_delete",arguments:{}}),async()=>{throw Error("bad")})).json();
  assert.equal(miss.error.code,-32602);
});
test("MCP returns image block only for JPEG screenshot",async()=>{
  const response=await mcpResponse(post("tools/call",{name:"observatory_screenshot",arguments:{}}),async()=>({mimeType:"image/jpeg",image:"AQID"}));
  const doc=await response.json();
  assert.deepEqual(doc.result.content,[{type:"image",mimeType:"image/jpeg",data:"AQID"}]);
});
