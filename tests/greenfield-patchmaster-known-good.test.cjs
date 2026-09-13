const test = require('node:test');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const path = require('node:path');

async function load() {
  return import(pathToFileURL(path.resolve(__dirname, '../lighthouse-next/update/known-good.mjs')).href);
}

function store(initial) {
  let value = initial;
  return {
    async get() { return structuredClone(value); },
    async put(_key, next) { value = structuredClone(next); },
  };
}

const oldRelease = { releaseId: 'r1', version: '1.0.0', payloadHash: 'h1' };
const newRelease = { releaseId: 'r2', version: '1.0.1', payloadHash: 'h2' };

test('candidate does not replace current before readback', async () => {
  const { createKnownGoodStore } = await load();
  const stateStore = store({ current: oldRelease, previous: null, candidate: null });
  const state = createKnownGoodStore(stateStore);
  await state.beginCandidate(newRelease);
  assert.deepEqual((await state.read()).current, oldRelease);
});

test('matching readback promotes candidate and keeps previous', async () => {
  const { createKnownGoodStore } = await load();
  const state = createKnownGoodStore(store({ current: oldRelease, previous: null, candidate: newRelease }));
  const result = await state.commitAfterReadback(newRelease);
  assert.deepEqual(result.current, newRelease);
  assert.deepEqual(result.previous, oldRelease);
});

test('mismatched readback rejects promotion', async () => {
  const { createKnownGoodStore } = await load();
  const state = createKnownGoodStore(store({ current: oldRelease, previous: null, candidate: newRelease }));
  await assert.rejects(() => state.commitAfterReadback({ ...newRelease, releaseId: 'other' }));
});
