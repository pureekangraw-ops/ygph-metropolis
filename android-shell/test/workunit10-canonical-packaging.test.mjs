import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { syncTrustedBrainSources } from '../tools/sync-trusted-brain.mjs';

const repoRoot = new URL('../../', import.meta.url);
const publicRoot = new URL('../app/public/', import.meta.url);

const CANONICAL_FILES = [
  ['app/app-services.mjs', 'app/app-services.mjs'],
  ['logic/updates/update-service.mjs', 'app/logic/updates/update-service.mjs'],
  ['logic/updates/updater-backup-owner.mjs', 'app/logic/updates/updater-backup-owner.mjs'],
  ['ui/settings-update-panel.mjs', 'app/ui/settings-update-panel.mjs'],
];

test('trusted APK packaging includes the complete canonical app/public tree under source/app', async (t) => {
  const destination = await mkdtemp(join(tmpdir(), 'lighthouse-canonical-package-'));
  t.after(() => rm(destination, { recursive:true, force:true }));

  const result = await syncTrustedBrainSources({ repoRoot, destination });
  assert.ok(result.directories.includes('app'), 'canonical app directory must be reported as packaged');

  for (const [sourceRelative, packagedRelative] of CANONICAL_FILES) {
    assert.equal(
      await readFile(join(destination, packagedRelative), 'utf8'),
      await readFile(new URL(sourceRelative, publicRoot), 'utf8'),
      `${packagedRelative} must be copied byte-for-byte from android-shell/app/public`,
    );
  }
});
