"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const uiPath = 'ui/master-input.mjs';
const manifestPath = 'RELEASE_MANIFEST.json';
const assetsIgnorePath = '.assetsignore';
const packagePath = 'package.json';

function source(path) {
  return fs.readFileSync(path, 'utf8');
}

test('P1C201 production Master Input imports the verified recovery session contract and keeps one in-memory active session', () => {
  const ui = source(uiPath);
  assert.match(ui, /master-input-recovery-session\.mjs/);
  assert.match(ui, /createRecoverySession/);
  assert.match(ui, /applySessionOwnerInput/);
  assert.match(ui, /let\s+activeRecoverySession\s*=\s*null/);
  assert.doesNotMatch(ui, /localStorage|sessionStorage|indexedDB/i);
});

test('P1C202 local RECOVERY_REQUIRED opens the active session before ASK while normal text remains routable as NEW_INPUT', () => {
  const ui = source(uiPath);
  assert.match(ui, /routed\.status\s*===\s*['"]RECOVERY_REQUIRED['"][\s\S]{0,1200}createRecoverySession\(/);
  assert.match(ui, /applySessionOwnerInput\(activeRecoverySession,\s*text/);
  assert.match(ui, /recoveryInput\.status\s*===\s*['"]NEW_INPUT['"]/);
  assert.match(ui, /routeMasterInputText\(text/);
});

test('P1C203 explicit correction and replacement are consumed by the pending recovery session without inventing execution', () => {
  const ui = source(uiPath);
  assert.match(ui, /recoveryInput\.status\s*===\s*['"]APPLIED['"]/);
  assert.match(ui, /recoveryInput\.status\s*===\s*['"]SELECTION_REQUIRED['"]/);
  assert.match(ui, /recoveryInput\.status\s*===\s*['"]REPLACE['"]/);
  assert.match(ui, /activeRecoverySession\s*=\s*recoveryInput\.state/);
  assert.doesNotMatch(ui, /runSessionLocalRecovery\(/);
});

test('P1C204 production closure publishes and syntax-checks both recovery modules', () => {
  const manifest = JSON.parse(source(manifestPath));
  const production = new Set(manifest.productionFiles.map(item => item.path));
  assert.equal(production.has('lighthouse/master-input-recovery-session.mjs'), true);
  assert.equal(production.has('lighthouse/intent-recovery.mjs'), true);

  const assetsIgnore = source(assetsIgnorePath);
  assert.match(assetsIgnore, /!\/lighthouse\/master-input-recovery-session\.mjs/);
  assert.match(assetsIgnore, /!\/lighthouse\/intent-recovery\.mjs/);

  const syntax = JSON.parse(source(packagePath)).scripts['check:syntax'];
  assert.match(syntax, /node --check lighthouse\/master-input-recovery-session\.mjs/);
  assert.match(syntax, /node --check lighthouse\/intent-recovery\.mjs/);
});
