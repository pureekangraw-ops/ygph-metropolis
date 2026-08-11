"use strict";

const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const sw = require("../sw.js");
const manifest = JSON.parse(read("RELEASE_MANIFEST.json"));
const r53 = read("metropolis-r5-3.js");

test("service worker generation advances for the current Metropolis release", () => {
  assert.equal(sw.RELEASE_ID, manifest.serviceWorker.releaseId);
  assert.match(sw.RELEASE_ID, /^v4\.2\.5-/);
});

test("release manifest describes the current Calendar contract, not the old hidden-node workaround", () => {
  const safety = manifest.safety.join("\n");
  assert.doesNotMatch(safety, /calCancelled counter node remains mounted/i);
  assert.match(safety, /Calendar source HTML omits cancelled counter and cancelled filter/i);
});

test("R5-3 no longer carries dead cleanup for removed cancelled controls", () => {
  assert.doesNotMatch(r53, /function hideCancelledControls/);
  assert.doesNotMatch(r53, /data-filter=\"CANCELLED\"/);
  assert.doesNotMatch(r53, /getElementById\(\"calCancelled\"\)/);
});