import test from 'node:test';
import assert from 'node:assert/strict';
import { createSettingsService } from '../app/public/logic/settings/settings-service.mjs';

function fixture() {
  const calls = [];
  const service = createSettingsService({
    session:{
      setup: async input => (calls.push(['setup', input]), { status:'READY' }),
      unlock: async input => (calls.push(['unlock', input]), input.code === '2468' ? { status:'UNLOCKED' } : { status:'DENIED' }),
      lock: async () => (calls.push(['lock']), { status:'LOCKED' }),
    },
    backup:{
      export: async input => (calls.push(['export', input]), { status:'EXPORTED', artifact:'backup' }),
      restore: async input => (calls.push(['restore', input]), { status:'RESTORED' }),
    },
    modules:{ list: async () => [{ moduleId:'INCOME', lifecycle:'ACTIVE' }] },
    identity:{ installed: async () => ({ applicationId:'com.yggdrasil.lighthouse', versionName:'1.0.0', versionCode:1005, signerCertificateSha256:'abc' }) },
  });
  return { service, calls };
}

test('first run setup and unlock delegate to session owner without UI truth', async () => {
  const { service, calls } = fixture();
  assert.equal((await service.setup({ code:'2468' })).status, 'READY');
  assert.equal((await service.unlock({ code:'2468' })).status, 'UNLOCKED');
  assert.equal((await service.unlock({ code:'0000' })).status, 'DENIED');
  assert.deepEqual(calls.map(item => item[0]).slice(0,3), ['setup','unlock','unlock']);
});

test('version identity comes from installed readback owner', async () => {
  const { service } = fixture();
  assert.deepEqual(await service.identity(), {
    applicationId:'com.yggdrasil.lighthouse', versionName:'1.0.0', versionCode:1005, signerCertificateSha256:'abc'
  });
});

test('settings exposes backup restore and module management through real service owners', async () => {
  const { service } = fixture();
  assert.equal((await service.exportBackup({ recoveryCode:'x' })).status, 'EXPORTED');
  assert.equal((await service.restoreBackup({ recoveryCode:'x', artifact:'backup' })).status, 'RESTORED');
  assert.deepEqual(await service.modules(), [{ moduleId:'INCOME', lifecycle:'ACTIVE' }]);
});
