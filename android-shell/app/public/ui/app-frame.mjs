const ROOT_TABS = Object.freeze(['CHAT', 'MANUAL', 'SETTINGS']);

function normalizeTab(value) {
  const tab = String(value || '').toUpperCase();
  if (!ROOT_TABS.includes(tab)) throw new Error(`APP_FRAME_INVALID_TAB:${tab}`);
  return tab;
}

function rootEntry(tab) {
  return { tab, route:tab, title:tab, depth:0 };
}

export function createAppFrame({ window, document } = {}) {
  if (!window || !document) throw new TypeError('APP_FRAME_WINDOW_DOCUMENT_REQUIRED');
  const app = document.querySelector('#app');
  if (!app) throw new Error('APP_FRAME_ROOT_MISSING');

  const history = [rootEntry('CHAT')];
  let index = 0;

  app.classList.add('lighthouse-canvas', 'safe-area-owner');
  app.innerHTML = `
    <header data-role="app-header"><button type="button" data-action="back" hidden>Back</button><strong data-role="title">CHAT</strong></header>
    <main data-role="content-viewport" tabindex="-1"></main>
    <nav data-role="bottom-nav" aria-label="Primary">
      <button type="button" data-tab="CHAT">CHAT</button>
      <button type="button" data-tab="MANUAL">MANUAL</button>
      <button type="button" data-tab="SETTINGS">SETTINGS</button>
    </nav>`;

  document.documentElement.style.overflow = 'hidden';
  document.body.style.overflow = 'hidden';

  const titleNode = app.querySelector('[data-role="title"]');
  const backButton = app.querySelector('[data-action="back"]');

  function current() {
    return structuredClone(history[index]);
  }

  function render() {
    const entry = history[index];
    titleNode.textContent = entry.title || entry.tab;
    backButton.hidden = entry.depth === 0;
    for (const node of app.querySelectorAll('[data-tab]')) node.toggleAttribute('aria-current', node.dataset.tab === entry.tab);
  }

  function replaceHistory(entry) {
    history.splice(index + 1);
    history.push(entry);
    index = history.length - 1;
    render();
  }

  function selectRoot(value) {
    const tab = normalizeTab(value);
    const now = history[index];
    if (now.tab === tab && now.depth === 0) {
      app.querySelector('[data-role="content-viewport"]')?.scrollTo?.({ top:0 });
      return current();
    }
    replaceHistory(rootEntry(tab));
    return current();
  }

  function push(route) {
    const tab = normalizeTab(route?.tab || history[index].tab);
    const value = String(route?.route || '').trim();
    if (!value) throw new Error('APP_FRAME_ROUTE_REQUIRED');
    replaceHistory({ tab, route:value, title:String(route?.title || tab), depth:history[index].depth + 1 });
    return current();
  }

  function back() {
    if (index > 0) index -= 1;
    render();
    return current();
  }

  function syncViewport() {
    const height = Number(window.visualViewport?.height || window.innerHeight || 0);
    if (height > 0) document.documentElement.style.setProperty('--app-viewport-height', `${Math.round(height)}px`);
  }

  backButton.addEventListener('click', () => back('HEADER'));
  app.querySelector('[data-role="bottom-nav"]').addEventListener('click', event => {
    const button = event.target.closest?.('[data-tab]');
    if (button) selectRoot(button.dataset.tab);
  });
  window.visualViewport?.addEventListener?.('resize', syncViewport);
  window.visualViewport?.addEventListener?.('scroll', syncViewport);

  syncViewport();
  render();

  return Object.freeze({ current, selectRoot, push, back, syncViewport });
}
