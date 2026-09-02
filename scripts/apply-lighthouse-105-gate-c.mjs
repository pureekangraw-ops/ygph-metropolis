import { readFileSync, writeFileSync } from 'node:fs';

const path='ui/manual-finance-ui.mjs';
let source=readFileSync(path,'utf8');
if(source.includes("schedule.prepend(calDisclosure)")&&!source.includes('manualCalendarViews'))process.exit(0);

const calendarStart=source.indexOf("  const calendar = node(documentRef, 'section', { className:'manual-house', 'aria-labelledby':'manualCalendarTitle' });");
const ledgerStart=source.indexOf("  const ledger = node(documentRef, 'section', { className:'manual-house', 'aria-labelledby':'manualLedgerTitle' });");
if(calendarStart<0||ledgerStart<0||ledgerStart<=calendarStart)throw new Error('Gate C: Calendar creation block not found');

const creation=`  const calDisclosure = disclosure(documentRef, '+ สร้างรายการ');
  const calForm = node(documentRef, 'form', { id:'calendarItemForm', className:'stack' });
  const cTitle = field(documentRef, 'รายการ ', 'title', { required:true });
  const cDue = field(documentRef, 'วันที่ ', 'dueDate', { required:true, type:'date' });
  const cMore = disclosure(documentRef);
  const cType = field(documentRef, 'ชนิด ', 'type', { select:[['APPOINTMENT','Appointment'],['TODO','Todo'],['DEBT_FOLLOW_UP','Debt Follow-up']] });
  const cDetail = field(documentRef, 'รายละเอียด ', 'detail');
  cMore.append(cType.label, cDetail.label);
  calForm.append(cTitle.label, cDue.label, cMore, node(documentRef, 'button', { type:'submit' }, 'สร้างรายการ'));
  calDisclosure.append(calForm);
  const calendarDetail = node(documentRef, 'div', { id:'manualCalendarDetail', className:'manual-record-detail', dataset:{ recordDetail:'calendar' }, hidden:true });

`;
source=source.slice(0,calendarStart)+creation+source.slice(ledgerStart);

const duplicateRender=/\n      const \[todayItems,upcoming,overdue\]=await Promise\.all\(\[manual\.calendarToday\(\),manual\.calendarUpcoming\(\),manual\.calendarOverdue\(\)\]\);\n      const c=documentRef\.getElementById\('manualCalendarViews'\); c\.textContent='';\n      for\(const \[label,items\] of \[\['Today',todayItems\],\['Upcoming',upcoming\],\['Overdue',overdue\]\]\)\{[\s\S]*?\n      \}\n/;
if(!duplicateRender.test(source))throw new Error('Gate C: duplicate Calendar render block not found');
source=source.replace(duplicateRender,'\n');

const mountOld=`  root.append(income, outcome, calendar, ledger, sheet);\n  const schedule = documentRef.getElementById('financeSchedule');\n  if (schedule) schedule.before(root); else financePage.append(root);`;
const mountNew=`  root.append(income, outcome, ledger, sheet);\n  const schedule = documentRef.getElementById('financeSchedule');\n  if (schedule) {\n    schedule.prepend(calDisclosure);\n    schedule.append(calendarDetail);\n    schedule.before(root);\n  } else financePage.append(root);`;
if(!source.includes(mountOld))throw new Error('Gate C: legacy Calendar mount block not found');
source=source.replace(mountOld,mountNew);

if(source.includes('manualCalendarViews'))throw new Error('Gate C: duplicate Calendar list survived patch');
writeFileSync(path,source);
