import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createTrustedAppBridge } from '../www/trusted/app-bridge.mjs';
import { createSurfaceNavigator } from '../release/front-door-0.0.7/logic.mjs';

const root = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');
async function json(path) { return JSON.parse(await read(path)); }

test('packaged APK boots the full LIGHTHOUSE shell instead of Foundation Proof', async () => {
  const index=await read('www/index.html'),version=await json('www/app/version.json'),ui=await read('www/app/ui.html'),logic=await read('www/app/logic.mjs');
  assert.equal(version.version,'0.0.7'); assert.doesNotMatch(index,/Foundation Proof/i); assert.match(ui,/data-chat-log/); assert.match(ui,/data-manual-panel/); assert.match(ui,/data-settings-panel/); assert.match(logic,/host/); assert.match(logic,/patchUpdater/);
});

test('current Patch presents the same full shell and advances from 0.0.6', async () => {
  const contract=await json('release/current-patch.json'); assert.deepEqual(contract,{version:'0.0.7',primaryBaseVersion:'0.0.6',bootstrapBaseVersion:'0.0.1',releaseDirectory:'release/front-door-0.0.7'});
  const ui=await read('release/front-door-0.0.7/ui.html'),logic=await read('release/front-door-0.0.7/logic.mjs'); assert.match(ui,/data-manual-panel/); assert.match(ui,/data-permission-status/); assert.match(logic,/CHAT/); assert.match(logic,/MANUAL/); assert.match(logic,/SETTINGS/);
});

test('Android package version advances monotonically from 1.0.1 (1002)', async()=>{const version=await json('version.json');assert.equal(version.versionCode,1003);assert.equal(version.versionName,'1.0.2');});

test('trusted host bridge reuses Runtime/Manual owner and fails permission state closed', async () => {
  const source=await read('www/trusted/app-bridge.mjs'); assert.match(source,/createManualFourHouses/); assert.match(source,/resolveRecordReference/); assert.match(source,/status:'VERIFY'/); assert.doesNotMatch(source,/indexedDB|localStorage|sessionStorage|createGreenfieldRuntime|openGreenfieldRuntime/);
  let state={revision:7,domains:{LEDGER:{records:{'TX-ORIGINAL':{record:{recordId:'TX-ORIGINAL',type:'TRANSACTION',direction:'OUT',amountSatang:2500,title:'กาแฟ'}}}}}};
  const runtime={async readState(){return structuredClone(state);},async executeMultiGroupCommands({commands}){for(const command of commands){if(command.type==='LEDGER_REVERSE_TRANSACTION'){const id=command.payload.reversalRecordId;state.domains.LEDGER.records[id]={record:{recordId:id,type:'TRANSACTION',direction:'IN',amountSatang:2500,title:'ย้อน กาแฟ',reversalOf:command.payload.originalRecordId}};state.revision+=1;}}return {status:'COMMITTED'};}};
  const bridge=createTrustedAppBridge({runWithRuntime:fn=>fn(runtime)}); const reference={version:1,owner:'LEDGER',recordId:'TX-ORIGINAL'};
  assert.equal((await bridge.resolve(reference)).record.title,'กาแฟ'); const result=await bridge.reverse(reference); assert.equal(result.status,'VERIFIED'); assert.equal(result.current.record.recordId,'TX-ORIGINAL'); assert.equal(result.reversal.record.reversalOf,'TX-ORIGINAL'); assert.equal((await bridge.permissionStatus()).status,'VERIFY');
});

test('full shell preserves CHAT → MANUAL → SETTINGS → MANUAL → CHAT navigation', () => {
  const navigation=createSurfaceNavigator(); assert.equal(navigation.current,'CHAT'); assert.equal(navigation.openManual(),'MANUAL'); assert.equal(navigation.openSettings(),'SETTINGS'); assert.equal(navigation.returnFromSettings(),'MANUAL'); assert.equal(navigation.returnToChat(),'CHAT');
});

test('full shell routes durable Chat readback to fresh Manual resolve and Manual reversal back to fresh original Truth', async()=>{const logic=await read('release/front-door-0.0.7/logic.mjs');assert.match(logic,/referenceFromReadback\(result\.readback\)/);assert.match(logic,/getHost\(\)\)\.resolve\(reference\)/);assert.match(logic,/getHost\(\)\)\.reverse\(currentReference/);assert.match(logic,/renderManual\(result\.current\)/);});
