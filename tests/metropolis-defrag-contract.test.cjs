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

test("dashboard metrics take cash as explicit input instead of reading unrelated global state", () => {
  const r54 = read("metropolis-r5-4.js");
  const runtime = require("../metropolis-r5-4.js");
  const previousBalance = global.currentBalanceSatang;
  global.currentBalanceSatang = () => 999999;
  try {
    const metrics = runtime.r54Metrics({ store: { stockQty: 2 }, calendar: [] }, "2026-08-09", 12345);
    assert.equal(metrics.cashSatang, 12345);
  } finally {
    if (previousBalance === undefined) delete global.currentBalanceSatang;
    else global.currentBalanceSatang = previousBalance;
  }
  const metricsBody = r54.match(/function r54Metrics\([^)]*\)\s*\{([\s\S]*?)\n\}/)?.[1] || "";
  assert.doesNotMatch(metricsBody, /currentBalanceSatang/,
    "r54Metrics must not silently read cash from global state");
});

test("post-render extensions use the runtime hook bus instead of stacked render wrappers and DOM observers", () => {
  const flow = read("flow-era.js");
  assert.match(flow, /YGPHRuntime\.run\("afterRender"/,
    "FLOW must dispatch the canonical post-render hook");

  const r5 = read("metropolis-r5.js");
  assert.match(r5, /YGPHRuntime\.register\("METROPOLIS_R5"[\s\S]*afterRender/,
    "R5 must subscribe to afterRender");
  assert.doesNotMatch(r5, /renderAll\s*=\s*function/,
    "R5 must not wrap renderAll for post-render work");

  for (const file of ["metropolis-r5-1.js", "metropolis-r5-2.js", "metropolis-r5-3.js", "metropolis-r5-4.js"]) {
    const source = read(file);
    assert.match(source, /YGPHRuntime\.register\(/, `${file} must subscribe to the runtime hook bus`);
    assert.doesNotMatch(source, /new MutationObserver\(/,
      `${file} must not watch the whole DOM to discover renders`);
  }
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
