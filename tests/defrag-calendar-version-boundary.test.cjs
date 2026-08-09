"use strict";

const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const root = path.resolve(__dirname, "..");
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");

test("calendar renderer does not depend on hidden cancelled counter DOM", () => {
  assert.doesNotMatch(app, /byId\(["']calCancelled["']\)\.textContent/);
});

test("core/data provenance version is named separately from product version", () => {
  assert.match(app, /const CORE_DATA_RELEASE_VERSION = ["']2\.1\.4["']/);
  assert.doesNotMatch(app, /const RELEASE_VERSION = ["']2\.1\.4["']/);
  assert.match(app, /releaseVersion:\s*CORE_DATA_RELEASE_VERSION/);
});
