const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');
const os = require('node:os');
const path = require('node:path');

test('retired LIGHTHOUSE CLI and updater cannot emit another release', () => {
  assert.equal(fs.existsSync('release/lighthouse-update.json'), false);
  assert.equal(fs.existsSync('release/assets/1.0.4/LIGHTHOUSE-1.0.4-vc1005.apk'), false);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'prism-retired-route-'));
  const output = path.join(root, 'payload');
  try {
    const result = spawnSync(process.execPath, ['scripts/stage-lighthouse-next-bundle.mjs', output], { encoding: 'utf8' });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /LIGHTHOUSE_RELEASE_ROUTE_RETIRED/);
    assert.equal(fs.existsSync(output), false);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('PRISM has one executable workflow and one signed APK output', () => {
  assert.deepEqual(fs.readdirSync('.github/workflows').filter(f => /\.ya?ml$/.test(f)), ['prism-owner-build.yml']);
  const workflow = fs.readFileSync('.github/workflows/prism-owner-build.yml', 'utf8');
  assert.doesNotMatch(workflow, /assembleDebug|app-debug\.apk|app:stage-next|stage-lighthouse|wrangler|cloudflare\/wrangler-action/);
  assert.match(workflow, /pull_request:/);
  assert.match(workflow, /github\.event\.pull_request\.head\.sha \|\| github\.sha/);
  assert.match(workflow, /node --test tests\/prism-native-cutover\.test\.cjs/);
  assert.match(workflow, /node --test test\/\*\.test\.mjs/);
  const order = ['PRISM native contracts', 'Run Android shell contracts', 'Stage owner-approved PRISM', 'Verify generated Android security', 'Build unsigned release APK', 'Materialize canonical APK signer', 'Verify final APK identity and build provenance', 'Upload owner-test APK'];
  let previous = -1;
  for (const step of order) {
    const index = workflow.indexOf('name: ' + step);
    assert.ok(index > previous, `missing or out-of-order step: ${step}`);
    previous = index;
  }
  const uploads = [...workflow.matchAll(/uses: actions\/upload-artifact@v4/g)];
  assert.equal(uploads.length, 1);
  const upload = workflow.slice(workflow.indexOf('name: Upload owner-test APK'));
  assert.deepEqual([...upload.matchAll(/^\s+([^\n]+\.apk)\s*$/gm)].map(m => m[1].trim()), ['android-shell/android/app/build/outputs/apk/release/prism-release.apk']);
  assert.match(upload, /apk-identity-evidence\.json/);
  assert.match(upload, /android-security-evidence\.json/);
  assert.match(workflow, /test "\$\(git rev-parse HEAD\)" = "\$EXPECTED_SOURCE_COMMIT"/);
});
