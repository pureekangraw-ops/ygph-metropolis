"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { webcrypto } = require("node:crypto");
const { loadProductionRuntime } = require("./helpers/metropolis-runtime-harness.cjs");

function vaultFixture() {
  return {
    format: "stock-pocket-vault",
    version: 1,
    kdf: { name: "PBKDF2", hash: "SHA-256", iterations: 600000, salt: "AA==" },
    cipher: { name: "AES-GCM", iv: "AAAAAAAAAAAAAAAA", tagLength: 128 },
    ciphertext: "AA==",
    updatedAt: "2026-08-11T07:00:00.000Z"
  };
}

async function adjustmentRuntime(t) {
  const runtime = loadProductionRuntime({
    beforeScripts({ window }) {
      Object.defineProperty(window.crypto, "subtle", { configurable: true, value: webcrypto.subtle });
    }
  });
  t.after(() => runtime.close());
  await runtime.flushRuntime();
  runtime.evaluate(`
    (() => {
      const durableState = normalizeState(defaultState(80000, 500000));
      durableState.revision = 18;
      durableState.store.stockQty = 5;
      durableState.store.stockValueSatang = 400000;
      let storedVault = ${JSON.stringify(vaultFixture())};
      storedVault.__testState = clone(durableState);
      state = clone(durableState);
      currentVault = clone(storedVault);
      cryptoKey = { test: true };
      currentPage = "store";
      dbGet = async key => key === VAULT_KEY ? clone(storedVault) : null;
      dbPut = async (key, value) => { if (key === VAULT_KEY) storedVault = clone(value); };
      decryptVault = async vault => clone(vault.__testState);
      encryptState = async candidate => ({ ...clone(storedVault), __testState: clone(candidate) });
      globalThis.__adjustmentDurableState = () => clone(storedVault.__testState);
      renderAll();
    })();
  `, "stock-adjustment-fixture.js");
  await runtime.flushRuntime();
  return runtime;
}

function json(runtime, expression) {
  return JSON.parse(runtime.evaluate(`JSON.stringify(${expression})`));
}

test("State normalization always supplies the durable stock-adjustment collection", async t => {
  const runtime = loadProductionRuntime();
  t.after(() => runtime.close());
  await runtime.flushRuntime();
  assert.equal(runtime.evaluate("Array.isArray(normalizeState(defaultState(80000, 500000)).store.adjustments)"), true);
  const legacy = { adjustmentId: "ADJ-LEGACY", beforeQty: 1, adjustmentQty: 1, afterQty: 2, reason: "OTHER", note: "เดิม", at: "2026-08-10T07:00:00.000Z", actor: "OWNER", affectsLedger: false, affectsStockValue: false, legacyField: "KEEP" };
  assert.deepEqual(
    json(runtime, `(() => { const value = defaultState(80000, 500000); value.store.adjustments = [${JSON.stringify(legacy)}]; return normalizeState(value).store.adjustments[0]; })()`),
    legacy
  );
});

test("real Maintenance adjustment survives read-back and FLOW exchange without cash or value effect", async t => {
  const runtime = await adjustmentRuntime(t);
  const { document } = runtime.window;
  document.getElementById("adjustStockBtn").click();
  document.getElementById("maintenanceStockMode").value = "CORRECTION";
  document.getElementById("maintenanceStockQty").value = "7";
  document.getElementById("maintenanceStockReason").value = "STOCK_COUNT_MISMATCH";
  document.getElementById("maintenanceStockNote").value = "นับของจริงหน้าร้าน";
  await runtime.evaluate("modalHandler()");

  const durable = json(runtime, "globalThis.__adjustmentDurableState()");
  assert.equal(durable.revision, 19);
  assert.equal(durable.store.stockQty, 7);
  assert.equal(durable.store.stockValueSatang, 400000);
  assert.equal(durable.ledger.transactions.length, 0);
  assert.equal(durable.store.adjustments.length, 1);
  const adjustment = durable.store.adjustments[0];
  assert.deepEqual({
    beforeQty: adjustment.beforeQty,
    adjustmentQty: adjustment.adjustmentQty,
    afterQty: adjustment.afterQty,
    reason: adjustment.reason,
    note: adjustment.note,
    actor: adjustment.actor,
    affectsLedger: adjustment.affectsLedger,
    affectsValue: adjustment.affectsValue
  }, {
    beforeQty: 5,
    adjustmentQty: 2,
    afterQty: 7,
    reason: "STOCK_COUNT_MISMATCH",
    note: "นับของจริงหน้าร้าน",
    actor: "OWNER",
    affectsLedger: false,
    affectsValue: false
  });
  assert.ok(durable.audit.some(item => item.event === "STOCK_MANUAL_ADJUSTED"));
  assert.ok(durable.events.at(-1).payload.changes.some(change => change.recordType === "STOCK_ADJUSTMENT" && change.recordId === adjustment.adjustmentId));

  const pack = await runtime.evaluate("flowBuildExchange()");
  const evidence = pack.events.find(event => event.payload?.record?.recordId === adjustment.adjustmentId);
  assert.ok(evidence, "FLOW must contain the durable adjustment evidence");
  assert.deepEqual({
    source: evidence.payload.record.source,
    type: evidence.payload.record.type,
    quantity: evidence.payload.record.quantity,
    reason: evidence.payload.record.reason,
    reviewStatus: evidence.payload.record.reviewStatus,
    proposedAction: evidence.payload.record.proposedAction,
    permission: evidence.permission
  }, {
    source: "STORE",
    type: "STOCK_ADJUSTMENT",
    quantity: 2,
    reason: "STOCK_COUNT_MISMATCH",
    reviewStatus: "MATCHED",
    proposedAction: "NONE",
    permission: "READ"
  });
});
