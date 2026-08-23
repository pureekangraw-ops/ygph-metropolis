"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const html = read('index.html');
const app = read('ui/app.mjs');
const home = read('ui/home-ui.mjs');
const theme = read('theme.css');

function sampleState() {
  return {
    domains: {
      STORE: { records:{} },
      RIDE: { records:{} },
      CALENDAR: { records:{} },
      LEDGER: { records: {
        I1:{record:{recordId:'I1',type:'TRANSACTION',direction:'IN',amountSatang:10000,status:'COMPLETED',createdAt:'2026-08-22T02:00:00.000Z'}},
        O1:{record:{recordId:'O1',type:'TRANSACTION',direction:'OUT',amountSatang:2500,status:'COMPLETED',createdAt:'2026-08-22T03:00:00.000Z'}},
        A1:{record:{recordId:'A1',type:'TRANSACTION',direction:'IN',subtype:'BALANCE_ADJUSTMENT',amountSatang:999999,status:'COMPLETED',createdAt:'2026-08-22T04:00:00.000Z'}},
        I2:{record:{recordId:'I2',type:'TRANSACTION',detail:'IN:OTHER',amountSatang:5000,status:'COMPLETED',createdAt:'2026-08-20T02:00:00.000Z'}},
      }},
    },
  };
}

test('Metro shell has one top command navigation, a Home bubble, and no bottom/city-door navigation roots', () => {
  assert.match(html, /id="commandNav"[^>]*class="[^"]*\bcommand-nav\b[^"]*"/, 'command navigation must live at the top shell');
  for (const destination of ['store','ride','finance']) {
    assert.match(html, new RegExp(`data-command-destination="${destination}"`), `${destination} must be a direct command destination`);
  }
  assert.match(html, /id="settingsBtn"[^>]*aria-label="ตั้งค่า"/, 'Settings must remain directly reachable from the command strip');
  assert.match(html, /id="homeBubble"[^>]*data-command-destination="home"/, 'Home must be a dedicated floating bubble');
  assert.doesNotMatch(html, /id="bottomNav"/, 'bottom navigation root must be removed, not merely hidden');
  assert.doesNotMatch(html, /id="cityEntries"/, 'duplicate city-entry root must be removed');
  assert.doesNotMatch(html, /class="workspace-toolbar"/, 'redundant workspace context/settings row must be removed');
  assert.doesNotMatch(app, /\.bottom-nav-btn\[data-destination\]/, 'runtime must not retain obsolete bottom-nav routing');
});

test('all visible command navigation enters through routeTo rather than bypassing route normalization', () => {
  assert.match(app, /\.command-nav-btn\[data-command-destination\],#homeBubble\[data-command-destination\][\s\S]{0,240}?routeTo\(\{area:button\.dataset\.commandDestination\}\)/);
  assert.doesNotMatch(app, /\.command-nav-btn\[data-command-destination\],#homeBubble\[data-command-destination\][\s\S]{0,240}?activateArea\(button\.dataset\.commandDestination\)/);
});

test('Calendar remains a domain concern but its visible surface is hosted inside Finance', () => {
  assert.doesNotMatch(html, /class="area-page"\s+data-area-page="calendar"/, 'Calendar must not remain a top-level visible area');
  assert.match(html, /data-area-page="finance"[\s\S]*id="financeSchedule"/, 'Finance must physically contain the schedule surface');
  assert.match(app, /function\s+normalizeAreaRoute\(/, 'global route normalization must be explicit');
  assert.match(app, /CALENDAR[^\n]+finance|calendar[^\n]+finance/i, 'Calendar intents must resolve to Finance');
  assert.match(app, /financeSchedule/, 'Calendar routing must focus the embedded Finance schedule');
  assert.match(app, /dataset\.calendarRecordId=record\.recordId/, 'rendered Calendar rows must expose their canonical record identity');
  assert.match(app, /focusRouteTarget\(route\.focus,target\.recordId\)/, 'Calendar deep links must carry record context through the route focus step');
});

test('Home summary cards are owner-routed controls and Home includes an actual-cash chart', () => {
  for (const key of ['balance','generated','stock','due']) {
    assert.match(html, new RegExp(`data-home-summary="${key}"`), `${key} summary must be an actionable control`);
  }
  assert.match(html, /id="homeCashFlowChart"/, 'Home must contain the cash-flow chart surface');
  assert.match(home, /context\.cashFlow/, 'Home renderer must consume supplied cash-flow projection data');
  assert.match(home, /dataHomeSummary|\[data-home-summary\]/, 'Home renderer must own shortcut behavior/metadata');
});

test('cash-flow projection uses Ledger cash semantics and excludes balance adjustments', async () => {
  const { projectCashFlowSeries } = await import('../greenfield/calculation-authority.mjs');
  assert.equal(typeof projectCashFlowSeries, 'function');
  const series = projectCashFlowSeries(sampleState(), '2026-08-22', 3);
  assert.deepEqual(series, [
    { date:'2026-08-20', inSatang:5000, outSatang:0 },
    { date:'2026-08-21', inSatang:0, outSatang:0 },
    { date:'2026-08-22', inSatang:10000, outSatang:2500 },
  ]);
});

test('one theme authority provides area accents while real alert text is semantic red', () => {
  for (const token of ['--area-home','--area-store','--area-ride','--area-finance','--area-system']) {
    assert.match(theme, new RegExp(`${token}:`), `${token} must be defined by the shared theme authority`);
  }
  assert.match(theme, /\.command-nav/, 'command strip styling must live in the theme authority');
  assert.match(theme, /\[data-kind="OVERDUE"\][^{]*\{[^}]*color:var\(--semantic-danger\)/s, 'overdue warning text must use semantic danger red');
  assert.match(theme, /\.status\.error\{[^}]*color:[^}]*semantic-danger/s, 'runtime errors must use the same semantic danger authority');
});
