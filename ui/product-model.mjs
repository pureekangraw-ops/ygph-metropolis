export { projectRideState, projectRideRound } from '../greenfield/ride-domain.mjs';
import { projectGeneratedIncome, projectReceivableTruth, projectStockTruth, projectFinancialTruth, projectCashFlowSeries } from '../greenfield/calculation-authority.mjs';
export { projectCashFlowSeries };

const DAY_MS = 86400000;
const MONEY_QUEUE_TYPES = new Set(['PAY_OBLIGATION','PAY_OBLIGATION_INSTALLMENT','RECEIVE_CUSTOMER_PAYMENT']);

export function recordsForDomain(state, domain) {
  return Object.values(state?.domains?.[domain]?.records || {}).map(entry=>entry?.record).filter(Boolean);
}

export function dateKey(value, timeZone='Asia/Bangkok') {
  if (value == null || value === '') return null;
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date=value instanceof Date?value:new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);
  const map=Object.fromEntries(parts.map(part=>[part.type,part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}
function dateEpoch(key){if(!/^\d{4}-\d{2}-\d{2}$/.test(String(key||'')))return NaN;const [y,m,d]=key.split('-').map(Number);return Date.UTC(y,m-1,d);}
function dayDistance(from,to){return Math.round((dateEpoch(to)-dateEpoch(from))/DAY_MS);}
function lifecycleClosed(status){return status==='COMPLETED'||status==='CANCELLED';}

export function isCalendarActionableStatus(status){return status==='OPEN'||status==='PARTIAL';}
export function deriveTimeState(record,today,nearDays=7){
  if(record?.status==='COMPLETED')return 'COMPLETED';
  if(record?.status==='CANCELLED')return 'CANCELLED';
  const due=dateKey(record?.dueDate||record?.date||record?.scheduledDate);const current=dateKey(today);
  if(!due||!current)return 'FUTURE';const days=dayDistance(current,due);
  if(days<0)return 'OVERDUE';if(days===0)return 'TODAY';if(days<=nearDays)return 'NEAR';return 'FUTURE';
}

export function projectMakeMoney(state,today){return projectGeneratedIncome(state,today);}
export function projectStoreReceivables(state){return projectReceivableTruth(state);}
export function projectStore(state,today){
  const stock=projectStockTruth(state);const receivables=projectReceivableTruth(state);const money=projectGeneratedIncome(state,today);
  return {todaySalesSatang:money.storeSatang,stockQuantity:stock.stockQuantity,receivableSatang:receivables.totalOutstandingSatang};
}
export function projectFinance(state,ledgerBalanceSatang,today,nearDays=7){return projectFinancialTruth(state,ledgerBalanceSatang,today,nearDays);}

function median(values){if(!values.length)return 0;const sorted=[...values].sort((a,b)=>a-b);const middle=Math.floor(sorted.length/2);return sorted.length%2?sorted[middle]:Math.round((sorted[middle-1]+sorted[middle])/2);}
function roundGoal(value){if(!Number.isFinite(value)||value<=0)return 0;return Math.ceil(value/1000)*1000;}
export function suggestDailyGoal({dailyIncome=[],balanceSatang=0,nearObligations=[],today}={}){
  const current=dateKey(today);
  const recentValues=dailyIncome.slice(-7).map(item=>Number(item?.amountSatang??item??0)).filter(Number.isSafeInteger).map(value=>Math.max(0,value));
  const baselineSatang=roundGoal(median(recentValues));
  const open=nearObligations.filter(item=>!lifecycleClosed(item?.status)).map(item=>({...item,due:dateKey(item?.dueDate),amount:Number(item?.amountSatang||0)})).filter(item=>item.due&&Number.isSafeInteger(item.amount)&&item.amount>0).sort((a,b)=>a.due.localeCompare(b.due));
  let cumulative=0;let pressureSatang=0;const available=Math.max(0,Number.isSafeInteger(Number(balanceSatang))?Number(balanceSatang):0);
  for(const item of open){const days=dayDistance(current,item.due);if(!Number.isFinite(days)||days>7)continue;cumulative+=item.amount;const uncovered=Math.max(0,cumulative-available);const dailyNeed=uncovered===0?0:Math.ceil(uncovered/Math.max(1,days));pressureSatang=Math.max(pressureSatang,roundGoal(dailyNeed));}
  return {goalSatang:Math.max(baselineSatang,pressureSatang),baselineSatang,pressureSatang};
}

const ATTENTION_RANK=Object.freeze({OVERDUE:100,TODAY:90,INSUFFICIENT_FUNDS:85,PAYABLE_NOW:80,COLLISION:70,VERIFY:65,NEAR:60,GOAL_RISK:40});
export function projectAttention({calendarRecords=[],finance={},goal=null,today,limit=3}={}){
  const candidates=[];const current=dateKey(today);const openByDate=new Map();
  for(const record of calendarRecords){const state=deriveTimeState(record,current);const due=dateKey(record.dueDate);if(state==='OVERDUE'||state==='TODAY'||state==='NEAR')candidates.push({kind:state,rank:ATTENTION_RANK[state],title:record.title||(state==='OVERDUE'?'มีรายการเลยกำหนด':'มีรายการใกล้ถึง'),recordId:record.recordId,amountSatang:Number(record.amountSatang||0),target:{area:'CALENDAR',date:due,recordId:record.recordId}});if(!lifecycleClosed(record.status)&&due){const list=openByDate.get(due)||[];list.push(record);openByDate.set(due,list);}}
  if(Number(finance.shortfallSatang||0)>0)candidates.push({kind:'INSUFFICIENT_FUNDS',rank:ATTENTION_RANK.INSUFFICIENT_FUNDS,title:'เงินสดอาจไม่พอกับคิวภาระใกล้ถึง',amountSatang:Number(finance.shortfallSatang),target:{area:'FINANCE',focus:'near-term-pressure'}});
  const nextDue=finance.nextDue;if(nextDue?.canPayNow===true&&Number(nextDue.daysRemaining)>=0)candidates.push({kind:'PAYABLE_NOW',rank:ATTENTION_RANK.PAYABLE_NOW,title:'เงินสดถึงยอดคิวถัดไปแล้ว — พิจารณาจ่ายได้',amountSatang:Number(nextDue.amountSatang||0),target:{area:'FINANCE',focus:'near-term-pressure'}});
  for(const [date,items] of openByDate.entries())if(items.filter(item=>MONEY_QUEUE_TYPES.has(item.type)).length>1)candidates.push({kind:'COLLISION',rank:ATTENTION_RANK.COLLISION,title:'มีหลายคิวการเงินชนวันเดียวกัน',count:items.length,target:{area:'CALENDAR',date}});
  if(goal&&Number(goal.goalSatang||0)>0&&Number(goal.generatedSatang||0)<Number(goal.goalSatang)*0.25)candidates.push({kind:'GOAL_RISK',rank:ATTENTION_RANK.GOAL_RISK,title:'เป้ารายได้ที่สร้างวันนี้ยังห่าง',target:{area:'MAKE_MONEY',focus:'dashboard'}});
  return candidates.sort((a,b)=>b.rank-a.rank||String(a.target?.date||'').localeCompare(String(b.target?.date||''))).slice(0,Math.max(0,limit));
}

function keyFromUTCDate(date){return `${date.getUTCFullYear()}-${String(date.getUTCMonth()+1).padStart(2,'0')}-${String(date.getUTCDate()).padStart(2,'0')}`;}
function strongestState(items,today){const priority={OVERDUE:6,TODAY:5,NEAR:4,FUTURE:3,COMPLETED:2,CANCELLED:1};let best=null;for(const item of items){const state=deriveTimeState(item,today);if(!best||priority[state]>priority[best])best=state;}return best;}
export function buildMonthGrid({year,monthIndex,calendarRecords=[],today}={}){
  const first=new Date(Date.UTC(Number(year),Number(monthIndex),1));if(Number.isNaN(first.getTime()))throw new Error('INVALID_MONTH');const start=new Date(first.getTime()-first.getUTCDay()*DAY_MS);const grouped=new Map();
  for(const record of calendarRecords){const key=dateKey(record.dueDate||record.date||record.scheduledDate);if(!key)continue;const list=grouped.get(key)||[];list.push(record);grouped.set(key,list);}
  const current=dateKey(today);const cells=[];for(let index=0;index<42;index+=1){const date=new Date(start.getTime()+index*DAY_MS);const key=keyFromUTCDate(date);const items=grouped.get(key)||[];const openMoney=items.filter(item=>!lifecycleClosed(item.status)&&MONEY_QUEUE_TYPES.has(item.type));cells.push({date:key,day:date.getUTCDate(),inMonth:date.getUTCMonth()===Number(monthIndex),isToday:key===current,count:items.length,collision:openMoney.length>1,state:items.length?strongestState(items,current):null,recordIds:items.map(item=>item.recordId)});}
  return {year:Number(year),monthIndex:Number(monthIndex),cells};
}
