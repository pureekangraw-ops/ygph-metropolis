import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { captureInstalledApkEvidence, parsePmPath } from '../tools/capture-installed-apk-evidence.mjs';

test('parsePmPath prefers base.apk from adb package paths', () => {
  const value = parsePmPath('package:/data/app/demo/split_config.arm64_v8a.apk\npackage:/data/app/demo/base.apk\n');
  assert.equal(value, '/data/app/demo/base.apk');
});

test('captures installed APK identity, signer, version and APK digest through injected tools', async () => {
  const tempRoot = await mkdtemp(join(tmpdir(), 'lh-installed-evidence-test-'));
  const calls = [];
  const runner = async (command, args) => {
    calls.push([command, ...args]);
    if (command === 'adb' && args[0] === 'shell') {
      return { status: 0, stdout: 'package:/data/app/demo/base.apk\n', stderr: '' };
    }
    if (command === 'adb' && args[0] === 'pull') {
      await writeFile(args[2], Buffer.from('installed-apk-bytes'));
      return { status: 0, stdout: '1 file pulled', stderr: '' };
    }
    if (command === 'apksigner') {
      return {
        status: 0,
        stdout: 'Signer #1 certificate SHA-256 digest: aa:e6:08:a7:dd:ab:0d:bf:cc:c1:d3:5e:81:7c:56:83:b3:c6:4b:90:ab:58:1a:4b:74:86:7d:b5:4e:03:51:ce\n',
        stderr: '',
      };
    }
    if (command === 'aapt') {
      return {
        status: 0,
        stdout: "package: name='com.yggdrasil.lighthouse' versionCode='1008' versionName='1.0.0-owner.3'\n",
        stderr: '',
      };
    }
    throw new Error(`unexpected command: ${command}`);
  };

  const evidence = await captureInstalledApkEvidence({
    applicationId: 'com.yggdrasil.lighthouse',
    runner,
    tempRoot,
    capturedAt: '2026-09-18T00:00:00.000Z',
  });

  assert.equal(evidence.source, 'ADB_INSTALLED_APK');
  assert.equal(evidence.installedApplicationId, 'com.yggdrasil.lighthouse');
  assert.equal(evidence.versionCode, 1008);
  assert.equal(evidence.versionName, '1.0.0-owner.3');
  assert.equal(evidence.installedSignerCertificateSha256, 'aae608a7ddab0dbfccc1d35e817c5683b3c64b90ab581a4b74867db54e0351ce');
  assert.match(evidence.apkSha256, /^[0-9a-f]{64}$/);
  assert.equal(calls.some(call => call[0] === 'adb' && call[1] === 'pull'), true);
});

test('fails closed when adb cannot resolve the installed package', async () => {
  await assert.rejects(() => captureInstalledApkEvidence({
    applicationId: 'com.yggdrasil.lighthouse',
    runner: async () => ({ status: 0, stdout: '', stderr: '' }),
  }), /ADB_PACKAGE_PATH_MISSING/);
});
