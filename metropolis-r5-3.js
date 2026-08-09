"use strict";

/* YGPH METROPOLIS — three-color live status signal + live-only render boundary */

const METROPOLIS_R5_3_VERSION = "5.3.3-live-authority";
const STATUS_SIGNALS = Object.freeze({ GREEN: "GREEN", YELLOW: "YELLOW", RED: "RED", HIDDEN: "HIDDEN" });

function statusSignal(item, today) {
  if (!item) return STATUS_SIGNALS.HIDDEN;
  const status = String(item.status || "").toUpperCase();
  if (status === "CANCELLED") return STATUS_SIGNALS.HIDDEN;
  if (status === "COMPLETED") return STATUS_SIGNALS.GREEN;
  const due = String(item.due || "").slice(0, 10);
  const now = String(today || "").slice(0, 10);
  if (due && now && due < now) return STATUS_SIGNALS.RED;
  return STATUS_SIGNALS.YELLOW;
}

function liveStatusSignal(item, sourceStatus, today) {
  if (String(sourceStatus || "").toUpperCase() === "CANCELLED") return STATUS_SIGNALS.HIDDEN;
  return statusSignal(item, today);
}

function selectLiveRecords(records) {
  return Array.isArray(records)
    ? records.filter(record => String(record?.status || "").toUpperCase() !== "CANCELLED")
    : [];
}

function selectLiveCalendar(calendar, sourceStatusOf = () => null, today = "") {
  return Array.isArray(calendar)
    ? calendar.filter(item => liveStatusSignal(item, sourceStatusOf(item), today) !== STATUS_SIGNALS.HIDDEN)
    : [];
}

if (typeof module === "object" && module.exports) {
  module.exports = {
    METROPOLIS_R5_3_VERSION,
    STATUS_SIGNALS,
    statusSignal,
    liveStatusSignal,
    selectLiveRecords,
    selectLiveCalendar
  };
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  (() => {
    let queued = false;

    function todayKey() {
      return typeof localISO === "function" ? localISO() : new Date().toISOString().slice(0, 10);
    }

    function sourceStatusOf(item) {
      if (!item || typeof findSource !== "function") return null;
      return findSource(item.source, item.sourceId)?.status || null;
    }

    function liveCalendar() {
      if (typeof state === "undefined" || !state) return [];
      return selectLiveCalendar(state.calendar, sourceStatusOf, todayKey());
    }

    function queueSignal(item) {
      if (!item) return STATUS_SIGNALS.HIDDEN;
      return liveStatusSignal(item, sourceStatusOf(item), todayKey());
    }

    function signalClass(signal) {
      return `r53-status-${String(signal || "").toLowerCase()}`;
    }

    function signalLabel(signal) {
      if (signal === STATUS_SIGNALS.GREEN) return "เสร็จแล้ว";
      if (signal === STATUS_SIGNALS.RED) return "เกินกำหนด";
      return "รอดำเนินการ";
    }

    function paintMonthGrid() {
      if (typeof state === "undefined" || !Array.isArray(state?.calendar)) return;
      const today = todayKey();
      const selected = selectLiveCalendar(state.calendar, sourceStatusOf, today);
      document.querySelectorAll("#monthGrid .day-cell[data-date]").forEach(cell => {
        const date = cell.dataset.date;
        const items = selected.filter(item => item.due === date);
        let count = cell.querySelector(".day-count");
        if (items.length) {
          if (!count) {
            count = document.createElement("span");
            count.className = "day-count";
            cell.querySelector(".day-num")?.after(count);
          }
          count.textContent = String(items.length);
        } else {
          count?.remove();
        }
        const dots = cell.querySelector(".day-dots");
        if (dots) {
          dots.innerHTML = items.slice(0, 5).map(item => {
            const signal = statusSignal(item, today);
            return `<span class="r53-day-dot ${signalClass(signal)}" aria-hidden="true"></span>`;
          }).join("");
        }
      });
    }

    function queueIdFromCard(card) {
      const action = card.querySelector("[data-history],[data-cancel],[data-move],[data-full],[data-partial],[data-complete],[data-refresh],[data-verify-edit]");
      if (!action) return null;
      return action.dataset.history || action.dataset.cancel || action.dataset.move || action.dataset.full || action.dataset.partial || action.dataset.complete || action.dataset.refresh || action.dataset.verifyEdit || null;
    }

    function ensureInlineDot(container, signal) {
      if (!container) return;
      let dot = container.querySelector(":scope > .r53-status-dot");
      if (!dot) {
        dot = document.createElement("span");
        dot.className = "r53-status-dot";
        dot.setAttribute("aria-hidden", "true");
        container.prepend(dot);
      }
      dot.className = `r53-status-dot ${signalClass(signal)}`;
      dot.title = signalLabel(signal);
    }

    function paintQueueCards() {
      if (typeof findQueue !== "function") return;
      document.querySelectorAll("#queueList .queue-item").forEach(card => {
        const queue = findQueue(queueIdFromCard(card));
        const signal = queueSignal(queue);
        if (signal === STATUS_SIGNALS.HIDDEN) {
          card.remove();
          return;
        }
        ensureInlineDot(card.querySelector(".queue-title > b"), signal);
        const status = card.querySelector(".status");
        if (status) {
          status.classList.remove("r53-status-green", "r53-status-yellow", "r53-status-red");
          status.classList.add(signalClass(signal));
        }
      });
      const list = document.getElementById("queueList");
      if (list && !list.querySelector(".queue-item") && !list.querySelector(".empty")) {
        list.innerHTML = '<div class="empty">ไม่มีรายการตามตัวกรองนี้</div>';
      }
    }

    function paintHomeTasks() {
      if (typeof findQueue !== "function") return;
      document.querySelectorAll(".flow-task-row[data-flow-task]").forEach(row => {
        const queue = findQueue(row.dataset.flowTask);
        const signal = queueSignal(queue);
        if (signal === STATUS_SIGNALS.HIDDEN) {
          row.remove();
          return;
        }
        ensureInlineDot(row, signal);
      });
    }

    function renderLiveSourceLists() {
      if (typeof state === "undefined" || !state || typeof recordHtml !== "function" || typeof lastFive !== "function") return;

      const sales = selectLiveRecords(state.store?.sales);
      const purchases = selectLiveRecords(state.store?.purchases);
      const rideJobs = selectLiveRecords(state.ride?.jobs);
      const rideWithdrawals = selectLiveRecords(state.ride?.creditWithdrawals);
      const obligations = selectLiveRecords(state.ledger?.obligations);

      const saleList = document.getElementById("saleList");
      if (saleList) saleList.innerHTML = sales.length ? lastFive(sales).map(sale => recordHtml("🧾", `${sale.customer} · ${sale.qty} ชิ้น`, `${dateTH(sale.date)} · รับแล้ว ${money(sale.receivedSatang)} · ค้าง ${money(sale.outstandingSatang)}`, `${money(sale.totalSatang)} ฿`, queueFor("STORE", sale.id)?.status || sale.status, "STORE", sale.id)).join("") : '<div class="empty">ยังไม่มีรายการขาย</div>';

      const purchaseList = document.getElementById("purchaseList");
      if (purchaseList) purchaseList.innerHTML = purchases.length ? lastFive(purchases).map(item => recordHtml("📦", item.name, `${item.qty} ชิ้น · ${dateTH(item.date)}`, `${money(item.costSatang)} ฿`, queueFor("STORE", item.id)?.status || item.status, "STORE", item.id)).join("") : '<div class="empty">ยังไม่มีรายการรับสินค้า</div>';

      const rideList = document.getElementById("rideList");
      if (rideList) rideList.innerHTML = rideJobs.length ? lastFive(rideJobs).map(job => {
        const mode = job.paymentMode === "CASH" ? "เงินสด" : job.paymentMode === "CREDIT" ? "เครดิต" : "งานเดิมรอยืนยัน";
        return recordHtml("🛵", `${money(job.amountSatang)} บาท · ${numberFmt(job.distanceKm)} กม.`, `${mode} · ${job.note || "งานวิ่ง"}`, `${money(job.amountSatang)} ฿`, queueFor("RIDE", job.id)?.status || job.status, "RIDE", job.id);
      }).join("") : '<div class="empty">ยังไม่มีงานในรอบ</div>';

      const rideWithdrawalList = document.getElementById("rideWithdrawalList");
      if (rideWithdrawalList) rideWithdrawalList.innerHTML = rideWithdrawals.length ? lastFive(rideWithdrawals).map(item => recordHtml("🏧", "เบิกเครดิตจากแอปงาน", `${dateTH(item.due)} · ${item.status === "PENDING" ? "กำลังเบิก" : statusLabel(item.status)}`, `${money(item.amountSatang)} ฿`, queueFor("RIDE", item.id)?.status || item.status, "RIDE", item.id)).join("") : '<div class="empty">ยังไม่มีการเบิกเครดิต</div>';

      const debtList = document.getElementById("debtList");
      if (debtList) debtList.innerHTML = obligations.length ? lastFive(obligations).map(item => {
        const paidInstallments = (item.installments || []).filter(entry => entry.status === "COMPLETED").length;
        return recordHtml("🧷", item.name, `${item.installmentCount} งวด · จ่ายแล้ว ${paidInstallments}/${item.installmentCount} · เหลือ ${money(item.remainingSatang)}`, `${money(item.originalSatang)} ฿`, queueFor("LEDGER", item.id)?.status || item.status, "LEDGER", item.id);
      }).join("") : '<div class="empty">ยังไม่มีภาระ</div>';

      const countButtons = [
        ["allSalesBtn", sales],
        ["allPurchasesBtn", purchases],
        ["allRideJobsBtn", rideJobs],
        ["allRideWithdrawalsBtn", rideWithdrawals],
        ["allDebtsBtn", obligations]
      ];
      countButtons.forEach(([id, records]) => document.getElementById(id)?.classList.toggle("hidden", records.length <= 5));
      if (typeof bindGoCalendar === "function") bindGoCalendar();
    }

    function hideCancelledRecordCards() {
      document.querySelectorAll(".record .status.cancelled").forEach(status => status.closest(".record")?.remove());
    }

    function hideCancelledControls() {
      document.querySelector('[data-filter="CANCELLED"]')?.remove();
      const count = document.getElementById("calCancelled");
      const tile = count?.closest(".mini");
      if (tile?.parentElement) tile.parentElement.classList.add("r53-three-stats");
      tile?.classList.add("hidden");
    }

    function syncLiveCounters() {
      if (typeof state === "undefined" || !state || !Array.isArray(state.calendar)) return;
      const active = selectLiveCalendar(state.calendar, sourceStatusOf, todayKey()).filter(item =>
        !["COMPLETED", "CANCELLED"].includes(String(item.status || "").toUpperCase())
      );
      const directionOf = item => typeof queueDirection === "function" ? queueDirection(item) : "OTHER";
      const isVerify = item => String(item.status || "").toUpperCase() === "VERIFY" ||
        (typeof integrityGate === "function" && integrityGate(item).state !== "TRUSTED");
      const incoming = active.filter(item => directionOf(item) === "IN").length;
      const outgoing = active.filter(item => directionOf(item) === "OUT").length;
      const verify = active.filter(isVerify).length;
      const setCounter = (id, value) => {
        const element = document.getElementById(id);
        const text = String(value);
        if (element && element.textContent !== text) element.textContent = text;
      };

      setCounter("homeWaitIn", incoming);
      setCounter("homeWaitOut", outgoing);
      setCounter("homeVerify", verify);
      setCounter("calWaitIn", incoming);
      setCounter("calWaitOut", outgoing);
      setCounter("calVerify", verify);
      setCounter("ledgerPendingCount", `${outgoing} รายการ`);
    }

    function patchHistoryHtml() {
      if (globalThis.__YGPH_R53_HISTORY_SELECTOR_PATCHED__ || typeof historyHtml !== "function") return;
      const baseHistoryHtml = historyHtml;
      historyHtml = function(kind) {
        if (typeof state === "undefined" || !state) return baseHistoryHtml(kind);
        if (kind === "sales") return sortNewest(selectLiveRecords(state.store?.sales)).map(item => recordHtml("🧾", `${item.customer} · ${item.qty} ชิ้น`, `${dateTH(item.date)} · ค้าง ${money(item.outstandingSatang)}`, `${money(item.totalSatang)} ฿`, item.status, "STORE", item.id)).join("");
        if (kind === "purchases") return sortNewest(selectLiveRecords(state.store?.purchases)).map(item => recordHtml("📦", item.name, `${item.qty} ชิ้น · ${dateTH(item.date)}`, `${money(item.costSatang)} ฿`, item.status, "STORE", item.id)).join("");
        if (kind === "rideJobs") return sortNewest(selectLiveRecords(state.ride?.jobs)).map(item => recordHtml("🛵", item.note || "งานวิ่ง", `${money(item.amountSatang)} บาท · ${item.paymentMode}`, `${numberFmt(item.distanceKm)} กม.`, item.status, "RIDE", item.id)).join("");
        if (kind === "rideWithdrawals") return sortNewest(selectLiveRecords(state.ride?.creditWithdrawals)).map(item => recordHtml("🏧", "เบิกเครดิต", dateTH(item.due), `${money(item.amountSatang)} ฿`, item.status, "RIDE", item.id)).join("");
        if (kind === "debts") return sortNewest(selectLiveRecords(state.ledger?.obligations)).map(item => recordHtml("🧷", item.name, `${item.installmentCount} งวด · เหลือ ${money(item.remainingSatang)}`, `${money(item.originalSatang)} ฿`, item.status, "LEDGER", item.id)).join("");
        return baseHistoryHtml(kind);
      };
      globalThis.__YGPH_R53_HISTORY_SELECTOR_PATCHED__ = true;
    }

    function patchFlowCalendarItems() {
      if (globalThis.__YGPH_R53_FLOW_ITEMS_PATCHED__ || typeof flowCalendarItems !== "function") return;
      const baseFlowCalendarItems = flowCalendarItems;
      flowCalendarItems = function(...args) {
        return selectLiveCalendar(baseFlowCalendarItems(...args), sourceStatusOf, todayKey());
      };
      globalThis.__YGPH_R53_FLOW_ITEMS_PATCHED__ = true;
    }

    function apply() {
      document.documentElement.dataset.metropolisR53 = METROPOLIS_R5_3_VERSION;
      hideCancelledControls();
      renderLiveSourceLists();
      paintMonthGrid();
      paintQueueCards();
      paintHomeTasks();
      hideCancelledRecordCards();
      syncLiveCounters();
    }

    function queueApply() {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        apply();
      });
    }

    function install() {
      if (globalThis.__YGPH_METROPOLIS_R53_RUNTIME__) return;
      globalThis.__YGPH_METROPOLIS_R53_RUNTIME__ = true;
      patchHistoryHtml();
      patchFlowCalendarItems();
      if (globalThis.YGPHRuntime?.register) {
        globalThis.YGPHRuntime.register("METROPOLIS_R53_LIVE_STATUS", {
          afterRender: queueApply,
          afterPageChange: queueApply
        });
      }
      apply();
      queueApply();
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
    else install();
  })();
}
