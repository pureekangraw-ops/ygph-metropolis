const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const jsPath = path.join(root, "metropolis-r5.js");
const cssPath = path.join(root, "metropolis-r5.css");

function read(file) {
  return fs.readFileSync(path.join(root, file), "utf8");
}

function runtime() {
  assert.ok(fs.existsSync(jsPath), "metropolis-r5.js must exist");
  delete require.cache[require.resolve(jsPath)];
  return require(jsPath);
}

test("three installments beginning on the 9th schedule every following month", () => {
  const { monthlyDueDates } = runtime();
  assert.deepEqual(monthlyDueDates("2026-08-09", 3), ["2026-08-09", "2026-09-09", "2026-10-09"]);
  assert.deepEqual(monthlyDueDates("2026-01-31", 3), ["2026-01-31", "2026-02-28", "2026-03-31"]);
});

test("installment reconciliation creates only genuinely missing installment numbers", () => {
  const { missingInstallmentNumbers } = runtime();
  const obligation = { id: "OBL-CAR", installmentCount: 3, firstDue: "2026-08-09", originalSatang: 30000 };
  const queues = [
    { source: "LEDGER", sourceId: "OBL-CAR", installmentNumber: 1, due: "2026-08-09", amountSatang: 10000, status: "OPEN" },
    { source: "LEDGER", sourceId: "OBL-CAR", installmentNumber: 2, due: "2026-09-09", amountSatang: 10000, status: "CANCELLED" }
  ];
  assert.deepEqual(missingInstallmentNumbers(obligation, queues), [3]);
});

test("accepted imported queues bypass only the duplicate local verification prompt", () => {
  const source = read("metropolis-r5.js");
  assert.match(source, /function isAcceptedImportedQueue/);
  assert.match(source, /event\s*===\s*"IMPORTED"/);
  assert.match(source, /needsLocalVerification\s*=/);
  assert.match(source, /freshnessGate\s*=/);
  assert.match(source, /originalNeedsLocalVerification/);
  assert.match(source, /originalFreshnessGate/);
});

test("launcher cards use SVG app marks and no redundant arrow affordance", () => {
  const source = read("metropolis-r5.js");
  const css = read("metropolis-r5.css");
  assert.match(source, /data-r5-icon="store"/);
  assert.match(source, /data-r5-icon="ride"/);
  assert.match(source, /data-r5-icon="ledger"/);
  assert.match(source, /data-r5-icon="calendar"/);
  assert.match(css, /\.metropolis-open-mark\s*\{[^}]*display:\s*none/s);
});

test("compact Calendar cards keep readable columns and wrap actions inside the card", () => {
  const css = read("metropolis-r5.css");
  assert.match(css, /@media\s*\(max-width:\s*640px\)/);
  assert.match(css, /#calendarPage\s+\.queue-top[^{]*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/s);
  assert.match(css, /#calendarPage\s+\.queue-title\s+b[^{]*\{[^}]*overflow-wrap:\s*anywhere/s);
  assert.match(css, /#calendarPage\s+\.queue-actions[^{]*\{[^}]*flex-wrap:\s*wrap/s);
});

test("R5 assets are loaded by the document and cached by the service worker", () => {
  const html = read("index.html");
  const sw = read("sw.js");
  const pkg = read("package.json");
  assert.match(html, /metropolis-r5\.css/);
  assert.match(html, /metropolis-r5\.js/);
  assert.match(sw, /metropolis-r5\.css/);
  assert.match(sw, /metropolis-r5\.js/);
  assert.match(pkg, /node --check metropolis-r5\.js/);
});
