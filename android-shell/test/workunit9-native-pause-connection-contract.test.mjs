import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../native/updater/LighthouseUpdaterPlugin.java', import.meta.url), 'utf8');

test('native updater owns the active HTTP connection and input stream by durable job id', () => {
  assert.match(source, /ConcurrentHashMap<String,\s*HttpURLConnection>\s+activeConnections/,
    'native updater needs a job-bound connection owner so pause/cancel can stop connection work');
  assert.match(source, /ConcurrentHashMap<String,\s*InputStream>\s+activeStreams/,
    'native updater needs the active input stream because disconnect alone does not guarantee a blocking read is released');

  const start = source.indexOf('private void download(String jobId, String urlString, File part)');
  const end = source.indexOf('private static boolean contentRangeStartsAt(', start);
  assert.ok(start >= 0 && end > start, 'download method must exist');
  const method = source.slice(start, end);

  const connectionPutIndex = method.indexOf('activeConnections.put(jobId, connection)');
  const connectIndex = method.indexOf('connection.connect()');
  const streamPutIndex = method.indexOf('activeStreams.put(jobId,', connectIndex);
  const finallyIndex = method.indexOf('finally');
  const streamRemoveIndex = method.indexOf('activeStreams.remove(jobId', finallyIndex);
  const connectionRemoveIndex = method.indexOf('activeConnections.remove(jobId', finallyIndex);

  assert.ok(connectionPutIndex >= 0 && connectIndex > connectionPutIndex,
    'connection must be discoverable by pause/cancel before connect or blocking reads begin');
  assert.ok(streamPutIndex > connectIndex,
    'the response input stream must become discoverable before the download read loop');
  assert.ok(finallyIndex >= 0 && streamRemoveIndex > finallyIndex && connectionRemoveIndex > streamRemoveIndex,
    'worker exit must release stream then connection ownership without removing a newer worker resource');
});

test('download checks durable state and worker generation around connect so a fast pause-resume cannot revive an old worker', () => {
  assert.match(source, /AtomicLong\s+workerSequence/);
  assert.match(source, /ConcurrentHashMap<String,\s*Long>\s+currentWorkerTokens/);
  assert.match(source, /ThreadLocal<Long>\s+executingWorkerToken/);

  const launchStart = source.indexOf('private void launch(String jobId, String url, File part)');
  const launchEnd = source.indexOf('private void download(String jobId, String urlString, File part)', launchStart);
  assert.ok(launchStart >= 0 && launchEnd > launchStart, 'launch and download methods must exist');
  const launch = source.slice(launchStart, launchEnd);
  const tokenIndex = launch.indexOf('claimWorker(jobId)');
  const executeIndex = launch.indexOf('executor.execute(', tokenIndex);
  assert.ok(tokenIndex >= 0 && executeIndex > tokenIndex,
    'a new resume must supersede the previous worker generation before the queued worker runs');

  const downloadEnd = source.indexOf('private static boolean contentRangeStartsAt(', launchEnd);
  const method = source.slice(launchEnd, downloadEnd);
  const connectionPutIndex = method.indexOf('activeConnections.put(jobId, connection)');
  const beforeConnectGuard = method.indexOf('isCurrentDownloadState(jobId)', connectionPutIndex);
  const connectIndex = method.indexOf('connection.connect()', beforeConnectGuard);
  const afterConnectGuard = method.indexOf('isCurrentDownloadState(jobId)', connectIndex);
  assert.ok(connectionPutIndex >= 0 && beforeConnectGuard > connectionPutIndex && connectIndex > beforeConnectGuard && afterConnectGuard > connectIndex,
    'worker identity/state must be checked immediately before and after connect');
});

test('pause persists PAUSED before closing stream and disconnecting while keeping the partial file', () => {
  const start = source.indexOf('public void pauseDownload(PluginCall call)');
  const end = source.indexOf('public void resumeDownload(PluginCall call)', start);
  assert.ok(start >= 0 && end > start, 'pauseDownload method must exist');
  const method = source.slice(start, end);

  const pausedIndex = method.indexOf('snapshot.put("state", "PAUSED")');
  const saveIndex = method.indexOf('save(snapshot)', pausedIndex);
  const streamIndex = method.indexOf('activeStreams.get(jobId)', saveIndex);
  const closeIndex = method.indexOf('.close()', streamIndex);
  const connectionIndex = method.indexOf('activeConnections.get(jobId)', closeIndex);
  const disconnectIndex = method.indexOf('.disconnect()', connectionIndex);
  assert.ok(pausedIndex >= 0 && saveIndex > pausedIndex,
    'PAUSED must be durable before network interruption');
  assert.ok(streamIndex > saveIndex && closeIndex > streamIndex && connectionIndex > closeIndex && disconnectIndex > connectionIndex,
    'pause must close the blocking stream and then disconnect only after PAUSED is durable');
  assert.doesNotMatch(method, /\.delete\(\)/,
    'pause must preserve the partial file');
});

test('a pause-triggered or superseded-worker network exception never enters automatic retry', () => {
  const start = source.indexOf('private void download(String jobId, String urlString, File part)');
  const catchStart = source.indexOf('} catch (Exception e) {', start);
  const finallyStart = source.indexOf('} finally {', catchStart);
  assert.ok(start >= 0 && catchStart > start && finallyStart > catchStart, 'download catch block must exist');
  const block = source.slice(catchStart, finallyStart);

  const workerIndex = block.indexOf('isCurrentWorker(jobId)');
  const stateIndex = block.indexOf('load(jobId)', workerIndex);
  const pausedIndex = block.indexOf('"PAUSED"', stateIndex);
  const retryIndex = block.indexOf('isRetryableNetworkError(e)');
  assert.ok(workerIndex >= 0 && stateIndex > workerIndex && pausedIndex > stateIndex && retryIndex > pausedIndex,
    'catch path must reject a superseded worker and re-read durable PAUSED before network retry classification');
});

test('cancel closes active stream and connection and is allowed while retrying or verifying', () => {
  const start = source.indexOf('public void discardDownload(PluginCall call)');
  const end = source.indexOf('public void requestInstall(PluginCall call)', start);
  assert.ok(start >= 0 && end > start, 'discardDownload method must exist');
  const method = source.slice(start, end);

  assert.match(method, /requireState\(call, snapshot,[^;]*"RETRYING"[^;]*"VERIFYING"/s,
    'cancel must remain available while waiting to retry and while verifying');
  const streamIndex = method.indexOf('activeStreams.get(jobId)');
  const closeIndex = method.indexOf('.close()', streamIndex);
  const connectionIndex = method.indexOf('activeConnections.get(jobId)', closeIndex);
  const disconnectIndex = method.indexOf('.disconnect()', connectionIndex);
  const snapshotDeleteIndex = method.indexOf('remove(PREFIX + jobId)');
  assert.ok(streamIndex >= 0 && closeIndex > streamIndex && connectionIndex > closeIndex && disconnectIndex > connectionIndex && snapshotDeleteIndex > disconnectIndex,
    'cancel must stop blocking I/O before deleting durable job state');
});
