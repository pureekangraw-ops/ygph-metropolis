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


test('GO OAuth callback is intercepted before Gecko loads the non-page callback URL', () => {
  const engine = readAndroid('app/src/main/java/com/big/gobrowser/browser/GeckoBrowserEngine.kt');
  const activity = readAndroid('app/src/main/java/com/big/gobrowser/browser/GeckoBrowserActivity.kt');
  const client = readAndroid('app/src/main/java/com/big/gobrowser/transport/MetropolisMcpClient.kt');
  assert.match(engine, /override fun onLoadRequest/);
  assert.match(engine, /onNavigationIntercept\(tab, request\.uri\)/);
  assert.match(engine, /AllowOrDeny\.DENY/);
  assert.match(client, /HUB_OAUTH_STATE_MISMATCH/);
  assert.match(client, /\/oauth\/observatory-callback/);
  assert.match(activity, /pairObservatory\(\)/);
  assert.match(activity, /engine\.navigate\(BrowserSettings\.OBSERVATORY_HOME_URL\)/);
});

test('Gecko starts at Observatory map while API origin remains only for GO OAuth', () => {
  const engine = readAndroid('app/src/main/java/com/big/gobrowser/browser/GeckoBrowserEngine.kt');
  const settings = readAndroid('app/src/main/java/com/big/gobrowser/browser/BrowserSettings.kt');
  const activity = readAndroid('app/src/main/java/com/big/gobrowser/browser/GeckoBrowserActivity.kt');
  assert.match(engine, /fun open\(url: String = BrowserSettings\.OBSERVATORY_HOME_URL/);
  assert.match(settings, /https:\/\/observatory-web\.pureekangraw\.workers\.dev\//);
  assert.match(activity, /restored == MetropolisMcpClient\.ISSUER/);
  assert.match(activity, /"เชื่อมต่อ"/);
  assert.doesNotMatch(activity, /GeckoView .*\$\{if \(foreground\) "LIVE"/);
});


test('Observatory version stamp appears on browser and map and is sourced from CI checkout', () => {
  const gradle = readAndroid('app/build.gradle.kts');
  const stamp = readAndroid('app/src/main/java/com/big/gobrowser/ui/ObservatoryBuildStamp.kt');
  const browser = readAndroid('app/src/main/java/com/big/gobrowser/browser/GeckoBrowserActivity.kt');
  const map = readAndroid('app/src/main/java/com/big/gobrowser/outsideview/OutsideViewActivity.kt');
  const workflow = readRepo('.github/workflows/android-browser.yml');
  assert.match(gradle, /versionName = "0\.6\.1"/);
  assert.match(gradle, /versionCode = 11/);
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

test('connection diagnostics expose safe pairing evidence and require credential readback', () => {
  const activity = readAndroid('app/src/main/java/com/big/gobrowser/browser/GeckoBrowserActivity.kt');
  assert.match(activity, /val actor = hubArrival\?\.actor \?: "ยังไม่เชื่อมต่อ"/);
  assert.match(activity, /val eligibleWorks = hubArrival\?\.observatoryWorks\?\.size\?\.toString\(\) \?: "ยังไม่ตรวจ"/);
  assert.match(activity, /val pairState = pair\?\.let \{ "จับคู่แล้ว · …\$\{it\.workId\.takeLast\(8\)\}" \} \?: "ยังไม่จับคู่"/);
  assert.match(activity, /Hub: \$actor · Work หอดูดาวที่อ่านได้: \$eligibleWorks · การจับคู่: \$pairState · ผลล่าสุด:/);
  assert.match(activity, /safeConnectionCode\(/);
  assert.match(activity, /saved == null \|\| saved\.deviceId != pair\.deviceId/);
  assert.match(activity, /metropolis\.pairObservatory\(""\)/);
  assert.match(activity, /saved\.deviceId != pair\.deviceId/);
  assert.match(activity, /saved\.publishSnapshot != pair\.publishSnapshot/);
  assert.doesNotMatch(activity, /connectionDiagnostics\.text\s*=\s*.*(?:token|response\.body)/i);
});


test('new Observatory connection diagnostics are Thai and keep safe status codes', () => {
  const activity = readAndroid('app/src/main/java/com/big/gobrowser/browser/GeckoBrowserActivity.kt');
  assert.match(activity, /Work หอดูดาวที่อ่านได้:/);
  assert.match(activity, /การจับคู่: \$pairState · ผลล่าสุด:/);
  assert.match(activity, /private fun connectionStatusLabel\(code: String\)/);
  assert.match(activity, /"HTTP_406_ACCEPT_REQUIRED" -> "Hub ปฏิเสธรูปแบบคำขอ \(406\)"/);
  assert.match(activity, /return "\$message \[\$code\]"/);
  assert.doesNotMatch(activity, /connectionDiagnostics\.text\s*=\s*.*(?:token|response\.body)/i);
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

test('PANTHEON WorkHub bridge uses explicit owner approval and verifies queue readback', () => {
  const handoff = readAndroid('app/src/main/java/com/big/gobrowser/transport/PantheonWorkHubHandoff.kt');
  const browser = readAndroid('app/src/main/java/com/big/gobrowser/browser/GeckoBrowserActivity.kt');
  const map = readAndroid('app/src/main/java/com/big/gobrowser/outsideview/OutsideViewActivity.kt');
  assert.match(handoff, /phatheon-workhub\.pureekangraw\.workers\.dev\/v1\/intent/);
  assert.match(handoff, /setPositiveButton\("ส่งเข้าคิว", null\)/);
  assert.match(handoff, /"CREATE_TASK"/);
  assert.match(handoff, /"SHOW_TASK"/);
  assert.match(handoff, /"QUEUED"/);
  assert.match(handoff, /readback\.optString\("request_text"\) == request/);
  assert.match(handoff, /tokenInput\.text\.clear\(\)/);
  assert.doesNotMatch(handoff, /putExtra\([^\n]*token|SharedPreferences|credential\.save/);
  assert.match(browser, /"ส่งเข้า PANTHEON"/);
  assert.match(browser, /PantheonWorkHubHandoff\.present\(this, "WEB"/);
  assert.match(map, /PantheonWorkHubHandoff\.present\(this, "MAP"/);
  assert.match(browser, /"เชื่อมต่อใหม่", "ยกเลิกการเชื่อมต่อ"/);
});
