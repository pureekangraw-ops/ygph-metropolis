const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const runtimePath = path.join(root, "metropolis-r5-2.js");
const runtimeSource = fs.existsSync(runtimePath) ? fs.readFileSync(runtimePath, "utf8") : "";
const runtime = fs.existsSync(runtimePath) ? require(runtimePath) : {};

test("4.2 uses amount per installment and computes the obligation total", () => {
  assert.equal(runtime.METROPOLIS_PRODUCT_VERSION, "4.2.0");
  assert.equal(typeof runtime.totalFromInstallment, "function", "4.2 schedule runtime must export totalFromInstallment");
  assert.equal(runtime.totalFromInstallment(300000, 3), 900000);
});

test("weekly schedules advance by exactly seven days", () => {
  assert.equal(typeof runtime.scheduleDueDates, "function", "4.2 schedule runtime must export scheduleDueDates");
  assert.deepEqual(runtime.scheduleDueDates("2026-08-09", 3, "WEEKLY"), [
    "2026-08-09",
    "2026-08-16",
    "2026-08-23"
  ]);
});

test("monthly schedules preserve the anchor day and clamp short months", () => {
  assert.equal(typeof runtime.scheduleDueDates, "function", "4.2 schedule runtime must export scheduleDueDates");
  assert.deepEqual(runtime.scheduleDueDates("2026-01-31", 3, "MONTHLY"), [
    "2026-01-31",
    "2026-02-28",
    "2026-03-31"
  ]);
});

test("skip interval preserves debt and shifts by the current schedule cadence", () => {
  assert.equal(typeof runtime.shiftDueOneInterval, "function", "4.2 schedule runtime must export shiftDueOneInterval");
  assert.equal(runtime.shiftDueOneInterval("2026-08-09", "WEEKLY"), "2026-08-16");
  assert.equal(runtime.shiftDueOneInterval("2026-01-31", "MONTHLY"), "2026-02-28");
});

test("legacy R5 reconciliation explicitly yields PER_INSTALLMENT obligations to 4.2", () => {
  const r5 = read("metropolis-r5.js");
  assert.match(r5, /scheduleMode\s*===\s*"PER_INSTALLMENT"[\s\S]{0,80}continue/);
});

test("new obligation UI is per-installment, frequency-aware, and previewed", () => {
  assert.match(runtimeSource, /id="debtInstallmentAmount"/);
  assert.match(runtimeSource, /id="debtFrequency"/);
  assert.match(runtimeSource, /WEEKLY/);
  assert.match(runtimeSource, /MONTHLY/);
  assert.match(runtimeSource, /id="debtSchedulePreview"/);
  assert.match(runtimeSource, /scheduleMode:\s*"PER_INSTALLMENT"/);
  assert.match(runtimeSource, /installmentAmountSatang/);
});

test("installment manager supports one, future, payment holiday, and early settlement", () => {
  assert.match(runtimeSource, /จัดการงวด/);
  assert.match(runtimeSource, /EDIT_THIS/);
  assert.match(runtimeSource, /EDIT_FUTURE/);
  assert.match(runtimeSource, /ข้ามรอบนี้/);
  assert.match(runtimeSource, /ปิดภาระทั้งหมด/);
  assert.match(runtimeSource, /subtype:\s*"OBLIGATION_PAYMENT"/);
  assert.match(runtimeSource, /payment:early-close/);
});

test("4.2 reconciliation treats installment records as authoritative", () => {
  assert.equal(typeof runtime.derivePerInstallmentSchedule, "function", "4.2 schedule runtime must export derivePerInstallmentSchedule");
  const obligation = {
    id: "OBL-42",
    scheduleMode: "PER_INSTALLMENT",
    scheduleFrequency: "WEEKLY",
    installmentAmountSatang: 300000,
    installmentCount: 3,
    firstDue: "2026-08-09",
    originalSatang: 900000,
    installments: [
      { number: 1, amountSatang: 300000, due: "2026-08-10" },
      { number: 2, amountSatang: 350000, due: "2026-08-17" }
    ]
  };
  assert.deepEqual(runtime.derivePerInstallmentSchedule(obligation), [
    { number: 1, amountSatang: 300000, due: "2026-08-10" },
    { number: 2, amountSatang: 350000, due: "2026-08-17" },
    { number: 3, amountSatang: 300000, due: "2026-08-23" }
  ]);
});

test("4.1 and 4.2 classic runtime layers can load in the same global scope", () => {
  const context = vm.createContext({});
  assert.doesNotThrow(() => vm.runInContext(read("metropolis-r5-1.js"), context, { filename: "metropolis-r5-1.js" }));
  assert.doesNotThrow(() => vm.runInContext(read("metropolis-r5-2.js"), context, { filename: "metropolis-r5-2.js" }));
});

test("4.1 version observer yields when the 4.2 runtime is present", () => {
  const r51 = read("metropolis-r5-1.js");
  assert.match(r51, /metropolisR52/);
});

test("4.2 assets stay loaded before the additive status and dashboard layers", () => {
  const bootstrap = read("sw-bootstrap.js");
  const sw = require("../sw.js");
  assert.ok(bootstrap.indexOf("metropolis-r5-2.js") > bootstrap.indexOf("metropolis-r5-1.js"));
  assert.ok(bootstrap.indexOf("metropolis-r5-2.css") > bootstrap.indexOf("metropolis-r5-1.css"));
  assert.ok(bootstrap.indexOf("metropolis-r5-3.js") > bootstrap.indexOf("metropolis-r5-2.js"));
  assert.ok(bootstrap.indexOf("metropolis-r5-4.js") > bootstrap.indexOf("metropolis-r5-3.js"));
  assert.ok(sw.APP_SHELL.includes("metropolis-r5-2.js"));
  assert.ok(sw.APP_SHELL.includes("metropolis-r5-2.css"));
  assert.equal(sw.RELEASE_ID, "v4.2.1-20260808-r10-home-dashboard");
});
