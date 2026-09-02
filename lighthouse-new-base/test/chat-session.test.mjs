import test from 'node:test';
import assert from 'node:assert/strict';
import { createChatSession } from '../src/chat-session.mjs';

function draft(amountSatang = 6500) {
  return {
    type: 'draft',
    owner: 'outcome',
    action: 'expense',
    fields: { title: 'ข้าว', amountSatang },
    summary: `รายจ่าย ข้าว ${amountSatang / 100} บาท`,
  };
}

test('CHAT keeps Quick Capture inside the conversation and does not write before confirmation', async () => {
  let commits = 0;
  const chat = createChatSession({
    interpret: async text => text === 'ข้าว 65' ? draft() : { type: 'reply', text: 'รับทราบ' },
    commit: async () => { commits += 1; },
    readback: async () => ({ ok: true }),
  });

  const result = await chat.receive('ข้าว 65');
  assert.equal(commits, 0);
  assert.equal(result.pending.owner, 'outcome');
  assert.deepEqual(result.messages.map(m => m.side), ['user', 'assistant']);
  assert.match(result.messages.at(-1).text, /รายจ่าย ข้าว 65 บาท/);
  assert.match(result.messages.at(-1).text, /ยืนยัน/);
});

test('typing ยืนยัน commits through the owner then reports success only after readback', async () => {
  const calls = [];
  const chat = createChatSession({
    interpret: async () => draft(),
    commit: async pending => { calls.push(['commit', pending.owner]); return { recordId: 'TX-1' }; },
    readback: async receipt => { calls.push(['readback', receipt.recordId]); return { ok: true }; },
  });

  await chat.receive('ข้าว 65');
  const result = await chat.receive('ยืนยัน');
  assert.deepEqual(calls, [['commit', 'outcome'], ['readback', 'TX-1']]);
  assert.equal(result.pending, null);
  assert.equal(result.messages.at(-1).text, 'บันทึกแล้ว');
});

test('CHAT does not claim success when owner readback is not proven', async () => {
  const chat = createChatSession({
    interpret: async () => draft(),
    commit: async () => ({ recordId: 'TX-1' }),
    readback: async () => ({ ok: false }),
  });

  await chat.receive('ข้าว 65');
  const result = await chat.receive('ยืนยัน');
  assert.notEqual(result.messages.at(-1).text, 'บันทึกแล้ว');
  assert.match(result.messages.at(-1).text, /ยังยืนยันผลไม่ได้/);
});

test('ยกเลิก clears the pending draft without a write', async () => {
  let commits = 0;
  const chat = createChatSession({
    interpret: async () => draft(),
    commit: async () => { commits += 1; },
    readback: async () => ({ ok: true }),
  });

  await chat.receive('ข้าว 65');
  const result = await chat.receive('ยกเลิก');
  assert.equal(commits, 0);
  assert.equal(result.pending, null);
  assert.equal(result.messages.at(-1).text, 'ยกเลิกแล้ว');
});

test('แก้ไข replaces the draft in conversation and still requires a new confirmation', async () => {
  let commits = 0;
  const chat = createChatSession({
    interpret: async text => text.includes('70') ? draft(7000) : draft(),
    commit: async () => { commits += 1; },
    readback: async () => ({ ok: true }),
  });

  await chat.receive('ข้าว 65');
  const result = await chat.receive('แก้ไข ข้าว 70');
  assert.equal(commits, 0);
  assert.equal(result.pending.fields.amountSatang, 7000);
  assert.match(result.messages.at(-1).text, /70 บาท/);
  assert.match(result.messages.at(-1).text, /ยืนยัน/);
});
