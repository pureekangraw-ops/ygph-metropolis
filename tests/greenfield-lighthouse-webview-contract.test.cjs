const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

function repoFile(relative) {
  const repositoryPath = path.join(__dirname, '..', relative);
  if (fs.existsSync(repositoryPath)) return repositoryPath;
  const localFiles = {
    'lighthouse-next/styles.css':'/data/styles.css',
    'lighthouse-next/index.html':'/data/index.json',
    'lighthouse-next/app.mjs':'/data/app.mjs',
    'lighthouse-next/surface-contract.mjs':'/data/surface-contract.mjs',
    'lighthouse-next/ride-map-native.mjs':'/data/ride-map-native.mjs',
    'android-shell/native-local-map/LighthouseRideMapPlugin.java':'/data/LighthouseRideMapPlugin.java',
  };
  return localFiles[relative] || repositoryPath;
}
const styles = fs.readFileSync(repoFile('lighthouse-next/styles.css'), 'utf8');
const index = fs.readFileSync(repoFile('lighthouse-next/index.html'), 'utf8');
const app = fs.readFileSync(repoFile('lighthouse-next/app.mjs'), 'utf8');

function cssBlock(source, selector) {
  const start = source.lastIndexOf(selector);
  assert.notEqual(start, -1, `missing CSS selector: ${selector}`);
  return source.slice(start, source.indexOf('}', start) + 1);
}

test('auth screen owns its own safe-area vertical scroll contract', () => {
  const block = styles.slice(styles.indexOf('/* ---------- Android WebView auth'));
  assert.match(block, /min-height:100dvh/);
  assert.match(block, /height:100dvh/);
  assert.match(block, /overflow-y:auto/);
  assert.match(block, /overflow-x:hidden/);
  assert.match(block, /touch-action:pan-y/);
  assert.match(block, /env\(safe-area-inset-bottom\)/);
  assert.doesNotMatch(index, /\.auth-screen\{[^}]*display:grid/);
});

test('app shell is the post-login scroll owner and body cannot double scroll', () => {
  assert.match(styles, /#demo-root\{[^}]*height:100dvh;overflow:hidden/);
  const block = styles.slice(styles.indexOf('.app-shell{\n  height:100dvh;'), styles.lastIndexOf('}\n\n/* ---------- Android WebView auth'));
  assert.match(block, /overflow-y:auto/);
  assert.match(block, /overflow-x:hidden/);
  assert.match(styles, /\.app-shell \{ overscroll-behavior-x:none; overscroll-behavior-y:contain; \}/);
  assert.match(block, /scroll-padding-bottom/);
});

test('bottom navigation keeps a child-safe touch boundary and target size', () => {
  const block = cssBlock(styles, '.bottom-nav{\n  pointer-events:auto;');
  assert.doesNotMatch(block, /touch-action:none/);
  assert.match(block, /touch-action:manipulation/);
  const nav = cssBlock(styles, '.nav-item{\n  min-width:44px;');
  assert.match(nav, /min-height:44px/);
  assert.match(nav, /pointer-events:auto/);
  assert.match(nav, /touch-action:manipulation/);
});

test('keyboard handling covers auth, recovery, and composer controls', () => {
  assert.match(app, /root\.addEventListener\('focusin'/);
  assert.match(app, /root\.addEventListener\('focusout'/);
  assert.match(app, /scrollIntoView\(\{ block:'nearest'/);
  assert.match(app, /\['INPUT', 'TEXTAREA', 'SELECT'\]/);
  assert.match(app, /keyboardBaselineHeight/);
  assert.match(app, /revealControl\(recoveryCodeInput\)/);
});

test('mobile layout contains detail content and keeps action row bounded', () => {
  assert.match(styles, /#manual-detail\{/);
  assert.match(styles, /\.manual-detail\{\n  min-width:0;\n  overflow-wrap:anywhere;/);
  assert.match(styles, /\.action-row\{\n  display:grid;/);
  assert.match(styles, /grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(index, /app-shell app-scroll-shell/);
  assert.doesNotMatch(index, /#manual-hub\{padding-bottom:/);
});

test('map lifecycle and evidence bridge expose device truth without inventing coordinates', () => {
  const surface = fs.readFileSync(repoFile('lighthouse-next/surface-contract.mjs'), 'utf8');
  const native = fs.readFileSync(repoFile('lighthouse-next/ride-map-native.mjs'), 'utf8');
  const java = fs.readFileSync(repoFile('android-shell/native-local-map/LighthouseRideMapPlugin.java'), 'utf8');
  assert.match(surface, /createMapEvidenceBridge/);
  assert.match(surface, /lighthouse:map-evidence/);
  assert.match(native, /sha256:result\?\.sha256/);
  assert.match(native, /lastOpenedAt:result\?\.lastOpenedAt/);
  assert.match(java, /ACTIVE_SHA256_MISMATCH/);
  assert.match(java, /LAST_OPENED_AT/);
  assert.match(java, /prefs\(\)\.edit\(\)\.putString\(LAST_OPENED_AT/);
});
