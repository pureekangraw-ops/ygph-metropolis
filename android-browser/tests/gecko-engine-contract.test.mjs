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
  assert.match(activity, /button\("เชื่อม GO"\)/);
  assert.doesNotMatch(activity, /GeckoView .*\$\{if \(foreground\) "LIVE"/);
});


test('Observatory version stamp appears on browser and map and is sourced from CI checkout', () => {
  const gradle = readAndroid('app/build.gradle.kts');
  const stamp = readAndroid('app/src/main/java/com/big/gobrowser/ui/ObservatoryBuildStamp.kt');
  const browser = readAndroid('app/src/main/java/com/big/gobrowser/browser/GeckoBrowserActivity.kt');
  const map = readAndroid('app/src/main/java/com/big/gobrowser/outsideview/OutsideViewActivity.kt');
  const workflow = readRepo('.github/workflows/android-browser.yml');
  assert.match(gradle, /versionName = "0\.4\.2"/);
  assert.match(gradle, /versionCode = 5/);
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



test('legacy Metropolis API-root tab is redirected to the Observatory UI before GeckoView attaches', () => {
  const activity = readAndroid('app/src/main/java/com/big/gobrowser/browser/GeckoBrowserActivity.kt');
  const engine = readAndroid('app/src/main/java/com/big/gobrowser/browser/GeckoBrowserEngine.kt');
  const restore = activity.indexOf('engine.restore()');
  const restoredUrl = activity.indexOf('val restored = engine.active()?.requestedUrl.orEmpty().trimEnd('/')', restore);
  const redirect = activity.indexOf('if (restored == MetropolisMcpClient.ISSUER) engine.navigate(BrowserSettings.OBSERVATORY_HOME_URL)', restoredUrl);
  const attach = activity.indexOf('engine.attach(geckoView)', redirect);
  assert.ok(restore >= 0 && restoredUrl > restore && redirect > restoredUrl && attach > redirect,
    'legacy API-root recovery must be corrected before GeckoView is attached');
  assert.match(engine, /fun open\(url: String = BrowserSettings\.OBSERVATORY_HOME_URL/);
});

test('CI fixes runner drift and uses actions whose manifests declare Node 24', () => {
  const workflow = readRepo('.github/workflows/android-browser.yml');
  assert.equal((workflow.match(/runs-on: ubuntu-24\.04/g) || []).length, 2);
  assert.equal((workflow.match(/actions\/upload-artifact@v7/g) || []).length, 3);
  assert.equal((workflow.match(/gradle\/actions\/setup-gradle@v6/g) || []).length, 2);
  assert.doesNotMatch(workflow, /ubuntu-latest|upload-artifact@v4|setup-gradle@v4/);
});
