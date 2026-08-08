"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const dashboardRuntime = require("../metropolis-r5-4.js");

test("4.2.1 removes the Four Apps eyebrow and adds the owner dashboard", () => {
  const js = read("metropolis-r5-4.js");
  assert.match(js, /METROPOLIS_421_PRODUCT_VERSION\s*=\s*"4\.2\.1"/);
  assert.match(js, /\.metropolis-eyebrow/);
  assert.match(js, /remove\(\)/);
  for (const id of ["metroDashCash", "metroDashStock", "metroDashOverdue", "metroDashPendingOut"]) {
    assert.match(js, new RegExp(id));
  }
  assert.match(js, /currentBalanceSatang/);
  assert.equal(dashboardRuntime.r54Metrics({ store: { stockQty: 12 }, calendar: [] }, "2026-08-08").stockQty, 12);
  assert.match(js, /\bdue\s*&&\s*due\s*<\s*today/);
  assert.match(js, /queueDirection/);
});

test("dashboard palette follows purple green yellow red order", () => {
  const css = read("metropolis-r5-4.css");
  const purple = css.indexOf(".metro-dash-purple");
  const green = css.indexOf(".metro-dash-green");
  const yellow = css.indexOf(".metro-dash-yellow");
  const red = css.indexOf(".metro-dash-red");
  assert.ok(purple >= 0 && green > purple && yellow > green && red > yellow);
});

test("4.2.1 visible version cannot be reverted by the older 4.2 observer", () => {
  const js = read("metropolis-r5-4.js");
  const css = read("metropolis-r5-4.css");
  assert.match(js, /setAttribute\("aria-label",\s*`METROPOLIS v\$\{METROPOLIS_421_PRODUCT_VERSION\}`\)/);
  assert.doesNotMatch(js, /statusVersion\.textContent\s*=/);
  assert.match(css, /html\[data-metropolis-r54\][\s\S]*\.status-line b::after[\s\S]*content:\s*"METROPOLIS v4\.2\.1"/);
});

test("4.2.1 visible version and assets are loaded as the newest layer", () => {
  const bootstrap = read("sw-bootstrap.js");
  const sw = require("../sw.js");
  assert.ok(bootstrap.indexOf("metropolis-r5-4.css") > bootstrap.indexOf("metropolis-r5-3.css"));
  assert.ok(bootstrap.indexOf("metropolis-r5-4.js") > bootstrap.indexOf("metropolis-r5-3.js"));
  assert.ok(sw.APP_SHELL.includes("metropolis-r5-4.css"));
  assert.ok(sw.APP_SHELL.includes("metropolis-r5-4.js"));
  assert.equal(sw.RELEASE_ID, "v4.2.1-20260808-r10-home-dashboard");
});
