import test from 'node:test';
import assert from 'node:assert/strict';
import { indexedDB as fakeIndexedDB } from 'fake-indexeddb';
import {
  createMemoryPatchStore,
  createIndexedDbPatchStore,
} from '../www/patch/patch-store.mjs';

function baseSnapshot() {
  return {
    version: '0.0.1',
    assets: {
      'ui.html': '<main>base</main>',
      'ui.css': 'main { display: block; }',
      'logic.mjs': 'export async function mount() {}',
      'rules.json': '{"mode":"base"}',
      'vocabulary.json': '{"hello":"สวัสดี"}',
    },
  };
}

function snapshot(version, html) {
  const base = baseSnapshot();
  return {
    version,
    assets: { ...base.assets, 'ui.html': html },
  };
}

async function assertImmutableVersion(store) {
  const first = snapshot('0.0.2', '<main>first signed v2</main>');
  const identical = snapshot('0.0.2', '<main>first signed v2</main>');
  const conflicting = snapshot('0.0.2', '<main>conflicting signed v2</main>');

  await store.stage(first);
  await store.stage(identical);
  await store.activate('0.0.2', { expectedCurrentVersion: '0.0.1' });

  await assert.rejects(
    store.stage(conflicting),
    /immutable|conflict|different|already exists/i,
  );

  assert.deepEqual(await store.readSnapshot('0.0.2'), first);
  assert.deepEqual(await store.readCurrent(), first);
}

test('memory store treats a staged snapshot version as immutable', async () => {
  const store = createMemoryPatchStore({ baseSnapshot: baseSnapshot() });
  await assertImmutableVersion(store);
});

test('IndexedDB get/compare/insert keeps a staged snapshot version immutable', async () => {
  const store = createIndexedDbPatchStore({
    indexedDB: fakeIndexedDB,
    baseSnapshot: baseSnapshot(),
    databaseName: `lighthouse-patches-immutable-${Date.now()}-${Math.random()}`,
  });
  await assertImmutableVersion(store);
});
