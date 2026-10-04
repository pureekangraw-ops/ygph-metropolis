const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
test('native page capture sends real visible summary through native messaging, never via a Firefox background producer',async()=>{
  const manifest=JSON.parse(fs.readFileSync(path.join(root,'android-shell/native-prism-browser/prism-observer/manifest.json'),'utf8'));
  assert.equal(manifest.background,undefined);assert.ok(manifest.permissions.includes('nativeMessagingFromContent'));
  const timers=[],sent=[];
  const document={title:'Actual title',visibilityState:'visible',readyState:'complete',documentElement:{lang:'en'},hasFocus:()=>true,querySelector:()=>null,querySelectorAll:()=>[],addEventListener:()=>{}};
  const context={document,URL,location:{href:'https://example.org/?token=secret#private',protocol:'https:',origin:'https://example.org',pathname:'/'},Element:class{},CSS:{escape:v=>v},getComputedStyle:()=>({}),browser:{runtime:{onMessage:{addListener:()=>{}},sendNativeMessage:async(name,payload)=>{sent.push({name,payload});}}},window:{addEventListener:()=>{}},setInterval:fn=>timers.push(fn),setTimeout:fn=>timers.push(fn)};
  vm.runInNewContext(fs.readFileSync(path.join(root,'android-shell/native-prism-browser/prism-observer/content-observer.js'),'utf8'),context);
  for(const fn of timers)fn();await new Promise(resolve=>setImmediate(resolve));
  assert.ok(sent.length>0);assert.equal(sent[0].name,'prism_observer');assert.equal(sent[0].payload.page.title,'Actual title');assert.equal(sent[0].payload.page.url,'https://example.org/');assert.equal(sent[0].payload.page.capturesInputValues,false);
  const before=sent.length;document.visibilityState='hidden';for(const fn of timers)fn();await new Promise(resolve=>setImmediate(resolve));assert.equal(sent.length,before);
});
test('direct observer status does not confuse local heartbeat with published page evidence',async()=>{
  const {observerReadiness}=await import('../prism/observer.mjs');const now=Date.now();
  assert.equal(observerReadiness({observerState:'LIVE',observerHeartbeatAt:now},now).state,'LOCAL_ONLY');
  assert.equal(observerReadiness({pageObserverState:'PUBLISHED',pagePublishedAt:now,pageCapturedAt:now,pageObserverExpiresAt:now+1000},now).state,'LIVE');
  assert.equal(observerReadiness({pageObserverState:'PUBLISHED',pagePublishedAt:now,pageCapturedAt:now-60000,pageObserverExpiresAt:now+1000},now).state,'STALE');
});
test('native capture wiring scopes credentials and validates the current top-level session',()=>{
  const native=fs.readFileSync(path.join(root,'android-shell/native-prism-browser/PrismPageObserver.java'),'utf8');
  for(const guard of ['sender.isTopLevel','sender.session','isObserverForeground','sessionToken','/api/prism-eye/observe','captured<=captureNotBefore','observerNavigationPending()'])assert.ok(native.includes(guard),guard);
  const credentials=fs.readFileSync(path.join(root,'android-shell/native-prism-browser/PrismObserverCredentials.java'),'utf8');
  assert.match(credentials,/AndroidKeyStore/);assert.match(credentials,/AES\/GCM\/NoPadding/);
  const patch=fs.readFileSync(path.join(root,'android-shell/tools/apply-prism-browser.mjs'),'utf8');assert.ok(patch.includes('PrismPageObserver.java'));assert.ok(patch.includes('prism-observer'));
});
