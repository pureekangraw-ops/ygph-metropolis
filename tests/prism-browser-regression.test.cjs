"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");

const read=(name)=>fs.readFileSync(path.join(__dirname,"..",name),"utf8");

test("PRISM browser applies Android safe-area insets without overlaying the page",()=>{
  const java=read("android-shell/native-prism-browser/PrismBrowserActivity.java");
  const xml=read("android-shell/native-prism-browser/activity_prism_browser.xml");
  assert.match(java,/setOnApplyWindowInsetsListener/);
  assert.match(java,/getSystemWindowInsetTop/);
  assert.match(java,/getSystemWindowInsetBottom/);
  assert.match(java,/setPadding\(0,top,0,bottom\)/);
  assert.match(xml,/@\+id\/prism_browser_root/);
  assert.match(xml,/@\+id\/prism_gecko/);
});

test("PRISM browser persists ordered tabs and restores the active tab",()=>{
  const java=read("android-shell/native-prism-browser/PrismBrowserActivity.java");
  for(const token of [
    'SESSION_PREFS="prism_browser_session"',
    'SESSION_SCHEMA="prism-browser-session-v1"',
    'restoreSession()',
    'sessionEnvelope',
    'savedTabs',
    'envelope.optInt("activeTab",0)',
    'persistSession()',
    'onStop()',
    'putString("activeUrl",currentUrl())',
    '.commit()'
  ]) assert.ok(java.includes(token),"missing session persistence token: "+token);
  assert.match(java,/active=Math\.max\(0,Math\.min\(savedActive,tabs\.size\(\)-1\)\)/);
});

test("PRISM browser keeps active-tab evidence tied to the real URL after watch restore",()=>{
  const java=read("android-shell/native-prism-browser/PrismBrowserActivity.java");
  assert.match(java,/int selected=active/);
  assert.match(java,/active=Math\.max\(0,Math\.min\(selected,tabs\.size\(\)-1\)\)/);
  assert.match(java,/recordEvidence\("WATCH",currentUrl\(\)\)/);
  assert.match(java,/envelope.put\("activeTab",active\)/);
  assert.match(java,/envelope.put\("tabCount",tabs.size\(\)\)/);
});

test("PRISM browser keeps controls compact while preserving touch targets",()=>{
  const xml=read("android-shell/native-prism-browser/activity_prism_browser.xml");
  for(const id of ["prism_back","prism_forward","prism_reload","prism_watch","prism_new_tab","prism_close_tab","prism_eye_status","prism_tab_strip"]){
    assert.match(xml,new RegExp("@\+id/"+id));
  }
  assert.match(xml,/android:minWidth="44dp"/);
  assert.match(xml,/android:layout_height="44dp"/);
  assert.doesNotMatch(xml,/android:layout_height="56dp"/);
});

test("native readback exposes restored session state",()=>{
  const plugin=read("android-shell/native-prism-browser/PrismBrowserPlugin.java");
  for(const token of ["sessionSchemaVersion","sessionEnvelope","sessionActiveTab","sessionActiveUrl","tabCount"]){
    assert.match(plugin,new RegExp(token));
  }
});

test("PRISM browser launch declares the Android 14 data-sync foreground permission",()=>{
  const tool=read("android-shell/tools/apply-prism-browser.mjs");
  const java=read("android-shell/native-prism-browser/PrismBrowserActivity.java");
  assert.match(tool,/FOREGROUND_SERVICE_DATA_SYNC/);
  assert.ok(tool.includes('foregroundServiceType=\\"dataSync\\"'));
  assert.match(java,/GeckoRuntime\.create\(getApplicationContext\(\)\)/);
});
