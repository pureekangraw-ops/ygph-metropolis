"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");

test("PRISM native bridge exposes versioned Browser evidence for readback",()=>{
  const source=fs.readFileSync(path.join(__dirname,"..","android-shell","native-prism-browser","PrismBrowserPlugin.java"),"utf8");
  for(const token of [
    'out.put("schemaVersion"',
    'out.put("source"',
    'out.put("event"',
    'out.put("url"',
    'out.put("capturedAt"',
    'out.put("activeTab"',
    'out.put("latestEnvelope"',
    'out.put("verified"'
  ]) assert.ok(source.includes(token),"missing native readback field: "+token);
});
