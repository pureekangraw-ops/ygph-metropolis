const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const runtimeGatePath = path.join(process.cwd(), 'lighthouse-next/runtime-gate.mjs');

test('PIN authentication errors use PIN-facing language consistently', async () => {
  const { authMessage } = await import(runtimeGatePath);

  assert.equal(authMessage(new Error('DEVICE_PIN_INVALID')), 'PIN ไม่ถูกต้อง');
  assert.match(authMessage(new Error('DEVICE_PIN_TOO_SHORT')), /^PIN ต้องมีอย่างน้อย \d+ หลัก$/);
  assert.equal(authMessage(new Error('DEVICE_PIN_CONFIRM_MISMATCH')), 'PIN ใหม่ทั้งสองช่องไม่ตรงกัน');
  assert.equal(authMessage(new Error('DEVICE_UNLOCK_NOT_ENROLLED')), 'อุปกรณ์นี้ยังไม่ได้ตั้งค่า PIN');
  assert.equal(authMessage(new Error('DEVICE_UNLOCK_INCOMPLETE')), 'ข้อมูล PIN บนอุปกรณ์ยังไม่สมบูรณ์ ต้องซ่อมการตั้งค่าก่อน');
  assert.equal(authMessage(new Error('FIRST_RUN_ALREADY_ENROLLED')), 'อุปกรณ์นี้ตั้งค่า PIN แล้ว กรุณาเข้าสู่ระบบ');
});
