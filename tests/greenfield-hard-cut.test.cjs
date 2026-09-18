"use strict";
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');

const root=path.resolve(__dirname,'..');
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');

test('release authority is LIGHTHOUSE Next and legacy METROPOLIS shell is rollback-only',()=>{
  const manifest=JSON.parse(read('RELEASE_MANIFEST.json'));
  assert.equal(manifest.product,'LIGHTHOUSE');
  assert.equal(manifest.architecture,'LIGHTHOUSE_NEXT');
  assert.equal(manifest.productionBranch,'main');
  assert.equal(manifest.authority.builder,'scripts/stage-lighthouse-next-bundle.mjs');
  assert.equal(manifest.authority.assetsDirectory,'.lighthouse-production');
  assert.deepEqual(manifest.surfaces.roots,['CHAT','MANUAL','SETTINGS']);
  assert.equal(manifest.legacy.shellAuthority,'ROLLBACK_ONLY_NOT_DEPLOYED');
  assert.equal(manifest.runtimeTruth.greenfield,'RUNTIME_DEPENDENCY_ONLY_NOT_UI_AUTHORITY');
});

test('Cloudflare production assets point only at the canonical staged bundle',()=>{
  const wrangler=read('wrangler.jsonc');
  assert.match(wrangler,/"directory"\s*:\s*"\.\/\.lighthouse-production"/);
  assert.doesNotMatch(wrangler,/"directory"\s*:\s*"\."/);
});

test('canonical bundle excludes legacy production UI while retaining required runtime truth',async()=>{
  const {mkdtemp,rm,stat}=require('node:fs/promises');
  const mod=await import(path.join(root,'scripts/stage-lighthouse-next-bundle.mjs'));
  const dest=await mkdtemp(path.join(os.tmpdir(),'lh-hard-cut-'));
  const exists=async rel=>{try{await stat(path.join(dest,rel));return true}catch{return false}};
  try{
    await mod.stageLighthouseBundle({repoRoot:root,destinationRoot:dest});
    for(const forbidden of [
      'ui/lighthouse-shell.mjs','ui/home-ui.mjs','ui/store-ui.mjs','ui/finance-ui.mjs','ui/ride-ui.mjs',
      'app.mjs','theme.css','compact-ui.css','lighthouse.css'
    ]) assert.equal(await exists(forbidden),false,forbidden);
    for(const required of [
      'lighthouse-next/index.html','lighthouse-next/app.mjs','lighthouse-next/control-port/control-port.mjs',
      'greenfield/runtime.mjs','greenfield/runtime-session.mjs','lighthouse/path-kernel.mjs',
      'client/index.html','client/assets/ui/go-client.mjs','release-manifest.json','sw.js'
    ]) assert.equal(await exists(required),true,required);
    const html=read('lighthouse-next/index.html');
    assert.doesNotMatch(html,/YGPH METROPOLIS|MASTER INPUT/);
  }finally{await rm(dest,{recursive:true,force:true});}
});

test('repository syntax gate covers the canonical builder and current LIGHTHOUSE runtime',()=>{
  const pkg=JSON.parse(read('package.json'));
  const command=String(pkg.scripts['check:syntax']||'');
  for(const required of [
    'scripts/stage-lighthouse-next-bundle.mjs',
    'worker/index.mjs',
    'lighthouse-next/app.mjs',
    'lighthouse-next/control-port/control-port.mjs',
    'lighthouse-next/control-port/control-port-runtime.mjs'
  ]) assert.equal(command.includes(required),true,required);
});
