export const LIGHTHOUSE_PACKAGE='com.yggdrasil.lighthouse';
export const LIGHTHOUSE_SIGNER_SHA256='AA:E6:08:A7:DD:AB:0D:BF:CC:C1:D3:5E:81:7C:56:83:B3:C6:4B:90:AB:58:1A:4B:74:86:7D:B5:4E:03:51:CE';
export const DEFAULT_UPDATE_METADATA_URL='https://raw.githubusercontent.com/pureekangraw-ops/ygph-metropolis/main/release/lighthouse-update.json';
export const UPDATE_WAITING_STORAGE_KEY='lighthouse-update-waiting-v1';

const SHA256=/^[a-f0-9]{64}$/u;

function object(value,code){if(!value||typeof value!=='object'||Array.isArray(value))throw new Error(code);return value;}
function string(value,code){if(typeof value!=='string'||!value.trim())throw new Error(code);return value.trim();}
function integer(value,code){if(!Number.isSafeInteger(value)||value<1)throw new Error(code);return value;}
function normalizeFingerprint(value){return String(value||'').trim().toUpperCase().replace(/[^A-F0-9]/g,'').match(/.{1,2}/g)?.join(':')||'';}
function requireHttps(value,code){const url=new URL(string(value,code));if(url.protocol!=='https:')throw new Error(code);return url.href;}
function usableStorage(value){return value&&typeof value.getItem==='function'&&typeof value.setItem==='function'&&typeof value.removeItem==='function'?value:null;}

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

function waitingFromLatest(latest){
  return Object.freeze({
    packageName:LIGHTHOUSE_PACKAGE,
    versionName:latest.versionName,
    versionCode:latest.versionCode,
    sha256:latest.sha256,
    apkUrl:latest.apkUrl,
    signerSha256:LIGHTHOUSE_SIGNER_SHA256,
    ...(Number.isFinite(latest.sizeBytes)?{sizeBytes:latest.sizeBytes}:{}),
  });
}

export function createAppUpdater({metadataUrl=DEFAULT_UPDATE_METADATA_URL,fetchImpl=globalThis.fetch,nativeBridge,requestBackup,storage=globalThis.localStorage}={}){
  const endpoint=requireHttps(metadataUrl,'UPDATE_METADATA_URL_HTTPS_REQUIRED');
  if(typeof fetchImpl!=='function')throw new Error('UPDATE_FETCH_REQUIRED');
  const bridge=requireBridge(nativeBridge);
  if(typeof requestBackup!=='function')throw new Error('UPDATE_BACKUP_REQUIRED');
  const stateStorage=usableStorage(storage);
  let installed=null;
  let latest=null;
  let cancelled=false;
  let apkVerified=false;
  let phase='idle';

  function readWaiting(){
    if(!stateStorage)return null;
    try{
      const value=JSON.parse(stateStorage.getItem(UPDATE_WAITING_STORAGE_KEY)||'null');
      if(!value||value.packageName!==LIGHTHOUSE_PACKAGE||!Number.isSafeInteger(value.versionCode)||!SHA256.test(String(value.sha256||'').toLowerCase()))return null;
      return value;
    }catch{return null;}
  }
  function persistWaiting(candidate){
    if(stateStorage)stateStorage.setItem(UPDATE_WAITING_STORAGE_KEY,JSON.stringify(candidate));
  }
  function clearWaiting(){stateStorage?.removeItem(UPDATE_WAITING_STORAGE_KEY);}
  function snapshot(){return Object.freeze({phase,installed:installed?{...installed}:null,latest:latest?{...latest}:null,cancelled,apkVerified});}
  function fail(error){phase='error';throw error;}

  async function resume(){
    try{
      installed=object(await bridge.getInstalledIdentity(),'UPDATE_INSTALLED_IDENTITY_REQUIRED');
      integer(installed.versionCode,'UPDATE_INSTALLED_VERSION_INVALID');
      if(installed.packageName&&installed.packageName!==LIGHTHOUSE_PACKAGE)throw new Error('UPDATE_PACKAGE_MISMATCH');
      const waiting=readWaiting();
      if(!waiting){phase='idle';return {status:'no-pending',installed:{...installed}};}
      latest={...waiting};
      if(installed.versionCode>=waiting.versionCode){
        clearWaiting();
        apkVerified=false;
        phase='installed';
        return {status:'installed',installed:{...installed}};
      }
      apkVerified=true;
      phase='ready-to-install';
      return {status:'ready-to-install',installed:{...installed},latest:{...latest}};
    }catch(error){return fail(error);}
  }

  async function retryInstaller(){
    try{
      const waiting=readWaiting();
      if(!waiting)throw new Error('UPDATE_WAITING_ARTIFACT_REQUIRED');
      installed=object(await bridge.getInstalledIdentity(),'UPDATE_INSTALLED_IDENTITY_REQUIRED');
      if(installed.versionCode>=waiting.versionCode){
        clearWaiting();phase='installed';apkVerified=false;
        return {status:'installed',installed:{...installed}};
      }
      latest={...waiting};
      const permission=object(await bridge.canRequestInstalls(),'UPDATE_INSTALL_PERMISSION_REQUIRED');
      if(permission.allowed!==true){phase='permission-required';return {status:'permission-required'};}
      phase='waiting-installer';
      persistWaiting(waiting);
      await bridge.openInstaller({versionCode:waiting.versionCode});
      return {status:'waiting-installer'};
    }catch(error){return fail(error);}
  }

  return Object.freeze({
    async check(){
      try{
        cancelled=false;
        apkVerified=false;
        phase='checking';
        installed=object(await bridge.getInstalledIdentity(),'UPDATE_INSTALLED_IDENTITY_REQUIRED');
        integer(installed.versionCode,'UPDATE_INSTALLED_VERSION_INVALID');
        if(installed.packageName&&installed.packageName!==LIGHTHOUSE_PACKAGE)throw new Error('UPDATE_PACKAGE_MISMATCH');
        const response=await fetchImpl(endpoint,{cache:'no-store'});
        if(!response?.ok||typeof response.json!=='function')throw new Error('UPDATE_METADATA_FETCH_FAILED');
        latest=validateUpdateMetadata(await response.json(),installed.versionCode);
        phase='checked';
        return snapshot();
      }catch(error){return fail(error);}
    },
    async downloadAndInstall(){
      if(!installed||!latest)throw new Error('UPDATE_CHECK_REQUIRED');
      try{
        cancelled=false;
        apkVerified=false;
        phase='downloading';
        const downloaded=object(await bridge.downloadApk({url:latest.apkUrl,sha256:latest.sha256,versionCode:latest.versionCode}),'UPDATE_DOWNLOAD_RESULT_REQUIRED');
        if(cancelled)throw new Error('UPDATE_CANCELLED');
        phase='downloaded';
        const actualHash=string(downloaded.sha256,'UPDATE_DOWNLOAD_HASH_REQUIRED').toLowerCase();
        phase='verifying';
        if(actualHash!==latest.sha256)throw new Error('UPDATE_DOWNLOAD_HASH_MISMATCH');
        phase='inspecting';
        const inspection=await bridge.inspectApk({versionCode:latest.versionCode});
        verifyApkInspection({metadata:latest,inspection,currentVersionCode:installed.versionCode});
        apkVerified=true;
        phase='verified';
        if(cancelled)throw new Error('UPDATE_CANCELLED');
        phase='backing-up';
        const backup=await requestBackup();
        if(backup===false||backup?.ok===false)throw new Error('UPDATE_BACKUP_FAILED');
        phase='backup-readback';
        const waiting=waitingFromLatest(latest);
        persistWaiting(waiting);
        phase='permission';
        const permission=object(await bridge.canRequestInstalls(),'UPDATE_INSTALL_PERMISSION_REQUIRED');
        if(permission.allowed!==true){phase='permission-required';return {status:'permission-required'};}
        phase='waiting-installer';
        persistWaiting(waiting);
        await bridge.openInstaller({versionCode:latest.versionCode});
        return {status:'waiting-installer'};
      }catch(error){return fail(error);}
    },
    resume,
    retryInstaller,
    async cancel(){
      cancelled=true;
      phase='cancelled';
      const versionCode=latest?.versionCode||readWaiting()?.versionCode;
      await bridge.cancelDownload(versionCode?{versionCode}:undefined);
      clearWaiting();
      return {status:'cancelled'};
    },
    state:snapshot,
  });
}

export function capacitorUpdaterBridge(capacitor=globalThis.Capacitor){
  const plugin=capacitor?.Plugins?.LighthouseUpdater;
  if(!plugin)return null;
  return Object.freeze({
    getInstalledIdentity:()=>plugin.getInstalledIdentity(),
    downloadApk:options=>plugin.downloadApk(options),
    inspectApk:options=>plugin.inspectApk(options||{}),
    canRequestInstalls:()=>plugin.canRequestInstalls(),
    openUnknownSourcesSettings:()=>plugin.openUnknownSourcesSettings(),
    openInstaller:options=>plugin.openInstaller(options||{}),
    cancelDownload:options=>plugin.cancelDownload(options||{}),
    addProgressListener:listener=>plugin.addListener?.('downloadProgress',listener),
  });
}
