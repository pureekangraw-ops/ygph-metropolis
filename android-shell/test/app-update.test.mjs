import test from 'node:test';
import assert from 'node:assert/strict';

const updaterUrl = new URL('../../ui/app-update.mjs', import.meta.url);

const GOOD_HASH='a'.repeat(64);
const CANONICAL='AA:E6:08:A7:DD:AB:0D:BF:CC:C1:D3:5E:81:7C:56:83:B3:C6:4B:90:AB:58:1A:4B:74:86:7D:B5:4E:03:51:CE';

async function module(){return import(`${updaterUrl.href}?t=${Date.now()}-${Math.random()}`);}

function metadata(overrides={}){
  return {
    versionName:'1.0.4',
    versionCode:1005,
    minVersionCode:1004,
    apkUrl:'https://github.com/pureekangraw-ops/ygph-metropolis/releases/download/lighthouse-v1.0.4/LIGHTHOUSE-1.0.4.apk',
    sha256:GOOD_HASH,
    sizeBytes:3300000,
    required:false,
    releaseVerified:true,
    releaseNotes:'แก้หน้า Login และระบบเริ่มต้น',
    ...overrides,
  };
}

test('metadata requires HTTPS, a higher versionCode, supported base and SHA-256 digest', async()=>{
  const { validateUpdateMetadata }=await module();
  const valid=validateUpdateMetadata(metadata(),1004);
  assert.equal(valid.versionCode,1005);
  assert.equal(valid.compatible,true);
  assert.equal(valid.releaseVerified,true);
  assert.throws(()=>validateUpdateMetadata(metadata({apkUrl:'http://example.com/a.apk'}),1004),/UPDATE_APK_URL_HTTPS_REQUIRED/);
  assert.throws(()=>validateUpdateMetadata(metadata({versionCode:1004}),1004),/UPDATE_VERSION_NOT_NEWER/);
  assert.throws(()=>validateUpdateMetadata(metadata({minVersionCode:1005}),1004),/UPDATE_BASE_NOT_SUPPORTED/);
  assert.throws(()=>validateUpdateMetadata(metadata({sha256:'abc'}),1004),/UPDATE_SHA256_INVALID/);
});

test('check update is read-only: identity + manifest only, with no download, backup or installer', async()=>{
  const { createAppUpdater }=await module();
  const calls=[];
  const updater=createAppUpdater({
    metadataUrl:'https://example.com/update.json',
    fetchImpl:async()=>{calls.push('manifest');return {ok:true,json:async()=>metadata()};},
    nativeBridge:{
      async getInstalledIdentity(){calls.push('identity');return {packageName:'com.yggdrasil.lighthouse',versionName:'1.0.3',versionCode:1004};},
      async downloadApk(){calls.push('download');throw new Error('must not download');},
      async inspectApk(){calls.push('inspect');throw new Error('must not inspect');},
      async canRequestInstalls(){calls.push('permission');throw new Error('must not ask permission');},
      async openInstaller(){calls.push('installer');throw new Error('must not install');},
      async cancelDownload(){calls.push('cancel');return {cancelled:true};},
    },
    requestBackup:async()=>{calls.push('backup');throw new Error('must not backup');},
  });
  const result=await updater.check();
  assert.equal(result.latest.releaseNotes,'แก้หน้า Login และระบบเริ่มต้น');
  assert.equal(result.latest.sizeBytes,3300000);
  assert.deepEqual(calls,['identity','manifest']);
});

test('APK inspection must match package, higher version and canonical signer', async()=>{
  const { verifyApkInspection }=await module();
  const good={packageName:'com.yggdrasil.lighthouse',versionName:'1.0.4',versionCode:1005,signerSha256:CANONICAL};
  assert.equal(verifyApkInspection({metadata:metadata(),inspection:good,currentVersionCode:1004}).versionCode,1005);
  assert.throws(()=>verifyApkInspection({metadata:metadata(),inspection:{...good,packageName:'evil.app'},currentVersionCode:1004}),/UPDATE_PACKAGE_MISMATCH/);
  assert.throws(()=>verifyApkInspection({metadata:metadata(),inspection:{...good,versionCode:1004},currentVersionCode:1004}),/UPDATE_VERSION_NOT_NEWER/);
  assert.throws(()=>verifyApkInspection({metadata:metadata(),inspection:{...good,signerSha256:'00'},currentVersionCode:1004}),/UPDATE_SIGNER_MISMATCH/);
});

test('installer is reached only after download hash, inspection and real backup succeed', async()=>{
  const { createAppUpdater }=await module();
  const calls=[];
  const nativeBridge={
    async getInstalledIdentity(){calls.push('identity');return {packageName:'com.yggdrasil.lighthouse',versionName:'1.0.3',versionCode:1004};},
    async downloadApk(){calls.push('download');return {sha256:GOOD_HASH,sizeBytes:3300000};},
    async inspectApk(){calls.push('inspect');return {packageName:'com.yggdrasil.lighthouse',versionName:'1.0.4',versionCode:1005,signerSha256:CANONICAL};},
    async canRequestInstalls(){calls.push('permission');return {allowed:true};},
    async openInstaller(){calls.push('installer');return {opened:true};},
    async cancelDownload(){calls.push('cancel');return {cancelled:true};},
  };
  const fetchImpl=async()=>({ok:true,json:async()=>metadata()});
  const requestBackup=async()=>{calls.push('backup');return {ok:true};};
  const updater=createAppUpdater({metadataUrl:'https://example.com/lighthouse-update.json',fetchImpl,nativeBridge,requestBackup});
  await updater.check();
  const result=await updater.downloadAndInstall();
  assert.equal(result.status,'installer-opened');
  assert.deepEqual(calls,['identity','download','inspect','backup','permission','installer']);
});

test('hash mismatch or backup failure stops before installer', async()=>{
  const { createAppUpdater }=await module();
  const baseBridge={
    async getInstalledIdentity(){return {packageName:'com.yggdrasil.lighthouse',versionName:'1.0.3',versionCode:1004};},
    async inspectApk(){return {packageName:'com.yggdrasil.lighthouse',versionName:'1.0.4',versionCode:1005,signerSha256:CANONICAL};},
    async canRequestInstalls(){throw new Error('permission should not run');},
    async openInstaller(){throw new Error('installer should not run');},
    async cancelDownload(){return {cancelled:true};},
  };
  const fetchImpl=async()=>({ok:true,json:async()=>metadata()});
  const badHash=createAppUpdater({metadataUrl:'https://example.com/update.json',fetchImpl,nativeBridge:{...baseBridge,async downloadApk(){return {sha256:'b'.repeat(64)};}},requestBackup:async()=>{throw new Error('backup should not run');}});
  await badHash.check();
  await assert.rejects(()=>badHash.downloadAndInstall(),/UPDATE_DOWNLOAD_HASH_MISMATCH/);

  let permissionCalled=false;
  const backupFail=createAppUpdater({metadataUrl:'https://example.com/update.json',fetchImpl,nativeBridge:{...baseBridge,async downloadApk(){return {sha256:GOOD_HASH};},async canRequestInstalls(){permissionCalled=true;return {allowed:true};}},requestBackup:async()=>{throw new Error('BACKUP_FAILED');}});
  await backupFail.check();
  await assert.rejects(()=>backupFail.downloadAndInstall(),/BACKUP_FAILED/);
  assert.equal(permissionCalled,false);
});

test('unknown-source permission returns a bounded state instead of breaking the app', async()=>{
  const { createAppUpdater }=await module();
  const nativeBridge={
    async getInstalledIdentity(){return {packageName:'com.yggdrasil.lighthouse',versionName:'1.0.3',versionCode:1004};},
    async downloadApk(){return {sha256:GOOD_HASH};},
    async inspectApk(){return {packageName:'com.yggdrasil.lighthouse',versionName:'1.0.4',versionCode:1005,signerSha256:CANONICAL};},
    async canRequestInstalls(){return {allowed:false};},
    async openInstaller(){throw new Error('installer should not open');},
    async cancelDownload(){return {cancelled:true};},
  };
  const updater=createAppUpdater({metadataUrl:'https://example.com/update.json',fetchImpl:async()=>({ok:true,json:async()=>metadata()}),nativeBridge,requestBackup:async()=>({ok:true})});
  await updater.check();
  assert.deepEqual(await updater.downloadAndInstall(),{status:'permission-required'});
});
