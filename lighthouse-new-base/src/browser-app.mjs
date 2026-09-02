import { createNavigationState, navigateTop, openManualHouse } from './navigation-state.mjs';
import { renderBrowserShell } from './browser-shell.mjs';

function requireRoot(root) {
  if (!root || typeof root.addEventListener !== 'function' || typeof root.removeEventListener !== 'function') {
    throw new Error('BROWSER_APP_ROOT_REQUIRED');
  }
  return root;
}

export function createBrowserApp({ root, initialRoute, model = {} } = {}) {
  const target = requireRoot(root);
  let routeState = initialRoute ? Object.freeze({ ...initialRoute }) : createNavigationState();
  let started = false;
  let pollTimer = null;
  let settingsState = Object.freeze({ ...(model.settings || {}) });

  function render() {
    target.innerHTML = renderBrowserShell({
      route:routeState,
      chat:model.chat || {},
      manual:model.manual || {},
      income:model.income || {},
      outcome:model.outcome || {},
      calendar:model.calendar || {},
      ledger:model.ledger || {},
      settings:settingsState,
    });
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
        // Controller owns truthful failure projection.
      }
    }, 1000);
  }

  async function onClick(event) {
    const top = event?.target?.closest?.('[data-top-route]');
    if (top?.dataset?.topRoute) {
      event.preventDefault?.();
      const next = navigateTop(routeState, top.dataset.topRoute);
      if (next !== routeState) {
        routeState = next;
        render();
        if (routeState.top === 'settings') ensurePolling();
      }
      return;
    }

    const house = event?.target?.closest?.('[data-manual-house]');
    if (house?.dataset?.manualHouse) {
      event.preventDefault?.();
      const next = openManualHouse(routeState, house.dataset.manualHouse);
      if (next !== routeState) {
        routeState = next;
        render();
      }
      return;
    }

    const settingsAction = event?.target?.closest?.('[data-settings-action]');
    if (settingsAction?.dataset?.settingsAction) {
      event.preventDefault?.();
      const action = settingsAction.dataset.settingsAction;
      const operations = settingsState.operations || {};
      const methodName = action === 'check-update' ? 'checkUpdate' : action;
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

  return Object.freeze({
    start() {
      if (!started) {
        target.addEventListener('click', onClick);
        started = true;
      }
      render();
      ensurePolling();
    },
    stop() {
      if (started) {
        target.removeEventListener('click', onClick);
        started = false;
      }
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
    },
    route() {
      return Object.freeze({ ...routeState });
    },
    setUpdaterStatus(next) {
      updateUpdaterStatus(next);
    },
    render,
  });
}
