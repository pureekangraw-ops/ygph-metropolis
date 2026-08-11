"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { loadProductionRuntime } = require("./helpers/metropolis-runtime-harness.cjs");

const FIXED_NOW = "2026-08-11T07:00:00.000Z";

function installFixedClock({ window }) {
  const NativeDate = window.Date;
  const fixedTime = NativeDate.parse(FIXED_NOW);
  class FixedDate extends NativeDate {
    constructor(...args) { super(...(args.length ? args : [fixedTime])); }
    static now() { return fixedTime; }
  }
  window.Date = FixedDate;
}

async function formRuntime(t, page) {
  const runtime = loadProductionRuntime({ beforeScripts: installFixedClock });
  t.after(() => runtime.close());
  await runtime.flushRuntime();
  runtime.evaluate(`
    state = defaultState(80000, 500000);
    state.revision = 18;
    state.store.stockQty = 5;
    state.store.stockValueSatang = 250000;
    currentPage = ${JSON.stringify(page)};
    calendarMonth = "2026-08";
    globalThis.__persistCalls = [];
    persistAndRender = async function(message) {
      globalThis.__persistCalls.push(message);
      renderAll();
      return { status: "VERIFIED", stateRevision: state.revision };
    };
    renderAll();
  `, "progressive-form-fixture.js");
  await runtime.flushRuntime();
  return runtime;
}

function setValue(window, element, value, eventName = "input") {
  element.value = value;
  element.dispatchEvent(new window.Event(eventName, { bubbles: true }));
}

function snapshot(runtime, expression) {
  return JSON.parse(runtime.evaluate(`JSON.stringify(${expression})`));
}

test("winning Sale handler reveals only shipping and outstanding fields when needed", async t => {
  const runtime = await formRuntime(t, "store");
  const { document } = runtime.window;
  document.getElementById("addSaleBtn").click();

  const shippingToggle = document.getElementById("saleHasShippingCost");
  const shippingField = document.getElementById("saleShippingCostField");
  const shippingInput = document.getElementById("saleShippingCost");
  const customerField = document.getElementById("saleCustomerField");
  const customerInput = document.getElementById("saleCustomer");
  const dueField = document.getElementById("saleDueField");
  const dueInput = document.getElementById("saleDue");
  const more = document.getElementById("saleMoreDetails");

  assert.match(shippingToggle.closest("label").textContent, /มีค่าจัดส่ง/);
  assert.equal(shippingToggle.checked, false);
  assert.equal(shippingField.hidden, true);
  assert.equal(shippingInput.disabled, true);
  assert.equal(customerField.hidden, false);
  assert.equal(customerInput.required, true);
  assert.equal(dueField.hidden, false);
  assert.equal(dueInput.required, true);
  assert.equal(more.open, false);
  assert.match(more.querySelector("summary").textContent, /ดูรายละเอียดเพิ่ม/);

  shippingToggle.click();
  assert.equal(shippingField.hidden, false);
  assert.equal(shippingInput.disabled, false);
  shippingInput.value = "50";
  shippingToggle.click();
  assert.equal(shippingField.hidden, true);
  assert.equal(shippingInput.disabled, true);
  assert.equal(shippingInput.value, "");

  setValue(runtime.window, document.getElementById("saleReceived"), "800");
  assert.equal(customerField.hidden, true);
  assert.equal(customerInput.disabled, true);
  assert.equal(customerInput.required, false);
  assert.equal(dueField.hidden, true);
  assert.equal(dueInput.disabled, true);
  assert.equal(dueInput.required, false);

  setValue(runtime.window, document.getElementById("saleReceived"), "200");
  assert.equal(customerField.hidden, false);
  assert.equal(customerInput.disabled, false);
  assert.equal(customerInput.required, true);
  assert.equal(dueField.hidden, false);
  assert.equal(dueInput.disabled, false);
  assert.equal(dueInput.required, true);

  document.getElementById("modalCancel").click();
  document.getElementById("addSaleBtn").click();
  assert.equal(document.getElementById("saleHasShippingCost").checked, false);
  assert.equal(document.getElementById("saleShippingCostField").hidden, true);
  assert.equal(document.getElementById("saleMoreDetails").open, false);
});

test("progressive Sale form preserves stock, cash, shipping cost, and one receivable", async t => {
  const runtime = await formRuntime(t, "store");
  const { document } = runtime.window;
  document.getElementById("addSaleBtn").click();

  setValue(runtime.window, document.getElementById("saleQty"), "1");
  setValue(runtime.window, document.getElementById("saleUnitPrice"), "800");
  setValue(runtime.window, document.getElementById("saleReceived"), "300");
  document.getElementById("saleHasShippingCost").click();
  setValue(runtime.window, document.getElementById("saleShippingCost"), "50");
  document.getElementById("saleCustomer").value = "ลูกค้าทดสอบ";
  document.getElementById("saleDue").value = "2026-08-20";
  document.getElementById("saleMoreDetails").open = true;
  document.getElementById("saleContact").value = "โทร 0800000000";
  document.getElementById("saleNote").value = "ส่งหน้าร้าน";
  document.getElementById("modalConfirm").click();
  await runtime.flushRuntime();

  assert.deepEqual(snapshot(runtime, `(() => {
    const sale = state.store.sales[0];
    const queue = state.calendar[0];
    return {
      stockQty: state.store.stockQty,
      stockValueSatang: state.store.stockValueSatang,
      sale: {
        customer: sale.customer,
        contact: sale.contact,
        note: sale.note,
        totalSatang: sale.totalSatang,
        receivedSatang: sale.receivedSatang,
        outstandingSatang: sale.outstandingSatang,
        shippingCostSatang: sale.shippingCostSatang,
        netCashEffectSatang: sale.netCashEffectSatang
      },
      transactions: state.ledger.transactions.map(tx => ({ direction: tx.direction, amountSatang: tx.amountSatang, subtype: tx.subtype })),
      queue: { actionType: queue.actionType, amountSatang: queue.amountSatang, due: queue.due },
      persistCalls: globalThis.__persistCalls.length
    };
  })()`), {
    stockQty: 4,
    stockValueSatang: 200000,
    sale: {
      customer: "ลูกค้าทดสอบ",
      contact: "โทร 0800000000",
      note: "ส่งหน้าร้าน",
      totalSatang: 80000,
      receivedSatang: 30000,
      outstandingSatang: 50000,
      shippingCostSatang: 5000,
      netCashEffectSatang: 25000
    },
    transactions: [
      { direction: "IN", amountSatang: 30000, subtype: "SALE_INITIAL_RECEIPT" },
      { direction: "OUT", amountSatang: 5000, subtype: "SALE_SHIPPING_COST" }
    ],
    queue: { actionType: "RECEIVE_CUSTOMER_PAYMENT", amountSatang: 50000, due: "2026-08-20" },
    persistCalls: 1
  });
});

test("winning Obligation handler keeps note and schedule preview collapsed without changing its schedule", async t => {
  const runtime = await formRuntime(t, "ledger");
  const { document } = runtime.window;
  document.getElementById("addDebtBtn").click();

  assert.ok(document.getElementById("debtInstallmentAmount"), "R5-2 must remain the final Obligation handler");
  assert.equal(document.getElementById("debtAmount"), null, "legacy total-amount handler must not win");
  const noteToggle = document.getElementById("debtHasDetail");
  const noteField = document.getElementById("debtDetailField");
  const noteInput = document.getElementById("debtDetail");
  const schedule = document.getElementById("debtScheduleDetails");
  const preview = document.getElementById("debtSchedulePreview");

  assert.match(noteToggle.closest("label").textContent, /เพิ่มหมายเหตุ/);
  assert.equal(noteToggle.checked, false);
  assert.equal(noteField.hidden, true);
  assert.equal(noteInput.disabled, true);
  assert.equal(schedule.open, false);
  assert.match(schedule.querySelector("summary").textContent, /ดูตารางงวด/);

  setValue(runtime.window, document.getElementById("debtInstallmentAmount"), "300");
  setValue(runtime.window, document.getElementById("debtInstallments"), "3");
  setValue(runtime.window, document.getElementById("debtFrequency"), "WEEKLY", "change");
  setValue(runtime.window, document.getElementById("debtDue"), "2026-08-11", "change");
  assert.equal(schedule.open, false);
  assert.match(preview.textContent, /3 งวด/);
  assert.match(preview.textContent, /900/);

  noteToggle.click();
  assert.equal(noteField.hidden, false);
  assert.equal(noteInput.disabled, false);
  noteInput.value = "ผ่อนรายสัปดาห์";
  document.getElementById("debtName").value = "ค่าอุปกรณ์";
  document.getElementById("modalConfirm").click();
  await runtime.flushRuntime();

  assert.deepEqual(snapshot(runtime, `(() => {
    const source = state.ledger.obligations[0];
    return {
      source: {
        name: source.name,
        detail: source.detail,
        scheduleMode: source.scheduleMode,
        scheduleFrequency: source.scheduleFrequency,
        installmentAmountSatang: source.installmentAmountSatang,
        originalSatang: source.originalSatang,
        installmentCount: source.installmentCount,
        firstDue: source.firstDue,
        installments: source.installments.map(item => ({ amountSatang: item.amountSatang, due: item.due }))
      },
      queues: state.calendar.map(item => ({ amountSatang: item.amountSatang, due: item.due, installmentNumber: item.installmentNumber })),
      persistCalls: globalThis.__persistCalls.length
    };
  })()`), {
    source: {
      name: "ค่าอุปกรณ์",
      detail: "ผ่อนรายสัปดาห์",
      scheduleMode: "PER_INSTALLMENT",
      scheduleFrequency: "WEEKLY",
      installmentAmountSatang: 30000,
      originalSatang: 90000,
      installmentCount: 3,
      firstDue: "2026-08-11",
      installments: [
        { amountSatang: 30000, due: "2026-08-11" },
        { amountSatang: 30000, due: "2026-08-18" },
        { amountSatang: 30000, due: "2026-08-25" }
      ]
    },
    queues: [
      { amountSatang: 30000, due: "2026-08-11", installmentNumber: 1 },
      { amountSatang: 30000, due: "2026-08-18", installmentNumber: 2 },
      { amountSatang: 30000, due: "2026-08-25", installmentNumber: 3 }
    ],
    persistCalls: 1
  });

  document.getElementById("addDebtBtn").click();
  assert.equal(document.getElementById("debtHasDetail").checked, false);
  assert.equal(document.getElementById("debtDetailField").hidden, true);
  assert.equal(document.getElementById("debtDetail").disabled, true);
  assert.equal(document.getElementById("debtScheduleDetails").open, false);
});
