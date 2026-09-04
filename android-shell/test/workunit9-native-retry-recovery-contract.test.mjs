import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../native/updater/LighthouseUpdaterPlugin.java', import.meta.url), 'utf8');

test('getJobSnapshot recovers an orphaned RETRYING job into a resumable durable state', () => {
  const start = source.indexOf('public void getJobSnapshot(PluginCall call)');
  const end = source.indexOf('public void pauseDownload(PluginCall call)', start);
  assert.ok(start >= 0 && end > start, 'getJobSnapshot method must exist');
  const method = source.slice(start, end);

  assert.match(method, /"RETRYING"\.equals\(/,
    'orphan recovery must recognize durable RETRYING state after process death');
  assert.match(method, /!activeDownloads\.contains\(jobId\)/,
    'a live retry worker must not be rewritten as orphaned');
  assert.match(method, /UPDATE_PARTIAL_FILE_MISMATCH/,
    'orphaned retry recovery must still compare durable bytes with the real partial file');

  const retryingIndex = method.indexOf('"RETRYING".equals(');
  const orphanIndex = method.indexOf('!activeDownloads.contains(jobId)', retryingIndex);
  const actualIndex = method.indexOf('part.length()', orphanIndex);
  const pausedIndex = method.indexOf('snapshot.put("state", "PAUSED")', actualIndex);
  const clearRetryAtIndex = method.indexOf('snapshot.remove("nextRetryAt")', pausedIndex);
  const saveIndex = method.indexOf('save(snapshot)', pausedIndex);
  const launchIndex = method.indexOf('launch(', orphanIndex);

  assert.ok(retryingIndex >= 0 && orphanIndex > retryingIndex,
    'RETRYING may be recovered only when no worker is active');
  assert.ok(actualIndex > orphanIndex && pausedIndex > actualIndex,
    'orphaned RETRYING must reconcile the real partial before becoming PAUSED');
  assert.ok(clearRetryAtIndex > pausedIndex && saveIndex > clearRetryAtIndex,
    'stale retry timing must be removed before the recovered PAUSED snapshot is saved');
  assert.equal(launchIndex, -1,
    'snapshot recovery must not silently start network work');
});
