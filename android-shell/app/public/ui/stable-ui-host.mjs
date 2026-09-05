import { createAppFrame } from './app-frame.mjs';
import { createManualAppShelf } from './manual-app-shelf.mjs';
import { createSettingsUpdatePanel } from './settings-update-panel.mjs';

function owner(value, name, methods = []) {
  if (!value || typeof value !== 'object') throw new TypeError(`STABLE_UI_${name}_OWNER_REQUIRED`);
  for (const method of methods) {
    if (typeof value[method] !== 'function') throw new TypeError(`STABLE_UI_${name}_METHOD_REQUIRED:${method}`);
  }
  return value;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
}

function requestId() {
  const uuid = globalThis.crypto?.randomUUID?.();
  return uuid ? `UI-CHAT-${uuid}` : `UI-CHAT-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function installStyle(document) {
  if (document.getElementById('lighthouse-stable-ui-style')) return;
  const style = document.createElement('style');
  style.id = 'lighthouse-stable-ui-style';
  style.textContent = `
    :root{color-scheme:light;background:#f7f7f2;color:#17352b;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
    body{margin:0;background:#f7f7f2;color:#17352b}
    .patch-controls{display:none!important}
    .lighthouse-canvas{height:var(--app-viewport-height,100vh);display:grid;grid-template-rows:auto minmax(0,1fr) auto;background:#f7f7f2}
    [data-role="app-header"]{display:flex;align-items:center;gap:.75rem;padding:max(env(safe-area-inset-top),.75rem) 1rem .75rem;border-bottom:1px solid #dfe6df;background:#fff}
    [data-role="app-header"] strong{font-size:1rem;letter-spacing:.04em}
    [data-role="app-header"] button,[data-role="bottom-nav"] button,.stable-ui button{min-height:44px;border:0;border-radius:14px;padding:.65rem .9rem;font:inherit;font-weight:700;background:#e8efe9;color:#17352b}
    [data-role="content-viewport"]{overflow:auto;padding:1rem;-webkit-overflow-scrolling:touch}
    [data-role="bottom-nav"]{display:grid;grid-template-columns:repeat(3,1fr);gap:.5rem;padding:.65rem 1rem max(env(safe-area-inset-bottom),.65rem);border-top:1px solid #dfe6df;background:#fff}
    [data-role="bottom-nav"] button[aria-current]{background:#1f5d46;color:#fff}
    .stable-ui{max-width:46rem;margin:0 auto}
    .stable-ui h1{margin:.25rem 0 1rem;font-size:1.35rem}.stable-ui h2{font-size:1rem;margin:1rem 0 .5rem}
    .stable-card,[data-module-id]{padding:.9rem;border:1px solid #dfe6df;border-radius:18px;background:#fff;margin:.65rem 0}
    [data-module-id] button{width:100%;display:flex;justify-content:space-between;align-items:center;background:transparent;padding:.2rem;text-align:left}
    [data-module-id] span{font-size:.8rem;font-weight:500;color:#66796f}
    .stable-chat-log{display:grid;gap:.6rem;margin-bottom:1rem}.stable-chat-item{padding:.75rem .85rem;border-radius:16px;background:#fff;border:1px solid #dfe6df;overflow-wrap:anywhere}
    .stable-chat-form{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:.55rem;position:sticky;bottom:0;background:#f7f7f2;padding:.5rem 0}
    .stable-chat-form input{min-height:44px;border:1px solid #cbd8d0;border-radius:14px;padding:.6rem .8rem;font:inherit;background:#fff}
    .stable-status{min-height:1.2rem;color:#66796f;font-size:.85rem}.stable-error{color:#a33232}
  `;
  document.head.append(style);
}

function responseText(record) {
  const response = record?.response;
  if (!response) return record?.errorCode ? `ผิดพลาด: ${record.errorCode}` : String(record?.status || '');
  const readback = response?.result?.readback;
  if (typeof readback === 'string') return readback;
  if (readback?.message) return String(readback.message);
  if (readback?.title) return String(readback.title);
  return response.status === 'SUCCESS' ? 'สำเร็จ' : String(response.status || '');
}

export async function mountStableUi({ window, document, services } = {}) {
  if (!window || !document) throw new TypeError('STABLE_UI_DOM_REQUIRED');
  services = owner(services, 'SERVICES');
  const chat = owner(services.chat, 'CHAT', ['getState','dispatch']);
  const modules = owner(services.modules, 'MODULES', ['list','open']);
  const session = owner(services.session, 'SESSION', ['lock']);
  const backup = owner(services.backup, 'BACKUP', ['exportBackup']);
  const updates = owner(services.updates, 'UPDATES', ['snapshot']);

  installStyle(document);
  const app = document.querySelector('#app');
  if (!app) throw new Error('STABLE_UI_ROOT_MISSING');
  const frame = createAppFrame({ window, document });
  const content = app.querySelector('[data-role="content-viewport"]');
  const nav = app.querySelector('[data-role="bottom-nav"]');
  const back = app.querySelector('[data-action="back"]');
  let disposed = false;
  let updateJobId = null;

  async function renderChat() {
    const state = await chat.getState();
    const records = Array.isArray(state?.order) ? state.order.map(id => state.requests?.[id]).filter(Boolean) : [];
    content.innerHTML = `<section class="stable-ui" data-screen="CHAT"><h1>CHAT</h1><div class="stable-chat-log" data-role="stable-chat-log">${records.length ? records.map(record => `<div class="stable-chat-item" data-request-id="${escapeHtml(record.requestId)}">${escapeHtml(responseText(record))}</div>`).join('') : '<p class="stable-status" data-empty-chat>เริ่มคุยกับ LIGHTHOUSE ได้เลย</p>'}</div><form class="stable-chat-form" data-role="stable-chat-form"><input name="message" autocomplete="off" aria-label="ข้อความ" placeholder="พิมพ์ข้อความ…" required><button type="submit">ส่ง</button></form><p class="stable-status" data-role="chat-status"></p></section>`;
    const form = content.querySelector('[data-role="stable-chat-form"]');
    const status = content.querySelector('[data-role="chat-status"]');
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const input = form.elements.message;
      const text = String(input.value || '').trim();
      if (!text) return;
      const button = form.querySelector('button');
      button.disabled = true;
      status.textContent = 'กำลังส่ง…';
      try {
        await chat.dispatch({ requestId:requestId(), route:'PROVIDER', payload:{ text } });
        if (!disposed) await renderChat();
      } catch (error) {
        status.classList.add('stable-error');
        status.textContent = String(error?.message || error);
        button.disabled = false;
      }
    });
    return state;
  }

  let manual = null;
  async function renderManual() {
    if (!manual) {
      manual = createManualAppShelf({
        window,
        document,
        root:content,
        modules,
        async navigate({ descriptor }) {
          frame.push({ tab:'MANUAL', route:`module/${descriptor.moduleId}`, title:descriptor.name || descriptor.moduleId });
          content.innerHTML = `<section class="stable-ui" data-screen="MODULE"><div class="stable-card"><h1>${escapeHtml(descriptor.name || descriptor.moduleId)}</h1><p>เปิดผ่าน Module Registry แล้ว</p></div></section>`;
        },
      });
    }
    return manual.render();
  }

  async function renderSettings() {
    content.innerHTML = '<section class="stable-ui" data-screen="SETTINGS"><h1>SETTINGS</h1><div class="stable-card"><h2>ข้อมูล</h2><button type="button" data-action="backup">สำรองข้อมูล</button><p class="stable-status" data-role="backup-status"></p></div><div class="stable-card" data-role="update-card"><h2>อัปเดตแอป</h2><p class="stable-status" data-role="update-waiting">พร้อมตรวจสถานะเมื่อมีงานอัปเดต</p></div><div class="stable-card"><button type="button" data-action="lock">ล็อกแอป</button></div></section>';
    const backupStatus = content.querySelector('[data-role="backup-status"]');
    content.querySelector('[data-action="backup"]').addEventListener('click', async event => {
      event.currentTarget.disabled = true;
      backupStatus.textContent = 'กำลังสำรอง…';
      try {
        const artifact = await backup.exportBackup();
        backupStatus.textContent = artifact?.artifactHash ? 'สำรองข้อมูลและตรวจหลักฐานแล้ว' : 'สำรองข้อมูลแล้ว';
      } catch (error) {
        backupStatus.classList.add('stable-error');
        backupStatus.textContent = String(error?.message || error);
      } finally {
        event.currentTarget.disabled = false;
      }
    });
    content.querySelector('[data-action="lock"]').addEventListener('click', () => { void session.lock(); });
    if (updateJobId) await renderUpdate(updateJobId);
  }

  async function renderUpdate(jobId) {
    updateJobId = String(jobId || '').trim();
    if (!updateJobId) throw new Error('STABLE_UI_UPDATE_JOB_REQUIRED');
    if (frame.current().tab !== 'SETTINGS') return updates.snapshot(updateJobId);
    const card = content.querySelector('[data-role="update-card"]');
    if (!card) return null;
    const snapshot = await updates.snapshot(updateJobId);
    card.querySelector('[data-role="update-waiting"]')?.remove();
    let panel = card.querySelector('.settings-update-panel');
    let controller;
    if (!panel) {
      controller = createSettingsUpdatePanel({ document, onAction:async action => {
        if (action === 'pause') await updates.pause?.(updateJobId);
        else if (action === 'resume' || action === 'retry') await updates.resume?.(updateJobId);
        else if (action === 'cancel') await updates.cancel?.(updateJobId);
        else if (action === 'install' || action === 'permission') await updates.install?.(updateJobId);
        await renderUpdate(updateJobId);
      }});
      panel = controller.element;
      card.append(panel);
    } else {
      controller = createSettingsUpdatePanel({ document });
      controller = null;
    }
    const active = controller || createSettingsUpdatePanel({ document });
    if (!controller) {
      const fresh = active.render(snapshot);
      panel.replaceWith(fresh);
    } else controller.render(snapshot);
    return snapshot;
  }

  async function renderRoot(tab) {
    if (disposed) return null;
    if (tab === 'MANUAL') return renderManual();
    if (tab === 'SETTINGS') return renderSettings();
    return renderChat();
  }

  async function selectRoot(tab) {
    const entry = frame.selectRoot(tab);
    await renderRoot(entry.tab);
    return entry;
  }

  const onNav = event => {
    const button = event.target.closest?.('[data-tab]');
    if (button) void renderRoot(button.dataset.tab);
  };
  const onBack = () => { void renderRoot(frame.current().tab); };
  nav.addEventListener('click', onNav);
  back.addEventListener('click', onBack);

  await renderChat();

  return Object.freeze({
    frame,
    selectRoot,
    renderUpdate,
    current:frame.current,
    close() {
      if (disposed) return;
      disposed = true;
      nav.removeEventListener('click', onNav);
      back.removeEventListener('click', onBack);
    },
  });
}
