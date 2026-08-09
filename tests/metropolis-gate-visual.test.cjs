"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");

const index = read("index.html");
const v4 = read("metropolis-v4.js");
const css = read("metropolis-r5-4.css");
const sw = require("../sw.js");
const manifest = JSON.parse(read("RELEASE_MANIFEST.json"));

function gateSource(id) {
  return index.match(new RegExp(`<section id="${id}"[\\s\\S]*?<\\/section>`))?.[0] || "";
}

test("Setup and Unlock gates use METROPOLIS as the primary brand with the YGPH signature", () => {
  for (const id of ["setupScreen", "unlockScreen"]) {
    const source = gateSource(id);
    assert.match(source, /data-metropolis-brand-mark/);
    assert.match(source, />METROPOLIS<\/h1>/);
    assert.match(source, /by YGPH — Yggdrasil Personal Helper/);
    assert.doesNotMatch(source, /🌳|🌿|YGPH METROPOLIS/);
  }
});

test("gate brand marks hydrate from the shared app glyph instead of carrying a second icon authority", () => {
  assert.match(v4, /querySelectorAll\("\[data-metropolis-brand-mark\]"\)/);
  assert.match(v4, /metropolisIcon\("app"\)/);
});

test("authoritative visual CSS brings security gates into the METROPOLIS dark system", () => {
  assert.match(css, /\.metropolis-v4 \.gate\s*\{/);
  assert.match(css, /\.metropolis-v4 \.gate-card\s*\{/);
  assert.match(css, /\.metropolis-v4 \.gate-icon/);
  assert.match(css, /\.metropolis-v4 \.gate \.field input/);
  assert.match(css, /background:\s*var\(--ygph-deep\)!important/);
  assert.match(css, /color:\s*var\(--ygph-white\)!important/);
});

test("gate visual rollout advances the offline publication generation", () => {
  const expected = "v4.2.4-20260809-r19-gate-visual-authority";
  assert.equal(sw.RELEASE_ID, expected);
  assert.equal(manifest.serviceWorker.releaseId, expected);
});
