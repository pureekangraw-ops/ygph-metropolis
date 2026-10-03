import { initializeFirstRun } from '../greenfield/first-run.mjs';
import { inspectGreenfieldDeviceUnlock, openGreenfieldRuntimeWithDevicePin, resetGreenfieldDevicePassword, openGreenfieldRuntimeFromBackup } from '../greenfield/runtime.mjs';
import { createLighthouseLedgerBridge } from '../lighthouse-next/runtime-ledger.mjs';
import { readRideMapNativeStatus, importRideMapPackage, openRideMap, openRideNavigation } from '../lighthouse-next/ride-map-native.mjs';

function point(value){
  if(!value||value.lat===null||value.lng===null||String(value.lat??'').trim()===''||String(value.lng??'').trim()==='')throw new Error('GEOGRAPHY_INVALID');
  const lat=Number(value.lat),lng=Number(value.lng);
  if(!Number.isFinite(lat)||!Number.isFinite(lng)||lat < -90||lat > 90||lng < -180||lng > 180)throw new Error('GEOGRAPHY_INVALID');
  return {lat,lng,label:String(value.label||'')};
}

export function createPrismProductRuntime({indexedDBImpl=globalThis.indexedDB,lockManager=globalThis.navigator?.locks??null,capacitor=globalThis.Capacitor,now=()=>new Date().toISOString()}={}){
  let runtime=null;
  const options={indexedDBImpl,lockManager,now};
  const ledger=createLighthouseLedgerBridge({withSession:async operation=>{if(!runtime)throw new Error('LEDGER_LOCKED');return operation(runtime);},now:()=>new Date(now())});
  function lockLedger(){runtime?.close();runtime=null;}
  async function unlockLedger(password){
    lockLedger();
    const opened=await openGreenfieldRuntimeWithDevicePin({...options,pin:password});
    try{if(!await opened.readState())throw new Error('LEDGER_NOT_INITIALIZED');runtime=opened;return await ledger.readLedgerTruth();}
    catch(error){opened.close();runtime=null;throw error;}
  }
  async function initializeLedger({recoveryCode,password}){
    await initializeFirstRun({recoveryCode,password,indexedDBImpl,now});
    return unlockLedger(password);
  }
  async function recordMoney({id,direction,title,amountBaht}){
    if(!/^[A-Za-z0-9_-]{1,120}$/.test(String(id||'')))throw new Error('LEDGER_ACTION_ID_REQUIRED');
    const input={workflowId:id,ledgerTransactionId:id+'-TX',amountBaht};
    if(direction==='IN')return ledger.recordOtherIncome({...input,source:title});
    if(direction==='OUT')return ledger.recordExpense({...input,title});
    throw new Error('LEDGER_DIRECTION_INVALID');
  }
  async function openMap(destination){
    let location;
    if(destination)location=point(destination);
    else{
      const status=await readRideMapNativeStatus({capacitor});
      if(status.packageState!=='ACTIVE')throw new Error('LOCAL_MAP_NOT_INSTALLED');
      const b=status.bounds;
      const min=point({lat:b?.minLat,lng:b?.minLon}),max=point({lat:b?.maxLat,lng:b?.maxLon});
      let lng=(min.lng+max.lng)/2;
      if(min.lng>max.lng){lng+=180;if(lng>180)lng-=360;}
      location={lat:(min.lat+max.lat)/2,lng,label:status.region||'แผนที่'};
    }
    return openRideMap({capacitor,job:{pickup:location}});
  }
  return Object.freeze({
    ledgerStatus:()=>inspectGreenfieldDeviceUnlock({indexedDBImpl}),unlockLedger,initializeLedger,lockLedger,
    recoverLedger:async({recoveryCode,password})=>{await resetGreenfieldDevicePassword({recoveryCode,nextPassword:password,indexedDBImpl});return unlockLedger(password);},
    restoreLedgerBackup:async({backup,recoveryCode,password})=>{
      if(String(password??'').length<6)throw new Error('DEVICE_PIN_TOO_SHORT');
      const restored=await openGreenfieldRuntimeFromBackup({...options,backup:{...backup,recoveryKey:recoveryCode},allowOverwrite:false});
      try{await restored.changeDevicePassword({nextPassword:password});}finally{restored.close();}
      return unlockLedger(password);
    },
    readLedger:()=>ledger.readLedgerTruth(),readPlanning:()=>ledger.readPlanningTruth(),recordMoney,
    exportLedgerBackup:async()=>{if(!runtime)throw new Error('LEDGER_LOCKED');const backup=await runtime.exportBackup();delete backup.recoveryKey;return backup;},
    mapStatus:()=>readRideMapNativeStatus({capacitor}),importMap:()=>importRideMapPackage({capacitor}),openMap,
    navigate:async destination=>openRideNavigation({capacitor,destination:point(destination)}),
  });
}
