"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { loadProductionRuntime } = require("./helpers/metropolis-runtime-harness.cjs");

const FIXED_NOW = "2026-08-11T07:00:00.000Z";

function installFixedClock({ window }) {
  const NativeDate = window.Date;
  const fixedTime = NativeDate.parse(FIXED_NOW);
  class FixedDate extends NativeDate {
    constructor(...args) {
      super(...(args.length ? args : [fixedTime]));
    }

    static now() {
      return fixedTime;
    }
  }
  window.Date = FixedDate;
}

function obligation({ id, name, status = "OPEN", revision = 1, schedule = false }) {
  return {
    id,
    name,
    detail: "",
    originalSatang: 50_000,
    paidSatang: status === "COMPLETED" ? 50_000 : 0,
    remainingSatang: status === "COMPLETED" || status === "CANCELLED" ? 0 : 50_000,
    installmentCount: 1,
    installments: schedule ? [{
      number: 1,
      amountSatang: 50_000,
      paidSatang: 0,
      due: "2026-08-20",
      status: "PENDING",
      queueId: "Q-FUTURE",
      paidAt: null
    }] : [],
    scheduleMode: schedule ? "PER_INSTALLMENT" : undefined,
    scheduleFrequency: schedule ? "MONTHLY" : undefined,
    installmentAmountSatang: schedule ? 50_000 : undefined,
    firstDue: schedule ? "2026-08-20" : undefined,
    status,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    revision,
    cancelledAt: status === "CANCELLED" ? "2026-08-10T00:00:00.000Z" : null
  };
}

function queue({
  id,
  sourceId,
  due,
  status = "OPEN",
  actionType = "PAY_OBLIGATION",
  installment = false,
  revision = 1
}) {
  return {
    id,
    source: "LEDGER",
    sourceId,
    actionType,
    amountSatang: 50_000,
    paidSatang: status === "COMPLETED" ? 50_000 : 0,
    due,
    dueAt: `${due}T09:00:00+07:00`,
    triggerAt: `${due}T09:00:00+07:00`,
    status,
    installmentNumber: installment ? 1 : null,
    installmentCount: installment ? 1 : null,
    expectedRevision: revision,
    sourceRevision: revision,
    history: [],
    effects: { complete: "ทดสอบ", cancel: "ทดสอบ" },
    revision,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    completedAt: status === "COMPLETED" ? FIXED_NOW : null,
    cancelledAt: status === "CANCELLED" ? "2026-08-10T00:00:00.000Z" : null
  };
}

async function calendarRuntime(t) {
  const runtime = loadProductionRuntime({ beforeScripts: installFixedClock });
  t.after(() => runtime.close());
  await runtime.flushRuntime();

  const obligations = [
    obligation({ id: "OBL-DONE", name: "จ่ายแล้ว", status: "COMPLETED", revision: 2 }),
    obligation({ id: "OBL-FUTURE", name: "งวดอนาคต", schedule: true }),
    obligation({ id: "OBL-SECOND", name: "รายการถัดไป" }),
    obligation({ id: "OBL-OVERDUE", name: "เกินกำหนด" }),
    obligation({ id: "OBL-CANCELLED", name: "ยกเลิกแล้ว", status: "CANCELLED", revision: 2 })
  ];
  const calendar = [
    queue({ id: "Q-DONE", sourceId: "OBL-DONE", due: "2026-08-11", status: "COMPLETED", revision: 2 }),
    queue({ id: "Q-FUTURE", sourceId: "OBL-FUTURE", due: "2026-08-20", actionType: "PAY_OBLIGATION_INSTALLMENT", installment: true }),
    queue({ id: "Q-SECOND", sourceId: "OBL-SECOND", due: "2026-08-20" }),
    queue({ id: "Q-OVERDUE", sourceId: "OBL-OVERDUE", due: "2026-08-03" }),
    queue({ id: "Q-CANCELLED", sourceId: "OBL-CANCELLED", due: "2026-08-20", status: "CANCELLED", revision: 2 })
  ];

  runtime.evaluate(`
    state = defaultState(80000, 500000);
    state.revision = 18;
    state.ledger.obligations = ${JSON.stringify(obligations)};
    state.calendar = ${JSON.stringify(calendar)};
    currentPage = "calendar";
    calendarMonth = "2026-08";
    selectedDate = null;
    queueFilter = "ALL";
    globalThis.__calendarLifecycle = { full: 0, partial: 0, reasons: [] };
    YGPHRuntime.register("TEST_CALENDAR_LIFECYCLE", {
      afterRender() { globalThis.__calendarLifecycle.full += 1; },
      afterCalendarRender(context) {
        globalThis.__calendarLifecycle.partial += 1;
        globalThis.__calendarLifecycle.reasons.push(context.reason);
      }
    });
    renderAll();
  `, "calendar-fixture.js");
  await runtime.flushRuntime();
  return runtime;
}

function cardForQueue(document, id) {
  return document.querySelector(`#queueList .queue-item[data-queue-id="${id}"]`);
}

function actionLabels(root, id) {
  return [...root.querySelectorAll(`[data-queue-id="${id}"][data-queue-action]`)]
    .map(button => button.textContent.trim());
}

function assertMonthSignal(document, date, signal) {
  const dots = [...document.querySelectorAll(`#monthGrid .day-cell[data-date="${date}"] .r53-day-dot`)];
  assert.ok(dots.some(dot => dot.classList.contains(`r53-status-${signal}`)), `${date} should contain ${signal}`);
}

function assertLiveCalendarContract(document) {
  assertMonthSignal(document, "2026-08-11", "green");
  assertMonthSignal(document, "2026-08-20", "yellow");
  assertMonthSignal(document, "2026-08-03", "red");
  assert.equal(document.querySelector(`#monthGrid .day-cell[data-date="2026-08-20"] .day-count`)?.textContent, "2");
  assert.equal(cardForQueue(document, "Q-CANCELLED"), null, "cancelled queue must stay hidden");

  for (const card of document.querySelectorAll("#queueList .queue-item")) {
    assert.ok(card.dataset.queueId, "every live queue card must expose stable queue identity");
  }

  assert.deepEqual(actionLabels(document.getElementById("queueList"), "Q-FUTURE"), ["จ่าย", "แก้ไข", "ยกเลิก"]);
}

function lifecycleSnapshot(runtime) {
  return JSON.parse(runtime.evaluate("JSON.stringify(globalThis.__calendarLifecycle)"));
}

test("full Calendar render applies live status once and gives every card stable identity", async t => {
  const runtime = await calendarRuntime(t);
  assertLiveCalendarContract(runtime.window.document);
  assert.deepEqual(lifecycleSnapshot(runtime), { full: 1, partial: 0, reasons: [] });
});

test("direct Calendar interactions retain status, cancellation, and schedule ownership", async t => {
  const runtime = await calendarRuntime(t);
  const { document } = runtime.window;

  document.querySelector('#monthGrid .day-cell[data-date="2026-08-20"]').click();
  await runtime.flushRuntime();
  assertLiveCalendarContract(document);
  assert.equal(cardForQueue(document, "Q-FUTURE")?.querySelector(".status")?.classList.contains("r53-status-yellow"), true);
  assert.deepEqual(actionLabels(document.getElementById("flowCalendarFocus"), "Q-FUTURE"), ["จ่าย", "แก้ไข", "ยกเลิก"]);
  assert.equal(runtime.evaluate('YGPHMetropolisSchedule.isManagedQueue("Q-FUTURE")'), true);

  document.getElementById("flowNextCard").click();
  await runtime.flushRuntime();
  document.getElementById("flowPrevCard").click();
  await runtime.flushRuntime();
  assert.deepEqual(actionLabels(document.getElementById("flowCalendarFocus"), "Q-FUTURE"), ["จ่าย", "แก้ไข", "ยกเลิก"]);

  document.getElementById("flowClearDay").click();
  await runtime.flushRuntime();
  document.querySelector('[data-filter="OUT"]').click();
  await runtime.flushRuntime();
  assertLiveCalendarContract(document);

  document.getElementById("nextMonth").click();
  await runtime.flushRuntime();
  document.getElementById("prevMonth").click();
  await runtime.flushRuntime();
  document.getElementById("clearDateFilter").click();
  await runtime.flushRuntime();
  assertLiveCalendarContract(document);

  assert.deepEqual(lifecycleSnapshot(runtime), {
    full: 1,
    partial: 8,
    reasons: ["day", "flow-next", "flow-prev", "flow-clear", "filter", "next-month", "prev-month", "clear-date"]
  });
});
