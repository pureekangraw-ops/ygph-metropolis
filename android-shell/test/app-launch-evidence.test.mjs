import test from 'node:test';
import assert from 'node:assert/strict';
import {
  captureAppLaunchEvidence,
  parseResolvedActivity,
  parseAmStartWait,
} from '../tools/capture-app-launch-evidence.mjs';

test('parses the resolved launcher activity for LIGHTHOUSE only', () => {
  assert.equal(
    parseResolvedActivity('com.yggdrasil.lighthouse/.MainActivity\n', 'com.yggdrasil.lighthouse'),
    'com.yggdrasil.lighthouse/.MainActivity',
  );
  assert.throws(
    () => parseResolvedActivity('other.app/.MainActivity\n', 'com.yggdrasil.lighthouse'),
    /ADB_LAUNCH_ACTIVITY_MISSING/,
  );
});

test('accepts only am start -W receipts with Status ok', () => {
  const receipt = parseAmStartWait('Status: ok\nActivity: com.yggdrasil.lighthouse/.MainActivity\nTotalTime: 184\n');
  assert.equal(receipt.status, 'ok');
  assert.equal(receipt.activity, 'com.yggdrasil.lighthouse/.MainActivity');
  assert.equal(receipt.totalTimeMs, 184);
  assert.throws(() => parseAmStartWait('Status: timeout\n'), /ADB_LAUNCH_FAILED/);
});

test('captures post-install launch evidence through injected adb commands', async () => {
  const calls = [];
  const runner = async (command, args) => {
    calls.push([command, ...args]);
    if (args.includes('resolve-activity')) {
      return { status:0, stdout:'com.yggdrasil.lighthouse/.MainActivity\n', stderr:'' };
    }
    if (args.includes('force-stop')) {
      return { status:0, stdout:'', stderr:'' };
    }
    if (args.includes('start')) {
      return {
        status:0,
        stdout:'Status: ok\nActivity: com.yggdrasil.lighthouse/.MainActivity\nTotalTime: 184\n',
        stderr:'',
      };
    }
    if (args.includes('pidof')) {
      return { status:0, stdout:'4242\n', stderr:'' };
    }
    throw new Error('unexpected adb command');
  };

  const evidence = await captureAppLaunchEvidence({
    applicationId:'com.yggdrasil.lighthouse',
    runner,
    capturedAt:'2026-09-18T01:20:00.000Z',
  });

  assert.deepEqual(evidence, {
    source:'ADB_AM_START_WAIT',
    capturedAt:'2026-09-18T01:20:00.000Z',
    applicationId:'com.yggdrasil.lighthouse',
    component:'com.yggdrasil.lighthouse/.MainActivity',
    launched:true,
    processId:'4242',
    activity:'com.yggdrasil.lighthouse/.MainActivity',
    totalTimeMs:184,
  });
  assert.equal(calls.some(call => call.includes('resolve-activity')), true);
  assert.equal(calls.some(call => call.includes('force-stop')), true);
  assert.equal(calls.some(call => call.includes('-W')), true);
  assert.equal(calls.some(call => call.includes('pidof')), true);
});


test('fails closed when the launched app process is not alive after am start -W', async () => {
  const runner = async (_command, args) => {
    if (args.includes('resolve-activity')) return { status:0, stdout:'com.yggdrasil.lighthouse/.MainActivity\n', stderr:'' };
    if (args.includes('force-stop')) return { status:0, stdout:'', stderr:'' };
    if (args.includes('start')) return { status:0, stdout:'Status: ok\nTotalTime: 50\n', stderr:'' };
    if (args.includes('pidof')) return { status:0, stdout:'', stderr:'' };
    throw new Error('unexpected adb command');
  };
  await assert.rejects(
    captureAppLaunchEvidence({ applicationId:'com.yggdrasil.lighthouse', runner }),
    /ADB_LAUNCH_PROCESS_MISSING/,
  );
});
