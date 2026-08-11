"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const maintenanceCore = require("../metropolis-maintenance-core.js");
const { loadProductionRuntime } = require("./helpers/metropolis-runtime-harness.cjs");

test("capacity classifier has exact NORMAL, WATCH, WARNING, CRITICAL, and full boundaries", () => {
  const classify = maintenanceCore.classifyStorageCapacity;
  assert.equal(typeof classify, "function");
  const levelAt = ratio => classify({ usage: ratio * 10_000, quota: 10_000 }).level;
  assert.equal(levelAt(0.6999), "NORMAL");
  assert.equal(levelAt(0.70), "WATCH");
  assert.equal(levelAt(0.8499), "WATCH");
  assert.equal(levelAt(0.85), "WARNING");
  assert.equal(levelAt(0.9499), "WARNING");
  assert.equal(levelAt(0.95), "CRITICAL");
  assert.deepEqual(
    { level: levelAt(1), blocksWrite: classify({ usage: 10_000, quota: 10_000 }).blocksWrite },
    { level: "CRITICAL", blocksWrite: true }
  );

  assert.deepEqual(classify({ usage: undefined, quota: undefined }), {
    supported: false,
    ratio: null,
    projectedRatio: null,
    level: "UNKNOWN",
    blocksWrite: false
  });
  assert.deepEqual(classify({ usage: 6_900, quota: 10_000, currentVaultBytes: 1_000, nextVaultBytes: 1_100 }), {
    supported: true,
    ratio: 0.69,
    projectedRatio: 0.7,
    level: "WATCH",
    blocksWrite: false
  });
});

async function capacityRuntime(t, storage) {
  const runtime = loadProductionRuntime({
    beforeScripts({ window }) {
      Object.defineProperty(window.navigator, "storage", { configurable: true, value: storage });
    }
  });
  t.after(() => runtime.close());
  await runtime.flushRuntime();
  return runtime;
}

test("Settings capacity card reports Vault, browser quota, evidence counts, and reuses existing actions", async t => {
  let estimateCalls = 0;
  const runtime = await capacityRuntime(t, {
    estimate: async () => { estimateCalls += 1; return { usage: 700_000, quota: 1_000_000 }; },
    persist: async () => true
  });
  const vault = {
    format: "stock-pocket-vault",
    version: 1,
    kdf: { name: "PBKDF2", hash: "SHA-256", iterations: 600000, salt: "AA==" },
    cipher: { name: "AES-GCM", iv: "AAAAAAAAAAAAAAAA", tagLength: 128 },
    ciphertext: "capacity-fixture",
    updatedAt: "2026-08-11T07:00:00.000Z"
  };
  runtime.evaluate(`
    state = defaultState(80000, 500000);
    state.ledger.transactions = [{}, {}];
    state.calendar = [{}, {}, {}];
    state.audit = [{}, {}, {}, {}];
    state.events = [{}, {}, {}, {}, {}];
    currentVault = ${JSON.stringify(vault)};
    currentPage = "settings";
    renderAll();
  `, "capacity-card-fixture.js");
  await runtime.flushRuntime();

  const { document } = runtime.window;
  const card = document.getElementById("storageCapacityCard");
  const expectedVaultBytes = new TextEncoder().encode(JSON.stringify(vault)).byteLength;
  assert.equal(card.dataset.level, "WATCH");
  assert.equal(card.classList.contains("storage-capacity-watch"), true);
  assert.equal(document.getElementById("storageVaultBytes").dataset.bytes, String(expectedVaultBytes));
  assert.equal(document.getElementById("storageBrowserUsage").dataset.bytes, "700000");
  assert.equal(document.getElementById("storageBrowserQuota").dataset.bytes, "1000000");
  assert.equal(document.getElementById("storageTransactionCount").textContent, "2");
  assert.equal(document.getElementById("storageCalendarCount").textContent, "3");
  assert.equal(document.getElementById("storageAuditCount").textContent, "4");
  assert.equal(document.getElementById("storageEventCount").textContent, "5");
  assert.match(document.getElementById("storageCapacityStatus").textContent, /เริ่มสะสม|70%/);

  document.getElementById("storageRefreshBtn").click();
  await runtime.flushRuntime();
  assert.ok(estimateCalls >= 2);

  runtime.evaluate(`
    globalThis.__capacityActions = { persist: 0, backup: 0 };
    byId("persistBtn").onclick = () => { globalThis.__capacityActions.persist += 1; };
    byId("exportBackupBtn").onclick = () => { globalThis.__capacityActions.backup += 1; };
  `);
  document.getElementById("storagePersistBtn").click();
  document.getElementById("storageBackupBtn").click();
  assert.deepEqual(JSON.parse(runtime.evaluate("JSON.stringify(globalThis.__capacityActions)")), { persist: 1, backup: 1 });
});

function durableVault(state, padding = "") {
  return {
    format: "stock-pocket-vault",
    version: 1,
    kdf: { name: "PBKDF2", hash: "SHA-256", iterations: 600000, salt: "AA==" },
    cipher: { name: "AES-GCM", iv: "AAAAAAAAAAAAAAAA", tagLength: 128 },
    ciphertext: "AA==",
    updatedAt: "2026-08-11T07:00:00.000Z",
    __testState: state,
    padding
  };
}

async function installCommitFixture(runtime, { projectedOverflow = false, quotaFailure = false } = {}) {
  runtime.evaluate(`
    (() => {
      const durableState = defaultState(80000, 500000);
      durableState.revision = 18;
      durableState.settings.themeColor = "navy";
      let storedVault = ${JSON.stringify(durableVault({}))};
      storedVault.__testState = clone(durableState);
      globalThis.__capacityCommit = { puts: 0, storedHashBefore: YGPHCore.hash(storedVault) };
      state = clone(durableState);
      state.settings.themeColor = "orange";
      currentVault = clone(storedVault);
      cryptoKey = { test: true };
      currentPage = "settings";
      dbGet = async key => key === VAULT_KEY ? clone(storedVault) : null;
      dbPut = async (key, vault) => {
        globalThis.__capacityCommit.puts += 1;
        if (${quotaFailure ? "true" : "false"} && globalThis.__capacityCommit.puts === 1) {
          const error = new Error("browser quota exceeded");
          error.name = "QuotaExceededError";
          throw error;
        }
        if (key === VAULT_KEY) storedVault = clone(vault);
      };
      decryptVault = async vault => clone(vault.__testState);
      encryptState = async candidate => ({
        ...clone(storedVault),
        __testState: clone(candidate),
        padding: ${projectedOverflow ? '"x".repeat(5000)' : '""'}
      });
      globalThis.__capacityCommit.snapshot = () => ({
        state: { revision: state.revision, themeColor: state.settings.themeColor },
        puts: globalThis.__capacityCommit.puts,
        storedHash: YGPHCore.hash(storedVault),
        storedHashBefore: globalThis.__capacityCommit.storedHashBefore,
        themeControl: byId("themeColor").value
      });
      renderAll();
    })();
  `, "capacity-commit-fixture.js");
  await runtime.flushRuntime();
}

const commandContextSource = `({
  actor: "OWNER_LOCAL_UI",
  eventType: "SETTINGS_CHANGED",
  sourceDomain: "CORE",
  sourceOwner: "OWNER",
  targetDomain: ["CORE"],
  idempotencyKey: "capacity-test:settings"
})`;

test("projected overflow stops before dbPut and restores the last durable state and UI", async t => {
  const runtime = await capacityRuntime(t, {
    estimate: async () => ({ usage: 900, quota: 1_000 }),
    persist: async () => true
  });
  await installCommitFixture(runtime, { projectedOverflow: true });

  await assert.rejects(
    () => runtime.evaluate(`persistAndRender("ทดสอบพื้นที่", ${commandContextSource})`),
    error => /พื้นที่จัดเก็บ|ไฟล์สำรอง/.test(error.message)
  );
  await runtime.flushRuntime();
  assert.deepEqual(JSON.parse(runtime.evaluate("JSON.stringify(globalThis.__capacityCommit.snapshot())")), {
    state: { revision: 18, themeColor: "navy" },
    puts: 0,
    storedHash: runtime.evaluate("globalThis.__capacityCommit.storedHashBefore"),
    storedHashBefore: runtime.evaluate("globalThis.__capacityCommit.storedHashBefore"),
    themeControl: "navy"
  });
});

test("QuotaExceededError rolls back the candidate Vault and visible state", async t => {
  const runtime = await capacityRuntime(t, {
    estimate: async () => ({ usage: 100, quota: 1_000_000 }),
    persist: async () => true
  });
  await installCommitFixture(runtime, { quotaFailure: true });

  await assert.rejects(
    () => runtime.evaluate(`persistAndRender("ทดสอบ Quota", ${commandContextSource})`),
    error => /พื้นที่จัดเก็บ|ไฟล์สำรอง/.test(error.message)
  );
  await runtime.flushRuntime();
  const result = JSON.parse(runtime.evaluate("JSON.stringify(globalThis.__capacityCommit.snapshot())"));
  assert.deepEqual(result.state, { revision: 18, themeColor: "navy" });
  assert.equal(result.puts, 2, "one failed candidate write and one verified rollback write");
  assert.equal(result.storedHash, result.storedHashBefore);
  assert.equal(result.themeControl, "navy");
});
