/* GOVIEW Map Studio: portable, deterministic, dependency-free map model and routing.
 * A map describes hand-drawn roads, NOT verified real-world road access.
 * Works in Android WebView and in Node tests without network access.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.GoviewEngine = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const FORMAT = "goview.map.package.v1";
  const LIMIT = 1024 * 1024;
  const K = [
    0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
    0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
    0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
    0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
    0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
    0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
    0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
    0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2
  ];
  function assert(ok, msg) { if (!ok) throw Error(msg); }
  function hash(text) {
    const bytes = Array.from(new TextEncoder().encode(text));
    const bitLength = bytes.length * 8;
    bytes.push(128);
    while (bytes.length % 64 !== 56) bytes.push(0);
    const hi = Math.floor(bitLength / 4294967296), lo = bitLength >>> 0;
    for (let s=24; s>=0; s-=8) bytes.push((hi >>> s) & 255);
    for (let s=24; s>=0; s-=8) bytes.push((lo >>> s) & 255);
    const h=[0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
    const rotr=(x,n)=>(x>>>n)|(x<<(32-n));
    for(let offset=0; offset<bytes.length;offset+=64){
      const w=new Array(64);
      for(let i=0;i<16;i++){ const j=offset+i*4; w[i]=((bytes[j]<<24)|(bytes[j+1]<<16)|(bytes[j+2]<<8)|bytes[j+3])>>>0; }
      for(let i=16;i<64;i++) {
        const x=w[i-15],y=w[i-2];
        const s0=rotr(x,7)^rotr(x,18)^(x>>>3),s1=rotr(y,17)^rotr(y,19)^(y>>>10);
        w[i]=(w[i-16]+s0+w[i-7]+s1)>>>0;
      }
      let [a,b,c,d,e,f,g,v]=h;
      for(let i=0;i<64;i++){
        const s1=rotr(e,6)^rotr(e,11)^rotr(e,25);
        const ch=(e&f)^(~e&g);
        const t1=(v+s1+ch+K[i]+w[i])>>>0;
        const s0=rotr(a,2)^rotr(a,13)^rotr(a,22);
        const maj=(a&b)^(a&c)^(b&c);
        const t2=(s0+maj)>>>0;
        v=g;g=f;f=e;e=(d+t1)>>>0;d=c;c=b;b=a;a=(t1+t2)>>>0;
      }
      const add=[a,b,c,d,e,f,g,v];
      for(let i=0;i<8;i++)h[i]=(h[i]+add[i])>>>0;
    }
    return h.map(v=>v.toString(16).padStart(8,"0")).join("");
  }
  function uniqueIds(xs,label) {
    const ids=new Set();
    for (const x of xs) { assert(x && typeof x.id==="string" && /^[a-zA-Z0-9_-]{1,60}$/.test(x.id),label+" id"); assert(!ids.has(x.id),label+" duplicate id"); ids.add(x.id); }
    return ids;
  }
  function coord(value) { return typeof value==="number" && Number.isFinite(value) && Math.abs(value)<=2000000; }
  function string(value,max) {return typeof value==="string" && value.trim().length>0 && value.length<=max;}
  function normalize(data) {
    assert(data && typeof data==="object" && !Array.isArray(data),"map object required");
    assert(data.schema===1,"unsupported map schema");
    assert(string(data.mapId,70) && /^[a-zA-Z0-9_-]+$/.test(data.mapId),"invalid mapId");
    assert(string(data.title,140),"map title required");
    assert(Number.isSafeInteger(data.version) && data.version>=1 && data.version<=1000000,"invalid version");
    assert(data.origin && typeof data.origin==="object" && Number.isFinite(data.origin.lat) &&
      Math.abs(data.origin.lat)<=90 && Number.isFinite(data.origin.lng) && Math.abs(data.origin.lng)<=180,"origin WGS84");
    for(const key of ["nodes","roads","areas","pois"])assert(Array.isArray(data[key]),"missing "+key);
    assert(data.nodes.length<=2000 && data.roads.length<=4000 && data.areas.length<=200 && data.pois.length<=1000,"map capacity");
    const nids=uniqueIds(data.nodes,"node"),rids=uniqueIds(data.roads,"road");
    uniqueIds(data.areas,"area");uniqueIds(data.pois,"POI");
    const nodes=data.nodes.map(n=>{
      assert(coord(n.x)&&coord(n.y),"invalid node position");
      return {id:n.id,x:n.x,y:n.y};
    });
    const roads=data.roads.map(r=>{
      assert(nids.has(r.from)&&nids.has(r.to)&&r.from!==r.to,"road endpoint missing or self-connected");
      assert(!r.name || string(r.name,100),"invalid road name");
      return {id:r.id,from:r.from,to:r.to,name:r.name||""};
    });
    const areas=data.areas.map(a=>{
      assert(string(a.name,100)&&Array.isArray(a.points)&&a.points.length>=3&&a.points.length<=150,"invalid area");
      return {id:a.id,name:a.name,points:a.points.map(p=>{assert(p&&coord(p.x)&&coord(p.y),"invalid polygon");return {x:p.x,y:p.y};})};
    });
    const pois=data.pois.map(p=>{
      assert(string(p.name,140)&&nids.has(p.nodeId),"POI must attach to node");
      return {id:p.id,name:p.name,nodeId:p.nodeId};
    });
    assert(nodes.length>0 || (roads.length===0 && pois.length===0),"empty nodes");
    const result={schema:1,mapId:data.mapId,title:data.title,version:data.version,
      origin:{lat:data.origin.lat,lng:data.origin.lng},nodes,roads,areas,pois};
    assert(new TextEncoder().encode(JSON.stringify(result)).length<=LIMIT,"map larger than 1 MiB");
    return result;
  }
  function fresh(title="GO แผนที่ใหม่") {
    return {schema:1,mapId:"go_"+Date.now().toString(36),title,version:1,
      origin:{lat:13.75,lng:100.50},nodes:[],roads:[],areas:[],pois:[]};
  }
  function pack(data) {
    const map=normalize(data), serialized=JSON.stringify(map);
    return JSON.stringify({format:FORMAT,checksum:"sha256:"+hash(serialized),map});
  }
  function unpack(raw) {
    assert(typeof raw==="string" && new TextEncoder().encode(raw).length<=LIMIT+256,"package too large");
    const envelope=JSON.parse(raw);
    assert(envelope && envelope.format===FORMAT && typeof envelope.checksum==="string","unsupported package");
    const map=normalize(envelope.map);
    assert(envelope.checksum==="sha256:"+hash(JSON.stringify(map)),"checksum mismatch");
    return map;
  }
  function route(map,startId,endId) {
    const data=normalize(map),pos=new Map(data.nodes.map(x=>[x.id,x]));
    assert(pos.has(startId)&&pos.has(endId),"route endpoint not found");
    const neighbours=new Map(data.nodes.map(x=>[x.id,[]]));
    for(const r of data.roads){
      const a=pos.get(r.from),b=pos.get(r.to),length=Math.hypot(a.x-b.x,a.y-b.y);
      assert(length>0,"zero-length road cannot route");
      neighbours.get(r.from).push({to:r.to,length,roadId:r.id});
      neighbours.get(r.to).push({to:r.from,length,roadId:r.id});
    }
    const dist=new Map([[startId,0]]),prev=new Map(),open=new Set([startId]),closed=new Set();
    while(open.size) {
      let u=null,best=Infinity;
      for(const key of open){const d=dist.get(key);if(d<best){u=key;best=d;}}
      open.delete(u);if(u===endId)break;closed.add(u);
      for(const edge of neighbours.get(u)){
        if(closed.has(edge.to))continue;
        const next=best+edge.length;
        if(next<(dist.get(edge.to)??Infinity)){
          dist.set(edge.to,next);prev.set(edge.to,{id:u,roadId:edge.roadId});open.add(edge.to);
        }
      }
    }
    if(!dist.has(endId))return null;
    const ids=[endId],roads=[];
    while(ids[0]!==startId){const v=prev.get(ids[0]);assert(v,"route disconnected");roads.unshift(v.roadId);ids.unshift(v.id);}
    return {nodeIds:ids,roadIds:roads,meters:Math.round(dist.get(endId)*100)/100};
  }
  function nearestNode(map,x,y,limit=60) {
    let selected=null,best=limit;
    for(const n of map.nodes){
      const d=Math.hypot(n.x-x,n.y-y);
      if(d<=best){best=d;selected=n;}
    }
    return selected;
  }
  function demo() {
    const map=fresh("GO · แผนที่ตัวอย่าง (ถนนจำลอง)");
    map.mapId="go_synthetic_route_demo"; map.nodes=[
      {id:"A",x:80,y:80},{id:"B",x:250,y:80},{id:"C",x:430,y:80},
      {id:"D",x:250,y:210},{id:"E",x:430,y:210},{id:"F",x:600,y:210},
      {id:"G",x:80,y:360},{id:"H",x:250,y:360},{id:"I",x:600,y:360}
    ];
    map.roads=[
      ["A","B"],["B","C"],["B","D"],["D","E"],["C","E"],["E","F"],["A","G"],
      ["G","H"],["D","H"],["H","I"],["F","I"]
    ].map(([from,to],i)=>({id:"road"+(i+1),from,to,name:"ถนนจำลอง "+(i+1)}));
    map.areas=[{id:"park",name:"สวนจำลอง",points:[{x:320,y:250},{x:420,y:250},{x:420,y:335},{x:320,y:335}]}];
    map.pois=[{id:"p1",name:"จุดเริ่มต้น",nodeId:"A"},{id:"p2",name:"จุดหมาย",nodeId:"I"}];
    return normalize(map);
  }
  function diff(current,incoming){
    const compare=(key)=>{
      const old=new Map(current[key].map(x=>[x.id,JSON.stringify(x)]));
      const now=new Map(incoming[key].map(x=>[x.id,JSON.stringify(x)]));
      return {added:[...now.keys()].filter(id=>!old.has(id)).length,
        changed:[...now.keys()].filter(id=>old.has(id)&&old.get(id)!==now.get(id)).length,
        removed:[...old.keys()].filter(id=>!now.has(id)).length};
    };
    return {nodes:compare("nodes"),roads:compare("roads"),areas:compare("areas"),pois:compare("pois")};
  }
  function lonLat(map,node) {
    const lat=map.origin.lat + node.y/110540;
    const lng=map.origin.lng + node.x/(111320*Math.max(0.01,Math.cos(map.origin.lat*Math.PI/180)));
    return [lng,lat];
  }
  function toGeoJson(data){
    const map=normalize(data),nodes=new Map(map.nodes.map(n=>[n.id,n]));
    const feature=(id,geometry,properties)=>({type:"Feature",id,geometry,properties});
    return {type:"FeatureCollection",name:map.title,features:[
      ...map.roads.map(r=>feature(r.id,{type:"LineString",coordinates:[lonLat(map,nodes.get(r.from)),lonLat(map,nodes.get(r.to))]},{name:r.name,kind:"road"})),
      ...map.areas.map(a=>feature(a.id,{type:"Polygon",coordinates:[[...a.points.map(p=>lonLat(map,p)),lonLat(map,a.points[0])]]},{name:a.name,kind:"area"})),
      ...map.pois.map(p=>feature(p.id,{type:"Point",coordinates:lonLat(map,nodes.get(p.nodeId))},{name:p.name,kind:"poi"}))
    ]};
  }
  /**
   * Import geographic lines/polygons/points as editable drawn features.
   * Only shared explicit LineString vertices create graph junctions.
   * Geometries that visually cross without a shared vertex do NOT connect.
   */
  function fromGeoJson(collection) {
    assert(collection&&collection.type==="FeatureCollection"&&Array.isArray(collection.features),"GeoJSON FeatureCollection required");
    assert(collection.features.length<=2000,"too many GeoJSON features");
    const map=fresh(string(collection.name,140)?collection.name:"GO นำเข้าข้อมูล GeoJSON");
    const coordinates=[];
    for(const feature of collection.features){
      assert(feature&&feature.type==="Feature"&&feature.geometry,"invalid GeoJSON Feature");
      const g=feature.geometry;
      if(g.type==="Point") coordinates.push(g.coordinates);
      else if(g.type==="LineString"){
        assert(Array.isArray(g.coordinates)&&g.coordinates.length>=2&&g.coordinates.length<=1000,"invalid LineString");
        coordinates.push(...g.coordinates);
      }else if(g.type==="Polygon"){
        assert(Array.isArray(g.coordinates)&&g.coordinates.length===1 &&
          Array.isArray(g.coordinates[0])&&g.coordinates[0].length>=4&&g.coordinates[0].length<=151,
          "Polygon needs exactly one outer ring with <=150 vertices");
        coordinates.push(...g.coordinates[0]);
      }else throw Error("unsupported GeoJSON geometry "+String(g.type));
    }
    for(const point of coordinates){
      assert(Array.isArray(point)&&point.length===2&&point.every(Number.isFinite) &&
        Math.abs(point[0])<=180&&Math.abs(point[1])<=90,"invalid WGS84 lon/lat point");
    }
    if(coordinates.length===0)return normalize(map);
    map.origin={lng:coordinates[0][0],lat:coordinates[0][1]};
    const scaleLng=111320*Math.max(.01,Math.cos(map.origin.lat*Math.PI/180));
    const local=p=>({x:Math.round((p[0]-map.origin.lng)*scaleLng*1000)/1000,
      y:Math.round((p[1]-map.origin.lat)*110540*1000)/1000});
    const keys=new Map();
    const ensureNode=p=>{
      const xy=local(p),key=xy.x+","+xy.y;
      if(keys.has(key))return keys.get(key);
      const id="n"+(map.nodes.length+1);
      map.nodes.push({id,...xy});keys.set(key,id);return id;
    };
    for(const feat of collection.features){
      const g=feat.geometry,properties=feat.properties&&typeof feat.properties==="object"?feat.properties:{};
      const name=string(properties.name,140)?properties.name:"จาก GeoJSON";
      if(g.type==="LineString"){
        const ids=g.coordinates.map(ensureNode);
        for(let i=1;i<ids.length;i++){
          if(ids[i]!==ids[i-1])map.roads.push({id:"r"+(map.roads.length+1),from:ids[i-1],to:ids[i],name:name.slice(0,100)});
        }
      }else if(g.type==="Point"){
        const nodeId=ensureNode(g.coordinates);
        map.pois.push({id:"poi"+(map.pois.length+1),name,nodeId});
      }else if(g.type==="Polygon"){
        const ring=g.coordinates[0],first=ring[0],last=ring[ring.length-1];
        assert(first[0]===last[0]&&first[1]===last[1],"Polygon ring must be closed");
        const points=ring.slice(0,-1).map(local);
        map.areas.push({id:"a"+(map.areas.length+1),name:name.slice(0,100),points});
      }
    }
    return normalize(map);
  }
  function updateDecision(current, incoming) {
    current=normalize(current); incoming=normalize(incoming);
    if(current.mapId!==incoming.mapId)return "NEW_MAP";
    assert(incoming.version>=current.version,"STALE_VERSION");
    if(incoming.version===current.version){
      assert(pack(current)===pack(incoming),"VERSION_CONFLICT");
      return "DUPLICATE";
    }
    return "UPDATE";
  }
  return {updateDecision,FORMAT,hash,normalize,fresh,pack,unpack,route,nearestNode,demo,diff,toGeoJson,fromGeoJson,lonLat};
});
