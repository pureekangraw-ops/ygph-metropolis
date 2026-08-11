const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadProductionRuntime } = require('./helpers/metropolis-runtime-harness.cjs');

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

function cssRule(source, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = source.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, 's'));
  assert.ok(match, `missing CSS rule: ${selector}`);
  return match[1];
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

test('Metro V2 overrides every device-proven light/dark cascade conflict', () => {
  const css = read(cssPath);
  const appBar = cssRule(css, '.metropolis-v4 .metropolis-app-bar');
  const heroValue = cssRule(css, '.metropolis-v4 .hero .hero-value');
  const rideRound = cssRule(css, '.metropolis-v4 #ridePage .flow-round-panel');
  const rideRoundStat = cssRule(css, '#ridePage .flow-round-grid>div');
  const latestCashIn = cssRule(css, '#flowLatestCashList .flow35-cash-in');
  const latestCashOut = cssRule(css, '#flowLatestCashList .flow35-cash-out');
  const calendarFocus = cssRule(css, '#calendarPage .flow-calendar-focus');
  const calendarSwipe = cssRule(css, '#calendarPage .flow-swipe-card');
  const gateStatus = cssRule(css, '.gate .status-text');
  const gateRestore = cssRule(css, '.gate .text-btn');

  assert.match(appBar, /background:[^;]*var\(--metro-surface/i);
  assert.match(appBar, /color:var\(--metro-text\)!important/i);
  assert.match(heroValue, /color:var\(--metro-text\)!important/i);
  assert.match(rideRound, /background:[^;]*var\(--metro-surface/i);
  assert.match(rideRound, /color:var\(--metro-text\)!important/i);
  assert.match(rideRoundStat, /background:[^;]*var\(--metro-surface/i);
  assert.match(latestCashIn, /background:[^;]*var\(--metro-surface[^;]*!important/i);
  assert.match(latestCashOut, /background:[^;]*var\(--metro-surface[^;]*!important/i);
  assert.match(calendarFocus, /background:[^;]*var\(--metro-surface[^;]*!important/i);
  assert.match(calendarFocus, /color:var\(--metro-text\)!important/i);
  assert.match(calendarSwipe, /background:[^;]*var\(--metro-surface[^;]*!important/i);
  assert.match(gateStatus, /color:var\(--metro-danger\)!important/i);
  assert.match(gateRestore, /color:var\(--metro-info\)!important/i);
});

test('Settings reuses one icon host while keeping a 44px target and a smaller glyph', async t => {
  const css = read(cssPath);
  const buttonRule = cssRule(css, '.metropolis-v4 .flow-header-settings');
  const iconRule = cssRule(css, '.metropolis-v4 .flow-header-settings .flow-icon');
  assert.match(buttonRule, /min-width:var\(--metro-touch\)!important/i);
  assert.match(buttonRule, /min-height:var\(--metro-touch\)!important/i);
  assert.match(iconRule, /font-size:20px!important/i);
  assert.match(iconRule, /color:var\(--metro-text-secondary\)!important/i);

  const runtime = loadProductionRuntime();
  t.after(() => runtime.close());
  await runtime.flushRuntime();
  const button = runtime.window.document.getElementById('flowHeaderSettings');
  assert.ok(button, 'Settings control must exist');
  assert.equal(button.querySelectorAll('svg').length, 1, 'Remaster must evolve the FLOW icon host instead of adding a second gear');
  assert.equal(button.querySelectorAll('.flow-icon').length, 1);
  assert.equal(button.querySelectorAll('.metro-action-icon').length, 0);
});

test('Metro V2 defines one mobile hierarchy across chrome, pages, actions, records and calendar', () => {
  const css = read(cssPath);
  for (const token of [
    '--metro-text-secondary', '--metro-store', '--metro-ride',
    '--metro-ledger', '--metro-calendar', '--metro-touch'
  ]) assert.match(css, new RegExp(token.replace('--', '\\-\\-')));

  for (const selector of [
    '.metropolis-v4 .topbar',
    '.metropolis-v4 .metropolis-app-bar',
    '.metropolis-v4 .hero .hero-value',
    '.metropolis-v4 .action-row',
    '.metropolis-v4 .content-card',
    '#calendarPage .flow-calendar-focus',
    '#calendarPage .day-cell',
    '.metropolis-v4 .bottom-nav'
  ]) assert.match(css, new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));

  for (const selector of [
    '.metropolis-v4 .hub-mini',
    '.metropolis-v4 .flow-audit-summary>div',
    '.metropolis-v4 .flow-review-meta',
    '.metropolis-v4 .flow35-ride-daily-summary>div',
    '.metropolis-v4 .flow35-report-summary span',
    '.metropolis-v4 .flow35-round-history',
    '.metropolis-v4 .r52-schedule-preview',
    '.metropolis-v4 .r52-preview-list>span',
    '.metropolis-v4 .metro-end-stat',
    '.metropolis-v4 .metro-end-item',
    '.metropolis-v4 .source-badge',
    '.metropolis-v4 .meta',
    '.metropolis-v4 .arch-role',
    '.metropolis-v4 .pipe-step',
    '.metropolis-v4 .scope-chip',
    '.metropolis-v4 .change-card',
    '.metropolis-v4 .flow-node'
  ]) {
    const rule = cssRule(css, selector);
    assert.match(rule, /background:[^;]*var\(--metro-surface/i, `${selector} must close its legacy light surface`);
    assert.match(rule, /color:var\(--metro-text\)!important/i, `${selector} must keep dark-theme copy readable`);
  }

  const checkbox = cssRule(css, '.metropolis-v4 input[type="checkbox"]');
  assert.match(checkbox, /width:auto!important/i, 'checkboxes must not inherit full-width text-field layout');
  const calendarSwipeNav = cssRule(css, '#calendarPage .flow-swipe-nav button');
  assert.match(calendarSwipeNav, /min-width:var\(--metro-touch\)!important/i, 'Calendar swipe navigation must keep a 44px-wide touch target');
  const maintenanceThree = cssRule(css, '#maintenanceRecoveryCard .maintenance-three button');
  const maintenanceChoice = cssRule(css, '.metropolis-v4 .maintenance-choice-grid button');
  assert.match(maintenanceThree, /min-height:var\(--metro-touch\)!important/i, 'Partial Reset controls must keep a 44px touch target');
  assert.match(maintenanceChoice, /min-height:var\(--metro-touch\)!important/i, 'Reconcile choices must keep a 44px touch target');
  assert.match(cssRule(css, '.metropolis-v4 .storage-capacity-normal #storageCapacityLevel'), /color:var\(--metro-primary\)/i, 'normal capacity must use an existing green token');
  assert.match(cssRule(css, '.metropolis-v4 .storage-capacity-watch #storageCapacityLevel'), /color:var\(--metro-gold\)/i, 'watch capacity must use an existing yellow token');
  assert.doesNotMatch(css, /\.metropolis-v4 \.bottom-nav \.nav-btn(?: span)?\{[^}]*font-size:\.5\drem/i, 'mobile navigation labels must not shrink below the readable V2 size');

  assert.match(css, /@media\s*\(max-width:420px\)/);
  assert.match(css, /min-height:var\(--metro-touch\)/);
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
  assert.equal(manifest.release, '4.2.6-root-stabilization');
  assert.equal(manifest.serviceWorker.releaseId, 'v4.2.6-20260812-r25-day-cycle-control');
  assert.ok(manifest.runtimeOrder.indexOf('metropolis-remaster-core.js') > manifest.runtimeOrder.indexOf('metropolis-maintenance-report.js'));
  assert.ok(manifest.runtimeOrder.indexOf('metropolis-remaster.js') > manifest.runtimeOrder.indexOf('metropolis-remaster-core.js'));
});

test('utf8 verification derives text production files from release manifest instead of a stale hard-coded list', () => {
  const source = read(utf8VerifierPath);
  assert.match(source, /RELEASE_MANIFEST\.json/);
  assert.match(source, /manifest\.productionFiles/);
  assert.match(source, /TEXT_ASSET_PATTERN/);
  assert.doesNotMatch(source, /const productionFiles\s*=\s*\[\s*["']/);
});

test('visual remaster keeps durable data compatibility unchanged', () => {
  const manifest = JSON.parse(read(manifestPath));
  assert.equal(manifest.stateSchema, 4);
  assert.equal(manifest.database.name, 'stock-pocket-secure');
  assert.equal(manifest.database.version, 1);
  assert.equal(manifest.database.vaultFormat, 1);
});
