"use strict";

/* YGPH METROPOLIS 4.2 — per-installment schedule engine */

const METROPOLIS_42_PRODUCT_VERSION = "4.2.0";
const METROPOLIS_R5_2_VERSION = "5.2.0-schedule-engine";
const SCHEDULE_FREQUENCIES = Object.freeze(["WEEKLY", "MONTHLY"]);

function metropolisProductVersion() {
  try {
    const claimed = globalThis.YGPH_METROPOLIS_PRODUCT_VERSION;
    return typeof claimed === "string" && claimed ? claimed : METROPOLIS_42_PRODUCT_VERSION;
  } catch (_) {
    return METROPOLIS_42_PRODUCT_VERSION;
  }
}

function parseScheduleDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));
  if (!match) throw new Error("วันที่ไม่ถูกต้อง");
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) throw new Error("วันที่ไม่ถูกต้อง");
  return { year, month, day };
}

function isoFromUTCDate(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function addDaysIso(value, days) {
  const { year, month, day } = parseScheduleDate(value);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + Number(days || 0));
  return isoFromUTCDate(date);
}

function addMonthsAnchored(value, offset) {
  const { year, month, day } = parseScheduleDate(value);
  const monthIndex = year * 12 + (month - 1) + Number(offset || 0);
  const targetYear = Math.floor(monthIndex / 12);
  const targetMonth = ((monthIndex % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  return `${targetYear}-${String(targetMonth + 1).padStart(2, "0")}-${String(Math.min(day, lastDay)).padStart(2, "0")}`;
}

function normalizeScheduleFrequency(value) {
  const frequency = String(value || "").toUpperCase();
  if (!SCHEDULE_FREQUENCIES.includes(frequency)) throw new Error("ความถี่ไม่ถูกต้อง");
  return frequency;
}

function scheduleDueDates(firstDue, count, frequency) {
  const total = Number(count);
  const cadence = normalizeScheduleFrequency(frequency);
  parseScheduleDate(firstDue);
  if (!Number.isInteger(total) || total < 1 || total > 120) throw new Error("จำนวนงวดไม่ถูกต้อง");
  return Array.from({ length: total }, (_, index) => cadence === "WEEKLY"
    ? addDaysIso(firstDue, index * 7)
    : addMonthsAnchored(firstDue, index));
}

function shiftDueOneInterval(due, frequency) {
  const cadence = normalizeScheduleFrequency(frequency);
  return cadence === "WEEKLY" ? addDaysIso(due, 7) : addMonthsAnchored(due, 1);
}

function totalFromInstallment(installmentSatang, count) {
  const amount = Number(installmentSatang);
  const installments = Number(count);
  if (!Number.isSafeInteger(amount) || amount < 1) throw new Error("ยอดต่องวดไม่ถูกต้อง");
  if (!Number.isInteger(installments) || installments < 1 || installments > 120) throw new Error("จำนวนงวดไม่ถูกต้อง");
  const total = amount * installments;
  if (!Number.isSafeInteger(total)) throw new Error("ยอดรวมสูงเกินขอบเขตที่รองรับ");
  return total;
}

function derivePerInstallmentSchedule(obligation) {
  if (!obligation || obligation.scheduleMode !== "PER_INSTALLMENT") throw new Error("ไม่ใช่ภาระแบบยอดต่องวด");
  const count = Number(obligation.installmentCount || 1);
  const amount = Number(obligation.installmentAmountSatang || 0);
  const dues = scheduleDueDates(obligation.firstDue, count, obligation.scheduleFrequency || "MONTHLY");
  const existing = Array.isArray(obligation.installments) ? obligation.installments : [];
  return Array.from({ length: count }, (_, index) => {
    const number = index + 1;
    const saved = existing.find(item => Number(item.number) === number);
    return {
      number,
      amountSatang: Number(saved?.amountSatang ?? amount),
      due: saved?.due || dues[index]
    };
  });
}

if (typeof module === "object" && module.exports) {
  module.exports = {
    METROPOLIS_PRODUCT_VERSION: METROPOLIS_42_PRODUCT_VERSION,
    METROPOLIS_R5_2_VERSION,
    metropolisProductVersion,
    scheduleDueDates,
    totalFromInstallment,
    shiftDueOneInterval,
    derivePerInstallmentSchedule
  };
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  (() => {
    let installed = false;
    let reconcileBusy = false;
    let reconcileQueued = false;
    let observerQueued = false;

    function applyProductVersion42() {
      const root = document.documentElement;
      const visibleVersion = metropolisProductVersion();
      root.dataset.metropolisR52 = METROPOLIS_R5_2_VERSION;
      root.dataset.metropolisVersion = visibleVersion;
      const expectedTitle = `YGPH METROPOLIS v${visibleVersion}`;
      if (document.title !== expectedTitle) document.title = expectedTitle;
      const status = document.querySelector(".status-line b");
      if (status && status.textContent !== `METROPOLIS v${visibleVersion}`) status.textContent = `METROPOLIS v${visibleVersion}`;
    }

    function displayScheduleMoney(satang) {
      try { return `${money(satang)} บาท`; } catch (_) { return `${(Number(satang || 0) / 100).toLocaleString("th-TH", { maximumFractionDigits: 2 })} บาท`; }
    }

    function displayScheduleDate(date) {
      try { return dateTH(date); } catch (_) { return date; }
    }

    function queueForInstallment(sourceId, number) {
      if (typeof state === "undefined" || !Array.isArray(state?.calendar)) return null;
      return state.calendar.find(queue => queue.source === "LEDGER" && queue.sourceId === sourceId && Number(queue.installmentNumber) === Number(number)) || null;
    }

    function recomputeObligation(source) {
      source.installments = Array.isArray(source.installments) ? source.installments : [];
      source.installments.sort((a, b) => Number(a.number) - Number(b.number));
      const total = source.installments.reduce((sum, installment) => sum + Number(installment.amountSatang || 0), 0);
      const paid = source.installments.reduce((sum, installment) => sum + Number(installment.paidSatang || 0), 0);
      source.originalSatang = total;
      source.paidSatang = paid;
      source.remainingSatang = Math.max(0, total - paid);
      source.firstDue = source.installments.find(item => Number(item.number) === 1)?.due || source.firstDue;
      source.status = source.remainingSatang === 0 ? "COMPLETED" : paid > 0 ? "PARTIAL" : "OPEN";
    }

    function syncDueFields(queue, due) {
      queue.due = due;
      queue.dueAt = `${due}T09:00:00+07:00`;
      queue.triggerAt = queue.dueAt;
    }

    function installDebtAction42() {
      const button = typeof byId === "function" ? byId("addDebtBtn") : null;
      if (!button) return;
      button.onclick = () => {
        openModal({
          title: "เพิ่มภาระ",
          text: "กรอกยอดต่องวด แล้วให้ปฏิทินสร้างตารางจ่ายรายสัปดาห์หรือรายเดือน",
          body: `<div class="form-grid">
            <div class="field full"><label>รายละเอียด</label><input id="debtName" maxlength="120" placeholder="เช่น ค่ารถ"></div>
            <div class="field full"><label>หมายเหตุเพิ่มเติม</label><input id="debtDetail" maxlength="180"></div>
            <div class="field"><label>ยอดต่องวด</label><input id="debtInstallmentAmount" type="number" min="0.01" step="0.01" inputmode="decimal"></div>
            <div class="field"><label>จำนวนงวด</label><input id="debtInstallments" type="number" min="1" max="120" step="1" value="1"></div>
            <div class="field"><label>ความถี่</label><select id="debtFrequency"><option value="MONTHLY">รายเดือน</option><option value="WEEKLY">รายสัปดาห์</option></select></div>
            <div class="field"><label>วันครบกำหนดงวดแรก</label><input id="debtDue" type="date" value="${localISO()}"></div>
            <div class="field full"><div id="debtSchedulePreview" class="r52-schedule-preview"><small>กรอกยอดต่องวดเพื่อดูตารางก่อนบันทึก</small></div></div>
          </div>`,
          confirm: "เพิ่มภาระ",
          onConfirm: async () => {
            const installmentAmountSatang = parseMoneyToSatang(byId("debtInstallmentAmount").value, { allowZero: false, label: "ยอดต่องวด" });
            const installmentCount = Number(byId("debtInstallments").value);
            const scheduleFrequency = normalizeScheduleFrequency(byId("debtFrequency").value);
            const firstDue = byId("debtDue").value;
            if (!Number.isInteger(installmentCount) || installmentCount < 1 || installmentCount > MAX_INSTALLMENTS || !validISODate(firstDue)) {
              toast("ตรวจจำนวนงวดและวันครบกำหนด"); modalBusy = false; return;
            }
            const originalSatang = totalFromInstallment(installmentAmountSatang, installmentCount);
            const dues = scheduleDueDates(firstDue, installmentCount, scheduleFrequency);
            const id = uid("OBL");
            const createdAt = nowIso();
            const obligation = {
              id,
              name: byId("debtName").value.trim() || "ภาระ",
              detail: byId("debtDetail").value.trim(),
              scheduleMode: "PER_INSTALLMENT",
              scheduleFrequency,
              installmentAmountSatang,
              originalSatang,
              paidSatang: 0,
              remainingSatang: originalSatang,
              installmentCount,
              firstDue,
              installments: [],
              status: "OPEN",
              createdAt,
              updatedAt: createdAt,
              revision: 1,
              cancelledAt: null
            };
            state.ledger.obligations.push(obligation);
            dues.forEach((due, index) => {
              const number = index + 1;
              const queue = addQueue({
                source: "LEDGER",
                sourceId: id,
                actionType: installmentCount >= 2 ? "PAY_OBLIGATION_INSTALLMENT" : "PAY_OBLIGATION",
                status: "OPEN",
                amountSatang: installmentAmountSatang,
                due,
                effects: { complete: "หักเงินจริงและลดยอดภาระ", cancel: "ยกเลิกคิวและย้อนเฉพาะยอดที่จ่ายจากคิวนี้" }
              });
              queue.installmentNumber = number;
              queue.installmentCount = installmentCount;
              obligation.installments.push({ number, amountSatang: installmentAmountSatang, paidSatang: 0, due, status: "PENDING", queueId: queue.id, paidAt: null });
            });
            closeModal();
            await persistAndRender(`เพิ่ม ${installmentCount} งวด · รวม ${displayScheduleMoney(originalSatang)}`);
          }
        });

        const updatePreview = () => {
          const preview = byId("debtSchedulePreview");
          if (!preview) return;
          try {
            const raw = byId("debtInstallmentAmount")?.value;
            if (!raw) { preview.innerHTML = "<small>กรอกยอดต่องวดเพื่อดูตารางก่อนบันทึก</small>"; return; }
            const amount = parseMoneyToSatang(raw, { allowZero: false, label: "ยอดต่องวด" });
            const count = Number(byId("debtInstallments")?.value || 0);
            const frequency = normalizeScheduleFrequency(byId("debtFrequency")?.value);
            const firstDue = byId("debtDue")?.value;
            const total = totalFromInstallment(amount, count);
            const dues = scheduleDueDates(firstDue, count, frequency);
            preview.innerHTML = `<b>${count} งวด × ${displayScheduleMoney(amount)} = รวม ${displayScheduleMoney(total)}</b><div class="r52-preview-list">${dues.map((due, index) => `<span><strong>${index + 1}</strong><em>${displayScheduleDate(due)}</em><b>${displayScheduleMoney(amount)}</b></span>`).join("")}</div>`;
          } catch (_) {
            preview.innerHTML = "<small>กรอกยอด จำนวนงวด ความถี่ และวันแรกให้ครบ</small>";
          }
        };
        ["debtInstallmentAmount", "debtInstallments", "debtFrequency", "debtDue"].forEach(id => {
          const element = byId(id);
          element?.addEventListener("input", updatePreview);
          element?.addEventListener("change", updatePreview);
        });
        updatePreview();
      };
    }

    function repairPerInstallmentObligations() {
      if (typeof state === "undefined" || !Array.isArray(state?.ledger?.obligations) || !Array.isArray(state?.calendar)) return 0;
      let changed = 0;
      for (const source of state.ledger.obligations) {
        if (source.scheduleMode !== "PER_INSTALLMENT" || source.status === "CANCELLED") continue;
        let schedule;
        try { schedule = derivePerInstallmentSchedule(source); } catch (_) { continue; }
        source.installments = Array.isArray(source.installments) ? source.installments : [];
        for (const expected of schedule) {
          let installment = source.installments.find(item => Number(item.number) === expected.number);
          if (!installment) {
            installment = { number: expected.number, amountSatang: expected.amountSatang, paidSatang: 0, due: expected.due, status: "PENDING", queueId: null, paidAt: null };
            source.installments.push(installment);
            changed++;
          }
          const savedAmount = Number(installment.amountSatang || expected.amountSatang);
          const savedDue = installment.due || expected.due;
          let queue = installment.queueId ? state.calendar.find(item => item.id === installment.queueId) : null;
          queue ||= queueForInstallment(source.id, expected.number);
          if (!queue) {
            queue = addQueue({
              source: "LEDGER",
              sourceId: source.id,
              actionType: Number(source.installmentCount) >= 2 ? "PAY_OBLIGATION_INSTALLMENT" : "PAY_OBLIGATION",
              status: Number(installment.paidSatang || 0) > 0 ? "PARTIAL" : "OPEN",
              amountSatang: savedAmount,
              due: savedDue,
              effects: { complete: "หักเงินจริงและลดยอดภาระ", cancel: "ยกเลิกคิวและย้อนเฉพาะยอดที่จ่ายจากคิวนี้" }
            });
            queue.paidSatang = Number(installment.paidSatang || 0);
            queue.installmentNumber = expected.number;
            queue.installmentCount = Number(source.installmentCount || schedule.length);
            installment.queueId = queue.id;
            changed++;
          } else {
            if (!installment.queueId) { installment.queueId = queue.id; changed++; }
            if (Number(queue.installmentNumber) !== expected.number) { queue.installmentNumber = expected.number; changed++; }
            if (Number(queue.installmentCount) !== Number(source.installmentCount)) { queue.installmentCount = Number(source.installmentCount); changed++; }
            if (!["COMPLETED", "CANCELLED"].includes(queue.status)) {
              if (Number(queue.amountSatang || 0) !== savedAmount) { queue.amountSatang = savedAmount; changed++; }
              if (queue.due !== savedDue) { syncDueFields(queue, savedDue); changed++; }
            }
          }
        }
        source.installments.sort((a, b) => Number(a.number) - Number(b.number));
      }
      return changed;
    }

    function schedule42Reconciliation() {
      if (reconcileQueued || reconcileBusy) return;
      reconcileQueued = true;
      setTimeout(async () => {
        reconcileQueued = false;
        if (reconcileBusy || typeof state === "undefined" || !state || typeof cryptoKey === "undefined" || !cryptoKey) return;
        reconcileBusy = true;
        try {
          const repaired = repairPerInstallmentObligations();
          if (repaired) {
            if (typeof addAudit === "function") addAudit("METROPOLIS_R52_RECONCILED", `records=${repaired}`);
            await persistAndRender("", {
              eventType: "METROPOLIS_R52_RECONCILED",
              sourceDomain: "LEDGER",
              sourceOwner: "SCHEDULE_ENGINE",
              targetDomain: ["LEDGER", "CALENDAR"],
              idempotencyKey: `metropolis-r52:${state.revision}:${repaired}`,
              timestamp: nowIso()
            });
          }
        } catch (error) {
          console.error("METROPOLIS 4.2 RECONCILIATION FAILED", error);
        } finally {
          reconcileBusy = false;
        }
      }, 70);
    }

    function activeInstallmentPairs(source, fromNumber = 1) {
      const pairs = [];
      const installments = Array.isArray(source.installments) ? source.installments : [];
      for (const installment of installments) {
        if (Number(installment.number) < Number(fromNumber)) continue;
        const queue = installment.queueId ? state.calendar.find(item => item.id === installment.queueId) : queueForInstallment(source.id, installment.number);
        if (!queue || ["COMPLETED", "CANCELLED"].includes(queue.status) || ["COMPLETED", "CANCELLED"].includes(installment.status)) continue;
        pairs.push({ installment, queue });
      }
      return pairs.sort((a, b) => Number(a.installment.number) - Number(b.installment.number));
    }

    function applyInstallmentEdit(queueId, { scope, amountSatang, due, frequency }) {
      const queue = findQueue(queueId);
      const source = queue && findSource(queue.source, queue.sourceId);
      if (!queue || !source || source.scheduleMode !== "PER_INSTALLMENT") throw new Error("ไม่พบตารางงวด 4.2");
      const selectedNumber = Number(queue.installmentNumber || 1);
      const selected = source.installments?.find(item => Number(item.number) === selectedNumber);
      if (!selected || ["COMPLETED", "CANCELLED"].includes(queue.status) || ["COMPLETED", "CANCELLED"].includes(selected.status)) throw new Error("งวดนี้ปิดแล้ว");
      const cadence = normalizeScheduleFrequency(frequency || source.scheduleFrequency || "MONTHLY");
      parseScheduleDate(due);
      if (!Number.isSafeInteger(amountSatang) || amountSatang < 1) throw new Error("ยอดต่องวดไม่ถูกต้อง");

      if (scope === "EDIT_THIS") {
        if (amountSatang < Number(selected.paidSatang || 0)) throw new Error("ยอดใหม่ต่ำกว่ายอดที่จ่ายแล้ว");
        selected.amountSatang = amountSatang;
        selected.due = due;
        queue.amountSatang = amountSatang;
        syncDueFields(queue, due);
        addHistory(queue, "SCHEDULE_EDIT_THIS", `${due} · ${displayScheduleMoney(amountSatang)}`);
      } else if (scope === "EDIT_FUTURE") {
        const pairs = activeInstallmentPairs(source, selectedNumber);
        const dueMap = new Map(scheduleDueDates(due, Number(source.installmentCount) - selectedNumber + 1, cadence).map((date, index) => [selectedNumber + index, date]));
        for (const pair of pairs) {
          if (amountSatang < Number(pair.installment.paidSatang || 0)) throw new Error(`งวด ${pair.installment.number} มียอดจ่ายแล้วสูงกว่ายอดใหม่`);
          pair.installment.amountSatang = amountSatang;
          pair.installment.due = dueMap.get(Number(pair.installment.number));
          pair.queue.amountSatang = amountSatang;
          syncDueFields(pair.queue, pair.installment.due);
          addHistory(pair.queue, "SCHEDULE_EDIT_FUTURE", `${pair.installment.due} · ${displayScheduleMoney(amountSatang)}`);
        }
        source.scheduleFrequency = cadence;
        source.installmentAmountSatang = amountSatang;
      } else {
        throw new Error("ขอบเขตการแก้ไขไม่ถูกต้อง");
      }

      recomputeObligation(source);
      bumpSource(source);
      syncQueueRevisionsForSource("LEDGER", source.id);
      return source;
    }

    async function skipInstallmentInterval(queueId) {
      const queue = findQueue(queueId);
      const source = queue && findSource(queue.source, queue.sourceId);
      if (!queue || !source || source.scheduleMode !== "PER_INSTALLMENT") return toast("ไม่พบตารางงวด 4.2");
      const selectedNumber = Number(queue.installmentNumber || 1);
      const cadence = normalizeScheduleFrequency(source.scheduleFrequency || "MONTHLY");
      const pairs = activeInstallmentPairs(source, selectedNumber);
      if (!pairs.length) return toast("ไม่มีงวดที่เลื่อนได้");
      for (const pair of pairs) {
        pair.installment.due = shiftDueOneInterval(pair.installment.due || pair.queue.due, cadence);
        syncDueFields(pair.queue, pair.installment.due);
        addHistory(pair.queue, "SCHEDULE_INTERVAL_SKIPPED", `เลื่อนไป ${pair.installment.due}`);
      }
      recomputeObligation(source);
      bumpSource(source);
      syncQueueRevisionsForSource("LEDGER", source.id);
      closeModal();
      await persistAndRender("ข้ามรอบนี้แล้ว · ยอดหนี้ไม่เปลี่ยน");
    }

    async function settleObligationEarly(queueId) {
      const queue = findQueue(queueId);
      const source = queue && findSource(queue.source, queue.sourceId);
      if (!queue || !source || source.scheduleMode !== "PER_INSTALLMENT") return toast("ไม่พบตารางงวด 4.2");
      const cancelledOutstanding = (source.installments || []).some(item => item.status === "CANCELLED" && Number(item.amountSatang || 0) > Number(item.paidSatang || 0));
      if (cancelledOutstanding) return toast("มีงวดที่ยกเลิกค้างอยู่ ต้องจัดการงวดนั้นก่อน");
      const pairs = activeInstallmentPairs(source, 1);
      if (!pairs.length) return toast("ไม่มีงวดคงเหลือ");
      let paidNow = 0;
      for (const pair of pairs) {
        const remaining = Math.max(0, Number(pair.installment.amountSatang || 0) - Number(pair.installment.paidSatang || 0));
        if (remaining > 0) {
          const actionKey = `${pair.queue.id}:payment:early-close`;
          const tx = addTransaction({
            direction: "OUT",
            amountSatang: remaining,
            label: `ปิดภาระ ${source.name} งวด ${pair.installment.number}`,
            source: "LEDGER",
            sourceId: source.id,
            subtype: "OBLIGATION_PAYMENT",
            actionKey
          });
          if (!tx) throw new Error(`บันทึกจ่ายงวด ${pair.installment.number} ไม่สำเร็จ`);
          paidNow += remaining;
          pair.installment.paidSatang = Number(pair.installment.paidSatang || 0) + remaining;
          pair.queue.paidSatang = Number(pair.queue.paidSatang || 0) + remaining;
        }
        pair.installment.status = "COMPLETED";
        pair.installment.paidAt = nowIso();
        pair.queue.status = "COMPLETED";
        pair.queue.completedAt = nowIso();
        addHistory(pair.queue, "PAYMENT_APPLIED", `OUT ${displayScheduleMoney(Math.max(0, Number(pair.installment.amountSatang || 0)))}`);
      }
      recomputeObligation(source);
      source.remainingSatang = 0;
      source.status = "COMPLETED";
      bumpSource(source);
      for (const pair of pairs) {
        pair.queue.expectedRevision = source.revision;
        pair.queue.sourceRevision = source.revision;
        bumpQueue(pair.queue);
      }
      closeModal();
      await persistAndRender(`ปิดภาระทั้งหมดแล้ว · −${displayScheduleMoney(paidNow)}`);
    }

    function openInstallmentManager(queueId) {
      const queue = findQueue(queueId);
      const source = queue && findSource(queue.source, queue.sourceId);
      if (!queue || !source || source.scheduleMode !== "PER_INSTALLMENT") return toast("ไม่พบตารางงวด 4.2");
      const installment = source.installments?.find(item => Number(item.number) === Number(queue.installmentNumber));
      if (!installment) return toast("ไม่พบข้อมูลงวด");
      openModal({
        title: `จัดการงวด ${installment.number}/${source.installmentCount}`,
        text: `${source.name} · จ่ายแล้ว ${displayScheduleMoney(installment.paidSatang || 0)}`,
        body: `<div class="form-grid r52-manager">
          <div class="field"><label>ยอดงวด</label><input id="manageInstallmentAmount" type="number" min="0.01" step="0.01" value="${satangToBaht(installment.amountSatang)}"></div>
          <div class="field"><label>วันกำหนด</label><input id="manageInstallmentDue" type="date" value="${installment.due}"></div>
          <div class="field"><label>ความถี่ต่อจากนี้</label><select id="manageInstallmentFrequency"><option value="MONTHLY" ${source.scheduleFrequency === "MONTHLY" ? "selected" : ""}>รายเดือน</option><option value="WEEKLY" ${source.scheduleFrequency === "WEEKLY" ? "selected" : ""}>รายสัปดาห์</option></select></div>
          <div class="field"><label>แก้ขอบเขต</label><select id="manageInstallmentScope"><option value="EDIT_THIS">เฉพาะงวดนี้</option><option value="EDIT_FUTURE">งวดนี้และงวดถัดไป</option></select></div>
          <div class="field full r52-manager-actions"><button type="button" class="edit" id="r52SkipInterval">ข้ามรอบนี้</button><button type="button" class="cancel" id="r52EarlySettle">ปิดภาระทั้งหมด</button></div>
        </div>`,
        confirm: "บันทึกงวด",
        onConfirm: async () => {
          try {
            const amountSatang = parseMoneyToSatang(byId("manageInstallmentAmount").value, { allowZero: false, label: "ยอดงวด" });
            const due = byId("manageInstallmentDue").value;
            const frequency = byId("manageInstallmentFrequency").value;
            const scope = byId("manageInstallmentScope").value;
            applyInstallmentEdit(queueId, { scope, amountSatang, due, frequency });
            closeModal();
            await persistAndRender(scope === "EDIT_FUTURE" ? "แก้งวดนี้และงวดถัดไปแล้ว" : "แก้งวดนี้แล้ว");
          } catch (error) {
            toast(error.message || "แก้งวดไม่สำเร็จ");
            modalBusy = false;
          }
        }
      });
      byId("r52SkipInterval")?.addEventListener("click", () => {
        openModal({ title: "ข้ามรอบนี้", text: "เลื่อนงวดนี้และงวดถัดไปหนึ่งรอบ โดยยอดหนี้ไม่ลด", confirm: "ยืนยันข้ามรอบ", onConfirm: () => skipInstallmentInterval(queueId) });
      });
      byId("r52EarlySettle")?.addEventListener("click", () => {
        openModal({ title: "ปิดภาระทั้งหมด", text: `จ่ายยอดคงเหลือของ ${source.name} ตอนนี้และปิดทุกงวดที่ยังเปิดอยู่`, confirm: "ยืนยันจ่ายทั้งหมด", onConfirm: () => settleObligationEarly(queueId) });
      });
    }

    function decorateInstallmentActions() {
      if (typeof state === "undefined" || !state) return;
      document.querySelectorAll("[data-move]").forEach(button => {
        if (button.dataset.r52Manager === "true") return;
        const queue = findQueue(button.dataset.move);
        const source = queue && findSource(queue.source, queue.sourceId);
        if (!queue || !source || source.scheduleMode !== "PER_INSTALLMENT" || !["PAY_OBLIGATION", "PAY_OBLIGATION_INSTALLMENT"].includes(queue.actionType)) return;
        if (["COMPLETED", "CANCELLED"].includes(queue.status)) return;
        button.textContent = "จัดการงวด";
        button.dataset.r52Manager = "true";
        button.onclick = event => {
          event.preventDefault();
          event.stopPropagation();
          openInstallmentManager(queue.id);
        };
      });
    }

    function queueObserverWork() {
      if (observerQueued) return;
      observerQueued = true;
      requestAnimationFrame(() => {
        observerQueued = false;
        applyProductVersion42();
        decorateInstallmentActions();
        schedule42Reconciliation();
      });
    }

    function install() {
      if (installed) return;
      if (typeof byId !== "function" || typeof openModal !== "function" || typeof renderAll !== "function") {
        setTimeout(install, 40);
        return;
      }
      installed = true;
      globalThis.YGPH_METROPOLIS_R5_2_VERSION = METROPOLIS_R5_2_VERSION;
      if (!globalThis.YGPH_METROPOLIS_PRODUCT_VERSION) {
        globalThis.YGPH_METROPOLIS_PRODUCT_VERSION = METROPOLIS_42_PRODUCT_VERSION;
      }
      document.documentElement.dataset.metropolisR52 = METROPOLIS_R5_2_VERSION;
      applyProductVersion42();
      installDebtAction42();
      decorateInstallmentActions();
      schedule42Reconciliation();
      const observer = new MutationObserver(queueObserverWork);
      observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "data-metropolis-page"] });
      globalThis.__YGPH_METROPOLIS_42_OBSERVER__ = observer;
      setTimeout(queueObserverWork, 100);
      setTimeout(queueObserverWork, 400);
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
    else install();
  })();
}
