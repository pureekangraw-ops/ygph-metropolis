"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');

function source(name) {
  return fs.readFileSync(path.join(root, name), 'utf8');
}

test('Ride exposes overview jobs summary and history inspection surfaces', () => {
  const html = source('index.html');
  for (const view of ['overview','jobs','summary','history']) assert.match(html, new RegExp(`data-ride-view="${view}"`));
  assert.match(html, /id="rideStartRegion"/);
  assert.match(html, /id="rideActiveActions"/);
  assert.match(html, /id="rideCreditActions"/);
});

test('Ride current-round actions and global credit action live in separate surfaces', () => {
  const html = source('index.html');
  assert.match(html, /id="rideCurrentRoundCard"[\s\S]*id="rideActiveActions"[\s\S]*id="rideEndBtn"[\s\S]*<\/section>[\s\S]*id="rideCreditCard"[\s\S]*id="rideCreditActions"/);
  const popup = source('ui/action-popups.mjs');
  assert.match(popup, /'ride-job'/);
  assert.match(popup, /'ride-expense'/);
  assert.match(popup, /'ride-withdraw'/);
});

test('Ride UI is driven by derived round state and never ties credit visibility to active round', () => {
  const app = source('ui/app.mjs');
  assert.match(app, /projectRideState/);
  assert.match(app, /projectRideRound/);
  assert.match(app, /todayRoundState/);
  assert.match(app, /ACTIVE/);
  assert.match(app, /COMPLETED/);
  assert.match(app, /ยังไม่เริ่ม/);
  assert.match(app, /pendingCreditSatang/);
  assert.doesNotMatch(app, /rideCreditActions[^\n]+activeRound/);
});

test('Ride summary labels generated cash credit and expense as distinct truths', () => {
  const html = source('index.html');
  assert.match(html, /id="rideSummaryGenerated"/);
  assert.match(html, /id="rideSummaryCash"/);
  assert.match(html, /id="rideSummaryCredit"/);
  assert.match(html, /id="rideSummaryExpense"/);
  assert.match(html, /สร้างได้ในรอบ/);
  assert.match(html, /เงินสดจากงาน/);
  assert.match(html, /เครดิตจากงาน/);
  assert.match(html, /ค่าใช้จ่ายรอบ/);
});

test('Ride job and expense handlers still fail closed without an active round', () => {
  const app = source('ui/app.mjs');
  assert.match(app, /rideJobForm[\s\S]*if\(!round\)throw new Error\('เริ่มรอบก่อนบันทึกงาน'\)/);
  assert.match(app, /rideExpenseForm[\s\S]*if\(!round\)throw new Error\('เริ่มรอบก่อนบันทึกค่าใช้จ่าย'\)/);
});
