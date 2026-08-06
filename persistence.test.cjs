"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const core = require("../highway-gate.js");

function baseState() {
  return {
    schema: 4,
    revision: 4,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-05T00:00:00.000Z",
    settings: { defaultPriceSatang: 80000, lockMinutes: 5, lowStockThreshold: 3, themeColor: "navy" },
    store: { stockQty: 0, stockValueSatang: 0, sales: [], purchases: [], withdrawals: [] },
    ride: { currentRound: null, rounds: [], jobs: [], expenses: [], creditBalanceSatang: 0, creditWithdrawals: [] },
    ledger: { openingBalanceSatang: 0, balanceVerified: true, verifiedAt: "2026-08-01T00:00:00.000Z", transactions: [], obligations: [] },
    calendar: [],
    audit: [],
    events: [],
    sync: { appliedCommandKeys: {} },
    migration: { fromSchema: null },
    dataFixes: {},
    integrity: { fatal: [], warnings: [] }
  };
}

function memoryAdapter(previousVault, { corruptReadback = false } = {}) {
  let stored = structuredClone(previousVault);
  let commitWritten = false;
  const counts = { encrypt: 0, write: 0, read: 0, decrypt: 0, restore: 0 };

  return {
    counts,
    encrypt: async state => {
      counts.encrypt += 1;
      return { format: "test-vault", state: structuredClone(state) };
    },
    writeVault: async vault => {
      counts.write += 1;
      commitWritten = true;
      stored = structuredClone(vault);
    },
    readVault: async () => {
      counts.read += 1;
      if (corruptReadback && commitWritten && counts.restore === 0) {
        const broken = structuredClone(stored);
        broken.state.store.stockQty = 999;
        return broken;
      }
      return structuredClone(stored);
    },
    decrypt: async vault => {
      counts.decrypt += 1;
      return structuredClone(vault.state);
    },
    restoreVault: async vault => {
      counts.restore += 1;
      stored = structuredClone(vault);
    },
    stored: () => structuredClone(stored)
  };
}

test("commits one command with one vault write and mandatory read-back", async () => {
  const { commitStateAtomic } = require("../app.js");
  const before = baseState();
  const proposed = structuredClone(before);
  proposed.settings.themeColor = "green";
  const previousVault = { format: "test-vault", state: structuredClone(before) };
  const adapter = memoryAdapter(previousVault);

  const result = await commitStateAtomic({
    core,
    beforeState: before,
    proposedState: proposed,
    previousVault,
    commandContext: {
      eventType: "SETTINGS_UPDATED",
      sourceDomain: "SYSTEM",
      targetDomain: ["CORE"],
      idempotencyKey: "settings:green",
      timestamp: "2026-08-06T05:00:00.000Z"
    },
    ...adapter
  });

  assert.deepEqual(adapter.counts, { encrypt: 1, write: 1, read: 1, decrypt: 1, restore: 0 });
  assert.equal(result.state.revision, 5);
  assert.equal(result.state.events.length, 1);
  assert.equal(result.state.events[0].idempotencyKey, "settings:green");
  assert.equal(result.state.sync.appliedCommandKeys["settings:green"].actionId, result.plan.actionId);
  assert.equal(result.readback.status, "VERIFIED");
  assert.match(result.readback.durableHash, /^fnv1a-/);
});

test("commits a second command after the first event envelope already exists", async () => {
  const { commitStateAtomic } = require("../app.js");
  const before = baseState();
  const firstProposed = structuredClone(before);
  firstProposed.settings.themeColor = "green";
  const firstAdapter = memoryAdapter({ format: "test-vault", state: structuredClone(before) });
  const first = await commitStateAtomic({
    core,
    beforeState: before,
    proposedState: firstProposed,
    previousVault: firstAdapter.stored(),
    commandContext: {
      eventType: "SETTINGS_UPDATED",
      sourceDomain: "SYSTEM",
      targetDomain: ["CORE"],
      idempotencyKey: "settings:first",
      timestamp: "2026-08-06T05:00:00.000Z"
    },
    ...firstAdapter
  });

  const secondProposed = structuredClone(first.state);
  secondProposed.settings.themeColor = "purple";
  const secondAdapter = memoryAdapter(first.vault);
  const second = await commitStateAtomic({
    core,
    beforeState: first.state,
    proposedState: secondProposed,
    previousVault: first.vault,
    commandContext: {
      eventType: "SETTINGS_UPDATED",
      sourceDomain: "SYSTEM",
      targetDomain: ["CORE"],
      idempotencyKey: "settings:second",
      timestamp: "2026-08-06T06:00:00.000Z"
    },
    ...secondAdapter
  });

  assert.equal(second.state.revision, before.revision + 2);
  assert.equal(second.state.events.length, 2);
  assert.deepEqual(second.state.events.map(event => event.idempotencyKey), ["settings:first", "settings:second"]);
  assert.equal(second.readback.status, "VERIFIED");
});

test("rejects a duplicate command before encryption or writing", async () => {
  const { commitStateAtomic } = require("../app.js");
  const before = baseState();
  before.sync.appliedCommandKeys["sale:1"] = { actionId: "ACT-OLD" };
  const proposed = structuredClone(before);
  proposed.settings.themeColor = "purple";
  const previousVault = { format: "test-vault", state: structuredClone(before) };
  const adapter = memoryAdapter(previousVault);

  await assert.rejects(() => commitStateAtomic({
    core,
    beforeState: before,
    proposedState: proposed,
    previousVault,
    commandContext: { idempotencyKey: "sale:1", eventType: "TEST", sourceDomain: "SYSTEM", targetDomain: ["CORE"] },
    ...adapter
  }), /ทำไปแล้ว|DUPLICATE/i);

  assert.deepEqual(adapter.counts, { encrypt: 0, write: 0, read: 0, decrypt: 0, restore: 0 });
});

test("rejects deletion before encryption or writing", async () => {
  const { commitStateAtomic } = require("../app.js");
  const before = baseState();
  before.audit.push({ id: "AUD-1", at: "2026-08-01T00:00:00.000Z", event: "OLD", note: "keep" });
  const proposed = structuredClone(before);
  proposed.audit = [];
  const previousVault = { format: "test-vault", state: structuredClone(before) };
  const adapter = memoryAdapter(previousVault);

  await assert.rejects(() => commitStateAtomic({
    core,
    beforeState: before,
    proposedState: proposed,
    previousVault,
    commandContext: { idempotencyKey: "delete:audit", eventType: "TEST", sourceDomain: "SYSTEM", targetDomain: ["AUDIT"] },
    ...adapter
  }), /ห้ามลบ/i);

  assert.equal(adapter.counts.write, 0);
  assert.equal(adapter.counts.encrypt, 0);
});

test("restores and verifies the previous raw vault after read-back mismatch", async () => {
  const { commitStateAtomic } = require("../app.js");
  const before = baseState();
  const proposed = structuredClone(before);
  proposed.settings.themeColor = "orange";
  const previousVault = { format: "test-vault", state: structuredClone(before), marker: "previous" };
  const adapter = memoryAdapter(previousVault, { corruptReadback: true });

  await assert.rejects(() => commitStateAtomic({
    core,
    beforeState: before,
    proposedState: proposed,
    previousVault,
    commandContext: { idempotencyKey: "settings:orange", eventType: "TEST", sourceDomain: "SYSTEM", targetDomain: ["CORE"] },
    ...adapter
  }), error => {
    assert.equal(error.rollbackVerified, true);
    return /READBACK/i.test(error.message);
  });

  assert.equal(adapter.counts.write, 1);
  assert.equal(adapter.counts.restore, 1);
  assert.equal(adapter.counts.read, 2);
  assert.deepEqual(adapter.stored(), previousVault);
});

test("browser persistence is wired to the core without a FLOW runtime override", () => {
  const root = path.join(__dirname, "..");
  const appSource = fs.readFileSync(path.join(root, "app.js"), "utf8");
  const flowSource = fs.readFileSync(path.join(root, "flow-era.js"), "utf8");

  assert.match(appSource, /async function commitCurrentState[\s\S]*commitStateAtomic\(/);
  assert.doesNotMatch(flowSource, /persistAndRender\s*=\s*async/);
  assert.match(flowSource, /function flowPrepareCommit\(/);
  assert.match(appSource, /EXCHANGE_IMPORT_APPLIED/);
  assert.match(appSource, /snapshotBeforeWrite:\s*true/);
});

test("snapshot promotion reads the rollback vault and metadata back", async () => {
  const { writeVaultWithSnapshot } = require("../app.js");
  const previousVault = { marker: "before" };
  const candidateVault = { marker: "after" };
  const metadata = { type: "EXCHANGE_IMPORT", idempotencyKey: "import:1" };
  const order = [];

  const result = await writeVaultWithSnapshot({
    core,
    previousVault,
    candidateVault,
    metadata,
    atomicPromoteFn: async input => {
      order.push("promote");
      assert.deepEqual(input, { previousVault, candidateVault, metadata });
    },
    readSnapshotFn: async () => {
      order.push("readback");
      return { rollbackVault: structuredClone(previousVault), metadata: structuredClone(metadata) };
    }
  });

  assert.deepEqual(order, ["promote", "readback"]);
  assert.deepEqual(result.rollbackVault, previousVault);
  assert.deepEqual(result.metadata, metadata);
});
