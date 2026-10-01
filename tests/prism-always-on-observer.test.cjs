"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const read=(name)=>fs.readFileSync(path.join(__dirname,"..",name),"utf8");

test("PRISM observer is a real Android foreground service with visible status",()=>{
  const service=read("android-shell/native-prism-browser/PrismObserverService.java");
  const patch=read("android-shell/tools/apply-prism-browser.mjs");
  assert.match(service,/extends Service/);
  assert.match(service,/startForeground\(42/);
  assert.match(service,/START_STICKY/);
  assert.match(service,/PRISM • Factory Eye/);
  assert.match(service,/LIVE|BACKGROUND|STALE|OFFLINE/);
  assert.match(patch,/FOREGROUND_SERVICE/);
  assert.match(patch,/foregroundServiceType=\\?\"dataSync/);
});

test("PRISM keeps live Gecko sessions across Activity stop and restores after process death",()=>{
  const activity=read("android-shell/native-prism-browser/PrismBrowserActivity.java");
  assert.match(activity,/private static final List<GeckoSession> tabs/);
  assert.match(activity,/startObserverService\(\)/);
  assert.match(activity,/markActivityBackground/);
  assert.match(activity,/hasLiveBrowserSessions/);
  assert.doesNotMatch(activity,/onDestroy\(\)\{persistSession\(\);for\(GeckoSession s:tabs\)s\.close/);
  assert.match(activity,/restoreSession\(\)/);
});

test("observer state is explicit and never substitutes stale data for evidence",()=>{
  const service=read("android-shell/native-prism-browser/PrismObserverService.java");
  const plugin=read("android-shell/native-prism-browser/PrismBrowserPlugin.java");
  for(const token of ["NO_FRESH_PRISM_EVIDENCE","NETWORK_UNAVAILABLE","SERVICE_STOPPED","capturesInputValues","observerState","observerUnknowns"]){
    assert.match(service+plugin,new RegExp(token));
  }
});

test("observer patch ships one service and the existing single Factory Eye",()=>{
  const patch=read("android-shell/tools/apply-prism-browser.mjs");
  assert.match(patch,/PrismObserverService\.java/);
  assert.match(patch,/FactoryEyeHost\.java/);
  assert.doesNotMatch(patch,/PrismObserverService\.java.*PrismObserverService\.java/);
});
