import {createLighthouseHubControlPortTransport} from '../lighthouse-next/control-port/control-port-transport.mjs';

// The existing session, credential store and wire contract remain authoritative.
export function createPrismHubBridge({transport=createLighthouseHubControlPortTransport(),now=()=>new Date().toISOString()}={}) {
  let snapshot={works:[],live:false,monitor:{},error:'NOT_PAIRED'};
  let live=null;
  async function paired(){if((await transport.status()).status!=='PAIRED')throw Error('PRISM_HUB_NOT_PAIRED');}
  async function getSnapshot(){
    try{
      await paired();const board=await transport.pullBoard();
      if(!board||!Array.isArray(board.pins))throw Error('PRISM_HUB_BOARD_UNAVAILABLE');
      const works=board.pins.map(pin=>({...pin,routingWorkId:pin.workId,workId:pin.canonicalWorkId||pin.workId,checkpointId:pin.checkpointId||pin.card?.checkpointId||'',holder:pin.card?.holder||pin.ownerEmployeeId||null,status:pin.card?.sourceStatus||pin.status,route:pin.destinations||[],decision:pin.card?.sourceStatus==='WAIT VERIFY'?{kind:'VERIFY',summary:pin.detail||''}:null}));
      snapshot={works,live:true,revision:board.revision,updatedAt:board.updatedAt,observedAt:now(),monitor:{},source:'GO_HUB_CONTROL_PORT'};
    }catch(error){snapshot={...snapshot,live:false,error:String(error.message||error)};}
    return structuredClone(snapshot);
  }
  async function getCapabilities(){const ready=(await transport.status()).status==='PAIRED';return {DIRECT_API:ready,COUNTER:false,DEVICE_BRIDGE:false,destinations:ready?['LIGHT']:[]};}
  async function request(path,body){await paired();return transport.request(path,body);}
  async function submitIntent(text){return request('/prism/ask',{question:String(text||'').trim()});}
  async function dispatch(envelope){return request('/prism/handoff',envelope);}
  async function getResult(receipt){return request('/prism/result',{counterId:receipt.counterId,workId:receipt.workId,checkpointId:receipt.checkpointId});}
  async function pair(input){const r=await transport.pair(input);await getSnapshot();return r;}
  async function startLive(onUpdate){live?.close();live=await transport.openLive({onSignal:()=>void getSnapshot().then(onUpdate),onStatus:s=>{if(s.status!=='LIVE'){snapshot={...snapshot,live:false};onUpdate?.(structuredClone(snapshot));}}});return live;}
  async function publishState(browserEvidence){await paired();return transport.pushState({work:{status:'ON PROCESS',source:'PRISM'},snapshot:{source:'PRISM',boardRevision:snapshot.revision??null,browserEvidence},syncedAt:now()});}
  async function disconnect(){live?.close();live=null;const r=await transport.disconnect();snapshot={works:[],live:false,monitor:{},error:'NOT_PAIRED'};return r;}
  return Object.freeze({getSnapshot,getCapabilities,submitIntent,dispatch,getResult,pair,startLive,publishState,disconnect,status:()=>transport.status()});
}
