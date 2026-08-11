"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
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

async function guardRuntime(t) {
  const runtime = loadProductionRuntime();
  t.after(() => runtime.close());
  await runtime.flushRuntime();
  runtime.evaluate(`
    (() => {
      const durableState = normalizeState(defaultState(80000, 500000));
      durableState.revision = 18;
      let storedVault = ${JSON.stringify(vaultFixture())};
      storedVault.__testState = clone(durableState);
      let pendingResolve = null;
      let pendingReject = null;
      let pendingVault = null;
      let mode = "DEFER";
      state = clone(durableState);
      currentVault = clone(storedVault);
      cryptoKey = { test: true };
      currentPage = "ride";
      dbGet = async key => key === VAULT_KEY ? clone(storedVault) : null;
      dbPut = async (key, value) => {
        if (key !== VAULT_KEY) return;
        globalThis.__guard.writeCalls += 1;
        if (mode === "DEFER") {
          pendingVault = clone(value);
          await new Promise((resolve, reject) => { pendingResolve = resolve; pendingReject = reject; });
          return;
        }
        storedVault = clone(value);
      };
      decryptVault = async vault => clone(vault.__testState);
      encryptState = async candidate => ({ ...clone(storedVault), __testState: clone(candidate) });
      globalThis.__guard = {
        writeCalls: 0,
        isWritePending: () => Boolean(pendingResolve || pendingReject),
        resolveWrite() {
          storedVault = clone(pendingVault);
          mode = "IMMEDIATE";
          const resolve = pendingResolve;
          pendingResolve = null;
          pendingReject = null;
          resolve();
        },
        rejectWrite() {
          mode = "IMMEDIATE";
          const reject = pendingReject;
          pendingResolve = null;
          pendingReject = null;
          reject(new Error("deferred write failed"));
        },
        snapshot: () => ({
          revision: state.revision,
          currentRound: state.ride.currentRound ? { id: state.ride.currentRound.id, status: state.ride.currentRound.status } : null,
          rounds: state.ride.rounds.length,
          audit: state.audit.length,
          writeCalls: globalThis.__guard.writeCalls,
          durableHash: YGPHCore.hash(storedVault.__testState)
        })
      };
      renderAll();
    })();
  `, "durable-guard-fixture.js");
  return runtime;
}

async function waitFor(runtime, expression, label) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (runtime.evaluate(expression)) return;
    await new Promise(resolve => setImmediate(resolve));
  }
  throw new Error(`Timed out waiting for ${label}`);
}

function json(runtime, expression) {
  return JSON.parse(runtime.evaluate(`JSON.stringify(${expression})`));
}

test("durable write disables live buttons before a second UI action can mutate memory", async t => {
  const runtime = await guardRuntime(t);
  const { document } = runtime.window;
  const roundButton = document.getElementById("toggleRoundBtn");
  const installButton = document.getElementById("installBtn");
  assert.equal(roundButton.disabled, false);
  assert.equal(installButton.disabled, true, "fixture needs one pre-disabled control");

  const firstAction = runtime.evaluate('byId("toggleRoundBtn").onclick()');
  await waitFor(runtime, "globalThis.__guard.isWritePending()", "deferred Vault write");
  assert.equal(document.getElementById("appShell").getAttribute("aria-busy"), "true");
  assert.equal(document.querySelectorAll("button:not(:disabled)").length, 0);
  const beforeSecondClick = json(runtime, "globalThis.__guard.snapshot()");

  roundButton.click();
  assert.deepEqual(json(runtime, "globalThis.__guard.snapshot()"), beforeSecondClick, "disabled UI must not run the second round handler");

  runtime.evaluate("globalThis.__guard.resolveWrite()");
  await firstAction;
  await waitFor(runtime, "durableCommitInProgress === false", "commit completion");
  assert.deepEqual(json(runtime, `({
    revision: state.revision,
    currentRoundStatus: state.ride.currentRound?.status,
    rounds: state.ride.rounds.length,
    writeCalls: globalThis.__guard.writeCalls
  })`), { revision: 19, currentRoundStatus: "ACTIVE", rounds: 0, writeCalls: 1 });
  assert.equal(document.getElementById("appShell").hasAttribute("aria-busy"), false);
  assert.equal(roundButton.disabled, false);
  assert.equal(installButton.disabled, true, "pre-disabled control must remain disabled");
});

test("failed durable write restores controls, rolls back UI, and permits one clean retry", async t => {
  const runtime = await guardRuntime(t);
  const { document } = runtime.window;
  const roundButton = document.getElementById("toggleRoundBtn");
  const installButton = document.getElementById("installBtn");

  const failedAction = runtime.evaluate('byId("toggleRoundBtn").onclick()');
  await waitFor(runtime, "globalThis.__guard.isWritePending()", "failed deferred Vault write");
  assert.equal(roundButton.disabled, true);
  runtime.evaluate("globalThis.__guard.rejectWrite()");
  await assert.rejects(() => failedAction, /deferred write failed/);
  await waitFor(runtime, "durableCommitInProgress === false", "failed commit rollback");

  assert.deepEqual(json(runtime, `({
    revision: state.revision,
    currentRound: state.ride.currentRound,
    rounds: state.ride.rounds.length,
    writeCalls: globalThis.__guard.writeCalls
  })`), { revision: 18, currentRound: null, rounds: 0, writeCalls: 2 });
  assert.equal(document.getElementById("appShell").hasAttribute("aria-busy"), false);
  assert.equal(roundButton.disabled, false);
  assert.equal(installButton.disabled, true);

  await runtime.evaluate('byId("toggleRoundBtn").onclick()');
  assert.deepEqual(json(runtime, `({ revision: state.revision, status: state.ride.currentRound?.status, rounds: state.ride.rounds.length })`), {
    revision: 19,
    status: "ACTIVE",
    rounds: 0
  });
  assert.equal(roundButton.disabled, false);
  assert.equal(installButton.disabled, true);
});

test("purchase-return cancellation advances its source revision exactly once", async t => {
  const runtime = loadProductionRuntime();
  t.after(() => runtime.close());
  await runtime.flushRuntime();
  runtime.evaluate(`
    (() => {
      const createdAt = "2026-08-01T01:00:00.000Z";
      const purchase = { id: "BUY-1", name: "สินค้า", qty: 2, costSatang: 10000, paidAmountSatang: 10000, status: "ACTIVE", date: "2026-08-01", createdAt, updatedAt: createdAt, revision: 3, cancelledAt: null };
      const queue = {
        id: "Q-RETURN", recordId: "Q-RETURN", source: "STORE", sourceId: purchase.id, owner: "STORE", recordType: "CALENDAR_ACTION",
        revision: 1, actionType: "PURCHASE_RETURN_WINDOW", status: "OPEN", amountSatang: 10000, paidSatang: 0,
        installmentNumber: null, installmentCount: null, due: "2026-08-01", dueAt: "2026-08-01T09:00:00+07:00", triggerAt: "2026-08-01T09:00:00+07:00",
        validUntil: null, requiresRefreshBeforePayment: false, effects: { complete: "เก็บ", cancel: "คืน" }, createdAt, updatedAt: createdAt,
        completedAt: null, cancelledAt: null, expectedRevision: 3, sourceRevision: 3, appliedActions: {}, history: []
      };
      state = normalizeState(defaultState(80000, 500000));
      state.store.stockQty = 5;
      state.store.stockValueSatang = 25000;
      state.store.purchases = [purchase];
      state.ledger.transactions = [{ id: "TX-BUY", direction: "OUT", amountSatang: 10000, label: "ซื้อ", source: "STORE", sourceId: purchase.id, subtype: "PURCHASE_PAYMENT", actionKey: "buy:1", createdAt, reversedBy: null }];
      state.calendar = [queue];
      currentPage = "calendar";
      persistAndRender = async () => { renderAll(); return { status: "VERIFIED" }; };
      renderAll();
    })();
  `, "purchase-return-fixture.js");

  runtime.evaluate('cancelQueue("Q-RETURN")');
  await runtime.evaluate("modalHandler()");
  assert.deepEqual(json(runtime, `(() => {
    const source = findSource("STORE", "BUY-1");
    const queue = findQueue("Q-RETURN");
    return {
      sourceRevision: source.revision,
      sourceStatus: source.status,
      queueStatus: queue.status,
      expectedRevision: queue.expectedRevision,
      queueSourceRevision: queue.sourceRevision,
      transactions: state.ledger.transactions.length
    };
  })()`), {
    sourceRevision: 4,
    sourceStatus: "CANCELLED",
    queueStatus: "CANCELLED",
    expectedRevision: 4,
    queueSourceRevision: 4,
    transactions: 2
  });
});
