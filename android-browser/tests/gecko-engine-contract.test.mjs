import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const fromAndroid = fs.existsSync('android-browser') ? (p) => `android-browser/${p}` : (p) => p;
const fromRepo = fs.existsSync('android-browser') ? (p) => p : (p) => `../${p}`;
const readAndroid = (p) => fs.readFileSync(fromAndroid(p), 'utf8');
const readRepo = (p) => fs.readFileSync(fromRepo(p), 'utf8');

test('Observatory uses one GeckoRuntime and one GeckoSession per tab with encrypted recovery', () => {
  const engine = readAndroid('app/src/main/java/com/big/gobrowser/browser/GeckoBrowserEngine.kt');
  const recovery = readAndroid('app/src/main/java/com/big/gobrowser/browser/GeckoBrowserRecovery.java');
  assert.match(engine, /RuntimeHolder\.runtime/);
  assert.match(engine, /private val tabs = linkedMapOf/);
  assert.match(engine, /session\.open\(runtime\)/);
  assert.match(engine, /recovery\.read\(id\)/);
  assert.match(recovery, /AndroidKeyStore/);
  assert.match(recovery, /AES\/GCM\/NoPadding/);
});

test('Gecko observer uses all-frame WebExtension native messaging and omits input values', () => {
  const manifest = readAndroid('app/src/main/assets/observatory-observer/manifest.json');
  const observer = readAndroid('app/src/main/assets/observatory-observer/content-observer.js');
  assert.match(manifest, /"all_frames": true/);
  assert.match(manifest, /nativeMessagingFromContent/);
  assert.match(observer, /frameId/);
  assert.match(observer, /capturesInputValues: false/);
  assert.match(observer, /sendNativeMessage\('observatory_observer'/);
});

test('Gecko hand enforces capture, frame, visibility, password and signature checks', () => {
  const command = readAndroid('app/src/main/assets/command.js');
  const guard = readAndroid('app/src/main/java/com/big/gobrowser/control/CommandGuard.kt');
  assert.match(command, /STALE_CAPTURE/);
  assert.match(command, /FRAME_MISMATCH/);
  assert.match(command, /PASSWORD_TARGET_REJECTED/);
  assert.match(command, /TARGET_CHANGED/);
  assert.match(guard, /FRAME_MISMATCH/);
});

test('CI builds, tests, runs emulator acceptance and uploads named Gecko APK', () => {
  const workflow = readRepo('.github/workflows/android-browser.yml');
  const emulator = readAndroid('scripts/emulator-acceptance.sh');
  assert.match(emulator, /connectedDebugAndroidTest/);
  assert.match(workflow, /assembleDebug/);
  assert.match(workflow, /YGG-Observatory-Gecko\.apk/);
  assert.match(workflow, /observatory-emulator/);
});
