"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const validFile = {
  format:'YGPH_METROPOLIS_RUNTIME_PAYLOAD',
  version:1,
  target:'YGPH METROPOLIS 5.2.6 / GREENFIELD',
  entryPoint:'runtime.obligation',
  uploadableByCurrentUI:true,
  payload:{
    workflowId:'wf-mobile-net-partner-2026-09-03',
    obligationId:'obl-mobile-net-partner-2026-09-03',
    title:'ค่าเน็ตมือถือแฟน',
    totalSatang:208383,
    detail:'ค่าเน็ตมือถือแฟน รวม 2 รอบ',
    installments:[
      { queueId:'cal-mobile-net-partner-2026-08-03', amountSatang:101329, dueDate:'2026-08-03' },
      { queueId:'cal-mobile-net-partner-2026-09-03', amountSatang:107054, dueDate:'2026-09-03' },
    ],
  },
};

test('valid runtime obligation payload is normalized for runtime.obligation', async () => {
  const { parseObligationImportFile } = await import('../greenfield/obligation-import.mjs');
  const parsed = parseObligationImportFile(validFile);
  assert.equal(parsed.workflowId, validFile.payload.workflowId);
  assert.equal(parsed.obligationId, validFile.payload.obligationId);
  assert.equal(parsed.totalSatang, 208383);
  assert.equal(parsed.installments.length, 2);
  assert.equal(parsed.detail, validFile.payload.detail);
});

test('import contract rejects wrong format or entry point', async () => {
  const { parseObligationImportFile } = await import('../greenfield/obligation-import.mjs');
  assert.throws(() => parseObligationImportFile({ ...validFile, format:'OTHER' }), /INVALID_OBLIGATION_IMPORT_FORMAT/);
  assert.throws(() => parseObligationImportFile({ ...validFile, entryPoint:'runtime.expense' }), /INVALID_OBLIGATION_IMPORT_ENTRY_POINT/);
});

test('import contract rejects malformed installments and total mismatch', async () => {
  const { parseObligationImportFile } = await import('../greenfield/obligation-import.mjs');
  assert.throws(() => parseObligationImportFile({ ...validFile, payload:{ ...validFile.payload, installments:[] } }), /INVALID_OBLIGATION_IMPORT_INSTALLMENTS/);
  assert.throws(() => parseObligationImportFile({ ...validFile, payload:{ ...validFile.payload, totalSatang:208382 } }), /OBLIGATION_IMPORT_TOTAL_MISMATCH/);
});

test('runtime readback proves imported obligation and every installment queue exist', async () => {
  const { verifyObligationImportReadback } = await import('../greenfield/obligation-import.mjs');
  const state = { domains:{ LEDGER:{ records:{
    'obl-mobile-net-partner-2026-09-03':{ record:{ type:'OBLIGATION', amountSatang:208383, remainingSatang:208383 } },
  } }, CALENDAR:{ records:{
    'cal-mobile-net-partner-2026-08-03':{ record:{ amountSatang:101329, dueDate:'2026-08-03', status:'OPEN' } },
    'cal-mobile-net-partner-2026-09-03':{ record:{ amountSatang:107054, dueDate:'2026-09-03', status:'OPEN' } },
  } } } };
  assert.doesNotThrow(() => verifyObligationImportReadback(state, validFile.payload));
  assert.throws(() => verifyObligationImportReadback({ ...state, domains:{ ...state.domains, CALENDAR:{ records:{} } } }, validFile.payload), /OBLIGATION_IMPORT_READBACK_MISMATCH/);
});

test('Finance action flow loads an obligation file importer that executes through runtime.obligation', () => {
  const releaseStatus = fs.readFileSync(path.join(root, 'ui/release-status.mjs'), 'utf8');
  const importer = fs.readFileSync(path.join(root, 'ui/obligation-import-ui.mjs'), 'utf8');
  assert.match(releaseStatus, /import ['"]\.\/obligation-import-ui\.mjs['"]/);
  assert.match(importer, /data-city-action-open=[\\"']finance-actions/);
  assert.match(importer, /runtime\.obligation\(payload\)/);
  assert.match(importer, /verifyObligationImportReadback/);
  assert.match(importer, /type\s*=\s*['"]file['"]/);
});
