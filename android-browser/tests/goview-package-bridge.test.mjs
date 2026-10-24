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

test("misconfigured identical read and write secrets fail closed",async()=>{
  const env=setup();env.ANDROID_READ_TOKEN=env.GO_WRITE_TOKEN;
  assert.equal((await Worker.fetch(req(path+"latest",env.GO_WRITE_TOKEN),env)).status,503);
});
test("oversize map streams fail before reaching private R2",async()=>{
  const env=setup();
  const huge=JSON.stringify({filler:"x".repeat(1024*1024+1024)});
  const response=await Worker.fetch(req(path+"1",env.GO_WRITE_TOKEN,"PUT",huge),env);
  assert.equal(response.status,413);
  assert.equal(env.PACKAGES.items.size,0);
});

import {invokeGoview} from '../../goview-package-bridge/go-adapter.mjs';
test('GO adapter publishes exact artifact and reads old version after latest advances',async()=>{
 const env=setup(),map=Engine.demo(),raw=Engine.pack(map);
 const args={mapId:map.mapId,version:1,sha256:Engine.hash(raw),transferId:'transfer_one',package:raw};
 const receipt=await invokeGoview(env,'goview_publish',args);
 assert.equal(receipt.ok,true);assert.equal(receipt.package,raw);
 assert.equal(receipt.androidStatus,'NOT_OBSERVED_OWNER_APPROVAL_REQUIRED');
 map.version=2;const newer=Engine.pack(map);
 assert.equal((await invokeGoview(env,'goview_publish',{...args,version:2,sha256:Engine.hash(newer),package:newer})).httpStatus,409);
 assert.equal((await invokeGoview(env,'goview_publish',{...args,transferId:'transfer_new',version:2,sha256:Engine.hash(newer),package:newer})).ok,true);
 assert.equal((await invokeGoview(env,'goview_readback',args)).package,raw);
 assert.equal((await invokeGoview(env,'goview_readback',{...args,sha256:'0'.repeat(64)})).status,'READBACK_MISMATCH');
});
test('GO adapter rejects artifact substitution and fails closed without storage',async()=>{
 const raw=Engine.pack(Engine.demo()), args={mapId:'other_map',version:1,sha256:Engine.hash(raw),transferId:'transfer_two',package:raw};
 assert.equal((await invokeGoview(setup(),'goview_publish',args)).status,'ARTIFACT_MISMATCH');
 assert.equal((await invokeGoview({},'goview_readback',args)).ok,false);
 assert.equal((await invokeGoview(setup(),'goview_delete',args)).status,'UNSUPPORTED');
});

test('exact newline bytes roundtrip and identical transfer retries survive receiver recreation',async()=>{
 const env=setup(),raw=Engine.pack(Engine.demo())+'\n';
 const args={mapId:'go_synthetic_route_demo',version:1,sha256:Engine.hash(raw),transferId:'newline_transfer',package:raw};
 const first=await invokeGoview(env,'goview_publish',args);assert.equal(first.ok,true);assert.equal(first.package,raw);
 const retry=await invokeGoview({...env},'goview_publish',args);assert.equal(retry.ok,true);assert.equal(retry.sha256,args.sha256);
 assert.equal((await invokeGoview({...env},'goview_readback',args)).package,raw);
 assert.equal((await invokeGoview(env,'goview_publish',{...args,package:raw.trim(),sha256:Engine.hash(raw.trim())})).httpStatus,409);
});
test('receiver rejects coerced identities before touching storage',async()=>{
 const raw=Engine.pack(Engine.demo()),args={mapId:'go_synthetic_route_demo',version:1,sha256:Engine.hash(raw),transferId:'strict_transfer',package:raw};
 for(const field of ['mapId','transferId','sha256'])for(const value of [123,[args[field]],{},null]) {
  const env=setup();assert.equal((await invokeGoview(env,'goview_publish',{...args,[field]:value})).status,'INVALID_ARTIFACT_IDENTITY');
  assert.equal(env.PACKAGES.items.size,0);
 }
});
test('racing distinct artifacts cannot claim the same transfer ID',async()=>{
 const env=setup(),one=Engine.demo(),two=Engine.demo();two.mapId='other_fixture';
 const make=m=>({mapId:m.mapId,version:m.version,sha256:Engine.hash(Engine.pack(m)),transferId:'race_transfer',package:Engine.pack(m)});
 const results=await Promise.all([invokeGoview(env,'goview_publish',make(one)),invokeGoview(env,'goview_publish',make(two))]);
 assert.equal(results.filter(r=>r.ok).length,1);assert.equal(results.filter(r=>r.httpStatus===409).length,1);
});
