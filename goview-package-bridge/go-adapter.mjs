import worker from './worker.mjs';
import Engine from '../android-browser/app/src/main/assets/goview-studio/engine.js';

// Named GO Brain RPC only. Reuses the versioned HTTP storage contract and its guards.
// Runtime binding/provisioning is deliberately a separate owner-authorized action.
export async function invokeGoview(env, name, args={}) {
  if (!['goview_publish','goview_readback'].includes(name)) return {ok:false,status:'UNSUPPORTED'};
  if (!args || typeof args !== 'object' || Array.isArray(args) ||
      typeof args.mapId !== 'string' || !/^[a-zA-Z0-9_-]{1,70}$/.test(args.mapId) ||
      !Number.isInteger(args.version) || args.version < 1 || args.version > 999999 ||
      typeof args.transferId !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(args.transferId) ||
      typeof args.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(args.sha256)) return {ok:false,status:'INVALID_ARTIFACT_IDENTITY'};
  const url=`https://goview.internal/v1/maps/${args.mapId}/packages/${args.version}`;
  const headers={authorization:'Bearer '+env.GO_WRITE_TOKEN,'content-type':'application/json','x-goview-transfer-id':args.transferId};
  try {
    if(name==='goview_publish') {
      if(typeof args.package !== 'string' || new TextEncoder().encode(args.package).length > 1048832)
        return {ok:false,status:'INVALID_PACKAGE'};
      const raw=args.package, map=Engine.unpack(raw);
      if(map.mapId!==args.mapId || map.version!==args.version || Engine.hash(raw)!==args.sha256)
        return {ok:false,status:'ARTIFACT_MISMATCH'};
      const put=await worker.fetch(new Request(url,{method:'PUT',headers,body:raw}),env);
      if(!put.ok) return {ok:false,status:'PUT_REJECTED',httpStatus:put.status};
      const receipt=await put.json();
      if(receipt.sha256!==args.sha256) return {ok:false,status:'UPLOAD_RECEIPT_MISMATCH'};
    }
    const response=await worker.fetch(new Request(url,{headers}),env);
    if(!response.ok) return {ok:false,status:'READBACK_UNAVAILABLE',httpStatus:response.status};
    const raw=await response.text(), map=Engine.unpack(raw);
    if(Engine.hash(raw)!==args.sha256 || map.mapId!==args.mapId || map.version!==args.version)
      return {ok:false,status:'READBACK_MISMATCH'};
    return {ok:true,status:'REMOTE_EXACT_READBACK_VERIFIED',transferId:args.transferId,
      mapId:map.mapId,version:map.version,sha256:args.sha256,
      package:raw,androidStatus:'NOT_OBSERVED_OWNER_APPROVAL_REQUIRED'};
  } catch { return {ok:false,status:'TRANSFER_UNCERTAIN_READ_EXACT_VERSION_BEFORE_RETRY'}; }
}
