import test from 'node:test';
import assert from 'node:assert/strict';
import { createTrustedBrainGate } from '../www/trusted/brain-gate.mjs';

function fakeBrain() {
  let executes = 0;
  return {
    get executes() { return executes; },
    async send(text) {
      if (String(text).trim() === 'ข้าว 65') {
        return { status:'READY', preview:{ title:'ข้าว', amountSatang:6500 } };
      }
      throw new Error('unexpected raw send');
    },
    async execute() {
      executes += 1;
      return { status:'SUCCESS', readback:{ title:'ข้าว', amountSatang:6500 } };
    },
  };
}

test('READY becomes an in-chat confirmation request without mutation', async () => {
  const raw = fakeBrain();
  const gate = createTrustedBrainGate({ brain:raw });
  const result = await gate.send('ข้าว 65', { appVersion:'0.0.5' });
  assert.equal(raw.executes, 0);
  assert.equal(result.status, 'CONFIRMATION_REQUIRED');
  assert.equal(result.question, 'จะบันทึก ข้าว 65 บาทไหม');
  assert.equal(gate.requestExecution, undefined, 'no separate confirmation execution seam is exposed to the patchable front door');
});

test('ยืนยัน through the same chat send executes exactly once and returns durable readback', async () => {
  const raw = fakeBrain();
  const gate = createTrustedBrainGate({ brain:raw });
  await gate.send('ข้าว 65', { appVersion:'0.0.5' });
  const result = await gate.send('ยืนยัน', { appVersion:'0.0.5' });
  assert.equal(raw.executes, 1);
  assert.equal(result.status, 'SUCCESS');
  assert.deepEqual(result.readback, { title:'ข้าว', amountSatang:6500 });
  const retry = await gate.send('ยืนยัน', { appVersion:'0.0.5' });
  assert.equal(raw.executes, 1, 'lost response/retry must not execute pending command twice');
  assert.notEqual(retry.status, 'SUCCESS');
});

test('ยกเลิก and unrelated text fail closed without mutation', async () => {
  const raw = fakeBrain();
  const gate = createTrustedBrainGate({ brain:raw });
  await gate.send('ข้าว 65');
  const unrelated = await gate.send('สวัสดี');
  assert.equal(unrelated.status, 'BLOCKED');
  assert.equal(raw.executes, 0);
  const cancelled = await gate.send('ยกเลิก');
  assert.equal(cancelled.status, 'CANCELLED');
  assert.equal(raw.executes, 0);
});

test('new gate instance has no persisted pending command and therefore fails closed after restart', async () => {
  const raw = fakeBrain();
  const first = createTrustedBrainGate({ brain:raw });
  await first.send('ข้าว 65');
  const afterRestart = createTrustedBrainGate({ brain:raw });
  const result = await afterRestart.send('ยืนยัน');
  assert.equal(raw.executes, 0);
  assert.notEqual(result.status, 'SUCCESS');
});
