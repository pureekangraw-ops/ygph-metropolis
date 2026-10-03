const test=require('node:test'),assert=require('node:assert/strict');
function dom(){
  const nodes=new Map();const node=k=>{if(!nodes.has(k))nodes.set(k,{value:'',textContent:'',hidden:false,disabled:false,files:[],listeners:{},children:[],addEventListener(e,f){this.listeners[e]=f;},replaceChildren(){this.children=[];this.textContent='';},append(v){this.children.push(v);}});return nodes.get(k);};
  const summary=Array.from({length:4},(_,i)=>node('summary'+i));
  return {node,document:{querySelector:node,querySelectorAll:s=>s==='#ledger-summary strong'?summary:[],createElement:()=>node('row'+Math.random())}};
}
async function flush(){for(let i=0;i<8;i++)await new Promise(resolve=>setImmediate(resolve));}
test('Ledger form retries an unknown write with the same id and clears all displayed financial data on lock',async()=>{
  const {mountPrismProductUI}=await import('../prism/product-ui.mjs');const ui=dom(),values=new Map(),calls=[];let locked=0;
  const truth={balanceSatang:10000,todayInSatang:10000,todayOutSatang:0,transactions:[]};
  const runtime={async unlockLedger(){return truth;},async readLedger(){return truth;},async readPlanning(){return {nextObligation:null};},lockLedger(){locked++;},async mapStatus(){return {available:false};},async recordMoney(v){calls.push(v);if(calls.length===1)throw Error('connection ended before readback');truth.transactions.push({recordId:v.id+'-TX',title:v.title,amountSatang:10000,direction:'IN'});return {status:'VERIFIED'};}};
  const controller=mountPrismProductUI({document:ui.document,runtime,storage:{getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)}});
  await controller.unlockLedger('owner-password');ui.node('#ledger-title').value='private-income';ui.node('#ledger-amount').value='100';ui.node('#ledger-direction').value='IN';
  const submit=()=>ui.node('#ledger-entry-form').listeners.submit({preventDefault(){}});
  submit();await flush();assert.equal(calls.length,1);assert.equal(values.size,1);
  submit();await flush();assert.equal(calls.length,2);assert.equal(calls[0].id,calls[1].id);assert.equal(values.size,0);
  assert.equal(ui.node('#ledger-transactions').children.length,1);
  ui.node('#ledger-title').value='unsaved-private-title';ui.node('#ledger-amount').value='100';controller.lock();
  assert.equal(locked,1);assert.equal(ui.node('#ledger-content').hidden,true);assert.equal(ui.node('#ledger-transactions').children.length,0);
  assert.equal(ui.node('#ledger-title').value,'');assert.equal(ui.node('#ledger-amount').value,'');
  assert.match(await controller.financeSummary(),/เปิดคลัง/);
});
test('a delayed refresh cannot repaint financial truth after the owner locks',async()=>{
  const {mountPrismProductUI}=await import('../prism/product-ui.mjs');const ui=dom();let resolveRead,delay=false;
  const truth={balanceSatang:12345,todayInSatang:12345,todayOutSatang:0,transactions:[]};
  const runtime={async unlockLedger(){return truth;},readLedger(){return delay?new Promise(r=>resolveRead=r):Promise.resolve(truth);},async readPlanning(){return {nextObligation:null};},lockLedger(){},async mapStatus(){return {available:false};}};
  const controller=mountPrismProductUI({document:ui.document,runtime,storage:{getItem:()=>null}});await controller.unlockLedger('owner-password');
  delay=true;ui.node('#ledger-refresh').listeners.click();controller.lock();resolveRead(truth);await flush();
  for(const n of ui.document.querySelectorAll('#ledger-summary strong'))assert.equal(n.textContent,'—');
  assert.equal(ui.node('#ledger-status').textContent,'คลังการเงินล็อกอยู่');
});
test('refreshing a committed but unacknowledged write reconciles its draft before another save',async()=>{
  const {mountPrismProductUI}=await import('../prism/product-ui.mjs');const ui=dom(),values=new Map();let calls=0;
  const truth={balanceSatang:0,todayInSatang:0,todayOutSatang:0,transactions:[]};
  const runtime={async unlockLedger(){return truth;},async readLedger(){return truth;},async readPlanning(){return {nextObligation:null};},lockLedger(){},async mapStatus(){return {available:false};},async recordMoney(v){calls++;truth.transactions=[{recordId:v.id+'-TX',title:v.title,direction:v.direction,amountSatang:10000}];throw Error('readback interrupted');}};
  const controller=mountPrismProductUI({document:ui.document,runtime,storage:{getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)}});
  await controller.unlockLedger('owner-password');ui.node('#ledger-title').value='received';ui.node('#ledger-amount').value='100';ui.node('#ledger-direction').value='IN';
  ui.node('#ledger-entry-form').listeners.submit({preventDefault(){}});await flush();assert.equal(calls,1);
  ui.node('#ledger-refresh').listeners.click();await flush();assert.equal(values.size,0);assert.equal(ui.node('#ledger-title').value,'');assert.equal(ui.node('#ledger-amount').value,'');
});
test('native backup success awaits the document-save verified receipt and cancellation remains a failure',async()=>{
  const {mountPrismProductUI}=await import('../prism/product-ui.mjs');const ui=dom();let resolveSave;
  const original=globalThis.Capacitor;
  try{
    globalThis.Capacitor={isNativePlatform:()=>true,Plugins:{PrismFiles:{saveBackup:()=>new Promise(r=>resolveSave=r)}}};
    const runtime={async exportLedgerBackup(){return {vault:{encrypted:true}};},async mapStatus(){return {available:false};}};
    mountPrismProductUI({document:ui.document,runtime,storage:{getItem:()=>null}});
    ui.node('#ledger-backup').listeners.click();await flush();assert.doesNotMatch(ui.node('#ledger-status').textContent,/บันทึกไฟล์/);
    resolveSave({status:'SAVED_VERIFIED'});await flush();assert.match(ui.node('#ledger-status').textContent,/บันทึกไฟล์/);
    globalThis.Capacitor.Plugins.PrismFiles.saveBackup=async()=>{throw Error('BACKUP_SAVE_CANCELLED');};
    ui.node('#ledger-backup').listeners.click();await flush();assert.doesNotMatch(ui.node('#ledger-status').textContent,/บันทึกไฟล์/);
  }finally{globalThis.Capacitor=original;}
});
