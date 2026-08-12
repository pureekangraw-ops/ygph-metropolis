"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');

test('greenfield persistence identity is distinct from legacy database and vault', async () => {
  const { DB_NAME, LEGACY_DB_NAME, VAULT_FORMAT } = await import('../greenfield/persistence.mjs');
  assert.notEqual(DB_NAME, LEGACY_DB_NAME);
  assert.equal(LEGACY_DB_NAME, 'stock-pocket-secure');
  assert.equal(DB_NAME, 'ygph-metropolis-greenfield-secure');
  assert.equal(VAULT_FORMAT, 'ygph-metropolis-greenfield-vault');
});

test('encrypted commit performs durable decrypt readback and rejects stale expected revision', async () => {
  const { createGreenfieldState } = await import('../greenfield/core.mjs');
  const { createMemoryVaultStore, commitEncryptedState, readEncryptedState } = await import('../greenfield/persistence.mjs');
  const store = createMemoryVaultStore();
  const initial = createGreenfieldState({ now: '2026-08-12T10:00:00.000Z' });
  const first = await commitEncryptedState({ store, passphrase: 'correct horse battery staple', state: initial, expectedDurableRevision: null, iterations: 1000 });
  assert.equal(first.status, 'VERIFIED');
  const read = await readEncryptedState({ store, passphrase: 'correct horse battery staple' });
  assert.equal(read.revision, 1);
  await assert.rejects(commitEncryptedState({ store, passphrase: 'correct horse battery staple', state: { ...read, revision: 2 }, expectedDurableRevision: 0, iterations: 1000 }), /STALE_DURABLE_STATE/);
});
