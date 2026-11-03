import {invokeTransfer,transferTools} from './go-transfer-adapter.mjs';
import worker from './worker.mjs';
import Engine from '../android-browser/app/src/main/assets/goview-studio/engine.js';

// Named GO Brain RPC only. Reuses the versioned HTTP storage contract and its guards.
// Runtime binding/provisioning is deliberately a separate owner-authorized action.
export async function invokeGoview(env, name, args={}) {
  if(transferTools.includes(name))return invokeTransfer(env,name,args,worker);
  // GO direct commands reuse the existing private GOVIEW_GO binding.
  // Cloudflare stores proposals, while Android remains the only map-data authority.
  if(['goview_focus_point','goview_propose_pin','goview_command_status'].includes(name)) {
    const id=args?.commandId;
    if(typeof id!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(id))
      return {ok:false,status:'COMMAND_ID_INVALID'};
    const statusName=name==='goview_command_status';
    const cmd=statusName?null:{
      schema:'goview.direct-command.v1',commandId:id.toLowerCase(),
      type:name==='goview_focus_point'?'POINT_FOCUS':'PIN_PROPOSAL',
      point:{latitude:args.latitude,longitude:args.longitude},
      ...(name==='goview_propose_pin'?{label:args.label}:{}),
      ...(args.expectedRevision!==undefined?{expectedRevision:args.expectedRevision}:{})
    };
    const destination=statusName
      ?'https://goview.internal/v1/direct/commands/'+id.toLowerCase()+'/status'
      :'https://goview.internal/v1/direct/commands';
    try {
      const response=await worker.fetch(new Request(destination,{
        method:statusName?'GET':'POST',
        headers:{authorization:'Bearer '+env.GO_WRITE_TOKEN,'content-type':'application/json'},
        ...(!statusName?{body:JSON.stringify(cmd)}:{})
      }),env);
      const result=await response.json();
      return {ok:response.ok,...result,
        ...(!statusName?{phoneState:'NOT_YET_APPLIED_UNTIL_DEVICE_RECEIPT'}:{})};
    } catch {return {ok:false,status:'DIRECT_COMMAND_OUTCOME_UNCERTAIN_CHECK_BY_ID'};}
  }
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
