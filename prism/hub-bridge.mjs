import {createLighthouseHubControlPortTransport} from '../lighthouse-next/control-port/control-port-transport.mjs';

// The existing session, credential store and wire contract remain authoritative.
export function createPrismHubBridge({transport=createLighthouseHubControlPortTransport(),now=()=>new Date().toISOString(),storage}={}) {
  let snapshot={works:[],live:false,monitor:{},error:'NOT_PAIRED'};
  let live=null;
  const cacheKey='prism:hub-board:v1';
  if(storage===undefined)try{storage=globalThis.localStorage;}catch{}
  let owner=null;
  function clearCache(){try{storage?.removeItem(cacheKey);}catch{}}
  function restoreCache(key){
    try{const saved=JSON.parse(storage?.getItem(cacheKey)||'null');if(saved?.owner===key&&Array.isArray(saved.snapshot?.works))snapshot={...saved.snapshot,live:false,cached:true};}catch{}
  }
  function saveCache(){
    if(!owner)return;
    try{storage?.setItem(cacheKey,JSON.stringify({owner,snapshot}));}catch(error){snapshot={...snapshot,cacheError:String(error.message||error)};}
  }
  async function paired(){if((await transport.status()).status!=='PAIRED')throw Error('PRISM_HUB_NOT_PAIRED');}
  async function getSnapshot(){
    try{
      const connection=await transport.status();
      const key=connection.sessionId?[connection.hubOrigin||'',connection.sessionId].join('|'):null;
      if(owner!==key){snapshot={works:[],live:false,monitor:{}};owner=key;if(key)restoreCache(key);}
      if(connection.status!=='PAIRED'){snapshot={works:[],live:false,monitor:{}};throw Error('PRISM_HUB_NOT_PAIRED');}
      const board=await transport.pullBoard();
      if(!board||!Array.isArray(board.pins))throw Error('PRISM_HUB_BOARD_UNAVAILABLE');
      const works=board.pins.map(pin=>({...pin,routingWorkId:pin.workId,workId:pin.canonicalWorkId||pin.workId,checkpointId:pin.checkpointId||pin.card?.checkpointId||'',holder:pin.card?.holder||pin.ownerEmployeeId||null,status:pin.card?.sourceStatus||pin.status,route:pin.destinations||[],decision:pin.card?.sourceStatus==='WAIT VERIFY'?{kind:'VERIFY',summary:pin.detail||''}:null}));
      snapshot={works,live:true,revision:board.revision,updatedAt:board.updatedAt,observedAt:now(),monitor:{},source:'GO_HUB_CONTROL_PORT',cached:false};saveCache();
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
  async function disconnect(){live?.close();live=null;const r=await transport.disconnect();snapshot={works:[],live:false,monitor:{},error:'NOT_PAIRED'};owner=null;clearCache();return r;}
  return Object.freeze({getSnapshot,getCapabilities,submitIntent,dispatch,getResult,pair,startLive,publishState,disconnect,status:()=>transport.status()});
}
