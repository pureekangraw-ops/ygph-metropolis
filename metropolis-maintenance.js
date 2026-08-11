"use strict";

/* METROPOLIS 4.2.5 — maintenance/recovery browser adapter */

const METROPOLIS_MAINTENANCE_RUNTIME_VERSION = "1.0.1";

function maintenanceCore() {
  if (!globalThis.YGPHMaintenanceCore) throw new Error("Maintenance Core ยังไม่พร้อม");
  return globalThis.YGPHMaintenanceCore;
}

function maintenanceAudit(event, note) {
  state.audit = Array.isArray(state.audit) ? state.audit : [];
  state.audit.unshift({ id: uid("AUD"), at: nowIso(), event, note });
}

function maintenanceReasonOptions() {
  return `
    <option value="STOCK_COUNT_MISMATCH">นับจริงแล้วไม่ตรงระบบ</option>
    <option value="DAMAGED">ของเสีย / ชำรุด</option>
    <option value="LOST">ของหาย</option>
    <option value="MISSED_RECEIPT">รับเข้าแต่ไม่ได้บันทึก</option>
    <option value="DATA_CORRECTION">แก้ข้อมูลผิด</option>
    <option value="OTHER">อื่น ๆ</option>`;
}

function applyStockPlanToLiveState(plan) {
  const next = maintenanceCore().applyStockAdjustmentToState(state, plan);
  state.store = next.store;
  maintenanceAudit(
    "STOCK_MANUAL_ADJUSTED",
    `${plan.movementType} ${plan.beforeQty} → ${plan.afterQty} (${plan.adjustmentQty >= 0 ? "+" : ""}${plan.adjustmentQty}) · ${plan.reason}${plan.note ? ` · ${plan.note}` : ""}`
  );
}

async function commitStockPlan(plan, message = "ปรับสต็อกแล้ว") {
  applyStockPlanToLiveState(plan);
  return persistAndRender(message, {
    actor: "OWNER_LOCAL_UI",
    eventType: "STOCK_MANUAL_ADJUSTED",
    sourceDomain: "STORE",
    sourceOwner: "OWNER",
    targetDomain: ["STORE", "AUDIT"],
    idempotencyKey: `stock-adjust:${plan.adjustmentId}`,
    provenance: {
      adjustmentId: plan.adjustmentId,
      movementType: plan.movementType,
      reason: plan.reason,
      beforeQty: plan.beforeQty,
      adjustmentQty: plan.adjustmentQty,
      afterQty: plan.afterQty,
      affectsLedger: false
    }
  });
}

function openManualStockAdjustment({ presetMode = "CORRECTION", presetQuantity = null, presetReason = "STOCK_COUNT_MISMATCH", presetNote = "" } = {}) {
  const currentQty = Number(state?.store?.stockQty || 0);
  openModal({
    title: "ปรับสต็อกให้ตรงของจริง",
    text: `สต็อกในระบบตอนนี้ ${currentQty.toLocaleString("th-TH")} ชิ้น · การปรับนี้ไม่สร้างรายการเงิน`,
    body: `<div class="form-grid maintenance-stock-form">
      <div class="field full"><label>วิธีปรับ</label><select id="maintenanceStockMode">
        <option value="CORRECTION"${presetMode === "CORRECTION" ? " selected" : ""}>ตั้งให้ตรงจำนวนจริง</option>
        <option value="MANUAL_IN"${presetMode === "MANUAL_IN" ? " selected" : ""}>เพิ่มจากยอดปัจจุบัน</option>
        <option value="MANUAL_OUT"${presetMode === "MANUAL_OUT" ? " selected" : ""}>ลดจากยอดปัจจุบัน</option>
      </select></div>
      <div class="field full"><label>จำนวน</label><input id="maintenanceStockQty" type="number" min="0" step="1" inputmode="numeric" value="${presetQuantity == null ? currentQty : Number(presetQuantity)}"></div>
      <div class="field full"><label>เหตุผล</label><select id="maintenanceStockReason">${maintenanceReasonOptions()}</select></div>
      <div class="field full"><label>หมายเหตุ</label><input id="maintenanceStockNote" maxlength="240" value="${esc(presetNote)}" placeholder="ใส่เพิ่มได้"></div>
      <div class="field full"><small class="maintenance-inline-note">ระบบเก็บก่อน → เปลี่ยนเท่าไร → หลัง พร้อมเวลาและเหตุผล โดยไม่เขียนทับประวัติขาย/ซื้อ</small></div>
    </div>`,
    confirm: "ยืนยันปรับสต็อก",
    onConfirm: async () => {
      try {
        const reasonSelect = byId("maintenanceStockReason");
        if (reasonSelect && presetReason) reasonSelect.value ||= presetReason;
        const plan = maintenanceCore().planStockAdjustment({
          currentQty: Number(state.store.stockQty || 0),
          mode: byId("maintenanceStockMode").value,
          quantity: Number(byId("maintenanceStockQty").value),
          reason: byId("maintenanceStockReason").value || presetReason,
          note: byId("maintenanceStockNote").value,
          actor: "OWNER",
          timestamp: nowIso(),
          adjustmentId: uid("ADJ")
        });
        if (plan.adjustmentQty === 0) {
          closeModal();
          toast("สต็อกตรงอยู่แล้ว · ไม่มีการเปลี่ยนแปลง");
          return;
        }
        closeModal();
        await commitStockPlan(plan);
      } catch (error) {
        console.error("MAINTENANCE_STOCK_ADJUST_FAILED", error);
        toast(error.message || "ปรับสต็อกไม่สำเร็จ");
        modalBusy = false;
      }
    }
  });
  const reasonSelect = byId("maintenanceStockReason");
  if (reasonSelect) reasonSelect.value = presetReason;
}

function openReconcileMenu() {
  openModal({
    title: "กระทบยอดให้ตรงของจริง",
    text: "เลือกเฉพาะส่วนที่คลาด ระบบจะเก็บประวัติเดิมไว้",
    body: `<div class="maintenance-choice-grid">
      <button type="button" class="secondary-btn" id="maintenanceReconcileStockBtn">สต็อกสินค้า</button>
      <button type="button" class="secondary-btn" id="maintenanceReconcileCashBtn">เงินจริง</button>
    </div>`,
    hideConfirm: true,
    onConfirm: closeModal
  });
  byId("maintenanceReconcileStockBtn").onclick = () => { closeModal(); openManualStockAdjustment(); };
  byId("maintenanceReconcileCashBtn").onclick = () => { closeModal(); promptVerifyBalance(false); };
}

async function runPartialReset(domain) {
  const plan = maintenanceCore().planPartialReset({ domain, state });
  if (plan.domain === "STORE") {
    if (plan.currentQty === 0) return toast("สต็อกเป็น 0 อยู่แล้ว · No action");
    const stockPlan = maintenanceCore().planStockAdjustment({
      currentQty: plan.currentQty,
      mode: "CORRECTION",
      quantity: 0,
      reason: "PARTIAL_RESET",
      note: "Partial Reset — reset current stock only; keep Store history",
      actor: "OWNER",
      timestamp: nowIso(),
      adjustmentId: uid("ADJ")
    });
    return commitStockPlan(stockPlan, "รีเซ็ตสต็อกปัจจุบันแล้ว");
  }
  if (plan.domain === "RIDE") {
    if (!plan.hadCurrentRound) return toast("ไม่มีรอบวิ่งค้างอยู่ · No action");
    state.ride.currentRound = null;
    maintenanceAudit("RIDE_OPERATIONAL_RESET", "ล้างเฉพาะรอบปัจจุบัน เก็บงาน ค่าใช้จ่าย เครดิต และหลักฐานเดิม");
    return persistAndRender("รีเซ็ตรอบวิ่งปัจจุบันแล้ว", {
      actor: "OWNER_LOCAL_UI",
      eventType: "RIDE_OPERATIONAL_RESET",
      sourceDomain: "RIDE",
      sourceOwner: "OWNER",
      targetDomain: ["RIDE", "AUDIT"],
      idempotencyKey: `ride-operational-reset:${uid("RST")}`
    });
  }
  if (plan.domain === "SETTINGS") {
    state.settings = { ...(state.settings || {}), ...plan.patch, defaultPriceSatang: plan.preserve.defaultPriceSatang };
    maintenanceAudit("SETTINGS_OPERATIONAL_RESET", "คืนค่าเฉพาะ preference การใช้งาน โดยไม่แตะรหัส Vault หรือข้อมูลเงินจริง");
    return persistAndRender("คืนค่าการใช้งานเริ่มต้นแล้ว", {
      actor: "OWNER_LOCAL_UI",
      eventType: "SETTINGS_OPERATIONAL_RESET",
      sourceDomain: "CORE",
      sourceOwner: "OWNER",
      targetDomain: ["CORE", "AUDIT"],
      idempotencyKey: `settings-operational-reset:${uid("RST")}`
    });
  }
}

function confirmPartialReset(domain, title, detail) {
  openModal({
    title,
    text: detail,
    body: `<div class="maintenance-warning"><b>เก็บประวัติเดิม</b><br>คำสั่งนี้ไม่ใช่ Factory Reset และจะไม่ลบ Ledger / ประวัติธุรกรรมที่เชื่อมกัน</div>`,
    confirm: "ยืนยัน Partial Reset",
    onConfirm: async () => {
      try {
        closeModal();
        await runPartialReset(domain);
      } catch (error) {
        console.error("MAINTENANCE_PARTIAL_RESET_FAILED", error);
        toast(error.message || "Partial Reset ไม่สำเร็จ");
        modalBusy = false;
      }
    }
  });
}

function closeDatabaseHandle() {
  clearTimeout(inactivityTimer);
  if (db && typeof db.close === "function") db.close();
  db = null;
}

function requestDatabaseDeletion(timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = callback => value => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      callback(value);
    };
    const timer = setTimeout(() => finish(reject)(new Error("ลบฐานข้อมูลนานเกินกำหนด อาจมีอีกหน้าต่างเปิดค้าง")), timeoutMs);
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => finish(resolve)();
    request.onerror = () => finish(reject)(request.error || new Error("ลบฐานข้อมูลไม่สำเร็จ"));
    request.onblocked = () => finish(reject)(new Error("ลบฐานข้อมูลไม่ได้ เพราะยังมีอีกหน้าต่างของแอปเปิดอยู่"));
  });
}

async function verifyDatabaseDeleted() {
  if (typeof indexedDB.databases !== "function") return { verified: true, method: "delete-success-event" };
  const databases = await indexedDB.databases();
  const exists = databases.some(item => item?.name === DB_NAME);
  if (exists) throw new Error("อ่านกลับแล้วยังพบฐานข้อมูลเดิม");
  return { verified: true, method: "indexedDB.databases" };
}

function clearRuntimeReferences() {
  cryptoKey = null;
  currentVault = null;
  state = null;
  trustedDeviceActive = false;
  pendingBackupCandidate = null;
  lastDurableReadback = null;
}

async function destroyLocalDatabase() {
  closeDatabaseHandle();
  await requestDatabaseDeletion();
  return verifyDatabaseDeleted();
}

async function clearMetropolisRuntimeCaches() {
  const names = await caches.keys();
  const targets = maintenanceCore().maintenanceCacheTargets(names);
  await Promise.all(targets.map(name => caches.delete(name)));
  const remaining = maintenanceCore().maintenanceCacheTargets(await caches.keys());
  if (remaining.length) throw new Error(`ล้าง Cache ไม่ครบ: ${remaining.join(", ")}`);
  return targets;
}

async function unregisterCurrentServiceWorker() {
  if (!("serviceWorker" in navigator)) return true;
  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration) return true;
  const removed = await registration.unregister();
  if (!removed) throw new Error("ยกเลิก Service Worker ไม่สำเร็จ");
  return true;
}

function openFactoryReset() {
  openModal({
    title: "Factory Reset — ล้างข้อมูลในเครื่อง",
    text: "ลบ Vault, Store, Ride, Ledger, Calendar, Audit, Rollback และ trusted-device key ทั้งหมด แล้วกลับหน้า Setup",
    body: `<div class="maintenance-danger"><b>ย้อนกลับไม่ได้ถ้าไม่มีไฟล์สำรอง</b><br>ตัวแอปและไฟล์ที่ Deploy ไว้จะไม่ถูกลบ</div>
      <div class="field maintenance-confirm-field"><label>พิมพ์ RESET เพื่อยืนยัน</label><input id="factoryResetPhrase" autocomplete="off" placeholder="RESET"></div>`,
    confirm: "Factory Reset",
    onConfirm: async () => {
      if (!globalThis.YGPHMaintenanceCore.isFactoryConfirmation(byId("factoryResetPhrase").value)) {
        toast("พิมพ์ RESET ให้ตรงก่อน");
        modalBusy = false;
        return;
      }
      closeModal();
      try {
        await destroyLocalDatabase();
        clearRuntimeReferences();
        location.reload();
      } catch (error) {
        console.error("MAINTENANCE_FACTORY_RESET_FAILED", error);
        toast(`Factory Reset ไม่สำเร็จ: ${error.message || error}`);
        setTimeout(() => location.reload(), 1600);
      }
    }
  });
}

function openFullCleanup() {
  if (!navigator.onLine) {
    toast("Full Local Cleanup ต้องออนไลน์เพื่อดึงตัวแอปกลับหลังล้าง Cache");
    return;
  }
  openModal({
    title: "Full Local Cleanup",
    text: "แรงกว่า Factory Reset: ล้างข้อมูล + Cache ของ METROPOLIS + Service Worker แล้วโหลดตัวแอปใหม่จากเครือข่าย",
    body: `<div class="maintenance-danger"><b>ใช้เมื่อสงสัยทั้งข้อมูลและ Cache รุ่นเก่า</b><br>ปิดหน้าต่าง METROPOLIS อื่นก่อนเริ่ม</div>
      <div class="field maintenance-confirm-field"><label>พิมพ์ RESET ALL เพื่อยืนยัน</label><input id="fullCleanupPhrase" autocomplete="off" placeholder="RESET ALL"></div>`,
    confirm: "ล้างทั้งหมดในเครื่อง",
    onConfirm: async () => {
      if (!globalThis.YGPHMaintenanceCore.isFullCleanupConfirmation(byId("fullCleanupPhrase").value)) {
        toast("พิมพ์ RESET ALL ให้ตรงก่อน");
        modalBusy = false;
        return;
      }
      closeModal();
      try {
        await destroyLocalDatabase();
        await clearMetropolisRuntimeCaches();
        await unregisterCurrentServiceWorker();
        clearRuntimeReferences();
        location.reload();
      } catch (error) {
        console.error("MAINTENANCE_FULL_CLEANUP_FAILED", error);
        toast(`Full Cleanup ไม่ครบ: ${error.message || error}`);
        setTimeout(() => location.reload(), 1800);
      }
    }
  });
}

function ensureStoreMaintenanceEntry() {
  const page = document.getElementById("storePage");
  if (!page || document.getElementById("adjustStockBtn")) return;
  const actionRow = page.querySelector(".balanced-actions") || page.querySelector(".action-row");
  if (!actionRow) return;
  const button = document.createElement("button");
  button.id = "adjustStockBtn";
  button.type = "button";
  button.className = "secondary-btn wide maintenance-adjust-stock";
  button.textContent = "⇄ ปรับสต็อกให้ตรงของจริง";
  actionRow.insertAdjacentElement("afterend", button);
  button.onclick = () => openManualStockAdjustment();
}

function ensureSettingsMaintenanceEntry() {
  const page = document.getElementById("settingsPage");
  if (!page || document.getElementById("maintenanceRecoveryCard")) return;
  const card = document.createElement("section");
  card.id = "maintenanceRecoveryCard";
  card.className = "card content-card maintenance-recovery-card";
  card.innerHTML = `<div class="maintenance-title-row"><div><h3>Recovery & Reset</h3><small>เริ่มจากแก้ยอดก่อน แล้วค่อยใช้ Reset เมื่อจำเป็น</small></div><span>4 LEVELS</span></div>
    <div class="maintenance-level safe"><b>1 · Reconcile</b><small>ปรับสต็อกหรือเงินจริงให้ตรงของจริง โดยเก็บประวัติ</small><button type="button" id="maintenanceReconcileBtn" class="secondary-btn wide">กระทบยอด</button></div>
    <div class="maintenance-level"><b>2 · Partial Reset</b><small>รีเซ็ตเฉพาะสถานะปัจจุบัน ไม่ลบประวัติที่เชื่อม Ledger</small><div class="maintenance-three"><button type="button" id="maintenanceResetStoreBtn">Store stock</button><button type="button" id="maintenanceResetRideBtn">Ride round</button><button type="button" id="maintenanceResetSettingsBtn">Preferences</button></div><em>Calendar ไม่ล้างแบบ Partial เพราะอาจตัดสายอ้างอิงจากข้อมูลต้นทาง</em></div>
    <div class="maintenance-level danger"><b>3 · Factory Reset</b><small>ล้างฐานข้อมูลของแอปบนเครื่องนี้ทั้งหมด แล้วกลับหน้า Setup</small><button type="button" id="maintenanceFactoryResetBtn" class="maintenance-danger-btn">Factory Reset</button></div>
    <div class="maintenance-level danger strongest"><b>4 · Full Local Cleanup</b><small>Factory Reset + ล้าง METROPOLIS Cache + Service Worker ต้องออนไลน์</small><button type="button" id="maintenanceFullCleanupBtn" class="maintenance-danger-btn">Full Local Cleanup</button></div>`;
  page.appendChild(card);
  byId("maintenanceReconcileBtn").onclick = openReconcileMenu;
  byId("maintenanceResetStoreBtn").onclick = () => confirmPartialReset("STORE", "Partial Reset — Store", "ตั้งสต็อกปัจจุบันเป็น 0 ด้วย Correction แต่เก็บประวัติขาย/ซื้อ/เบิกทั้งหมด");
  byId("maintenanceResetRideBtn").onclick = () => confirmPartialReset("RIDE", "Partial Reset — Ride", "ล้างเฉพาะรอบวิ่งปัจจุบัน งานและเงินจริงที่เกิดแล้วไม่ถูกลบ");
  byId("maintenanceResetSettingsBtn").onclick = () => confirmPartialReset("SETTINGS", "Partial Reset — Preferences", "คืนค่า preference การใช้งาน โดยเก็บราคาขายตั้งต้น รหัส Vault และข้อมูลทั้งหมด");
  byId("maintenanceFactoryResetBtn").onclick = openFactoryReset;
  byId("maintenanceFullCleanupBtn").onclick = openFullCleanup;
}

function installMaintenanceRuntime() {
  if (typeof document === "undefined") return;
  ensureStoreMaintenanceEntry();
  ensureSettingsMaintenanceEntry();
}

if (typeof module === "object" && module.exports) {
  module.exports = { METROPOLIS_MAINTENANCE_RUNTIME_VERSION };
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  const install = () => {
    if (globalThis.__YGPH_METROPOLIS_MAINTENANCE_RUNTIME__) return;
    globalThis.__YGPH_METROPOLIS_MAINTENANCE_RUNTIME__ = METROPOLIS_MAINTENANCE_RUNTIME_VERSION;
    if (globalThis.YGPHRuntime?.register) {
      globalThis.YGPHRuntime.register("METROPOLIS_MAINTENANCE_CENTER", {
        afterRender: installMaintenanceRuntime,
        afterPageChange: installMaintenanceRuntime
      });
    }
    installMaintenanceRuntime();
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
}
