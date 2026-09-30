import {cp,mkdir,readFile,writeFile} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

const GECKO_VERSION='157.0.20260924084938';
const GECKO_DEP=`implementation 'org.mozilla.geckoview:geckoview-omni:${GECKO_VERSION}'`;
const MOZILLA_REPO="maven { url 'https://maven.mozilla.org/maven2/' }";
const ACTIVITY='com.yggdrasil.prism.PrismBrowserActivity';

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
    await writeFile(gradlePath,gradle,'utf8');
  }

  const rootGradlePath=join(androidRoot,'build.gradle');
  let rootGradle=await readFile(rootGradlePath,'utf8');
  if(!rootGradle.includes('maven.mozilla.org')){
    const allProjects=/allprojects\\s*\\{[\\s\\S]*?repositories\\s*\\{/;
    const match=rootGradle.match(allProjects);
    if(!match)throw new Error('PRISM_BROWSER_REPOSITORY_BLOCK_MISSING');
    rootGradle=rootGradle.replace(allProjects,match[0]+'\n        '+MOZILLA_REPO);
    await writeFile(rootGradlePath,rootGradle,'utf8');
  }

  const javaRoot=join(app,'src','main','java','com','yggdrasil','prism');
  await mkdir(javaRoot,{recursive:true});
  for(const name of ['PrismBrowserActivity.java','FactoryEyeHost.java','PrismBrowserPlugin.java'])await cp(join(source,name),join(javaRoot,name),{force:true});

  const layoutRoot=join(app,'src','main','res','layout'); await mkdir(layoutRoot,{recursive:true});
  await cp(join(source,'activity_prism_browser.xml'),join(layoutRoot,'activity_prism_browser.xml'),{force:true});

  const assetRoot=join(app,'src','main','assets','factory-eye'); await mkdir(assetRoot,{recursive:true});
  await cp(join(source,'factory-eye'),assetRoot,{recursive:true,force:true});

  const manifestPath=join(app,'src','main','AndroidManifest.xml');
  let manifest=await readFile(manifestPath,'utf8');
  if(!manifest.includes('android.permission.INTERNET'))manifest=manifest.replace('<manifest','<manifest').replace(/(<manifest[^>]*>)/,'$1\n    <uses-permission android:name="android.permission.INTERNET" />');
  if(!manifest.includes(ACTIVITY)){
    const activity='\n        <activity android:name=".PrismBrowserActivity" android:exported="false" android:windowSoftInputMode="stateUnspecified|adjustResize" />\n';
    manifest=manifest.replace('</application>',activity+'    </application>');
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
