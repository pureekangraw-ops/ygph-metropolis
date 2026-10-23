import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const file = p => fs.readFileSync((fs.existsSync('android-browser')?'android-browser/':'')+p,'utf8');
const root = p => fs.readFileSync((fs.existsSync('android-browser')?'':'../')+p,'utf8');

test('Gecko engine and encrypted restore are intact',()=>{
  const e=file('app/src/main/java/com/big/gobrowser/browser/GeckoBrowserEngine.kt');
  const r=file('app/src/main/java/com/big/gobrowser/browser/GeckoBrowserRecovery.java');
  assert.match(e,/RuntimeHolder\.runtime/);
  assert.match(e,/session\.open\(runtime\)/);
  assert.match(r,/AndroidKeyStore/);
  assert.match(r,/AES\/GCM\/NoPadding/);
});

test('frame-aware observer does not capture input field values',()=>{
  const manifest=file('app/src/main/assets/observatory-observer/manifest.json');
  const observer=file('app/src/main/assets/observatory-observer/content-observer.js');
  assert.match(manifest,/"all_frames": true/);
  assert.match(manifest,/nativeMessagingFromContent/);
  assert.match(observer,/capturesInputValues: false/);
});

test('browser guard enforces capture, frame, and protected targets',()=>{
  const code=file('app/src/main/assets/command.js');
  assert.match(code,/STALE_CAPTURE/);
  assert.match(code,/FRAME_MISMATCH/);
  assert.match(code,/PASSWORD_TARGET_REJECTED/);
  assert.match(code,/TARGET_CHANGED/);
});

test('direct PANTHEON token is scoped and encrypted; Metro OAuth is not invoked',()=>{
  const app=file('app/src/main/java/com/big/gobrowser/browser/GeckoBrowserActivity.kt');
  const client=file('app/src/main/java/com/big/gobrowser/transport/PantheonObservatoryClient.kt');
  const map=file('app/src/main/java/com/big/gobrowser/outsideview/ObservatoryMapShare.kt');
  assert.match(client,/phatheon-workhub\.pureekangraw\.workers\.dev\/v1\/observatory/);
  assert.match(client,/AndroidDeviceCredentialStore/);
  assert.match(client,/credentials\.load\(\) == token/);
  assert.match(client,/observatory:observe-only/);
  assert.match(app,/pantheon\.pair\(ownerToken\)/);
  assert.match(app,/pantheon\.publishSnapshot\("browser", wire\)/);
  assert.match(map,/client\.publishSnapshot\("map", snapshot\)/);
  assert.doesNotMatch(app,/metropolis\.authorizationUrl|metropolis\.publishSnapshot|metropolis\.pairObservatory/);
  assert.doesNotMatch(map,/MetropolisMcpClient/);
});

test('PANTHEON uploads happen only after owner tap; pause always stops',()=>{
  const app=file('app/src/main/java/com/big/gobrowser/browser/GeckoBrowserActivity.kt');
  const map=file('app/src/main/java/com/big/gobrowser/outsideview/OutsideViewActivity.kt');
  const share=file('app/src/main/java/com/big/gobrowser/outsideview/ObservatoryMapShare.kt');
  assert.match(app,/button\("ส่งให้ GO"\) \{ sendSnapshotManually\(\) \}/);
  assert.match(app,/private fun sendSnapshotManually\(\)/);
  assert.doesNotMatch(app,/handler\.postDelayed\(this, 5_000L\)|startAutomaticObservation|handler\.post\(tick\)/);
  assert.match(app,/override fun onPause\(\).*stopSharing\(\)/);
  assert.doesNotMatch(map,/mapShare\.captureOnce\(\)/);
  assert.match(map,/selectSnapshot\(\)/);
  assert.doesNotMatch(map,/mapShare\.start\(\)/);
  assert.match(map,/mapShare\.stop\(\)/);
  assert.match(share,/fun captureOnce\(\): Boolean/);
  assert.doesNotMatch(share,/postDelayed|handler\.post\(loop\)/);
});

test('saved evidence is encrypted separately from ephemeral cloud snapshots',()=>{
  const archive=file('app/src/main/java/com/big/gobrowser/ui/ObservatoryMemoryDialog.kt');
  assert.match(archive,/AndroidDeviceCredentialStore/);
  assert.match(archive,/getString|credential\.save|records\.toString/);
  assert.doesNotMatch(archive,/MetropolisMcpClient/);
});

test('status messages report PANTHEON only, not owner credentials',()=>{
  const app=file('app/src/main/java/com/big/gobrowser/browser/GeckoBrowserActivity.kt');
  assert.match(app,/connectionDiagnostics\.text = "PANTHEON/);
  assert.match(app,/PAIR_READBACK_OK/);
  assert.doesNotMatch(app,/connectionDiagnostics\.text\s*=\s*.*(?:token|response\.body)/i);
});

test('build provenance and upgrade identity remain stable',()=>{
  const gradle=file('app/build.gradle.kts');
  const stamp=file('app/src/main/java/com/big/gobrowser/ui/ObservatoryBuildStamp.kt');
  const workflow=root('.github/workflows/android-browser.yml');
  const browser=file('app/src/main/java/com/big/gobrowser/browser/GeckoBrowserActivity.kt');
  assert.match(gradle,/applicationId = "com\.big\.gobrowser"/);
  assert.match(gradle,/versionName = "0\.6\.5"/);
  assert.match(gradle,/versionCode = 15/);
  assert.match(stamp,/BuildConfig\.SOURCE_COMMIT/);
  assert.match(stamp,/BuildConfig\.BUILD_RUN_ID/);
  assert.match(browser,/ObserverSession\("local-device", "\$\{BuildConfig\.VERSION_NAME\}-gecko"\)/);
  assert.match(workflow,/assembleDebug/);
  assert.match(workflow,/YGG-Observatory-Gecko\.apk/);
  assert.match(workflow,/observatory-emulator/);
});

test('real map screenshot remains exportable via private provider',()=>{
  const map=file('app/src/main/java/com/big/gobrowser/outsideview/OutsideViewActivity.kt');
  const paths=file('app/src/main/res/xml/observatory_share_paths.xml');
  assert.match(map,/shareVisibleMapImage\(\)/);
  assert.match(map,/FLAG_GRANT_READ_URI_PERMISSION/);
  assert.match(paths,/<cache-path/);
  assert.doesNotMatch(paths,/<external-path/);
});

test('local assistance remains owner-confirmed with no remote PANTHEON commands',()=>{
  const app=file('app/src/main/java/com/big/gobrowser/browser/GeckoBrowserActivity.kt');
  const client=file('app/src/main/java/com/big/gobrowser/transport/PantheonObservatoryClient.kt');
  assert.match(app,/showOwnerAssist\(\)/);
  assert.match(app,/executeOwnerAssist\(/);
  assert.doesNotMatch(client,/pollCommands|runTask|\/v1\/tasks\/.*\/run/);
});
