"use strict";
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');

test('hard-cut root contains only Greenfield production entrypoints while allowing Greenfield-native Ride UI',()=>{
  const html=read('index.html');
  assert.match(html,/app\.mjs/);
  assert.match(html,/data-money-view="ride"/);
  for(const forbidden of ['flow-era','metropolis-r5','metropolis-v4','metropolis-maintenance','metropolis-remaster','highway-gate','app.js','ridePage','stock-pocket-secure']) assert.equal(html.includes(forbidden),false,forbidden);
  for(const legacy of ['app.js','flow-era.js','flow-era-3.5.js','metropolis-v4.js','metropolis-r5.js','metropolis-maintenance.js','metropolis-remaster.js','metropolis-command-gate.js','highway-gate.js','vault.js','core.js']) assert.equal(fs.existsSync(path.join(root,legacy)),false,legacy);
});

test('release manifest declares functional Greenfield schema 2 while cutover Evidence still excludes Ride',()=>{
  const manifest=JSON.parse(read('RELEASE_MANIFEST.json'));
  assert.equal(manifest.product,'YGPH METROPOLIS');
  assert.equal(manifest.release,'5.1.0-functional-rc1');
  assert.equal(manifest.architecture,'GREENFIELD');
  assert.deepEqual(manifest.domains,['STORE','LEDGER','CALENDAR','RIDE']);
  assert.equal(manifest.stateSchema,2);
  assert.deepEqual(manifest.schemaMigration,{from:1,to:2,policy:'ADD_EMPTY_RIDE_DOMAIN_PRESERVE_EXISTING_TRUTH'});
  assert.equal(manifest.database.name,'ygph-metropolis-greenfield-secure');
  assert.equal(manifest.vault.format,'ygph-metropolis-greenfield-vault');
  assert.equal(manifest.cutoverEvidence.packageId,'FLOW-1786527289637');
  assert.equal(manifest.cutoverEvidence.sourceRevision,28);
  assert.equal(manifest.cutoverEvidence.ridePolicy,'EXCLUDE');
  assert.equal(manifest.ride.policy,'LIVE_SCHEMA2_ONLY');
  assert.equal(manifest.ride.cashOwner,'LEDGER');
  assert.equal('compatibility' in manifest,false);
});

test('root UI imports only Greenfield runtime facade and production service worker is legacy-free',()=>{
  const app=read('app.mjs');
  assert.match(app,/\.\/greenfield\/runtime\.mjs/);
  for(const forbidden of ['persistence.mjs','device-unlock.mjs','command-runtime.mjs','business-workflows.mjs','domain-operations.mjs','flow-era','stock-pocket-secure']) assert.equal(app.includes(forbidden),false,forbidden);
  const runtime=read('greenfield/runtime.mjs');
  assert.match(runtime,/\.\/device-unlock\.mjs/);
  const sw=read('sw.js');
  assert.match(sw,/5\.1\.0-functional-rc1/);
  assert.match(sw,/greenfield\/ride-domain\.mjs/);
  assert.match(sw,/greenfield\/ride-workflows\.mjs/);
  assert.match(sw,/greenfield\/device-unlock\.mjs/);
  for(const forbidden of ['flow-era','metropolis-r5','metropolis-v4','maintenance','remaster','stock-pocket-secure']) assert.equal(sw.includes(forbidden),false,forbidden);
});

test('publication allowlist exactly matches release production files including device unlock',()=>{
  const manifest=JSON.parse(read('RELEASE_MANIFEST.json'));
  const ignore=read('.assetsignore').split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  const allowed=ignore.filter(line=>line.startsWith('!/')).map(line=>line.slice(2)).filter(line=>!line.endsWith('/**')&&!line.endsWith('/'));
  const expected=manifest.productionFiles.map(item=>item.path).sort();
  assert.deepEqual(allowed.sort(),expected);
  assert.ok(ignore.includes('!/greenfield/**'));
  assert.ok(ignore.includes('!/ui/**'));
  assert.ok(ignore.includes('!/greenfield/device-unlock.mjs'));
  assert.ok(manifest.productionFiles.some(item=>item.path==='greenfield/device-unlock.mjs'));
});

test('repository gate runs only Greenfield tests and checks every new functional production module syntax',()=>{
  const pkg=JSON.parse(read('package.json'));
  assert.equal(pkg.version,'5.1.0-functional-rc1');
  assert.match(pkg.scripts.test,/greenfield-\*\.test\.cjs/);
  for(const required of ['ui/product-model.mjs','ui/icons.mjs','greenfield/ride-domain.mjs','greenfield/ride-workflows.mjs','greenfield/device-unlock.mjs']) assert.equal(pkg.scripts['check:syntax'].includes(required),true,required);
  for(const legacy of ['flow-era','metropolis-r5','metropolis-v4','metropolis-maintenance','metropolis-remaster','highway-gate','app.js']) assert.equal(pkg.scripts['check:syntax'].includes(legacy),false,legacy);
});
