"use strict";

/* METROPOLIS 4.2.5 — visual remaster pure icon authority */

const METROPOLIS_REMASTER_CORE_VERSION = "1.0.0";
const STROKE_WIDTH = "1.8";

function svg(body, extra = "") {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${STROKE_WIDTH}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${body}</svg>`;
}

const ICONS = Object.freeze({
  app: svg('<path data-role="accent" d="M6 7 12 3l6 4"/><path data-role="primary" d="M6 20V9l6 5 6-5v11"/><path data-role="accent" d="m12 17.2.7 1.3 1.3.7-1.3.7-.7 1.3-.7-1.3-1.3-.7 1.3-.7Z" fill="currentColor" stroke="none"/>', 'data-icon="app-metropolis-mark"'),
  home: svg('<path d="M3.5 11.4 12 4l8.5 7.4"/><path d="M5.5 10.5V20h13v-9.5"/><path d="M9.2 20v-5.6h5.6V20"/>', 'data-icon="home"'),
  store: svg('<path d="M4 10.5V20h16v-9.5"/><path d="M3 10.5 5 5h14l2 5.5"/><path d="M3 10.5c0 1.4 1 2.5 2.3 2.5s2.4-1.1 2.4-2.5c0 1.4 1 2.5 2.3 2.5s2.3-1.1 2.3-2.5c0 1.4 1 2.5 2.3 2.5s2.4-1.1 2.4-2.5c0 1.4 1 2.5 2.3 2.5s2.4-1.1 2.4-2.5"/><path d="M9 20v-4.5h6V20"/>', 'data-icon="store"'),
  ride: svg('<circle cx="6.5" cy="16.5" r="2.5"/><circle cx="17.5" cy="16.5" r="2.5"/><path d="M8.9 16.5h3.3l2.3-6h4M11.1 10.5 12.5 7h3.3M3.8 12.5h6.1l2.3 4"/>', 'data-icon="ride"'),
  ledger: svg('<rect x="6" y="3" width="14" height="18" rx="2.6"/><path d="M9 3v18M4 7h4M4 12h4M4 17h4"/><path d="M14.6 8.3c-1.4 0-2.3.7-2.3 1.7s1 1.5 2.3 1.8 2.3.7 2.3 1.8-.9 1.8-2.4 1.8M14.6 7v9.7"/>', 'data-icon="ledger"'),
  calendar: svg('<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M8 3v4M16 3v4M3 10h18"/><path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01"/>', 'data-icon="calendar"'),
  settings: svg('<circle cx="12" cy="12" r="3"/><path d="m19 13.8 1.4 1.1-1.8 3.1-1.8-.6a7.7 7.7 0 0 1-2 1.2l-.4 1.9h-3.6l-.4-1.9a7.7 7.7 0 0 1-2-1.2l-1.8.6-1.8-3.1 1.4-1.1a7.3 7.3 0 0 1 0-3.6L4.8 9.1 6.6 6l1.8.6a7.7 7.7 0 0 1 2-1.2l.4-1.9h3.6l.4 1.9a7.7 7.7 0 0 1 2 1.2l1.8-.6 1.8 3.1-1.4 1.1a7.3 7.3 0 0 1 0 3.6Z"/>', 'data-icon="settings"'),
  wallet: svg('<path d="M4 6.5h13.5A2.5 2.5 0 0 1 20 9v9H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h11"/><path d="M15 11h6v4h-6a2 2 0 0 1 0-4Z"/>', 'data-icon="wallet"'),
  stock: svg('<path d="m4 8 8-4 8 4-8 4-8-4Z"/><path d="M4 8v8l8 4 8-4V8M12 12v8"/>', 'data-icon="stock"'),
  task: svg('<rect x="5" y="4" width="14" height="17" rx="2.5"/><path d="m8 9 1.5 1.5 2.7-2.8M8 15l1.5 1.5 2.7-2.8M14 10h2.5M14 16h2.5"/>', 'data-icon="task"'),
  payment: svg('<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M3 9h18M7 15h4"/><circle cx="18" cy="17" r="2.4"/>', 'data-icon="payment"'),
  sale: svg('<path d="M4 6h2l2 10h9l2-7H8"/><circle cx="10" cy="19" r="1.2"/><circle cx="17" cy="19" r="1.2"/><path d="M13 5v6M10 8h6"/>', 'data-icon="sale"'),
  purchase: svg('<path d="M4 9 12 5l8 4-8 4-8-4Z"/><path d="M4 9v7l8 4 8-4V9M12 13v7"/><path d="M12 3v5M9.5 5.5 12 8l2.5-2.5"/>', 'data-icon="purchase"'),
  withdraw: svg('<path d="m4 8 8-4 8 4-8 4-8-4Z"/><path d="M4 8v8l8 4 8-4V8M12 12v8"/><path d="M17.5 3.5v5M15 6l2.5 2.5L20 6"/>', 'data-icon="withdraw"'),
  customer: svg('<circle cx="9" cy="8" r="3"/><path d="M3.5 19c.6-3.2 2.5-5 5.5-5s4.9 1.8 5.5 5"/><path d="M17 8.5h4M19 6.5v4"/>', 'data-icon="customer"'),
  report: svg('<path d="M5 3h10l4 4v14H5z"/><path d="M15 3v5h5M8 16l2-2 2 1 3-4"/>', 'data-icon="report"'),
  notification: svg('<path d="M6 17h12l-1.5-2.3V10a4.5 4.5 0 0 0-9 0v4.7L6 17Z"/><path d="M10 20h4"/>', 'data-icon="notification"'),
  reset: svg('<path d="M5.2 8.2A7.5 7.5 0 1 1 5 15"/><path d="M5 4.5v4h4"/>', 'data-icon="reset"'),
  security: svg('<path d="M12 3 5 6v5c0 4.3 2.6 7.7 7 10 4.4-2.3 7-5.7 7-10V6l-7-3Z"/><path d="m9 12 2 2 4-4"/>', 'data-icon="security"'),
  info: svg('<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>', 'data-icon="info"'),
  help: svg('<circle cx="12" cy="12" r="9"/><path d="M9.8 9a2.5 2.5 0 0 1 4.8 1c0 1.8-2.6 2-2.6 4M12 17.5h.01"/>', 'data-icon="help"'),
  cashIn: svg('<circle cx="12" cy="12" r="8.5"/><path d="M12 17V7M8.5 10.5 12 7l3.5 3.5"/>', 'data-icon="cash-in"'),
  cashOut: svg('<circle cx="12" cy="12" r="8.5"/><path d="M12 7v10M8.5 13.5 12 17l3.5-3.5"/>', 'data-icon="cash-out"'),
  reconcile: svg('<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2.5"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>', 'data-icon="reconcile"'),
  partialReset: svg('<path d="M5.2 8.2A7.5 7.5 0 1 1 5 15"/><path d="M5 4.5v4h4"/><path d="M12 8v4l2.5 1.5"/>', 'data-icon="partial-reset"'),
  factoryReset: svg('<path d="M12 4 3.8 19h16.4L12 4Z"/><path d="M12 9v4.5M12 16.8h.01"/>', 'data-icon="factory-reset"'),
  fullCleanup: svg('<path d="M13 3c1.5 3-1 4.3-1 6.2 0 1.4 1 2.2 2.1 1.7 1.1-.5 1.3-1.9 1.2-3.1 2.8 2 4.2 4.6 3.5 7.1A7 7 0 0 1 5.2 16c-.8-3.2 1-6.5 4.1-8.4-.2 2.2.3 3.5 1.4 3.7 1.5.3 2.2-1.6 1.7-3.2-.4-1.4-.4-3 .6-5.1Z"/><path d="M9 18h6"/>', 'data-icon="full-cleanup"')
});

const ICON_NAMES = Object.freeze(Object.keys(ICONS));

function iconSvg(name) {
  return ICONS[name] || ICONS.info;
}

const api = Object.freeze({ METROPOLIS_REMASTER_CORE_VERSION, STROKE_WIDTH, ICON_NAMES, iconSvg });

if (typeof globalThis !== "undefined") globalThis.YGPHMetropolisRemasterCore = api;
if (typeof module === "object" && module.exports) module.exports = api;
