const test=require('node:test'),assert=require('node:assert/strict');
function database(){
  const stores=new Map();
  const db={objectStoreNames:{contains:n=>stores.has(n)},createObjectStore(n){stores.set(n,new Map());},close(){},transaction(n){
    const map=stores.get(n);let pending=0,aborted=false;
    const tx={objectStore(){return {get(k){const r={};queueMicrotask(()=>{if(aborted)return;r.result=structuredClone(map.get(k)??null);r.onsuccess?.();});return r;},put(v,k){const r={};pending++;queueMicrotask(()=>{if(aborted)return;map.set(k,structuredClone(v));r.onsuccess?.();if(--pending===0)queueMicrotask(()=>tx.oncomplete?.());});return r;}};},abort(){aborted=true;queueMicrotask(()=>tx.onabort?.());}};return tx;
  }};
  return {stores,indexedDBImpl:{open(){const r={};queueMicrotask(()=>{r.result=db;if(!stores.has('vault'))r.onupgradeneeded?.();r.onsuccess?.();});return r;}}};
}
test('PRISM financial writes survive close and password reopen through the encrypted owner store',async()=>{
  const {createPrismProductRuntime}=await import('../prism/product-runtime.mjs');
  const db=database(),options={indexedDBImpl:db.indexedDBImpl,lockManager:null,now:()=> '2026-10-03T03:00:00.000Z'};
  const a=createPrismProductRuntime(options);
  await assert.rejects(a.readLedger(),/LEDGER_LOCKED/);
  await a.initializeLedger({recoveryCode:'owner-keeps-this-recovery-code',password:'owner-password'});
  await a.recordMoney({id:'PRISM-IN-1',direction:'IN',title:'รับเงิน',amountBaht:'150.50'});
  await a.recordMoney({id:'PRISM-OUT-1',direction:'OUT',title:'ค่าเดินทาง',amountBaht:'20.25'});
  await a.recordMoney({id:'PRISM-IN-1',direction:'IN',title:'รับเงิน',amountBaht:'150.50'});
  assert.equal((await a.readLedger()).balanceSatang,13025);
  a.lockLedger();
  const b=createPrismProductRuntime(options);
  await assert.rejects(b.unlockLedger('wrong-password'));
  await b.unlockLedger('owner-password');
  const truth=await b.readLedger();assert.equal(truth.transactions.length,2);assert.equal(truth.balanceSatang,13025);
  assert.equal(truth.todayInSatang,15050);assert.equal(truth.todayOutSatang,2025);
  const backup=await b.exportLedgerBackup();assert.equal(backup.recoveryKey,undefined);
  const {verifyGreenfieldBackup}=await import('../greenfield/backup.mjs');
  assert.equal((await verifyGreenfieldBackup({backup,passphrase:'owner-keeps-this-recovery-code'})).state.revision,truth.revision);
  const other=database(),restored=createPrismProductRuntime({...options,indexedDBImpl:other.indexedDBImpl});
  await restored.restoreLedgerBackup({backup,recoveryCode:'owner-keeps-this-recovery-code',password:'restored-password'});
  assert.equal((await restored.readLedger()).balanceSatang,13025);
  await assert.rejects(restored.restoreLedgerBackup({backup,recoveryCode:'owner-keeps-this-recovery-code',password:'restored-password'}),/RESTORE_CONFIRM_REQUIRED/);
  assert.equal((await restored.readLedger()).balanceSatang,13025);restored.lockLedger();
  assert.equal(JSON.stringify([...db.stores.get('vault').values()]).includes('ค่าเดินทาง'),false);
  await assert.rejects(b.initializeLedger({recoveryCode:'different-recovery-code',password:'another-password'}),/ALREADY_ENROLLED/);
  await b.recoverLedger({recoveryCode:'owner-keeps-this-recovery-code',password:'new-owner-password'});
  assert.equal((await b.readLedger()).balanceSatang,13025);
  b.lockLedger();
});
test('staged PRISM includes executable financial dependency closure without the previous app UI',async()=>{
  const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
  const destination=await fs.mkdtemp(path.join(os.tmpdir(),'prism-product-stage-'));
  try{
    const {stagePrismNative}=await import('../scripts/stage-prism-native.mjs');await stagePrismNative({repoRoot:path.resolve(__dirname,'..'),destinationRoot:destination});
    const {createPrismProductRuntime}=await import(require('node:url').pathToFileURL(path.join(destination,'prism/product-runtime.mjs')));
    const runtime=createPrismProductRuntime({capacitor:null});assert.equal((await runtime.mapStatus()).available,false);
    await assert.rejects(runtime.readLedger(),/LEDGER_LOCKED/);
    for(const file of ['greenfield/persistence.mjs','greenfield/runtime.mjs','lighthouse-next/runtime-ledger.mjs'])assert.equal(await fs.readFile(path.join(destination,'prism/engine',file),'utf8'),await fs.readFile(path.join(__dirname,'..',file),'utf8'));
    for(const file of ['prism/engine/lighthouse-next/app.mjs','prism/engine/ui','prism/engine/lighthouse-next/index.html'])await assert.rejects(fs.stat(path.join(destination,file)),{code:'ENOENT'});
  }finally{await fs.rm(destination,{recursive:true,force:true});}
});
test('PRISM Map opens the installed region without requiring a Ride job and validates navigation',async()=>{
  const {createPrismProductRuntime}=await import('../prism/product-runtime.mjs');let opened,navigated;
  const capacitor={isNativePlatform:()=>true,Plugins:{LighthouseRideMap:{
    async getPackageStatus(){return {packageState:'ACTIVE',region:'กรุงเทพ',bounds:{minLat:13,maxLat:14,minLon:100,maxLon:101}};},
    async openMap(v){opened=v;return {status:'OPENED'};},async navigate(v){navigated=v;return {status:'OPENED'};}
  }}};
  const runtime=createPrismProductRuntime({capacitor});await runtime.openMap();
  assert.equal(opened.pickup.lat,13.5);assert.equal(opened.pickup.lng,100.5);
  await runtime.navigate({lat:13.75,lng:100.5});assert.equal(navigated.destination.lat,13.75);
  await assert.rejects(runtime.navigate({lat:91,lng:100}),/GEOGRAPHY_INVALID/);
  await assert.rejects(runtime.navigate({lat:'',lng:100}),/GEOGRAPHY_INVALID/);
});
