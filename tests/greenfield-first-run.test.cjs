"use strict";
const test=require('node:test');
const assert=require('node:assert/strict');

function createFakeIndexedDB(){
  const stores=new Map();
  const db={
    objectStoreNames:{contains:name=>stores.has(name)},
    createObjectStore(name){stores.set(name,new Map());},
    close(){},
    transaction(name){
      const map=stores.get(name);let pending=0,aborted=false;
      const transaction={error:null,objectStore(){return{
        get(key){const req={};queueMicrotask(()=>{if(aborted)return;req.result=structuredClone(map.get(key)??null);req.onsuccess?.();});return req;},
        put(value,key){const req={};pending+=1;queueMicrotask(()=>{if(aborted)return;map.set(key,structuredClone(value));req.result=key;req.onsuccess?.();pending-=1;if(pending===0)queueMicrotask(()=>transaction.oncomplete?.());});return req;}
      };},abort(){aborted=true;queueMicrotask(()=>transaction.onabort?.());}};
      return transaction;
    }
  };
  return {indexedDBImpl:{open(){const req={};queueMicrotask(()=>{req.result=db;if(!stores.has('vault'))req.onupgradeneeded?.();req.onsuccess?.();});return req;}}};
}

test('first run creates an empty schema-2 state, enrolls password, and reopens it',async()=>{
  const {initializeFirstRun}=await import('../greenfield/first-run.mjs');
  const {inspectGreenfieldDeviceUnlock,openGreenfieldRuntimeWithDevicePin}=await import('../greenfield/runtime.mjs');
  const fake=createFakeIndexedDB();
  const created=await initializeFirstRun({recoveryCode:'first-run-recovery-code',password:'123456',indexedDBImpl:fake.indexedDBImpl,now:()=> '2026-08-18T15:00:00.000Z'});
  assert.equal(created.status,'CREATED_VERIFIED');
  assert.equal(created.state.schema,2);
  assert.equal(created.state.revision,1);
  assert.equal(Object.values(created.state.domains).every(domain=>Object.keys(domain.records).length===0),true);
  assert.deepEqual(await inspectGreenfieldDeviceUnlock({indexedDBImpl:fake.indexedDBImpl}),{status:'ENROLLED'});
  const runtime=await openGreenfieldRuntimeWithDevicePin({pin:'123456',indexedDBImpl:fake.indexedDBImpl,lockManager:null});
  const reopened=await runtime.readState();
  assert.equal(reopened.revision,1);
  assert.equal(reopened.meta.importedFrom,null);
  runtime.close();
});
