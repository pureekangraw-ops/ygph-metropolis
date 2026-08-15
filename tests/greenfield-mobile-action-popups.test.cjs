"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('mobile popup layer covers every short Store Ride and Finance action', () => {
  const popups = read('ui/action-popups.mjs');
  for (const [task, formId] of [
    ['sale','saleForm'],['purchase','purchaseForm'],['withdraw','withdrawForm'],['adjust','adjustForm'],
    ['ride-job','rideJobForm'],['ride-expense','rideExpenseForm'],['ride-withdraw','rideWithdrawForm'],
    ['income','incomeForm'],['expense','expenseForm'],['obligation','obligationForm'],
  ]) {
    assert.match(popups, new RegExp(`['\"]${task}['\"]\\s*:\\s*\\{[^}]*formId\\s*:\\s*['\"]${formId}['\"]`, 's'));
  }
});

test('popup layer moves the existing forms instead of cloning business forms', () => {
  const popups = read('ui/action-popups.mjs');
  assert.match(popups, /append\(form\)|appendChild\(form\)/);
  assert.doesNotMatch(popups, /cloneNode\(/);
  assert.match(popups, /closest\(['\"]details['\"]\)/);
  assert.match(popups, /replaceWith\(/);
});

test('short work uses one centered native dialog with one visible task pane', () => {
  const popups = read('ui/action-popups.mjs');
  const css = read('styles.css');
  assert.match(popups, /createElement\(['\"]dialog['\"]\)/);
  assert.match(popups, /id\s*=\s*['\"]taskDialog['\"]/);
  assert.match(popups, /showModal\(\)/);
  assert.match(popups, /data-task-open|dataset\.taskOpen/);
  assert.match(popups, /data-task-pane|dataset\.taskPane/);
  const modalRule = css.match(/\.modal-dialog\s*\{[^}]*\}/s)?.[0] || '';
  assert.match(modalRule, /margin\s*:\s*auto/);
});

test('successful task returns to its city while business validation errors keep popup open', () => {
  const popups = read('ui/action-popups.mjs');
  assert.match(popups, /MutationObserver/);
  assert.match(popups, /classList\.contains\(['\"]error['\"]\)/);
  assert.match(popups, /closeTaskDialog\(\)/);
  assert.match(popups, /reset\(\)/);
});

test('popup layer is loaded after the existing UI bindings so moved forms keep their handlers', () => {
  const rootApp = read('app.mjs');
  const uiImport = rootApp.indexOf("import './ui/app.mjs';");
  const popupImport = rootApp.indexOf("import './ui/action-popups.mjs';");
  assert.ok(uiImport >= 0, 'existing UI module import must remain');
  assert.ok(popupImport > uiImport, 'popup layer must evaluate after existing UI bindings');
});

test('workspace menu entries use popup panels instead of collapsible dropdown details', () => {
  const popups = read('ui/action-popups.mjs');
  for (const [menu, targetId] of [
    ['daily-goal','goalForm'],
    ['finance-obligations','obligationList'],
    ['finance-ledger','ledgerList'],
  ]) {
    assert.match(popups, new RegExp(`['\"]${menu}['\"]\\s*:\\s*\\{[^}]*targetId\\s*:\\s*['\"]${targetId}['\"]`, 's'));
  }
  assert.match(popups, /data-menu-open|dataset\.menuOpen/);
  assert.match(popups, /data-menu-pane|dataset\.menuPane/);
});
