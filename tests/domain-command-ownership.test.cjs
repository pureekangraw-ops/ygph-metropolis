"use strict";

const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");
const { loadProductionRuntime, DEFAULT_ROOT } = require("./helpers/metropolis-runtime-harness.cjs");

function snapshot(runtime, expression) {
  return JSON.parse(runtime.evaluate(`JSON.stringify(${expression})`));
}

function sourceBetween(source, start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  assert.ok(from >= 0, `missing source marker: ${start}`);
  assert.ok(to > from, `missing end marker: ${end}`);
  return source.slice(from, to);
}

async function commandRuntime(t) {
  const runtime = loadProductionRuntime();
  t.after(() => runtime.close());
  await runtime.flushRuntime();
  runtime.evaluate(`
    state = defaultState(80000, 500000);
    state.revision = 26;
    state.sync.appliedCommandKeys = {};
    globalThis.__persistCalls = [];
    persistAndRender = async function(message, context = {}) {
      globalThis.__persistCalls.push({ message, context });
      return { status: "VERIFIED", stateRevision: state.revision };
    };
  `, "domain-command-fixture.js");
  return runtime;
}

test("production runtime publishes one Ledger/Calendar domain command owner in the correct order", async t => {
  const manifest = JSON.parse(fs.readFileSync(path.join(DEFAULT_ROOT, "RELEASE_MANIFEST.json"), "utf8"));
  const file = path.join(DEFAULT_ROOT, "metropolis-domain-commands.js");
  assert.equal(fs.existsSync(file), true, "metropolis-domain-commands.js must exist");
  const appIndex = manifest.runtimeOrder.indexOf("app.js");
  const domainIndex = manifest.runtimeOrder.indexOf("metropolis-domain-commands.js");
  const flowIndex = manifest.runtimeOrder.indexOf("flow-era.js");
  const durableIndex = manifest.runtimeOrder.indexOf("metropolis-command-gate.js");
  assert.ok(appIndex >= 0 && domainIndex > appIndex, "domain owner must load after app.js");
  assert.ok(flowIndex < 0 || domainIndex < flowIndex, "domain owner must load before extension layers");
  assert.equal(durableIndex, manifest.runtimeOrder.length - 1, "r26 durable gate remains last");

  const runtime = await commandRuntime(t);
  assert.equal(typeof runtime.window.YGPHDomainCommands, "object");
  assert.equal(runtime.window.YGPHDomainCommands.version, "1.0.0");
  assert.equal(typeof runtime.window.YGPHDomainCommands.execute, "function");
  assert.equal(typeof runtime.window.YGPHDomainCommands.supports, "function");
  for (const type of [
    "LEDGER_ADD_TRANSACTION",
    "LEDGER_REVERSE_SOURCE_TRANSACTIONS",
    "LEDGER_RECONCILE_BALANCE",
    "LEDGER_CREATE_OBLIGATION",
    "CALENDAR_CREATE_QUEUE",
    "CALENDAR_PAY_QUEUE",
    "CALENDAR_EDIT_QUEUE",
    "CALENDAR_COMPLETE_QUEUE",
    "CALENDAR_CANCEL_QUEUE"
  ]) assert.equal(runtime.window.YGPHDomainCommands.supports(type), true, type);
});

test("invalid or duplicate command envelopes fail before durable persistence", async t => {
  const runtime = await commandRuntime(t);
  const invalid = runtime.evaluate(`YGPHDomainCommands.execute({ type: "UNKNOWN", commandId: "CMD-X", idempotencyKey: "KEY-X", payload: {} })`);
  await assert.rejects(invalid, /UNSUPPORTED_DOMAIN_COMMAND/);
  assert.equal(runtime.evaluate("globalThis.__persistCalls.length"), 0);

  runtime.evaluate(`state.sync.appliedCommandKeys["DUP-1"] = { type: "LEDGER_ADD_TRANSACTION", at: nowIso() };`);
  const duplicate = runtime.evaluate(`YGPHDomainCommands.execute({
    type: "LEDGER_ADD_TRANSACTION",
    commandId: "CMD-DUP",
    idempotencyKey: "DUP-1",
    payload: { direction: "OUT", amountSatang: 10000, label: "duplicate", source: "LEDGER", sourceId: "LEDGER-CURRENT" }
  })`);
  await assert.rejects(duplicate, /DUPLICATE_DOMAIN_COMMAND/);
  assert.equal(runtime.evaluate("globalThis.__persistCalls.length"), 0);
  assert.equal(runtime.evaluate("state.ledger.transactions.length"), 0);
});

test("CALENDAR_PAY_QUEUE changes Ledger and Calendar through one durable command result", async t => {
  const runtime = await commandRuntime(t);
  runtime.evaluate(`
    state.ledger.obligations = [{
      id: "OBL-1", name: "ภาระทดสอบ", detail: "", originalSatang: 100000,
      paidSatang: 0, remainingSatang: 100000, installmentCount: 1, installments: [],
      status: "OPEN", revision: 1, createdAt: nowIso(), updatedAt: nowIso(), cancelledAt: null
    }];
    state.calendar = [{
      id: "Q-1", source: "LEDGER", sourceId: "OBL-1", actionType: "PAY_OBLIGATION",
      amountSatang: 100000, paidSatang: 0, due: localISO(), status: "OPEN",
      expectedRevision: 1, sourceRevision: 1, revision: 1, appliedActions: {}, history: [],
      createdAt: nowIso(), updatedAt: nowIso(), completedAt: null, cancelledAt: null
    }];
  `);

  await runtime.evaluate(`YGPHDomainCommands.execute({
    type: "CALENDAR_PAY_QUEUE",
    commandId: "CMD-PAY-1",
    idempotencyKey: "PAY-Q-1-40000",
    payload: { queueId: "Q-1", amountSatang: 40000 }
  })`);

  assert.deepEqual(snapshot(runtime, `({
    queueStatus: findQueue("Q-1").status,
    queuePaid: findQueue("Q-1").paidSatang,
    remaining: findSource("LEDGER", "OBL-1").remainingSatang,
    paid: findSource("LEDGER", "OBL-1").paidSatang,
    tx: state.ledger.transactions.map(item => ({ direction: item.direction, amountSatang: item.amountSatang, source: item.source, sourceId: item.sourceId })),
    persistCalls: globalThis.__persistCalls.length,
    commandRecorded: Boolean(state.sync.appliedCommandKeys["PAY-Q-1-40000"])
  })`), {
    queueStatus: "PARTIAL",
    queuePaid: 40000,
    remaining: 60000,
    paid: 40000,
    tx: [{ direction: "OUT", amountSatang: 40000, source: "LEDGER", sourceId: "OBL-1" }],
    persistCalls: 1,
    commandRecorded: true
  });
});

test("Ledger reversal remains append-only and linked", async t => {
  const runtime = await commandRuntime(t);
  runtime.evaluate(`
    state.ledger.transactions = [{
      id: "TX-ORIGINAL", direction: "OUT", amountSatang: 25000, label: "เดิม",
      source: "LEDGER", sourceId: "OBL-REV", subtype: "OBLIGATION_PAYMENT",
      actionKey: "original-action", createdAt: nowIso(), reversedBy: null
    }];
  `);

  await runtime.evaluate(`YGPHDomainCommands.execute({
    type: "LEDGER_REVERSE_SOURCE_TRANSACTIONS",
    commandId: "CMD-REV-1",
    idempotencyKey: "REV-OBL-1",
    payload: { source: "LEDGER", sourceId: "OBL-REV", reason: "ทดสอบ reversal" }
  })`);

  assert.deepEqual(snapshot(runtime, `state.ledger.transactions.map(item => ({
    id: item.id,
    direction: item.direction,
    amountSatang: item.amountSatang,
    reversalOf: item.reversalOf || null,
    reversedBy: item.reversedBy || null
  }))`), [
    { id: "TX-ORIGINAL", direction: "OUT", amountSatang: 25000, reversalOf: null, reversedBy: snapshot(runtime, "state.ledger.transactions[0].reversedBy") },
    { id: snapshot(runtime, "state.ledger.transactions[1].id"), direction: "IN", amountSatang: 25000, reversalOf: "TX-ORIGINAL", reversedBy: null }
  ]);
  assert.equal(runtime.evaluate("state.ledger.transactions[0].reversedBy === state.ledger.transactions[1].id"), true);
  assert.equal(runtime.evaluate("globalThis.__persistCalls.length"), 1);
});

test("migrated UI blocks request domain commands instead of owning durable Ledger/Calendar mutation", () => {
  const app = fs.readFileSync(path.join(DEFAULT_ROOT, "app.js"), "utf8");
  const blocks = [
    sourceBetween(app, "function openQueueEditor(id)", "async function openPayment(id)"),
    sourceBetween(app, "async function openPayment(id)", "async function completeQueue(id)"),
    sourceBetween(app, "async function completeQueue(id)", "async function cancelQueue(id)"),
    sourceBetween(app, "async function cancelQueue(id)", "function showHistory(id)"),
    sourceBetween(app, "function promptVerifyBalance(migrationPrompt = false)", "function setupActions()"),
    sourceBetween(app, 'byId("addDebtBtn").onclick', 'byId("addExpenseBtn").onclick')
  ];

  for (const block of blocks) {
    assert.match(block, /YGPHDomainCommands\.execute/);
    assert.doesNotMatch(block, /await\s+persistAndRender\s*\(/);
  }

  const combined = blocks.join("\n");
  assert.doesNotMatch(combined, /state\.ledger\.obligations\.push\s*\(/);
  assert.doesNotMatch(combined, /state\.ledger\.openingBalanceSatang\s*=/);
  assert.doesNotMatch(combined, /state\.calendar\.push\s*\(/);
  assert.doesNotMatch(combined, /\baddQueue\s*\(/);
  assert.doesNotMatch(combined, /\breverseQueuePayments\s*\(/);
});

test("one idempotency key produces one financial effect and one persistence call", async t => {
  const runtime = await commandRuntime(t);
  await runtime.evaluate(`YGPHDomainCommands.execute({
    type: "LEDGER_ADD_TRANSACTION",
    commandId: "CMD-ONE",
    idempotencyKey: "ONE-EFFECT",
    payload: { direction: "OUT", amountSatang: 12345, label: "one effect", source: "LEDGER", sourceId: "LEDGER-CURRENT" }
  })`);
  const second = runtime.evaluate(`YGPHDomainCommands.execute({
    type: "LEDGER_ADD_TRANSACTION",
    commandId: "CMD-TWO",
    idempotencyKey: "ONE-EFFECT",
    payload: { direction: "OUT", amountSatang: 12345, label: "duplicate", source: "LEDGER", sourceId: "LEDGER-CURRENT" }
  })`);
  await assert.rejects(second, /DUPLICATE_DOMAIN_COMMAND/);
  assert.deepEqual(snapshot(runtime, `({ tx: state.ledger.transactions.length, persist: globalThis.__persistCalls.length })`), { tx: 1, persist: 1 });
});
