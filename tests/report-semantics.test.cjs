"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { loadProductionRuntime } = require("./helpers/metropolis-runtime-harness.cjs");

async function reportRuntime(t) {
  const runtime = loadProductionRuntime();
  t.after(() => runtime.close());
  await runtime.flushRuntime();
  runtime.evaluate("state = normalizeState(defaultState(80000, 500000));", "report-state-fixture.js");
  return runtime;
}

function queue({ id, createdAt, due, status = "OPEN", completedAt = null, cancelledAt = null }) {
  return { id, createdAt, updatedAt: createdAt, due, status, completedAt, cancelledAt };
}

function json(runtime, expression) {
  return JSON.parse(runtime.evaluate(`JSON.stringify(${expression})`));
}

test("historical Calendar report uses queue creation and close dates instead of due dates", async t => {
  const runtime = await reportRuntime(t);
  const fixtures = {
    futureDue: queue({ id: "Q-FUTURE-DUE", createdAt: "2026-08-03T01:00:00.000Z", due: "2026-09-06" }),
    olderCreated: queue({ id: "Q-OLDER", createdAt: "2026-07-31T01:00:00.000Z", due: "2026-08-06" }),
    completedLater: queue({ id: "Q-COMPLETE-LATER", createdAt: "2026-08-10T01:00:00.000Z", due: "2026-08-20", status: "COMPLETED", completedAt: "2026-09-02T01:00:00.000Z" }),
    cancelledInside: queue({ id: "Q-CANCELLED", createdAt: "2026-08-12T01:00:00.000Z", due: "2026-08-15", status: "CANCELLED", cancelledAt: "2026-08-20T01:00:00.000Z" })
  };
  runtime.evaluate(`globalThis.__reportQueues = ${JSON.stringify(fixtures)};`);

  assert.deepEqual(json(runtime, `({
    futureCreated: queueCreatedDate(globalThis.__reportQueues.futureDue),
    futurePending: queuePendingAtEnd(globalThis.__reportQueues.futureDue, "2026-08-31"),
    olderCreated: queueCreatedDate(globalThis.__reportQueues.olderCreated),
    olderPending: queuePendingAtEnd(globalThis.__reportQueues.olderCreated, "2026-08-31"),
    laterPending: queuePendingAtEnd(globalThis.__reportQueues.completedLater, "2026-08-31"),
    cancelledPending: queuePendingAtEnd(globalThis.__reportQueues.cancelledInside, "2026-08-31")
  })`), {
    futureCreated: "2026-08-03",
    futurePending: true,
    olderCreated: "2026-07-31",
    olderPending: true,
    laterPending: true,
    cancelledPending: false
  });

  const expected = {
    futureDue: { created: 1, pending: 1 },
    olderCreated: { created: 0, pending: 1 },
    completedLater: { created: 1, pending: 1 },
    cancelledInside: { created: 1, pending: 0 }
  };
  for (const [key, values] of Object.entries(expected)) {
    runtime.evaluate(`state.calendar = [globalThis.__reportQueues[${JSON.stringify(key)}]];`);
    const report = json(runtime, `buildReportData("2026-08-01", "2026-08-31")`);
    assert.equal(report.calendar.created, values.created, `${key} created`);
    assert.equal(report.snapshot.pendingQueues, values.pending, `${key} pending`);
  }
});

test("stock report reconstructs from durable current stock and signed movement evidence", async t => {
  const runtime = await reportRuntime(t);
  const store = {
    stockQty: 5,
    stockValueSatang: 400000,
    purchases: [
      { id: "P-ACTIVE", qty: 3, date: "2026-07-01", createdAt: "2026-07-01T01:00:00.000Z", status: "ACTIVE" },
      { id: "P-RETURNED", qty: 3, date: "2026-08-05", createdAt: "2026-08-05T01:00:00.000Z", status: "CANCELLED", returnedAt: "2026-08-20T01:00:00.000Z", cancelledAt: "2026-08-20T01:00:00.000Z" }
    ],
    sales: [
      { id: "S-ACTIVE", qty: 2, date: "2026-08-10", createdAt: "2026-08-10T01:00:00.000Z", status: "COMPLETED", stockRestored: false },
      { id: "S-RESTORED", qty: 1, date: "2026-08-12", createdAt: "2026-08-12T01:00:00.000Z", status: "CANCELLED", stockRestored: true, cancelledAt: "2026-08-15T01:00:00.000Z" }
    ],
    withdrawals: [
      { id: "W-1", qty: 1, date: "2026-08-18", createdAt: "2026-08-18T01:00:00.000Z" }
    ],
    adjustments: [
      { adjustmentId: "ADJ-1", beforeQty: 3, adjustmentQty: 2, afterQty: 5, reason: "STOCK_COUNT_MISMATCH", note: "นับจริง", at: "2026-08-25T01:00:00.000Z", actor: "OWNER", affectsLedger: false, affectsValue: false }
    ]
  };
  runtime.evaluate(`state.store = ${JSON.stringify(store)};`);

  const middle = json(runtime, `calendarReportSnapshot("2026-08-01", "2026-08-14", state)`);
  assert.equal(middle.stockQty, 6);
  assert.equal(middle.stockBasis, "RECONSTRUCTED_V2");
  assert.equal(middle.stockOpeningQty, 3);
  assert.deepEqual(middle.stockMovementEvidence, {
    purchases: 2,
    sales: 2,
    withdrawals: 1,
    adjustments: 1,
    reversals: 2,
    total: 8,
    throughEnd: 4,
    inRange: 3
  });

  const august = json(runtime, `calendarReportSnapshot("2026-08-01", "2026-08-31", state)`);
  assert.equal(august.stockQty, 5, "durable current anchor must win over incomplete transaction-only history");
  assert.equal(august.stockMovementEvidence.throughEnd, 8);
  assert.equal(august.stockMovementEvidence.inRange, 7);

  const report = json(runtime, `buildReportData("2026-08-01", "2026-08-31")`);
  assert.equal(report.snapshot.stockQty, 5);
  assert.equal(report.snapshot.stockBasis, "RECONSTRUCTED_V2");
  assert.equal(report.snapshot.stockOpeningQty, 3);
  assert.deepEqual(report.snapshot.stockMovementEvidence, august.stockMovementEvidence);
});
