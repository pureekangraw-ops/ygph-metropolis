import test from 'node:test';
import assert from 'node:assert/strict';
import { createSettingsControl } from '../src/settings-control.mjs';

test('Settings reports explicit NEW BASE version and truthful updater/rollback support', async () => {
  const checks = [];
  const settings = createSettingsControl({
    version:'0.1.0-new-base',
    runtime:{ async readState(){ return { revision:7 }; } },
    updater:{ async check(){ checks.push('check'); return { available:true, version:'0.1.1-new-base' }; } },
  });

  const status = settings.status();
  assert.equal(status.version, '0.1.0-new-base');
  assert.equal(status.rollbackSupported, false);

  const update = await settings.checkUpdate();
  assert.deepEqual(checks, ['check']);
  assert.equal(update.available, true);
  await assert.rejects(settings.rollback(), /SETTINGS_ROLLBACK_UNSUPPORTED/);
});

test('Settings backup delegates to proven Runtime backup without inventing storage', async () => {
  const calls = [];
  const settings = createSettingsControl({
    version:'0.1.0-new-base',
    runtime:{
      async exportBackup(options){ calls.push(options); return { format:'GREENFIELD_BACKUP', payload:'safe' }; },
      async readState(){ return { revision:3 }; },
    },
  });

  const backup = await settings.backup({ portable:true });
  assert.deepEqual(calls, [{ portable:true }]);
  assert.equal(backup.format, 'GREENFIELD_BACKUP');
});

test('Settings restore reads state back before returning a verified result', async () => {
  let reads = 0;
  const settings = createSettingsControl({
    version:'0.1.0-new-base',
    runtime:{
      async restoreBackup(backup, options){ return { status:'RESTORED', backup, options }; },
      async readState(){ reads += 1; return { revision:8 }; },
    },
  });

  const result = await settings.restore({ format:'GREENFIELD_BACKUP' }, { allowOverwrite:true });
  assert.equal(reads, 1);
  assert.equal(result.readback.revision, 8);
  assert.equal(result.operation.status, 'RESTORED');
});

test('Settings reset requires an explicit reset capability and reads back the resulting state', async () => {
  let resets = 0;
  let reads = 0;
  const settings = createSettingsControl({
    version:'0.1.0-new-base',
    runtime:{ async readState(){ reads += 1; return null; } },
    reset:{ async execute(){ resets += 1; return { cleared:true }; } },
  });

  const result = await settings.reset();
  assert.equal(resets, 1);
  assert.equal(reads, 1);
  assert.equal(result.operation.cleared, true);
  assert.equal(result.readback, null);

  const withoutReset = createSettingsControl({ version:'0.1.0-new-base', runtime:{ async readState(){ return {}; } } });
  await assert.rejects(withoutReset.reset(), /SETTINGS_RESET_UNSUPPORTED/);
});
