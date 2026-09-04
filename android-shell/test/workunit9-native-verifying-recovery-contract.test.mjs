import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../native/updater/LighthouseUpdaterPlugin.java', import.meta.url), 'utf8');

test('completed download enters durable VERIFYING before the SHA pass', () => {
  const start = source.indexOf('private void download(String jobId, String urlString, File part)');
  const end = source.indexOf('private static boolean contentRangeStartsAt(', start);
  assert.ok(start >= 0 && end > start, 'download method must exist');
  const method = source.slice(start, end);

  const doneIndex = method.indexOf('JSObject done = load(jobId)');
  const verifyingIndex = method.indexOf('done.put("state", "VERIFYING")', doneIndex);
  const verifiedZeroIndex = method.indexOf('done.put("verifiedBytes", 0L)', verifyingIndex);
  const saveIndex = method.indexOf('save(done)', verifiedZeroIndex);
  const verificationIndex = method.indexOf('completeVerification(jobId, part)', saveIndex);

  assert.ok(doneIndex >= 0 && verifyingIndex > doneIndex && verifiedZeroIndex > verifyingIndex,
    'download completion must enter VERIFYING and start verifiedBytes at zero');
  assert.ok(saveIndex > verifiedZeroIndex && verificationIndex > saveIndex,
    'VERIFYING must be durable before local artifact verification begins');
});

test('verification stages only a matching artifact and records verified bytes', () => {
  const start = source.indexOf('private void completeVerification(String jobId, File part)');
  const end = source.indexOf('private void recoverVerifyingJob(', start);
  assert.ok(start >= 0 && end > start, 'completeVerification helper must exist');
  const method = source.slice(start, end);

  const stateIndex = method.indexOf('"VERIFYING".equals(');
  const digestIndex = method.indexOf('sha256File(part)', stateIndex);
  const expectedIndex = method.indexOf('"expectedSha256"', digestIndex);
  const mismatchIndex = method.indexOf('"UPDATE_ARTIFACT_MISMATCH"', expectedIndex);
  const renameIndex = method.indexOf('part.renameTo(apk)', mismatchIndex);
  const verifiedIndex = method.indexOf('done.put("verifiedBytes", apk.length())', renameIndex);
  const readyIndex = method.indexOf('done.put("state", "READY_TO_INSTALL")', verifiedIndex);

  assert.ok(stateIndex >= 0 && digestIndex > stateIndex && expectedIndex > digestIndex && mismatchIndex > expectedIndex,
    'verification must confirm durable VERIFYING state and expected SHA before staging');
  assert.ok(renameIndex > mismatchIndex && verifiedIndex > renameIndex && readyIndex > verifiedIndex,
    'only the verified artifact may be staged and verification byte readback must be durable before READY');
});

test('orphaned VERIFYING recovers the existing partial or already-renamed APK without network download', () => {
  const start = source.indexOf('public void getJobSnapshot(PluginCall call)');
  const end = source.indexOf('public void pauseDownload(PluginCall call)', start);
  assert.ok(start >= 0 && end > start, 'getJobSnapshot method must exist');
  const method = source.slice(start, end);

  const verifyingIndex = method.indexOf('"VERIFYING".equals(snapshot.getString("state"))');
  const orphanIndex = method.indexOf('!activeDownloads.contains(jobId)', verifyingIndex);
  const apkIndex = method.indexOf('jobId + ".apk"', orphanIndex);
  const actualIndex = method.indexOf('.length()', apkIndex);
  const recoverIndex = method.indexOf('recoverVerifyingJob(jobId, snapshot, part)', actualIndex);
  assert.ok(verifyingIndex >= 0 && orphanIndex > verifyingIndex,
    'snapshot recovery must recognize VERIFYING only when its worker is gone');
  assert.ok(apkIndex > orphanIndex && actualIndex > apkIndex && recoverIndex > actualIndex,
    'recovery must reconcile an existing partial/final artifact before restarting local verification');

  const helperStart = source.indexOf('private void recoverVerifyingJob(');
  const helperEnd = source.indexOf('private void recoverRetryingJob(', helperStart);
  assert.ok(helperStart >= 0 && helperEnd > helperStart, 'recoverVerifyingJob helper must exist before retry recovery');
  const helper = source.slice(helperStart, helperEnd);
  assert.match(helper, /activeDownloads\.add\(jobId\)/,
    'recovered verification must claim durable worker ownership');
  assert.match(helper, /completeVerification\(jobId, part\)/,
    'recovered verification must reuse the local artifact verification pass');
  assert.doesNotMatch(helper, /download\(jobId,/,
    'process-death recovery during VERIFYING must not re-download a complete artifact');
});
