"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { loadProductionRuntime } = require("./helpers/metropolis-runtime-harness.cjs");

const FIXED_NOW = "2026-08-11T07:00:00.000Z";
const DUE = "2026-08-10";

function installFixedClock({ window }) {
  const NativeDate = window.Date;
  const fixedTime = NativeDate.parse(FIXED_NOW);
  class FixedDate extends NativeDate {
    constructor(...args) {
      super(...(args.length ? args : [fixedTime]));
    }
    static now() { return fixedTime; }
  }
  window.Date = FixedDate;
}

function baseSource(id, name, status = "OPEN", revision = 1) {
  return {
    id,
    name,
    status,
    revision,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    cancelledAt: status === "CANCELLED" ? FIXED_NOW : null
  };
}

function obligation(id, name, options = {}) {
  const amount = options.amountSatang || 100_000;
  const status = options.status || "OPEN";
  return {
    ...baseSource(id, name, status, options.revision || 1),
    detail: "",
    originalSatang: amount,
    paidSatang: status === "COMPLETED" ? amount : 0,
    remainingSatang: ["COMPLETED", "CANCELLED"].includes(status) ? 0 : amount,
    installmentCount: 1,
    installments: options.schedule ? [{
      number: 1,
      amountSatang: amount,
      paidSatang: 0,
      due: DUE,
      status: "PENDING",
      queueId: "Q-SCHEDULE",
      paidAt: null
    }] : [],
    scheduleMode: options.schedule ? "PER_INSTALLMENT" : undefined,
    scheduleFrequency: options.schedule ? "MONTHLY" : undefined,
    installmentAmountSatang: options.schedule ? amount : undefined,
    firstDue: options.schedule ? DUE : undefined
  };
}

function calendarQueue({ id, source, sourceId, actionType, status = "OPEN", amountSatang = 100_000, revision = 1, expectedRevision = revision, installment = false, sequence }) {
  return {
    id,
    recordId: id,
    source,
    sourceId,
    owner: source,
    recordType: "CALENDAR_ACTION",
    actionType,
    status,
    amountSatang,
    paidSatang: status === "COMPLETED" ? amountSatang : 0,
    installmentNumber: installment ? 1 : null,
    installmentCount: installment ? 1 : null,
    due: DUE,
    dueAt: `${DUE}T09:00:00+07:00`,
    triggerAt: `${DUE}T09:00:00+07:00`,
    validUntil: null,
    requiresRefreshBeforePayment: status === "VERIFY",
    effects: { complete: "ทดสอบ", cancel: "ทดสอบ" },
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    completedAt: status === "COMPLETED" ? FIXED_NOW : null,
    cancelledAt: status === "CANCELLED" ? FIXED_NOW : null,
    expectedRevision,
    sourceRevision: expectedRevision,
    revision,
    sequence,
    appliedActions: {},
    history: [{ at: "2026-08-01T00:00:00.000Z", event: "CREATED", note: "fixture" }]
  };
}

async function queueRuntime(t) {
  const runtime = loadProductionRuntime({ beforeScripts: installFixedClock });
  t.after(() => runtime.close());
  await runtime.flushRuntime();

  const sale = {
    ...baseSource("SALE-IN", "ลูกค้าทดสอบ"),
    customer: "ลูกค้าทดสอบ",
    contact: "",
    qty: 1,
    unitPriceSatang: 100_000,
    totalSatang: 100_000,
    receivedSatang: 0,
    outstandingSatang: 100_000,
    costSatang: 40_000,
    stockRestored: false,
    date: DUE,
    note: ""
  };
  const purchase = {
    ...baseSource("PURCHASE-OTHER", "สินค้าทดสอบ", "ACTIVE"),
    qty: 1,
    costSatang: 50_000,
    paidAmountSatang: 50_000,
    date: DUE
  };
  const obligations = [
    obligation("OBL-OUT", "ภาระจ่าย"),
    obligation("OBL-VERIFY", "ภาระตรวจ", { revision: 2 }),
    obligation("OBL-DONE", "ภาระเสร็จ", { status: "COMPLETED" }),
    obligation("OBL-CANCEL", "ภาระยกเลิก", { status: "CANCELLED" }),
    obligation("OBL-SCHEDULE", "ภาระรายงวด", { schedule: true })
  ];
  const calendar = [
    calendarQueue({ id: "Q-IN", source: "STORE", sourceId: sale.id, actionType: "RECEIVE_CUSTOMER_PAYMENT", sequence: 1 }),
    calendarQueue({ id: "Q-OUT", source: "LEDGER", sourceId: "OBL-OUT", actionType: "PAY_OBLIGATION", sequence: 2 }),
    calendarQueue({ id: "Q-OTHER", source: "STORE", sourceId: purchase.id, actionType: "PURCHASE_RETURN_WINDOW", sequence: 3 }),
    calendarQueue({ id: "Q-VERIFY", source: "LEDGER", sourceId: "OBL-VERIFY", actionType: "PAY_OBLIGATION", status: "VERIFY", expectedRevision: 1, sequence: 4 }),
    calendarQueue({ id: "Q-DONE", source: "LEDGER", sourceId: "OBL-DONE", actionType: "PAY_OBLIGATION", status: "COMPLETED", sequence: 5 }),
    calendarQueue({ id: "Q-CANCEL", source: "LEDGER", sourceId: "OBL-CANCEL", actionType: "PAY_OBLIGATION", status: "CANCELLED", sequence: 6 }),
    calendarQueue({ id: "Q-SCHEDULE", source: "LEDGER", sourceId: "OBL-SCHEDULE", actionType: "PAY_OBLIGATION_INSTALLMENT", installment: true, sequence: 7 })
  ];

  runtime.evaluate(`
    state = defaultState(80000, 500000);
    state.revision = 18;
    state.store.stockQty = 5;
    state.store.stockValueSatang = 200000;
    state.store.sales = [${JSON.stringify(sale)}];
    state.store.purchases = [${JSON.stringify(purchase)}];
    state.ledger.obligations = ${JSON.stringify(obligations)};
    state.calendar = ${JSON.stringify(calendar)};
    currentPage = "calendar";
    calendarMonth = "2026-08";
    selectedDate = null;
    queueFilter = "ALL";
    globalThis.__persistCalls = [];
    persistAndRender = async function(message) {
      globalThis.__persistCalls.push(message);
      renderAll();
      return { status: "VERIFIED", stateRevision: state.revision };
    };
    renderAll();
  `, "queue-action-fixture.js");
  await runtime.flushRuntime();
  return runtime;
}

function actionLabels(container) {
  return [...container.querySelectorAll("[data-queue-action]")].map(button => button.textContent.trim());
}

function card(document, id) {
  return document.querySelector(`#queueList .queue-item[data-queue-id="${id}"]`);
}

function stateSnapshot(runtime, expression) {
  return JSON.parse(runtime.evaluate(`JSON.stringify(${expression})`));
}

test("active queues expose one owner-approved three-action set on list and FLOW card", async t => {
  const runtime = await queueRuntime(t);
  const { document } = runtime.window;
  const expected = new Map([
    ["Q-IN", ["รับ", "แก้ไข", "ยกเลิก"]],
    ["Q-OUT", ["จ่าย", "แก้ไข", "ยกเลิก"]],
    ["Q-OTHER", ["ดำเนินการ", "แก้ไข", "ยกเลิก"]],
    ["Q-VERIFY", ["ยืนยัน", "แก้ไข", "ยกเลิก"]],
    ["Q-SCHEDULE", ["จ่าย", "แก้ไข", "ยกเลิก"]]
  ]);

  for (const [id, labels] of expected) assert.deepEqual(actionLabels(card(document, id)), labels, id);
  assert.deepEqual(actionLabels(card(document, "Q-DONE")), ["ประวัติ"]);
  assert.equal(card(document, "Q-CANCEL"), null);
  assert.equal(document.querySelector("[data-partial], [data-full], [data-move], [data-flow-edit]"), null);

  document.querySelector(`#monthGrid .day-cell[data-date="${DUE}"]`).click();
  await runtime.flushRuntime();
  const flowActions = new Map();
  for (let index = 0; index < 6; index += 1) {
    const buttons = [...document.querySelectorAll("#flowCalendarFocus [data-queue-action]")];
    const id = buttons[0]?.dataset.queueId;
    if (id) flowActions.set(id, buttons.map(button => button.textContent.trim()));
    document.getElementById("flowNextCard").click();
    await runtime.flushRuntime();
  }
  for (const [id, labels] of expected) assert.deepEqual(flowActions.get(id), labels, `FLOW ${id}`);
  assert.deepEqual(flowActions.get("Q-DONE"), ["ประวัติ"]);
  assert.equal(flowActions.has("Q-CANCEL"), false);
});

test("one payment modal treats maximum as full and a smaller amount as partial", async t => {
  const fullRuntime = await queueRuntime(t);
  let document = fullRuntime.window.document;
  card(document, "Q-OUT").querySelector('[data-queue-action="primary"]').click();
  assert.equal(document.getElementById("payAmount").value, "1000");
  assert.equal(document.getElementById("modalConfirm").textContent, "จ่ายเงิน");
  await fullRuntime.evaluate("modalHandler()");
  await fullRuntime.flushRuntime();
  assert.deepEqual(stateSnapshot(fullRuntime, `({
    queue: findQueue("Q-OUT").status,
    remaining: findSource("LEDGER", "OBL-OUT").remainingSatang,
    transactions: state.ledger.transactions.map(tx => ({ direction: tx.direction, amountSatang: tx.amountSatang }))
  })`), {
    queue: "COMPLETED",
    remaining: 0,
    transactions: [{ direction: "OUT", amountSatang: 100_000 }]
  });
  card(document, "Q-IN").querySelector('[data-queue-action="primary"]').click();
  assert.equal(document.getElementById("payAmount").value, "1000");
  assert.equal(document.getElementById("modalConfirm").textContent, "รับเงิน");

  const partialRuntime = await queueRuntime(t);
  document = partialRuntime.window.document;
  card(document, "Q-OUT").querySelector('[data-queue-action="primary"]').click();
  document.getElementById("payAmount").value = "400";
  await partialRuntime.evaluate("modalHandler()");
  await partialRuntime.flushRuntime();
  assert.deepEqual(stateSnapshot(partialRuntime, `({
    queue: findQueue("Q-OUT").status,
    remaining: findSource("LEDGER", "OBL-OUT").remainingSatang,
    transactions: state.ledger.transactions.map(tx => ({ direction: tx.direction, amountSatang: tx.amountSatang }))
  })`), {
    queue: "PARTIAL",
    remaining: 60_000,
    transactions: [{ direction: "OUT", amountSatang: 40_000 }]
  });

  for (const invalidAmount of ["0", "-1", "1000.01"]) {
    const invalidRuntime = await queueRuntime(t);
    document = invalidRuntime.window.document;
    const before = stateSnapshot(invalidRuntime, `({ state, persistCalls: globalThis.__persistCalls })`);
    card(document, "Q-OUT").querySelector('[data-queue-action="primary"]').click();
    document.getElementById("payAmount").value = invalidAmount;
    try {
      await invalidRuntime.evaluate("modalHandler()");
    } catch {
      // The real modal click wrapper converts parser errors into a toast.
    }
    await invalidRuntime.flushRuntime();
    assert.deepEqual(
      stateSnapshot(invalidRuntime, `({ state, persistCalls: globalThis.__persistCalls })`),
      before,
      `invalid amount ${invalidAmount} must not mutate durable state`
    );
  }
});

test("queue editor merges plan fields, schedule entry, and collapsed history", async t => {
  const runtime = await queueRuntime(t);
  const { document } = runtime.window;
  runtime.evaluate(`
    globalThis.__scheduleOpenCount = 0;
    globalThis.YGPHMetropolisSchedule = {
      isManagedQueue: id => id === "Q-SCHEDULE",
      openManager: () => { globalThis.__scheduleOpenCount += 1; }
    };
  `);

  card(document, "Q-SCHEDULE").querySelector('[data-queue-action="edit"]').click();
  assert.equal(document.getElementById("modalTitle").textContent, "แก้ไข");
  assert.equal(document.getElementById("queueEditHistory").open, false);
  document.getElementById("queueScheduleManager").click();
  assert.equal(runtime.evaluate("globalThis.__scheduleOpenCount"), 1);

  document.getElementById("queueEditName").value = "ชื่อแผนใหม่";
  document.getElementById("queueEditDue").value = "2026-08-18";
  document.getElementById("queueEditNote").value = "หมายเหตุใหม่";
  document.getElementById("queueEditReminder").checked = false;
  await runtime.evaluate("modalHandler()");
  await runtime.flushRuntime();

  assert.deepEqual(stateSnapshot(runtime, `(() => {
    const item = findQueue("Q-SCHEDULE");
    const source = findSource("LEDGER", "OBL-SCHEDULE");
    return {
      displayName: item.displayName,
      due: item.due,
      note: item.note,
      reminderEnabled: item.reminderEnabled,
      installmentDue: source.installments[0].due,
      historyEvent: item.history.at(-1).event,
      persistCalls: globalThis.__persistCalls.length
    };
  })()`), {
    displayName: "ชื่อแผนใหม่",
    due: "2026-08-18",
    note: "หมายเหตุใหม่",
    reminderEnabled: false,
    installmentDue: "2026-08-18",
    historyEvent: "PLAN_EDITED",
    persistCalls: 1
  });
});
