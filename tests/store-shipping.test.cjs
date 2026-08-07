const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const appSource = fs.readFileSync(path.join(root, "app.js"), "utf8");

function extractSimpleFunction(name) {
  const pattern = new RegExp(`function ${name}\\([^)]*\\)\\s*\\{[^}]*\\}`);
  const match = appSource.match(pattern);
  assert.ok(match, `${name} missing from app.js`);
  return match[0];
}

test("STORE shipping cost is deducted from cash effect without increasing the customer bill", () => {
  const source = extractSimpleFunction("calculateStoreSaleAmounts");
  const context = {};
  vm.runInNewContext(`${source}; result = calculateStoreSaleAmounts(1, 50000, 50000, 5000);`, context);
  assert.deepEqual(Array.from(context.result), [50000, 0, 45000]);
});

test("sale entry requires opting in before shipping cost can be entered", () => {
  assert.match(appSource, /id="saleHasShippingCost"[^>]*type="checkbox"/);
  assert.match(appSource, /id="saleShippingCost"[^>]*disabled/);
  assert.match(appSource, /shippingCostSatang/);
});

test("shipping cost records one linked STORE cash out and does not become customer receivable", () => {
  assert.match(appSource, /direction:\s*"OUT"[^\n]*subtype:\s*"SALE_SHIPPING_COST"/);
  assert.match(appSource, /outstandingSatang:\s*amounts\.outstandingSatang/);
  const receivableStart = appSource.indexOf("function receivableAt(end)");
  const receivableEnd = appSource.indexOf("function rideCreditAt(end)", receivableStart);
  assert.ok(receivableStart >= 0 && receivableEnd > receivableStart, "receivableAt section missing");
  const receivableSource = appSource.slice(receivableStart, receivableEnd);
  assert.match(receivableSource, /direction === "IN"/);
});

test("live report does not add a standalone shipping-cost row", () => {
  const reportStart = appSource.indexOf("function renderReport()");
  const reportEnd = appSource.indexOf("function buildReportFromControls()", reportStart);
  assert.ok(reportStart >= 0 && reportEnd > reportStart, "renderReport section missing");
  const reportSource = appSource.slice(reportStart, reportEnd);
  assert.doesNotMatch(reportSource, /ค่าจัดส่ง|shippingCostSatang|SALE_SHIPPING_COST/);
});
