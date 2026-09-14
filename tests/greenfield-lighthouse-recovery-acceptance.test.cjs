const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = process.cwd();
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

function manualMarkup(html) {
  const match = html.match(/<div id="page-manual"[\s\S]*?<div id="page-settings"/);
  assert.ok(match, 'MANUAL root must exist before Settings');
  return match[0];
}

test('recovery contract keeps CHAT / MANUAL / SETTINGS as the only root navigation', () => {
  const html = read('lighthouse-next/index.html');
  assert.match(html, /data-root-target="chat"/);
  assert.match(html, /data-root-target="manual"/);
  assert.match(html, /data-root-target="settings"/);
  assert.doesNotMatch(html, /data-root-target="home"/);
  assert.doesNotMatch(html, /data-root-target="store"/);
  assert.doesNotMatch(html, /data-root-target="ride"/);
});

test('Income is a MANUAL parent that routes to Store, Ride and Other income', () => {
  const html = read('lighthouse-next/index.html');
  const manual = manualMarkup(html);
  const surface = read('lighthouse-next/surface-contract.mjs');

  assert.match(manual, /data-task="income"/, 'Income remains a MANUAL owner house');
  assert.match(surface, /data-income-target="store"[^>]*data-task="store"/, 'Income Store must reuse the existing Store task route');
  assert.match(surface, /data-income-target="ride"[^>]*data-task="ride"/, 'Income Ride must reuse the existing Ride task route');
  assert.match(surface, /data-income-target="other-general"/, 'Income must expose Other/General income');
  assert.match(surface, /incomeTarget === 'other-general'/, 'Other/General must route to the direct durable income form');
});

test('Store and Ride are descendants, never MANUAL owner houses', () => {
  const html = read('lighthouse-next/index.html');
  const manual = manualMarkup(html);
  assert.doesNotMatch(manual, /data-task="store"/);
  assert.doesNotMatch(manual, /data-task="ride"/);
});
