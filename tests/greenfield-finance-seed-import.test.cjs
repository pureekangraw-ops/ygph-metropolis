"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { signEvidence } = require('./flow-evidence-fixture.cjs');

const root = path.resolve(__dirname, '..');

const seed = {
  format:'YGPH_METRO_FINANCE_SEED',
  formatVersion:1,
  target:{ app:'YGPH METROPOLIS', architecture:'GREENFIELD', stateSchema:2, mode:'ADDITIVE_FINANCE_SEED', nativeBackup:false },
  safety:{ doNotUseWithRestore:true },
  commands:[
    {
      domain:'LEDGER',
      type:'LEDGER_CREATE_OBLIGATION',
      idempotencyKey:'finance-seed-obligation-1',
      payload:{ recordId:'OBL-SEED-1', title:'ภาระทดสอบ', detail:'seed', totalSatang:123400, installmentCount:1, dueDate:'2026-09-15', installmentPlan:[] },
    },
    {
      domain:'CALENDAR',
      type:'CALENDAR_CREATE_RECORD',
      idempotencyKey:'finance-seed-calendar-1',
      payload:{ record:{ recordId:'CAL-SEED-1', type:'VERIFY', title:'เช็กภาระทดสอบ', status:'OPEN', amountSatang:123400, dueDate:'2026-09-15', ownerRef:'LEDGER' } },
    },
  ],
  verifyBeforeLedgerMutation:[{ key:'cash-on-hand', status:'VERIFY' }],
};

function minimalEvidence() {
  return signEvidence({
    format:'YGPH_FLOW_EVENT_EXCHANGE', formatVersion:3, evidenceSchemaVersion:'3.1', packageId:'FLOW-1786527289637',
    packageMode:'SNAPSHOT_AND_DELTA', snapshotAsOf:'2026-08-12T09:34:21.231Z', sourceRevision:28,
    reconciliation:{status:'PASS',blockingIssues:[]},
    events:[
      {eventId:'L0',source:'LEDGER',owner:'LEDGER',payload:{record:{recordId:'LEDGER-CURRENT',type:'CURRENT_BALANCE',amountSatang:0,calculation:{openingBalanceSatang:0}}},validation:{ownerConfirmation:'UNCONFIRMED'}}
    ]
  });
}

test('Finance seed parser accepts additive Greenfield LEDGER/CALENDAR create commands only', async () => {
  const { parseFinanceSeedFile } = await import('../greenfield/finance-seed-import.mjs');
  const parsed = parseFinanceSeedFile(seed);
  assert.equal(parsed.commands.length, 2);
  assert.equal(parsed.commands[0].domain, 'LEDGER');
  assert.equal(parsed.commands[1].domain, 'CALENDAR');
  assert.equal(parsed.verifyBeforeLedgerMutation.length, 1);
});

test('Finance seed parser rejects restore-like, wrong-target, and unsupported mutation payloads', async () => {
  const { parseFinanceSeedFile } = await import('../greenfield/finance-seed-import.mjs');
  assert.throws(() => parseFinanceSeedFile({ ...seed, target:{ ...seed.target, mode:'RESTORE' } }), /INVALID_FINANCE_SEED_MODE/);
  assert.throws(() => parseFinanceSeedFile({ ...seed, target:{ ...seed.target, stateSchema:1 } }), /FINANCE_SEED_SCHEMA_MISMATCH/);
  assert.throws(() => parseFinanceSeedFile({ ...seed, commands:[{ ...seed.commands[0], type:'LEDGER_CREATE_TRANSACTION' }] }), /FINANCE_SEED_COMMAND_NOT_ALLOWED/);
});

test('runtime imports a Finance seed atomically through command authority and rejects a second import', async () => {
  const { createMemoryVaultStore } = await import('../greenfield/persistence.mjs');
  const { createGreenfieldRuntime } = await import('../greenfield/runtime.mjs');
  const { parseFinanceSeedFile, verifyFinanceSeedReadback } = await import('../greenfield/finance-seed-import.mjs');
  const store = createMemoryVaultStore();
  const runtime = createGreenfieldRuntime({ store, passphrase:'correct horse battery staple', lockManager:null, now:()=>'2026-08-23T05:30:00.000Z' });
  await runtime.initializeFromEvidence(minimalEvidence(), { expectedPackageId:'FLOW-1786527289637', expectedRevision:28 });
  const parsed = parseFinanceSeedFile(seed);
  const result = await runtime.importFinanceSeed(parsed);
  assert.equal(result.appliedCommands, 2);
  const after = await runtime.readState();
  assert.doesNotThrow(() => verifyFinanceSeedReadback(after, parsed));
  assert.equal(after.domains.LEDGER.records['OBL-SEED-1'].record.remainingSatang, 123400);
  assert.equal(after.domains.CALENDAR.records['CAL-SEED-1'].record.status, 'OPEN');
  await assert.rejects(() => runtime.importFinanceSeed(parsed), /FINANCE_SEED_ALREADY_APPLIED|DUPLICATE/);
  runtime.close();
});

test('one import door detects Finance seed without weakening obligation import', () => {
  const importer = fs.readFileSync(path.join(root, 'ui/obligation-import-ui.mjs'), 'utf8');
  assert.match(importer, /detectMetroImport/);
  assert.match(importer, /parseFinanceSeedFile/);
  assert.match(importer, /runtime\.importFinanceSeed\(/);
  assert.match(importer, /parseObligationImportFile/);
  assert.match(importer, /runtime\.obligation\(/);
  assert.doesNotMatch(importer, /นำเข้าการเงินจากไฟล์/);
});
