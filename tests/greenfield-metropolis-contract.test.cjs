"use strict";
const test=require('node:test');
const assert=require('node:assert/strict');

const contractPromise=import('../metropolis/contract.mjs');

test('Metropolis separates City Hall from the wider connection environment',async()=>{
  const {METROPOLIS_ROLES}=await contractPromise;
  assert.equal(METROPOLIS_ROLES.METROPOLIS,'connection_environment');
  assert.equal(METROPOLIS_ROLES.CITY_HALL,'intake_return_data');
  assert.notEqual(METROPOLIS_ROLES.METROPOLIS,METROPOLIS_ROLES.CITY_HALL);
});

test('Work identity carries continuity without copying owner operational state',async()=>{
  const {createWorkIdentity}=await contractPromise;
  const identity=createWorkIdentity({workId:'WORK-1',ownerSystem:'FACTORY',checkpointId:'CP-1'});
  assert.deepEqual(identity,{kind:'WORK_IDENTITY',contractVersion:'0.1.0',workId:'WORK-1',ownerSystem:'FACTORY',checkpointId:'CP-1',ownerRef:null,handoffId:null});
  assert.equal(Object.prototype.hasOwnProperty.call(identity,'currentState'),false);
});

test('Station, Rail and OATH remain distinct boundaries',async()=>{
  const {createStation,createRail,createOathEnvelope}=await contractPromise;
  const station=createStation({stationId:'STATION-FACTORY',ownerSystem:'FACTORY',credentialRef:'credential://factory/main'});
  const rail=createRail({railId:'RAIL-FACTORY',stationId:station.stationId,ownerSystem:'FACTORY',credentialRef:station.credentialRef});
  const oath=createOathEnvelope({oathId:'OATH-1',workId:'WORK-1',stationId:station.stationId,railId:rail.railId,operation:'READ_REALITY',payload:{},requestedAt:'2026-10-05T00:00:00Z'});
  assert.equal(station.kind,'STATION');
  assert.equal(rail.kind,'RAIL');
  assert.equal(oath.kind,'OATH');
  assert.equal(rail.ownerSystem,'FACTORY');
});

test('Rail rejects raw credentials',async()=>{
  const {createRail}=await contractPromise;
  assert.throws(()=>createRail({railId:'R',stationId:'S',ownerSystem:'FACTORY',credentialRef:'secret-value'}),/credentialRef_MUST_BE_REFERENCE/);
});

test('Reconciliation reports without selecting a winner',async()=>{
  const {classifyReconciliation}=await contractPromise;
  assert.deepEqual(classifyReconciliation({expectedOwnerSystem:'FACTORY',observedOwnerSystem:'FACTORY',expectedRevision:7,observedRevision:7,observedAt:'2026-10-05T00:00:00Z'}),{status:'MATCH',reason:'OWNER_READBACK_MATCH'});
  assert.deepEqual(classifyReconciliation({expectedOwnerSystem:'FACTORY',observedOwnerSystem:'FACTORY',expectedRevision:7,observedRevision:8,observedAt:'2026-10-05T00:00:00Z'}),{status:'DRIFT',reason:'OWNER_REVISION_CHANGED'});
  assert.deepEqual(classifyReconciliation({expectedOwnerSystem:'FACTORY',observedOwnerSystem:'PRISM',expectedRevision:7,observedRevision:7,observedAt:'2026-10-05T00:00:00Z'}),{status:'CONFLICT',reason:'OWNER_SYSTEM_MISMATCH'});
  assert.deepEqual(classifyReconciliation({expectedOwnerSystem:'FACTORY',observedOwnerSystem:'FACTORY'}),{status:'UNKNOWN',reason:'OWNER_READBACK_INCOMPLETE'});
});
