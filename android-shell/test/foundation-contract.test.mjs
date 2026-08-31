import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../../', import.meta.url);

async function read(path) {
  return readFile(new URL(path, root), 'utf8');
}

test('Capacitor shell contract is pinned to LIGHTHOUSE Android foundation', async () => {
  const [pkg, config] = await Promise.all([
    read('android-shell/package.json').then(JSON.parse),
    read('android-shell/capacitor.config.json').then(JSON.parse),
  ]);
  assert.equal(pkg.dependencies['@capacitor/core'], '8.5.0');
  assert.equal(pkg.devDependencies['@capacitor/android'], '8.5.0');
  assert.equal(pkg.devDependencies['@capacitor/cli'], '8.5.0');
  assert.equal(config.appId, 'com.yggdrasil.lighthouse');
  assert.equal(config.appName, 'LIGHTHOUSE');
  assert.equal(config.webDir, 'www');
});

test('remote patch traffic is routed through Capacitor native HTTP', async () => {
  const runtime = await read('android-shell/www/patch/patch-runtime.mjs');
  assert.match(runtime, /CapacitorHttp/);
});

test('foundation page stays local and excludes later-phase native scope', async () => {
  const html = await read('android-shell/www/index.html');
  assert.doesNotMatch(html, /maps?|geolocation|notifications?/i);
});

test('patch picker exposes all file types while runtime keeps patch validation', async () => {
  const [html, runtime] = await Promise.all([
    read('android-shell/www/index.html'),
    read('android-shell/www/patch/patch-runtime.mjs'),
  ]);
  const picker = html.match(/<input\b[^>]*\bid=["']patch-file["'][^>]*>/i)?.[0];

  assert.ok(picker, 'patch file input must exist');
  assert.doesNotMatch(picker, /\baccept\s*=/i, 'native picker must not pre-filter file types');
  assert.match(runtime, /endsWith\(['"]\.lhpatch['"]\)/, 'runtime must still enforce .lhpatch extension');
  assert.match(runtime, /verifyPatchBundle\(/, 'runtime must still call signed patch verification');
});

test('GitHub Actions builds a canonical verified APK but never deploys or publishes it', async () => {
  const workflow = await read('.github/workflows/lighthouse-apk-debug.yml');
  assert.match(workflow, /node-version:\s*22/);
  assert.match(workflow, /npx cap add android/);
  assert.match(workflow, /run:\s*npm run android:release/);
  assert.match(workflow, /android-shell\/android\/app\/build\/outputs\/apk\/release\/lighthouse-release\.apk/);
  assert.match(workflow, /Verify final APK identity/);
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
  assert.match(readme, /APK/i);
});
