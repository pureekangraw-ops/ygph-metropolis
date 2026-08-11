"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createRuntime,
  loadProductionRuntime,
  readRuntimeOrder
} = require("./helpers/metropolis-runtime-harness.cjs");

function errorSummary(runtime) {
  return runtime.capturedErrors
    .map(error => `${error.kind}${error.source ? `:${error.source}` : ""}: ${error.message}`)
    .join("\n");
}

test("pure extension cores compose in one classic-script realm", async t => {
  const runtime = createRuntime({
    scripts: ["metropolis-maintenance-core.js", "metropolis-remaster-core.js"]
  });
  t.after(() => runtime.close());
  await runtime.flushRuntime();

  assert.deepEqual(runtime.scriptErrors, [], errorSummary(runtime));
  assert.equal(runtime.window.YGPHMaintenanceCore?.MAINTENANCE_CORE_VERSION, "1.0.0");
  assert.equal(runtime.window.YGPHMetropolisRemasterCore?.METROPOLIS_REMASTER_CORE_VERSION, "1.0.0");
});

test("production manifest loads with zero runtime errors", async t => {
  const runtime = loadProductionRuntime();
  t.after(() => runtime.close());
  await runtime.flushRuntime();

  assert.deepEqual(runtime.capturedErrors, [], errorSummary(runtime));
  assert.deepEqual(runtime.evaluatedScripts, readRuntimeOrder());
});
