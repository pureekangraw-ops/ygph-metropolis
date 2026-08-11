"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const dashboardRuntime = require("../metropolis-r5-4.js");

test("4.2.4 replaces the Four Apps hero slot with the owner dashboard", () => {
  const js = read("metropolis-r5-4.js");
  assert.match(js, /METROPOLIS_424_PRODUCT_VERSION\s*=\s*"4\.2\.4"/);
  assert.match(js, /querySelector\("\.metropolis-city-hero"\)\?\.remove\(\)/);
  assert.match(js, /insertBefore\(dashboard,\s*appSection\)/);
  for (const id of ["metroDashCash", "metroDashStock", "metroDashOverdue", "metroDashPendingOut"]) {
    assert.match(js, new RegExp(id));
  }
  assert.match(js, /currentBalanceSatang/);
  assert.match(js, /\bdue\s*&&\s*due\s*<\s*today/);
  assert.match(js, /queueDirection/);
});

test("dashboard red metric counts only active outgoing items due this month", () => {
  const previousDirection = global.queueDirection;
  const previousSource = global.findSource;
  global.queueDirection = item => item.direction || "OTHER";
  global.findSource = (source, sourceId) => sourceId === "source-cancelled" ? { status: "CANCELLED" } : { status: "OPEN" };
  try {
    const metrics = dashboardRuntime.r54Metrics({
      store: { stockQty: 12 },
      calendar: [
        { source: "LEDGER", sourceId: "current", status: "OPEN", direction: "OUT", due: "2026-08-10", amountSatang: 10000, paidSatang: 0 },
        { source: "LEDGER", sourceId: "previous", status: "OPEN", direction: "OUT", due: "2026-07-31", amountSatang: 20000, paidSatang: 0 },
        { source: "LEDGER", sourceId: "future", status: "OPEN", direction: "OUT", due: "2026-09-01", amountSatang: 30000, paidSatang: 0 },
        { source: "LEDGER", sourceId: "done", status: "COMPLETED", direction: "OUT", due: "2026-08-01", amountSatang: 9000, paidSatang: 9000 },
        { source: "LEDGER", sourceId: "cancelled", status: "CANCELLED", direction: "OUT", due: "2026-08-01", amountSatang: 8000, paidSatang: 0 },
        { source: "LEDGER", sourceId: "source-cancelled", status: "OPEN", direction: "OUT", due: "2026-08-01", amountSatang: 7000, paidSatang: 0 }
      ]
    }, "2026-08-09", 12345);
    assert.equal(metrics.cashSatang, 12345);
    assert.equal(metrics.stockQty, 12);
    assert.equal(metrics.overdue, 1);
    assert.equal(metrics.pendingOut, 1);
    assert.equal("pendingOutSatang" in metrics, false);
  } finally {
    if (previousDirection === undefined) delete global.queueDirection; else global.queueDirection = previousDirection;
    if (previousSource === undefined) delete global.findSource; else global.findSource = previousSource;
  }
});

test("dashboard red card shows current-month item count only", () => {
  const js = read("metropolis-r5-4.js");
  assert.match(js, /<small>ค้างจ่ายเดือนนี้<\/small>/);
  assert.match(js, /set\("metroDashPendingOut",\s*`\$\{metrics\.pendingOut\.toLocaleString\("th-TH"\)\} รายการ`\)/);
  assert.doesNotMatch(js, /metroDashPendingOut[^\n]*บาท/);
});

test("dashboard compatibility class order stays stable for existing selectors", () => {
  const css = read("metropolis-r5-4.css");
  const purple = css.indexOf(".metro-dash-purple");
  const green = css.indexOf(".metro-dash-green");
  const yellow = css.indexOf(".metro-dash-yellow");
  const red = css.indexOf(".metro-dash-red");
  assert.ok(purple >= 0 && green > purple && yellow > green && red > yellow);
});

test("4.2.4 dashboard layer uses the shared runtime authority without monkey-patching", () => {
  const js = read("metropolis-r5-4.js");
  const css = read("metropolis-r5-4.css");
  assert.match(js, /const expectedVersion\s*=\s*`METROPOLIS v\$\{METROPOLIS_424_PRODUCT_VERSION\}`/);
  assert.match(js, /statusVersion\.textContent\s*=\s*expectedVersion/);
  assert.match(js, /YGPH_METROPOLIS_PRODUCT_VERSION\s*=\s*METROPOLIS_424_PRODUCT_VERSION/);
  assert.doesNotMatch(js, /applyProductVersion42\s*=\s*function/);
  assert.doesNotMatch(css, /\.status-line b::after/);
  assert.doesNotMatch(css, /\.status-line b\s*\{[\s\S]{0,80}font-size\s*:\s*0/);
});

test("4.2.5 finalization assets remain before later additive maintenance layers", () => {
  const bootstrap = read("sw-bootstrap.js");
  const sw = require("../sw.js");
  assert.ok(bootstrap.indexOf("metropolis-r5-4.css") > bootstrap.indexOf("metropolis-r5-3.css"));
  assert.ok(bootstrap.indexOf("metropolis-r5-4.js") > bootstrap.indexOf("metropolis-r5-3.js"));
  assert.ok(bootstrap.indexOf("metropolis-r5-5.css") > bootstrap.indexOf("metropolis-r5-4.css"));
  assert.ok(bootstrap.indexOf("metropolis-r5-5.js") > bootstrap.indexOf("metropolis-r5-4.js"));
  assert.ok(sw.APP_SHELL.includes("metropolis-r5-5.css"));
  assert.ok(sw.APP_SHELL.includes("metropolis-r5-5.js"));
  assert.match(sw.RELEASE_ID, /^v4\.2\.5-/);
});