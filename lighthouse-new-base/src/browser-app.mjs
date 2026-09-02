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

  function render() {
    target.innerHTML = renderBrowserShell({
      route:routeState,
      chat:model.chat || {},
      manual:model.manual || {},
      income:model.income || {},
      outcome:model.outcome || {},
      calendar:model.calendar || {},
      ledger:model.ledger || {},
      settings:model.settings || {},
    });
  }

  function onClick(event) {
    const top = event?.target?.closest?.('[data-top-route]');
    if (top?.dataset?.topRoute) {
      event.preventDefault?.();
      const next = navigateTop(routeState, top.dataset.topRoute);
      if (next !== routeState) {
        routeState = next;
        render();
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
    }
  }

  return Object.freeze({
    start() {
      if (!started) {
        target.addEventListener('click', onClick);
        started = true;
      }
      render();
    },
    stop() {
      if (started) {
        target.removeEventListener('click', onClick);
        started = false;
      }
    },
    route() {
      return Object.freeze({ ...routeState });
    },
    render,
  });
}
