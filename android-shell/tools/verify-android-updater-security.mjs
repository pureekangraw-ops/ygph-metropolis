import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { verifyAndroidSecurity } from './verify-android-security.mjs';

const INSTALL_PERMISSION = 'android.permission.REQUEST_INSTALL_PACKAGES';
const FILE_PROVIDER = 'androidx.core.content.FileProvider';
const FILE_PROVIDER_AUTHORITY = 'com.yggdrasil.lighthouse.updater.files';

function installPermissionCount(manifestText) {
  return [...String(manifestText).matchAll(/<uses-permission\b[^>]*android:name="android\.permission\.REQUEST_INSTALL_PACKAGES"[^>]*\/?\s*>/g)].length;
}

function attribute(tag, name) {
  return new RegExp(`\\bandroid:${name}="([^"]*)"`).exec(tag || '')?.[1];
}

function updaterProviderBlock(manifestText) {
  const blocks = [...String(manifestText).matchAll(/<provider\b([^>]*)>([\s\S]*?)<\/provider>/g)].map(match => ({
    openTag:`<provider${match[1]}>`,
    body:match[2],
  }));
  return blocks.find(block => (
    attribute(block.openTag, 'name') === FILE_PROVIDER
    && attribute(block.openTag, 'authorities') === FILE_PROVIDER_AUTHORITY
  )) || null;
}

export function verifyUpdaterAndroidSecurity({ manifestText, capacitorConfig, manifestPath = null }) {
  if (installPermissionCount(manifestText) !== 1) throw new Error(`ANDROID_UPDATER_INSTALL_PERMISSION_COUNT:${installPermissionCount(manifestText)}`);
  const provider = updaterProviderBlock(manifestText);
  if (!provider) throw new Error('ANDROID_UPDATER_FILE_PROVIDER_MISSING');
  if (attribute(provider.openTag, 'exported') !== 'false') throw new Error('ANDROID_UPDATER_FILE_PROVIDER_EXPORTED');
  if (attribute(provider.openTag, 'grantUriPermissions') !== 'true') throw new Error('ANDROID_UPDATER_FILE_PROVIDER_GRANT_MISSING');
  if (!/android:name="android\.support\.FILE_PROVIDER_PATHS"/.test(provider.body) || !/android:resource="@xml\/file_paths"/.test(provider.body)) {
    throw new Error('ANDROID_UPDATER_FILE_PROVIDER_PATHS_MISSING');
  }

  const baselineManifest = String(manifestText).replace(/\s*<uses-permission\b[^>]*android:name="android\.permission\.REQUEST_INSTALL_PACKAGES"[^>]*\/?\s*>/g, '');
  const baseline = verifyAndroidSecurity({ manifestText:baselineManifest, capacitorConfig, manifestPath });
  return Object.freeze({
    ...baseline,
    requestedPermissions:Object.freeze([...baseline.requestedPermissions, INSTALL_PERMISSION].sort()),
    updater:Object.freeze({
      installPermission:INSTALL_PERMISSION,
      fileProvider:FILE_PROVIDER,
      fileProviderAuthority:FILE_PROVIDER_AUTHORITY,
      fileProviderPrivate:true,
      temporaryReadGrantRequired:true,
    }),
  });
}

async function findFiles(root, filename, out = []) {
  const entries = await readdir(root, { withFileTypes:true });
  for (const entry of entries) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) await findFiles(path, filename, out);
    else if (entry.isFile() && entry.name === filename) out.push(path);
  }
  return out;
}

async function findMergedReleaseManifest(androidRoot) {
  const intermediatesRoot = join(androidRoot, 'app', 'build', 'intermediates');
  let all;
  try { all = await findFiles(intermediatesRoot, 'AndroidManifest.xml'); }
  catch (error) { if (error?.code === 'ENOENT') throw new Error('ANDROID_SECURITY_MERGED_MANIFEST_MISSING'); throw error; }
  const matches = all.filter(path => /\/merged_manifests?\/release\//.test(path.replaceAll('\\', '/')));
  if (matches.length !== 1) throw new Error(`ANDROID_SECURITY_MERGED_MANIFEST_COUNT:${matches.length}`);
  return matches[0];
}

export async function verifyGeneratedUpdaterAndroidSecurity(androidRoot) {
  const manifestPath = await findMergedReleaseManifest(androidRoot);
  const manifestText = await readFile(manifestPath, 'utf8');
  const configPath = join(androidRoot, 'app', 'src', 'main', 'assets', 'capacitor.config.json');
  const capacitorConfig = JSON.parse(await readFile(configPath, 'utf8'));
  const evidence = verifyUpdaterAndroidSecurity({ manifestText, capacitorConfig, manifestPath:relative(androidRoot, manifestPath) });
  return { ...evidence, capacitorConfigPath:relative(androidRoot, configPath) };
}

async function main() {
  const [, , androidRoot, evidencePath] = process.argv;
  if (!androidRoot || !evidencePath) throw new Error('USAGE: node tools/verify-android-updater-security.mjs <android-root> <evidence-json>');
  const evidence = await verifyGeneratedUpdaterAndroidSecurity(androidRoot);
  await mkdir(dirname(evidencePath), { recursive:true });
  await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ status:evidence.status, evidencePath }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error?.stack || String(error)); process.exitCode = 1; });
}
