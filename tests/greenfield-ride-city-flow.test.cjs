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
  const rideUi = source('ui/ride-ui.mjs');
  assert.match(rideUi, /projectRideState/);
  assert.match(rideUi, /projectRideRound/);
  assert.match(rideUi, /todayRoundState/);
  assert.match(rideUi, /ACTIVE/);
  assert.match(rideUi, /COMPLETED/);
  assert.match(rideUi, /ยังไม่เริ่ม/);
  assert.match(rideUi, /pendingCreditSatang/);
  assert.doesNotMatch(rideUi, /rideCreditActions[^\n]+activeRound/);
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
  const rideUi = source('ui/ride-ui.mjs');
  assert.match(rideUi, /rideJobForm[\s\S]*if\s*\(!round\)\s*throw new Error\('เริ่มรอบก่อนบันทึกงาน'\)/);
  assert.match(rideUi, /rideExpenseForm[\s\S]*if\s*\(!round\)\s*throw new Error\('เริ่มรอบก่อนบันทึกค่าใช้จ่าย'\)/);
});

test('Ride UI boundary is isolated behind its own module', () => {
  const boundaryPath = path.join(root, 'ui', 'ride-ui.mjs');
  assert.equal(fs.existsSync(boundaryPath), true, 'ui/ride-ui.mjs must exist');
  const app = source('ui/app.mjs');
  const rideUi = source('ui/ride-ui.mjs');
  assert.match(app, /from ['"]\.\/ride-ui\.mjs['"]/);
  assert.match(app, /createRideUi/);
  assert.match(app, /rideUi\.renderRide/);
  assert.match(app, /rideUi\.bindRide/);
  assert.match(rideUi, /renderRide/);
  assert.match(rideUi, /bindRide/);
  assert.doesNotMatch(app, /function renderRide/);
  assert.doesNotMatch(app, /rideJobForm/);
  assert.doesNotMatch(app, /rideExpenseForm/);
});
