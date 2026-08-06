"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const core = require("../highway-gate.js");
const schema4 = require("./fixtures/schema-4.json");

function fakeVault(marker = "candidate") {
  return {
    format: "stock-pocket-vault",
    version: 1,
    kdf: { name: "PBKDF2", hash: "SHA-256", iterations: 600000, salt: "AAAAAAAAAAAAAAAAAAAAAA==" },
    cipher: { name: "AES-GCM", iv: "AAAAAAAAAAAAAAAA", tagLength: 128 },
    ciphertext: "AAAAAAAAAAAAAAAAAAAAAAAA",
    marker
  };
}

function backupEnvelope(vault = fakeVault()) {
  return {
    backupFormat: "stock-pocket-encrypted-backup",
    backupVersion: 1,
    exportedAt: "2026-08-06T00:00:00.000Z",
    vault
  };
}

function inspectionDeps(overrides = {}) {
  const calls = { derive: 0, decrypt: 0, migrate: 0, validate: 0, encrypt: 0 };
  return {
    calls,
    core,
    deriveKeyFn: async passphrase => {
      calls.derive += 1;
      return { passphrase };
    },
    decryptVaultFn: async (_vault, key) => {
      calls.decrypt += 1;
      if (key.passphrase === "wrong-pass") throw new Error("wrong password");
      return structuredClone(schema4);
    },
    migrateStateFn: value => {
      calls.migrate += 1;
      return { ...structuredClone(value), schema: 4 };
    },
    normalizeStateFn: value => structuredClone(value),
    validateCandidateShapeFn: () => {},
    validateInvariantsFn: () => {
      calls.validate += 1;
      return { fatal: [], warnings: [] };
    },
    encryptStateFn: async (state, _key, kdf) => {
      calls.encrypt += 1;
      return { ...fakeVault("reencrypted"), kdf, state: structuredClone(state) };
    },
    now: () => "2026-08-06T05:00:00.000Z",
    ...overrides
  };
}

test("malformed backup is rejected before password work and performs zero writes", async () => {
  const { inspectBackupCandidate } = require("../app.js");
  const deps = inspectionDeps();

  await assert.rejects(() => inspectBackupCandidate({ nope: true }, "password-123", deps), /ไฟล์สำรอง|BACKUP_INVALID/i);
  assert.deepEqual(deps.calls, { derive: 0, decrypt: 0, migrate: 0, validate: 0, encrypt: 0 });
});

test("wrong password, unsupported schema, and invariant failure stop before candidate encryption", async t => {
  const { inspectBackupCandidate } = require("../app.js");

  await t.test("wrong password", async () => {
    const deps = inspectionDeps();
    await assert.rejects(() => inspectBackupCandidate(backupEnvelope(), "wrong-pass", deps), /password/i);
    assert.equal(deps.calls.encrypt, 0);
  });

  await t.test("unsupported schema", async () => {
    const deps = inspectionDeps({
      decryptVaultFn: async () => ({ ...structuredClone(schema4), schema: 9 })
    });
    await assert.rejects(() => inspectBackupCandidate(backupEnvelope(), "password-123", deps), /Schema 9|ไม่รองรับ/i);
    assert.equal(deps.calls.encrypt, 0);
  });

  await t.test("invariant failure", async () => {
    const deps = inspectionDeps({
      validateInvariantsFn: () => { throw new Error("ยอดเงินไม่ผ่านกฎ"); }
    });
    await assert.rejects(() => inspectBackupCandidate(backupEnvelope(), "password-123", deps), /ยอดเงินไม่ผ่านกฎ/);
    assert.equal(deps.calls.encrypt, 0);
  });
});

test("inspection migrates in memory and returns a plain-language preview without writing", async () => {
  const { inspectBackupCandidate } = require("../app.js");
  const schema3 = { ...structuredClone(schema4), schema: 3, store: { ...schema4.store, stockQty: 2, stockValueSatang: 5000 } };
  const deps = inspectionDeps({
    decryptVaultFn: async () => structuredClone(schema3),
    migrateStateFn: value => ({ ...structuredClone(value), schema: 4, migration: { fromSchema: 3 } })
  });

  const candidate = await inspectBackupCandidate(backupEnvelope(), "password-123", deps);

  assert.equal(candidate.originalSchema, 3);
  assert.equal(candidate.state.schema, 4);
  assert.deepEqual(candidate.compatibility.migrationPath, [3, 4]);
  assert.equal(candidate.preview.stockQty, 2);
  assert.equal(candidate.preview.stockValueSatang, 5000);
  assert.equal(candidate.preview.targetSchema, 4);
  assert.equal(candidate.candidateVault.marker, "reencrypted");
});

test("promotion snapshots first, promotes atomically, then decrypts and verifies read-back", async () => {
  const { promoteBackupCandidate } = require("../app.js");
  const previousVault = fakeVault("previous");
  const candidateVault = { ...fakeVault("candidate"), state: structuredClone(schema4) };
  let active = structuredClone(previousVault);
  const calls = [];
  const candidate = { state: structuredClone(schema4), candidateVault, key: { id: "key" }, originalSchema: 4 };

  const result = await promoteBackupCandidate(candidate, {
    core,
    readVaultFn: async () => structuredClone(active),
    atomicPromoteFn: async input => {
      calls.push({ type: "atomic", input: structuredClone({ ...input, key: undefined }) });
      assert.deepEqual(input.previousVault, previousVault);
      active = structuredClone(input.candidateVault);
    },
    decryptVaultFn: async vault => structuredClone(vault.state),
    restoreVaultFn: async vault => { calls.push({ type: "restore" }); active = structuredClone(vault); },
    now: () => "2026-08-06T06:00:00.000Z"
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].type, "atomic");
  assert.equal(result.readback.status, "VERIFIED");
  assert.equal(result.previousVault.marker, "previous");
  assert.equal(active.marker, "candidate");
});

test("failed promoted read-back restores and verifies the previous raw vault", async () => {
  const { promoteBackupCandidate } = require("../app.js");
  const previousVault = fakeVault("previous");
  const candidateVault = { ...fakeVault("candidate"), state: structuredClone(schema4) };
  let active = structuredClone(previousVault);
  let restored = 0;
  const candidate = { state: structuredClone(schema4), candidateVault, key: { id: "key" }, originalSchema: 4 };

  await assert.rejects(() => promoteBackupCandidate(candidate, {
    core,
    readVaultFn: async () => structuredClone(active),
    atomicPromoteFn: async input => { active = structuredClone(input.candidateVault); },
    decryptVaultFn: async vault => {
      const value = structuredClone(vault.state);
      value.store.stockQty = 999;
      return value;
    },
    restoreVaultFn: async vault => { restored += 1; active = structuredClone(vault); }
  }), error => {
    assert.equal(error.rollbackVerified, true);
    return /READBACK/i.test(error.message);
  });

  assert.equal(restored, 1);
  assert.deepEqual(active, previousVault);
});

test("encrypted backup export and import preserve the same durable state", async () => {
  const {
    deriveKey,
    encryptState,
    inspectBackupCandidate,
    migrateStateToCurrent
  } = require("../app.js");
  const passphrase = "backup-roundtrip-123";
  const state = migrateStateToCurrent(structuredClone(schema4));
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const kdf = {
    name: "PBKDF2",
    hash: "SHA-256",
    iterations: 600000,
    salt: Buffer.from(salt).toString("base64")
  };
  const key = await deriveKey(passphrase, salt, kdf.iterations);
  const vault = await encryptState(state, key, kdf);
  const exported = JSON.parse(JSON.stringify(backupEnvelope(vault)));

  const imported = await inspectBackupCandidate(exported, passphrase);

  assert.equal(imported.preview.mode, "LOAD");
  assert.equal(imported.preview.targetSchema, 4);
  assert.equal(
    core.hash(core.durableProjection(imported.state)),
    core.hash(core.durableProjection(state))
  );
});

test("backup inspection blocks fractional satang before candidate encryption or promotion", async () => {
  const { inspectBackupCandidate } = require("../app.js");
  const invalid = structuredClone(schema4);
  invalid.store.sales.push({
    id: "SALE-FRACTION",
    totalSatang: 100.5,
    receivedSatang: 0,
    outstandingSatang: 100.5,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    revision: 1
  });
  const envelope = backupEnvelope(fakeVault("fractional"));
  let encrypted = 0;
  const deps = inspectionDeps({
    decryptVaultFn: async () => structuredClone(invalid),
    validateInvariantsFn: undefined,
    encryptStateFn: async () => {
      encrypted += 1;
      return fakeVault("must-not-run");
    }
  });

  await assert.rejects(
    () => inspectBackupCandidate(envelope, "password-123", deps),
    /สตางค์|จำนวนเต็ม/
  );
  assert.equal(encrypted, 0);
});

test("backup inspection rejects a reversal shared by two original transactions", async () => {
  const { inspectBackupCandidate } = require("../app.js");
  const invalid = structuredClone(schema4);
  invalid.ledger.transactions.push(
    {
      id: "TX-1", direction: "IN", amountSatang: 1000, label: "หนึ่ง", source: "LEDGER",
      sourceId: "INC-SAME", subtype: "DIRECT", actionKey: "income:1",
      createdAt: "2026-08-01T00:00:00.000Z", reversedBy: "TX-R"
    },
    {
      id: "TX-2", direction: "IN", amountSatang: 1000, label: "สอง", source: "LEDGER",
      sourceId: "INC-SAME", subtype: "DIRECT", actionKey: "income:2",
      createdAt: "2026-08-01T00:00:00.000Z", reversedBy: "TX-R"
    },
    {
      id: "TX-R", direction: "OUT", amountSatang: 1000, label: "ย้อนหนึ่ง", source: "LEDGER",
      sourceId: "INC-SAME", subtype: "REVERSAL_DIRECT", actionKey: "reverse:1",
      createdAt: "2026-08-02T00:00:00.000Z", reversalOf: "TX-1", reversedBy: null
    }
  );
  let encrypted = 0;
  const deps = inspectionDeps({
    decryptVaultFn: async () => structuredClone(invalid),
    validateInvariantsFn: undefined,
    encryptStateFn: async () => {
      encrypted += 1;
      return fakeVault("must-not-run");
    }
  });

  await assert.rejects(
    () => inspectBackupCandidate(backupEnvelope(), "password-123", deps),
    /Reversal|เชื่อม|ซ้ำ/i
  );
  assert.equal(encrypted, 0);
});
