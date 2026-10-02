import {cp,mkdir,readFile,writeFile} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

const GECKO_VERSION='153.0.20260615093007';
const GECKO_DEP=`implementation 'org.mozilla.geckoview:geckoview-nightly-omni:${GECKO_VERSION}'`;
const MOZILLA_REPO="maven { url 'https://maven.mozilla.org/maven2/' }";
const ACTIVITY='com.yggdrasil.prism.PrismBrowserActivity';
const OBSERVER_SERVICE='com.yggdrasil.prism.PrismObserverService';
const FOREGROUND_SERVICE_SPECIAL_USE='android.permission.FOREGROUND_SERVICE_SPECIAL_USE';

function insertBeforeLast(text,needle,addition){
  const i=text.lastIndexOf(needle); if(i<0)throw new Error('PRISM_BROWSER_PATCH_TARGET_MISSING:'+needle);
  return text.slice(0,i)+addition+text.slice(i);
}

export async function applyPrismBrowser(androidRoot){
  const root=dirname(fileURLToPath(import.meta.url));
  const source=resolve(root,'..','native-prism-browser');
  const app=join(androidRoot,'app');

  const gradlePath=join(app,'build.gradle');
  let gradle=await readFile(gradlePath,'utf8');
  if(!gradle.includes(GECKO_DEP)){
    const marker='dependencies {'; if(!gradle.includes(marker))throw new Error('PRISM_BROWSER_DEPENDENCIES_MISSING');
    gradle=gradle.replace(marker,marker+'\n    '+GECKO_DEP);
  }
  if(/minSdkVersion\s+rootProject[.]ext[.]minSdkVersion/.test(gradle)){
    gradle=gradle.replace(/minSdkVersion\s+rootProject[.]ext[.]minSdkVersion/,'minSdkVersion 26');
  } else if(/minSdk\s+rootProject[.]ext[.]minSdkVersion/.test(gradle)){
    gradle=gradle.replace(/minSdk\s+rootProject[.]ext[.]minSdkVersion/,'minSdk 26');
  } else if(!/minSdk(?:Version)?\s+26/.test(gradle)){
    throw new Error('PRISM_BROWSER_MIN_SDK_PATCH_TARGET_MISSING');
  }

  if(!gradle.includes('maven.mozilla.org')){
    const marker='android {';
    if(!gradle.includes(marker))throw new Error('PRISM_BROWSER_REPOSITORY_BLOCK_MISSING');
    gradle=gradle.replace(marker,"repositories {\n    "+MOZILLA_REPO+"\n}\n\n"+marker);
  }
  if(!/sourceCompatibility\\s+JavaVersion[.]VERSION_17/.test(gradle)){
    const marker='android {';
    gradle=gradle.replace(marker,marker+"\n    compileOptions {\n        sourceCompatibility JavaVersion.VERSION_17\n        targetCompatibility JavaVersion.VERSION_17\n    }");
  }
  await writeFile(gradlePath,gradle,'utf8');

  const javaRoot=join(app,'src','main','java','com','yggdrasil','prism');
  await mkdir(javaRoot,{recursive:true});
  for(const name of ['PrismBrowserActivity.java','FactoryEyeHost.java','PrismBrowserPlugin.java','PrismObserverService.java','PrismBrowserRecovery.java'])await cp(join(source,name),join(javaRoot,name),{force:true});

  const layoutRoot=join(app,'src','main','res','layout'); await mkdir(layoutRoot,{recursive:true});
  await cp(join(source,'activity_prism_browser.xml'),join(layoutRoot,'activity_prism_browser.xml'),{force:true});

  const assetRoot=join(app,'src','main','assets','factory-eye'); await mkdir(assetRoot,{recursive:true});
  await cp(join(source,'factory-eye'),assetRoot,{recursive:true,force:true});

  const manifestPath=join(app,'src','main','AndroidManifest.xml');
  let manifest=await readFile(manifestPath,'utf8');
  if(!manifest.includes('android.permission.INTERNET'))manifest=manifest.replace(/(<manifest[^>]*>)/,'$1\n    <uses-permission android:name="android.permission.INTERNET" />');
  if(!manifest.includes('android.permission.FOREGROUND_SERVICE'))manifest=manifest.replace(/(<manifest[^>]*>)/,'$1\n    <uses-permission android:name="android.permission.FOREGROUND_SERVICE" />');
  if(!manifest.includes(FOREGROUND_SERVICE_SPECIAL_USE))manifest=manifest.replace(/(<manifest[^>]*>)/,'$1\n    <uses-permission android:name="'+FOREGROUND_SERVICE_SPECIAL_USE+'" />');
  if(!manifest.includes(ACTIVITY)&&!manifest.includes('android:name=".PrismBrowserActivity"')){
    const activity='\n        <activity android:name=".PrismBrowserActivity" android:exported="false" android:windowSoftInputMode="stateUnspecified|adjustResize" />\n';
    manifest=manifest.replace('</application>',activity+'    </application>');
  }
  if(!manifest.includes(OBSERVER_SERVICE)&&!manifest.includes('android:name=".PrismObserverService"')){
    const service='        <service android:name=".PrismObserverService" android:exported="false" android:foregroundServiceType="specialUse"><property android:name="android.app.PROPERTY_SPECIAL_USE_FGS_SUBTYPE" android:value="Owner-initiated browser Work session observation with persistent visible status" /></service>\n';
    manifest=manifest.replace('</application>',service+'    </application>');
  }
  await writeFile(manifestPath,manifest,'utf8');

  const mainPath=join(javaRoot,'MainActivity.java');
  let main=await readFile(mainPath,'utf8');
  if(!main.includes('registerPlugin(PrismBrowserPlugin.class)')){
    const superCall=/super[.]onCreate[(][^)]*[)];/;
    if(!superCall.test(main))throw new Error('PRISM_BROWSER_MAIN_ACTIVITY_ONCREATE_MISSING');
    main=main.replace(superCall,match=>'registerPlugin(PrismBrowserPlugin.class);\n    '+match);
    await writeFile(mainPath,main,'utf8');
  }
  return {activity:ACTIVITY,geckoView:GECKO_VERSION,factoryEye:'0.4.0',watch:['github.com/pureekangraw-ops','dash.cloudflare.com']};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)console.log(JSON.stringify(await applyPrismBrowser(process.argv[2]||'android')));
