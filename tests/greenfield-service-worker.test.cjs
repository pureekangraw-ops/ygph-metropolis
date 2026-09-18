"use strict";
const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const os=require('node:os');

const root=path.resolve(__dirname,'..');

async function staged(){
  const {mkdtemp,readFile,rm}=require('node:fs/promises');
  const mod=await import(path.join(root,'scripts/stage-lighthouse-next-bundle.mjs'));
  const dest=await mkdtemp(path.join(os.tmpdir(),'lh-sw-'));
  await mod.stageLighthouseBundle({repoRoot:root,destinationRoot:dest});
  return {
    sw:await readFile(path.join(dest,'sw.js'),'utf8'),
    manifest:JSON.parse(await readFile(path.join(dest,'release-manifest.json'),'utf8')),
    cleanup:()=>rm(dest,{recursive:true,force:true})
  };
}

test('generated service worker is LIGHTHOUSE-owned and deletes legacy METROPOLIS caches',async()=>{
  const x=await staged();
  try{
    assert.match(x.sw,/lighthouse-/);
    assert.match(x.sw,/key\.startsWith\('ygph-metropolis-'\)/);
    assert.doesNotMatch(x.sw,/ui\/lighthouse-shell\.mjs|ui\/home-ui\.mjs/);
  }finally{await x.cleanup();}
});

test('generated service worker uses network-first navigation and code',async()=>{
  const x=await staged();
  try{
    assert.match(x.sw,/request\.mode==='navigate'/);
    assert.match(x.sw,/networkFirst\(event\.request,'\.\/index\.html'\)/);
    assert.match(x.sw,/request\.destination==='script'\|\|event\.request\.destination==='style'/);
    assert.match(x.sw,/fetch\(request,\{cache:'no-store'\}\)/);
  }finally{await x.cleanup();}
});

test('generated offline shell follows runtime manifest plus generated release manifest',async()=>{
  const x=await staged();
  try{
    const match=/const SHELL=(\[[^;]+\]);/.exec(x.sw);
    assert.ok(match,'SHELL must be static');
    const shell=Function('"use strict";return ('+match[1]+');')().map(v=>v.replace(/^\.\//,'')).sort();
    const expected=[...x.manifest.applicationFiles,'release-manifest.json'].sort();
    assert.deepEqual(shell,expected);
  }finally{await x.cleanup();}
});

test('runtime manifest is sourced from one builder and carries one asset revision',async()=>{
  const x=await staged();
  try{
    assert.equal(x.manifest.product,'LIGHTHOUSE');
    assert.equal(x.manifest.authority,'scripts/stage-lighthouse-next-bundle.mjs');
    assert.match(x.manifest.assetRevision,/^sha256-[a-f0-9]{16}$/);
    assert.equal(x.sw.includes(x.manifest.assetRevision),true);
  }finally{await x.cleanup();}
});
