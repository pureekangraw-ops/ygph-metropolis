import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../native/updater/LighthouseUpdaterPlugin.java', import.meta.url), 'utf8');

test('native updater declares three network retries with 1s 2s 4s backoff', () => {
  assert.match(source, /MAX_NETWORK_RETRIES\s*=\s*3/);
  assert.match(source, /RETRY_BACKOFF_MS\s*=\s*new long\[\]\s*\{\s*1000L\s*,\s*2000L\s*,\s*4000L\s*\}/);
});

test('retry scheduling persists RETRYING retryAttempt and nextRetryAt before waiting', () => {
  const start = source.indexOf('private boolean retryNetworkFailure(');
  const end = source.indexOf('private boolean isRetryableNetworkError(', start);
  assert.ok(start >= 0 && end > start, 'retryNetworkFailure helper must exist');
  const method = source.slice(start, end);

  assert.match(method, /intValue\(state, "retryAttempt"\)\s*\+\s*1/);
  assert.match(method, /retryAttempt\s*>\s*MAX_NETWORK_RETRIES/);
  assert.match(method, /state\.put\("state", "RETRYING"\)/);
  assert.match(method, /state\.put\("retryAttempt",\s*retryAttempt\)/);
  assert.match(method, /state\.put\("nextRetryAt",\s*nextRetryAt\)/);

  const retryingIndex = method.indexOf('state.put("state", "RETRYING")');
  const attemptIndex = method.indexOf('state.put("retryAttempt", retryAttempt)', retryingIndex);
  const nextRetryIndex = method.indexOf('state.put("nextRetryAt", nextRetryAt)', attemptIndex);
  const saveIndex = method.indexOf('save(state)', nextRetryIndex);
  const sleepIndex = method.indexOf('Thread.sleep(', saveIndex);
  const downloadingIndex = method.indexOf('state.put("state", "DOWNLOADING")', sleepIndex);
  const retryDownloadIndex = method.indexOf('download(jobId, urlString, part)', downloadingIndex);

  assert.ok(retryingIndex >= 0 && attemptIndex > retryingIndex && nextRetryIndex > attemptIndex && saveIndex > nextRetryIndex,
    'retry state and timing must be durable before backoff begins');
  assert.ok(sleepIndex > saveIndex && downloadingIndex > sleepIndex && retryDownloadIndex > downloadingIndex,
    'retry must wait, return to DOWNLOADING, then retry the same durable job');
});

test('automatic retry is limited to explicit network and timeout failures', () => {
  const start = source.indexOf('private boolean isRetryableNetworkError(');
  const end = source.indexOf('private JSObject snapshot(', start);
  assert.ok(start >= 0 && end > start, 'network retry classifier must exist');
  const method = source.slice(start, end);

  assert.match(method, /SocketTimeoutException/);
  assert.match(method, /ConnectException/);
  assert.match(method, /UnknownHostException/);
  assert.match(method, /SocketException/);
  assert.doesNotMatch(method, /instanceof\s+IOException/,
    'generic IOException must not be treated as network retryable because storage failures are IOExceptions too');

  const catchStart = source.indexOf('} catch (Exception e) {', source.indexOf('private void download('));
  const catchEnd = source.indexOf('} finally {', catchStart);
  const catchBlock = source.slice(catchStart, catchEnd);
  assert.match(catchBlock, /isRetryableNetworkError\(e\)/);
  assert.match(catchBlock, /retryNetworkFailure\(jobId,\s*urlString,\s*part,\s*e\)/);
  assert.match(catchBlock, /fail\(jobId,/);
});

test('artifact mismatch remains terminal and never enters network retry path', () => {
  const ownerStart = source.indexOf('private void completeVerification(String jobId, File part)');
  const ownerEnd = source.indexOf('private void recoverVerifyingJob(', ownerStart);
  assert.ok(ownerStart >= 0 && ownerEnd > ownerStart, 'artifact verification owner must exist');
  const owner = source.slice(ownerStart, ownerEnd);

  const start = owner.indexOf('String stagedSha256 = sha256File(part)');
  const end = owner.indexOf('File apk = ', start);
  assert.ok(start >= 0 && end > start, 'artifact verification block must exist inside completeVerification');
  const block = owner.slice(start, end);
  assert.match(block, /UPDATE_ARTIFACT_MISMATCH/);
  assert.match(block, /done\.put\("state", "FAILED"\)/);
  assert.doesNotMatch(block, /retryNetworkFailure|RETRYING/);
});
