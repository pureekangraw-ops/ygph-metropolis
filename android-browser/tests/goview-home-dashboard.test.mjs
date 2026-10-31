import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("GOVIEW Home is the sole launcher and preserves Map and Observe/Browser activities", () => {
  const manifest = read("app/src/main/AndroidManifest.xml");
  assert.match(
    manifest,
    /<activity android:name="\.home\.GoviewHomeActivity" android:exported="true">[\s\S]*?android\.intent\.action\.MAIN[\s\S]*?android\.intent\.category\.LAUNCHER[\s\S]*?<\/activity>/,
  );
  assert.match(manifest, /android:name="\.browser\.RemoteBrowserActivity" android:exported="true"/);
  assert.match(manifest, /android:name="\.outsideview\.OutsideViewActivity" android:exported="false"/);
  assert.equal((manifest.match(/android\.intent\.category\.LAUNCHER/g) || []).length, 1);

  const gradle = read("app/build.gradle.kts");
  assert.match(gradle, /applicationId = "com\.big\.gobrowser"/);
  assert.match(gradle, /versionCode = 19/);
});

test("Hub Home uses only fixed public health GET and delegates owner auth to Hub's browser UI", () => {
  const client = read("app/src/main/java/com/big/gobrowser/transport/HubHealthClient.kt");
  const activity = read("app/src/main/java/com/big/gobrowser/home/GoviewHomeActivity.kt");

  assert.match(client, /https:\/\/ygg-connection-hub-v2\.pureekangraw\.workers\.dev/);
  assert.match(client, /URL\("\$HUB_ORIGIN\/health"\)/);
  assert.match(client, /requestMethod = "GET"/);
  assert.match(client, /instanceFollowRedirects = false/);
  assert.doesNotMatch(client, /setRequestProperty\("Authorization"|\/api\/owner\//);
  assert.match(client, /Owner authentication, provider connectivity, pending approvals/);
  assert.doesNotMatch(client, /Hub connected|ownerAuthenticated\s*=\s*true/i);

  assert.match(activity, /Intent\(Intent\.ACTION_VIEW, Uri\.parse\(HubHealthClient\.HUB_UI_URL\)\)/);
  assert.match(activity, /Intent\(this, OutsideViewActivity::class\.java\)/);
  assert.match(activity, /Intent\(this, RemoteBrowserActivity::class\.java\)/);
  assert.match(activity, /top-level|ต้นทางในเบราว์เซอร์/);
  assert.doesNotMatch(activity, /WebView|\/api\/owner\/work-approvals|Authorization/);
});