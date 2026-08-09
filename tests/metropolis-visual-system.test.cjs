"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");

const v4 = read("metropolis-v4.js");
const r54 = read("metropolis-r5-4.js");
const css = read("metropolis-r5-4.css");
const index = read("index.html");
const manifest = JSON.parse(read("manifest.webmanifest"));
const sw = read("sw.js");

function r54MetricsBody() {
  return r54.match(/function r54Metrics\([\s\S]*?\n\}/)?.[0] || "";
}

test("METROPOLIS stays primary and YGPH is the signature", () => {
  assert.match(v4, /const METROPOLIS_DISPLAY_NAME\s*=\s*"METROPOLIS"/);
  assert.match(v4, /const METROPOLIS_SIGNATURE\s*=\s*"by YGPH — Yggdrasil Personal Helper"/);
  assert.match(v4, /brandTitle\.textContent\s*=\s*METROPOLIS_DISPLAY_NAME/);
  assert.match(v4, /brandSub\.textContent\s*=\s*METROPOLIS_SIGNATURE/);
});

test("core METROPOLIS icons come from one SVG glyph registry", () => {
  assert.match(v4, /const METROPOLIS_GLYPHS\s*=\s*Object\.freeze\(/);
  assert.match(v4, /function metropolisGlyph\(/);
  for (const name of ["home", "store", "ride", "ledger", "calendar", "settings", "wallet", "stock", "task", "payment", "chevron"]) {
    assert.match(v4, new RegExp(`${name}:\\s*`), `missing ${name} glyph`);
  }
  assert.doesNotMatch(v4, /<span class="metropolis-emoji"[^>]*>\$\{meta\.emoji\}<\/span>/);
});

test("bottom navigation contains exactly the five approved destinations", () => {
  assert.match(v4, /id\s*=\s*"metropolisBottomNav"|bar\.id\s*=\s*"metropolisBottomNav"/);
  const navTargets = [...v4.matchAll(/data-metropolis-nav=["'](home|store|ride|ledger|calendar|settings)["']/g)].map(match => match[1]);
  assert.deepEqual([...new Set(navTargets)].sort(), ["calendar", "home", "ledger", "ride", "store"]);
  assert.doesNotMatch(v4, /data-metropolis-nav=["']settings["']/);
  assert.match(v4, /aria-current/);
});

test("visual rollout preserves the defragmented runtime boundary", () => {
  for (const file of ["metropolis-v4.js", "metropolis-r5-4.js"]) {
    const source = read(file);
    assert.doesNotMatch(source, /new MutationObserver\(/, `${file} must not reintroduce a DOM observer`);
  }
  assert.doesNotMatch(v4, /renderAll\s*=\s*function/);
  assert.match(r54, /function r54Metrics\(targetState,\s*today\s*=\s*r54Today\(\),\s*cashSatang\s*=\s*0\)/);
  assert.doesNotMatch(r54MetricsBody(), /currentBalanceSatang/);
});

test("approved production palette and nav state are encoded in the authoritative visual CSS", () => {
  for (const hex of ["#0F1416", "#1B2326", "#22C55E", "#14B8A6", "#F5C14A", "#F7F7F8"]) {
    assert.match(css.toUpperCase(), new RegExp(hex.toUpperCase().replace("#", "#")));
  }
  assert.match(css, /\.metropolis-bottom-nav/);
  assert.match(css, /\.metropolis-bottom-nav[^\n]*\.is-active|\.metropolis-bottom-nav[\s\S]*?\.is-active/);
  assert.match(css, /env\(safe-area-inset-bottom/);
});

test("PWA icon contract keeps stable production filenames", () => {
  assert.match(index, /href="icon-192\.png"/);
  const icons = Array.isArray(manifest.icons) ? manifest.icons.map(icon => icon.src) : [];
  assert.ok(icons.includes("icon-192.png"));
  assert.ok(icons.includes("icon-512.png"));
  assert.match(sw, /icon-192\.png/);
  assert.match(sw, /icon-512\.png/);
});