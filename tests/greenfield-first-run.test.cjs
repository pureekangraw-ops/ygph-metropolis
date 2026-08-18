"use strict";
const test=require('node:test');
const assert=require('node:assert/strict');

test('fresh runtime initializes one empty schema-2 state and refuses to overwrite it',async()=>{
  const {createMemoryVaultStore}=await import('../greenfield/persistence.mjs');
  const {createGreenfieldRuntime}=await import('../greenfield/runtime.mjs');
  const store=createMemoryVaultStore();
  const runtime=createGreenfieldRuntime({store,passphrase:'first-run-recovery-code',lockManager:null,now:()=> '2026-08-18T15:00:00.000Z'});
  const created=await runtime.initializeFresh();
  assert.equal(created.status,'CREATED_VERIFIED');
  assert.equal(created.state.schema,2);
  assert.equal(created.state.revision,1);
  assert.deepEqual(Object.keys(created.state.domains),['STORE','LEDGER','CALENDAR','RIDE']);
  assert.equal(Object.values(created.state.domains).every(domain=>Object.keys(domain.records).length===0),true);
  await assert.rejects(()=>runtime.initializeFresh(),/GREENFIELD_ALREADY_INITIALIZED/);
});
