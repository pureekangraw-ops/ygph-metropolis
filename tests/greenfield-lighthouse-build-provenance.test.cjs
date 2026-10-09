"use strict";
const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const os=require('node:os');
const { execFileSync }=require('node:child_process');
const { mkdtemp, readFile, rm }=require('node:fs/promises');

const root=path.resolve(__dirname,'..');

test('staged build identity follows checked-out HEAD instead of stale workflow GITHUB_SHA',async()=>{
  const previousSha=process.env.GITHUB_SHA;
  const previousSource=process.env.LIGHTHOUSE_SOURCE_COMMIT;
  const dest=await mkdtemp(path.join(os.tmpdir(),'lh-provenance-'));
  try{
    process.env.GITHUB_SHA='0000000000000000000000000000000000000000';
    delete process.env.LIGHTHOUSE_SOURCE_COMMIT;
    const expected=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
    const { stageLighthouseBundle }=await import(path.join(root,'scripts/stage-lighthouse-next-bundle.mjs'));
    await stageLighthouseBundle({repoRoot:root,destinationRoot:dest});
    const identity=JSON.parse(await readFile(path.join(dest,'lighthouse-next','build-identity.json'),'utf8'));
    assert.equal(identity.sourceCommit,expected);
    assert.notEqual(identity.sourceCommit,process.env.GITHUB_SHA);
  }finally{
    if(previousSha===undefined) delete process.env.GITHUB_SHA; else process.env.GITHUB_SHA=previousSha;
    if(previousSource===undefined) delete process.env.LIGHTHOUSE_SOURCE_COMMIT; else process.env.LIGHTHOUSE_SOURCE_COMMIT=previousSource;
    await rm(dest,{recursive:true,force:true});
  }
});
