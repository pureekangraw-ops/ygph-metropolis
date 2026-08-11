"use strict";

/* METROPOLIS 4.2.5 — maintenance report seam */

const METROPOLIS_MAINTENANCE_REPORT_VERSION = "1.0.1";

function maintenanceReportDate(item) {
  try {
    return typeof dateKey === "function" ? dateKey(item?.at || item?.createdAt || item?.date) : String(item?.at || item?.createdAt || item?.date || "").slice(0, 10);
  } catch (_) {
    return String(item?.at || item?.createdAt || item?.date || "").slice(0, 10);
  }
}

function maintenanceUpdateReportDom(stockQty, correctionQty) {
  if (typeof document === "undefined") return;
  const rows = [...document.querySelectorAll("#storeReport .stat-line")];
  const stockRow = rows.find(row => row.querySelector("span")?.textContent?.trim() === "สต็อก ณ วันสิ้นสุด");
  if (stockRow?.querySelector("b")) stockRow.querySelector("b").textContent = `${stockQty.toLocaleString("th-TH")} ชิ้น`;

  let correctionRow = document.getElementById("maintenanceReportStockCorrection");
  if (!correctionRow && stockRow?.parentElement) {
    correctionRow = document.createElement("div");
    correctionRow.id = "maintenanceReportStockCorrection";
    correctionRow.className = "stat-line maintenance-report-adjustment";
    correctionRow.innerHTML = `<span>Correction จากการปรับสต็อก</span><b></b>`;
    stockRow.parentElement.insertBefore(correctionRow, stockRow);
  }
  if (correctionRow?.querySelector("b")) {
    const sign = correctionQty > 0 ? "+" : "";
    correctionRow.querySelector("b").textContent = `${sign}${correctionQty.toLocaleString("th-TH")} ชิ้น`;
  }
}

function applyMaintenanceStockToReport(context = {}, dependencies = {}) {
  const report = context.report;
  if (!report?.snapshot || !report.end) return report;

  const core = dependencies.core || globalThis.YGPHMaintenanceCore;
  const targetState = dependencies.state || (typeof state !== "undefined" ? state : null);
  const stockAtFn = dependencies.stockAtFn || (date => stockAt(date));
  const dateOf = dependencies.dateOf || maintenanceReportDate;
  const syncDomFn = dependencies.syncDomFn || maintenanceUpdateReportDom;
  if (!core?.stockReportCorrectionAt) throw new Error("Maintenance Core ยังไม่พร้อมสำหรับ Report Adapter");

  if (report.__maintenanceStockAnchorApplied) {
    const correction = Number(report.store?.manualAdjustmentCorrectionQty || 0);
    syncDomFn(Number(report.snapshot.stockQty || 0), correction);
    return report;
  }

  const adjustments = Array.isArray(targetState?.store?.adjustments) ? targetState.store.adjustments : [];
  const correction = core.stockReportCorrectionAt(
    adjustments,
    report.end,
    stockAtFn,
    dateOf
  );
  report.store ||= {};
  report.store.manualAdjustmentCorrectionQty = correction;
  report.snapshot.stockQty = Math.max(0, Number(report.snapshot.stockQty || 0) + correction);
  Object.defineProperty(report, "__maintenanceStockAnchorApplied", { value: true, enumerable: false, configurable: false });
  syncDomFn(report.snapshot.stockQty, correction);
  return report;
}

if (typeof module === "object" && module.exports) {
  module.exports = {
    METROPOLIS_MAINTENANCE_REPORT_VERSION,
    maintenanceReportDate,
    applyMaintenanceStockToReport
  };
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  const install = () => {
    if (globalThis.__YGPH_METROPOLIS_MAINTENANCE_REPORT__) return;
    if (!globalThis.YGPHMaintenanceCore) throw new Error("Maintenance Core ยังไม่พร้อมสำหรับ Report Adapter");
    globalThis.__YGPH_METROPOLIS_MAINTENANCE_REPORT__ = METROPOLIS_MAINTENANCE_REPORT_VERSION;
    if (globalThis.YGPHRuntime?.register) {
      globalThis.YGPHRuntime.register("METROPOLIS_MAINTENANCE_REPORT", { afterReport: applyMaintenanceStockToReport });
    }
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
}
