"use strict";

/* METROPOLIS 4.2.5 — maintenance/recovery pure rules */

const MAINTENANCE_CORE_VERSION = "1.0.0";
const DEFAULT_MAX_QUANTITY = 1_000_000;
const STOCK_ADJUSTMENT_MODES = Object.freeze(["MANUAL_IN", "MANUAL_OUT", "CORRECTION"]);
const STOCK_ADJUSTMENT_REASONS = Object.freeze([
  "STOCK_COUNT_MISMATCH",
  "DAMAGED",
  "LOST",
  "MISSED_RECEIPT",
  "DATA_CORRECTION",
  "PARTIAL_RESET",
  "OTHER"
]);
const FACTORY_CONFIRMATION = "RESET";
const FULL_CLEANUP_CONFIRMATION = "RESET ALL";
const APP_CACHE_PREFIX = "ygph-metropolis-app-";
const META_CACHE = "ygph-metropolis-meta";

function copy(value) {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function integerQuantity(value, { allowZero = true, maximum = DEFAULT_MAX_QUANTITY, label = "จำนวน" } = {}) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0 || (!allowZero && number === 0)) {
    throw new Error(`${label}ต้องเป็นจำนวนเต็ม${allowZero ? "ที่ไม่ติดลบ" : "มากกว่า 0"}`);
  }
  if (number > maximum) throw new Error(`${label}เกินขอบเขตที่ระบบรองรับ`);
  return number;
}

function normalizeReason(value) {
  const reason = String(value || "").trim();
  if (!reason) throw new Error("ต้องระบุเหตุผลการปรับสต็อก");
  if (!STOCK_ADJUSTMENT_REASONS.includes(reason)) throw new Error("เหตุผลการปรับสต็อกไม่รองรับ");
  return reason;
}

function planStockAdjustment({
  currentQty,
  mode,
  quantity,
  reason,
  note = "",
  actor = "OWNER",
  timestamp = new Date().toISOString(),
  adjustmentId = `ADJ-${Date.now()}`,
  maxQuantity = DEFAULT_MAX_QUANTITY
} = {}) {
  const beforeQty = integerQuantity(currentQty, { allowZero: true, maximum: maxQuantity, label: "สต็อกปัจจุบัน" });
  const movementType = String(mode || "").trim();
  if (!STOCK_ADJUSTMENT_MODES.includes(movementType)) throw new Error("รูปแบบการปรับสต็อกไม่รองรับ");
  const entered = integerQuantity(quantity, { allowZero: movementType === "CORRECTION", maximum: maxQuantity, label: movementType === "CORRECTION" ? "จำนวนจริง" : "จำนวนที่ปรับ" });
  const normalizedReason = normalizeReason(reason);

  let adjustmentQty = 0;
  let afterQty = beforeQty;
  if (movementType === "MANUAL_IN") {
    adjustmentQty = entered;
    afterQty = beforeQty + entered;
  } else if (movementType === "MANUAL_OUT") {
    adjustmentQty = -entered;
    afterQty = beforeQty - entered;
  } else {
    afterQty = entered;
    adjustmentQty = afterQty - beforeQty;
  }

  if (afterQty < 0) throw new Error("ผลการปรับทำให้สต็อกติดลบ");
  if (!Number.isSafeInteger(afterQty) || afterQty > maxQuantity) throw new Error("ผลการปรับเกินขอบเขตที่ระบบรองรับ");

  return {
    adjustmentId: String(adjustmentId),
    at: String(timestamp),
    actor: String(actor || "OWNER"),
    movementType,
    reason: normalizedReason,
    note: String(note || "").trim().slice(0, 240),
    beforeQty,
    adjustmentQty,
    afterQty,
    affectsLedger: false,
    affectsStockValue: false
  };
}

function applyStockAdjustmentToState(sourceState, plan) {
  if (!sourceState || typeof sourceState !== "object") throw new Error("ไม่พบ State สำหรับปรับสต็อก");
  if (!plan || !Number.isSafeInteger(plan.afterQty) || !Number.isSafeInteger(plan.adjustmentQty)) throw new Error("แผนปรับสต็อกไม่สมบูรณ์");
  const next = copy(sourceState);
  next.store ||= {};
  next.store.adjustments = Array.isArray(next.store.adjustments) ? next.store.adjustments : [];
  next.store.stockQty = plan.afterQty;
  if (plan.afterQty === 0) next.store.stockValueSatang = 0;
  next.store.adjustments.push(copy(plan));
  return next;
}

function planPartialReset({ domain, state } = {}) {
  const target = String(domain || "").trim().toUpperCase();
  if (!state || typeof state !== "object") throw new Error("ไม่พบ State สำหรับ Reset");
  if (target === "STORE") {
    return { domain: "STORE", action: "CORRECT_STOCK_TO_ZERO", currentQty: integerQuantity(state.store?.stockQty || 0) };
  }
  if (target === "RIDE") {
    return { domain: "RIDE", action: "CLEAR_CURRENT_ROUND", hadCurrentRound: Boolean(state.ride?.currentRound) };
  }
  if (target === "SETTINGS") {
    return {
      domain: "SETTINGS",
      action: "RESET_OPERATIONAL_PREFERENCES",
      patch: { lockMinutes: 5, lowStockThreshold: 3, themeColor: "navy", dailyTargetSatang: 0, dailyPassPercent: 70 },
      preserve: { defaultPriceSatang: Number(state.settings?.defaultPriceSatang ?? 80000) }
    };
  }
  if (target === "CALENDAR") {
    throw new Error("Partial Reset ไม่อนุญาตให้ลบ Calendar เพราะอาจตัดสายอ้างอิงจาก Ledger/Store");
  }
  throw new Error("โดเมน Partial Reset ไม่รองรับ");
}

function isFactoryConfirmation(value) {
  return String(value ?? "").trim() === FACTORY_CONFIRMATION;
}

function isFullCleanupConfirmation(value) {
  return String(value ?? "").trim() === FULL_CLEANUP_CONFIRMATION;
}

function maintenanceCacheTargets(cacheNames = []) {
  return (Array.isArray(cacheNames) ? cacheNames : []).filter(name => String(name).startsWith(APP_CACHE_PREFIX) || name === META_CACHE);
}

const api = Object.freeze({
  MAINTENANCE_CORE_VERSION,
  DEFAULT_MAX_QUANTITY,
  STOCK_ADJUSTMENT_MODES,
  STOCK_ADJUSTMENT_REASONS,
  FACTORY_CONFIRMATION,
  FULL_CLEANUP_CONFIRMATION,
  APP_CACHE_PREFIX,
  META_CACHE,
  integerQuantity,
  planStockAdjustment,
  applyStockAdjustmentToState,
  planPartialReset,
  isFactoryConfirmation,
  isFullCleanupConfirmation,
  maintenanceCacheTargets
});

if (typeof globalThis !== "undefined") globalThis.YGPHMaintenanceCore = api;
if (typeof module === "object" && module.exports) module.exports = api;
