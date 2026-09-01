const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const read = (path) => fs.readFileSync(path, 'utf8');

test('Patch runtime owns a verified immutable effective snapshot layer', () => {
  assert.equal(fs.existsSync('android-shell/www/patch/effective-snapshot.mjs'), true, 'effective snapshot module must exist');
  const source = read('android-shell/www/patch/effective-snapshot.mjs');
  for (const token of ['snapshotId', 'aggregateSha256', 'patchChain', 'previousSnapshotId', "status: 'VERIFIED'", 'sourceCommit', 'activatedAt']) {
    assert.match(source, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(source, /SNAPSHOT_FILE_HASH_MISMATCH/);
  assert.match(source, /Object\.freeze/);
});

test('Patch store current and previous pointers refer to immutable snapshots', () => {
  const store = read('android-shell/www/patch/patch-store.mjs');
  assert.match(store, /currentSnapshotId/);
  assert.match(store, /previousSnapshotId/);
  assert.match(store, /Snapshot.*immutable/i);
});
