export const LIGHTHOUSE_PACKAGE='com.yggdrasil.lighthouse';
export const LIGHTHOUSE_SIGNER_SHA256='AA:E6:08:A7:DD:AB:0D:BF:CC:C1:D3:5E:81:7C:56:83:B3:C6:4B:90:AB:58:1A:4B:74:86:7D:B5:4E:03:51:CE';
export const DEFAULT_UPDATE_METADATA_URL='https://raw.githubusercontent.com/pureekangraw-ops/ygph-metropolis/main/release/lighthouse-update.json';

const SHA256=/^[a-f0-9]{64}$/u;

function object(value,code){if(!value||typeof value!=='object'||Array.isArray(value))throw new Error(code);return value;}
function string(value,code){if(typeof value!=='string'||!value.trim())throw new Error(code);return value.trim();}
function integer(value,code){if(!Number.isSafeInteger(value)||value<1)throw new Error(code);return value;}
function normalizeFingerprint(value){return String(value||'').trim().toUpperCase().replace(/[^A-F0-9]/g,'').match(/.{1,2}/g)?.join(':')||'';}
function requireHttps(value,code){const url=new URL(string(value,code));if(url.protocol!=='https:')throw new Error(code);return url.href;}

export function validateUpdateMetadata(value,currentVersionCode){
  const input=object(value,'UPDATE_METADATA_REQUIRED');
  const versionCode=integer(input.versionCode,'UPDATE_VERSION_CODE_INVALID');
  if(Number.isSafeInteger(currentVersionCode)&&versionCode<=currentVersionCode)throw new Error('UPDATE_VERSION_NOT_NEWER');
  const minVersionCode=Number.isSafeInteger(input.minVersionCode)?integer(input.minVersionCode,'UPDATE_MIN_VERSION_INVALID'):1;
  if(Number.isSafeInteger(currentVersionCode)&&currentVersionCode<minVersionCode)throw new Error('UPDATE_BASE_NOT_SUPPORTED');
  const sha256=string(input.sha256,'UPDATE_SHA256_INVALID').toLowerCase();
  if(!SHA256.test(sha256))throw new Error('UPDATE_SHA256_INVALID');
  return Object.freeze({
    versionName:string(input.versionName,'UPDATE_VERSION_NAME_REQUIRED'),
    versionCode,
    minVersionCode,
    compatible:true,
    apkUrl:requireHttps(input.apkUrl,'UPDATE_APK_URL_HTTPS_REQUIRED'),
    sha256,
    required:input.required===true,
    releaseVerified:input.releaseVerified===true,
    releaseNotes:string(input.releaseNotes,'UPDATE_RELEASE_NOTES_REQUIRED'),
    ...(Number.isFinite(input.sizeBytes)&&input.sizeBytes>=0?{sizeBytes:Number(input.sizeBytes)}:{}),
  });
}

export function verifyApkInspection({metadata,inspection,currentVersionCode}={}){
  const meta=validateUpdateMetadata(metadata,currentVersionCode);
  const apk=object(inspection,'UPDATE_APK_INSPECTION_REQUIRED');
  if(apk.packageName!==LIGHTHOUSE_PACKAGE)throw new Error('UPDATE_PACKAGE_MISMATCH');
  const versionCode=integer(apk.versionCode,'UPDATE_APK_VERSION_INVALID');
  if(versionCode<=currentVersionCode||versionCode!==meta.versionCode)throw new Error('UPDATE_VERSION_NOT_NEWER');
  if(String(apk.versionName||'')!==meta.versionName)throw new Error('UPDATE_VERSION_NAME_MISMATCH');
  if(normalizeFingerprint(apk.signerSha256)!==LIGHTHOUSE_SIGNER_SHA256)throw new Error('UPDATE_SIGNER_MISMATCH');
  return Object.freeze({packageName:apk.packageName,versionName:apk.versionName,versionCode,signerSha256:LIGHTHOUSE_SIGNER_SHA256,verified:true});
}

function requireBridge(bridge){
  const value=object(bridge,'UPDATE_NATIVE_BRIDGE_REQUIRED');
  for(const method of ['getInstalledIdentity','downloadApk','inspectApk','canRequestInstalls','openInstaller','cancelDownload']){
    if(typeof value[method]!=='function')throw new Error(`UPDATE_NATIVE_METHOD_REQUIRED:${method}`);
  }
  return value;
}

export function createAppUpdater({metadataUrl=DEFAULT_UPDATE_METADATA_URL,fetchImpl=globalThis.fetch,nativeBridge,requestBackup}={}){
  const endpoint=requireHttps(metadataUrl,'UPDATE_METADATA_URL_HTTPS_REQUIRED');
  if(typeof fetchImpl!=='function')throw new Error('UPDATE_FETCH_REQUIRED');
  const bridge=requireBridge(nativeBridge);
  if(typeof requestBackup!=='function')throw new Error('UPDATE_BACKUP_REQUIRED');
  let installed=null;
  let latest=null;
  let cancelled=false;
  let apkVerified=false;

  return Object.freeze({
    async check(){
      cancelled=false;
      apkVerified=false;
      installed=object(await bridge.getInstalledIdentity(),'UPDATE_INSTALLED_IDENTITY_REQUIRED');
      integer(installed.versionCode,'UPDATE_INSTALLED_VERSION_INVALID');
      const response=await fetchImpl(endpoint,{cache:'no-store'});
      if(!response?.ok||typeof response.json!=='function')throw new Error('UPDATE_METADATA_FETCH_FAILED');
      latest=validateUpdateMetadata(await response.json(),installed.versionCode);
      return Object.freeze({installed:{...installed},latest:{...latest},apkVerified:false});
    },
    async downloadAndInstall(){
      if(!installed||!latest)throw new Error('UPDATE_CHECK_REQUIRED');
      cancelled=false;
      apkVerified=false;
      const downloaded=object(await bridge.downloadApk({url:latest.apkUrl,sha256:latest.sha256,versionCode:latest.versionCode}),'UPDATE_DOWNLOAD_RESULT_REQUIRED');
      if(cancelled)throw new Error('UPDATE_CANCELLED');
      const actualHash=string(downloaded.sha256,'UPDATE_DOWNLOAD_HASH_REQUIRED').toLowerCase();
      if(actualHash!==latest.sha256)throw new Error('UPDATE_DOWNLOAD_HASH_MISMATCH');
      const inspection=await bridge.inspectApk();
      verifyApkInspection({metadata:latest,inspection,currentVersionCode:installed.versionCode});
      apkVerified=true;
      if(cancelled)throw new Error('UPDATE_CANCELLED');
      const backup=await requestBackup();
      if(backup===false||backup?.ok===false)throw new Error('UPDATE_BACKUP_FAILED');
      const permission=object(await bridge.canRequestInstalls(),'UPDATE_INSTALL_PERMISSION_REQUIRED');
      if(permission.allowed!==true)return {status:'permission-required'};
      await bridge.openInstaller();
      return {status:'installer-opened'};
    },
    async cancel(){cancelled=true;await bridge.cancelDownload();return {status:'cancelled'};},
    state(){return {installed:installed?{...installed}:null,latest:latest?{...latest}:null,cancelled,apkVerified};},
  });
}

export function capacitorUpdaterBridge(capacitor=globalThis.Capacitor){
  const plugin=capacitor?.Plugins?.LighthouseUpdater;
  if(!plugin)return null;
  return Object.freeze({
    getInstalledIdentity:()=>plugin.getInstalledIdentity(),
    downloadApk:options=>plugin.downloadApk(options),
    inspectApk:()=>plugin.inspectApk(),
    canRequestInstalls:()=>plugin.canRequestInstalls(),
    openUnknownSourcesSettings:()=>plugin.openUnknownSourcesSettings(),
    openInstaller:()=>plugin.openInstaller(),
    cancelDownload:()=>plugin.cancelDownload(),
    addProgressListener:listener=>plugin.addListener?.('downloadProgress',listener),
  });
}
