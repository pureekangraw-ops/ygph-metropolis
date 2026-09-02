import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const toolUrl=new URL('../tools/apply-android-updater.mjs',import.meta.url);
async function loadTool(){return import(`${toolUrl.href}?t=${Date.now()}-${Math.random()}`);}

async function fixture(){
  const root=await mkdtemp(join(tmpdir(),'lh-updater-'));
  const javaDir=join(root,'app','src','main','java','com','yggdrasil','lighthouse');
  await mkdir(javaDir,{recursive:true});
  await writeFile(join(root,'app','src','main','AndroidManifest.xml'),`<?xml version="1.0" encoding="utf-8"?>\n<manifest xmlns:android="http://schemas.android.com/apk/res/android">\n  <application android:label="LIGHTHOUSE">\n    <activity android:name=".MainActivity" android:exported="true" />\n  </application>\n</manifest>\n`,'utf8');
  await writeFile(join(javaDir,'MainActivity.java'),`package com.yggdrasil.lighthouse;\n\nimport com.getcapacitor.BridgeActivity;\n\npublic class MainActivity extends BridgeActivity {}\n`,'utf8');
  return root;
}

test('tool injects install permission, FileProvider, plugin source and MainActivity registration',async()=>{
  const { applyAndroidUpdater }=await loadTool();
  const root=await fixture();
  const result=await applyAndroidUpdater(root);
  assert.equal(result.packageName,'com.yggdrasil.lighthouse');
  const manifest=await readFile(join(root,'app','src','main','AndroidManifest.xml'),'utf8');
  assert.match(manifest,/android\.permission\.REQUEST_INSTALL_PACKAGES/);
  assert.match(manifest,/androidx\.core\.content\.FileProvider/);
  assert.match(manifest,/lighthouse_update_paths/);
  const main=await readFile(join(root,'app','src','main','java','com','yggdrasil','lighthouse','MainActivity.java'),'utf8');
  assert.match(main,/registerPlugin\(LighthouseUpdaterPlugin\.class\)/);
  const plugin=await readFile(join(root,'app','src','main','java','com','yggdrasil','lighthouse','LighthouseUpdaterPlugin.java'),'utf8');
  for(const marker of ['getInstalledIdentity','downloadApk','inspectApk','canRequestInstalls','openUnknownSourcesSettings','openInstaller','cancelDownload','GET_SIGNING_CERTIFICATES','FileProvider'])assert.match(plugin,new RegExp(marker));
  const paths=await readFile(join(root,'app','src','main','res','xml','lighthouse_update_paths.xml'),'utf8');
  assert.match(paths,/cache-path/);
});

test('tool is idempotent and does not duplicate permission, provider or registration',async()=>{
  const { applyAndroidUpdater }=await loadTool();
  const root=await fixture();
  await applyAndroidUpdater(root);
  await applyAndroidUpdater(root);
  const manifest=await readFile(join(root,'app','src','main','AndroidManifest.xml'),'utf8');
  const main=await readFile(join(root,'app','src','main','java','com','yggdrasil','lighthouse','MainActivity.java'),'utf8');
  assert.equal((manifest.match(/REQUEST_INSTALL_PACKAGES/g)||[]).length,1);
  assert.equal((manifest.match(/androidx\.core\.content\.FileProvider/g)||[]).length,1);
  assert.equal((main.match(/registerPlugin\(LighthouseUpdaterPlugin\.class\)/g)||[]).length,1);
});
