"use strict";

/* YGPH METROPOLIS 4.2.4 — owner home dashboard + visible release authority */

const METROPOLIS_424_PRODUCT_VERSION = "4.2.4";
const METROPOLIS_R5_4_VERSION = "5.4.3-dashboard-current-month";

function r54Today() {
  try { return typeof localISO === "function" ? localISO() : new Date().toISOString().slice(0, 10); }
  catch (_) { return new Date().toISOString().slice(0, 10); }
}

function r54SourceStatus(item) {
  if (!item || typeof findSource !== "function") return null;
  try { return findSource(item.source, item.sourceId)?.status || null; }
  catch (_) { return null; }
}

function r54IsLiveActive(item) {
  const status = String(item?.status || "").toUpperCase();
  const sourceStatus = String(r54SourceStatus(item) || "").toUpperCase();
  if (["COMPLETED", "CANCELLED"].includes(status)) return false;
  if (sourceStatus === "CANCELLED") return false;
  return true;
}

function r54Metrics(targetState, today = r54Today()) {
  const calendar = Array.isArray(targetState?.calendar) ? targetState.calendar : [];
  const active = calendar.filter(r54IsLiveActive);
  let cashSatang = 0;
  try { cashSatang = typeof currentBalanceSatang === "function" ? Number(currentBalanceSatang()) : 0; }
  catch (_) { cashSatang = 0; }
  const stockQty = Number(targetState?.store?.stockQty || 0);
  const overdue = active.filter(item => {
    const due = String(item?.due || "").slice(0, 10);
    return due && due < today;
  }).length;
  const monthKey = String(today || "").slice(0, 7);
  const pendingOut = active.filter(item => {
    if (typeof queueDirection !== "function" || queueDirection(item) !== "OUT") return false;
    return String(item?.due || "").slice(0, 7) === monthKey;
  }).length;
  return { cashSatang, stockQty, overdue, pendingOut };
}

function r54Money(satang) {
  try { return typeof money === "function" ? money(satang) : (Number(satang || 0) / 100).toLocaleString("th-TH", { maximumFractionDigits: 2 }); }
  catch (_) { return (Number(satang || 0) / 100).toLocaleString("th-TH", { maximumFractionDigits: 2 }); }
}

function r54ApplyVisibleVersion() {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.metropolisR54 = METROPOLIS_R5_4_VERSION;
  document.documentElement.dataset.metropolisVersion = METROPOLIS_424_PRODUCT_VERSION;
  const expectedTitle = `YGPH METROPOLIS v${METROPOLIS_424_PRODUCT_VERSION}`;
  if (document.title !== expectedTitle) document.title = expectedTitle;
  const statusVersion = document.querySelector(".status-line b");
  if (statusVersion) {
    const expectedVersion = `METROPOLIS v${METROPOLIS_424_PRODUCT_VERSION}`;
    if (statusVersion.textContent !== expectedVersion) statusVersion.textContent = `METROPOLIS v${METROPOLIS_424_PRODUCT_VERSION}`;
    statusVersion.setAttribute("aria-label", expectedVersion);
  }
}

function r54ClaimVersionAuthority() {
  if (typeof globalThis === "undefined") return;
  globalThis.YGPH_METROPOLIS_PRODUCT_VERSION = METROPOLIS_424_PRODUCT_VERSION;
  globalThis.__YGPH_R54_VERSION_AUTHORITY__ = METROPOLIS_424_PRODUCT_VERSION;
}

function r54BuildDashboard() {
  if (typeof document === "undefined") return null;
  document.querySelector(".metropolis-city-hero")?.remove();
  document.querySelector(".metropolis-eyebrow")?.remove();
  const brandSub = document.querySelector(".brand-copy p");
  if (brandSub && /Four Apps\. One Flow/i.test(brandSub.textContent || "")) {
    brandSub.textContent = "ข้อมูลเข้ารหัส • ใช้งานออฟไลน์";
  }

  const home = document.getElementById("homePage");
  if (!home) return null;
  const appSection = home.querySelector(".section");
  let dashboard = document.getElementById("metropolisOwnerDashboard");
  if (dashboard) {
    if (appSection?.parentElement === home && dashboard.nextElementSibling !== appSection) home.insertBefore(dashboard, appSection);
    return dashboard;
  }

  dashboard = document.createElement("section");
  dashboard.id = "metropolisOwnerDashboard";
  dashboard.className = "metro-owner-dashboard";
  dashboard.innerHTML = `
    <div class="metro-owner-dashboard-head"><h2>แดชบอร์ด</h2><small>ภาพรวมที่ต้องรู้ตอนนี้</small></div>
    <div class="metro-owner-dashboard-grid">
      <article class="metro-dash-card metro-dash-purple"><small>เงินที่มี</small><strong id="metroDashCash">0 บาท</strong></article>
      <article class="metro-dash-card metro-dash-green"><small>สต็อกสินค้า</small><strong id="metroDashStock">0 ชิ้น</strong></article>
      <article class="metro-dash-card metro-dash-yellow"><small>งานที่เลยกำหนด</small><strong id="metroDashOverdue">0 งาน</strong></article>
      <article class="metro-dash-card metro-dash-red"><small>ค้างจ่ายเดือนนี้</small><strong id="metroDashPendingOut">0 รายการ</strong></article>
    </div>`;

  if (appSection?.parentElement === home) home.insertBefore(dashboard, appSection);
  else home.prepend(dashboard);
  return dashboard;
}

function r54SyncDashboard() {
  if (typeof document === "undefined" || typeof state === "undefined" || !state) return;
  const dashboard = r54BuildDashboard();
  if (!dashboard) return;
  const metrics = r54Metrics(state);
  const set = (id, value) => {
    const node = document.getElementById(id);
    if (node && node.textContent !== value) node.textContent = value;
  };
  set("metroDashCash", `${r54Money(metrics.cashSatang)} บาท`);
  set("metroDashStock", `${metrics.stockQty.toLocaleString("th-TH")} ชิ้น`);
  set("metroDashOverdue", `${metrics.overdue.toLocaleString("th-TH")} งาน`);
  set("metroDashPendingOut", `${metrics.pendingOut.toLocaleString("th-TH")} รายการ`);
}

function r54Apply() {
  r54ClaimVersionAuthority();
  r54ApplyVisibleVersion();
  r54BuildDashboard();
  r54SyncDashboard();
}

if (typeof module === "object" && module.exports) {
  module.exports = {
    METROPOLIS_424_PRODUCT_VERSION,
    METROPOLIS_R5_4_VERSION,
    r54Metrics
  };
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  (() => {
    let queued = false;
    const queueApply = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        r54Apply();
      });
    };

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", queueApply, { once: true });
    else queueApply();

    const install = () => {
      if (!document.body || globalThis.__YGPH_METROPOLIS_R54_OBSERVER__) return;
      r54ClaimVersionAuthority();
      const observer = new MutationObserver(queueApply);
      observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "data-metropolis-page"] });
      globalThis.__YGPH_METROPOLIS_R54_OBSERVER__ = observer;
      if (globalThis.YGPHRuntime?.register) {
        globalThis.YGPHRuntime.register("METROPOLIS_R54_HOME_DASHBOARD", {
          afterRender: queueApply,
          afterPageChange: queueApply
        });
      }
      queueApply();
    };
    if (document.body) install();
    else document.addEventListener("DOMContentLoaded", install, { once: true });
  })();
}
