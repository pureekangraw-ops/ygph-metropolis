"use strict";
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('LIGHTHOUSE production source has exactly CHAT MANUAL GO SETTINGS roots',()=>{
  const html=read('lighthouse-next/index.html');
  const nav=html.match(/<nav id="bottom-nav"[\s\S]*?<\/nav>/)?.[0]||'';
  assert.equal((nav.match(/data-root-target=/g)||[]).length,4);
  for(const rootName of ['chat','manual','go','settings']) assert.match(nav,new RegExp('data-root-target=["\\\']'+rootName+'["\\\']'));
  for(const stale of ['home','store','ride','finance']) assert.doesNotMatch(nav,new RegExp('data-root-target=["\\\']'+stale+'["\\\']'));
});

test('production manifest names LIGHTHOUSE Next shell truth',()=>{
  const manifest=JSON.parse(read('RELEASE_MANIFEST.json'));
  assert.deepEqual(manifest.surfaces.roots,['CHAT','MANUAL','GO','SETTINGS']);
  assert.equal(manifest.authority.webEntrypoint,'lighthouse-next/index.html');
  assert.equal(manifest.authority.androidBuilder,'android-shell/tools/stage-lighthouse-next.mjs');
  assert.equal(manifest.authority.rule,'WEB_AND_ANDROID_MUST_USE_SAME_STAGED_BUNDLE');
});

test('canonical production bundle root routes only to LIGHTHOUSE Next',async()=>{
  const {mkdtemp,readFile,rm}=require('node:fs/promises');
  const mod=await import(path.join(root,'scripts/stage-lighthouse-next-bundle.mjs'));
  const dest=await mkdtemp(path.join(os.tmpdir(),'lh-shell-'));
  try{
    await mod.stageLighthouseBundle({repoRoot:root,destinationRoot:dest});
    const entry=await readFile(path.join(dest,'index.html'),'utf8');
    assert.match(entry,/lighthouse-next\/index\.html/);
    assert.match(entry,/<title>LIGHTHOUSE<\/title>/);
    assert.doesNotMatch(entry,/YGPH METROPOLIS|HOME|STORE|RIDE|FINANCE|MASTER INPUT/);
  }finally{await rm(dest,{recursive:true,force:true});}
});
