import { createNavigationState, navigateTop, openManualHouse } from './navigation-state.mjs';
import { renderBrowserShell } from './browser-shell.mjs';

function requireRoot(root) {
  if (!root || typeof root.addEventListener !== 'function' || typeof root.removeEventListener !== 'function') {
    throw new Error('BROWSER_APP_ROOT_REQUIRED');
  }
  return root;
}

function settingsMethodName(action) {
  return action === 'check-update' ? 'checkUpdate' : action;
}

export function createBrowserApp({ root, initialRoute, model = {}, chatController = null } = {}) {
  const target = requireRoot(root);
  let routeState = initialRoute ? Object.freeze({ ...initialRoute }) : createNavigationState();
  let started = false;
  let pollTimer = null;
  let settingsState = Object.freeze({ ...(model.settings || {}) });
  let chatState = chatController?.snapshot?.() || model.chat || {};
  let chatBusy = false;
  let editingMessageId = null;
  let submitSequence = 0;

  function scrollLatestMessage() {
    if (routeState.top !== 'chat' || typeof target.querySelectorAll !== 'function') return;
    const messages = target.querySelectorAll('[data-chat-message]');
    const latest = messages?.[messages.length - 1];
    latest?.scrollIntoView?.({ block:'end' });
  }

  function pruneUnavailableSettingsActions() {
    if (routeState.top !== 'settings' || typeof target.querySelectorAll !== 'function') return;
    const operations = settingsState.operations || {};
    const buttons = target.querySelectorAll('[data-settings-action]');
    for (const button of buttons || []) {
      const action = button?.dataset?.settingsAction;
      const methodName = settingsMethodName(action);
      const supported = typeof operations?.[methodName] === 'function'
        && (action !== 'rollback' || settingsState.rollbackSupported === true);
      if (!supported) button?.remove?.();
    }
  }

  function render() {
    target.innerHTML = renderBrowserShell({
      route:routeState,
      chat:chatState,
      manual:model.manual || {},
      income:model.income || {},
      outcome:model.outcome || {},
      calendar:model.calendar || {},
      ledger:model.ledger || {},
      settings:settingsState,
    });
    pruneUnavailableSettingsActions();
    queueMicrotask(scrollLatestMessage);
  }

  function refreshChat(next = null) {
    chatState = next || chatController?.snapshot?.() || chatState;
    render();
  }

  function updateUpdaterStatus(next) {
    settingsState = Object.freeze({ ...settingsState, updaterStatus:next || null });
    render();
  }

  async function executeUpdaterAction(action) {
    const operations = settingsState.operations || {};
    const methodName = action === 'start' ? 'startUpdate' : action;
    const operation = operations?.[methodName];
    if (typeof operation !== 'function') return;
    const result = await operation.call(operations);
    updateUpdaterStatus(result);
  }

  function ensurePolling() {
    if (pollTimer || typeof settingsState?.operations?.readStatus !== 'function') return;
    pollTimer = setInterval(async () => {
      if (!started || routeState.top !== 'settings') return;
      const state = settingsState?.updaterStatus?.state;
      if (!['Downloading','Paused','Retrying','Verifying','Installing','permission-required'].includes(state)) return;
      try {
        const next = await settingsState.operations.readStatus();
        if (next) updateUpdaterStatus(next);
      } catch {
        // Updater controller owns truthful failure projection.
      }
    }, 1000);
  }

  function composerInput() {
    return typeof target.querySelector === 'function' ? target.querySelector('[data-chat-input]') : null;
  }

  async function onSubmit(event) {
    const form = event?.target;
    if (!form?.matches?.('[data-chat-form]') || !chatController || chatBusy) return;
    event.preventDefault?.();
    const input = form.querySelector?.('[data-chat-input]') || composerInput();
    const text = String(input?.value || '').trim();
    if (!text) return;
    chatBusy = true;
    try {
      const next = editingMessageId
        ? await chatController.edit(editingMessageId, text)
        : await chatController.send(text, { submitToken:`ui-submit-${++submitSequence}` });
      editingMessageId = null;
      if (input) input.value = '';
      refreshChat(next);
    } finally {
      chatBusy = false;
    }
  }

  function onKeyDown(event) {
    const input = event?.target;
    if (!input?.matches?.('[data-chat-input]')) return;
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault?.();
      input.closest?.('[data-chat-form]')?.requestSubmit?.();
    }
  }

  function routeHistoryState() {
    return { lighthouseRoute:{ top:routeState.top, manualHouse:routeState.manualHouse || null } };
  }

  function pushRouteHistory() {
    const history = globalThis.window?.history;
    if (history && typeof history.pushState === 'function') history.pushState(routeHistoryState(), '');
  }

  function replaceRouteHistory() {
    const history = globalThis.window?.history;
    if (history && typeof history.replaceState === 'function') history.replaceState(routeHistoryState(), '');
  }

  function restoreRoute(value) {
    const desired = value?.lighthouseRoute;
    let next = createNavigationState();
    if (desired?.top) next = navigateTop(next, desired.top);
    if (next.top === 'manual' && desired?.manualHouse) next = openManualHouse(next, desired.manualHouse);
    routeState = next;
    render();
    if (routeState.top === 'settings') ensurePolling();
  }

  function onPopState(event) {
    restoreRoute(event?.state || null);
  }

  async function onClick(event) {
    const top = event?.target?.closest?.('[data-top-route]');
    if (top?.dataset?.topRoute) {
      event.preventDefault?.();
      const next = navigateTop(routeState, top.dataset.topRoute);
      if (next !== routeState) {
        routeState = next;
        pushRouteHistory();
        render();
        if (routeState.top === 'settings') ensurePolling();
      }
      return;
    }

    const chatAction = event?.target?.closest?.('[data-chat-action]');
    if (chatAction?.dataset?.chatAction && chatController) {
      event.preventDefault?.();
      const action = chatAction.dataset.chatAction;
      const messageId = chatAction.dataset.chatMessageId;
      if (action === 'edit') {
        editingMessageId = messageId;
        const pending = chatController.snapshot().pending;
        const input = composerInput();
        if (input) {
          input.value = pending?.messageId === messageId ? pending.rawText : '';
          input.focus?.();
        }
        return;
      }
      const operation = chatController[action];
      if (typeof operation === 'function') {
        const next = await operation(messageId);
        refreshChat(next);
      }
      return;
    }

    const house = event?.target?.closest?.('[data-manual-house]');
    if (house?.dataset?.manualHouse) {
      event.preventDefault?.();
      const next = openManualHouse(routeState, house.dataset.manualHouse);
      if (next !== routeState) {
        routeState = next;
        pushRouteHistory();
        render();
      }
      return;
    }

    const settingsAction = event?.target?.closest?.('[data-settings-action]');
    if (settingsAction?.dataset?.settingsAction) {
      event.preventDefault?.();
      const action = settingsAction.dataset.settingsAction;
      const operations = settingsState.operations || {};
      const methodName = settingsMethodName(action);
      const operation = operations?.[methodName];
      if (typeof operation === 'function') {
        const result = await operation.call(operations);
        if (action === 'check-update') updateUpdaterStatus(result);
      }
      return;
    }

    const updaterAction = event?.target?.closest?.('[data-updater-action]');
    if (updaterAction?.dataset?.updaterAction) {
      event.preventDefault?.();
      await executeUpdaterAction(updaterAction.dataset.updaterAction);
      ensurePolling();
    }
  }

  function syncVisualViewport() {
    const viewport = globalThis.window?.visualViewport;
    const height = viewport?.height || globalThis.window?.innerHeight;
    if (Number.isFinite(height)) globalThis.document?.documentElement?.style?.setProperty('--lh-visual-viewport-height', `${Math.round(height)}px`);
    scrollLatestMessage();
  }

  function bindViewport() {
    globalThis.window?.visualViewport?.addEventListener?.('resize', syncVisualViewport);
    globalThis.window?.visualViewport?.addEventListener?.('scroll', syncVisualViewport);
    syncVisualViewport();
  }

  function unbindViewport() {
    globalThis.window?.visualViewport?.removeEventListener?.('resize', syncVisualViewport);
    globalThis.window?.visualViewport?.removeEventListener?.('scroll', syncVisualViewport);
  }

  function bindHistory() {
    const win = globalThis.window;
    if (win && typeof win.addEventListener === 'function') win.addEventListener('popstate', onPopState);
    replaceRouteHistory();
  }

  function unbindHistory() {
    const win = globalThis.window;
    if (win && typeof win.removeEventListener === 'function') win.removeEventListener('popstate', onPopState);
  }

  return Object.freeze({
    start() {
      if (!started) {
        target.addEventListener('click', onClick);
        target.addEventListener('submit', onSubmit);
        target.addEventListener('keydown', onKeyDown);
        started = true;
        bindViewport();
        bindHistory();
      }
      refreshChat();
      ensurePolling();
    },
    stop() {
      if (started) {
        target.removeEventListener('click', onClick);
        target.removeEventListener('submit', onSubmit);
        target.removeEventListener('keydown', onKeyDown);
        unbindViewport();
        unbindHistory();
        started = false;
      }
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
    },
    route() { return Object.freeze({ ...routeState }); },
    setUpdaterStatus(next) { updateUpdaterStatus(next); },
    render,
  });
}
