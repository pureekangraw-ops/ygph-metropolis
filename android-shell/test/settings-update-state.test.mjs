import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const settingsUrl=new URL('../../ui/settings-ui.mjs',import.meta.url);

test('Settings derives determinate progress only from real byte counts',async()=>{
  const source=await readFile(settingsUrl,'utf8');
  assert.match(source,/downloadedBytes\s*\/\s*totalBytes|downloadedBytes\)\s*\/\s*Number\(totalBytes/);
  assert.match(source,/removeAttribute\(['"]value['"]\)/,'unknown total must make progress indeterminate');
  assert.doesNotMatch(source,/\(\{percent,downloadedBytes,totalBytes\}/,'UI must not trust native percent');
});

test('Settings distinguishes waiting for Android from installed readback',async()=>{
  const source=await readFile(settingsUrl,'utf8');
  assert.match(source,/รอการยืนยันจาก Android/);
  assert.match(source,/ติดตั้งแล้ว|อัปเดตเรียบร้อย/);
  assert.match(source,/\.resume\(/,'startup must reconcile persisted installer handoff');
});
