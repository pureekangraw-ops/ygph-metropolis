import test from 'node:test';
import assert from 'node:assert/strict';
import { projectSettingsSurface, createSettingsControl } from '../src/settings-surface.mjs';

test('Settings exposes only operations backed by actual capabilities', () => {
  const view = projectSettingsSurface({
    version:'6.0.0',
    capabilities:{ checkUpdate:true, backup:true, restore:true, reset:true, rollback:false },
  });
  assert.equal(view.version, '6.0.0');
  assert.deepEqual(view.actions, ['check-update','backup','restore','reset']);
  assert.equal(view.actions.includes('rollback'), false);
});

test('Settings control executes a proven operation and reads back before reporting it', async () => {
  const calls = [];
  const operations = {
    async backup(){ calls.push('backup'); return { backupId:'B1' }; },
    async readStatus(){ calls.push('readStatus'); return { lastBackupId:'B1' }; },
  };
  const control = createSettingsControl({ operations });
  const result = await control.execute('backup');
  assert.deepEqual(calls, ['backup','readStatus']);
  assert.equal(result.operationResult.backupId, 'B1');
  assert.equal(result.readback.lastBackupId, 'B1');
});

test('Settings fails closed when an operation is not actually available', async () => {
  const control = createSettingsControl({ operations:{ async readStatus(){ return {}; } } });
  await assert.rejects(control.execute('rollback'), /SETTINGS_ACTION_UNAVAILABLE/);
});
