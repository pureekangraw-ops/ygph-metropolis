import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const repoRoot = resolve(import.meta.dirname, '..', '..');
const shellPath = resolve(repoRoot, 'ui', 'lighthouse-shell.mjs');
const cssPath = resolve(repoRoot, 'lighthouse.css');
const themePath = resolve(repoRoot, 'ui', 'theme-shell.mjs');

function readRequired(path, label) {
  assert.ok(existsSync(path), `${label} must exist in the real app source`);
  return readFileSync(path, 'utf8');
}

test('LIGHTHOUSE owns the visible three-page app shell', () => {
  const shell = readRequired(shellPath, 'LIGHTHOUSE shell module');
  const theme = readRequired(themePath, 'theme shell');
  assert.match(shell, /LIGHTHOUSE/);
  assert.match(shell, /CHAT/);
  assert.match(shell, /MANUAL/);
  assert.match(shell, /SETTINGS/);
  assert.match(shell, /masterInputShell/);
  assert.match(shell, /manualHub/);
  assert.match(theme, /lighthouse-shell\.mjs/);
});

test('LIGHTHOUSE uses the approved coastal background and mobile navigation', () => {
  const css = readRequired(cssPath, 'LIGHTHOUSE stylesheet');
  assert.match(css, /--lh-navy:\s*#0d2b45/i);
  assert.match(css, /--lh-ocean:\s*#1e5a8a/i);
  assert.match(css, /--lh-seafoam:\s*#1fa7a4/i);
  assert.match(css, /--lh-aqua:\s*#7ed6cf/i);
  assert.match(css, /\.lighthouse-bottom-nav/);
  assert.match(css, /\.lighthouse-wave/);
  assert.match(css, /\.lighthouse-beacon/);
  assert.match(css, /env\(safe-area-inset-bottom\)/);
});

test('Manual shell reuses existing app destinations and does not own Truth', () => {
  const shell = readRequired(shellPath, 'LIGHTHOUSE shell module');
  assert.match(shell, /data-command-destination/);
  assert.match(shell, /finance/);
  assert.match(shell, /store/);
  assert.match(shell, /ride/);
  assert.doesNotMatch(shell, /greenfield\//);
  assert.doesNotMatch(shell, /runtime\.mjs/);
  assert.doesNotMatch(shell, /persistence\.mjs/);
});
