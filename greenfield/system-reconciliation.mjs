import { resolveCalendarAction } from './action-contract.mjs';
import { projectCalculationAuthority, projectStockTruth } from './calculation-authority.mjs';

const MONEY_QUEUE_TYPES=new Set(['PAY_OBLIGATION','PAY_OBLIGATION_INSTALLMENT','RECEIVE_CUSTOMER_PAYMENT']);
function recordsFor(state,domain){return Object.values(state?.domains?.[domain]?.records||{}).map(entry=>entry?.record).filter(Boolean);}
function open(status){return status==='OPEN'||status==='PARTIAL';}

export function reconcileSystemState(state,{ledgerBalanceSatang=0,today,nearDays=7}={}){
  if(!state||typeof state!=='object')throw new TypeError('INVALID_SYSTEM_STATE');
  const errors=[];const warnings=[];
  const truth=projectCalculationAuthority(state,{ledgerBalanceSatang,today,nearDays});

  const stock=projectStockTruth(state).stockQuantity;
  if(stock<0)errors.push({code:'STORE_STOCK_UNDERFLOW',value:stock});

  const calendar=recordsFor(state,'CALENDAR');
  for(const queue of calendar){
    if(!open(queue.status)||!MONEY_QUEUE_TYPES.has(queue.type))continue;
    const action=resolveCalendarAction(state,queue);
    if(!action.available)warnings.push({code:'CALENDAR_ACTION_VERIFY',recordId:queue.recordId,reason:action.reason});
  }

  for(const item of truth.receivables.items){
    if(item.queueState==='VERIFY_DUPLICATE')warnings.push({code:'RECEIVABLE_QUEUE_DUPLICATE',recordId:item.saleId});
    if(item.queueState==='UNSCHEDULED')warnings.push({code:'RECEIVABLE_QUEUE_MISSING',recordId:item.saleId});
  }

  // RIDE remains implementation compatibility while the Current semantic contract is unresolved.
  for(const warning of truth.semanticWarnings)warnings.push({code:warning});

  // Deliberately do not require Calendar installment totals to equal Ledger obligation exposure.
  // Current semantic contract permits differences while evidence is incomplete.
  return {status:errors.length?'FAIL':warnings.length?'VERIFY':'PASS',errors,warnings,truth};
}
