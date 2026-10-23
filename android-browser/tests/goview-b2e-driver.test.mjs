import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const driver=fileURLToPath(new URL('../scripts/goview-b2e-emulator.sh',import.meta.url));
function run(options={}){
  const root=mkdtempSync(join(tmpdir(),'goview-host-driver-'));
  try{
    mkdirSync(join(root,'bin'));mkdirSync(join(root,'app/build/emulator-evidence'),{recursive:true});
    writeFileSync(join(root,'bin/adb'),`#!/usr/bin/env bash
printf '%s\\n' "$*" >> "$FAKE_ADB_LOG"
case "$*" in
  'shell getprop ro.kernel.qemu') echo "$FAKE_EMULATOR";;
  'shell pidof com.big.gobrowser') if [ "$FAKE_ALIVE" = 1 ]; then echo 999; exit 0; else exit 1; fi;;
  'shell am instrument'*) if [ "$FAKE_RESULT" = failure ]; then echo 'FAILURES!!!'; else echo 'OK (1 test)'; fi;;
  *) exit 0;;
esac
`,{mode:0o755});
    const log=join(root,'commands');
    const result=spawnSync('bash',[driver],{cwd:root,encoding:'utf8',env:{...process.env,PATH:join(root,'bin')+':'+process.env.PATH,FAKE_ADB_LOG:log,FAKE_EMULATOR:'1',FAKE_ALIVE:'0',FAKE_RESULT:'success',...options}});
    return {...result,commands:readFileSync(log,'utf8')};
  }finally{rmSync(root,{recursive:true,force:true});}
}
test('B2E host refuses physical-device targets before any install',()=>{
  const r=run({FAKE_EMULATOR:'0'});assert.notEqual(r.status,0);assert.doesNotMatch(r.commands,/install|force-stop|instrument/);
});
test('B2E host rejects JUnit failure even when adb exits zero',()=>{
  const r=run({FAKE_RESULT:'failure'});assert.notEqual(r.status,0);assert.doesNotMatch(r.commands,/goviewPhase after/);
});
test('B2E host stops process between two separately verified instrumentations',()=>{
  const r=run();assert.equal(r.status,0,r.stderr);assert.match(r.commands,/goviewPhase before[\s\S]*force-stop[\s\S]*pidof[\s\S]*goviewPhase after/);
  assert.equal((r.stdout.match(/GOVIEW_B2E_PHASE_PASS/g)||[]).length,2);
});
test('B2E host refuses to claim restart if old process remains alive',()=>{
  const r=run({FAKE_ALIVE:'1'});assert.notEqual(r.status,0);assert.doesNotMatch(r.commands,/goviewPhase after/);
});
