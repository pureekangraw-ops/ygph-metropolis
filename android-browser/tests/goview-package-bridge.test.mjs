import test from "node:test";
import assert from "node:assert/strict";
import Worker from "../../goview-package-bridge/worker.mjs";
import Engine from "../app/src/main/assets/goview-studio/engine.js";

class FakeR2 {
  items = new Map();
  async get(key){
    const entry=this.items.get(key);
    return entry?{etag:entry.tag,httpEtag:'"'+entry.tag+'"',size:new TextEncoder().encode(entry.body).length,text:async()=>entry.body}:null;
  }
  async put(key,body,options={}){
    const current=this.items.get(key);
    const onlyIf=options.onlyIf||{};
    if(onlyIf.etagDoesNotMatch==="*" && current)return null;
    if(onlyIf.etagMatches!==undefined && current?.tag!==onlyIf.etagMatches)return null;
    const value=typeof body==="string"?body:new TextDecoder().decode(body);
    const tag=Engine.hash(value).slice(0,24);
    this.items.set(key,{body:value,tag});
    return {etag:tag};
  }
}
const setup=()=>({PACKAGES:new FakeR2(), GO_WRITE_TOKEN:"G".repeat(32),ANDROID_READ_TOKEN:"R".repeat(32)});
const path="https://goview.example.test/v1/maps/go_synthetic_route_demo/packages/";
const req=(url,token,method="GET",body)=>new Request(url,{method,headers:{
  ...(token?{authorization:"Bearer "+token}:{}),
  ...(body?{"content-type":"application/json"}:{})
},body});
test("cloud package bridge is closed unless all bindings and role tokens are configured", async()=>{
  assert.equal((await Worker.fetch(req(path+"latest","bad"),{})).status,503);
  const env=setup();delete env.ANDROID_READ_TOKEN;
  assert.equal((await Worker.fetch(req(path+"latest","bad"),env)).status,503);
});
test("read token cannot upload and unauthenticated callers cannot discover maps",async()=>{
  const env=setup(),raw=Engine.pack(Engine.demo());
  assert.equal((await Worker.fetch(req(path+"1",env.ANDROID_READ_TOKEN,"PUT",raw),env)).status,401);
  assert.equal((await Worker.fetch(req(path+"latest",null),env)).status,401);
});
test("GO PUT durable v1 package then Android GET latest exactly matches file",async()=>{
  const env=setup(),raw=Engine.pack(Engine.demo());
  const write=await Worker.fetch(req(path+"1",env.GO_WRITE_TOKEN,"PUT",raw),env);
  assert.equal(write.status,201,await write.text());
  const response=await Worker.fetch(req(path+"latest",env.ANDROID_READ_TOKEN),env);
  assert.equal(response.status,200);
  assert.deepEqual(Engine.unpack(await response.text()),Engine.demo());
  const idempotent=await Worker.fetch(req(path+"1",env.GO_WRITE_TOKEN,"PUT",raw),env);
  assert.equal(idempotent.status,200);
  assert.equal((await idempotent.json()).status,"ALREADY_PRESENT");
});
test("same version with different contents is a conflict and latest is not mutated",async()=>{
  const env=setup(),original=Engine.demo(),raw=Engine.pack(original);
  assert.equal((await Worker.fetch(req(path+"1",env.GO_WRITE_TOKEN,"PUT",raw),env)).status,201);
  const altered=structuredClone(original);altered.title="new unauthorized same-version shape";
  assert.equal((await Worker.fetch(req(path+"1",env.GO_WRITE_TOKEN,"PUT",Engine.pack(altered)),env)).status,409);
  const response=await Worker.fetch(req(path+"latest",env.ANDROID_READ_TOKEN),env);
  assert.deepEqual(Engine.unpack(await response.text()),original);
});
test("new version becomes latest but stale version cannot override it",async()=>{
  const env=setup(),map=Engine.demo(),raw=Engine.pack(map);
  assert.equal((await Worker.fetch(req(path+"1",env.GO_WRITE_TOKEN,"PUT",raw),env)).status,201);
  const updated=structuredClone(map);updated.version=2;updated.roads[0].name="GO update";
  assert.equal((await Worker.fetch(req(path+"2",env.GO_WRITE_TOKEN,"PUT",Engine.pack(updated)),env)).status,201);
  assert.deepEqual(Engine.unpack(await (await Worker.fetch(req(path+"latest",env.ANDROID_READ_TOKEN),env)).text()),updated);
  const stale=structuredClone(map);stale.version=1;stale.roads[0].name="stale mutation";
  assert.equal((await Worker.fetch(req(path+"1",env.GO_WRITE_TOKEN,"PUT",Engine.pack(stale)),env)).status,409);
});
test("missing R2 object is explicit NOT_FOUND; bad or tampered digest rejects",async()=>{
  const env=setup();
  assert.equal((await Worker.fetch(req(path+"latest",env.ANDROID_READ_TOKEN),env)).status,404);
  const p=JSON.parse(Engine.pack(Engine.demo()));p.map.nodes[0].x+=5;
  assert.equal((await Worker.fetch(req(path+"1",env.GO_WRITE_TOKEN,"PUT",JSON.stringify(p)),env)).status,422);
  assert.equal(env.PACKAGES.items.size,0);
});
test("no arbitrary method, path traversal, remote mutation or cross-origin request",async()=>{
  const env=setup(),raw=Engine.pack(Engine.demo());
  assert.equal((await Worker.fetch(req("https://goview.example.test/v1/maps/../admin/packages/1",env.GO_WRITE_TOKEN,"PUT",raw),env)).status,404);
  assert.equal((await Worker.fetch(req(path+"latest",env.GO_WRITE_TOKEN,"DELETE"),env)).status,405);
  assert.equal((await Worker.fetch(req("http://goview.example.test/v1/maps/go_synthetic_route_demo/packages/latest",env.ANDROID_READ_TOKEN),env)).status,400);
});
