"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

function area(html, name, nextName) {
  const start = html.indexOf(`data-area-page="${name}"`);
  const end = nextName ? html.indexOf(`data-area-page="${nextName}"`, start) : html.indexOf('<dialog', start);
  return html.slice(start, end > start ? end : undefined);
}

test('Store Ride and Finance expose short work as action buttons instead of expanded task forms', () => {
  const html = read('index.html');
  const store = area(html, 'store', 'ride');
  const ride = area(html, 'ride', 'finance');
  const finance = area(html, 'finance', 'calendar');

  for (const task of ['sale','purchase','withdraw','adjust']) assert.match(store, new RegExp(`data-task-open="${task}"`));
  for (const task of ['ride-job','ride-expense','ride-withdraw']) assert.match(ride, new RegExp(`data-task-open="${task}"`));
  for (const task of ['income','expense','obligation']) assert.match(finance, new RegExp(`data-task-open="${task}"`));

  for (const formId of ['saleForm','purchaseForm','withdrawForm','adjustForm']) assert.doesNotMatch(store, new RegExp(`id="${formId}"`));
  for (const formId of ['rideJobForm','rideExpenseForm','rideWithdrawForm']) assert.doesNotMatch(ride, new RegExp(`id="${formId}"`));
  for (const formId of ['incomeForm','expenseForm','obligationForm']) assert.doesNotMatch(finance, new RegExp(`id="${formId}"`));
});

test('short work forms live in one centered modal task surface', () => {
  const html = read('index.html');
  const dialog = html.match(/<dialog[^>]*id="taskDialog"[\s\S]*?<\/dialog>/)?.[0] || '';
  assert.ok(dialog, 'taskDialog must exist');
  for (const formId of ['saleForm','purchaseForm','withdrawForm','adjustForm','rideJobForm','rideExpenseForm','rideWithdrawForm','incomeForm','expenseForm','obligationForm']) {
    assert.match(dialog, new RegExp(`id="${formId}"`));
  }
  assert.doesNotMatch(dialog, /<details\b/);

  const css = read('styles.css');
  const modalRule = css.match(/\.modal-dialog\s*\{[^}]*\}/s)?.[0] || '';
  assert.match(modalRule, /margin\s*:\s*auto/);
});

test('task launcher opens one pane and successful dialog form submission returns to city context', () => {
  const app = read('ui/app.mjs');
  assert.match(app, /function openTaskDialog\(/);
  assert.match(app, /document\.querySelectorAll\('\[data-task-open\]'\)/);
  assert.match(app, /taskDialogTitle/);
  assert.match(app, /closest\(['"]#taskDialog['"]\)/);
  assert.match(app, /taskDialog.*close\(\)|closeTaskDialog\(\)/s);
});

test('history and city summaries remain on their owner pages rather than moving into task modal', () => {
  const html = read('index.html');
  const dialog = html.match(/<dialog[^>]*id="taskDialog"[\s\S]*?<\/dialog>/)?.[0] || '';
  for (const id of ['storeList','rideList','obligationList','ledgerList']) assert.doesNotMatch(dialog, new RegExp(`id="${id}"`));
  for (const id of ['storeToday','rideGenerated','financeBalance']) assert.doesNotMatch(dialog, new RegExp(`id="${id}"`));
});
