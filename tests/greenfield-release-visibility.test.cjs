"use strict";
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');

const root=path.resolve(__dirname,'..');
const source=file=>fs.readFileSync(path.join(root,file),'utf8');

test('Cloudflare security headers remain deployment-owned and frame-protected',()=>{
  const headers=source('_headers');
  assert.match(headers,/Content-Security-Policy:/);
  assert.match(headers,/frame-ancestors 'none'/);
  assert.match(headers,/X-Content-Type-Options: nosniff/);
  assert.match(headers,/Referrer-Policy: no-referrer/);
});

test('visible release authority is generated from Android identity into the canonical bundle',async()=>{
  const {mkdtemp,readFile,rm}=require('node:fs/promises');
  const mod=await import(path.join(root,'scripts/stage-lighthouse-next-bundle.mjs'));
  const dest=await mkdtemp(path.join(os.tmpdir(),'lh-release-'));
  try{
    await mod.stageLighthouseBundle({repoRoot:root,destinationRoot:dest});
    const runtimeManifest=JSON.parse(await readFile(path.join(dest,'release-manifest.json'),'utf8'));
    const identity=JSON.parse(await readFile(path.join(dest,'lighthouse-next','build-identity.json'),'utf8'));
    const version=JSON.parse(await readFile(path.join(root,'android-shell','version.json'),'utf8'));
    assert.equal(runtimeManifest.product,'LIGHTHOUSE');
    assert.equal(runtimeManifest.architecture,'LIGHTHOUSE_NEXT');
    assert.equal(runtimeManifest.versionName,version.versionName);
    assert.equal(runtimeManifest.versionCode,version.versionCode);
    assert.equal(identity.versionName,version.versionName);
    assert.equal(identity.versionCode,version.versionCode);
    assert.equal(runtimeManifest.authority,'scripts/stage-lighthouse-next-bundle.mjs');
  }finally{await rm(dest,{recursive:true,force:true});}
});

test('LIGHTHOUSE web runtime registers the generated root service worker only on web protocols',()=>{
  const app=source('lighthouse-next/app.mjs');
  assert.match(app,/navigator\.serviceWorker\.register\('\/sw\.js'/);
  assert.match(app,/\^https\?:\$/);
});

test('legacy release-status module is not production authority',()=>{
  const manifest=JSON.parse(source('RELEASE_MANIFEST.json'));
  assert.equal(manifest.legacy.shellAuthority,'ROLLBACK_ONLY_NOT_DEPLOYED');
  assert.equal(manifest.authority.webEntrypoint,'lighthouse-next/index.html');
  assert.notEqual(manifest.authority.webEntrypoint,'index.html');
});
