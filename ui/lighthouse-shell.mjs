import { hydrateIcons } from './icons.mjs';

const PAGE = Object.freeze({ CHAT:'chat', MANUAL:'manual', SETTINGS:'settings' });
const MANUAL_DESTINATIONS = Object.freeze({
  finance:Object.freeze({ command:'finance' }),
  store:Object.freeze({ command:'store' }),
  ride:Object.freeze({ command:'ride' }),
});
const LIGHTHOUSE_HISTORY_KEY='__lighthouseNavigation';
const $ = id => document.getElementById(id);

function ensureStylesheet() {
  if (document.querySelector('link[data-lighthouse-style]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = './lighthouse.css';
  link.dataset.lighthouseStyle = 'true';
  document.head.append(link);
}

function applyBrand() {
  document.title = 'LIGHTHOUSE';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', '#eaf3f9');
  const title = document.querySelector('.brand-lockup strong');
  if (title) title.textContent = 'LIGHTHOUSE';
  const mark = $('brandHomeMark');
  if (mark && !mark.classList.contains('lighthouse-mini-mark')) {
    mark.className = 'lighthouse-mini-mark';
    mark.replaceChildren();
    for (const className of ['lighthouse-mini-light','lighthouse-mini-tower','lighthouse-mini-sea']) {
      const part = document.createElement('i');
      part.className = className;
      mark.append(part);
    }
  }
}

function createBackground() {
  if (document.querySelector('.lighthouse-wave')) return;
  const scene = document.createElement('div');
  scene.className = 'lighthouse-wave';
  scene.setAttribute('aria-hidden', 'true');
  scene.innerHTML = '<span class="lighthouse-beacon"></span><span class="lighthouse-shore"></span>';
  document.body.prepend(scene);
}

function manualTile({ icon, title, copy, destination, target = '' }) {
  return `<button type="button" class="lighthouse-manual-tile" data-manual-destination="${destination}" data-manual-target="${target}">
    <span class="lighthouse-tile-icon"><svg data-icon="${icon}"></svg></span>
    <span><strong>${title}</strong><small>${copy}</small></span>
    <span class="lighthouse-chevron" aria-hidden="true">›</span>
  </button>`;
}

function createManualHub(workspace) {
  if ($('manualHub')) return $('manualHub');
  const hub = document.createElement('section');
  hub.id = 'manualHub';
  hub.className = 'lighthouse-page lighthouse-manual-hub';
  hub.setAttribute('data-lighthouse-page', PAGE.MANUAL);
  hub.innerHTML = `
    <div class="lighthouse-page-head">
      <small>MANUAL</small>
      <h1>จัดการข้อมูล</h1>
      <p>เลือกข้อมูลที่ต้องการดูหรือจัดการ</p>
    </div>
    <div class="lighthouse-manual-grid">
      ${manualTile({ icon:'trend-up', title:'รายรับ', copy:'ดูและจัดการเงินเข้า', destination:'finance', target:'incomeForm' })}
      ${manualTile({ icon:'wallet', title:'รายจ่าย', copy:'ดูและจัดการเงินออก', destination:'finance', target:'expenseForm' })}
      ${manualTile({ icon:'wallet', title:'สมุดบัญชี', copy:'ดูรายการเงินเข้าออก', destination:'finance', target:'ledgerList' })}
      ${manualTile({ icon:'calendar-dots', title:'ปฏิทิน', copy:'ดูวันและรายการที่ต้องทำ', destination:'finance', target:'financeSchedule' })}
      ${manualTile({ icon:'shopping-cart-simple', title:'ร้านค้า', copy:'ยอดขาย สต็อก และลูกหนี้', destination:'store' })}
      ${manualTile({ icon:'person-simple-run', title:'วิ่งงาน', copy:'รอบวิ่ง งาน และรายได้จากงาน', destination:'ride' })}
    </div>`;
  const content = workspace.querySelector('.workspace-content');
  workspace.insertBefore(hub, content || workspace.firstChild);
  hydrateIcons(hub);
  return hub;
}

function createManualBack(workspace) {
  if ($('lighthouseManualBack')) return;
  const button = document.createElement('button');
  button.id = 'lighthouseManualBack';
  button.type = 'button';
  button.className = 'lighthouse-manual-back secondary';
  button.innerHTML = '<svg data-icon="arrow-left"></svg><span>กลับ</span>';
  workspace.querySelector('.workspace-content')?.prepend(button);
  hydrateIcons(button);
}

function createBottomNav(workspace) {
  if (workspace.querySelector('.lighthouse-bottom-nav')) return workspace.querySelector('.lighthouse-bottom-nav');
  const nav = document.createElement('nav');
  nav.className = 'lighthouse-bottom-nav';
  nav.setAttribute('aria-label', 'LIGHTHOUSE navigation');
  nav.innerHTML = `
    <button type="button" data-lighthouse-nav="chat" aria-label="แชท"><svg data-icon="house-simple"></svg><span>CHAT</span></button>
    <button type="button" data-lighthouse-nav="manual" aria-label="จัดการ"><svg data-icon="wallet"></svg><span>MANUAL</span></button>
    <button type="button" data-lighthouse-nav="settings" aria-label="ตั้งค่า"><svg data-icon="gear-six"></svg><span>SETTINGS</span></button>`;
  workspace.append(nav);
  hydrateIcons(nav);
  return nav;
}

function prepareSettings() {
  const dialog = $('settingsDialog');
  if (!dialog) return;
  dialog.classList.add('lighthouse-settings-page');
  dialog.setAttribute('data-lighthouse-page', PAGE.SETTINGS);
}

function openSettingsPage() {
  const dialog = $('settingsDialog');
  if (!dialog) return;
  if (dialog.open) dialog.close();
  dialog.show();
}

function closeSettingsPage() {
  const dialog = $('settingsDialog');
  if (dialog?.open) dialog.close();
}

function scrollToExistingTarget(targetId) {
  if (!targetId) return;
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const target = $(targetId);
    if (!target) return;
    const details = target.closest('details');
    if (details) details.open = true;
    target.focus?.({ preventScroll:true });
    target.scrollIntoView({ block:'start', behavior:'smooth' });
  }));
}

function normalizeNavigationState(state={}) {
  const page=Object.values(PAGE).includes(state.page)?state.page:PAGE.CHAT;
  const manualDetail=page===PAGE.MANUAL&&state.manualDetail===true;
  const destination=manualDetail&&MANUAL_DESTINATIONS[state.destination]?state.destination:'';
  const target=destination&&typeof state.target==='string'?state.target:'';
  return Object.freeze({ page, manualDetail, destination, target });
}

function installShell() {
  const workspace = $('workspace');
  const masterInput = $('masterInputShell');
  if (!workspace || !masterInput) return false;

  document.body.classList.add('lighthouse-shell-active');
  masterInput.setAttribute('data-lighthouse-page', PAGE.CHAT);
  createManualHub(workspace);
  createManualBack(workspace);
  const nav = createBottomNav(workspace);
  prepareSettings();

  let currentState=normalizeNavigationState({page:PAGE.CHAT});
  let suppressSettingsClose=false;

  function applyNavigationState(inputState) {
    const state=normalizeNavigationState(inputState);
    currentState=state;
    workspace.dataset.lighthouseView = state.page;
    workspace.dataset.lighthouseManualMode = state.manualDetail ? 'detail' : 'hub';
    nav.querySelectorAll('[data-lighthouse-nav]').forEach(button => {
      const active = button.dataset.lighthouseNav === state.page;
      button.classList.toggle('active', active);
      if (active) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });
    suppressSettingsClose=true;
    if (state.page === PAGE.SETTINGS) openSettingsPage();
    else closeSettingsPage();
    suppressSettingsClose=false;
    if(state.manualDetail&&state.destination){
      const destination=MANUAL_DESTINATIONS[state.destination];
      const existing=document.querySelector(`.command-nav-btn[data-command-destination="${destination.command}"]`);
      existing?.click();
      scrollToExistingTarget(state.target);
    }else{
      requestAnimationFrame(() => window.scrollTo({ top:0, behavior:'smooth' }));
    }
  }

  function navigate(nextState,{replace=false}={}) {
    const state=normalizeNavigationState(nextState);
    const historyState={ [LIGHTHOUSE_HISTORY_KEY]:true, ...state };
    if(replace) history.replaceState(historyState,'',globalThis.location?.href||'');
    else history.pushState(historyState,'',globalThis.location?.href||'');
    applyNavigationState(state);
  }

  nav.addEventListener('click', event => {
    const button = event.target.closest('[data-lighthouse-nav]');
    if (!button) return;
    navigate({page:button.dataset.lighthouseNav});
  });

  $('manualHub')?.addEventListener('click', event => {
    const tile = event.target.closest('[data-manual-destination]');
    if (!tile) return;
    const destination=MANUAL_DESTINATIONS[tile.dataset.manualDestination];
    if(!destination)return;
    navigate({page:PAGE.MANUAL,manualDetail:true,destination:tile.dataset.manualDestination,target:tile.dataset.manualTarget||''});
  });

  $('lighthouseManualBack')?.addEventListener('click', () => { if(currentState.manualDetail) history.back(); else navigate({page:PAGE.MANUAL}); });

  globalThis.addEventListener('popstate', event => {
    if(!event.state?.[LIGHTHOUSE_HISTORY_KEY])return;
    applyNavigationState(event.state);
  });

  $('settingsDialog')?.addEventListener('close',()=>{
    if(suppressSettingsClose||currentState.page!==PAGE.SETTINGS)return;
    history.back();
  });

  const workspaceObserver = new MutationObserver(() => {
    if (!workspace.classList.contains('hidden') && !workspace.dataset.lighthouseView) navigate({page:PAGE.CHAT},{replace:true});
  });
  workspaceObserver.observe(workspace, { attributes:true, attributeFilter:['class'] });

  if (!workspace.classList.contains('hidden')) navigate({page:PAGE.CHAT},{replace:true});
  return true;
}

function boot() {
  ensureStylesheet();
  applyBrand();
  createBackground();
  if (installShell()) return;
  const observer = new MutationObserver(() => {
    if (!installShell()) return;
    observer.disconnect();
  });
  observer.observe(document.documentElement, { childList:true, subtree:true });
}

boot();
