import { readFileSync, writeFileSync } from 'node:fs';

let settings=readFileSync('ui/settings-ui.mjs','utf8');
const oldProgress=`  bridge.addProgressListener?.(({percent,downloadedBytes,totalBytes}={})=>{\n    const progress=$('settingsUpdateProgress');\n    if(progress){progress.max=100;progress.value=Math.max(0,Math.min(100,Number(percent||0)));}\n    const detail=$('settingsUpdateProgressText');\n    if(detail)detail.textContent=totalBytes?\`${'${formatBytes(downloadedBytes)} / ${formatBytes(totalBytes)}'}\`:formatBytes(downloadedBytes);\n  });`;
const newProgress=`  bridge.addProgressListener?.(({downloadedBytes,totalBytes}={})=>{\n    const progress=$('settingsUpdateProgress');\n    const downloaded=Number(downloadedBytes||0);\n    const total=Number(totalBytes||0);\n    if(progress){\n      progress.max=100;\n      if(Number.isFinite(total)&&total>0)progress.value=Math.max(0,Math.min(100,(Number(downloadedBytes)/Number(totalBytes))*100));\n      else progress.removeAttribute('value');\n    }\n    const detail=$('settingsUpdateProgressText');\n    if(detail)detail.textContent=total>0?\`${'${formatBytes(downloaded)} / ${formatBytes(total)} · ${Math.round((downloaded/total)*100)}%'}\`:formatBytes(downloaded);\n  });`;
if(settings.includes(oldProgress))settings=settings.replace(oldProgress,newProgress);
else if(!settings.includes("progress.removeAttribute('value')"))throw new Error('Gate E: progress listener not found');

settings=settings.replace("  const progress=document.createElement('progress');progress.id='settingsUpdateProgress';progress.max=100;progress.value=0;","  const progress=document.createElement('progress');progress.id='settingsUpdateProgress';progress.max=100;progress.removeAttribute('value');");

const controllerLine="  updateController=createAppUpdater({metadataUrl:DEFAULT_UPDATE_METADATA_URL,nativeBridge:bridge,requestBackup:requestRealBackup});";
if(settings.includes(controllerLine)&&!settings.includes('let retryVerifiedArtifact=false;')){
  settings=settings.replace(controllerLine,`${controllerLine}\n  let retryVerifiedArtifact=false;`);
}

const checkBody=`      const result=await updateController.check();renderUpdateInfo(result);setUpdateStatus(\`พบรุ่น \${result.latest.versionName} พร้อมอัปเดต\`);`;
if(settings.includes(checkBody))settings=settings.replace(checkBody,`      retryVerifiedArtifact=false;\n      const result=await updateController.check();renderUpdateInfo(result);setUpdateStatus(\`พบรุ่น \${result.latest.versionName} พร้อมอัปเดต\`);`);

const installCall=`      const result=await updateController.downloadAndInstall();\n      if(result.status==='permission-required'){\n        permission.classList.remove('hidden');setUpdateStatus('Android ต้องอนุญาตให้ LIGHTHOUSE ติดตั้งแอปจากแหล่งนี้ก่อน');\n      }else setUpdateStatus('ส่ง APK ที่ตรวจผ่านให้ Android แล้ว กรุณายืนยันการติดตั้ง');`;
const installNew=`      const result=retryVerifiedArtifact?await updateController.retryInstaller():await updateController.downloadAndInstall();\n      if(result.status==='permission-required'){\n        retryVerifiedArtifact=true;\n        permission.classList.remove('hidden');setUpdateStatus('Android ต้องอนุญาตให้ LIGHTHOUSE ติดตั้งแอปจากแหล่งนี้ก่อน');\n      }else if(result.status==='installed'){\n        retryVerifiedArtifact=false;renderUpdateInfo(result);setUpdateStatus('ติดตั้งแล้ว · LIGHTHOUSE เป็นรุ่นล่าสุด');\n      }else {\n        retryVerifiedArtifact=true;setUpdateStatus('รอการยืนยันจาก Android');\n      }`;
if(settings.includes(installCall))settings=settings.replace(installCall,installNew);
else if(!settings.includes("retryVerifiedArtifact?await updateController.retryInstaller()"))throw new Error('Gate E: install flow not found');

const identityLine="  try{const identity=await bridge.getInstalledIdentity();renderUpdateInfo({installed:identity});}catch{setUpdateStatus('อ่านเวอร์ชันที่ติดตั้งไม่สำเร็จ',true);}";
const resumeLine=`  try{\n    const resumed=await updateController.resume();\n    renderUpdateInfo(resumed);\n    if(resumed.status==='ready-to-install'){retryVerifiedArtifact=true;install.classList.remove('hidden');install.textContent='ติดตั้งอีกครั้ง';setUpdateStatus('ไฟล์ตรวจผ่านแล้ว · พร้อมส่งให้ Android อีกครั้ง');}\n    else if(resumed.status==='installed'){retryVerifiedArtifact=false;install.classList.add('hidden');setUpdateStatus('ติดตั้งแล้ว · LIGHTHOUSE เป็นรุ่นล่าสุด');}\n  }catch{setUpdateStatus('อ่านสถานะการอัปเดตไม่สำเร็จ',true);}`;
if(settings.includes(identityLine))settings=settings.replace(identityLine,resumeLine);
else if(!settings.includes('const resumed=await updateController.resume()'))throw new Error('Gate E: startup identity flow not found');
writeFileSync('ui/settings-ui.mjs',settings);

let test=readFileSync('android-shell/test/app-update.test.mjs','utf8');
test=test.replace("assert.equal(result.status,'installer-opened');","assert.equal(result.status,'waiting-installer');");
writeFileSync('android-shell/test/app-update.test.mjs',test);

let native=readFileSync('android-shell/tools/apply-android-updater.mjs','utf8');
if(native.includes('private static final String APK_NAME = "lighthouse-update.apk";')){
  native=native.replace('    private static final String APK_NAME = "lighthouse-update.apk";\n','    private static final String APK_PREFIX = "LIGHTHOUSE-update-vc";\n');
  native=native.replace('    private File apkFile() { return new File(getContext().getCacheDir(), APK_NAME); }','    private File apkFile(int versionCode) { return new File(getContext().getCacheDir(), APK_PREFIX + versionCode + ".apk"); }\n\n    private Integer versionCode(PluginCall call) {\n        Integer value = call.getInt("versionCode");\n        return value != null && value > 0 ? value : null;\n    }');
  native=native.replace('        cancelled = false;\n        executor.execute(() -> {','        Integer requestedVersionCode = versionCode(call);\n        if (requestedVersionCode == null) { call.reject("UPDATE_VERSION_CODE_REQUIRED"); return; }\n        final int targetVersionCode = requestedVersionCode;\n        cancelled = false;\n        executor.execute(() -> {');
  native=native.replaceAll('File target = apkFile();','File target = apkFile(targetVersionCode);');
  native=native.replace('                        progress.put("percent", total > 0 ? Math.min(100, (downloaded * 100.0) / total) : 0);','                        if (total > 0) progress.put("percent", Math.min(100, (downloaded * 100.0) / total));');
  const cancelOld=`    public void cancelDownload(PluginCall call) {\n        cancelled = true;\n        HttpURLConnection connection = activeConnection;\n        if (connection != null) connection.disconnect();\n        File target = apkFile(targetVersionCode);\n        if (target.exists()) target.delete();\n        JSObject out = new JSObject(); out.put("cancelled", true); call.resolve(out);\n    }`;
  const cancelNew=`    public void cancelDownload(PluginCall call) {\n        cancelled = true;\n        HttpURLConnection connection = activeConnection;\n        if (connection != null) connection.disconnect();\n        Integer requestedVersionCode = versionCode(call);\n        if (requestedVersionCode != null) {\n            File target = apkFile(requestedVersionCode);\n            if (target.exists()) target.delete();\n        } else {\n            File[] staged = getContext().getCacheDir().listFiles((dir, name) -> name.startsWith(APK_PREFIX) && name.endsWith(".apk"));\n            if (staged != null) for (File target : staged) target.delete();\n        }\n        JSObject out = new JSObject(); out.put("cancelled", true); call.resolve(out);\n    }`;
  if(native.includes(cancelOld))native=native.replace(cancelOld,cancelNew);else throw new Error('Gate E: cancel block not found');

  const inspectHead=`    public void inspectApk(PluginCall call) {\n        try {\n            File target = apkFile(targetVersionCode);`;
  const inspectNew=`    public void inspectApk(PluginCall call) {\n        try {\n            Integer requestedVersionCode = versionCode(call);\n            if (requestedVersionCode == null) { call.reject("UPDATE_VERSION_CODE_REQUIRED"); return; }\n            File target = apkFile(requestedVersionCode);`;
  if(native.includes(inspectHead))native=native.replace(inspectHead,inspectNew);else throw new Error('Gate E: inspect block not found');

  const installerHead=`    public void openInstaller(PluginCall call) {\n        try {\n            File target = apkFile(targetVersionCode);`;
  const installerNew=`    public void openInstaller(PluginCall call) {\n        try {\n            Integer requestedVersionCode = versionCode(call);\n            if (requestedVersionCode == null) { call.reject("UPDATE_VERSION_CODE_REQUIRED"); return; }\n            File target = apkFile(requestedVersionCode);`;
  if(native.includes(installerHead))native=native.replace(installerHead,installerNew);else throw new Error('Gate E: installer block not found');
}
writeFileSync('android-shell/tools/apply-android-updater.mjs',native);
