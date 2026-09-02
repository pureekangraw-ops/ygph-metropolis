import { hydrateIcons } from './icons.mjs';
import { installChatUI } from './chat-ui.mjs';
import { installCalendarCategoryFilter } from './calendar-filter-ui.mjs';

const PAGE=Object.freeze({CHAT:'chat',MANUAL:'manual',SETTINGS:'settings'});
const MANUAL_DESTINATIONS=Object.freeze({
  finance:Object.freeze({command:'finance'}),
  calendar:Object.freeze({command:'finance'}),
  store:Object.freeze({command:'store'}),
  ride:Object.freeze({command:'ride'}),
});
const CALENDAR_FILTERS=Object.freeze(['all','finance','work','other']);
const LIGHTHOUSE_HISTORY_KEY='__lighthouseNavigation';
const $=id=>document.getElementById(id);

function ensureStylesheet(){
  if(document.querySelector('link[data-lighthouse-style]'))return;
  const link=document.createElement('link');
  link.rel='stylesheet';
  link.href='./lighthouse.css';
  link.dataset.lighthouseStyle='true';
  document.head.append(link);
}

function applyBrand(){
  document.title='LIGHTHOUSE';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content','#eaf3f9');
  const title=document.querySelector('.brand-lockup strong');
  if(title)title.textContent='LIGHTHOUSE';
  const mark=$('brandHomeMark');
  if(mark&&!mark.classList.contains('lighthouse-mini-mark')){
    mark.className='lighthouse-mini-mark';
    mark.replaceChildren();
    for(const className of ['lighthouse-mini-light','lighthouse-mini-tower','lighthouse-mini-sea']){
      const part=document.createElement('i');
      part.className=className;
      mark.append(part);
    }
  }
}

function createBackground(){
  if(document.querySelector('.lighthouse-wave'))return;
  const scene=document.createElement('div');
  scene.className='lighthouse-wave';
  scene.setAttribute('aria-hidden','true');
  scene.innerHTML='<span class="lighthouse-beacon"></span><span class="lighthouse-shore"></span>';
  document.body.prepend(scene);
}

function manualTile({icon,title,copy,destination,target=''}){
  return `<button type="button" class="lighthouse-manual-tile" data-manual-destination="${destination}" data-manual-target="${target}">
    <span class="lighthouse-tile-icon"><svg data-icon="${icon}"></svg></span>
    <span><strong>${title}</strong><small>${copy}</small></span>
    <span class="lighthouse-chevron" aria-hidden="true">›</span>
  </button>`;
}

function createManualHub(workspace){
  if($('manualHub'))return $('manualHub');
  const hub=document.createElement('section');
  hub.id='manualHub';
  hub.className='lighthouse-page lighthouse-manual-hub';
  hub.setAttribute('data-lighthouse-page',PAGE.MANUAL);
  hub.innerHTML=`
    <div class="lighthouse-page-head"><small>MANUAL</small><h1>จัดการข้อมูล</h1><p>เลือกข้อมูลที่ต้องการดูหรือจัดการ</p></div>
    <div class="lighthouse-manual-grid">
      ${manualTile({icon:'trend-up',title:'รายรับ',copy:'ดูและจัดการเงินเข้า',destination:'finance',target:'incomeForm'})}
      ${manualTile({icon:'wallet',title:'รายจ่าย',copy:'ดูและจัดการเงินออก',destination:'finance',target:'expenseForm'})}
      ${manualTile({icon:'wallet',title:'สมุดบัญชี',copy:'ดูรายการเงินเข้าออก',destination:'finance',target:'ledgerList'})}
      ${manualTile({icon:'calendar-dots',title:'ปฏิทิน',copy:'วันและรายการทั้งหมดในบ้านเดียว',destination:'calendar',target:'financeSchedule'})}
      ${manualTile({icon:'shopping-cart-simple',title:'ร้านค้า',copy:'ยอดขาย สต็อก และลูกหนี้',destination:'store'})}
      ${manualTile({icon:'person-simple-run',title:'วิ่งงาน',copy:'รอบวิ่ง งาน และรายได้จากงาน',destination:'ride'})}
    </div>
    <div class="lighthouse-calendar-filters" aria-label="ตัวกรองปฏิทิน">
      <button type="button" data-calendar-filter="all">ทั้งหมด</button>
      <button type="button" data-calendar-filter="finance">การเงิน</button>
      <button type="button" data-calendar-filter="work">งาน</button>
      <button type="button" data-calendar-filter="other">อื่น ๆ</button>
    </div>`;
  const content=workspace.querySelector('.workspace-content');
  workspace.insertBefore(hub,content||workspace.firstChild);
  hydrateIcons(hub);
  return hub;
}

function createPageControls(workspace){
  if(workspace.querySelector('.lighthouse-page-controls'))return workspace.querySelector('.lighthouse-page-controls');
  const controls=document.createElement('div');
  controls.className='lighthouse-page-controls';
  controls.innerHTML=`<button type="button" data-lighthouse-back aria-label="กลับ">‹ <span>กลับ</span></button><button type="button" data-lighthouse-home aria-label="หน้าแรก">⌂ <span>Home</span></button>`;
  workspace.prepend(controls);
  return controls;
}

function createBottomNav(workspace){
  if(workspace.querySelector('.lighthouse-bottom-nav'))return workspace.querySelector('.lighthouse-bottom-nav');
  const nav=document.createElement('nav');
  nav.className='lighthouse-bottom-nav';
  nav.setAttribute('aria-label','LIGHTHOUSE navigation');
  nav.innerHTML=`
    <button type="button" data-lighthouse-nav="chat" aria-label="แชท"><svg data-icon="house-simple"></svg><span>CHAT</span></button>
    <button type="button" data-lighthouse-nav="manual" aria-label="จัดการ"><svg data-icon="wallet"></svg><span>MANUAL</span></button>
    <button type="button" data-lighthouse-nav="settings" aria-label="ตั้งค่า"><svg data-icon="gear-six"></svg><span>SETTINGS</span></button>`;
  workspace.append(nav);
  hydrateIcons(nav);
  return nav;
}

function createManualBack(workspace){
  if($('lighthouseManualBack'))return;
  const button=document.createElement('button');
  button.id='lighthouseManualBack';
  button.type='button';
  button.className='lighthouse-manual-back secondary';
  button.innerHTML='<svg data-icon="arrow-left"></svg><span>กลับ</span>';
  workspace.querySelector('.workspace-content')?.prepend(button);
  hydrateIcons(button);
}

function prepareSettings(){
  const dialog=$('settingsDialog');
  if(!dialog)return;
  dialog.classList.add('lighthouse-settings-page');
  dialog.setAttribute('data-lighthouse-page',PAGE.SETTINGS);
}
function openSettingsPage(){const dialog=$('settingsDialog');if(!dialog)return;if(dialog.open)dialog.close();dialog.show();}
function closeSettingsPage(){const dialog=$('settingsDialog');if(dialog?.open)dialog.close();}

function scrollToExistingTarget(targetId){
  if(!targetId)return;
  requestAnimationFrame(()=>requestAnimationFrame(()=>{
    const target=$(targetId);if(!target)return;
    const details=target.closest('details');if(details)details.open=true;
    target.focus?.({preventScroll:true});
    target.scrollIntoView({block:'start',behavior:'smooth'});
  }));
}

function normalizeNavigationState(state={}){
  const page=Object.values(PAGE).includes(state.page)?state.page:PAGE.CHAT;
  const manualDetail=page===PAGE.MANUAL&&state.manualDetail===true;
  const destination=manualDetail&&MANUAL_DESTINATIONS[state.destination]?state.destination:'';
  const target=destination&&typeof state.target==='string'?state.target:'';
  const calendarFilter=CALENDAR_FILTERS.includes(state.calendarFilter)?state.calendarFilter:'all';
  return Object.freeze({page,manualDetail,destination,target,calendarFilter});
}

function installShell(){
  const workspace=$('workspace');
  const masterInput=$('masterInputShell');
  if(!workspace||!masterInput)return false;

  document.body.classList.add('lighthouse-shell-active');
  masterInput.setAttribute('data-lighthouse-page',PAGE.CHAT);
  createManualHub(workspace);
  createManualBack(workspace);
  const controls=createPageControls(workspace);
  const nav=createBottomNav(workspace);
  prepareSettings();
  installChatUI();
  installCalendarCategoryFilter();

  let currentState=normalizeNavigationState({page:PAGE.CHAT});
  let suppressSettingsClose=false;

  function applyCalendarFilter(filter){
    workspace.dataset.calendarFilter=filter;
    document.querySelectorAll('[data-calendar-filter]').forEach(button=>{
      const active=button.dataset.calendarFilter===filter;
      button.classList.toggle('active',active);
      if(active)button.setAttribute('aria-pressed','true');else button.setAttribute('aria-pressed','false');
    });
    globalThis.dispatchEvent(new CustomEvent('lighthouse:calendar-filter',{detail:{filter}}));
  }

  function applyNavigationState(inputState){
    const state=normalizeNavigationState(inputState);
    currentState=state;
    workspace.dataset.lighthouseView=state.page;
    workspace.dataset.lighthouseManualMode=state.manualDetail?'detail':'hub';
    nav.querySelectorAll('[data-lighthouse-nav]').forEach(button=>{
      const active=button.dataset.lighthouseNav===state.page;
      button.classList.toggle('active',active);
      if(active)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');
    });
    applyCalendarFilter(state.calendarFilter);
    suppressSettingsClose=true;
    if(state.page===PAGE.SETTINGS)openSettingsPage();else closeSettingsPage();
    suppressSettingsClose=false;
    if(state.manualDetail&&state.destination){
      const destination=MANUAL_DESTINATIONS[state.destination];
      const existing=document.querySelector(`.command-nav-btn[data-command-destination="${destination.command}"]`);
      existing?.click();
      scrollToExistingTarget(state.target);
    }else{
      requestAnimationFrame(()=>window.scrollTo({top:0,behavior:'auto'}));
    }
  }

  function navigate(nextState,{replace=false}={}){
    const state=normalizeNavigationState({...nextState,calendarFilter:nextState?.calendarFilter??currentState.calendarFilter});
    const historyState={[LIGHTHOUSE_HISTORY_KEY]:true,...state};
    if(replace)history.replaceState(historyState,'',globalThis.location?.href||'');
    else history.pushState(historyState,'',globalThis.location?.href||'');
    applyNavigationState(state);
  }

  function resetCurrentTabHome(){
    if(currentState.page===PAGE.MANUAL)return navigate({page:PAGE.MANUAL,calendarFilter:currentState.calendarFilter});
    if(currentState.page===PAGE.SETTINGS)return navigate({page:PAGE.SETTINGS});
    return navigate({page:PAGE.CHAT});
  }

  function goBack(){
    if(history.state?.[LIGHTHOUSE_HISTORY_KEY])history.back();
    else resetCurrentTabHome();
  }

  nav.addEventListener('click',event=>{
    const button=event.target.closest('[data-lighthouse-nav]');if(!button)return;
    navigate({page:button.dataset.lighthouseNav});
  });

  controls.querySelector('[data-lighthouse-back]')?.addEventListener('click',goBack);
  controls.querySelector('[data-lighthouse-home]')?.addEventListener('click',resetCurrentTabHome);

  $('manualHub')?.addEventListener('click',event=>{
    const filterButton=event.target.closest('[data-calendar-filter]');
    if(filterButton){
      navigate({page:PAGE.MANUAL,manualDetail:true,destination:'calendar',target:'financeSchedule',calendarFilter:filterButton.dataset.calendarFilter});
      return;
    }
    const tile=event.target.closest('[data-manual-destination]');if(!tile)return;
    const destination=MANUAL_DESTINATIONS[tile.dataset.manualDestination];if(!destination)return;
    navigate({page:PAGE.MANUAL,manualDetail:true,destination:tile.dataset.manualDestination,target:tile.dataset.manualTarget||'',calendarFilter:currentState.calendarFilter});
  });

  $('lighthouseManualBack')?.addEventListener('click',goBack);

  globalThis.addEventListener('lighthouse:navigate',event=>{
    if(!event.detail||!Object.values(PAGE).includes(event.detail.page))return;
    navigate(event.detail);
  });

  globalThis.addEventListener('popstate',event=>{
    if(!event.state?.[LIGHTHOUSE_HISTORY_KEY])return;
    applyNavigationState(event.state);
  });

  $('settingsDialog')?.addEventListener('close',()=>{
    if(suppressSettingsClose||currentState.page!==PAGE.SETTINGS)return;
    goBack();
  });

  const workspaceObserver=new MutationObserver(()=>{
    if(!workspace.classList.contains('hidden')&&!workspace.dataset.lighthouseView)navigate({page:PAGE.CHAT},{replace:true});
  });
  workspaceObserver.observe(workspace,{attributes:true,attributeFilter:['class']});

  if(!workspace.classList.contains('hidden'))navigate({page:PAGE.CHAT},{replace:true});
  return true;
}

function boot(){
  ensureStylesheet();
  applyBrand();
  createBackground();
  if(installShell())return;
  const observer=new MutationObserver(()=>{if(!installShell())return;observer.disconnect();});
  observer.observe(document.documentElement,{childList:true,subtree:true});
}

boot();
