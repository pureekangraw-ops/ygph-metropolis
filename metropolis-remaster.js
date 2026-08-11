"use strict";

/* METROPOLIS 4.2.6 — app-wide visual remaster adapter. UI-only; no durable state writes. */

const METROPOLIS_REMASTER_RUNTIME_VERSION = "1.0.0";

function remasterCore() {
  if (!globalThis.YGPHMetropolisRemasterCore) throw new Error("METROPOLIS remaster core is not loaded");
  return globalThis.YGPHMetropolisRemasterCore;
}

function remasterIcon(name, className = "") {
  return `<span class="metro-remaster-icon ${className}" aria-hidden="true">${remasterCore().iconSvg(name)}</span>`;
}

function syncSharedFlowIconAuthority() {
  if (typeof FLOW_ICONS === "undefined" || !FLOW_ICONS) return;
  const bridge = {
    app: "app", home: "home", store: "store", ride: "ride", ledger: "ledger", calendar: "calendar",
    settings: "settings", wallet: "wallet", stock: "stock", task: "task", payment: "payment",
    chevron: "info", lock: "security", tree: "app"
  };
  for (const [flowName, remasterName] of Object.entries(bridge)) FLOW_ICONS[flowName] = remasterCore().iconSvg(remasterName);
}

function setIconHost(host, name, className = "") {
  if (!host) return;
  const marker = `${name}:${METROPOLIS_REMASTER_RUNTIME_VERSION}`;
  if (host.dataset.metroRemasterIcon === marker) return;
  host.innerHTML = remasterIcon(name, className);
  host.dataset.metroRemasterIcon = marker;
}

function ensureButtonIcon(id, name) {
  const button = document.getElementById(id);
  if (!button) return;
  let host = button.querySelector(":scope > .metro-action-icon");
  if (!host) {
    host = document.createElement("span");
    host.className = "metro-action-icon";
    host.setAttribute("aria-hidden", "true");
    button.prepend(host);
  }
  setIconHost(host, name, "metro-action-svg");
  button.classList.add("metro-icon-button");
}

function decorateNavigation() {
  const pageIcons = { home: "home", store: "store", ride: "ride", ledger: "ledger", calendar: "calendar" };
  document.querySelectorAll(".bottom-nav .nav-btn[data-page]").forEach(button => {
    const page = String(button.dataset.page || "").toLowerCase();
    const host = button.querySelector("i") || button.insertBefore(document.createElement("i"), button.firstChild);
    setIconHost(host, pageIcons[page] || "info", `metro-nav-${page}`);
  });
}

function decorateBrand() {
  for (const selector of [".brand-mark", ".metropolis-brand-mark", "#metropolisCurrentIcon"]) {
    document.querySelectorAll(selector).forEach(host => setIconHost(host, "app", "metro-brand-icon"));
  }
  const settingsButton = document.querySelector(".flow-header-settings, #headerSettingsBtn");
  if (settingsButton) {
    settingsButton.classList.add("metro-icon-button");
    const iconHosts = [...settingsButton.querySelectorAll(".flow-icon, .metro-action-icon")];
    let icon = iconHosts.find(host => host.classList.contains("flow-icon")) || iconHosts[0];
    if (!icon) {
      icon = document.createElement("span");
      icon.className = "flow-icon";
      settingsButton.prepend(icon);
    }
    icon.classList.add("flow-icon");
    icon.classList.remove("metro-action-icon");
    iconHosts.filter(host => host !== icon).forEach(host => host.remove());
    setIconHost(icon, "settings");
  }
}

function decorateHome() {
  const dash = [
    [".metro-dash-purple .metro-dash-icon", "wallet"],
    [".metro-dash-green .metro-dash-icon", "stock"],
    [".metro-dash-yellow .metro-dash-icon", "task"],
    [".metro-dash-red .metro-dash-icon", "payment"]
  ];
  dash.forEach(([selector, name]) => document.querySelectorAll(selector).forEach(host => setIconHost(host, name)));

  const sourceCards = [
    ["#homePage .source-card.store i", "store"],
    ["#homePage .source-card.ride i", "ride"],
    ["#homePage .source-card.ledger i", "ledger"]
  ];
  sourceCards.forEach(([selector, name]) => document.querySelectorAll(selector).forEach(host => setIconHost(host, name)));
}

function headingIconName(text) {
  const value = String(text || "").toLowerCase();
  if (/ร้านค้า|สินค้า|ขาย/.test(value)) return "store";
  if (/วิ่ง|ride|งานล่าสุด/.test(value)) return "ride";
  if (/การเงิน|เงินจริง|ledger|ภาระ/.test(value)) return "ledger";
  if (/ปฏิทิน|calendar|คิว/.test(value)) return "calendar";
  if (/ตั้งค่า|เครื่องมือ|ความปลอดภัย/.test(value)) return "settings";
  if (/รายงาน|audit|review|ข้อมูล/.test(value)) return "report";
  if (/รับสินค้า|ซื้อเข้า/.test(value)) return "purchase";
  if (/เบิกสินค้า/.test(value)) return "withdraw";
  return "task";
}

function decorateHeadings() {
  document.querySelectorAll(".page .hero h2, .page .content-card > h3, .page .section-title h2, .page .hub-card > h2").forEach(heading => {
    if (heading.querySelector(":scope > .metro-heading-icon")) return;
    const icon = document.createElement("span");
    icon.className = "metro-heading-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.innerHTML = remasterCore().iconSvg(headingIconName(heading.textContent));
    heading.prepend(icon);
  });

  document.querySelectorAll(".flow35-heading-icon").forEach(host => {
    const heading = host.parentElement;
    setIconHost(host, headingIconName(heading?.textContent), "metro-flow-heading-icon");
  });
}

function decoratePrimaryActions() {
  const actions = {
    addSaleBtn: "sale",
    addPurchaseBtn: "purchase",
    withdrawStockBtn: "withdraw",
    adjustStockBtn: "reconcile",
    toggleRoundBtn: "ride",
    withdrawRideCreditBtn: "cashOut",
    addRideExpenseBtn: "cashOut",
    addRideJobBtn: "task",
    verifyBalanceBtn: "reconcile",
    exportBackupBtn: "report",
    restoreBackupBtn: "reset",
    changePassBtn: "security",
    persistBtn: "security",
    installBtn: "app",
    checkUpdateBtn: "reset",
    activateUpdateBtn: "cashIn",
    rollbackUpdateBtn: "reset",
    activateCurrentVersionBtn: "cashIn",
    buildReportBtn: "report",
    downloadReportBtn: "report",
    homeExportBtn: "cashOut",
    homeImportBtn: "cashIn",
    exportJsonBtn: "cashOut",
    importProposalBtn: "cashIn"
  };
  for (const [id, name] of Object.entries(actions)) ensureButtonIcon(id, name);
}

function decorateMaintenance() {
  const card = document.getElementById("maintenanceRecoveryCard");
  if (!card) return;
  card.classList.add("metro-recovery-remaster");
  const title = card.querySelector(".maintenance-title-row h3");
  if (title && !title.querySelector(".metro-heading-icon")) {
    title.insertAdjacentHTML("afterbegin", remasterIcon("reset", "metro-heading-icon"));
  }

  const levels = [...card.querySelectorAll(".maintenance-level")];
  const icons = ["reconcile", "partialReset", "factoryReset", "fullCleanup"];
  levels.forEach((level, index) => {
    level.dataset.metroRecoveryLevel = String(index + 1);
    const label = level.querySelector(":scope > b");
    if (label && !label.querySelector(".metro-level-icon")) label.insertAdjacentHTML("afterbegin", remasterIcon(icons[index], "metro-level-icon"));
  });

  ensureButtonIcon("maintenanceReconcileBtn", "reconcile");
  ensureButtonIcon("maintenanceResetStoreBtn", "stock");
  ensureButtonIcon("maintenanceResetRideBtn", "ride");
  ensureButtonIcon("maintenanceResetSettingsBtn", "settings");
  ensureButtonIcon("maintenanceFactoryResetBtn", "factoryReset");
  ensureButtonIcon("maintenanceFullCleanupBtn", "fullCleanup");
}

function decorateStatusAndUtility() {
  const privacy = document.getElementById("privacyCover");
  if (privacy && !privacy.querySelector("svg")) privacy.innerHTML = remasterIcon("security", "metro-privacy-icon");
  document.querySelectorAll(".exchange-action > span").forEach((host, index) => setIconHost(host, index % 2 === 0 ? "cashOut" : "cashIn"));
}

function applyMetropolisRemaster() {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.metropolisRemaster = METROPOLIS_REMASTER_RUNTIME_VERSION;
  syncSharedFlowIconAuthority();
  decorateBrand();
  decorateNavigation();
  decorateHome();
  decorateHeadings();
  decoratePrimaryActions();
  decorateMaintenance();
  decorateStatusAndUtility();
}

if (typeof module === "object" && module.exports) module.exports = { METROPOLIS_REMASTER_RUNTIME_VERSION };

if (typeof window !== "undefined" && typeof document !== "undefined") {
  const install = () => {
    if (globalThis.__YGPH_METROPOLIS_REMASTER_RUNTIME__) return;
    globalThis.__YGPH_METROPOLIS_REMASTER_RUNTIME__ = METROPOLIS_REMASTER_RUNTIME_VERSION;
    let queued = false;
    const schedule = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        applyMetropolisRemaster();
      });
    };
    if (globalThis.YGPHRuntime?.register) {
      globalThis.YGPHRuntime.register("METROPOLIS_VISUAL_REMASTER", {
        afterRender: schedule,
        afterPageChange: schedule,
        afterReport: schedule
      });
    }
    schedule();
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
}
