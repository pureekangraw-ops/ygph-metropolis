const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const runtime = require("../metropolis-r5-3.js");

test("status signal uses only green yellow red and hides cancelled items", () => {
  const today = "2026-08-08";
  assert.equal(runtime.statusSignal({ status: "CANCELLED", due: "2026-08-01" }, today), "HIDDEN");
  assert.equal(runtime.statusSignal({ status: "COMPLETED", due: "2026-08-01" }, today), "GREEN");
  assert.equal(runtime.statusSignal({ status: "OPEN", due: "2026-08-08" }, today), "YELLOW");
  assert.equal(runtime.statusSignal({ status: "VERIFY", due: "2026-08-09" }, today), "YELLOW");
  assert.equal(runtime.statusSignal({ status: "PARTIAL", due: "2026-08-09" }, today), "YELLOW");
  assert.equal(runtime.statusSignal({ status: "OPEN", due: "2026-08-07" }, today), "RED");
  assert.equal(runtime.statusSignal({ status: "PARTIAL", due: "2026-08-07" }, today), "RED");
});

test("live signal hides an otherwise-open queue when its source was cancelled", () => {
  const queue = { status: "OPEN", due: "2026-08-08" };
  assert.equal(runtime.liveStatusSignal(queue, "CANCELLED", "2026-08-08"), "HIDDEN");
  assert.equal(runtime.liveStatusSignal(queue, "OPEN", "2026-08-08"), "YELLOW");
});

test("live selectors exclude cancelled records without mutating their inputs", () => {
  assert.equal(typeof runtime.selectLiveRecords, "function");
  assert.equal(typeof runtime.selectLiveCalendar, "function");
  const records = [{ id: "open", status: "OPEN" }, { id: "cancelled", status: "CANCELLED" }, { id: "done", status: "COMPLETED" }];
  const recordsSnapshot = structuredClone(records);
  assert.deepEqual(runtime.selectLiveRecords(records).map(item => item.id), ["open", "done"]);
  assert.deepEqual(records, recordsSnapshot);
  const calendar = [
    { id: "live", sourceId: "source-live", status: "OPEN", due: "2026-08-08" },
    { id: "queue-cancelled", sourceId: "source-live", status: "CANCELLED", due: "2026-08-08" },
    { id: "source-cancelled", sourceId: "source-cancelled", status: "OPEN", due: "2026-08-08" }
  ];
  const calendarSnapshot = structuredClone(calendar);
  const selected = runtime.selectLiveCalendar(calendar, item => item.sourceId === "source-cancelled" ? "CANCELLED" : "OPEN", "2026-08-08");
  assert.deepEqual(selected.map(item => item.id), ["live"]);
  assert.deepEqual(calendar, calendarSnapshot);
});

test("live rendering uses selectors and post-render lists instead of swapping durable state", () => {
  const js = read("metropolis-r5-3.js");
  assert.doesNotMatch(js, /function withLiveCalendar/);
  assert.doesNotMatch(js, /function withLiveSourceRecords/);
  assert.doesNotMatch(js, /state\.calendar\s*=/);
  assert.doesNotMatch(js, /state\.(?:store|ride|ledger)\?*\.[A-Za-z]+\s*=/);
  for (const renderer of ["renderCalendar", "renderStore", "renderRide", "renderLedger"]) assert.doesNotMatch(js, new RegExp(`${renderer}\\s*=\\s*function`));
  assert.match(js, /function renderLiveSourceLists/);
  assert.match(js, /historyHtml\s*=\s*function/);
  assert.match(js, /flowCalendarItems\s*=\s*function/);
});

test("calendar day counts and dots exclude cancelled queues", () => {
  const js = read("metropolis-r5-3.js");
  assert.match(js, /selectLiveCalendar\(state\.calendar/);
  assert.match(js, /items\.slice\(0, 5\)/);
  assert.match(js, /r53-day-dot/);
});

test("Calendar list pill receives the same three-color signal as its dot", () => {
  const js = read("metropolis-r5-3.js");
  const css = read("metropolis-r5-3.css");
  assert.match(js, /const status = card\.querySelector\("\.status"\)/);
  assert.match(js, /status\.classList\.add\(signalClass\(signal\)\)/);
  assert.match(css, /#queueList \.status\.r53-status-green/);
  assert.match(css, /#queueList \.status\.r53-status-yellow/);
  assert.match(css, /#queueList \.status\.r53-status-red/);
  assert.doesNotMatch(css, /#queueList \.status\.r53-status-(?:blue|orange|purple|gray|grey)/);
});

test("Calendar source owns the three-stat layout without cancelled-control cleanup", () => {
  const js = read("metropolis-r5-3.js");
  const index = read("index.html");
  assert.doesNotMatch(index, /id="calCancelled"/);
  assert.doesNotMatch(index, /data-filter="CANCELLED"/);
  assert.match(index, /hero-grid r53-three-stats/);
  assert.doesNotMatch(js, /function hideCancelledControls/);
  assert.doesNotMatch(js, /getElementById\("calCancelled"\)/);
  assert.doesNotMatch(js, /data-filter="CANCELLED"/);
});

test("selected-day swipe filters the Calendar selector instead of swapping global state", () => {
  const js = read("metropolis-r5-3.js");
  assert.match(js, /const baseFlowCalendarItems = flowCalendarItems/);
  assert.match(js, /flowCalendarItems\s*=\s*function/);
  assert.match(js, /selectLiveCalendar\(baseFlowCalendarItems\(/);
  assert.doesNotMatch(js, /flowRenderCalendarFocus\s*=\s*function/);
});

test("live counters use the same hidden rule as visible queue cards", () => {
  const js = read("metropolis-r5-3.js");
  assert.match(js, /function syncLiveCounters/);
  assert.match(js, /selectLiveCalendar\(state\.calendar/);
  for (const id of ["homeWaitIn", "homeWaitOut", "homeVerify", "calWaitIn", "calWaitOut", "calVerify", "ledgerPendingCount"]) assert.match(js, new RegExp(`setCounter\\("${id}"`));
});

test("status stylesheet exposes exactly the three owner-approved signal colors", () => {
  const css = read("metropolis-r5-3.css");
  assert.match(css, /\.r53-status-green/);
  assert.match(css, /\.r53-status-yellow/);
  assert.match(css, /\.r53-status-red/);
  assert.match(css, /\.r53-three-stats/);
  assert.doesNotMatch(css, /r53-status-(?:blue|orange|purple|gray|grey)/);
});

test("status signal assets stay loaded before dashboard and finalization layers", () => {
  const bootstrap = read("sw-bootstrap.js");
  const sw = require("../sw.js");
  assert.ok(bootstrap.indexOf("metropolis-r5-3.css") > bootstrap.indexOf("metropolis-r5-2.css"));
  assert.ok(bootstrap.indexOf("metropolis-r5-3.js") > bootstrap.indexOf("metropolis-r5-2.js"));
  assert.ok(bootstrap.indexOf("metropolis-r5-4.js") > bootstrap.indexOf("metropolis-r5-3.js"));
  assert.ok(bootstrap.indexOf("metropolis-r5-5.js") > bootstrap.indexOf("metropolis-r5-4.js"));
  assert.ok(sw.APP_SHELL.includes("metropolis-r5-3.css"));
  assert.ok(sw.APP_SHELL.includes("metropolis-r5-3.js"));
  assert.equal(sw.RELEASE_ID, "v4.2.5-20260810-r20-metro-finalization");
});