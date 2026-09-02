"use strict";
const test=require('node:test');
const assert=require('node:assert/strict');
const {readFile}=require('node:fs/promises');
const {join}=require('node:path');
const root=join(__dirname,'..');
const read=p=>readFile(join(root,p),'utf8');

test('LIGHTHOUSE exposes one Calendar surface and keeps creation inside that same flow',async()=>{
  const html=await read('index.html');
  const manual=await read('ui/manual-finance-ui.mjs');
  assert.equal((html.match(/id="financeSchedule"/g)||[]).length,1,'one canonical Calendar surface');
  assert.equal((`${html}\n${manual}`.match(/id=['"]manualCalendarViews['"]/g)||[]).length,0,'no second Calendar list');
  assert.equal((`${html}\n${manual}`.match(/id=['"]manualCalendarDetail['"]/g)||[]).length,0,'no second Calendar detail');
  assert.match(manual,/calendarItemForm/,'Calendar creation remains available');
  assert.match(manual,/financeSchedule[\s\S]*calendarItemForm|calendarItemForm[\s\S]*financeSchedule/,'creation is mounted into the canonical Calendar flow');
});

test('MANUAL Calendar entry routes to the canonical Finance-hosted Calendar without creating another owner',async()=>{
  const shell=await read('ui/lighthouse-shell.mjs');
  const manual=await read('ui/manual-finance-ui.mjs');
  assert.match(shell,/title:'ปฏิทิน'[\s\S]*destination:'finance'[\s\S]*target:'financeSchedule'/);
  assert.match(manual,/createCalendarItem/,'creation still uses the shared manual facade');
  assert.doesNotMatch(manual,/createGreenfieldRuntime|createCommandRuntime|openGreenfieldRuntime/);
});
