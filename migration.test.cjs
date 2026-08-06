"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const core = require("../highway-gate.js");
const {
  migrateStateToCurrent,
  applyLegacySchema3ReceivablePatch,
  prepareSchema4SafetyRepair
} = require("../app.js");

const fixture = schema => require(`./fixtures/schema-${schema}.json`);
const signedBalance = state => Number(state.ledger.openingBalanceSatang || 0) + state.ledger.transactions.reduce(
  (sum, transaction) => sum + (transaction.direction === "IN" ? transaction.amountSatang : -transaction.amountSatang),
  0
);

test("Legacy Schema 1-4 fixtures load or migrate to compatible Schema 4", () => {
  const expected = {
    1: { stockQty: 5, stockValueSatang: 170000, sales: 1, purchases: 1, transactions: 3, calendar: 1, balanceSatang: -220000 },
    2: { stockQty: 5, stockValueSatang: 170000, sales: 0, purchases: 0, transactions: 0, calendar: 0, balanceSatang: 400000 },
    3: { stockQty: 5, stockValueSatang: 170000, sales: 0, purchases: 0, transactions: 0, calendar: 0, balanceSatang: 400000 },
    4: { stockQty: 5, stockValueSatang: 170000, sales: 0, purchases: 0, transactions: 0, calendar: 0, balanceSatang: 400000 }
  };

  for (const schema of [1, 2, 3, 4]) {
    const compatibility = core.compatibilityFor(schema);
    const migrated = migrateStateToCurrent(structuredClone(fixture(schema)));
    assert.equal(compatibility.supported, true, `Schema ${schema} must be supported`);
    assert.equal(migrated.schema, 4);
    assert.equal(migrated.store.stockQty, expected[schema].stockQty);
    assert.equal(migrated.store.stockValueSatang, expected[schema].stockValueSatang);
    assert.equal(migrated.store.sales.length, expected[schema].sales);
    assert.equal(migrated.store.purchases.length, expected[schema].purchases);
    assert.equal(migrated.ledger.transactions.length, expected[schema].transactions);
    assert.equal(migrated.calendar.length, expected[schema].calendar);
    assert.equal(signedBalance(migrated), expected[schema].balanceSatang);
    for (const transaction of migrated.ledger.transactions) assert.equal(Number.isSafeInteger(transaction.amountSatang), true);
  }
});

test("the named Schema 3 receivable patch is idempotent", () => {
  const state = structuredClone(fixture(3));
  const saleId = "SALE-mscw6t7o-lsmn5p";
  state.store.sales.push({
    id: saleId,
    totalSatang: 160000,
    receivedSatang: 160000,
    outstandingSatang: 80000,
    status: "PARTIAL",
    revision: 1,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z"
  });
  state.ledger.transactions.push({
    id: "TX-BAD",
    direction: "IN",
    amountSatang: 80000,
    label: "ยอดที่ต้องจัดประเภทใหม่",
    source: "STORE",
    sourceId: saleId,
    subtype: "SALE_RECEIPT",
    actionKey: "legacy:bad-receipt",
    createdAt: "2026-08-01T00:00:00.000Z",
    reversedBy: null
  });
  state.calendar.push({
    id: "Q-1",
    source: "STORE",
    sourceId: saleId,
    actionType: "RECEIVE_CUSTOMER_PAYMENT",
    status: "PARTIAL",
    amountSatang: 80000,
    paidSatang: 0,
    due: "2026-08-10",
    revision: 1,
    history: []
  });

  const beforeCount = state.ledger.transactions.length;
  const first = applyLegacySchema3ReceivablePatch(state, "2026-08-06T05:00:00.000Z");
  const second = applyLegacySchema3ReceivablePatch(state, "2026-08-06T06:00:00.000Z");

  assert.deepEqual(second, first);
  assert.equal(state.ledger.transactions.length, beforeCount + 1);
  const reversal = state.ledger.transactions.find(item => item.actionKey === "v2.1.2:receivable-reclass:SALE-mscw6t7o-lsmn5p:80000");
  assert.ok(reversal);
  assert.equal(reversal.subtype, "REVERSAL_SALE_RECEIPT");
  assert.equal(reversal.reversalOf, "TX-BAD");
  assert.equal(reversal.amountSatang, 80000);
  assert.equal(reversal.direction, "OUT");
  assert.equal(state.ledger.transactions[0].reversedBy, reversal.id);
  assert.equal("reclassifiedBy" in state.ledger.transactions[0], false);
});

test("an already-patched Schema 4 vault is repaired append-only with zero net cash change", () => {
  const state = structuredClone(fixture(4));
  const saleId = "SALE-mscw6t7o-lsmn5p";
  const patchKey = "v2.1.2:receivable-reclass:SALE-mscw6t7o-lsmn5p:80000";
  state.revision = 9;
  state.store.sales.push({
    id: saleId,
    totalSatang: 160000,
    receivedSatang: 80000,
    outstandingSatang: 80000,
    status: "PARTIAL",
    revision: 2,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-02T00:00:00.000Z"
  });
  state.ledger.transactions.push(
    {
      id: "TX-BAD", direction: "IN", amountSatang: 80000, label: "ยอดเดิม", source: "STORE",
      sourceId: saleId, subtype: "SALE_RECEIPT", actionKey: "legacy:bad-receipt",
      createdAt: "2026-08-01T00:00:00.000Z", reversedBy: null,
      reclassifiedBy: patchKey, reclassifiedAt: "2026-08-02T00:00:00.000Z"
    },
    {
      id: "TX-OLD-ADJUST", direction: "OUT", amountSatang: 80000, label: "ปรับลูกหนี้เดิม", source: "STORE",
      sourceId: saleId, subtype: "RECEIVABLE_RECLASSIFICATION", actionKey: patchKey,
      createdAt: "2026-08-02T00:00:00.000Z", reversedBy: null
    }
  );
  state.dataFixes ||= {};
  state.dataFixes[patchKey] = { appliedAt: "2026-08-02T00:00:00.000Z", amountSatang: 80000, sourceId: saleId };
  const balanceBefore = signedBalance(state);
  const originalsBefore = structuredClone(state.ledger.transactions);

  const first = prepareSchema4SafetyRepair(state, core, "2026-08-06T08:00:00.000Z");
  const second = prepareSchema4SafetyRepair(first.state, core, "2026-08-06T09:00:00.000Z");

  assert.equal(first.repaired, true);
  assert.equal(second.repaired, false);
  assert.equal(first.state.revision, 10);
  assert.equal(first.state.ledger.transactions.length, originalsBefore.length + 2);
  assert.equal(signedBalance(first.state), balanceBefore);
  assert.equal(first.state.ledger.transactions[0].amountSatang, originalsBefore[0].amountSatang);
  assert.equal(first.state.ledger.transactions[1].amountSatang, originalsBefore[1].amountSatang);
  for (const original of first.state.ledger.transactions.slice(0, 2)) {
    const reversal = first.state.ledger.transactions.find(item => item.id === original.reversedBy);
    assert.ok(reversal);
    assert.equal(reversal.reversalOf, original.id);
  }
  assert.doesNotThrow(() => core.validateReversalTopology(first.state, { allowLegacyUnlinked: true }));
  assert.equal(first.state.events.filter(event => event.eventType === "LEGACY_RECEIVABLE_EVIDENCE_REPAIRED").length, 1);
});
