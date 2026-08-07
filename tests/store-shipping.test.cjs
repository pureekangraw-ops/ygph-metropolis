const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const runtimePath = path.join(root, "metropolis-r5.js");
const appSource = fs.readFileSync(path.join(root, "app.js"), "utf8");

function runtime() {
  assert.ok(fs.existsSync(runtimePath), "metropolis-r5.js must exist");
  delete require.cache[require.resolve(runtimePath)];
  return require(runtimePath);
}

function runtimeSource() {
  assert.ok(fs.existsSync(runtimePath), "metropolis-r5.js must exist");
  return fs.readFileSync(runtimePath, "utf8");
}

test("STORE shipping cost is deducted from received cash without increasing the customer bill", () => {
  const { shippingNetEffect } = runtime();
  assert.equal(shippingNetEffect(50000, 5000), 45000);
});

test("sale entry requires opting in before shipping cost can be entered", () => {
  const source = runtimeSource();
  assert.match(source, /id="saleHasShippingCost"[^>]*type="checkbox"/);
  assert.match(source, /id="saleShippingCost"[^>]*disabled/);
  assert.match(source, /saleHasShippingCost/);
});

test("shipping cost records one linked STORE cash out and stays outside customer receivable", () => {
  const source = runtimeSource();
  assert.match(source, /direction:\s*"OUT"[\s\S]{0,260}subtype:\s*"SALE_SHIPPING_COST"/);
  assert.match(source, /actionKey:\s*`\$\{id\}:shipping-cost`/);
  assert.match(source, /outstandingSatang:\s*totalSatang\s*-\s*receivedSatang/);
});

test("live STORE report does not add a standalone shipping-cost row", () => {
  const reportStart = appSource.indexOf("function renderReport()");
  const reportEnd = appSource.indexOf("function buildReportFromControls()", reportStart);
  assert.ok(reportStart >= 0 && reportEnd > reportStart, "renderReport section missing");
  const reportSource = appSource.slice(reportStart, reportEnd);
  assert.doesNotMatch(reportSource, /ค่าจัดส่ง|shippingCostSatang|SALE_SHIPPING_COST/);
});
