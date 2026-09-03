import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../native/updater/LighthouseUpdaterPlugin.java', import.meta.url), 'utf8');

test('native updater persists retry attempts for recovery diagnostics', () => {
  assert.match(source, /"attempts"/);
  assert.match(source, /"lastAttemptAt"/);
});

test('native updater persists staged artifact identity before installer handoff', () => {
  assert.match(source, /"stagedSha256"/);
  assert.match(source, /sha256File\(/);
});

test('native updater rejects invalid lifecycle transitions instead of silently changing state', () => {
  assert.match(source, /UPDATE_INVALID_STATE/);
  assert.match(source, /requireState\(/);
  assert.match(source, /"DOWNLOADING"/);
  assert.match(source, /"PAUSED"/);
  assert.match(source, /"STAGED"/);
});

test('native updater verifies expected SHA before staging the completed artifact', () => {
  assert.match(source, /"expectedSha256"/);
  assert.match(source, /UPDATE_ARTIFACT_MISMATCH/);
  assert.match(source, /sha256File\(part\)/);
  const digestIndex = source.indexOf('sha256File(part)');
  const renameIndex = source.indexOf('part.renameTo(apk)');
  assert.ok(digestIndex >= 0 && renameIndex >= 0 && digestIndex < renameIndex,
    'completed .part must be hashed before rename to staged APK');
});
