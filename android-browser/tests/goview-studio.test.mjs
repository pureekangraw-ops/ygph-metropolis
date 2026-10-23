import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const G = require("../app/src/main/assets/goview-studio/engine.js");

test("SHA-256 follows published empty and abc vectors", () => {
  assert.equal(G.hash(""), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  assert.equal(G.hash("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
});
test("GO-created map can be packed, verified and restored without old data", () => {
  const original=G.demo();
  const pkg=G.pack(original);
  const restored=G.unpack(pkg);
  assert.deepEqual(restored,original);
  assert.equal(restored.roads.length,11);
  assert.match(pkg,/sha256:[0-9a-f]{64}/);
});
test("tampered geometry or checksum never updates map", () => {
  const pkg=JSON.parse(G.pack(G.demo()));
  pkg.map.nodes[0].x+=1;
  assert.throws(()=>G.unpack(JSON.stringify(pkg)),/checksum mismatch/);
  pkg.checksum="sha256:"+"a".repeat(64);
  assert.throws(()=>G.unpack(JSON.stringify(pkg)),/checksum mismatch/);
});
test("shortest path uses roads rather than flying straight across empty space",()=>{
  const map=G.demo();
  const answer=G.route(map,"A","I");
  assert.ok(answer.meters>0);
  assert.equal(answer.nodeIds[0],"A");
  assert.equal(answer.nodeIds.at(-1),"I");
  assert.equal(answer.roadIds.length,answer.nodeIds.length-1);
  for(let i=1;i<answer.nodeIds.length;i++){
    assert.ok(map.roads.some(r=>[r.from,r.to].includes(answer.nodeIds[i-1])&&[r.from,r.to].includes(answer.nodeIds[i])));
  }
  assert.ok(answer.meters>Math.hypot(600-80,360-80));
});
test("unconnected graph has explicit no-route result",()=>{
  const map=G.demo();map.roads=[];assert.equal(G.route(map,"A","I"),null);
  assert.deepEqual(G.route(map,"A","A"),{nodeIds:["A"],roadIds:[],meters:0});
});
test("invalid graph and conflicting IDs are rejected",()=>{
  const base=G.demo();
  base.roads.push({id:"invalid",from:"A",to:"missing",name:"bad"});
  assert.throws(()=>G.normalize(base),/road endpoint/);
  base.roads.pop();
  base.nodes.push({...base.nodes[0]});
  assert.throws(()=>G.normalize(base),/duplicate id/);
});
test("owner can preview update diff without mutating current map",()=>{
  const before=G.demo();
  const after=structuredClone(before);after.version=2;after.nodes[0].x+=23;
  after.pois.push({id:"p3",name:"คลินิก",nodeId:"C"});
  const diff=G.diff(before,after);
  assert.equal(diff.nodes.changed,1);
  assert.equal(diff.pois.added,1);
  assert.equal(before.nodes[0].x,80);
});
test("GeoJSON contains road LineStrings, polygons and points with WGS84 positions",()=>{
  const collection=G.toGeoJson(G.demo());
  assert.equal(collection.type,"FeatureCollection");
  assert.ok(collection.features.some(f=>f.geometry.type==="LineString"));
  assert.ok(collection.features.some(f=>f.geometry.type==="Polygon"));
  assert.ok(collection.features.some(f=>f.geometry.type==="Point"));
  const p=collection.features[0].geometry.coordinates[0];
  assert.ok(p[0]>=-180&&p[0]<=180&&p[1]>=-90&&p[1]<=90);
});
test("reject package that claims unsupported future version",()=>{
  const map=G.demo();map.schema=2;
  assert.throws(()=>G.pack(map),/unsupported map schema/);
});
