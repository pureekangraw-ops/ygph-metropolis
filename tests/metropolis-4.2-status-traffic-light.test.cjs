const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const app = require("../app.js");

test("calendar signal uses only green yellow red and hides cancelled", () => {
  assert.equal(typeof app.calendarSignal, "function");
  const today = "2026-08-08";
  assert.equal(app.calendarSignal({ status: "COMPLETED", due: "2026-08-01" }, today), "green");
  assert.equal(app.calendarSignal({ status: "OPEN", due: "2026-08-08" }, today), "yellow");
  assert.equal(app.calendarSignal({ status: "PARTIAL", due: "2026-08-12" }, today), "yellow");
  assert.equal(app.calendarSignal({ status: "VERIFY", due: "2026-08-01" }, today), "red");
  assert.equal(app.calendarSignal({ status: "OPEN", due: "2026-08-07" }, today), "red");
  assert.equal(app.calendarSignal({ status: "CANCELLED", due: "2026-08-01" }, today), "hidden");
});

test("live calendar rendering excludes cancelled before month counts and queue cards", () => {
  const source = read("app.js");
  assert.match(source, /const items = state\.calendar\.filter\(q => q\.due === date && q\.status !== "CANCELLED"\)/);
  assert.match(source, /let items = state\.calendar\.filter\(item => item\.status !== "CANCELLED"\)/);
  assert.match(source, /signal-\$\{calendarSignal\(item\)\}/);
  assert.match(source, /cal-dot signal-\$\{calendarSignal\(q\)\}/);
});

test("cancelled source records are absent from recent and all-history lists", () => {
  const source = read("app.js");
  assert.match(source, /const obligations = state\.ledger\.obligations\.filter\(item => item\.status !== "CANCELLED"\)/);
  assert.match(source, /sortNewest\(state\.store\.sales\.filter\(item => item\.status !== "CANCELLED"\)\)/);
  assert.match(source, /sortNewest\(state\.ride\.jobs\.filter\(item => item\.status !== "CANCELLED"\)\)/);
  assert.match(source, /sortNewest\(state\.ledger\.obligations\.filter\(item => item\.status !== "CANCELLED"\)\)/);
});

test("traffic-light CSS exposes exactly the three live signal classes and hides cancelled controls", () => {
  const css = read("metropolis-r5-2.css");
  for (const signal of ["green", "yellow", "red"]) assert.match(css, new RegExp(`\\.signal-${signal}`));
  assert.match(css, /\[data-filter="CANCELLED"\]/);
  assert.match(css, /#calCancelled/);
  assert.match(css, /#homeCancelled/);
});

test("status patch advances product and service-worker patch versions", () => {
  const runtime = require("../metropolis-r5-2.js");
  const sw = require("../sw.js");
  assert.equal(runtime.METROPOLIS_PRODUCT_VERSION, "4.2.1");
  assert.equal(sw.RELEASE_ID, "v4.2.1-20260808-r6-status");
});
