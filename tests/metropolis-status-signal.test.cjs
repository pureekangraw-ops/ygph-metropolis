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

test("cancelled records are filtered before Calendar and aggregate list renderers execute", () => {
  const js = read("metropolis-r5-3.js");
  assert.match(js, /function withLiveCalendar/);
  assert.match(js, /function withLiveSourceRecords/);
  assert.match(js, /function patchLiveRenderers/);
  assert.match(js, /renderCalendar\s*=\s*function/);
  assert.match(js, /withLiveCalendar\(\(\) => baseRenderCalendar/);
  for (const renderer of ["renderStore", "renderRide", "renderLedger", "historyHtml"]) {
    assert.match(js, new RegExp(`${renderer}\\s*=\\s*function`));
  }
  assert.match(js, /withLiveSourceRecords\(\(\) => baseRenderStore/);
  assert.match(js, /withLiveSourceRecords\(\(\) => baseHistoryHtml/);
  assert.doesNotMatch(js, /state\.calendar\.(?:splice|pop|shift)|delete\s+state\.calendar/);
});

test("calendar day counts and dots exclude cancelled queues", () => {
  const js = read("metropolis-r5-3.js");
  assert.match(js, /state\.calendar\.filter\(item => item\.due === date && queueSignal\(item\) !== STATUS_SIGNALS\.HIDDEN\)/);
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

test("cancelled controls disappear from Calendar live UI", () => {
  const js = read("metropolis-r5-3.js");
  assert.match(js, /data-filter="CANCELLED"/);
  assert.match(js, /getElementById\("calCancelled"\)/);
  assert.match(js, /r53-three-stats/);
});

test("selected-day swipe uses a live-only calendar so cancelled queues cannot reappear", () => {
  const js = read("metropolis-r5-3.js");
  assert.match(js, /flowRenderCalendarFocus\s*=\s*function/);
  assert.match(js, /withLiveCalendar\(\(\) => baseFlowCalendarFocus/);
});

test("live counters use the same hidden rule as visible queue cards", () => {
  const js = read("metropolis-r5-3.js");
  assert.match(js, /function syncLiveCounters/);
  assert.match(js, /queueSignal\(item\) !== STATUS_SIGNALS\.HIDDEN/);
  for (const id of ["homeWaitIn", "homeWaitOut", "homeVerify", "calWaitIn", "calWaitOut", "calVerify", "ledgerPendingCount"]) {
    assert.match(js, new RegExp(`setCounter\\("${id}"`));
  }
});

test("status stylesheet exposes exactly the three owner-approved signal colors", () => {
  const css = read("metropolis-r5-3.css");
  assert.match(css, /\.r53-status-green/);
  assert.match(css, /\.r53-status-yellow/);
  assert.match(css, /\.r53-status-red/);
  assert.match(css, /\.r53-three-stats/);
  assert.doesNotMatch(css, /r53-status-(?:blue|orange|purple|gray|grey)/);
});

test("status signal assets stay loaded before the 4.2.2 dashboard layer", () => {
  const bootstrap = read("sw-bootstrap.js");
  const sw = require("../sw.js");
  assert.ok(bootstrap.indexOf("metropolis-r5-3.css") > bootstrap.indexOf("metropolis-r5-2.css"));
  assert.ok(bootstrap.indexOf("metropolis-r5-3.js") > bootstrap.indexOf("metropolis-r5-2.js"));
  assert.ok(bootstrap.indexOf("metropolis-r5-4.js") > bootstrap.indexOf("metropolis-r5-3.js"));
  assert.ok(sw.APP_SHELL.includes("metropolis-r5-3.css"));
  assert.ok(sw.APP_SHELL.includes("metropolis-r5-3.js"));
  assert.equal(sw.RELEASE_ID, "v4.2.2-20260808-r11-home-authority");
});
