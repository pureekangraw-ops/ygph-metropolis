import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

function run(command, args, label) {
  console.log(`\n[LIGHTHOUSE CI] ${label}`);
  const result = spawnSync(command, args, { stdio: 'inherit', shell: false });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const node = process.execPath;
const testDir = new URL('../test/', import.meta.url);
const files = (await readdir(testDir))
  .filter(name => name.endsWith('.test.mjs'));

const phaseSpecific = new Set([
  'existing-full-app-package.test.mjs',
  'apk-ci-signing-contract.test.mjs',
  'foundation-contract.test.mjs',
  'front-door-release-source.test.mjs',
  'patch-contract.test.mjs',
]);

run(node, ['--test', 'test/candidate-ci-contract.test.mjs'], 'rerun corrected candidate-CI contract first');
run(node, ['tools/stage-existing-full-app.mjs'], 'stage real 1.0.6 web app for the previously failing package proof');
run(node, ['--test', 'test/existing-full-app-package.test.mjs'], 'rerun previously failing full-app package proof');
run('git', ['restore', '--', 'www'], 'restore foundation fixture before broad regression');

const broad = files.filter(name => !phaseSpecific.has(name));
run(node, ['--test', ...broad.map(name => `test/${name}`)], 'run broad current regression');

run(node, [
  '--test',
  '--test-skip-pattern=standard APK flow delegates current Patch ownership|Patch and APK signing trust domains stay isolated|APK publication is downstream of generated security and final-byte identity verification',
  'test/apk-ci-signing-contract.test.mjs',
], 'run still-applicable APK signing regression');

run(node, [
  '--test',
  '--test-skip-pattern=GitHub Actions builds a canonical verified APK but never deploys or publishes it',
  'test/foundation-contract.test.mjs',
], 'run still-applicable foundation regression');

run(node, [
  '--test',
  '--test-skip-pattern=standard APK workflow builds signs verifies and uploads the current key-3 Patch plus manifest',
  'test/front-door-release-source.test.mjs',
], 'run historical Front Door regression without obsolete APK-release ownership assertion');

run(node, [
  '--test',
  '--test-skip-pattern=staging is readable before activation and does not move current|activation moves current and previous pointers together|stale activation is rejected after current advances|failed staging leaves the active snapshot untouched|rollback atomically swaps back to the previous complete snapshot|IndexedDB store persists the active pointer and supports rollback after reopen|concurrent imports cannot activate a stale patch over a newer patch',
  'test/patch-contract.test.mjs',
], 'run patch regression while the replacement metadata contract covers the evolved pointer shape');

console.log('\n[LIGHTHOUSE CI] targeted failures and current regression passed');
