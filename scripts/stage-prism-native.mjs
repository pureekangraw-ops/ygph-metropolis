import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PRISM_RUNTIME_FILES=Object.freeze(['index.html','styles.css','app.mjs','spectrum.mjs','manifest.webmanifest','component-release.json']);
export const PRISM_ASSETS=Object.freeze(['assets/prism-icon.svg','assets/prism-icon-maskable.svg']);
async function copy(repoRoot,dest,relative){const target=join(dest,'prism',relative);await mkdir(dirname(target),{recursive:true});await cp(join(repoRoot,'prism',relative),target,{force:true});}
export async function stagePrismNative({repoRoot,destinationRoot}){
  const version=JSON.parse(await readFile(join(repoRoot,'android-shell','version.json'),'utf8'));
  const identity=JSON.parse(await readFile(join(repoRoot,'android-shell','apk-identity.json'),'utf8'));
  const components=JSON.parse(await readFile(join(repoRoot,'prism','component-release.json'),'utf8'));
  if(identity.applicationId!=='com.yggdrasil.prism')throw new Error('PRISM_APPLICATION_ID_INVALID');
  if(components.product!=='PRISM'||components.policy!=='LOCKSTEP_FAIL_CLOSED')throw new Error('PRISM_COMPONENT_CONTRACT_INVALID');
  if(components.release.versionName!==version.versionName||Number(components.release.versionCode)!==Number(version.versionCode))throw new Error('PRISM_COMPONENT_RELEASE_VERSION_MISMATCH');
  await rm(destinationRoot,{recursive:true,force:true});await mkdir(join(destinationRoot,'prism','assets'),{recursive:true});
  for(const f of [...PRISM_RUNTIME_FILES,...PRISM_ASSETS])await copy(repoRoot,destinationRoot,f);
  const root='<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>PRISM</title><meta http-equiv="refresh" content="0;url=./prism/index.html"></head><body><script>location.replace("./prism/index.html")</script></body></html>';
  await writeFile(join(destinationRoot,'index.html'),root,'utf8');
  const manifest={product:'PRISM',architecture:'PRISM_NATIVE_V1',legacyParent:null,applicationId:identity.applicationId,versionName:version.versionName,versionCode:version.versionCode,componentPolicy:components.policy,components:components.components,roots:['COPILOT','PROJECTS','MAP','LEDGER'],deep:['HANDOFF','MONITOR'],capabilities:{MAP:'NATIVE_OVERLAY',LEDGER:'OWNER_BOUNDARY',COPILOT:'SPECTRUM'},sourceCommit:process.env.PRISM_SOURCE_COMMIT||process.env.GITHUB_SHA||null};
  await writeFile(join(destinationRoot,'release-manifest.json'),JSON.stringify(manifest,null,2)+'\n','utf8');
  return manifest;
}
const modulePath=fileURLToPath(import.meta.url);if(process.argv[1]&&resolve(process.argv[1])===modulePath){const repoRoot=resolve(dirname(modulePath),'..');const destinationRoot=resolve(process.cwd(),process.argv[2]||'android-shell/www');console.log(JSON.stringify(await stagePrismNative({repoRoot,destinationRoot})));}
