"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");

test("PRISM browser records a portable evidence envelope for GO readback",()=>{
  const source=fs.readFileSync(path.join(__dirname,"..","android-shell","native-prism-browser","PrismBrowserActivity.java"),"utf8");
  for(const token of [
    'prism-browser-evidence-v1',
    'envelope.put("source","PRISM_BROWSER")',
    'envelope.put("event",event)',
    'envelope.put("url",location==null?"":location)',
    'envelope.put("capturedAt",capturedAt)',
    'putString("latestEnvelope",envelope.toString())'
  ]) assert.ok(source.includes(token), "missing evidence contract token: "+token);
});
