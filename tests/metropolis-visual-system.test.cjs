"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");

const flow = read("flow-era.js");
const v4 = read("metropolis-v4.js");
const r51 = read("metropolis-r5-1.js");
const r54 = read("metropolis-r5-4.js");
const css = read("metropolis-r5-4.css");
const index = read("index.html");
const manifest = JSON.parse(read("manifest.webmanifest"));
const sw = read("sw.js");

function r54MetricsBody() {
  return r54.match(/function r54Metrics\([\s\S]*?\n\}/)?.[0] || "";
}

function metropolisIconFor(subject) {
  const marker = "function metropolisActivePage()";
  const prefix = v4.slice(0, v4.indexOf(marker));
  const context = {
    console,
    flowIcon: name => name
  };
  vm.createContext(context);
  vm.runInContext(`${prefix}\nthis.__metropolisIcon = metropolisIcon;`, context);
  return context.__metropolisIcon(subject);
}

test("METROPOLIS stays primary and YGPH is the signature", () => {
  assert.match(v4, /const METROPOLIS_DISPLAY_NAME\s*=\s*"METROPOLIS"/);
  assert.match(v4, /const METROPOLIS_SIGNATURE\s*=\s*"by YGPH — Yggdrasil Personal Helper"/);
  assert.match(v4, /brandTitle\.textContent\s*=\s*METROPOLIS_DISPLAY_NAME/);
  assert.match(v4, /brandSub\.textContent\s*=\s*METROPOLIS_SIGNATURE/);
});

test("core METROPOLIS icons extend the existing shared FLOW icon registry", () => {
  assert.match(flow, /const FLOW_ICONS\s*=\s*\{/);
  assert.match(flow, /function flowIcon\(/);
  for (const name of ["app", "home", "store", "ride", "ledger", "calendar", "settings", "wallet", "stock", "task", "payment", "chevron"]) {
    assert.match(flow, new RegExp(`\\b${name}:\\s*`), `missing ${name} glyph`);
  }
  assert.match(v4, /return flowIcon\(iconName\)/);
  assert.doesNotMatch(v4, /<span class="metropolis-emoji"[^>]*>\$\{meta\.emoji\}<\/span>/);
  assert.match(r51, /return typeof flowIcon === "function" \? flowIcon\(app\) : ""/);
  assert.doesNotMatch(r51, /data-metropolis-41-icon/);
});

test("brand app mark and Home navigation resolve their own shared glyphs", () => {
  assert.equal(metropolisIconFor("app"), "app");
  assert.equal(metropolisIconFor("home"), "home");
  assert.equal(metropolisIconFor("store"), "store");
});

test("existing bottom navigation is the single five-destination source", () => {
  const nav = index.match(/<nav class="bottom-nav"[^>]*>([\s\S]*?)<\/nav>/)?.[1] || "";
  const targets = [...nav.matchAll(/data-page="([^"]+)"/g)].map(match => match[1]);
  assert.deepEqual(targets, ["home", "store", "ride", "ledger", "calendar"]);
  assert.doesNotMatch(nav, /data-page="settings"/);
  assert.match(v4, /function metropolisHydrateBottomNav\(/);
  assert.match(v4, /function metropolisSyncBottomNav\(/);
  assert.match(v4, /aria-current/);
});

test("visual rollout preserves the defragmented runtime boundary", () => {
  for (const file of ["metropolis-v4.js", "metropolis-r5-1.js", "metropolis-r5-4.js"]) {
    const source = read(file);
    assert.doesNotMatch(source, /new MutationObserver\(/, `${file} must not reintroduce a DOM observer`);
  }
  assert.doesNotMatch(v4, /renderAll\s*=\s*function/);
  assert.match(r54, /function r54Metrics\(targetState,\s*today\s*=\s*r54Today\(\),\s*cashSatang\s*=\s*0\)/);
  assert.doesNotMatch(r54MetricsBody(), /currentBalanceSatang/);
});

test("approved production palette and nav state are encoded in the authoritative visual CSS", () => {
  for (const hex of ["#0F1416", "#1B2326", "#22C55E", "#14B8A6", "#F5C14A", "#F7F7F8"]) {
    assert.match(css.toUpperCase(), new RegExp(hex.toUpperCase()));
  }
  assert.match(css, /\.metropolis-v4 \.bottom-nav/);
  assert.match(css, /\.nav-btn\.is-active/);
  assert.match(css, /env\(safe-area-inset-bottom/);
});

test("FLOW header Settings control is restyled by the authoritative dark visual layer", () => {
  assert.match(css, /\.metropolis-v4 \.flow-header-settings\s*\{/);
  assert.match(css, /\.flow-header-settings[\s\S]*background:\s*#172125!important/);
  assert.match(css, /\.flow-header-settings[\s\S]*color:\s*var\(--ygph-white\)!important/);
});

test("settings product version comes from the same 4.2.4 authority", () => {
  assert.match(index, /id="settingsProductVersion"/);
  assert.doesNotMatch(index, /class="hero-value">YGPH METROPOLIS v4\.0\.0/);
  assert.match(r54, /settingsProductVersion/);
  assert.match(r54, /METROPOLIS_424_PRODUCT_VERSION/);
});

test("PWA icon contract keeps stable production filenames", () => {
  assert.match(index, /href="icon-192\.png"/);
  const icons = Array.isArray(manifest.icons) ? manifest.icons.map(icon => icon.src) : [];
  assert.ok(icons.includes("icon-192.png"));
  assert.ok(icons.includes("icon-512.png"));
  assert.match(sw, /icon-192\.png/);
  assert.match(sw, /icon-512\.png/);
});