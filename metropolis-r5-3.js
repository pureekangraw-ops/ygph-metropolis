"use strict";

/* YGPH METROPOLIS — three-color live status signal */

const METROPOLIS_R5_3_VERSION = "5.3.0-status-signal";
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

if (typeof module === "object" && module.exports) {
  module.exports = { METROPOLIS_R5_3_VERSION, STATUS_SIGNALS, statusSignal };
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
      if (String(source?.status || "").toUpperCase() === "CANCELLED") return STATUS_SIGNALS.HIDDEN;
      return statusSignal(item, todayKey());
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

    function apply() {
      document.documentElement.dataset.metropolisR53 = METROPOLIS_R5_3_VERSION;
      paintMonthGrid();
      paintQueueCards();
      paintHomeTasks();
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
