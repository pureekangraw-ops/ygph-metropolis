import test from 'node:test';
import assert from 'node:assert/strict';

const updaterUrl=new URL('../../ui/app-update.mjs',import.meta.url);
const HASH='a'.repeat(64);
const SIGNER='AA:E6:08:A7:DD:AB:0D:BF:CC:C1:D3:5E:81:7C:56:83:B3:C6:4B:90:AB:58:1A:4B:74:86:7D:B5:4E:03:51:CE';
const META={versionName:'1.0.5',versionCode:1006,minVersionCode:1005,apkUrl:'https://example.com/LIGHTHOUSE-1.0.5-vc1006.apk',sha256:HASH,sizeBytes:42,required:false,releaseVerified:true,releaseNotes:'1.0.5'};

function memoryStorage(seed={}){
  const values=new Map(Object.entries(seed));
  return {getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,String(v)),removeItem:k=>values.delete(k),dump:()=>Object.fromEntries(values)};
}
async function module(){return import(`${updaterUrl.href}?t=${Date.now()}-${Math.random()}`);}
function bridge({installedCode=1005,onInstaller=()=>{}}={}){
  return {
    async getInstalledIdentity(){return {packageName:'com.yggdrasil.lighthouse',versionName:installedCode===1006?'1.0.5':'1.0.4',versionCode:installedCode};},
    async downloadApk(options){assert.equal(options.versionCode,1006);return {sha256:HASH,sizeBytes:42};},
    async inspectApk(options){assert.equal(options.versionCode,1006);return {packageName:'com.yggdrasil.lighthouse',versionName:'1.0.5',versionCode:1006,signerSha256:SIGNER};},
    async canRequestInstalls(){return {allowed:true};},
    async openInstaller(options){assert.equal(options.versionCode,1006);onInstaller();return {opened:true};},
    async cancelDownload(){return {cancelled:true};},
  };
}

test('verified candidate is persisted before Android installer handoff',async()=>{
  const {createAppUpdater,UPDATE_WAITING_STORAGE_KEY}=await module();
  const storage=memoryStorage();
  let persistedAtInstaller=false;
  const updater=createAppUpdater({
    metadataUrl:'https://example.com/update.json',storage,
    fetchImpl:async()=>({ok:true,json:async()=>META}),
    nativeBridge:bridge({onInstaller:()=>{persistedAtInstaller=Boolean(storage.getItem(UPDATE_WAITING_STORAGE_KEY));}}),
    requestBackup:async()=>({ok:true,readback:true}),
  });
  await updater.check();
  const result=await updater.downloadAndInstall();
  assert.equal(result.status,'waiting-installer');
  assert.equal(persistedAtInstaller,true,'waiting state must exist before installer opens');
  const saved=JSON.parse(storage.getItem(UPDATE_WAITING_STORAGE_KEY));
  assert.equal(saved.versionCode,1006);
  assert.equal(saved.sha256,HASH);
  assert.equal(updater.state().phase,'waiting-installer');
});

test('resume reads installed identity: old vc is retryable, target vc closes the handoff',async()=>{
  const {createAppUpdater,UPDATE_WAITING_STORAGE_KEY}=await module();
  const stored=JSON.stringify({versionName:'1.0.5',versionCode:1006,sha256:HASH,apkUrl:META.apkUrl,signerSha256:SIGNER});
  const storage=memoryStorage({[UPDATE_WAITING_STORAGE_KEY]:stored});
  const old=createAppUpdater({metadataUrl:'https://example.com/update.json',storage,fetchImpl:async()=>{throw new Error('resume must not fetch');},nativeBridge:bridge({installedCode:1005}),requestBackup:async()=>{throw new Error('resume must not backup');}});
  assert.equal((await old.resume()).status,'ready-to-install');
  assert.equal(old.state().phase,'ready-to-install');
  assert.ok(storage.getItem(UPDATE_WAITING_STORAGE_KEY));

  const upgraded=createAppUpdater({metadataUrl:'https://example.com/update.json',storage,fetchImpl:async()=>{throw new Error('resume must not fetch');},nativeBridge:bridge({installedCode:1006}),requestBackup:async()=>{throw new Error('resume must not backup');}});
  const done=await upgraded.resume();
  assert.equal(done.status,'installed');
  assert.equal(done.installed.versionCode,1006);
  assert.equal(storage.getItem(UPDATE_WAITING_STORAGE_KEY),null);
});

test('retry installer uses the persisted versioned staged artifact without redownload',async()=>{
  const {createAppUpdater,UPDATE_WAITING_STORAGE_KEY}=await module();
  const storage=memoryStorage({[UPDATE_WAITING_STORAGE_KEY]:JSON.stringify({versionName:'1.0.5',versionCode:1006,sha256:HASH,apkUrl:META.apkUrl,signerSha256:SIGNER})});
  let opened=0;
  const native=bridge({installedCode:1005,onInstaller:()=>opened++});
  native.downloadApk=async()=>{throw new Error('must not redownload');};
  const updater=createAppUpdater({metadataUrl:'https://example.com/update.json',storage,fetchImpl:async()=>{throw new Error('must not fetch');},nativeBridge:native,requestBackup:async()=>{throw new Error('must not backup');}});
  await updater.resume();
  assert.equal((await updater.retryInstaller()).status,'waiting-installer');
  assert.equal(opened,1);
});
