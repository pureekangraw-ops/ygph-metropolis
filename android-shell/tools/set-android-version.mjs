import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

export function assertUpgradeVersion({ baselineVersionCode, candidateVersionCode }) {
  if (!Number.isInteger(baselineVersionCode) || !Number.isInteger(candidateVersionCode) || candidateVersionCode <= baselineVersionCode) {
    throw new Error('APK_VERSION_NOT_MONOTONIC');
  }
  return true;
}

export async function applyAndroidVersion({
  versionPath = new URL('../version.json', import.meta.url),
  gradlePath = new URL('../android/app/build.gradle', import.meta.url),
} = {}) {
  const version = JSON.parse(await readFile(versionPath, 'utf8'));
  if (!Number.isInteger(version.versionCode) || version.versionCode <= 0) {
    throw new Error('APK_VERSION_CODE_INVALID');
  }
  if (typeof version.versionName !== 'string' || version.versionName.trim() === '') {
    throw new Error('APK_VERSION_NAME_INVALID');
  }

  const before = await readFile(gradlePath, 'utf8');
  let after = before.replace(/versionCode\s+\d+/, `versionCode ${version.versionCode}`);
  after = after.replace(/versionName\s+["'][^"']+["']/, `versionName "${version.versionName}"`);

  if (after === before || !after.includes(`versionCode ${version.versionCode}`) || !after.includes(`versionName "${version.versionName}"`)) {
    throw new Error('APK_VERSION_APPLY_FAILED');
  }
  await writeFile(gradlePath, after, 'utf8');

  const readback = await readFile(gradlePath, 'utf8');
  if (!readback.includes(`versionCode ${version.versionCode}`) || !readback.includes(`versionName "${version.versionName}"`)) {
    throw new Error('APK_VERSION_READBACK_MISMATCH');
  }
  return version;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const version = await applyAndroidVersion();
  console.log(`Applied Android versionCode=${version.versionCode} versionName=${version.versionName}`);
}
