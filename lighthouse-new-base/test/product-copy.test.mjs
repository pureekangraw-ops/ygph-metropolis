import test from 'node:test';
import assert from 'node:assert/strict';
import { PRODUCT_COPY, toUserMessage } from '../src/product-copy.mjs';

const forbidden = [
  'IDLE', 'READY', 'WAITING', 'SUCCESS', 'COMPLETED',
  'BLOCKED', 'FAILED', 'ERROR', 'READBACK', 'MASTER_INPUT', 'METROPOLIS',
];

test('visible product copy never exposes internal runtime vocabulary', () => {
  const visible = Object.values(PRODUCT_COPY).join(' ').toUpperCase();
  for (const term of forbidden) assert.doesNotMatch(visible, new RegExp(term));
});

test('user messages describe meaningful outcomes instead of internal states', () => {
  assert.equal(toUserMessage('saved'), 'บันทึกแล้ว');
  assert.equal(toUserMessage('needs-confirmation'), 'กรุณายืนยันก่อนบันทึก');
  assert.equal(toUserMessage('try-again'), 'ยังทำไม่ได้ ลองอีกครั้ง');
});

test('unknown internal result fails closed without echoing the internal code', () => {
  assert.equal(toUserMessage('WAITING_FOR_READBACK'), 'ยังทำไม่ได้');
});
