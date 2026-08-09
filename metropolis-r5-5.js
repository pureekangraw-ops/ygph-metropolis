"use strict";

/* YGPH METROPOLIS 4.2.5 — daily target + end-day close + final UI cleanup */

const METROPOLIS_425_PRODUCT_VERSION = "4.2.5";
const METROPOLIS_R5_5_VERSION = "5.5.0-finalization";
const R55_DEFAULT_PASS_PERCENT = 70;
const R55_DUE_SOON_DAYS = 7;
const R55_MAX_END_DAY_ITEMS = 5;

function r55Today() {
  try { return typeof localISO === "function" ? localISO() : new Date().toISOString().slice(0, 10); }
  catch (_) { return new Date().toISOString().slice(0, 10); }
}
function r55PreviousDate(isoDate) {
  const [year, month, day] = String(isoDate || "").split("-").map(Number);
  if (![year, month, day].every(Number.isFinite)) return "";
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}
function r55RecordDate(record) { return String(record?.date || record?.due || record?.createdAt || "").slice(0, 10); }
function r55DailyEarningsSatang(targetState, day) {
  const sales = Array.isArray(targetState?.store?.sales) ? targetState.store.sales : [];
  const jobs = Array.isArray(targetState?.ride?.jobs) ? targetState.ride.jobs : [];
  return sales.filter(item => item?.status !== "CANCELLED" && r55RecordDate(item) === day).reduce((sum, item) => sum + Number(item?.totalSatang || 0), 0)
    + jobs.filter(item => item?.status !== "CANCELLED" && r55RecordDate(item) === day).reduce((sum, item) => sum + Number(item?.amountSatang || 0), 0);
}
function r55DailyTargetProgress({ earnedSatang = 0, targetSatang = 0, passPercent = R55_DEFAULT_PASS_PERCENT } = {}) {
  const earned = Math.max(0, Number(earnedSatang || 0));
  const target = Math.max(0, Number(targetSatang || 0));
  const pass = Math.min(100, Math.max(1, Math.round(Number(passPercent || R55_DEFAULT_PASS_PERCENT))));
  const near = Math.max(0, pass - 10);
  if (!target) return { percent: 0, status: "NO_TARGET", passPercent: pass, nearPercent: near, gapToPassSatang: 0, gapToTargetSatang: 0 };
  const percent = Math.round((earned / target) * 1000) / 10;
  const status = percent >= 100 ? "OVER" : percent >= pass ? "PASS" : percent >= near ? "NEAR" : "BELOW";
  return { percent, status, passPercent: pass, nearPercent: near, gapToPassSatang: Math.max(0, Math.ceil(target * pass / 100) - earned), gapToTargetSatang: Math.max(0, target - earned) };
}
function r55PercentDelta(currentSatang, previousSatang) {
  const current = Number(currentSatang || 0), previous = Number(previousSatang || 0);
  if (!(previous > 0)) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}
function r55DaysFrom(today, due) {
  const start = Date.parse(`${today}T00:00:00Z`), end = Date.parse(`${due}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return Number.POSITIVE_INFINITY;
  return Math.round((end - start) / 86400000);
}
function r55RankObligations(rows, today, dueSoonDays = R55_DUE_SOON_DAYS) {
  const rank = { OVERDUE: 0, DUE_SOON: 1, LATER: 2 };
  return (Array.isArray(rows) ? rows : [])
    .filter(row => Number(row?.remainingSatang || 0) > 0 && String(row?.due || ""))
    .map(row => { const days = r55DaysFrom(today, row.due); return { ...row, days, bucket: days < 0 ? "OVERDUE" : days <= dueSoonDays ? "DUE_SOON" : "LATER" }; })
    .sort((a, b) => rank[a.bucket] - rank[b.bucket] || String(a.due).localeCompare(String(b.due)) || String(a.id || "").localeCompare(String(b.id || "")))
    .slice(0, R55_MAX_END_DAY_ITEMS);
}
function r55PaymentPreview(currentBalanceSatangValue, selectedRows) {
  const selectedSatang = (Array.isArray(selectedRows) ? selectedRows : []).reduce((sum, row) => sum + Math.max(0, Number(row?.remainingSatang || 0)), 0);
  return { selectedSatang, afterSatang: Number(currentBalanceSatangValue || 0) - selectedSatang };
}
function r55Money(satang) {
  try { return typeof money === "function" ? money(satang) : (Number(satang || 0) / 100).toLocaleString("th-TH", { maximumFractionDigits: 2 }); }
  catch (_) { return (Number(satang || 0) / 100).toLocaleString("th-TH", { maximumFractionDigits: 2 }); }
}
function r55ClaimVersionAuthority() {
  if (typeof globalThis === "undefined") return;
  globalThis.YGPH_METROPOLIS_PRODUCT_VERSION = METROPOLIS_425_PRODUCT_VERSION;
  globalThis.__YGPH_R55_VERSION_AUTHORITY__ = METROPOLIS_425_PRODUCT_VERSION;
}
function r55ApplyVisibleVersion() {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.metropolisR55 = METROPOLIS_R5_5_VERSION;
  document.documentElement.dataset.metropolisVersion = METROPOLIS_425_PRODUCT_VERSION;
  document.title = `YGPH METROPOLIS v${METROPOLIS_425_PRODUCT_VERSION}`;
  const expected = `METROPOLIS v${METROPOLIS_425_PRODUCT_VERSION}`;
  const status = document.querySelector(".status-line b");
  if (status) { status.textContent = expected; status.setAttribute("aria-label", expected); }
  const settingsVersion = document.getElementById("settingsProductVersion");
  if (settingsVersion) settingsVersion.textContent = expected;
}
function r55TargetSettings() {
  return {
    targetSatang: Math.max(0, Number(state?.settings?.dailyTargetSatang || 0)),
    passPercent: Math.min(100, Math.max(1, Math.round(Number(state?.settings?.dailyPassPercent || R55_DEFAULT_PASS_PERCENT))))
  };
}
function r55TargetStatusLabel(progress) { return ({ OVER: "เป้าแตก ✨", PASS: "ผ่านเกม ✅", NEAR: "เกือบผ่าน", BELOW: "ยังไม่ผ่าน", NO_TARGET: "ยังไม่ได้ตั้งเป้า" })[progress.status] || ""; }
function r55EnhanceDashboard() {
  if (typeof document === "undefined") return null;
  const dashboard = typeof r54BuildDashboard === "function" ? r54BuildDashboard() : document.getElementById("metropolisOwnerDashboard");
  if (!dashboard) return null;
  dashboard.querySelector(".metro-owner-dashboard-head small")?.remove();
  let target = document.getElementById("metroDailyTargetCard");
  if (!target) {
    target = document.createElement("article");
    target.id = "metroDailyTargetCard";
    target.className = "metro-daily-target";
    target.innerHTML = `<div class="metro-daily-target-copy"><strong class="metro-daily-percent no-target" id="metroDailyPercent">—%</strong><span class="metro-daily-status" id="metroDailyStatus">ยังไม่ได้ตั้งเป้า</span><span class="metro-daily-meta" id="metroDailyCompare">—</span></div><div class="metro-daily-target-side"><small>เป้ารายวัน</small><b id="metroDailyTargetValue">—</b><small id="metroDailyEarned">ได้แล้ว 0 บาท</small></div><button class="metro-daily-edit" id="metroDailyTargetEdit" type="button">ตั้ง/แก้เป้า</button>`;
    const grid = dashboard.querySelector(".metro-owner-dashboard-grid");
    dashboard.insertBefore(target, grid || dashboard.firstChild);
  }
  if (!document.getElementById("metroEndDayBtn")) {
    const button = document.createElement("button");
    button.id = "metroEndDayBtn";
    button.className = "metro-end-day-btn";
    button.type = "button";
    button.textContent = "สิ้นวัน";
    dashboard.appendChild(button);
  }
  return dashboard;
}
function r55SyncDailyTarget() {
  if (typeof state === "undefined" || !state) return;
  const today = r55Today(), yesterday = r55PreviousDate(today);
  const earned = r55DailyEarningsSatang(state, today), previous = r55DailyEarningsSatang(state, yesterday);
  const { targetSatang, passPercent } = r55TargetSettings();
  const progress = r55DailyTargetProgress({ earnedSatang: earned, targetSatang, passPercent });
  const delta = r55PercentDelta(earned, previous);
  const percent = document.getElementById("metroDailyPercent");
  if (percent) { percent.textContent = targetSatang ? `${progress.percent.toLocaleString("th-TH", { maximumFractionDigits: 1 })}%` : "—%"; percent.classList.toggle("no-target", !targetSatang); }
  if (document.getElementById("metroDailyStatus")) document.getElementById("metroDailyStatus").textContent = r55TargetStatusLabel(progress);
  if (document.getElementById("metroDailyTargetValue")) document.getElementById("metroDailyTargetValue").textContent = targetSatang ? `${r55Money(targetSatang)} บาท` : "—";
  if (document.getElementById("metroDailyEarned")) document.getElementById("metroDailyEarned").textContent = `ได้แล้ว ${r55Money(earned)} บาท`;
  if (document.getElementById("metroDailyCompare")) document.getElementById("metroDailyCompare").textContent = delta == null ? "เมื่อวานยังไม่มีรายได้" : delta > 0 ? `มากกว่าเมื่อวาน +${delta}%` : delta < 0 ? `น้อยกว่าเมื่อวาน ${Math.abs(delta)}%` : "เท่าเมื่อวาน";
}
function r55OpenTargetEditor() {
  const { targetSatang, passPercent } = r55TargetSettings();
  openModal({ title: "เป้ารายวัน", body: `<div class="form-grid"><div class="field"><label>เป้ารายวัน</label><input id="metroDailyTargetInput" type="number" min="0" step="0.01" inputmode="decimal" value="${targetSatang ? targetSatang / 100 : ""}"></div><div class="field"><label>เส้นผ่านเกม (%)</label><input id="metroDailyPassInput" type="number" min="1" max="100" step="1" value="${passPercent}"></div></div>`, confirm: "บันทึกเป้า", onConfirm: async () => {
    const target = parseMoneyToSatang(byId("metroDailyTargetInput").value, { allowZero: true, label: "เป้ารายวัน" });
    const pass = Math.round(Number(byId("metroDailyPassInput").value));
    if (!Number.isInteger(pass) || pass < 1 || pass > 100) { toast("เส้นผ่านเกมต้องอยู่ 1–100%"); modalBusy = false; return; }
    state.settings.dailyTargetSatang = target; state.settings.dailyPassPercent = pass; closeModal();
    await persistAndRender("บันทึกเป้ารายวันแล้ว", { eventType: "DAILY_TARGET_UPDATED", sourceDomain: "CORE", sourceOwner: "OWNER", targetDomain: ["CORE"], idempotencyKey: `daily-target:${r55Today()}:${target}:${pass}:${Date.now()}` });
  }});
}
function r55EndDayRows() {
  const rows = (Array.isArray(state?.calendar) ? state.calendar : []).filter(item => !["COMPLETED", "CANCELLED"].includes(String(item?.status || "")) && queueDirection(item) === "OUT").map(item => {
    const source = findSource(item.source, item.sourceId);
    const queueRemaining = Math.max(0, Number(item.amountSatang || 0) - Number(item.paidSatang || 0));
    const remainingSatang = Math.min(Math.max(0, Number(source?.remainingSatang ?? queueRemaining)), queueRemaining);
    const trusted = integrityGate(item).state === "TRUSTED", fresh = freshnessGate(item).state === "FRESH";
    return { id: item.id, queueId: item.id, title: source?.name || source?.title || item.sourceId, due: String(item.due || "").slice(0, 10), remainingSatang, selectable: Boolean(source && trusted && fresh), lockedReason: !source ? "ไม่พบต้นทาง" : !trusted ? "ข้อมูลต้นทางเปลี่ยน" : !fresh ? "ต้องตรวจข้อมูลก่อน" : "" };
  });
  return r55RankObligations(rows, r55Today(), R55_DUE_SOON_DAYS);
}
function r55DailyCashTotals() {
  const today = r55Today();
  return (Array.isArray(state?.ledger?.transactions) ? state.ledger.transactions : []).filter(tx => r55RecordDate(tx) === today && (typeof isRealCashTransaction !== "function" || isRealCashTransaction(tx))).reduce((out, tx) => { const amount = Number(tx?.amountSatang || 0); if (tx?.direction === "IN") out.inSatang += amount; if (tx?.direction === "OUT") out.outSatang += amount; return out; }, { inSatang: 0, outSatang: 0 });
}
function r55EndDayBucketLabel(row) {
  if (row.bucket === "OVERDUE") return { label: `ค้าง ${Math.abs(row.days)} วัน`, cls: "overdue" };
  if (row.bucket === "DUE_SOON") return { label: row.days === 0 ? "ถึงกำหนดวันนี้" : `อีก ${row.days} วัน`, cls: "soon" };
  return { label: `ยังไม่ถึง · อีก ${row.days} วัน`, cls: "later" };
}
function r55RefreshEndDayPreview(rows) {
  const selectedIds = [...document.querySelectorAll("[data-metro-end-pay]:checked")].map(input => input.value);
  const preview = r55PaymentPreview(currentBalanceSatang(), rows.filter(row => selectedIds.includes(row.queueId)));
  byId("metroEndSelectedTotal").textContent = `${r55Money(preview.selectedSatang)} บาท`;
  byId("metroEndAfterBalance").textContent = `${r55Money(preview.afterSatang)} บาท`;
  byId("metroEndAfterBalance").classList.toggle("negative", preview.afterSatang < 0);
  byId("modalConfirm").textContent = selectedIds.length ? `จ่ายที่เลือก (${selectedIds.length})` : "จบวันนี้";
}
async function r55ApplyEndDayPayments(queueIds) {
  const today = r55Today();
  const before = clone(state);
  try {
    for (const queueId of queueIds) {
      const item = findQueue(queueId), source = item ? findSource(item.source, item.sourceId) : null;
      if (!item || !source || !["PAY_OBLIGATION", "PAY_OBLIGATION_INSTALLMENT"].includes(item.actionType)) throw new Error("รายการชำระไม่ตรงกับภาระปัจจุบัน");
      if (integrityGate(item).state !== "TRUSTED" || freshnessGate(item).state !== "FRESH") throw new Error(`รายการ ${source.name || source.id} ต้องตรวจข้อมูลก่อน`);
      const amount = Math.min(Number(source.remainingSatang || 0), Math.max(0, Number(item.amountSatang || 0) - Number(item.paidSatang || 0)));
      if (amount <= 0) continue;
      const key = `end-day:${today}:${amount}`;
      runOnce(item, key, () => {
        if (timeGate(item).state === "TOO_EARLY") addAudit("AION_OVERRIDE", `${item.id} · END_DAY_EARLY_PAYMENT`);
        addTransaction({ direction: "OUT", amountSatang: amount, label: `ชำระ ${source.name}${item.installmentNumber ? ` งวด ${item.installmentNumber}` : ""}`, source: "LEDGER", sourceId: source.id, subtype: "OBLIGATION_PAYMENT", actionKey: `${item.id}:${key}` });
        source.paidSatang = Number(source.paidSatang || 0) + amount;
        source.remainingSatang = Math.max(0, Number(source.originalSatang || 0) - source.paidSatang);
        source.status = source.remainingSatang === 0 ? "COMPLETED" : "PARTIAL";
        item.paidSatang = Number(item.paidSatang || 0) + amount;
        const installment = source.installments?.find(entry => entry.number === item.installmentNumber);
        if (installment) { installment.paidSatang = Number(installment.paidSatang || 0) + amount; installment.status = installment.paidSatang >= installment.amountSatang ? "COMPLETED" : "PARTIAL"; installment.paidAt = installment.status === "COMPLETED" ? nowIso() : null; }
        bumpSource(source);
        item.expectedRevision = source.revision;
        item.sourceRevision = source.revision;
        item.status = Math.max(0, Number(item.amountSatang || 0) - Number(item.paidSatang || 0)) === 0 ? "COMPLETED" : "PARTIAL";
        if (item.status === "COMPLETED") item.completedAt = nowIso();
        addHistory(item, "PAYMENT_APPLIED", `OUT ${r55Money(amount)} · END_DAY`);
        syncQueueRevisionsForSource(item.source, item.sourceId);
      });
    }
    await persistAndRender("ชำระภาระสิ้นวันแล้ว", { eventType: "END_DAY_OBLIGATIONS_PAID", sourceDomain: "LEDGER", sourceOwner: "OWNER", targetDomain: ["LEDGER", "CALENDAR"], idempotencyKey: `end-day-pay:${today}:${queueIds.slice().sort().join(",")}:${Date.now()}` });
  } catch (error) {
    state = before;
    renderAll();
    throw error;
  }
}
function r55OpenEndDay() {
  const rows = r55EndDayRows(), today = r55Today(), earned = r55DailyEarningsSatang(state, today), cash = r55DailyCashTotals(), balance = currentBalanceSatang();
  const creditPending = Math.max(0, Number(state?.ride?.creditBalanceSatang || 0)) + (Array.isArray(state?.ride?.creditWithdrawals) ? state.ride.creditWithdrawals.filter(item => item.status === "PENDING").reduce((sum, item) => sum + Number(item.amountSatang || 0), 0) : 0);
  const { targetSatang, passPercent } = r55TargetSettings(), progress = r55DailyTargetProgress({ earnedSatang: earned, targetSatang, passPercent });
  const rowHtml = rows.length ? rows.map(row => { const bucket = r55EndDayBucketLabel(row); return `<label class="metro-end-item ${row.selectable ? "" : "metro-end-disabled"}"><input type="checkbox" data-metro-end-pay value="${row.queueId}" ${row.selectable ? "" : "disabled"}><span><b>${esc(row.title)}</b><small><span class="metro-end-bucket ${bucket.cls}">${bucket.label}</span> · ${dateTH(row.due)}${row.lockedReason ? ` · ${esc(row.lockedReason)}` : ""}</small></span><span class="metro-end-amount">${r55Money(row.remainingSatang)} ฿</span></label>`; }).join("") : '<div class="empty">ไม่มีภาระค้าง</div>';
  openModal({ title: "สิ้นวัน", body: `<div class="metro-end-summary"><div class="metro-end-stat"><small>รายได้วันนี้</small><b>${r55Money(earned)} บาท${targetSatang ? ` · ${progress.percent}%` : ""}</b></div><div class="metro-end-stat"><small>เงินคงเหลือ</small><b>${r55Money(balance)} บาท</b></div><div class="metro-end-stat"><small>เงินจริงเข้า</small><b>${r55Money(cash.inSatang)} บาท</b></div><div class="metro-end-stat"><small>เงินจริงออก</small><b>${r55Money(cash.outSatang)} บาท</b></div><div class="metro-end-stat"><small>เครดิตค้างเข้า</small><b>${r55Money(creditPending)} บาท</b></div><div class="metro-end-stat"><small>สถานะเป้า</small><b>${r55TargetStatusLabel(progress)}</b></div></div><h3>ภาระที่ยังค้าง · สูงสุด 5</h3><div class="metro-end-list">${rowHtml}</div><div class="metro-end-preview"><div><small>รวมที่เลือก</small><b id="metroEndSelectedTotal">0 บาท</b></div><div><small>คงเหลือหลังจ่าย</small><b id="metroEndAfterBalance">${r55Money(balance)} บาท</b></div></div>`, confirm: "จบวันนี้", onConfirm: async () => { const selected = [...document.querySelectorAll("[data-metro-end-pay]:checked")].map(input => input.value); if (!selected.length) { closeModal(); return; } closeModal(); await r55ApplyEndDayPayments(selected); } });
  document.querySelectorAll("[data-metro-end-pay]").forEach(input => input.addEventListener("change", () => r55RefreshEndDayPreview(rows)));
  r55RefreshEndDayPreview(rows);
}
function r55MoveExchangeToSettings() {
  const exchange = document.querySelector(".exchange-card"), settings = document.getElementById("settingsPage");
  if (!exchange || !settings) return;
  exchange.classList.add("metro-exchange-compact");
  if (exchange.querySelector("h3")) exchange.querySelector("h3").textContent = "รับ–ส่งข้อมูล";
  if (exchange.parentElement !== settings) settings.appendChild(exchange);
  const exportButton = byId("homeExportBtn"), importButton = byId("homeImportBtn");
  if (exportButton?.querySelector("b")) exportButton.querySelector("b").textContent = "ส่งออก";
  if (importButton?.querySelector("b")) importButton.querySelector("b").textContent = "รับเข้า";
}
const R55_MONEY_INPUT_IDS = new Set(["setupPrice","setupBalance","rideAmount","defaultPrice","verifiedBalance","saleUnitPrice","saleReceived","buyCost","rideExpenseAmount","otherIncomeAmount","debtAmount","expenseAmount","payAmount","metroDailyTargetInput"]);
function r55PatchDecimalInputs(root = document) {
  const inputs = [];
  if (root?.matches?.('input[type="number"]')) inputs.push(root);
  if (root?.querySelectorAll) inputs.push(...root.querySelectorAll('input[type="number"]'));
  for (const input of inputs) {
    if (!R55_MONEY_INPUT_IDS.has(input.id)) continue;
    input.setAttribute("step", "0.01");
    input.setAttribute("inputmode", "decimal");
    if (input.id === "rideAmount" && Number(input.min || 0) >= 1) input.min = "0.01";
  }
}
function r55PruneDecorativeCopy() { document.querySelectorAll("#homePage > .notice, .metropolis-home > .notice").forEach(node => node.remove()); }
function r55BindActions() { if (byId("metroDailyTargetEdit")) byId("metroDailyTargetEdit").onclick = r55OpenTargetEditor; if (byId("metroEndDayBtn")) byId("metroEndDayBtn").onclick = r55OpenEndDay; }
function r55Apply() { r55ClaimVersionAuthority(); r55ApplyVisibleVersion(); r55EnhanceDashboard(); r55MoveExchangeToSettings(); r55PruneDecorativeCopy(); r55PatchDecimalInputs(); if (typeof r54SyncDashboard === "function") r54SyncDashboard(); r55SyncDailyTarget(); r55BindActions(); }

if (typeof module === "object" && module.exports) module.exports = { METROPOLIS_425_PRODUCT_VERSION, METROPOLIS_R5_5_VERSION, R55_DEFAULT_PASS_PERCENT, R55_DUE_SOON_DAYS, r55DailyEarningsSatang, r55DailyTargetProgress, r55PercentDelta, r55RankObligations, r55PaymentPreview };

if (typeof window !== "undefined" && typeof document !== "undefined") (() => {
  let queued = false;
  const queueApply = () => { if (queued) return; queued = true; requestAnimationFrame(() => { queued = false; r55Apply(); }); };
  const install = () => {
    if (globalThis.__YGPH_METROPOLIS_R55_RUNTIME__) return;
    globalThis.__YGPH_METROPOLIS_R55_RUNTIME__ = true;
    r55ClaimVersionAuthority();
    if (globalThis.YGPHRuntime?.register) globalThis.YGPHRuntime.register("METROPOLIS_R55_FINALIZATION", { afterRender: queueApply, afterPageChange: queueApply });
    const observer = new MutationObserver(records => { for (const record of records) for (const node of record.addedNodes || []) if (node?.nodeType === 1) r55PatchDecimalInputs(node); });
    observer.observe(document.body, { childList: true, subtree: true });
    queueApply();
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
})();
