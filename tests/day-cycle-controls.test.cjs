const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { loadProductionRuntime } = require("./helpers/metropolis-runtime-harness.cjs");

const root = path.resolve(__dirname, "..");
const dayCyclePath = path.join(root, "metropolis-day-cycle.js");
const read = file => fs.readFileSync(path.join(root, file), "utf8");

function loadDayCycle() {
  delete require.cache[require.resolve(dayCyclePath)];
  return require(dayCyclePath);
}

test("day cycle exposes stable lifecycle planners", () => {
  const runtime = loadDayCycle();
  assert.equal(runtime.DAY_CYCLE_VERSION, "1.0.0");
  assert.deepEqual(runtime.normalizeDayCycle(null), {
    status: "NOT_STARTED",
    date: null,
    startedAt: null,
    endedAt: null
  });

  const started = runtime.planStartDay(null, "2026-08-12", "2026-08-11T23:20:00.000Z");
  assert.deepEqual(started, {
    status: "ACTIVE",
    date: "2026-08-12",
    startedAt: "2026-08-11T23:20:00.000Z",
    endedAt: null
  });
  assert.deepEqual(runtime.planEndDay(started, "2026-08-12", "2026-08-12T15:00:00.000Z"), {
    status: "ENDED",
    date: "2026-08-12",
    startedAt: "2026-08-11T23:20:00.000Z",
    endedAt: "2026-08-12T15:00:00.000Z"
  });
});

test("day cycle source resets only operational daily state and preserves source-history ownership", () => {
  const source = read("metropolis-day-cycle.js");
  assert.match(source, /state\.settings\.dailyTargetSatang = 0/);
  assert.match(source, /closeActiveRideRound\(at\)/);
  assert.match(source, /state\.ride\.rounds\.push\(round\)/);
  assert.match(source, /state\.ride\.currentRound = null/);
  assert.match(source, /eventType: "DAY_STARTED"/);
  assert.match(source, /eventType: "DAY_ENDED"/);
  assert.doesNotMatch(source, /state\.store\.sales\s*=\s*\[\]/);
  assert.doesNotMatch(source, /state\.ledger\.transactions\s*=\s*\[\]/);
});

test("Day Control replaces duplicate Maintenance Reconcile and keeps source-specific correction owners", async t => {
  const { dayControlMarkup } = loadDayCycle();
  const html = dayControlMarkup({ status: "ACTIVE", date: "2026-08-12" });
  assert.match(html, /1 · Day Control/);
  assert.match(html, /maintenanceStartDayBtn/);
  assert.match(html, /maintenanceTargetSlot/);
  assert.match(html, /maintenanceEndDaySlot/);
  assert.doesNotMatch(html, /maintenanceReconcileBtn/);

  const runtime = loadProductionRuntime();
  t.after(() => runtime.close());
  await runtime.flushRuntime();
  runtime.evaluate("state = defaultState(); renderAll();");
  await runtime.flushRuntime();

  const document = runtime.window.document;
  assert.ok(document.getElementById("maintenanceStartDayBtn"));
  assert.equal(document.getElementById("maintenanceReconcileBtn"), null);
  assert.equal(document.getElementById("metroDailyTargetEdit")?.parentElement?.id, "maintenanceTargetSlot");
  assert.equal(document.getElementById("metroEndDayBtn")?.parentElement?.id, "maintenanceEndDaySlot");
  assert.equal(document.querySelectorAll("#verifyBalanceBtn").length, 1);
});

test("day cycle remains published under the current release owner without owning the generation itself", () => {
  const bootstrap = read("sw-bootstrap.js");
  const sw = read("sw.js");
  const pkg = JSON.parse(read("package.json"));
  const manifest = JSON.parse(read("RELEASE_MANIFEST.json"));
  const { RELEASE_ID } = require("../sw.js");

  assert.match(bootstrap, /loadScript\("metropolis-day-cycle\.js", "data-metropolis-day-cycle"\)/);
  assert.ok(bootstrap.indexOf("metropolis-day-cycle.js") < bootstrap.indexOf("metropolis-command-gate.js"));
  assert.ok(sw.includes('"metropolis-day-cycle.js"'));
  assert.match(pkg.scripts["check:syntax"], /node --check metropolis-day-cycle\.js/);
  assert.ok(manifest.runtimeOrder.includes("metropolis-day-cycle.js"));
  assert.ok(manifest.serviceWorker.runtimeAssets.includes("metropolis-day-cycle.js"));
  assert.ok(manifest.productionFiles.some(item => item.path === "metropolis-day-cycle.js"));
  assert.equal(manifest.serviceWorker.releaseId, RELEASE_ID);
} );
