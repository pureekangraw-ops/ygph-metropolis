const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const runtime = require("../metropolis-r5-3.js");

test("calendar signal uses only green yellow red and hides cancelled", () => {
  assert.equal(typeof runtime.calendarSignal, "function");
  const today = "2026-08-08";
  assert.equal(runtime.calendarSignal({ status: "COMPLETED", due: "2026-08-01" }, today), "green");
  assert.equal(runtime.calendarSignal({ status: "OPEN", due: "2026-08-08" }, today), "yellow");
  assert.equal(runtime.calendarSignal({ status: "PARTIAL", due: "2026-08-12" }, today), "yellow");
  assert.equal(runtime.calendarSignal({ status: "VERIFY", due: "2026-08-01" }, today), "red");
  assert.equal(runtime.calendarSignal({ status: "OPEN", due: "2026-08-07" }, today), "red");
  assert.equal(runtime.calendarSignal({ status: "CANCELLED", due: "2026-08-01" }, today), "hidden");
});

test("live filter removes cancelled without deleting or mutating the source records", () => {
  const records = [
    { id: "A", status: "OPEN" },
    { id: "B", status: "CANCELLED" },
    { id: "C", status: "COMPLETED" }
  ];
  assert.deepEqual(runtime.liveRecords(records).map(item => item.id), ["A", "C"]);
  assert.deepEqual(records.map(item => item.id), ["A", "B", "C"]);
});

test("live calendar wrapper filters cancelled before rendering month cards and flow focus", () => {
  const source = read("metropolis-r5-3.js");
  assert.match(source, /withLiveCalendar/);
  assert.match(source, /\[state, "calendar"\]/);
  assert.match(source, /item\.status !== "CANCELLED" && item\.due === selectedDate/);
  assert.match(source, /cal-dot signal-\$\{signal\}/);
  assert.match(source, /signalQueueCards/);
});

test("cancelled source records are hidden from recent and all-history views", () => {
  const source = read("metropolis-r5-3.js");
  assert.match(source, /\[state\.store, "sales"\]/);
  assert.match(source, /\[state\.store, "purchases"\]/);
  assert.match(source, /\[state\.ride, "jobs"\]/);
  assert.match(source, /\[state\.ride, "creditWithdrawals"\]/);
  assert.match(source, /\[state\.ledger, "obligations"\]/);
  assert.match(source, /baseHistoryHtml/);
});

test("traffic-light CSS exposes only green yellow red live signal selectors and hides cancelled controls", () => {
  const css = read("metropolis-r5-3.css");
  for (const signal of ["green", "yellow", "red"]) assert.match(css, new RegExp(`\\.signal-${signal}`));
  assert.doesNotMatch(css, /signal-(?:orange|purple|blue)/);
  const js = read("metropolis-r5-3.js");
  assert.match(js, /data-filter=\\"CANCELLED\\"/);
  assert.match(js, /getElementById\("calCancelled"\)/);
});

test("status patch loads last, is offline, and advances patch release", () => {
  const bootstrap = read("sw-bootstrap.js");
  const sw = require("../sw.js");
  assert.equal(runtime.METROPOLIS_PRODUCT_VERSION, "4.2.1");
  assert.ok(bootstrap.indexOf("metropolis-r5-3.js") > bootstrap.indexOf("metropolis-r5-2.js"));
  assert.ok(bootstrap.indexOf("metropolis-r5-3.css") > bootstrap.indexOf("metropolis-r5-2.css"));
  assert.ok(sw.APP_SHELL.includes("metropolis-r5-3.js"));
  assert.ok(sw.APP_SHELL.includes("metropolis-r5-3.css"));
  assert.equal(sw.RELEASE_ID, "v4.2.1-20260808-r6-status");
});
