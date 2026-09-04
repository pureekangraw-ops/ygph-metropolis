import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createSettingsUpdatePanel } from '../app/public/ui/settings-update-panel.mjs';

const CASES = [
  ['CHECKING', 'กำลังตรวจหาอัปเดต', []],
  ['AVAILABLE', 'พบรุ่นใหม่', ['ดาวน์โหลดและติดตั้ง']],
  ['DOWNLOADING', 'กำลังดาวน์โหลด', ['หยุดชั่วคราว', 'ยกเลิก']],
  ['PAUSED', 'หยุดชั่วคราว', ['ดาวน์โหลดต่อ', 'ยกเลิก']],
  ['RETRYING', 'การเชื่อมต่อขาด กำลังลองใหม่', ['ยกเลิก']],
  ['VERIFYING', 'กำลังตรวจความถูกต้อง', ['ยกเลิก']],
  ['READY_TO_INSTALL', 'APK พร้อมติดตั้ง', ['เปิดหน้าติดตั้ง']],
  ['PERMISSION_REQUIRED', 'ต้องอนุญาตการติดตั้งจาก LIGHTHOUSE', ['เปิดสิทธิ์']],
  ['WAITING_ANDROID_CONFIRMATION', 'รอการยืนยันจาก Android', []],
  ['READBACK', 'กำลังตรวจรุ่นที่ติดตั้ง', []],
  ['DONE', 'อัปเดตเรียบร้อย', ['ปิด']],
  ['FAILED', 'อัปเดตไม่สำเร็จ', ['ลองใหม่', 'ยกเลิก']],
];

test('one updater panel derives message and buttons only from the current durable state', () => {
  const dom = new JSDOM('<!doctype html><body></body>');
  const panel = createSettingsUpdatePanel({ document:dom.window.document });
  dom.window.document.body.append(panel.element);
  const originalElement = panel.element;

  for (const [state, message, buttons] of CASES) {
    panel.render({ state, error:'NETWORK_TIMEOUT' });
    assert.equal(panel.element, originalElement, 'render must reuse one panel instead of creating state pages');
    assert.equal(panel.element.querySelector('[data-role="update-status"]')?.textContent, message);
    assert.deepEqual(
      [...panel.element.querySelectorAll('button')].map(button => button.textContent),
      buttons,
      `${state} actions must come from the state contract`,
    );
  }
});
