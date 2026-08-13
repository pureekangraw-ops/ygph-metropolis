"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');

const VAULT_PASSPHRASE = 'correct horse battery staple';

async function initializedStore() {
  const { createGreenfieldState } = await import('../greenfield/core.mjs');
  const { createMemoryVaultStore, commitEncryptedState } = await import('../greenfield/persistence.mjs');
  const store = createMemoryVaultStore();
  const state = createGreenfieldState({ now:'2026-08-13T04:00:00.000Z' });
  await commitEncryptedState({ store, passphrase:VAULT_PASSPHRASE, state, expectedDurableRevision:null });
  return { store, state };
}

test('device unlock rejects a local PIN shorter than 6 characters', async () => {
  const { enrollDeviceUnlock } = await import('../greenfield/device-unlock.mjs');
  const { store } = await initializedStore();
  await assert.rejects(
    () => enrollDeviceUnlock({ store, vaultPassphrase:VAULT_PASSPHRASE, pin:'12345' }),
    /DEVICE_PIN_TOO_SHORT/
  );
});

test('device unlock distinguishes unenrolled, enrolled, and incomplete durable states', async () => {
  const {
    DEVICE_UNLOCK_KEY,
    inspectDeviceUnlock,
    enrollDeviceUnlock,
  } = await import('../greenfield/device-unlock.mjs');
  const { store } = await initializedStore();

  assert.deepEqual(await inspectDeviceUnlock({ store }), { status:'UNENROLLED' });
  await enrollDeviceUnlock({ store, vaultPassphrase:VAULT_PASSPHRASE, pin:'123456' });
  assert.deepEqual(await inspectDeviceUnlock({ store }), { status:'ENROLLED' });

  const partial = (await import('../greenfield/persistence.mjs')).createMemoryVaultStore();
  const key = await globalThis.crypto.subtle.generateKey({ name:'AES-GCM', length:256 }, false, ['encrypt','decrypt']);
  await partial.put(DEVICE_UNLOCK_KEY, key);
  assert.deepEqual(await inspectDeviceUnlock({ store:partial }), { status:'INCOMPLETE' });
});

test('successful enrollment preserves the raw current Vault and stores a non-extractable device key', async () => {
  const {
    DEVICE_UNLOCK_KEY,
    DEVICE_UNLOCK_CREDENTIAL,
    enrollDeviceUnlock,
  } = await import('../greenfield/device-unlock.mjs');
  const { store } = await initializedStore();
  const vaultBefore = await store.get('current');

  await enrollDeviceUnlock({ store, vaultPassphrase:VAULT_PASSPHRASE, pin:'123456' });

  assert.deepEqual(await store.get('current'), vaultBefore);
  const key = await store.get(DEVICE_UNLOCK_KEY);
  assert.equal(key.extractable, false);
  assert.equal(key.algorithm.name, 'AES-GCM');
  assert.equal(key.algorithm.length, 256);
  assert.deepEqual([...key.usages].sort(), ['decrypt','encrypt']);

  const credential = await store.get(DEVICE_UNLOCK_CREDENTIAL);
  const persisted = JSON.stringify(credential);
  assert.equal(persisted.includes('123456'), false);
  assert.equal(persisted.includes(VAULT_PASSPHRASE), false);
  assert.equal(credential.pinKdf.name, 'PBKDF2');
  assert.equal(credential.pinKdf.hash, 'SHA-256');
  assert.equal(credential.pinKdf.iterations, 600000);
  assert.equal(credential.cipher.name, 'AES-GCM');
  assert.equal(credential.cipher.tagLength, 128);
});

test('correct local PIN unseals the existing Vault passphrase while wrong PIN fails closed without writes', async () => {
  const { enrollDeviceUnlock, unlockVaultPassphrase } = await import('../greenfield/device-unlock.mjs');
  const { store } = await initializedStore();
  await enrollDeviceUnlock({ store, vaultPassphrase:VAULT_PASSPHRASE, pin:'123456' });

  assert.equal(await unlockVaultPassphrase({ store, pin:'123456' }), VAULT_PASSPHRASE);

  const writes = [];
  const readonlySpy = {
    get:key => store.get(key),
    put(key, value) { writes.push(key); return store.put(key, value); },
  };
  await assert.rejects(() => unlockVaultPassphrase({ store:readonlySpy, pin:'654321' }), /DEVICE_PIN_INVALID/);
  assert.deepEqual(writes, []);
});

test('failed enrollment verifies the existing Vault first and writes no device credential', async () => {
  const {
    DEVICE_UNLOCK_KEY,
    DEVICE_UNLOCK_CREDENTIAL,
    enrollDeviceUnlock,
  } = await import('../greenfield/device-unlock.mjs');
  const { store } = await initializedStore();
  const writes = [];
  const spy = {
    get:key => store.get(key),
    put(key, value) { writes.push(key); return store.put(key, value); },
  };

  await assert.rejects(
    () => enrollDeviceUnlock({ store:spy, vaultPassphrase:'wrong passphrase but long enough', pin:'123456' }),
    /GREENFIELD_VAULT_DECRYPT_FAILED/
  );
  assert.deepEqual(writes, []);
  assert.equal(await store.get(DEVICE_UNLOCK_KEY), null);
  assert.equal(await store.get(DEVICE_UNLOCK_CREDENTIAL), null);
});

test('re-enrollment changes only the everyday password and preserves the Vault', async () => {
  const { enrollDeviceUnlock, unlockVaultPassphrase } = await import('../greenfield/device-unlock.mjs');
  const { store } = await initializedStore();
  await enrollDeviceUnlock({ store, vaultPassphrase:VAULT_PASSPHRASE, pin:'old-password' });
  const vaultBefore = await store.get('current');

  await enrollDeviceUnlock({ store, vaultPassphrase:VAULT_PASSPHRASE, pin:'new-password' });

  assert.deepEqual(await store.get('current'), vaultBefore);
  await assert.rejects(() => unlockVaultPassphrase({ store, pin:'old-password' }), /DEVICE_PIN_INVALID/);
  assert.equal(await unlockVaultPassphrase({ store, pin:'new-password' }), VAULT_PASSPHRASE);
});

test('device credential replacement uses one atomic multi-key write', async () => {
  const { enrollDeviceUnlock } = await import('../greenfield/device-unlock.mjs');
  const { store } = await initializedStore();
  const atomicWrites = [];
  const spy = {
    get:key => store.get(key),
    put() { throw new Error('SEQUENTIAL_DEVICE_WRITE_FORBIDDEN'); },
    async putMany(entries) {
      atomicWrites.push(entries.map(([key]) => key));
      return store.putMany(entries);
    },
  };

  await enrollDeviceUnlock({ store:spy, vaultPassphrase:VAULT_PASSPHRASE, pin:'new-password' });
  assert.equal(atomicWrites.length, 1);
  assert.deepEqual(atomicWrites[0].sort(), ['device-unlock:credential:v1','device-unlock:key:v1']);
});
