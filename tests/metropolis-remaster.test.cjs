const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const visualPath = path.join(root, 'metropolis-remaster-core.js');
const runtimePath = path.join(root, 'metropolis-remaster.js');
const cssPath = path.join(root, 'metropolis-remaster.css');
const loaderPath = path.join(root, 'sw-bootstrap.js');
const allowlistPath = path.join(root, '.assetsignore');
const packagePath = path.join(root, 'package.json');
const swPath = path.join(root, 'sw.js');
const manifestPath = path.join(root, 'RELEASE_MANIFEST.json');
const utf8VerifierPath = path.join(root, 'scripts/verify-utf8.mjs');

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

function loadVisualCore() {
  delete require.cache[require.resolve(visualPath)];
  return require(visualPath);
}

test('full-app remaster publishes one coherent icon registry', () => {
  assert.equal(fs.existsSync(visualPath), true, 'missing metropolis-remaster-core.js');
  const core = loadVisualCore();
  const required = [
    'app', 'home', 'store', 'ride', 'ledger', 'calendar', 'settings',
    'wallet', 'stock', 'task', 'payment', 'sale', 'purchase', 'withdraw',
    'customer', 'report', 'notification', 'reset', 'security', 'info', 'help',
    'cashIn', 'cashOut', 'reconcile', 'partialReset', 'factoryReset', 'fullCleanup'
  ];
  for (const name of required) {
    const svg = core.iconSvg(name);
    assert.match(svg, /^<svg /, `${name} must render an svg`);
    assert.match(svg, /viewBox="0 0 24 24"/, `${name} must use the shared 24px grid`);
    assert.match(svg, /stroke-width="1\.8"/, `${name} must use the shared stroke weight`);
  }
  assert.equal(core.ICON_NAMES.length >= required.length, true);
});

test('runtime remasters navigation, actions, headings, and maintenance without mutating business state', () => {
  const source = read(runtimePath);
  assert.match(source, /YGPHRuntime\.register/);
  assert.match(source, /data-page/);
  for (const id of ['addSaleBtn', 'addPurchaseBtn', 'withdrawStockBtn', 'toggleRoundBtn', 'withdrawRideCreditBtn', 'addRideExpenseBtn', 'addRideJobBtn', 'verifyBalanceBtn']) {
    assert.match(source, new RegExp(id));
  }
  for (const maintenanceId of ['maintenanceRecoveryCard', 'maintenanceReconcileBtn', 'maintenanceResetStoreBtn', 'maintenanceResetRideBtn', 'maintenanceResetSettingsBtn', 'maintenanceFactoryResetBtn', 'maintenanceFullCleanupBtn']) {
    assert.match(source, new RegExp(maintenanceId));
  }
  assert.match(source, /metropolisRemaster/);
  assert.doesNotMatch(source, /state\s*=/);
  assert.doesNotMatch(source, /persistAndRender\s*\(/);
  assert.doesNotMatch(source, /indexedDB/);
});

test('remaster stylesheet applies one dark visual system to every major app surface', () => {
  const css = read(cssPath);
  for (const token of ['--metro-bg', '--metro-surface', '--metro-primary', '--metro-gold', '--metro-danger', '--metro-info']) {
    assert.match(css, new RegExp(token.replace('--', '\\-\\-')));
  }
  for (const selector of ['#homePage', '#storePage', '#ridePage', '#ledgerPage', '#calendarPage', '#settingsPage', '.bottom-nav']) {
    assert.match(css, new RegExp(selector.replace(/[.#]/g, '\\$&')));
  }
  assert.match(css, /focus-visible/);
  assert.match(css, /prefers-reduced-motion/);
  assert.doesNotMatch(css, /background:\s*#fff\b/i);
});

test('visual remaster is wired atomically into loader, cloudflare, syntax, offline shell, and manifest', () => {
  const loader = read(loaderPath);
  const allowlist = read(allowlistPath);
  const pkg = read(packagePath);
  const sw = read(swPath);
  const manifest = JSON.parse(read(manifestPath));
  const assets = ['metropolis-remaster.css', 'metropolis-remaster-core.js', 'metropolis-remaster.js'];
  for (const asset of assets) {
    assert.match(loader, new RegExp(asset.replaceAll('.', '\\.')));
    assert.match(allowlist, new RegExp(`!/${asset.replaceAll('.', '\\.')}`));
    assert.match(sw, new RegExp(`"${asset.replaceAll('.', '\\.')}"`));
    assert.ok(manifest.productionFiles.some(item => item.path === asset), `manifest missing ${asset}`);
  }
  for (const script of ['metropolis-remaster-core.js', 'metropolis-remaster.js']) {
    assert.match(pkg, new RegExp(`node --check ${script.replaceAll('.', '\\.')}`));
  }
  assert.equal(manifest.serviceWorker.releaseId, 'v4.2.5-20260811-r22-visual-remaster');
  assert.ok(manifest.runtimeOrder.indexOf('metropolis-remaster-core.js') > manifest.runtimeOrder.indexOf('metropolis-maintenance-report.js'));
  assert.ok(manifest.runtimeOrder.indexOf('metropolis-remaster.js') > manifest.runtimeOrder.indexOf('metropolis-remaster-core.js'));
});

test('utf8 verification derives text production files from release manifest instead of a stale hard-coded list', () => {
  const source = read(utf8VerifierPath);
  assert.match(source, /RELEASE_MANIFEST\.json/);
  assert.match(source, /productionFiles/);
  assert.match(source, /\.json|\.js|\.css|\.html|\.webmanifest/);
  assert.doesNotMatch(source, /const productionFiles\s*=\s*\[/);
});

test('visual remaster keeps durable data compatibility unchanged', () => {
  const manifest = JSON.parse(read(manifestPath));
  assert.equal(manifest.stateSchema, 4);
  assert.equal(manifest.database.name, 'stock-pocket-secure');
  assert.equal(manifest.database.version, 1);
  assert.equal(manifest.database.vaultFormat, 1);
});
