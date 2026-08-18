import { createGreenfieldState } from './core.mjs';
import { VAULT_KEY, readEncryptedState, commitEncryptedState } from './persistence.mjs';
import { openGreenfieldVaultStore } from './browser-store.mjs';
import { inspectDeviceUnlock, enrollDeviceUnlock, unlockVaultPassphrase } from './device-unlock.mjs';

function recoveryCodeValue(value){
  const code=String(value??'');
  if(code.length<12)throw new Error('PASSPHRASE_TOO_SHORT');
  return code;
}
function passwordValue(value){
  const password=String(value??'');
  if(password.length<6)throw new Error('DEVICE_PIN_TOO_SHORT');
  return password;
}

export async function initializeFirstRun({recoveryCode,password,indexedDBImpl=globalThis.indexedDB,now=()=>new Date().toISOString()}={}){
  const passphrase=recoveryCodeValue(recoveryCode);
  const pin=passwordValue(password);
  const store=await openGreenfieldVaultStore({indexedDBImpl});
  try{
    const unlock=await inspectDeviceUnlock({store});
    if(unlock.status==='ENROLLED')throw new Error('FIRST_RUN_ALREADY_ENROLLED');
    if(unlock.status==='INCOMPLETE')throw new Error('DEVICE_UNLOCK_INCOMPLETE');

    const existingVault=await store.get(VAULT_KEY);
    let state;
    let status;
    if(existingVault){
      state=await readEncryptedState({store,passphrase});
      if(!state)throw new Error('GREENFIELD_NOT_INITIALIZED');
      status='RESUMED';
    }else{
      state=createGreenfieldState({now:now()});
      await commitEncryptedState({store,passphrase,state,expectedDurableRevision:null});
      state=await readEncryptedState({store,passphrase});
      status='CREATED_VERIFIED';
    }

    await enrollDeviceUnlock({store,vaultPassphrase:passphrase,pin});
    const readback=await unlockVaultPassphrase({store,pin});
    if(readback!==passphrase)throw new Error('DEVICE_UNLOCK_READBACK_MISMATCH');
    const verified=await readEncryptedState({store,passphrase:readback});
    return {status,state:verified};
  }finally{store.close();}
}
