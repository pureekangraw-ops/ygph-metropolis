"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

function source(path) {
  return fs.readFileSync(path, 'utf8');
}

test('FD16 production Master Input opens a multi-group recovery home for WAITING siblings and remembers completed siblings', () => {
  const ui = source('ui/master-input.mjs');
  assert.match(ui, /multi-group-frontdoor-recovery\.mjs/);
  assert.match(ui, /createFrontdoorMultiGroupRecoverySession/);
  assert.match(ui, /updateFrontdoorMultiGroupRecoverySession/);
  assert.match(ui, /routed\.route\s*===\s*['"]LOCAL_MULTI_GROUP['"][\s\S]{0,1800}routed\.commands\.some\(command\s*=>\s*command\.status\s*===\s*['"]WAITING['"]\)[\s\S]{0,900}createFrontdoorMultiGroupRecoverySession\(routed/);
  assert.match(ui, /executeFrontdoorMultiGroupBoxes\(runtime,\s*preparedMultiGroupRoute\)[\s\S]{0,1800}updateFrontdoorMultiGroupRecoverySession\(activeRecoverySession,\s*result\.commands\)/);
});

test('FD17 scalar correction rejoins the same multi-group compile identity against fresh durable revision instead of replaying completed siblings', () => {
  const ui = source('ui/master-input.mjs');
  assert.match(ui, /rejoinFrontdoorMultiGroupRecoverySession/);
  assert.match(ui, /recoveryInput\.status\s*===\s*['"]APPLIED['"][\s\S]{0,1800}recoveryInput\.state\?\.mode\s*===\s*['"]MULTI_GROUP['"]/);
  assert.match(ui, /rejoinFrontdoorMultiGroupRecoverySession\(recoveryInput\.state,[\s\S]{0,900}currentRevision\s*:\s*state\.revision/);
  assert.match(ui, /preparedMultiGroupRoute\s*=\s*rejoined\.routed/);
  assert.match(ui, /rejoined\.routed\.commands[\s\S]{0,900}status\s*===\s*['"]READY['"]/);
});

test('FD18 a resumed or executed WAITING multi-group uses the semantic recovery UI and never exposes a completed sibling as executable', () => {
  const ui = source('ui/master-input.mjs');
  assert.match(ui, /result\.commands\.some\(command\s*=>\s*command\.status\s*===\s*['"]WAITING['"]\)[\s\S]{0,700}showWaitingSession\(/);
  assert.match(ui, /rejoined\.routed\.commands\.filter\(command\s*=>\s*command\.status\s*===\s*['"]READY['"]\)/);
  assert.doesNotMatch(ui, /status\s*===\s*['"]COMPLETE['"][\s\S]{0,180}execute\s*:\s*true/);
});
