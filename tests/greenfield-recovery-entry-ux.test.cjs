"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'ui/app.mjs'), 'utf8');

test('recovery entry is a direct file restore path, not a user checkpoint', () => {
  assert.match(html, /id="restoreFile"/);
  assert.match(html, /กู้คืนข้อมูล/);
  assert.doesNotMatch(html, /recoveryPassphrase|verifyRecoveryBtn|evidenceFile|importEvidenceBtn|กู้คืนข้อมูลขั้นสูง/);
  assert.doesNotMatch(app, /recoveryPassphrase\(|importEvidenceBtn|evidenceFile|ensureRecoveryRuntime/);
});

test('restore UX never exposes raw Greenfield internal error names', () => {
  assert.doesNotMatch(html, /GREENFIELD_/);
  assert.match(app, /restoreErrorText/);
});
