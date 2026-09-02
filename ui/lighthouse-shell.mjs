import { hydrateIcons } from './icons.mjs';

const PAGE = Object.freeze({ CHAT:'chat', MANUAL:'manual', SETTINGS:'settings' });
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
      <p>เปิดข้อมูลจริงและเครื่องมือเดิมของแอปจากที่เดียว</p>
    </div>
    <div class="lighthouse-manual-grid">
      ${manualTile({ icon:'trend-up', title:'รายรับ', copy:'ดูและจัดการเงินเข้า', destination:'finance', target:'incomeForm' })}
      ${manualTile({ icon:'wallet', title:'รายจ่าย', copy:'ดูและจัดการเงินออก', destination:'finance', target:'expenseForm' })}
      ${manualTile({ icon:'wallet', title:'สมุดบัญชี', copy:'Ledger และเงินจริง', destination:'finance', target:'ledgerList' })}
      ${manualTile({ icon:'calendar-dots', title:'ปฏิทิน', copy:'กำหนดเวลาและรายการที่ต้องทำ', destination:'finance', target:'financeSchedule' })}
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
  button.innerHTML = '<svg data-icon="arrow-left"></svg><span>MANUAL</span>';
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
    <button type="button" data-lighthouse-nav="manual" aria-label="แมนนวล"><svg data-icon="wallet"></svg><span>MANUAL</span></button>
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

  const setPage = (page, { manualDetail = false } = {}) => {
    if (!Object.values(PAGE).includes(page)) return;
    workspace.dataset.lighthouseView = page;
    workspace.dataset.lighthouseManualMode = manualDetail ? 'detail' : 'hub';
    nav.querySelectorAll('[data-lighthouse-nav]').forEach(button => {
      const active = button.dataset.lighthouseNav === page;
      button.classList.toggle('active', active);
      if (active) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });
    if (page === PAGE.SETTINGS) openSettingsPage();
    else closeSettingsPage();
    if (!manualDetail) requestAnimationFrame(() => window.scrollTo({ top:0, behavior:'smooth' }));
  };

  nav.addEventListener('click', event => {
    const button = event.target.closest('[data-lighthouse-nav]');
    if (!button) return;
    setPage(button.dataset.lighthouseNav);
  });

  $('manualHub')?.addEventListener('click', event => {
    const tile = event.target.closest('[data-manual-destination]');
    if (!tile) return;
    setPage(PAGE.MANUAL, { manualDetail:true });
    const destination = tile.dataset.manualDestination;
    const existing = document.querySelector(`.command-nav-btn[data-command-destination="${destination}"]`);
    existing?.click();
    scrollToExistingTarget(tile.dataset.manualTarget);
  });

  $('lighthouseManualBack')?.addEventListener('click', () => setPage(PAGE.MANUAL));

  const workspaceObserver = new MutationObserver(() => {
    if (!workspace.classList.contains('hidden') && !workspace.dataset.lighthouseView) setPage(PAGE.CHAT);
  });
  workspaceObserver.observe(workspace, { attributes:true, attributeFilter:['class'] });

  if (!workspace.classList.contains('hidden')) setPage(PAGE.CHAT);
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
