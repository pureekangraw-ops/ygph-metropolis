import Engine from "../android-browser/app/src/main/assets/goview-studio/engine.js";

const LIMIT = 1024 * 1024 + 256;
const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff"
};
const validMapId = id => /^[a-zA-Z0-9_-]{1,70}$/.test(id);
const validVersion = value => /^[1-9][0-9]{0,5}$/.test(value) && Number(value) <= 1000000;
const reply = (status, data) => new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
const notConfigured = () => reply(503, { error: "NOT_CONFIGURED", detail: "GO/Android token or R2 binding not configured" });

function secureEquals(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || !a || !b) return false;
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  if (x.length > 512 || y.length > 512) return false;
  let different = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) different |= (x[i] || 0) ^ (y[i] || 0);
  return different === 0;
}
function allowed(request, expected) {
  const header = request.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  return secureEquals(token, expected);
}
const versionKey = (id, v) => `goview/${id}/versions/${String(v).padStart(7, "0")}.json`;
const pointerKey = id => `goview/${id}/latest.json`;
const asText = object => object ? object.text() : null;

async function fetchMap(bucket, id, version) {
  const index = version === "latest"
    ? await bucket.get(pointerKey(id))
    : null;
  if (version === "latest" && !index) return reply(404, {error:"MAP_NOT_FOUND"});
  let target = version;
  if (index) {
    const marker = JSON.parse(await index.text());
    target = String(marker.version);
  }
  const file = await bucket.get(versionKey(id, target));
  if (!file) return reply(404, {error:"VERSION_NOT_FOUND"});
  if (file.size > LIMIT) return reply(503, {error:"STORAGE_CORRUPTION"});
  const text = await file.text();
  try {
    const map = Engine.unpack(text);
    if (map.mapId !== id || String(map.version) !== target) throw Error("wrong identity");
    const result = new Response(text, {status:200, headers:{
      ...JSON_HEADERS,"etag":file.httpEtag || `"${Engine.hash(text)}"`,
      "x-goview-version": String(map.version), "x-goview-sha256": Engine.hash(text)
    }});
    return result;
  } catch {
    return reply(503, {error:"STORAGE_CORRUPTION"});
  }
}
async function readBoundedBody(request) {
  const reader = request.body?.getReader();
  if (!reader) return "";
  const chunks=[]; let length=0;
  while (true) {
    const part=await reader.read();
    if (part.done) break;
    length+=part.value.byteLength;
    if (length>LIMIT) { await reader.cancel(); return null; }
    chunks.push(part.value);
  }
  const combined=new Uint8Array(length);
  let offset=0;
  for (const value of chunks){combined.set(value,offset);offset+=value.byteLength;}
  return new TextDecoder("utf-8",{fatal:true}).decode(combined);
}
async function saveMap(bucket, id, version, request) {
  if (request.headers.get("content-length") && Number(request.headers.get("content-length")) > LIMIT)
    return reply(413, {error:"PACKAGE_TOO_LARGE"});
  const raw = await readBoundedBody(request);
  if (raw === null) return reply(413, {error:"PACKAGE_TOO_LARGE"});
  let map;
  try {
    map = Engine.unpack(raw.trim());
    if(map.mapId !== id || String(map.version) !== version) return reply(409,{error:"IDENTITY_MISMATCH"});
  } catch {
    return reply(422, {error:"INVALID_PACKAGE"});
  }
  const key = versionKey(id, version);
  const existing = await bucket.get(key);
  if (existing && (await existing.text()) !== raw.trim())
    return reply(409, {error:"VERSION_ALREADY_EXISTS"});
  const latest = await bucket.get(pointerKey(id));
  const latestTag = latest?.etag;
  let lastVersion = 0;
  if (latest) {
    try {lastVersion = Number(JSON.parse(await latest.text()).version);}
    catch {return reply(503, {error:"INDEX_CORRUPTION"});}
  }
  if (Number(version) < lastVersion) return reply(409,{error:"STALE_VERSION",currentVersion:lastVersion});
  if (Number(version) === lastVersion) {
    if (existing) return reply(200,{status:"ALREADY_PRESENT",mapId:id,version:Number(version),sha256:Engine.hash(raw.trim())});
    return reply(409,{error:"INDEX_VERSION_CONFLICT"});
  }
  if (!existing) {
    const created = await bucket.put(key,raw.trim(),{
      onlyIf:{etagDoesNotMatch:"*"},
      httpMetadata:{contentType:"application/json"}
    });
    if (!created) return reply(409,{error:"VERSION_WRITE_CONFLICT"});
  }
  const pointer = JSON.stringify({mapId:id,version:Number(version)});
  const updated = await bucket.put(pointerKey(id), pointer,{
    onlyIf: latestTag ? {etagMatches:latestTag} : {etagDoesNotMatch:"*"},
    httpMetadata:{contentType:"application/json"}
  });
  if (!updated) return reply(409,{error:"LATEST_POINTER_CONFLICT",retrySafe:true});
  return reply(201,{status:"STORED",mapId:id,version:Number(version),
    sha256:Engine.hash(raw.trim()),checksum:JSON.parse(raw.trim()).checksum});
}

/** Private package exchange only; unauthenticated clients cannot discover map IDs. */
export default {
  async fetch(request, env) {
    if (!env?.PACKAGES || !env?.GO_WRITE_TOKEN || !env?.ANDROID_READ_TOKEN ||
        env.GO_WRITE_TOKEN === env.ANDROID_READ_TOKEN) return notConfigured();
    const url = new URL(request.url);
    if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1")
      return reply(400,{error:"HTTPS_REQUIRED"});
    if (request.method === "GET" && url.pathname === "/health")
      return reply(200,{service:"GOVIEW_PACKAGE_BRIDGE",status:"READY",storage:"R2",version:1});
    const pieces = url.pathname.split("/").filter(Boolean);
    if (pieces.length < 4 || pieces[0] !== "v1" || pieces[1] !== "maps" ||
        !validMapId(pieces[2]) || pieces[3] !== "packages")
      return reply(404,{error:"NOT_FOUND"});
    const id=pieces[2];
    if(request.method === "GET" && pieces.length === 5 &&
        (pieces[4] === "latest" || validVersion(pieces[4]))) {
      if(!allowed(request,env.ANDROID_READ_TOKEN) && !allowed(request,env.GO_WRITE_TOKEN))
        return reply(401,{error:"UNAUTHORIZED"});
      try { return await fetchMap(env.PACKAGES,id,pieces[4]); }
      catch { return reply(503,{error:"STORAGE_UNAVAILABLE"}); }
    }
    if(request.method === "PUT" && pieces.length === 5 && validVersion(pieces[4])) {
      if(!allowed(request,env.GO_WRITE_TOKEN)) return reply(401,{error:"UNAUTHORIZED"});
      if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json"))
        return reply(415,{error:"JSON_ONLY"});
      try{return await saveMap(env.PACKAGES,id,pieces[4],request);}
      catch{return reply(503,{error:"STORAGE_UNAVAILABLE"});}
    }
    return reply(405,{error:"METHOD_NOT_ALLOWED"});
  }
};
