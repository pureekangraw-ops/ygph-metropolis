"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const fixtureState = () => ({
  schema: 4,
  revision: 7,
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-05T00:00:00.000Z",
  settings: { defaultPriceSatang: 80000 },
  store: { stockQty: 1, stockValueSatang: 50000, sales: [], purchases: [], withdrawals: [], adjustments: [] },
  ride: { currentRound: null, rounds: [], jobs: [], expenses: [], creditBalanceSatang: 0, creditWithdrawals: [] },
  ledger: { openingBalanceSatang: 0, transactions: [], obligations: [] },
  calendar: [],
  audit: [],
  events: [],
  sync: { appliedCommandKeys: {} },
  migration: { fromSchema: null },
  dataFixes: {}
});

const clone = (value) => structuredClone(value);

const stockAdjustment = (overrides = {}) => ({
  adjustmentId: "ADJ-1",
  beforeQty: 1,
  adjustmentQty: 2,
  afterQty: 3,
  reason: "STOCK_COUNT_MISMATCH",
  note: "นับจริง",
  at: "2026-08-11T07:00:00.000Z",
  actor: "OWNER",
  affectsLedger: false,
  affectsValue: false,
  ...overrides
});

test("loads one authoritative core API without browser runtime globals", () => {
  let core;
  try {
    core = require("../highway-gate.js");
  } catch (error) {
    assert.fail(`highway-gate.js must load as a pure core: ${error.message}`);
  }

  assert.equal(typeof core.compatibilityFor, "function");
  assert.equal(typeof core.createEventEnvelope, "function");
  assert.equal(typeof core.buildPlan, "function");
  assert.equal(typeof core.validatePlan, "function");
  assert.equal(typeof core.assertReadback, "function");
});

test("publishes the Schema 1-4 compatibility matrix and blocks unknown schemas", () => {
  const core = require("../highway-gate.js");

  for (const schema of [1, 2, 3]) {
    assert.deepEqual(core.compatibilityFor(schema).migrationPath, [schema, 4]);
    assert.equal(core.compatibilityFor(schema).supported, true);
    assert.equal(core.compatibilityFor(schema).mode, "MIGRATE");
  }
  assert.equal(core.compatibilityFor(4).mode, "LOAD");
  assert.equal(core.compatibilityFor(5).supported, false);
});

test("creates one complete event envelope for a cross-domain command", () => {
  const core = require("../highway-gate.js");
  const before = fixtureState();
  const after = clone(before);
  after.revision = 8;
  after.updatedAt = "2026-08-06T01:02:03.000Z";
  after.store.sales.push({ id: "SALE-1", totalSatang: 12500, revision: 1 });

  const plan = core.buildPlan(before, after, {
    actionId: "ACT-1",
    eventType: "STORE_SALE_RECORDED",
    sourceDomain: "STORE",
    sourceOwner: "STORE",
    targetDomain: ["STORE", "LEDGER", "CALENDAR"],
    correlationId: "COR-1",
    causationId: "UI-1",
    idempotencyKey: "sale:1",
    timestamp: "2026-08-06T01:02:03.000Z",
    payloadVersion: 1
  });
  const event = core.createEventEnvelope({ plan, nextState: after, eventId: "EV-1" });

  assert.equal(event.eventId, "EV-1");
  assert.equal(event.eventType, "STORE_SALE_RECORDED");
  assert.equal(event.sourceDomain, "STORE");
  assert.equal(event.sourceOwner, "STORE");
  assert.deepEqual(event.targetDomain, ["STORE", "LEDGER", "CALENDAR"]);
  assert.equal(event.correlationId, "COR-1");
  assert.equal(event.causationId, "UI-1");
  assert.equal(event.timestamp, "2026-08-06T01:02:03.000Z");
  assert.equal(event.payloadVersion, 1);
  assert.equal(event.status, "COMMITTED_PENDING_READBACK");
  assert.equal(event.effectContract.cashTruth, "LEDGER_ONLY");
  assert.equal(event.effectContract.relatedRecordsAreNotExtraCash, true);
  assert.equal(event.provenance.sourceRevision, 7);
  assert.equal(event.stateRevision.before, 7);
  assert.equal(event.stateRevision.after, 8);
  assert.match(event.expectedDurableHash, /^fnv1a-[0-9a-f]{8}$/);
  assert.match(event.checksum, /^fnv1a-[0-9a-f]{8}$/);
});

test("rejects direct deletion from protected history", () => {
  const core = require("../highway-gate.js");
  const before = fixtureState();
  before.store.sales.push({ id: "SALE-1", totalSatang: 10000, revision: 1 });
  const after = clone(before);
  after.store.sales = [];
  const plan = core.buildPlan(before, after, { idempotencyKey: "delete:1" });

  assert.throws(() => core.validatePlan(plan, before, after), /ห้ามลบ|delet/i);
});

test("rejects duplicate action keys and invalid satang", () => {
  const core = require("../highway-gate.js");
  const before = fixtureState();
  const after = clone(before);
  after.ledger.transactions.push(
    { id: "TX-1", direction: "IN", amountSatang: 1000, source: "LEDGER", sourceId: "A", subtype: "DIRECT", actionKey: "same", createdAt: "2026-08-06T00:00:00.000Z", reversedBy: null },
    { id: "TX-2", direction: "OUT", amountSatang: 1050, source: "LEDGER", sourceId: "B", subtype: "DIRECT", actionKey: "same", createdAt: "2026-08-06T00:00:00.000Z", reversedBy: null }
  );
  const plan = core.buildPlan(before, after, { idempotencyKey: "money:1" });

  assert.throws(() => core.validatePlan(plan, before, after), /actionKey.*ซ้ำ|duplicate.*actionKey/i);

  after.ledger.transactions[1].actionKey = "different";
  after.ledger.transactions[1].amountSatang = 10.5;
  const amountPlan = core.buildPlan(before, after, { idempotencyKey: "money:2" });
  assert.throws(() => core.validatePlan(amountPlan, before, after), /สตางค์|amount/i);
});

test("rejects fractional satang anywhere in Store, Ride, Ledger, or settings", () => {
  const core = require("../highway-gate.js");
  const cases = [
    ["settings.defaultPriceSatang", state => { state.settings.defaultPriceSatang = 80000.5; }],
    ["store.sales.totalSatang", state => { state.store.sales.push({ id: "SALE-FRACTION", totalSatang: 100.5 }); }],
    ["store.purchases.costSatang", state => { state.store.purchases.push({ id: "BUY-FRACTION", costSatang: 100.5 }); }],
    ["store.withdrawals.costSatang", state => { state.store.withdrawals.push({ id: "WD-FRACTION", costSatang: 100.5 }); }],
    ["ride.jobs.amountSatang", state => { state.ride.jobs.push({ id: "JOB-FRACTION", amountSatang: 100.5 }); }],
    ["ride.expenses.amountSatang", state => { state.ride.expenses.push({ id: "EXP-FRACTION", amountSatang: 100.5 }); }],
    ["ride.creditBalanceSatang", state => { state.ride.creditBalanceSatang = 100.5; }],
    ["ride.creditWithdrawals.amountSatang", state => { state.ride.creditWithdrawals.push({ id: "CW-FRACTION", amountSatang: 100.5 }); }]
  ];

  for (const [label, mutate] of cases) {
    const candidate = fixtureState();
    mutate(candidate);
    assert.throws(
      () => core.validateStateAmounts(candidate),
      /สตางค์|จำนวนเต็ม/,
      label
    );
  }
});

test("grandfathers an unchanged legacy transaction without actionKey but blocks a new one", () => {
  const core = require("../highway-gate.js");
  const before = fixtureState();
  before.ledger.transactions.push({
    id: "TX-LEGACY",
    direction: "IN",
    amountSatang: 2500,
    label: "รายการเดิม",
    source: "GENERAL",
    sourceId: "LEGACY-1",
    subtype: "DIRECT",
    createdAt: "2026-08-01T00:00:00.000Z",
    reversedBy: null
  });
  const after = clone(before);
  after.settings.themeColor = "green";
  assert.doesNotThrow(() => core.validatePlan(
    core.buildPlan(before, after, { idempotencyKey: "settings:legacy-compatible" }),
    before,
    after
  ));

  after.ledger.transactions.push({
    id: "TX-NEW",
    direction: "OUT",
    amountSatang: 1000,
    label: "รายการใหม่ที่ไม่มี key",
    source: "GENERAL",
    sourceId: "NEW-1",
    subtype: "DIRECT",
    createdAt: "2026-08-06T00:00:00.000Z",
    reversedBy: null
  });
  assert.throws(() => core.validatePlan(
    core.buildPlan(before, after, { idempotencyKey: "new:missing-key" }),
    before,
    after
  ), /actionKey/);
});

test("rejects mutation of completed money and accepts a linked reversal", () => {
  const core = require("../highway-gate.js");
  const before = fixtureState();
  before.ledger.transactions.push({
    id: "TX-1", direction: "IN", amountSatang: 1000, label: "เดิม", source: "LEDGER",
    sourceId: "INC-1", subtype: "DIRECT", actionKey: "income:1", createdAt: "2026-08-01T00:00:00.000Z", reversedBy: null
  });
  const changed = clone(before);
  changed.ledger.transactions[0].amountSatang = 2000;
  assert.throws(
    () => core.validatePlan(core.buildPlan(before, changed, { idempotencyKey: "edit:1" }), before, changed),
    /Reversal|แก้ทับ/i
  );

  const reversed = clone(before);
  reversed.ledger.transactions[0].reversedBy = "TX-R1";
  reversed.ledger.transactions.push({
    id: "TX-R1", direction: "OUT", amountSatang: 1000, label: "ย้อน เดิม", source: "LEDGER",
    sourceId: "INC-1", subtype: "REVERSAL_DIRECT", actionKey: "reverse:TX-1", createdAt: "2026-08-06T00:00:00.000Z",
    reversalOf: "TX-1", reversedBy: null
  });
  assert.doesNotThrow(() => core.validatePlan(
    core.buildPlan(before, reversed, { idempotencyKey: "reverse:1" }), before, reversed
  ));
});

test("rejects sharing one reversal between multiple original transactions", () => {
  const core = require("../highway-gate.js");
  const before = fixtureState();
  for (const id of ["TX-1", "TX-2"]) {
    before.ledger.transactions.push({
      id, direction: "IN", amountSatang: 1000, label: id, source: "LEDGER",
      sourceId: "INC-SAME", subtype: "DIRECT", actionKey: `income:${id}`,
      createdAt: "2026-08-01T00:00:00.000Z", reversedBy: null
    });
  }
  const after = clone(before);
  after.ledger.transactions[0].reversedBy = "TX-R1";
  after.ledger.transactions[1].reversedBy = "TX-R1";
  after.ledger.transactions.push({
    id: "TX-R1", direction: "OUT", amountSatang: 1000, label: "ย้อนรายการ", source: "LEDGER",
    sourceId: "INC-SAME", subtype: "REVERSAL_DIRECT", actionKey: "reverse:shared",
    createdAt: "2026-08-06T00:00:00.000Z", reversedBy: null
  });

  assert.throws(
    () => core.validatePlan(core.buildPlan(before, after, { idempotencyKey: "reverse:shared-plan" }), before, after),
    /Reversal|เชื่อม|ซ้ำ/i
  );
});

test("state topology validation rejects shared links but accepts one unambiguous legacy link", () => {
  const core = require("../highway-gate.js");
  const state = fixtureState();
  for (const id of ["TX-1", "TX-2"]) {
    state.ledger.transactions.push({
      id, direction: "IN", amountSatang: 1000, label: id, source: "LEDGER",
      sourceId: "INC-SAME", subtype: "DIRECT", actionKey: `income:${id}`,
      createdAt: "2026-08-01T00:00:00.000Z", reversedBy: "TX-R1"
    });
  }
  state.ledger.transactions.push({
    id: "TX-R1", direction: "OUT", amountSatang: 1000, label: "ย้อนรายการ", source: "LEDGER",
    sourceId: "INC-SAME", subtype: "REVERSAL_DIRECT", actionKey: "reverse:shared",
    createdAt: "2026-08-06T00:00:00.000Z", reversalOf: "TX-1", reversedBy: null
  });
  assert.throws(() => core.validateReversalTopology(state, { allowLegacyUnlinked: true }), /Reversal|เชื่อม|ซ้ำ/i);

  state.ledger.transactions[1].reversedBy = null;
  delete state.ledger.transactions[2].reversalOf;
  assert.doesNotThrow(() => core.validateReversalTopology(state, { allowLegacyUnlinked: true }));
  assert.throws(() => core.validateReversalTopology(state), /Reversal|เชื่อม/i);
});

test("rejects a queue that cannot link back to its source", () => {
  const core = require("../highway-gate.js");
  const before = fixtureState();
  const after = clone(before);
  after.calendar.push({
    id: "Q-1", source: "STORE", sourceId: "MISSING", actionType: "RECEIVE_CUSTOMER_PAYMENT",
    status: "OPEN", amountSatang: 1000, paidSatang: 0, due: "2026-08-10"
  });
  const plan = core.buildPlan(before, after, { idempotencyKey: "queue:1" });

  assert.throws(() => core.validatePlan(plan, before, after), /Source|ต้นทาง/i);
});

test("allows an existing orphan queue to move only into VERIFY quarantine", () => {
  const core = require("../highway-gate.js");
  const before = fixtureState();
  before.calendar.push({
    id: "Q-LEGACY", source: "STORE", sourceId: "MISSING", actionType: "RECEIVE_CUSTOMER_PAYMENT",
    status: "OPEN", amountSatang: 1000, paidSatang: 0, due: "2026-08-10", revision: 1
  });
  const after = clone(before);
  after.calendar[0].status = "VERIFY";
  after.calendar[0].requiresRefreshBeforePayment = true;
  after.calendar[0].revision = 2;
  const plan = core.buildPlan(before, after, { idempotencyKey: "quarantine:q-legacy" });

  assert.doesNotThrow(() => core.validatePlan(plan, before, after));
});

test("read-back compares the durable projection, not only revision", () => {
  const core = require("../highway-gate.js");
  const expected = fixtureState();
  const actual = clone(expected);
  assert.match(core.assertReadback(expected, actual), /^fnv1a-/);

  actual.store.stockQty = 99;
  assert.throws(() => core.assertReadback(expected, actual), /READBACK|อ่านกลับ/i);
});

test("read-back ignores undefined fields that JSON storage cannot persist", () => {
  const core = require("../highway-gate.js");
  const expected = fixtureState();
  expected.settings.legacyOptional = undefined;
  expected.sync.flow = { pendingApplyPackageId: undefined, pendingApplyKeys: [] };
  const actual = JSON.parse(JSON.stringify(expected));

  assert.doesNotThrow(() => core.assertReadback(expected, actual));
});

test("rejects malformed stock-adjustment topology and duplicate durable identity", () => {
  const core = require("../highway-gate.js");
  const cases = [
    ["fractional before", { beforeQty: 1.5 }],
    ["broken equation", { adjustmentQty: 1, afterQty: 9 }],
    ["negative result", { beforeQty: 1, adjustmentQty: -2, afterQty: -1 }],
    ["ledger effect", { affectsLedger: true }],
    ["value effect", { affectsValue: true }],
    ["missing effect contract", { affectsValue: undefined }],
    ["invalid timestamp", { at: "not-a-date" }]
  ];
  for (const [label, overrides] of cases) {
    const before = fixtureState();
    const after = clone(before);
    after.store.stockQty = Math.max(0, Number(overrides.afterQty ?? 3));
    after.store.adjustments.push(stockAdjustment(overrides));
    const plan = core.buildPlan(before, after, { idempotencyKey: `adjustment:invalid:${label}` });
    assert.throws(() => core.validatePlan(plan, before, after), /Adjustment|adjustment|ปรับสต็อก|สมการ|จำนวนเต็ม|ผลกระทบ|เวลา/i, label);
  }

  const before = fixtureState();
  const duplicate = clone(before);
  duplicate.store.adjustments.push(stockAdjustment(), stockAdjustment({ note: "ซ้ำ" }));
  assert.throws(() => core.buildPlan(before, duplicate, { idempotencyKey: "adjustment:duplicate" }), /ซ้ำ|duplicate/i);
});

test("stock-adjustment evidence is append-only and immutable", () => {
  const core = require("../highway-gate.js");
  const before = fixtureState();
  before.store.stockQty = 3;
  before.store.adjustments.push(stockAdjustment());

  const mutated = clone(before);
  mutated.store.adjustments[0].note = "แก้ย้อนหลัง";
  assert.throws(
    () => core.validatePlan(core.buildPlan(before, mutated, { idempotencyKey: "adjustment:mutate" }), before, mutated),
    /แก้|immutable|Adjustment|หลักฐาน/i
  );

  const deleted = clone(before);
  deleted.store.adjustments = [];
  assert.throws(
    () => core.validatePlan(core.buildPlan(before, deleted, { idempotencyKey: "adjustment:delete" }), before, deleted),
    /ห้ามลบ|Adjustment|หลักฐาน/i
  );
});

test("accepts one valid stock-adjustment append including legacy value-effect compatibility", () => {
  const core = require("../highway-gate.js");
  const before = fixtureState();
  const after = clone(before);
  after.revision = 8;
  after.store.stockQty = 3;
  after.store.adjustments.push(stockAdjustment());
  assert.doesNotThrow(() => core.validatePlan(
    core.buildPlan(before, after, { idempotencyKey: "adjustment:append", sourceDomain: "STORE", targetDomain: ["STORE"] }),
    before,
    after
  ));

  const legacyBefore = clone(after);
  delete legacyBefore.store.adjustments[0].affectsValue;
  legacyBefore.store.adjustments[0].affectsStockValue = false;
  const legacyAfter = clone(legacyBefore);
  legacyAfter.settings.themeColor = "green";
  assert.doesNotThrow(() => core.validatePlan(
    core.buildPlan(legacyBefore, legacyAfter, { idempotencyKey: "adjustment:legacy-compatible" }),
    legacyBefore,
    legacyAfter
  ));
});
