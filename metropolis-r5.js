"use strict";

/*
  YGPH METROPOLIS R5 — owner-approved UX / money / calendar polish.
  Additive runtime layer only. It reuses the existing encrypted state and durable commit path.
*/

const METROPOLIS_R5_VERSION = "5.0.0-polish";

function parseIsoDateParts(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));
  if (!match) throw new Error("วันที่ไม่ถูกต้อง");
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) throw new Error("วันที่ไม่ถูกต้อง");
  return { year, month, day };
}

function addMonthsClamped(value, offset) {
  const { year, month, day } = parseIsoDateParts(value);
  const monthIndex = year * 12 + (month - 1) + Number(offset || 0);
  const targetYear = Math.floor(monthIndex / 12);
  const targetMonthIndex = ((monthIndex % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(targetYear, targetMonthIndex + 1, 0)).getUTCDate();
  return `${targetYear}-${String(targetMonthIndex + 1).padStart(2, "0")}-${String(Math.min(day, lastDay)).padStart(2, "0")}`;
}

function monthlyDueDates(firstDue, count) {
  const total = Number(count);
  if (!Number.isInteger(total) || total < 1 || total > 120) throw new Error("จำนวนงวดไม่ถูกต้อง");
  parseIsoDateParts(firstDue);
  return Array.from({ length: total }, (_, index) => addMonthsClamped(firstDue, index));
}

function splitSatang(totalSatang, count) {
  const total = Number(totalSatang);
  const installments = Number(count);
  if (!Number.isSafeInteger(total) || total < 1) throw new Error("ยอดภาระไม่ถูกต้อง");
  if (!Number.isInteger(installments) || installments < 1 || installments > 120 || total < installments) throw new Error("จำนวนงวดไม่ถูกต้อง");
  const base = Math.floor(total / installments);
  const remainder = total - base * installments;
  return Array.from({ length: installments }, (_, index) => base + (index === installments - 1 ? remainder : 0));
}

function shippingNetEffect(receivedSatang, shippingCostSatang) {
  const received = Number(receivedSatang);
  const shipping = Number(shippingCostSatang);
  if (!Number.isSafeInteger(received) || received < 0 || !Number.isSafeInteger(shipping) || shipping < 0) throw new Error("ยอดเงินไม่ถูกต้อง");
  return received - shipping;
}

function queueMatchesInstallment(queue, obligation, number, due, amountSatang) {
  if (!queue || queue.source !== "LEDGER" || queue.sourceId !== obligation.id) return false;
  if (Number(queue.installmentNumber) === number) return true;
  return queue.installmentNumber == null && queue.due === due && Number(queue.amountSatang || 0) === Number(amountSatang || 0);
}

function missingInstallmentNumbers(obligation, queues = []) {
  const count = Number(obligation?.installmentCount || 1);
  if (!Number.isInteger(count) || count < 1) return [];
  const dues = monthlyDueDates(obligation.firstDue, count);
  const amounts = splitSatang(Number(obligation.originalSatang || 0), count);
  const result = [];
  for (let index = 0; index < count; index++) {
    const number = index + 1;
    if (!queues.some(queue => queueMatchesInstallment(queue, obligation, number, dues[index], amounts[index]))) result.push(number);
  }
  return result;
}

function isAcceptedImportedQueue(item) {
  return Boolean(item && Array.isArray(item.history) && item.history.some(entry => entry?.event === "IMPORTED"));
}

function iconSvg(app) {
  const common = `viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" data-r5-icon="${app}"`;
  if (app === "store") return `<svg ${common}><path d="M8 18h32l-3-9H11l-3 9Z"/><path d="M10 18v20h28V18"/><path d="M18 38V27h12v11"/><path d="M8 18c0 4 6 4 8 0 2 4 6 4 8 0 2 4 6 4 8 0 2 4 8 4 8 0"/></svg>`;
  if (app === "ride") return `<svg ${common}><circle cx="13" cy="34" r="5"/><circle cx="36" cy="34" r="5"/><circle cx="25" cy="9" r="3"/><path d="m22 15 6 5 5 1"/><path d="m22 16-4 9h11l5 9"/><path d="M18 25 13 34"/><path d="M29 25h7l4 5"/><path d="M7 28h8"/></svg>`;
  if (app === "ledger") return `<svg ${common}><rect x="10" y="7" width="29" height="34" rx="4"/><path d="M16 7v34M6 14h8M6 22h8M6 30h8M6 38h8"/><text x="21" y="31" fill="currentColor" stroke="none" font-size="18" font-weight="700">฿</text></svg>`;
  if (app === "calendar") return `<svg ${common}><rect x="7" y="10" width="34" height="31" rx="5"/><path d="M7 19h34M15 6v8M33 6v8"/><path d="M15 26h1M24 26h1M33 26h1M15 34h1M24 34h1M33 34h1" stroke-width="4"/></svg>`;
  return `<svg ${common}><circle cx="24" cy="24" r="15"/><path d="M17 24h14M24 17v14"/></svg>`;
}

if (typeof module === "object" && module.exports) {
  module.exports = {
    METROPOLIS_R5_VERSION,
    addMonthsClamped,
    monthlyDueDates,
    splitSatang,
    shippingNetEffect,
    missingInstallmentNumbers,
    isAcceptedImportedQueue,
    iconSvg
  };
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  (() => {
    let reconciliationBusy = false;
    let reconciliationQueued = false;
    let installed = false;

    function installSaleAction() {
      const button = typeof byId === "function" ? byId("addSaleBtn") : null;
      if (!button) return;
      button.onclick = () => {
        openModal({
          title: "ขายสินค้า",
          text: "ยอดขายคือยอดบิลลูกค้า ค่าจัดส่งเป็นต้นทุนของร้านและหักจากเงินจริงสุทธิ",
          body: `<div class="form-grid">
            <div class="field"><label>จำนวนชิ้น</label><input id="saleQty" type="number" min="1" value="1"></div>
            <div class="field"><label>ราคาต่อชิ้น</label><input id="saleUnitPrice" type="number" min="0" step="0.01" value="${satangToBaht(state.settings.defaultPriceSatang)}"></div>
            <div class="field"><label>รับเงินจริงครั้งนี้</label><input id="saleReceived" type="number" min="0" step="0.01" value="0"><small>ยอดที่ยังไม่รับจะเป็นลูกหนี้</small></div>
            <div class="field"><label class="r5-check"><input id="saleHasShippingCost" type="checkbox" aria-controls="saleShippingCostField" aria-expanded="false"> มีค่าจัดส่ง</label></div>
            <div class="field full" id="saleShippingCostField" hidden><label>ค่าจัดส่งที่ร้านจ่าย</label><input id="saleShippingCost" type="number" min="0.01" step="0.01" inputmode="decimal" disabled></div>
            <div class="field" id="saleCustomerField"><label>ลูกค้า</label><input id="saleCustomer" maxlength="80" required></div>
            <div class="field" id="saleDueField"><label>วันนัดยอดค้าง</label><input id="saleDue" type="date" value="${localISO()}" required></div>
            <details id="saleMoreDetails" class="field full r5-disclosure"><summary>ดูรายละเอียดเพิ่ม</summary><div class="form-grid r5-disclosure-body">
              <div class="field full"><label>ช่องทางติดต่อ</label><input id="saleContact" maxlength="100"></div>
              <div class="field full"><label>หมายเหตุ</label><input id="saleNote" maxlength="200"></div>
            </div></details>
          </div>`,
          confirm: "บันทึกขาย",
          onConfirm: async () => {
            const qty = parseQuantity(byId("saleQty").value, { label: "จำนวนขาย" });
            const unitPriceSatang = parseMoneyToSatang(byId("saleUnitPrice").value, { allowZero: true, label: "ราคาต่อชิ้น" });
            const receivedSatang = parseMoneyToSatang(byId("saleReceived").value, { allowZero: true, label: "เงินรับ" });
            const totalSatang = parseSatang(qty * unitPriceSatang, { allowZero: true, label: "ยอดขายรวม" });
            const hasShipping = Boolean(byId("saleHasShippingCost").checked);
            const shippingCostSatang = hasShipping
              ? parseMoneyToSatang(byId("saleShippingCost").value, { allowZero: false, label: "ค่าจัดส่ง" })
              : 0;
            if (receivedSatang > totalSatang || qty > state.store.stockQty) { toast("ตรวจเงินรับและสต็อก"); modalBusy = false; return; }
            const hasOutstanding = receivedSatang < totalSatang;
            const customer = hasOutstanding ? byId("saleCustomer").value.trim() : "ขายเงินสด";
            const due = hasOutstanding ? byId("saleDue").value : "";
            if (hasOutstanding && !customer) { toast("รายการค้างต้องมีชื่อลูกค้า"); modalBusy = false; return; }
            if (hasOutstanding && !validISODate(due)) { toast("รายการค้างต้องมีวันนัด"); modalBusy = false; return; }
            const costSatang = takeStockFromPool(state, qty);
            const id = uid("SALE");
            const createdAt = nowIso();
            const sale = {
              id, customer, contact: byId("saleContact").value.trim(), qty, unitPriceSatang, totalSatang,
              receivedSatang, outstandingSatang: totalSatang - receivedSatang, costSatang,
              shippingCostSatang, netCashEffectSatang: shippingNetEffect(receivedSatang, shippingCostSatang),
              status: receivedSatang === totalSatang ? "COMPLETED" : receivedSatang > 0 ? "PARTIAL" : "OPEN",
              note: byId("saleNote").value.trim(), date: localISO(), createdAt, updatedAt: createdAt,
              revision: 1, cancelledAt: null, stockRestored: false
            };
            state.store.sales.push(sale);
            if (receivedSatang > 0) addTransaction({ direction: "IN", amountSatang: receivedSatang, label: `รับเงินจริงจากบิล ${id}`, source: "STORE", sourceId: id, subtype: "SALE_INITIAL_RECEIPT", actionKey: `${id}:initial` });
            if (shippingCostSatang > 0) addTransaction({ direction: "OUT", amountSatang: shippingCostSatang, label: `ค่าจัดส่งบิล ${id}`, source: "STORE", sourceId: id, subtype: "SALE_SHIPPING_COST", actionKey: `${id}:shipping-cost` });
            if (sale.outstandingSatang > 0) addQueue({ source: "STORE", sourceId: id, actionType: "RECEIVE_CUSTOMER_PAYMENT", status: sale.status, amountSatang: sale.outstandingSatang, due, effects: { complete: "เพิ่มเงินจริงและลดยอดค้าง", cancel: "ยกเลิกบิล คืนสต็อก และย้อนเงิน" } });
            closeModal();
            await persistAndRender(`สร้างบิลขายแล้ว · สุทธิ ${money(sale.netCashEffectSatang)} บาท`);
          }
        });
        const toggle = byId("saleHasShippingCost");
        const field = byId("saleShippingCost");
        const fieldWrap = byId("saleShippingCostField");
        const syncShipping = () => {
          fieldWrap.hidden = !toggle.checked;
          field.disabled = !toggle.checked;
          toggle.setAttribute("aria-expanded", String(toggle.checked));
          if (!toggle.checked) field.value = "";
          else setTimeout(() => field.focus(), 0);
        };
        const syncOutstanding = () => {
          let hasOutstanding = false;
          try {
            const qty = parseQuantity(byId("saleQty")?.value, { label: "จำนวนขาย" });
            const unitPriceSatang = parseMoneyToSatang(byId("saleUnitPrice")?.value, { allowZero: true, label: "ราคาต่อชิ้น" });
            const receivedSatang = parseMoneyToSatang(byId("saleReceived")?.value, { allowZero: true, label: "เงินรับ" });
            const totalSatang = parseSatang(qty * unitPriceSatang, { allowZero: true, label: "ยอดขายรวม" });
            hasOutstanding = receivedSatang < totalSatang;
          } catch (_) {
            hasOutstanding = false;
          }
          [["saleCustomerField", "saleCustomer"], ["saleDueField", "saleDue"]].forEach(([wrapId, inputId]) => {
            const wrap = byId(wrapId);
            const input = byId(inputId);
            wrap.hidden = !hasOutstanding;
            input.disabled = !hasOutstanding;
            input.required = hasOutstanding;
          });
        };
        toggle.addEventListener("change", syncShipping);
        ["saleQty", "saleUnitPrice", "saleReceived"].forEach(id => {
          byId(id)?.addEventListener("input", syncOutstanding);
          byId(id)?.addEventListener("change", syncOutstanding);
        });
        syncShipping();
        syncOutstanding();
      };
    }

    function installDebtAction() {
      const button = typeof byId === "function" ? byId("addDebtBtn") : null;
      if (!button) return;
      button.onclick = () => openModal({
        title: "เพิ่มภาระ",
        text: "ระบบสร้างทุกงวดต่อเนื่องรายเดือนในปฏิทินจากวันครบกำหนดงวดแรก",
        body: `<div class="form-grid"><div class="field full"><label>รายละเอียด</label><input id="debtName" maxlength="120" placeholder="เช่น ค่ารถ"></div><div class="field full"><label>หมายเหตุเพิ่มเติม</label><input id="debtDetail" maxlength="180"></div><div class="field"><label>ยอดรวม</label><input id="debtAmount" type="number" min="0.01" step="0.01"></div><div class="field"><label>จำนวนงวด</label><input id="debtInstallments" type="number" min="1" max="120" step="1" value="1"></div><div class="field full"><label>วันครบกำหนดงวดแรก</label><input id="debtDue" type="date" value="${localISO()}"></div></div>`,
        confirm: "เพิ่มภาระ",
        onConfirm: async () => {
          const originalSatang = parseMoneyToSatang(byId("debtAmount").value, { allowZero: false, label: "ยอดภาระ" });
          const installmentCount = Number(byId("debtInstallments").value);
          const firstDue = byId("debtDue").value;
          if (!Number.isInteger(installmentCount) || installmentCount < 1 || installmentCount > MAX_INSTALLMENTS || originalSatang < installmentCount || !validISODate(firstDue)) { toast("ตรวจยอด จำนวนงวด 1–120 และวันครบกำหนด"); modalBusy = false; return; }
          const id = uid("OBL");
          const createdAt = nowIso();
          const amounts = splitInstallments(originalSatang, installmentCount);
          const dues = monthlyDueDates(firstDue, installmentCount);
          const obligation = { id, name: byId("debtName").value.trim() || "ภาระ", detail: byId("debtDetail").value.trim(), originalSatang, paidSatang: 0, remainingSatang: originalSatang, installmentCount, firstDue, installments: [], status: "OPEN", createdAt, updatedAt: createdAt, revision: 1, cancelledAt: null };
          state.ledger.obligations.push(obligation);
          amounts.forEach((amountSatang, index) => {
            const number = index + 1;
            const due = dues[index];
            const queue = addQueue({ source: "LEDGER", sourceId: id, actionType: installmentCount >= 2 ? "PAY_OBLIGATION_INSTALLMENT" : "PAY_OBLIGATION", amountSatang, due, effects: { complete: "หักเงินจริงและลดยอดภาระ", cancel: "ยกเลิกคิวและย้อนเฉพาะยอดที่จ่ายจากคิวนี้" } });
            queue.installmentNumber = number;
            queue.installmentCount = installmentCount;
            obligation.installments.push({ number, amountSatang, paidSatang: 0, due, status: "PENDING", queueId: queue.id, paidAt: null });
          });
          closeModal();
          await persistAndRender(`เพิ่มภาระ ${installmentCount} งวดในปฏิทินแล้ว`);
        }
      });
    }

    function repairMissingInstallments() {
      if (typeof state === "undefined" || !state?.ledger?.obligations || !Array.isArray(state.calendar)) return 0;
      let changed = 0;
      for (const obligation of state.ledger.obligations) {
        if (obligation.scheduleMode === "PER_INSTALLMENT") continue;
        const count = Number(obligation.installmentCount || 1);
        if (count <= 1 || obligation.status === "CANCELLED") continue;
        const firstDue = obligation.firstDue || obligation.installments?.[0]?.due;
        if (!firstDue) continue;
        let dues;
        let amounts;
        try {
          dues = monthlyDueDates(firstDue, count);
          amounts = splitInstallments(Number(obligation.originalSatang || 0), count);
        } catch (_) {
          continue;
        }
        obligation.installments = Array.isArray(obligation.installments) ? obligation.installments : [];
        const queues = state.calendar.filter(queue => queue.source === "LEDGER" && queue.sourceId === obligation.id);
        for (let index = 0; index < count; index++) {
          const number = index + 1;
          const due = dues[index];
          const amountSatang = amounts[index];
          let queue = queues.find(item => queueMatchesInstallment(item, obligation, number, due, amountSatang));
          if (!queue) {
            queue = addQueue({ source: "LEDGER", sourceId: obligation.id, actionType: "PAY_OBLIGATION_INSTALLMENT", amountSatang, due, effects: { complete: "หักเงินจริงและลดยอดภาระ", cancel: "ยกเลิกคิวและย้อนเฉพาะยอดที่จ่ายจากคิวนี้" } });
            queues.push(queue);
            changed++;
          }
          if (Number(queue.installmentNumber) !== number || Number(queue.installmentCount) !== count) {
            queue.installmentNumber = number;
            queue.installmentCount = count;
            changed++;
          }
          let installment = obligation.installments.find(item => Number(item.number) === number);
          if (!installment) {
            installment = { number, amountSatang, paidSatang: Number(queue.paidSatang || 0), due, status: queue.status === "COMPLETED" ? "COMPLETED" : Number(queue.paidSatang || 0) > 0 ? "PARTIAL" : "PENDING", queueId: queue.id, paidAt: queue.completedAt || null };
            obligation.installments.push(installment);
            changed++;
          } else {
            if (!installment.queueId) { installment.queueId = queue.id; changed++; }
            if (installment.due !== due && !["COMPLETED", "CANCELLED"].includes(queue.status)) { installment.due = due; changed++; }
          }
        }
      }
      return changed;
    }

    function acceptImportedQueues() {
      if (typeof state === "undefined" || !state?.calendar) return 0;
      let changed = 0;
      for (const item of state.calendar) {
        if (!isAcceptedImportedQueue(item) || ["COMPLETED", "CANCELLED"].includes(item.status)) continue;
        if (item.status === "VERIFY" || item.requiresRefreshBeforePayment) {
          item.status = Number(item.paidSatang || 0) > 0 ? "PARTIAL" : "OPEN";
          item.requiresRefreshBeforePayment = false;
          item.validUntil = null;
          item.verifiedAt ||= nowIso();
          item.verifiedNote ||= "ยืนยันพร้อมกับการนำเข้าผ่าน Review Center";
          const source = typeof findSource === "function" ? findSource(item.source, item.sourceId) : null;
          if (source) {
            item.expectedRevision = Number(source.revision || 1);
            item.sourceRevision = Number(source.revision || 1);
          }
          if (typeof addHistory === "function") addHistory(item, "IMPORT_ACCEPTED_AS_VERIFIED", item.verifiedNote);
          changed++;
        }
      }
      return changed;
    }

    function scheduleReconciliation() {
      if (reconciliationQueued || reconciliationBusy) return;
      reconciliationQueued = true;
      setTimeout(async () => {
        reconciliationQueued = false;
        if (reconciliationBusy || typeof state === "undefined" || !state || typeof cryptoKey === "undefined" || !cryptoKey) return;
        reconciliationBusy = true;
        try {
          const repaired = repairMissingInstallments();
          const accepted = acceptImportedQueues();
          if (repaired || accepted) {
            if (typeof addAudit === "function") addAudit("METROPOLIS_R5_RECONCILED", `installments=${repaired} imported=${accepted}`);
            await persistAndRender("", {
              eventType: "METROPOLIS_R5_RECONCILED",
              sourceDomain: "CORE",
              sourceOwner: "OWNER_APPROVED_RUNTIME",
              targetDomain: ["LEDGER", "CALENDAR"],
              idempotencyKey: `metropolis-r5:${state.revision}:${repaired}:${accepted}`,
              timestamp: nowIso()
            });
          }
        } catch (error) {
          console.error("METROPOLIS R5 RECONCILIATION FAILED", error);
        } finally {
          reconciliationBusy = false;
        }
      }, 40);
    }

    function installImportGatePatch() {
      if (globalThis.__YGPH_R5_IMPORT_GATE_PATCHED__) return;
      if (typeof needsLocalVerification !== "function" || typeof freshnessGate !== "function") return;
      const originalNeedsLocalVerification = needsLocalVerification;
      const originalFreshnessGate = freshnessGate;
      needsLocalVerification = function(item) {
        if (isAcceptedImportedQueue(item) && typeof integrityGate === "function" && integrityGate(item).state === "TRUSTED") return false;
        return originalNeedsLocalVerification(item);
      };
      freshnessGate = function(item) {
        if (isAcceptedImportedQueue(item)) return { state: "FRESH", cls: "fresh" };
        return originalFreshnessGate(item);
      };
      globalThis.__YGPH_R5_IMPORT_GATE_PATCHED__ = true;
    }

    function installReceivableAndReportPatch() {
      if (globalThis.__YGPH_R5_MONEY_PATCHED__) return;
      if (typeof receivableAt === "function") {
        receivableAt = function(end) {
          return state.store.sales.filter(sale => activeAt(sale, end)).reduce((sum, sale) => {
            const received = state.ledger.transactions
              .filter(tx => tx.source === "STORE" && tx.sourceId === sale.id && tx.direction === "IN" && ["SALE_INITIAL_RECEIPT", "SALE_RECEIPT"].includes(tx.subtype) && recordDate(tx) <= end && !tx.reversedBy && !(typeof isReclassifiedReceipt === "function" && isReclassifiedReceipt(tx)))
              .reduce((value, tx) => value + Number(tx.amountSatang || 0), 0);
            return sum + Math.max(0, Number(sale.totalSatang || 0) - received);
          }, 0);
        };
      }
      if (typeof buildReportData === "function") {
        const originalBuildReportData = buildReportData;
        buildReportData = function(start, end) {
          const report = originalBuildReportData(start, end);
          const shippingOut = state.ledger.transactions
            .filter(tx => tx.source === "STORE" && tx.subtype === "SALE_SHIPPING_COST" && tx.direction === "OUT" && recordDate(tx) >= start && recordDate(tx) <= end && !tx.reversedBy)
            .reduce((sum, tx) => sum + Number(tx.amountSatang || 0), 0);
          report.store.cashInSatang = Number(report.store.cashInSatang || 0) - shippingOut;
          return report;
        };
      }
      globalThis.__YGPH_R5_MONEY_PATCHED__ = true;
    }

    function polishLauncher() {
      const icons = { store: iconSvg("store"), ride: iconSvg("ride"), ledger: iconSvg("ledger"), calendar: iconSvg("calendar") };
      document.querySelectorAll("[data-metropolis-app]").forEach(card => {
        const app = card.dataset.metropolisApp;
        if (!icons[app]) return;
        const target = card.querySelector(".metropolis-app-icon");
        if (target && target.dataset.r5Applied !== "true") {
          target.innerHTML = icons[app];
          target.dataset.r5Applied = "true";
        }
        card.querySelectorAll(".metropolis-open-mark").forEach(node => node.remove());
      });
      const page = document.body.dataset.metropolisPage;
      const current = document.getElementById("metropolisCurrentIcon");
      if (current && icons[page]) current.innerHTML = icons[page];
    }

    function runPostRenderWork() {
      polishLauncher();
      scheduleReconciliation();
    }

    function installRuntimeHooks() {
      if (!globalThis.YGPHRuntime?.register) return;
      globalThis.YGPHRuntime.register("METROPOLIS_R5", {
        afterRender: runPostRenderWork,
        afterPageChange: runPostRenderWork
      });
    }

    function install() {
      if (installed) return;
      if (typeof byId !== "function" || typeof openModal !== "function" || typeof renderAll !== "function") {
        setTimeout(install, 40);
        return;
      }
      installed = true;
      globalThis.YGPH_METROPOLIS_R5_VERSION = METROPOLIS_R5_VERSION;
      document.documentElement.dataset.metropolisR5 = METROPOLIS_R5_VERSION;
      installImportGatePatch();
      installReceivableAndReportPatch();
      installSaleAction();
      installDebtAction();
      installRuntimeHooks();
      runPostRenderWork();
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
    else install();
  })();
}
