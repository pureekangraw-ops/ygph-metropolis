import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

function setApplicationAttribute(manifestText, name, value) {
  const openTag = /<application\b[^>]*>/s.exec(manifestText);
  if (!openTag) throw new Error('ANDROID_SECURITY_APPLICATION_TAG_MISSING');
  const attr = new RegExp(`\\sandroid:${name}="[^"]*"`);
  let replacement = openTag[0];
  if (attr.test(replacement)) replacement = replacement.replace(attr, ` android:${name}="${value}"`);
  else replacement = replacement.replace(/>$/, ` android:${name}="${value}">`);
  return manifestText.slice(0, openTag.index) + replacement + manifestText.slice(openTag.index + openTag[0].length);
}

export async function applyAndroidSecurityBaseline(androidRoot) {
  const manifestPath = join(androidRoot, 'app', 'src', 'main', 'AndroidManifest.xml');
  let manifest = await readFile(manifestPath, 'utf8');
  manifest = setApplicationAttribute(manifest, 'allowBackup', 'false');
  manifest = setApplicationAttribute(manifest, 'usesCleartextTraffic', 'false');
  await writeFile(manifestPath, manifest, 'utf8');
  return { manifestPath, allowBackup:false, usesCleartextTraffic:false };
}

async function main() {
  const [, , androidRoot] = process.argv;
  if (!androidRoot) throw new Error('USAGE: node tools/apply-android-security.mjs <android-root>');
  const result = await applyAndroidSecurityBaseline(androidRoot);
  console.log(JSON.stringify(result));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error(error?.stack || String(error));
    process.exitCode = 1;
  });
}
