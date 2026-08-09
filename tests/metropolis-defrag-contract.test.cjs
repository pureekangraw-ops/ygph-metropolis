"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");

test("4.2 runtime layers share one visible product-version authority instead of monkey-patching writers", () => {
  const r52 = read("metropolis-r5-2.js");
  const r54 = read("metropolis-r5-4.js");

  assert.match(r52, /YGPH_METROPOLIS_PRODUCT_VERSION/,
    "R5-2 must read the shared visible product-version authority");
  assert.match(r54, /YGPH_METROPOLIS_PRODUCT_VERSION/,
    "R5-4 must claim the shared visible product-version authority");
  assert.doesNotMatch(r54, /applyProductVersion42\s*=\s*function/,
    "newer layers must not replace older local writer functions");
});

test("production manifest, Cloudflare allowlist, and offline shell cannot drift apart", () => {
  const manifest = JSON.parse(read("RELEASE_MANIFEST.json"));
  const { APP_SHELL } = require("../sw.js");
  const productionFiles = manifest.productionFiles.map(item => item.path).sort();

  const allowlist = read(".assetsignore")
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.startsWith("!/") && line.length > 2)
    .map(line => line.slice(2))
    .sort();

  assert.deepEqual(allowlist, productionFiles,
    ".assetsignore must publish every and only declared production file");

  const expectedShell = productionFiles.filter(file => file !== "sw.js").sort();
  const actualShell = APP_SHELL.filter(file => file !== "./").sort();
  assert.deepEqual(actualShell, expectedShell,
    "Service Worker shell must cache every declared production file except sw.js itself");
});
