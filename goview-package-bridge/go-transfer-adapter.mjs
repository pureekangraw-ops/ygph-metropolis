import {validateTransfer,idValid,sameTransfer} from './transfer-contract.mjs';
export const transferTools=['goview_transfer_read','goview_transfer_publish','goview_transfer_receipt'];
export async function invokeTransfer(env,name,args,worker){
 if(!args||typeof args!=='object'||Array.isArray(args))return {ok:false,status:'INVALID_TRANSFER_ARGUMENTS'};
 let expected,id;
 try {
  if(name==='goview_transfer_publish'){
   if(Object.keys(args).join(',')!=='envelope')throw Error();
   expected=validateTransfer(args.envelope);id=expected.transferId;
   if(expected.operation==='SNAPSHOT')return {ok:false,status:'DEVICE_UPLOAD_ROLE_REQUIRED'};
  }else{
   id=args.transferId;if(!idValid(id))throw Error();
   if(name==='goview_transfer_read'&&(Object.keys(args).sort().join(',')!=='sha256,transferId'||typeof args.sha256!=='string'||!/^[a-f0-9]{64}$/.test(args.sha256)))throw Error();
   if(name==='goview_transfer_receipt'&&Object.keys(args).join(',')!=='transferId')throw Error();
  }
 }catch{return {ok:false,status:'INVALID_TRANSFER_ARGUMENTS'};}
 const url='https://goview.internal/v1/transfers/'+id;
 const headers={authorization:'Bearer '+env.GO_WRITE_TOKEN,'content-type':'application/json'};
 try {
  if(expected){
   const written=await worker.fetch(new Request(url,{method:'PUT',headers,body:JSON.stringify(expected)}),env);
   if(!written.ok)return {ok:false,status:'TRANSFER_PUT_REJECTED_OR_UNCERTAIN',httpStatus:written.status,transferId:id,sha256:expected.sha256};
  }
  const response=await worker.fetch(new Request(url+(name==='goview_transfer_receipt'?'/receipt':''),{headers}),env);
  if(!response.ok)return {ok:false,status:response.status===404?'NOT_OBSERVED':'TRANSFER_READ_UNAVAILABLE',httpStatus:response.status};
  const result=await response.json();
  if(name==='goview_transfer_receipt')return {ok:true,status:'DEVICE_REPORTED_RECEIPT',receipt:result,independentlyVerified:false};
  const e=validateTransfer(result);
  if(e.transferId!==id||e.sha256!==(expected?.sha256??args.sha256)||(expected&&!sameTransfer(e,expected)))return {ok:false,status:'TRANSFER_READBACK_MISMATCH'};
  return {ok:true,status:'REMOTE_EXACT_READBACK_VERIFIED',envelope:e,androidStatus:'NOT_OBSERVED_OWNER_APPROVAL_REQUIRED'};
 }catch{return {ok:false,status:'TRANSFER_UNCERTAIN_READ_EXACT_BEFORE_RETRY',transferId:id,...(expected?{sha256:expected.sha256}:{})};}
}
