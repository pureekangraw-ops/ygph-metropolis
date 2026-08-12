"use strict";
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');

test('hard-cut root contains only Greenfield production entrypoints',()=>{
  const html=read('index.html');
  assert.match(html,/app\.mjs/);
  for(const forbidden of ['flow-era','metropolis-r5','metropolis-v4','metropolis-maintenance','metropolis-remaster','highway-gate','app.js','ridePage','>วิ่งงาน<']) assert.equal(html.includes(forbidden),false,forbidden);
  for(const legacy of ['app.js','flow-era.js','flow-era-3.5.js','metropolis-v4.js','metropolis-r5.js','metropolis-maintenance.js','metropolis-remaster.js','metropolis-command-gate.js','highway-gate.js','vault.js','core.js']) assert.equal(fs.existsSync(path.join(root,legacy)),false,legacy);
});

test('release manifest declares one Greenfield RC identity and no compatibility chain',()=>{
  const manifest=JSON.parse(read('RELEASE_MANIFEST.json'));
  assert.equal(manifest.product,'YGPH METROPOLIS');
  assert.equal(manifest.release,'5.0.0-greenfield-rc1');
  assert.equal(manifest.architecture,'GREENFIELD');
  assert.deepEqual(manifest.domains,['STORE','LEDGER','CALENDAR']);
  assert.equal(manifest.stateSchema,1);
  assert.equal(manifest.database.name,'ygph-metropolis-greenfield-secure');
  assert.equal(manifest.vault.format,'ygph-metropolis-greenfield-vault');
  assert.equal(manifest.cutoverEvidence.packageId,'FLOW-1786527289637');
  assert.equal(manifest.cutoverEvidence.sourceRevision,28);
  assert.equal('compatibility' in manifest,false);
});

test('root UI imports only Greenfield runtime facade and production service worker is legacy-free',()=>{
  const app=read('app.mjs');
  assert.match(app,/\.\/greenfield\/runtime\.mjs/);
  for(const forbidden of ['persistence.mjs','command-runtime.mjs','business-workflows.mjs','domain-operations.mjs','flow-era','stock-pocket-secure']) assert.equal(app.includes(forbidden),false,forbidden);
  const sw=read('sw.js');
  assert.match(sw,/5\.0\.0-greenfield-rc1/);
  for(const forbidden of ['flow-era','metropolis-r5','metropolis-v4','maintenance','remaster','stock-pocket-secure']) assert.equal(sw.includes(forbidden),false,forbidden);
});

test('publication allowlist exactly matches release production files',()=>{
  const manifest=JSON.parse(read('RELEASE_MANIFEST.json'));
  const ignore=read('.assetsignore').split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  const allowed=ignore.filter(line=>line.startsWith('!/')).map(line=>line.slice(2)).filter(line=>!line.endsWith('/**')&&!line.endsWith('/'));
  const expected=manifest.productionFiles.map(item=>item.path).sort();
  assert.deepEqual(allowed.sort(),expected);
  assert.ok(ignore.includes('!/greenfield/**'));
});

test('repository gate runs only Greenfield tests and Greenfield production syntax',()=>{
  const pkg=JSON.parse(read('package.json'));
  assert.equal(pkg.version,'5.0.0-greenfield-rc1');
  assert.match(pkg.scripts.test,/greenfield-\*\.test\.cjs/);
  for(const legacy of ['flow-era','metropolis-r5','metropolis-v4','metropolis-maintenance','metropolis-remaster','highway-gate','app.js']) assert.equal(pkg.scripts['check:syntax'].includes(legacy),false,legacy);
});
