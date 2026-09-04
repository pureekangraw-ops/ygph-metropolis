import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../native/updater/LighthouseUpdaterPlugin.java', import.meta.url), 'utf8');

test('native updater owns the active HTTP connection by durable job id', () => {
  assert.match(source, /ConcurrentHashMap<String,\s*HttpURLConnection>\s+activeConnections/,
    'native updater needs a job-bound connection owner so pause/cancel can stop a blocking read');

  const start = source.indexOf('private void download(String jobId, String urlString, File part)');
  const end = source.indexOf('private static boolean contentRangeStartsAt(', start);
  assert.ok(start >= 0 && end > start, 'download method must exist');
  const method = source.slice(start, end);

  const putIndex = method.indexOf('activeConnections.put(jobId, connection)');
  const connectIndex = method.indexOf('connection.connect()');
  const finallyIndex = method.indexOf('finally');
  const removeIndex = method.indexOf('activeConnections.remove(jobId', finallyIndex);
  assert.ok(putIndex >= 0 && connectIndex > putIndex,
    'connection must be discoverable by pause/cancel before connect or blocking reads begin');
  assert.ok(finallyIndex >= 0 && removeIndex > finallyIndex,
    'download worker must release its job-bound connection ownership on exit');
});

test('pause persists PAUSED before disconnecting the active connection and keeps the partial file', () => {
  const start = source.indexOf('public void pauseDownload(PluginCall call)');
  const end = source.indexOf('public void resumeDownload(PluginCall call)', start);
  assert.ok(start >= 0 && end > start, 'pauseDownload method must exist');
  const method = source.slice(start, end);

  const pausedIndex = method.indexOf('snapshot.put("state", "PAUSED")');
  const saveIndex = method.indexOf('save(snapshot)', pausedIndex);
  const connectionIndex = method.indexOf('activeConnections.get(jobId)', saveIndex);
  const disconnectIndex = method.indexOf('.disconnect()', connectionIndex);
  assert.ok(pausedIndex >= 0 && saveIndex > pausedIndex,
    'PAUSED must be durable before network interruption');
  assert.ok(connectionIndex > saveIndex && disconnectIndex > connectionIndex,
    'pause must disconnect the job connection only after PAUSED is durable');
  assert.doesNotMatch(method, /\.delete\(\)/,
    'pause must preserve the partial file');
});

test('a pause-triggered network exception never enters automatic retry', () => {
  const start = source.indexOf('private void download(String jobId, String urlString, File part)');
  const catchStart = source.indexOf('} catch (Exception e) {', start);
  const finallyStart = source.indexOf('} finally {', catchStart);
  assert.ok(start >= 0 && catchStart > start && finallyStart > catchStart, 'download catch block must exist');
  const block = source.slice(catchStart, finallyStart);

  const stateIndex = block.indexOf('load(jobId)');
  const pausedIndex = block.indexOf('"PAUSED"');
  const retryIndex = block.indexOf('isRetryableNetworkError(e)');
  assert.ok(stateIndex >= 0 && pausedIndex > stateIndex && retryIndex > pausedIndex,
    'catch path must re-read durable PAUSED state before classifying a disconnect as retryable network failure');
});

test('cancel stops any active connection and is allowed while retrying', () => {
  const start = source.indexOf('public void discardDownload(PluginCall call)');
  const end = source.indexOf('public void requestInstall(PluginCall call)', start);
  assert.ok(start >= 0 && end > start, 'discardDownload method must exist');
  const method = source.slice(start, end);

  assert.match(method, /requireState\(call, snapshot,[^;]*"RETRYING"/s,
    'cancel must be available while the updater is waiting to retry');
  const connectionIndex = method.indexOf('activeConnections.get(jobId)');
  const disconnectIndex = method.indexOf('.disconnect()', connectionIndex);
  const snapshotDeleteIndex = method.indexOf('remove(PREFIX + jobId)');
  assert.ok(connectionIndex >= 0 && disconnectIndex > connectionIndex && snapshotDeleteIndex > disconnectIndex,
    'cancel must stop the live connection before deleting durable job state');
});
