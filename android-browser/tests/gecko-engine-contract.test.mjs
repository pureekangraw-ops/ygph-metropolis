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


test('PANTHEON device pairing is direct and the old OAuth client is not used by the Gecko launcher', () => {
  const activity=readAndroid('app/src/main/java/com/big/gobrowser/browser/GeckoBrowserActivity.kt');
  const client=readAndroid('app/src/main/java/com/big/gobrowser/transport/PantheonObservatoryClient.kt');
  const map=readAndroid('app/src/main/java/com/big/gobrowser/outsideview/ObservatoryMapShare.kt');
  const settings=readAndroid('app/src/main/java/com/big/gobrowser/browser/BrowserSettings.kt');
  assert.match(settings,/observatory-web\\.pureekangraw\\.workers\\.dev/);
  assert.match(client,/phatheon-workhub\\.pureekangraw\\.workers\\.dev\\/v1\\/observatory/);
  assert.match(client,/AndroidDeviceCredentialStore/);
  assert.match(client,/credentials\\.load\\(\\) == token/);
  assert.match(client,/scope/);
  assert.match(activity,/pantheon\\.pair\\(ownerToken\\)/);
  assert.match(activity,/pantheon\\.publishSnapshot\\("browser", wire\\)/);
  assert.match(map,/client\\.publishSnapshot\\("map", snapshot\\)/);
  assert.doesNotMatch(activity,/metropolis\\.authorizationUrl|metropolis\\.publishSnapshot|metropolis\\.pairObservatory/);
  assert.doesNotMatch(map,/MetropolisMcpClient/);
});

test('Observatory version stamp appears on browser and map and is sourced from CI checkout', () => {
  const gradle = readAndroid('app/build.gradle.kts');
  const stamp = readAndroid('app/src/main/java/com/big/gobrowser/ui/ObservatoryBuildStamp.kt');
  const browser = readAndroid('app/src/main/java/com/big/gobrowser/browser/GeckoBrowserActivity.kt');
  const map = readAndroid('app/src/main/java/com/big/gobrowser/outsideview/OutsideViewActivity.kt');
  const workflow = readRepo('.github/workflows/android-browser.yml');
  assert.match(gradle, /versionName = "0\.6\.1"/);
  assert.match(gradle, /versionCode = 12/);
  assert.match(gradle, /buildConfigField\("String", "SOURCE_COMMIT"/);
  assert.match(gradle, /buildConfigField\("String", "BUILD_RUN_ID"/);
  assert.match(stamp, /BuildConfig\.VERSION_NAME/);
  assert.match(stamp, /BuildConfig\.SOURCE_COMMIT/);
  assert.match(stamp, /BuildConfig\.BUILD_RUN_ID/);
  assert.match(stamp, /setOnLongClickListener/);
  assert.match(browser, /root\.addView\(ObservatoryBuildStamp\.view\(this\)\)/);
  assert.match(browser, /ObserverSession\("local-device", "\$\{BuildConfig\.VERSION_NAME\}-gecko"\)/);
  assert.match(map, /root\.addView\(ObservatoryBuildStamp\.view\(this\)\)/);
  assert.match(workflow, /OBSERVATORY_SOURCE_SHA: \$\{\{ github\.event\.pull_request\.head\.sha \|\| github\.sha \}\}/);
  assert.match(workflow, /OBSERVATORY_BUILD_RUN_ID: \$\{\{ github\.run_id \}\}/);
  assert.equal((workflow.match(/ref: \$\{\{ github\.event\.pull_request\.head\.sha \|\| github\.sha \}\}/g) || []).length, 2);
});

test('connection diagnostics show safe PANTHEON status and never reveal credentials', () => {
  const activity=readAndroid('app/src/main/java/com/big/gobrowser/browser/GeckoBrowserActivity.kt');
  assert.match(activity,/connectionDiagnostics\\.text = "PANTHEON/);
  assert.match(activity,/PAIR_READBACK_OK/);
  assert.match(activity,/PANTHEON รับข้อมูลแล้ว/);
  assert.doesNotMatch(activity,/connectionDiagnostics\\.text\\s*=\\s*.*(?:token|response\\.body)/i);
});

test('Gecko browser connects Android activity results for WebAuthn', () => {
  const activity = readAndroid('app/src/main/java/com/big/gobrowser/browser/GeckoBrowserActivity.kt');
  assert.match(activity, /setActivityDelegate\(activityBridge\)/);
  assert.match(activity, /activityBridge\.onActivityResult/);
});

test('map image sharing uses MapLibre snapshot and private cache FileProvider',()=>{
  const renderer=readAndroid('app/src/main/java/com/big/gobrowser/outsideview/MapLibreOutsideRenderer.kt');
  const map=readAndroid('app/src/main/java/com/big/gobrowser/outsideview/OutsideViewActivity.kt');
  const manifest=readAndroid('app/src/main/AndroidManifest.xml');
  const paths=readAndroid('app/src/main/res/xml/observatory_share_paths.xml');
  assert.match(renderer,/fun snapshotBitmap/);
  assert.match(renderer,/current\.snapshot/);
  assert.match(map,/shareVisibleMapImage\(\)/);
  assert.match(map,/Intent\.ACTION_SEND/);
  assert.match(map,/FLAG_GRANT_READ_URI_PERMISSION/);
  assert.match(manifest,/androidx\.core\.content\.FileProvider/);
  assert.match(paths,/<cache-path/);
  assert.doesNotMatch(paths,/<external-path/);
});

test('foreground observe-only handoff and local encrypted owner archives', () => {
  const activity=readAndroid('app/src/main/java/com/big/gobrowser/browser/GeckoBrowserActivity.kt');
  const map=readAndroid('app/src/main/java/com/big/gobrowser/outsideview/OutsideViewActivity.kt');
  const local=readAndroid('app/src/main/java/com/big/gobrowser/ui/ObservatoryMemoryDialog.kt');
  const client=readAndroid('app/src/main/java/com/big/gobrowser/transport/PantheonObservatoryClient.kt');
  assert.match(activity,/handler\\.postDelayed\\(this, 5_000L\\)/);
  assert.match(activity,/if \\(!foreground/);
  assert.match(map,/mapShare\\.stop\\(\\)/);
  assert.match(local,/AndroidDeviceCredentialStore/);
  assert.match(client,/\\/disconnect/);
  assert.doesNotMatch(activity,/PantheonWorkHubHandoff\\.present/);
  assert.doesNotMatch(map,/PantheonWorkHubHandoff\\.present/);
});
\n]*token|SharedPreferences|credential\.save/);
  assert.match(browser, /"ส่งเข้า PANTHEON"/);
  assert.match(browser, /PantheonWorkHubHandoff\.present\(this, "WEB"/);
  assert.match(map, /PantheonWorkHubHandoff\.present\(this, "MAP"/);
  assert.match(browser, /"เชื่อมต่อใหม่", "ยกเลิกการเชื่อมต่อ"/);
});
