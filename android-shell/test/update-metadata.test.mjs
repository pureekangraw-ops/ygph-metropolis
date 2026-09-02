import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

const toolUrl=new URL('../tools/build-update-metadata.mjs',import.meta.url);
async function loadTool(){return import(`${toolUrl.href}?t=${Date.now()}-${Math.random()}`);}

const SIGNER='aae608a7ddab0dbfccc1d35e817c5683b3c64b90ab581a4b74867db54e0351ce';

async function fixture(){
  const dir=await mkdtemp(join(tmpdir(),'lh-meta-'));
  const apkPath=join(dir,'LIGHTHOUSE-1.0.4.apk');
  const evidencePath=join(dir,'identity.json');
  const outputPath=join(dir,'lighthouse-update.json');
  const bytes=Buffer.from('signed-apk-fixture');
  await writeFile(apkPath,bytes);
  await writeFile(evidencePath,JSON.stringify({applicationId:'com.yggdrasil.lighthouse',versionName:'1.0.4',versionCode:1005,signerCertificateSha256:SIGNER,apkSha256:createHash('sha256').update(bytes).digest('hex')},null,2));
  return {dir,apkPath,evidencePath,outputPath,bytes};
}

test('buildUpdateMetadata emits compatible verified read-only manifest from final APK evidence',async()=>{
  const { buildUpdateMetadata }=await loadTool();
  const f=await fixture();
  const result=await buildUpdateMetadata({apkPath:f.apkPath,evidencePath:f.evidencePath,outputPath:f.outputPath,apkUrl:'https://github.com/pureekangraw-ops/ygph-metropolis/releases/download/lighthouse-v1.0.4/LIGHTHOUSE-1.0.4.apk',releaseNotes:'คืน direct startup และเพิ่ม in-app updater',minVersionCode:1004,required:false});
  assert.deepEqual(result,{versionName:'1.0.4',versionCode:1005,minVersionCode:1004,apkUrl:'https://github.com/pureekangraw-ops/ygph-metropolis/releases/download/lighthouse-v1.0.4/LIGHTHOUSE-1.0.4.apk',sha256:createHash('sha256').update(f.bytes).digest('hex'),sizeBytes:f.bytes.length,required:false,releaseVerified:true,releaseNotes:'คืน direct startup และเพิ่ม in-app updater'});
  assert.deepEqual(JSON.parse(await readFile(f.outputPath,'utf8')),result);
});

test('metadata generator rejects non-HTTPS URL, signer mismatch and evidence hash mismatch',async()=>{
  const { buildUpdateMetadata }=await loadTool();
  const f=await fixture();
  const common={apkPath:f.apkPath,evidencePath:f.evidencePath,outputPath:f.outputPath,releaseNotes:'notes',minVersionCode:1004};
  await assert.rejects(()=>buildUpdateMetadata({...common,apkUrl:'http://example.com/a.apk'}),/UPDATE_APK_URL_HTTPS_REQUIRED/);
  const wrongSigner={applicationId:'com.yggdrasil.lighthouse',versionName:'1.0.4',versionCode:1005,signerCertificateSha256:'00'.repeat(32),apkSha256:createHash('sha256').update(f.bytes).digest('hex')};
  await writeFile(f.evidencePath,JSON.stringify(wrongSigner));
  await assert.rejects(()=>buildUpdateMetadata({...common,apkUrl:'https://example.com/a.apk'}),/UPDATE_SIGNER_MISMATCH/);
  wrongSigner.signerCertificateSha256=SIGNER;wrongSigner.apkSha256='0'.repeat(64);await writeFile(f.evidencePath,JSON.stringify(wrongSigner));
  await assert.rejects(()=>buildUpdateMetadata({...common,apkUrl:'https://example.com/a.apk'}),/UPDATE_EVIDENCE_HASH_MISMATCH/);
});
