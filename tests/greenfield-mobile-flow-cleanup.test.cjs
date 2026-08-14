"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('mobile shell never leaves a sticky status strip above bottom navigation', () => {
  const css = read('styles.css');
  const statusRule = css.match(/\.app-status\s*\{[^}]*\}/s)?.[0] || '';
  assert.doesNotMatch(statusRule, /position\s*:\s*(?:sticky|fixed)/);
  assert.match(css, /\.app-status:empty\s*\{[^}]*display\s*:\s*none/s);
  const contentRule = css.match(/\.workspace-content\s*\{[^}]*\}/s)?.[0] || '';
  assert.match(contentRule, /padding-bottom\s*:\s*calc\([^)]*safe-area-inset-bottom/s);
});

test('Calendar keeps Cancel behind Edit and uses centered dialogs', () => {
  const html = read('index.html');
  const app = read('ui/app.mjs');
  assert.match(html, /<dialog[^>]*id="calendarEditDialog"/);
  assert.match(html, /<dialog[^>]*id="calendarCancelDialog"/);
  const actionFn = app.match(/function calendarActionItem[\s\S]*?function renderCalendar/)?.[0] || '';
  assert.match(actionFn, /แก้ไข/);
  assert.doesNotMatch(actionFn, /target of \['COMPLETED','CANCELLED'\]|textContent=.*ยกเลิก/);
});

test('Calendar reschedule is a CALENDAR-owned workflow', async () => {
  const workflows = await import(pathToFileURL(path.join(root, 'greenfield/business-workflows.mjs')).href);
  assert.equal(typeof workflows.buildCalendarRescheduleWorkflow, 'function');
  const plan = workflows.buildCalendarRescheduleWorkflow({ workflowId:'WF-RESCHEDULE', queueId:'Q-1', dueDate:'2026-08-20' });
  assert.equal(plan.commands.length, 1);
  assert.equal(plan.commands[0].domain, 'CALENDAR');
  assert.equal(plan.commands[0].type, 'CALENDAR_RESCHEDULE');
  assert.equal(plan.commands[0].payload.dueDate, '2026-08-20');
});

test('Settings is a flat centered utility dialog instead of a system page', () => {
  const html = read('index.html');
  const app = read('ui/app.mjs');
  assert.doesNotMatch(html, /data-area-page="system"/);
  const dialog = html.match(/<dialog[^>]*id="settingsDialog"[\s\S]*?<\/dialog>/)?.[0] || '';
  assert.ok(dialog);
  for (const label of ['ความปลอดภัย','สำรองและกู้คืน','ระบบ']) assert.match(dialog, new RegExp(label));
  assert.doesNotMatch(dialog, /<details\b/);
  assert.match(app, /settingsDialog.*showModal|showModal\(\).*settingsDialog/s);
});

test('production stylesheet keeps balanced rules and valid mobile grid tokens', () => {
  const css = read('styles.css');
  const opens = (css.match(/\{/g) || []).length;
  const closes = (css.match(/\}/g) || []).length;
  assert.equal(opens, closes, `unbalanced CSS braces: ${opens} open vs ${closes} close`);
  assert.doesNotMatch(css, /\b1fp\b/);
  assert.doesNotMatch(css, /background\s*:\s*344844\b/);
  assert.match(css, /\.hidden\s*\{\s*display\s*:\s*none!important\s*\}/);
});
