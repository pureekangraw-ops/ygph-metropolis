import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../native/updater/LighthouseUpdaterPlugin.java', import.meta.url), 'utf8');

test('getJobSnapshot preserves an orphaned RETRYING schedule after partial-file reconciliation', () => {
  const start = source.indexOf('public void getJobSnapshot(PluginCall call)');
  const end = source.indexOf('public void pauseDownload(PluginCall call)', start);
  assert.ok(start >= 0 && end > start, 'getJobSnapshot method must exist');
  const method = source.slice(start, end);

  assert.match(method, /"RETRYING"\.equals\(/,
    'recovery must recognize durable RETRYING state after process death');
  assert.match(method, /!activeDownloads\.contains\(jobId\)/,
    'a live retry worker must not be scheduled twice');
  assert.match(method, /UPDATE_PARTIAL_FILE_MISMATCH/,
    'retry recovery must still compare durable bytes with the real partial file');

  const retryingIndex = method.indexOf('"RETRYING".equals(');
  const orphanIndex = method.indexOf('!activeDownloads.contains(jobId)', retryingIndex);
  const actualIndex = method.indexOf('part.length()', orphanIndex);
  const recoverIndex = method.indexOf('recoverRetryingJob(jobId, snapshot, part)', actualIndex);
  assert.ok(retryingIndex >= 0 && orphanIndex > retryingIndex && actualIndex > orphanIndex,
    'RETRYING may be recovered only when no worker is active and the partial file has been reconciled');
  assert.ok(recoverIndex > actualIndex,
    'a consistent orphaned RETRYING job must restore its durable retry schedule instead of becoming PAUSED');

  const beforeRecover = method.slice(actualIndex, recoverIndex);
  assert.doesNotMatch(beforeRecover, /snapshot\.remove\("nextRetryAt"\)/,
    'nextRetryAt must survive process restart until the scheduled retry actually begins');
});

test('recovered retry waits until durable nextRetryAt before returning to DOWNLOADING', () => {
  const start = source.indexOf('private void recoverRetryingJob(');
  const end = source.indexOf('private boolean retryNetworkFailure(', start);
  assert.ok(start >= 0 && end > start, 'recoverRetryingJob helper must exist');
  const method = source.slice(start, end);

  assert.match(method, /nullableLong\(snapshot, "nextRetryAt"\)/,
    'recovery must use the persisted retry deadline');
  assert.match(method, /Math\.max\(0L,\s*nextRetryAt\s*-\s*System\.currentTimeMillis\(\)\)/,
    'recovery must wait only the remaining durable backoff');

  const activeIndex = method.indexOf('activeDownloads.add(jobId)');
  const executeIndex = method.indexOf('executor.execute(', activeIndex);
  const sleepIndex = method.indexOf('Thread.sleep(delayMs)', executeIndex);
  const loadIndex = method.indexOf('load(jobId)', sleepIndex);
  const retryingIndex = method.indexOf('"RETRYING".equals(', loadIndex);
  const downloadingIndex = method.indexOf('state.put("state", "DOWNLOADING")', retryingIndex);
  const clearRetryIndex = method.indexOf('state.remove("nextRetryAt")', downloadingIndex);
  const saveIndex = method.indexOf('save(state)', clearRetryIndex);
  const downloadIndex = method.indexOf('download(jobId, url, part)', saveIndex);

  assert.ok(activeIndex >= 0 && executeIndex > activeIndex,
    'recovered retry must claim worker ownership before it is queued');
  assert.ok(sleepIndex > executeIndex && loadIndex > sleepIndex && retryingIndex > loadIndex,
    'the worker must wait, then confirm RETRYING is still durable before transition');
  assert.ok(downloadingIndex > retryingIndex && clearRetryIndex > downloadingIndex && saveIndex > clearRetryIndex && downloadIndex > saveIndex,
    'nextRetryAt is cleared only when the durable job actually returns to DOWNLOADING and retries');
});
