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

if (typeof module === "object" && module.exports) {
  module.exports = { METROPOLIS_R5_3_VERSION, STATUS_SIGNALS, statusSignal, liveStatusSignal };
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  (() => {
    let queued = false;

    function todayKey() {
      return typeof localISO === "function" ? localISO() : new Date().toISOString().slice(0, 10);
    }

    function queueSignal(item) {
      if (!item) return STATUS_SIGNALS.HIDDEN;
      const source = typeof findSource === "function" ? findSource(item.source, item.sourceId) : null;
      return liveStatusSignal(item, source?.status, todayKey());
    }

    function signalClass(signal) {
      return `r53-status-${String(signal || "").toLowerCase()}`;
    }

    function signalLabel(signal) {
      if (signal === STATUS_SIGNALS.GREEN) return "เสร็จแล้ว";
      if (signal === STATUS_SIGNALS.RED) return "เกินกำหนด";
      return "รอดำเนินการ";
    }

    function withLiveCalendar(callback) {
      if (typeof state === "undefined" || !state || !Array.isArray(state.calendar)) return callback();
      if (typeof queueFilter !== "undefined" && queueFilter === "CANCELLED") queueFilter = "ALL";
      const original = state.calendar;
      state.calendar = original.filter(item => queueSignal(item) !== STATUS_SIGNALS.HIDDEN);
      try {
        return callback();
      } finally {
        state.calendar = original;
      }
    }

    function withoutCancelled(records) {
      return Array.isArray(records)
        ? records.filter(record => String(record?.status || "").toUpperCase() !== "CANCELLED")
        : records;
    }

    function withLiveSourceRecords(callback) {
      if (typeof state === "undefined" || !state) return callback();
      const snapshots = {
        sales: state.store?.sales,
        purchases: state.store?.purchases,
        rideJobs: state.ride?.jobs,
        rideWithdrawals: state.ride?.creditWithdrawals,
        obligations: state.ledger?.obligations
      };

      if (state.store && Array.isArray(snapshots.sales)) state.store.sales = withoutCancelled(snapshots.sales);
      if (state.store && Array.isArray(snapshots.purchases)) state.store.purchases = withoutCancelled(snapshots.purchases);
      if (state.ride && Array.isArray(snapshots.rideJobs)) state.ride.jobs = withoutCancelled(snapshots.rideJobs);
      if (state.ride && Array.isArray(snapshots.rideWithdrawals)) state.ride.creditWithdrawals = withoutCancelled(snapshots.rideWithdrawals);
      if (state.ledger && Array.isArray(snapshots.obligations)) state.ledger.obligations = withoutCancelled(snapshots.obligations);

      try {
        return callback();
      } finally {
        if (state.store && Array.isArray(snapshots.sales)) state.store.sales = snapshots.sales;
        if (state.store && Array.isArray(snapshots.purchases)) state.store.purchases = snapshots.purchases;
        if (state.ride && Array.isArray(snapshots.rideJobs)) state.ride.jobs = snapshots.rideJobs;
        if (state.ride && Array.isArray(snapshots.rideWithdrawals)) state.ride.creditWithdrawals = snapshots.rideWithdrawals;
        if (state.ledger && Array.isArray(snapshots.obligations)) state.ledger.obligations = snapshots.obligations;
      }
    }

    function paintMonthGrid() {
      if (typeof state === "undefined" || !Array.isArray(state?.calendar)) return;
      const today = todayKey();
      document.querySelectorAll("#monthGrid .day-cell[data-date]").forEach(cell => {
        const date = cell.dataset.date;
        const items = state.calendar.filter(item => item.due === date && queueSignal(item) !== STATUS_SIGNALS.HIDDEN);
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

    function hideCancelledRecordCards() {
      document.querySelectorAll(".record .status.cancelled").forEach(status => status.closest(".record")?.remove());
    }

    function hideCancelledControls() {
      document.querySelector('[data-filter="CANCELLED"]')?.remove();
      const count = document.getElementById("calCancelled");
      const tile = count?.closest(".mini");
      if (tile?.parentElement) tile.parentElement.classList.add("r53-three-stats");
      tile?.remove();
    }

    function syncLiveCounters() {
      if (typeof state === "undefined" || !state || !Array.isArray(state.calendar)) return;
      const active = state.calendar.filter(item =>
        queueSignal(item) !== STATUS_SIGNALS.HIDDEN &&
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

    function patchLiveRenderers() {
      if (globalThis.__YGPH_R53_LIVE_RENDERERS_PATCHED__) return;

      if (typeof renderCalendar === "function") {
        const baseRenderCalendar = renderCalendar;
        renderCalendar = function(...args) {
          return withLiveCalendar(() => baseRenderCalendar(...args));
        };
      }
      if (typeof renderStore === "function") {
        const baseRenderStore = renderStore;
        renderStore = function(...args) {
          return withLiveSourceRecords(() => baseRenderStore(...args));
        };
      }
      if (typeof renderRide === "function") {
        const baseRenderRide = renderRide;
        renderRide = function(...args) {
          return withLiveSourceRecords(() => baseRenderRide(...args));
        };
      }
      if (typeof renderLedger === "function") {
        const baseRenderLedger = renderLedger;
        renderLedger = function(...args) {
          return withLiveSourceRecords(() => baseRenderLedger(...args));
        };
      }
      if (typeof historyHtml === "function") {
        const baseHistoryHtml = historyHtml;
        historyHtml = function(...args) {
          return withLiveSourceRecords(() => baseHistoryHtml(...args));
        };
      }

      globalThis.__YGPH_R53_LIVE_RENDERERS_PATCHED__ = true;
    }

    function patchFlowCalendarFocus() {
      if (globalThis.__YGPH_R53_FLOW_FOCUS_PATCHED__ || typeof flowRenderCalendarFocus !== "function") return;
      const baseFlowCalendarFocus = flowRenderCalendarFocus;
      flowRenderCalendarFocus = function(...args) {
        return withLiveCalendar(() => baseFlowCalendarFocus(...args));
      };
      globalThis.__YGPH_R53_FLOW_FOCUS_PATCHED__ = true;
    }

    function apply() {
      document.documentElement.dataset.metropolisR53 = METROPOLIS_R5_3_VERSION;
      hideCancelledControls();
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
      if (globalThis.__YGPH_METROPOLIS_R53_OBSERVER__) return;
      patchLiveRenderers();
      patchFlowCalendarFocus();
      apply();
      const observer = new MutationObserver(queueApply);
      observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "data-metropolis-page"] });
      globalThis.__YGPH_METROPOLIS_R53_OBSERVER__ = observer;
      setTimeout(queueApply, 100);
      setTimeout(queueApply, 400);
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
    else install();
  })();
}
