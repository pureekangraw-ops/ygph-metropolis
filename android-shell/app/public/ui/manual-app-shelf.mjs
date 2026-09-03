function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
}

export function createManualAppShelf({ window, document, root, modules, navigate = () => {} } = {}) {
  if (!window || !document || !root) throw new TypeError('MANUAL_SHELF_DOM_REQUIRED');
  if (!modules || typeof modules.list !== 'function' || typeof modules.open !== 'function') throw new TypeError('MANUAL_SHELF_MODULES_REQUIRED');

  async function openModule(moduleId) {
    const result = await modules.open({ moduleId, actor:'USER', source:'UI' });
    if (!result?.opened) throw new Error('MODULE_OPEN_NOT_VERIFIED');
    await navigate({ moduleId, opened:true, descriptor:result.descriptor, revision:result.revision });
    return result;
  }

  async function render() {
    try {
      const items = await modules.list();
      root.innerHTML = `<section data-role="manual-shelf"><h1>MANUAL</h1><div data-role="manual-app-list"></div></section>`;
      const list = root.querySelector('[data-role="manual-app-list"]');
      if (!items.length) {
        list.innerHTML = '<p data-role="manual-empty">ยังไม่มีแอปที่เปิดใช้งาน</p>';
        return [];
      }
      list.innerHTML = items.map(item => `<article data-module-id="${escapeHtml(item.moduleId)}"><button type="button"><strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(item.version)}</span></button></article>`).join('');
      for (const node of list.querySelectorAll('[data-module-id]')) {
        node.querySelector('button').addEventListener('click', async () => {
          try {
            await openModule(node.dataset.moduleId);
          } catch (error) {
            node.setAttribute('data-state', 'error');
            node.setAttribute('data-error', String(error?.message || error));
          }
        });
      }
      return items;
    } catch (error) {
      root.innerHTML = `<section data-role="manual-recovery"><h1>MANUAL</h1><p>${escapeHtml(error?.message || error)}</p><button type="button" data-action="manual-retry">ลองใหม่</button></section>`;
      root.querySelector('[data-action="manual-retry"]').addEventListener('click', () => { void render(); });
      return [];
    }
  }

  return Object.freeze({ render, openModule });
}
