import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../../', import.meta.url);
const read = (relative) => readFile(new URL(relative, root), 'utf8');

test('Capacitor shell contract is pinned to LIGHTHOUSE Android foundation', async () => {
  const pkg = JSON.parse(await read('android-shell/package.json'));
  const config = JSON.parse(await read('android-shell/capacitor.config.json'));

  assert.equal(config.appId, 'com.yggdrasil.lighthouse');
  assert.equal(config.appName, 'LIGHTHOUSE');
  assert.equal(config.webDir, 'www');
  assert.equal(pkg.dependencies['@capacitor/core'], '8.5.0');
  assert.equal(pkg.devDependencies['@capacitor/cli'], '8.5.0');
  assert.equal(pkg.devDependencies['@capacitor/android'], '8.5.0');
  assert.equal(pkg.scripts['android:debug'], 'cd android && ./gradlew assembleDebug');
});

test('foundation page stays local and excludes later-phase native scope', async () => {
  const html = await read('android-shell/www/index.html');
  assert.match(html, /LIGHTHOUSE APK Foundation Proof/);
  assert.doesNotMatch(html, /geolocation|google maps|api[_ -]?key|gps/i);
});

test('patch picker exposes all file types while runtime keeps patch validation', async () => {
  const html = await read('android-shell/www/index.html');
  const runtime = await read('android-shell/www/patch/patch-runtime.mjs');
  const picker = html.match(/<input\b[^>]*\bid=["']patch-file["'][^>]*>/i)?.[0];

  assert.ok(picker, 'patch file input must exist');
  assert.doesNotMatch(picker, /\baccept\s*=/i, 'native picker must not pre-filter file types');
  assert.match(runtime, /endsWith\(['"]\.lhpatch['"]\)/, 'runtime must still enforce .lhpatch extension');
  assert.match(runtime, /verifyPatchBundle\(/, 'runtime must still call signed patch verification');
});

test('GitHub Actions builds a debug APK but never deploys or publishes it', async () => {
  const workflow = await read('.github/workflows/lighthouse-apk-debug.yml');
  assert.match(workflow, /node-version:\s*22/);
  assert.match(workflow, /npx cap add android/);
  assert.match(workflow, /run:\s*npm run android:debug/);
  assert.match(workflow, /android-shell\/android\/app\/build\/outputs\/apk\/debug\/app-debug\.apk/);
  assert.match(workflow, /actions\/upload-artifact@v4/);
  assert.doesNotMatch(workflow, /\bdeploy\b|google[-_ ]?play|play[-_ ]?console|\bpublish\b/i);
});

test('operator README documents manual signed patch flow, rollback, and native APK boundary', async () => {
  const readme = await read('android-shell/README.md');
  assert.match(readme, /Manual Patch/i);
  assert.match(readme, /\.lhpatch/);
  assert.match(readme, /SHA-256/);
  assert.match(readme, /ECDSA/);
  assert.match(readme, /IndexedDB/);
  assert.match(readme, /Rollback/i);
  assert.match(readme, /native.*APK|APK.*native/i);
  assert.match(readme, /private key.*never.*repo|never.*private key.*repo/i);
  assert.match(readme, /automatic.*out of scope|out of scope.*automatic/i);
});
