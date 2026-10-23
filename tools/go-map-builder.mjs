#!/usr/bin/env node
/**
 * GO Map Package Builder.
 * Usage:
 *   node tools/go-map-builder.mjs --demo examples/go-drawn-demo.goview.json
 *   node tools/go-map-builder.mjs map-drawing.json output.goview.json
 *   node tools/go-map-builder.mjs --verify output.goview.json
 *
 * The drawing source is independent of any existing GOVIEW pin database.
 * Roads are schematic until checked against reliable field data.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
const require=createRequire(import.meta.url);
const G=require("../android-browser/app/src/main/assets/goview-studio/engine.js");

const args=process.argv.slice(2);
function usage(){console.error("Usage: node tools/go-map-builder.mjs [--demo OUTPUT | INPUT.json OUTPUT.goview.json | --verify PACKAGE]");process.exitCode=2;}
try{
  if(args.length===2&&args[0]==="--demo"){
    const map=G.demo(),text=G.pack(map);
    writeFileSync(args[1],text+"\n","utf8");
    console.log("GO demo package",args[1],"checksum",JSON.parse(text).checksum);
  }else if(args.length===2&&args[0]==="--verify"){
    const map=G.unpack(readFileSync(args[1],"utf8").trim());
    console.log(JSON.stringify({verified:true,mapId:map.mapId,version:map.version,nodes:map.nodes.length,roads:map.roads.length}));
  }else if(args.length===2){
    const map=G.normalize(JSON.parse(readFileSync(args[0],"utf8")));
    const text=G.pack(map);
    writeFileSync(args[1],text+"\n","utf8");
    console.log("GO map package",args[1],"checksum",JSON.parse(text).checksum);
  }else usage();
}catch(error){console.error("Package rejected:",error.message);process.exitCode=1;}
