const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");

test("index loads the stable runtime files explicitly and in one order", () => {
  const html = read("index.html");
  const expected = [
    "highway-gate.js",
    "app.js",
    "flow-era.js",
    "flow-era-3.5.js",
    "metropolis-v4.js"
  ];

  let previous = -1;
  for (const file of expected) {
    const index = html.indexOf(`<script src="${file}"></script>`);
    assert.ok(index > previous, `${file} must be loaded explicitly after the prior runtime file`);
    previous = index;
  }

  for (const file of ["flow-era-3.5.css", "metropolis-v4.css"]) {
    assert.match(html, new RegExp(`<link rel="stylesheet" href="${file.replace(".", "\\.")}">`));
  }
});

test("service worker no longer rewrites HTML or forces activation during install", () => {
  const source = read("sw.js");
  const installStart = source.indexOf('addEventListener("install"');
  const activateStart = source.indexOf('addEventListener("activate"');
  const installBody = source.slice(installStart, activateStart);

  assert.ok(installStart >= 0, "install handler missing");
  assert.ok(activateStart > installStart, "activate handler missing");
  assert.doesNotMatch(installBody, /skipWaiting\s*\(/);
  assert.doesNotMatch(source, /inject|replaceAll\s*\(/i);
  assert.match(source, /ACTIVATE_UPDATE/);
  assert.match(source, /ROLLBACK_UPDATE/);
  assert.match(source, /GET_UPDATE_STATUS/);
});

test("activation keeps one previous app cache and cleanup ignores unrelated caches", () => {
  const {
    APP_CACHE_PREFIX,
    planActivation,
    planRollback,
    obsoleteAppCaches
  } = require("../sw.js");

  const oldCache = `${APP_CACHE_PREFIX}old`;
  const newCache = `${APP_CACHE_PREFIX}new`;
  const olderCache = `${APP_CACHE_PREFIX}older`;
  const activated = planActivation(
    { current: oldCache, serving: oldCache, previous: null },
    newCache
  );

  assert.deepEqual(
    { current: activated.current, serving: activated.serving, previous: activated.previous },
    { current: newCache, serving: newCache, previous: oldCache }
  );

  const rolledBack = planRollback(activated);
  assert.equal(rolledBack.serving, oldCache);
  assert.equal(rolledBack.current, newCache);
  assert.equal(rolledBack.previous, oldCache);

  assert.deepEqual(
    obsoleteAppCaches(
      [olderCache, oldCache, newCache, "workbox-external", "another-app-cache"],
      activated
    ),
    [olderCache]
  );
});

test("first safe activation never advertises a legacy mixed cache as rollback", () => {
  const serviceWorker = require("../sw.js");
  const activated = serviceWorker.planActivation({}, serviceWorker.CURRENT_CACHE);

  assert.equal(activated.current, serviceWorker.CURRENT_CACHE);
  assert.equal(activated.serving, serviceWorker.CURRENT_CACHE);
  assert.equal(activated.previous, null);
  assert.equal(typeof serviceWorker.legacyCacheCandidate, "undefined");

  const source = read("sw.js");
  const activateStart = source.indexOf('addEventListener("activate"');
  const messageStart = source.indexOf('addEventListener("message"');
  assert.doesNotMatch(source.slice(activateStart, messageStart), /legacyCacheCandidate|ygph-metropolis-(?!app-)/);
});

test("offline app shell contains every stable local asset", () => {
  const { APP_SHELL } = require("../sw.js");
  assert.ok(APP_SHELL.includes("./"));
  assert.ok(APP_SHELL.includes("index.html"));
  for (const asset of APP_SHELL.filter(item => item !== "./")) {
    assert.equal(asset.includes("?"), false, `${asset} must keep a stable path without a version query`);
    assert.equal(fs.existsSync(path.join(root, asset)), true, `${asset} is missing from the upload set`);
  }
});

test("failed shell read-back blocks install and offline navigation resolves to cached index", () => {
  const { APP_SHELL, assertShellReadback, offlineLookupKeys } = require("../sw.js");
  const complete = APP_SHELL.map(() => ({ ok: true }));
  assert.equal(assertShellReadback(complete), true);

  const incomplete = [...complete];
  incomplete[2] = undefined;
  assert.throws(() => assertShellReadback(incomplete), /ออฟไลน์ไม่ครบ/);
  assert.deepEqual(offlineLookupKeys({ mode: "navigate" }), ["index.html", "./"]);
  const assetRequest = { mode: "same-origin", url: "https://example.test/app.js" };
  assert.deepEqual(offlineLookupKeys(assetRequest), [assetRequest]);
});
