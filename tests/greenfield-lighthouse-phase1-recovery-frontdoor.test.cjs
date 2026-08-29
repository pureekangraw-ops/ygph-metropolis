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
  assert.match(ui, /waitingDirectiveForSession/);
  assert.match(ui, /let\s+activeRecoverySession\s*=\s*null/);
  assert.doesNotMatch(ui, /localStorage|sessionStorage|indexedDB/i);
});

test('P1C202 local RECOVERY_REQUIRED opens a WAITING session before any provider call and new text is rerouted only after ABORTED', () => {
  const ui = source(uiPath);
  assert.match(ui, /routed\.status\s*===\s*['"]RECOVERY_REQUIRED['"][\s\S]{0,1800}createRecoverySession\(/);
  assert.match(ui, /setState\(['"]WAITING['"]/);
  assert.match(ui, /applySessionOwnerInput\(activeRecoverySession,\s*text/);
  assert.match(ui, /recoveryInput\.status\s*===\s*['"]ABORTED['"][\s\S]{0,500}activeRecoverySession\s*=\s*null/);
  assert.match(ui, /routeMasterInputText\(text/);
});

test('P1C203 explicit correction and replacement are consumed by the pending recovery session while interruption aborts it', () => {
  const ui = source(uiPath);
  assert.match(ui, /recoveryInput\.status\s*===\s*['"]APPLIED['"]/);
  assert.match(ui, /recoveryInput\.status\s*===\s*['"]SELECTION_REQUIRED['"]/);
  assert.match(ui, /recoveryInput\.status\s*===\s*['"]REPLACE['"]/);
  assert.match(ui, /recoveryInput\.status\s*===\s*['"]ABORTED['"]/);
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

test('P1C205 paused recovery is internally WAITING but the visible state label is รอ and is not styled as ERROR', () => {
  const ui = source(uiPath);
  assert.match(ui, /STATES[\s\S]{0,220}WAITING/);
  assert.match(ui, /WAITING\s*:\s*['"]รอ['"]/);
  assert.match(ui, /state\s*===\s*['"]ERROR['"]/);
  assert.doesNotMatch(ui, /state\s*===\s*['"]WAITING['"][^\n]{0,120}master-input-error/);
});

test('P1C206 production pause captures current durable revision and every resume supplies fresh revision plus capability preflight', () => {
  const ui = source(uiPath);
  assert.match(ui, /withMasterRuntime\([\s\S]{0,700}baseRevision\s*:\s*state\.revision/);
  assert.match(ui, /rejoinRecoverySession\(recoveryInput\.state,[\s\S]{0,900}currentRevision\s*:\s*state\.revision/);
  assert.match(ui, /capabilityPreflight\s*:[\s\S]{0,300}localPathKernel\.preflight/);
});
