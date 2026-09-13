"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const appPath = 'ui/go-client.mjs';
const flowPath = 'ui/go-client-flow.mjs';
const stylePath = 'go-client.css';

test('GO Customer Desk exposes the five customer-facing Figma states', async () => {
  const { resolveCustomerDeskView } = await import('../ui/go-client-flow.mjs');
  assert.equal(resolveCustomerDeskView({ stage:'SALES', messages:[] }), 'LANDING');
  assert.equal(resolveCustomerDeskView({ stage:'SALES', messages:[{ role:'user', text:'สวัสดี' }] }), 'ACTIVE_CHAT');
  assert.equal(resolveCustomerDeskView({ stage:'INTAKE', messages:[{ role:'user', text:'เริ่มงาน' }] }), 'INTAKE_FILES');
  assert.equal(resolveCustomerDeskView({ stage:'INTAKE', estimate:{ package:'STANDARD', priceBaht:790, pageCount:10 } }), 'ESTIMATE_SUMMARY');
  assert.equal(resolveCustomerDeskView({ stage:'INTAKE', managerBusy:true }), 'GO_ASSISTING');
  assert.equal(resolveCustomerDeskView({ stage:'INTAKE', managerMode:'TAKEOVER' }), 'GO_ASSISTING');
});

test('customer-facing shell is branded GO Customer Desk and keeps internal modes backstage', () => {
  const source = fs.readFileSync(appPath, 'utf8');
  assert.match(source, /GO Customer Desk/);
  assert.match(source, /พร้อมช่วยรับรายละเอียดงาน/);
  assert.match(source, /data-go-customer-view/);
  assert.match(source, /GO กำลังช่วยดูเรื่องนี้/);
  assert.doesNotMatch(source, />\s*(?:WHISPER|DIRECT_REPLY|TAKEOVER|Conversation Gear|Work Ledger)\s*</i);
});

test('file UI tells the truth: selection and metadata inspection are not presented as upload or full read', () => {
  const source = fs.readFileSync(appPath, 'utf8');
  assert.match(source, /เลือกไฟล์แล้ว/);
  assert.match(source, /ตรวจ(?:จาก)?ชื่อไฟล์และประเภทไฟล์(?:เบื้องต้น)?/);
  assert.match(source, /ยังไม่ได้อ่านเนื้อหาทั้งไฟล์/);
  assert.doesNotMatch(source, /อัปโหลดไฟล์สำเร็จ/);
  assert.doesNotMatch(source, /อ่านไฟล์เรียบร้อย/);
});

test('Figma skin uses mobile-first Customer Desk layout and touch targets', () => {
  const css = fs.readFileSync(stylePath, 'utf8');
  assert.match(css, /\.go-customer-topbar/);
  assert.match(css, /\.go-customer-brand-mark/);
  assert.match(css, /\[data-go-customer-view="GO_ASSISTING"\]/);
  assert.match(css, /min-height:\s*44px/);
  assert.match(css, /@media\(min-width:900px\)/);
});

test('estimate copy never hard-codes turnaround and keeps package pricing truthful', () => {
  const source = fs.readFileSync(appPath, 'utf8');
  assert.match(source, /รอ(?:ประเมิน|ยืนยัน)ตามขอบเขต/);
  assert.doesNotMatch(source, /2\s*[-–]\s*3\s*วัน/);
  assert.match(source, /Standard[^\n]*790 บาท/);
  assert.match(source, /ไม่เกิน 10 หน้า/);
});
