const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const packagePath = path.join(ROOT, 'android-shell', 'package.json');
const toolPath = path.join(ROOT, 'android-shell', 'tools', 'materialize-android-icons.mjs');
const workflowPath = path.join(ROOT, '.github', 'workflows', 'lighthouse-owner-build.yml');

test('Android launcher command invokes the real icon materializer', () => {
  const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  assert.equal(pkg.scripts['android:icons'], 'node tools/materialize-android-icons.mjs android');
  assert.equal(fs.existsSync(toolPath), true, 'launcher materializer must exist');
});

test('native launcher resources are derived only from the approved LIGHTHOUSE artwork', () => {
  const source = fs.readFileSync(toolPath, 'utf8');
  assert.match(source, /APPROVED_ICON_SOURCE\s*=\s*'lighthouse-next\/assets\/lighthouse-icon\.svg'/);
  assert.match(source, /APPROVED_MASKABLE_ICON_SOURCE\s*=\s*'lighthouse-next\/assets\/lighthouse-icon-maskable\.svg'/);
  assert.match(source, /LAUNCHER_BACKGROUND\s*=\s*'#0B0E14'/);
  assert.match(source, /mipmap-anydpi-v26/);
  assert.match(source, /ic_launcher_foreground/);
  assert.match(source, /ic_launcher_round/);
});

test('owner APK build materializes native launcher resources before compiling the APK', () => {
  const workflow = fs.readFileSync(workflowPath, 'utf8');
  const generateProject = workflow.indexOf('Generate Android project');
  const materializeIcons = workflow.indexOf('Materialize approved Android launcher icons');
  const buildApk = workflow.indexOf('Build unsigned release APK');

  assert.ok(generateProject >= 0, 'owner workflow must generate the Android project');
  assert.ok(materializeIcons > generateProject, 'launcher icons must be materialized after Android project generation');
  assert.match(workflow.slice(materializeIcons, buildApk), /npm run android:icons/);
  assert.ok(buildApk > materializeIcons, 'launcher icons must exist before APK compilation');
});
