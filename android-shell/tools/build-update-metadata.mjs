import { createHash } from 'node:crypto';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const PACKAGE='com.yggdrasil.lighthouse';
const SIGNER='aae608a7ddab0dbfccc1d35e817c5683b3c64b90ab581a4b74867db54e0351ce';
const HEX64=/^[a-f0-9]{64}$/;

function normalizeFingerprint(value){return String(value??'').toLowerCase().replace(/[^0-9a-f]/g,'');}
function httpsUrl(value){const url=new URL(String(value||''));if(url.protocol!=='https:')throw new Error('UPDATE_APK_URL_HTTPS_REQUIRED');return url.href;}

export async function buildUpdateMetadata({apkPath,evidencePath,outputPath,apkUrl,releaseNotes,minVersionCode,required=false}={}){
  if(!apkPath)throw new Error('UPDATE_APK_PATH_REQUIRED');
  if(!evidencePath)throw new Error('UPDATE_EVIDENCE_PATH_REQUIRED');
  if(!outputPath)throw new Error('UPDATE_OUTPUT_PATH_REQUIRED');
  if(typeof releaseNotes!=='string'||!releaseNotes.trim())throw new Error('UPDATE_RELEASE_NOTES_REQUIRED');
  if(!Number.isSafeInteger(minVersionCode)||minVersionCode<1)throw new Error('UPDATE_MIN_VERSION_INVALID');
  const [bytes,evidence,fileStat]=await Promise.all([readFile(apkPath),readFile(evidencePath,'utf8').then(JSON.parse),stat(apkPath)]);
  if(evidence.applicationId!==PACKAGE)throw new Error('UPDATE_PACKAGE_MISMATCH');
  if(normalizeFingerprint(evidence.signerCertificateSha256)!==SIGNER)throw new Error('UPDATE_SIGNER_MISMATCH');
  if(!Number.isSafeInteger(evidence.versionCode)||evidence.versionCode<=minVersionCode)throw new Error('UPDATE_VERSION_NOT_NEWER');
  if(typeof evidence.versionName!=='string'||!evidence.versionName.trim())throw new Error('UPDATE_VERSION_NAME_REQUIRED');
  const sha256=createHash('sha256').update(bytes).digest('hex');
  if(!HEX64.test(String(evidence.apkSha256||''))||String(evidence.apkSha256).toLowerCase()!==sha256)throw new Error('UPDATE_EVIDENCE_HASH_MISMATCH');
  const result={versionName:evidence.versionName,versionCode:evidence.versionCode,minVersionCode,apkUrl:httpsUrl(apkUrl),sha256,sizeBytes:fileStat.size,required:required===true,releaseVerified:true,releaseNotes:releaseNotes.trim()};
  await writeFile(outputPath,`${JSON.stringify(result,null,2)}\n`,'utf8');
  return result;
}

if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
  if(process.env.LIGHTHOUSE_ALLOW_MANIFEST_ACTIVATION!=='1')throw new Error('UPDATE_MANIFEST_ACTIVATION_LOCKED');
  const [apkPath,evidencePath,outputPath,apkUrl,releaseNotes,minVersionCode,required]=process.argv.slice(2);
  const result=await buildUpdateMetadata({apkPath,evidencePath,outputPath,apkUrl,releaseNotes,minVersionCode:Number(minVersionCode),required:required==='true'});
  console.log(JSON.stringify(result));
}
