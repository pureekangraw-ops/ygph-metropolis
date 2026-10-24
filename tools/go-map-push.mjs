#!/usr/bin/env node
/**
 * GO -> Cloudflare R2 -> GOVIEW durable map transfer.
 *
 * GOVIEW_BRIDGE_URL=https://goview-package-bridge.<account>.workers.dev
 * GOVIEW_GO_TOKEN=<secret, never put in shell history or source code>
 * node tools/go-map-push.mjs examples/go-drawn-demo.goview.json
 *
 * Requires a deployed, owner-configured Worker + R2 bucket.
 * A successful upload does NOT approve Android Update: handset still previews the diff.
 */
import { readFileSync } from "node:fs";
import Engine from "../android-browser/app/src/main/assets/goview-studio/engine.js";

function required(name) {
  const value=process.env[name];
  if (!value) throw Error("Missing "+name+" (configure in secure environment; never commit credentials)");
  return value;
}
async function main() {
  const input=process.argv[2];
  if (!input || process.argv.length!==3) throw Error("Usage: node tools/go-map-push.mjs PACKAGE.goview.json");
  const base=new URL(required("GOVIEW_BRIDGE_URL"));
  if (base.protocol!=="https:" || base.username || base.password || base.search ||
      base.hash || (base.pathname!=="/" && base.pathname!=="")) {
    throw Error("GOVIEW_BRIDGE_URL must be an HTTPS Worker origin without a path or credentials");
  }
  const token=required("GOVIEW_GO_TOKEN");
  if (token.length<20) throw Error("GO write token is too short");
  const bytes=readFileSync(input,"utf8").trim();
  const map=Engine.unpack(bytes);
  const target=new URL("/v1/maps/"+map.mapId+"/packages/"+map.version,base);
  const header={authorization:"Bearer "+token,"content-type":"application/json"};
  const uploaded=await fetch(target,{method:"PUT",headers:header,body:bytes,
    redirect:"manual",signal:AbortSignal.timeout(30000)});
  if (!uploaded.ok) {
    const failure=(await uploaded.text()).slice(0,400);
    throw Error("GO package upload HTTP "+uploaded.status+": "+failure);
  }
  const put=await uploaded.json();
  if (put.sha256!==Engine.hash(bytes)) throw Error("Upload receipt hash did not match source bytes");
  const read=await fetch(new URL("/v1/maps/"+map.mapId+"/packages/"+map.version,base),{
    headers:{authorization:"Bearer "+token},redirect:"manual",signal:AbortSignal.timeout(30000)
  });
  if (!read.ok) throw Error("GO package readback HTTP "+read.status);
  const text=await read.text();
  if (Engine.hash(text)!==Engine.hash(bytes) || Engine.unpack(text).mapId!==map.mapId)
    throw Error("Remote map differs from the locally generated package");
  console.log(JSON.stringify({status:"UPLOADED_AND_READBACK_VERIFIED",mapId:map.mapId,
    version:map.version,sha256:Engine.hash(bytes),endpoint:base.origin},null,2));
}
main().catch(error=>{console.error("GO Map Push failed:",error.message);process.exitCode=1;});
