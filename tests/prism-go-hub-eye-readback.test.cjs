"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const read=p=>fs.readFileSync(path.join(__dirname,"..",p),"utf8");

test("PRISM Browser has no embedded Factory Eye to Hub producer lane",()=>{
  const tool=read("android-shell/tools/apply-prism-browser.mjs");
  const activity=read("android-shell/native-prism-browser/PrismBrowserActivity.java");
  assert.doesNotMatch(tool,/FactoryEyeHost|assets.*factory-eye/);
  assert.doesNotMatch(activity,/FactoryEyeHost|hub\/api\/factory-eye/);
  assert.equal(fs.existsSync(path.join(__dirname,"..","android-shell","native-prism-browser","factory-eye")),false);
});

test("PRISM home renders its local Browser eye independently",()=>{
  const html=read("prism/index.html");
  const app=read("prism/app.mjs");
  assert.match(html,/id="browser-eye-state"/);
  assert.match(html,/id="browser-eye-detail"/);
  assert.match(app,/function renderBrowserEye\(evidence\)/);
  assert.match(app,/observerHeartbeatAt/);
  assert.match(app,/sessionActiveUrl\|\|evidence\?\.url/);
  assert.match(app,/ตาทั่วไป/);
  assert.doesNotMatch(app,/GO Hub Eye/);
});

test("PRISM local Browser eye refreshes independently of Hub events",()=>{
  const app=read("prism/app.mjs");
  assert.match(app,/const BROWSER_EYE_REFRESH_MS=5000/);
  assert.match(app,/async function refreshBrowserEye\(\)/);
  assert.match(app,/setInterval\(\(\)=>void refreshBrowserEye\(\),BROWSER_EYE_REFRESH_MS\)/);
  assert.doesNotMatch(app,/setInterval\([^\n]*loadSnapshot/);
});
