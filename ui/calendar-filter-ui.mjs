const CATEGORY_LABELS=Object.freeze({
  finance:new Set(['เงินเข้า–ออก','ภาระ','ค่าใช้จ่ายวิ่ง','เบิกเครดิต','รับเงินลูกค้า','จ่ายภาระ','จ่ายงวด']),
  work:new Set(['รอบวิ่ง','งานวิ่ง']),
});

function categoryForItem(item){
  const meta=item.querySelector('.muted');
  const label=String(meta?.textContent||'').split(' · ')[0].trim();
  if(CATEGORY_LABELS.finance.has(label))return 'finance';
  if(CATEGORY_LABELS.work.has(label))return 'work';
  return 'other';
}

export function installCalendarCategoryFilter(){
  const list=document.getElementById('calendarList');
  if(!list)return false;
  let active='all';
  let applying=false;

  function apply(){
    if(applying)return;
    applying=true;
    for(const item of list.querySelectorAll('[data-calendar-record-id]')){
      const category=categoryForItem(item);
      item.dataset.calendarCategory=category;
      item.hidden=active!=='all'&&category!==active;
    }
    applying=false;
  }

  globalThis.addEventListener('lighthouse:calendar-filter',event=>{
    const next=String(event.detail?.filter||'all');
    active=['all','finance','work','other'].includes(next)?next:'all';
    apply();
  });

  const observer=new MutationObserver(apply);
  observer.observe(list,{childList:true,subtree:false});
  apply();
  return true;
}
