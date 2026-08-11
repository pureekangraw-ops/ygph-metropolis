const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { loadProductionRuntime } = require("./helpers/metropolis-runtime-harness.cjs");

const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const dayCyclePath = path.join(root, "metropolis-day-cycle.js");

function loadDayCycle() {
  assert.ok(fs.existsSync(dayCyclePath), "metropolis-day-cycle.js must exist");
  delete require.cache[require.resolve(dayCyclePath)];
  return require(dayCyclePath);
}

test("day cycle runtime exposes pure lifecycle planners", () => {
  const runtime = loadDayCycle();
  assert.equal(runtime.DAY_CYCLE_VERSION, "1.0.0");
  assert.equal(typeof runtime.normalizeDayCycle, "function");
  assert.equal(typeof runtime.planStartDay, "function");
  assert.equal(typeof runtime.planEndDay, "function");
  assert.equal(typeof runtime.dayControlMarkup, "function");
});

test("Start Day and End Day produce explicit same-day lifecycle state and close only operational daily state", async t => {
  const { normalizeDayCycle, planStartDay, planEndDay } = loadDayCycle();
  assert.deepEqual(normalizeDayCycle(null), {
    status: "NOT_STARTED",
    date: null,
    startedAt: null,
    endedAt: null
  });

  const started = planStartDay(null, "2026-08-12", "2026-08-11T23:20:00.000Z");
  assert.deepEqual(started, {
    status: "ACTIVE",
    date: "2026-08-12",
    startedAt: "2026-08-11T23:20:00.000Z",
    endedAt: null
  });

  const ended = planEndDay(started, "2026-08-12", "2026-08-12T15:00:00.000Z");
  assert.deepEqual(ended, {
    status: "ENDED",
    date: "2026-08-12",
    startedAt: "2026-08-11T23:20:00.000Z",
    endedAt: "2026-08-12T15:00:00.000Z"
  });

  const runtime = loadProductionRuntime();
  t.after(() => runtime.close());
  await runtime.flushRuntime();
  assert.equal(runtime.scriptErrors.length, 0, JSON.stringify(runtime.scriptErrors));
  assert.equal(typeof runtime.window.YGPHDayCycle?.startDay, "function");
  assert.equal(typeof runtime.window.YGPHDayCycle?.endDay, "function");

  runtime.evaluate(`
    persistAndRender = async function(message, meta) {
      globalThis.__DAY_CYCLE_PERSIST__ = { message, meta, snapshot: clone(state) };
    };
    state.settings.dailyTargetSatang = 55000;
    state.ride.currentRound = {
      id: "round-day-cycle-test",
      status: "ACTIVE",
      revision: 1,
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
    state.store.sales.push({ id: "sale-day-cycle-history", date: r55Today(), totalSatang: 12300, status: "COMPLETED" });
  `);

  await runtime.window.YGPHDayCycle.startDay();
  let snapshot = runtime.evaluate("clone(state)");
  const today = runtime.evaluate("r55Today()");
  assert.equal(snapshot.sync.flow.dayCycle.status, "ACTIVE");
  assert.equal(snapshot.sync.flow.dayCycle.date, today);
  assert.equal(snapshot.settings.dailyTargetSatang, 0);
  assert.equal(snapshot.ride.currentRound.id, "round-day-cycle-test", "Start Day must not auto-close a Ride round");
  assert.equal(snapshot.store.sales.some(item => item.id === "sale-day-cycle-history"), true, "Start Day must preserve source history");

  runtime.evaluate("state.settings.dailyTargetSatang = 88000");
  await runtime.window.YGPHDayCycle.endDay([]);
  snapshot = runtime.evaluate("clone(state)");
  assert.equal(snapshot.sync.flow.dayCycle.status, "ENDED");
  assert.equal(snapshot.sync.flow.dayCycle.date, today);
  assert.equal(snapshot.settings.dailyTargetSatang, 0);
  assert.equal(snapshot.ride.currentRound, null);
  const closed = snapshot.ride.rounds.find(item => item.id === "round-day-cycle-test");
  assert.ok(closed, "End Day must retain the active Ride round in history");
  assert.equal(closed.status, "ENDED");
  assert.equal(closed.closeReason, "OWNER_END_DAY");
  assert.equal(snapshot.store.sales.some(item => item.id === "sale-day-cycle-history"), true, "End Day must preserve source history");
  assert.equal(runtime.window.__DAY_CYCLE_PERSIST__.meta.eventType, "DAY_ENDED");
});

test("Day Control replaces duplicate Maintenance Reconcile with three day actions", async t => {
  const { dayControlMarkup } = loadDayCycle();
  const html = dayControlMarkup({ status: "ACTIVE", date: "2026-08-12" });
  assert.match(html, /1 · Day Control/);
  assert.match(html, /maintenanceStartDayBtn/);
  assert.match(html, /maintenanceTargetSlot/);
  assert.match(html, /maintenanceEndDaySlot/);
  assert.doesNotMatch(html, /maintenanceReconcileBtn/);

  const index = read("index.html");
  assert.equal((index.match(/id="verifyBalanceBtn"/g) || []).length, 1, "cash reconcile keeps one Settings owner");
  const maintenance = read("metropolis-maintenance.js");
  assert.match(maintenance, /id = "adjustStockBtn"/);

  const runtime = loadProductionRuntime();
  t.after(() => runtime.close());
  await runtime.flushRuntime();
  const document = runtime.window.document;
  assert.ok(document.getElementById("maintenanceStartDayBtn"));
  assert.equal(document.getElementById("maintenanceReconcileBtn"), null, "duplicate Maintenance Reconcile must be removed at runtime");
  assert.equal(document.getElementById("metroDailyTargetEdit")?.parentElement?.id, "maintenanceTargetSlot");
  assert.equal(document.getElementById("metroEndDayBtn")?.parentElement?.id, "maintenanceEndDaySlot");
  assert.equal(document.querySelectorAll("#verifyBalanceBtn").length, 1, "cash reconciliation remains at its existing owner");
});

test("day cycle asset is syntax-gated, loaded last, precached and release-declared", () => {
  loadDayCycle();
  const bootstrap = read("sw-bootstrap.js");
  const sw = read("sw.js");
  const pkg = JSON.parse(read("package.json"));
  const manifest = JSON.parse(read("RELEASE_MANIFEST.json"));
  const sums = read("SHA256SUMS.txt");

  assert.match(bootstrap, /loadScript\("metropolis-day-cycle\.js", "data-metropolis-day-cycle"\)/);
  assert.ok(bootstrap.indexOf("metropolis-day-cycle.js") > bootstrap.indexOf("metropolis-remaster.js"));
  assert.ok(sw.includes('"metropolis-day-cycle.js"'));
  assert.match(sw, /v4\.2\.6-20260812-r25-day-cycle-control/);
  assert.match(pkg.scripts["check:syntax"], /node --check metropolis-day-cycle\.js/);
  assert.ok(manifest.runtimeOrder.includes("metropolis-day-cycle.js"));
  assert.ok(manifest.serviceWorker.runtimeAssets.includes("metropolis-day-cycle.js"));
  assert.ok(manifest.productionFiles.some(item => item.path === "metropolis-day-cycle.js"));
  assert.equal(manifest.serviceWorker.releaseId, "v4.2.6-20260812-r25-day-cycle-control");
  assert.match(sums, /metropolis-day-cycle\.js/);
});
