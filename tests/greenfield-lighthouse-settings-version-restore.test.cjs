const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = process.cwd();
const modulePath = path.join(root, 'lighthouse-next', 'settings-operations.mjs');

test('staged LIGHTHOUSE build identity is generated from Android owner files', async () => {
  const { mkdtemp, readFile } = require('node:fs/promises');
  const { stageLighthouseBundle } = await import(path.join(root, 'scripts', 'stage-lighthouse-next-bundle.mjs'));
  const destinationRoot = await mkdtemp(path.join(os.tmpdir(), 'lh-settings-identity-'));
  await stageLighthouseBundle({ repoRoot:root, destinationRoot });

  const [generated, version, identity] = await Promise.all([
    readFile(path.join(destinationRoot, 'lighthouse-next', 'build-identity.json'), 'utf8').then(JSON.parse),
    readFile(path.join(root, 'android-shell', 'version.json'), 'utf8').then(JSON.parse),
    readFile(path.join(root, 'android-shell', 'apk-identity.json'), 'utf8').then(JSON.parse),
  ]);

  assert.equal(generated.owner, 'ANDROID_APK');
  assert.equal(generated.applicationId, identity.applicationId);
  assert.equal(generated.versionCode, version.versionCode);
  assert.equal(generated.versionName, version.versionName);
  assert.equal(generated.baselineVersionCode, version.baselineVersionCode);
});

test('Settings reads build identity without hard-coded version fallback', async () => {
  const { loadSettingsBuildIdentity } = await import(modulePath);
  const result = await loadSettingsBuildIdentity({
    fetchImpl: async url => {
      assert.equal(url, './build-identity.json');
      return {
        ok:true,
        async json() {
          return {
            owner:'ANDROID_APK',
            applicationId:'com.yggdrasil.lighthouse',
            versionCode:1008,
            versionName:'1.0.0-owner.3',
            baselineVersionCode:1007,
          };
        },
      };
    },
  });

  assert.equal(result.versionCode, 1008);
  assert.equal(result.versionName, '1.0.0-owner.3');
});

test('Settings restore requires explicit confirmation and delegates verified overwrite to active Runtime', async () => {
  const { restoreSettingsBackup } = await import(modulePath);
  let calls = 0;
  const backup = { backupFormat:'ygph-metropolis-greenfield-backup', backupVersion:1, vault:{} };

  const cancelled = await restoreSettingsBackup({
    backup,
    confirmRestore: async () => false,
    withSession: async () => { throw new Error('must not open runtime when cancelled'); },
  });
  assert.deepEqual(cancelled, { status:'CANCELLED' });

  const restored = await restoreSettingsBackup({
    backup,
    confirmRestore: async () => true,
    withSession: async operation => operation({
      restoreBackup: async (received, options) => {
        calls += 1;
        assert.equal(received, backup);
        assert.deepEqual(options, { allowOverwrite:true });
        return { status:'VERIFIED', revision:55, replacedExisting:true };
      },
      readState: async () => ({ revision:55 }),
    }),
  });

  assert.equal(calls, 1);
  assert.deepEqual(restored, { status:'VERIFIED', revision:55, replacedExisting:true });
});

test('Settings UI exposes Android version and restore-from-backup actions but no fake rollback control', () => {
  const html = fs.readFileSync(path.join(root, 'lighthouse-next', 'index.html'), 'utf8');
  const settings = fs.readFileSync(modulePath, 'utf8');

  assert.match(html, /id="settings-version"/);
  assert.match(html, /id="restore-data"/);
  assert.match(html, /id="restore-file"/);
  assert.match(html, /กู้คืนจากข้อมูลสำรอง/);
  assert.match(settings, /installSettingsVersion/);
  assert.match(settings, /installSettingsRestore/);
  assert.doesNotMatch(html, /id="rollback-/);
  assert.doesNotMatch(settings, /fake.*rollback|rollback.*fake/i);
});


test('Settings Version prefers installed native App identity when Capacitor App plugin is available', async () => {
  const { loadSettingsBuildIdentity } = await import(modulePath);
  let fetched = false;
  const App = {
    async getInfo() {
      return { id:'com.yggdrasil.lighthouse', name:'LIGHTHOUSE', version:'1.0.0-owner.3', build:'1008' };
    },
  };
  const capacitor = {
    Plugins:{ App },
    isNativePlatform:()=>true,
    isPluginAvailable:name=>name==='App',
    registerPlugin(){ throw new Error('existing plugin proxy should be reused'); },
  };
  const result = await loadSettingsBuildIdentity({
    capacitor,
    fetchImpl:async () => { fetched=true; throw new Error('native must win'); },
  });
  assert.equal(fetched, false);
  assert.equal(result.owner, 'ANDROID_INSTALLED_APP');
  assert.equal(result.applicationId, 'com.yggdrasil.lighthouse');
  assert.equal(result.versionCode, 1008);
  assert.equal(result.versionName, '1.0.0-owner.3');
});
