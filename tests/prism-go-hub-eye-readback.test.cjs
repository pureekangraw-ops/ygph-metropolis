"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const read=p=>fs.readFileSync(path.join(__dirname,"..",p),"utf8");

test("PRISM Browser keeps Factory Eye pointed at GO Hub read-only observation seam",()=>{
  const bg=read("android-shell/native-prism-browser/factory-eye/background.js");
  assert.match(bg,/const HUB_ORIGIN = 'https:\/\/go-hub\.pureekangraw\.workers\.dev'/);
  assert.match(bg,/const API_ROOT = '\/hub\/api\/factory-eye'/);
  assert.match(bg,/navigate: false/);
  assert.match(bg,/click: false/);
  assert.match(bg,/type: false/);
  assert.match(bg,/scroll: false/);
});

test("PRISM home renders native Browser evidence as GO Hub Eye state",()=>{
  const html=read("prism/index.html");
  const app=read("prism/app.mjs");
  assert.match(html,/id="factory-eye-state"/);
  assert.match(html,/id="factory-eye-detail"/);
  assert.match(app,/function renderBrowserEye\(evidence\)/);
  assert.match(app,/observerHeartbeatAt/);
  assert.match(app,/sessionActiveUrl\|\|evidence\?\.url/);
  assert.match(app,/renderBrowserEye\(browserEvidence\)/);
});
