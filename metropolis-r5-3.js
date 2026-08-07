"use strict";

/* YGPH METROPOLIS 4.2.1 — three-color live status layer */

const METROPOLIS_421_PRODUCT_VERSION = "4.2.1";
const METROPOLIS_R5_3_VERSION = "5.3.0-status-signal";
const LIVE_SIGNAL_CLASSES = Object.freeze(["signal-green", "signal-yellow", "signal-red"]);

function calendarSignal(item, today = "") {
  if (!item || item.status === "CANCELLED") return "hidden";
  if (item.status === "COMPLETED") return "green";
  const date = String(today || "").slice(0, 10);
  const due = String(item.due || "").slice(0, 10);
  if (date && due && due < date) return "red";
  return "yellow";
}

function liveRecords(records = []) {
  return Array.isArray(records) ? records.filter(item => item?.status !== "CANCELLED") : [];
}

if (typeof module === "object" && module.exports) {
  module.exports = {
    METROPOLIS_PRODUCT_VERSION: METROPOLIS_421_PRODUCT_VERSION,
    METROPOLIS_R5_3_VERSION,
    calendarSignal,
    liveRecords
  };
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  (() => {
    let installed = false;

    function clearSignalClasses(node) {
      if (!node) return;
      node.classList.remove(...LIVE_SIGNAL_CLASSES);
      delete node.dataset.statusSignal;
    }

    function setSignalClass(node, item) {
      if (!node) return;
      clearSignalClasses(node);
      const signal = calendarSignal(item, typeof localISO === "function" ? localISO() : "");
      if (signal === "hidden") return;
      node.classList.add(`signal-${signal}`);
      node.dataset.statusSignal = signal;
    }

    function withFilteredCollections(specs, callback) {
      const backups = [];
      for (const [target, key] of specs) {
        if (!target || !Array.isArray(target[key])) continue;
        backups.push([target, key, target[key]]);
        target[key] = liveRecords(target[key]);
      }
      try {
        return callback();
      } finally {
        for (let index = backups.length - 1; index >= 0; index--) {
          const [target, key, value] = backups[index];
          target[key] = value;
        }
      }
    }

    function withLiveCalendar(callback) {
      if (typeof state === "undefined" || !state || !Array.isArray(state.calendar)) return callback();
      if (typeof queueFilter !== "undefined" && queueFilter === "CANCELLED") queueFilter = "ALL";
      return withFilteredCollections([[state, "calendar"]], callback);
    }

    function visibleCalendarItems() {
      if (typeof state === "undefined" || !state || !Array.isArray(state.calendar)) return [];
      let items = [...state.calendar]
        .sort((a, b) => String(a.due).localeCompare(String(b.due)) || Number(a.sequence) - Number(b.sequence));
      if (typeof selectedDate !== "undefined" && selectedDate) items = items.filter(item => item.due === selectedDate);
      if (typeof queueFilter !== "undefined" && queueFilter && queueFilter !== "ALL") {
        if (queueFilter === "VERIFY") {
          items = items.filter(item => item.status === "VERIFY" || (typeof integrityGate === "function" && integrityGate(item).state !== "TRUSTED"));
        } else if (typeof queueDirection === "function") {
          items = items.filter(item => queueDirection(item) === queueFilter);
        }
      }
      return items;
    }

    function signalMonthCells() {
      if (typeof state === "undefined" || !state) return;
      document.querySelectorAll("#monthGrid .day-cell").forEach(cell => {
        const date = cell.dataset.date;
        if (!date) return;
        const items = state.calendar.filter(item => item.due === date && item.status !== "CANCELLED");
        const count = cell.querySelector(".day-count");
        if (items.length) {
          if (count) count.textContent = String(items.length);
          else {
            const node = document.createElement("span");
            node.className = "day-count";
            node.textContent = String(items.length);
            cell.querySelector(".day-num")?.after(node);
          }
        } else {
          count?.remove();
        }
        const dots = cell.querySelector(".day-dots");
        if (dots) {
          dots.innerHTML = items.slice(0, 5).map(item => {
            const signal = calendarSignal(item, typeof localISO === "function" ? localISO() : "");
            return signal === "hidden" ? "" : `<span class="cal-dot signal-${signal}"></span>`;
          }).join("");
        }
      });
    }

    function signalQueueCards() {
      const items = visibleCalendarItems();
      const cards = [...document.querySelectorAll("#queueList .queue-item")];
      cards.forEach((card, index) => setSignalClass(card, items[index]));
    }

    function signalFlowFocus() {
      const card = document.querySelector("#flowCalendarFocus .flow-swipe-card");
      if (!card || typeof state === "undefined" || !state || typeof selectedDate === "undefined" || !selectedDate) return;
      const items = state.calendar
        .filter(item => item.status !== "CANCELLED" && item.due === selectedDate)
        .sort((a, b) => String(a.due).localeCompare(String(b.due)) || Number(a.sequence) - Number(b.sequence));
      if (!items.length) { clearSignalClasses(card); return; }
      let index = 0;
      try {
        if (typeof flowCalendarIndex === "number") index = ((flowCalendarIndex % items.length) + items.length) % items.length;
      } catch (_) {}
      setSignalClass(card, items[index]);
    }

    function signalHomeTasks() {
      document.querySelectorAll("[data-flow-task]").forEach(row => {
        const item = typeof findQueue === "function" ? findQueue(row.dataset.flowTask) : null;
        setSignalClass(row, item);
      });
    }

    function hideCancelledControls() {
      document.querySelector('[data-filter="CANCELLED"]')?.classList.add("r53-hidden");
      document.getElementById("calCancelled")?.closest(".mini")?.classList.add("r53-hidden");
    }

    function applyPatchVersion() {
      document.documentElement.dataset.metropolisR53 = METROPOLIS_R5_3_VERSION;
      const settingsVersion = document.querySelector("#settingsPage .hero .hero-value");
      if (settingsVersion && settingsVersion.textContent !== `YGPH METROPOLIS v${METROPOLIS_421_PRODUCT_VERSION}`) {
        settingsVersion.textContent = `YGPH METROPOLIS v${METROPOLIS_421_PRODUCT_VERSION}`;
      }
    }

    function applyLiveSignals() {
      signalMonthCells();
      signalQueueCards();
      signalFlowFocus();
      signalHomeTasks();
      hideCancelledControls();
      applyPatchVersion();
    }

    function patchRenderers() {
      const baseCalendar = renderCalendar;
      renderCalendar = function(...args) {
        return withLiveCalendar(() => {
          const result = baseCalendar(...args);
          applyLiveSignals();
          return result;
        });
      };

      if (typeof flowRenderCalendarFocus === "function") {
        const baseFlowCalendarFocus = flowRenderCalendarFocus;
        flowRenderCalendarFocus = function(...args) {
          return withLiveCalendar(() => {
            const result = baseFlowCalendarFocus(...args);
            signalFlowFocus();
            return result;
          });
        };
      }

      const baseStore = renderStore;
      renderStore = function(...args) {
        if (typeof state === "undefined" || !state) return baseStore(...args);
        return withFilteredCollections([
          [state.store, "sales"],
          [state.store, "purchases"]
        ], () => baseStore(...args));
      };

      const baseRide = renderRide;
      renderRide = function(...args) {
        if (typeof state === "undefined" || !state) return baseRide(...args);
        return withFilteredCollections([
          [state.ride, "jobs"],
          [state.ride, "creditWithdrawals"]
        ], () => baseRide(...args));
      };

      const baseLedger = renderLedger;
      renderLedger = function(...args) {
        if (typeof state === "undefined" || !state) return baseLedger(...args);
        return withFilteredCollections([
          [state.ledger, "obligations"]
        ], () => baseLedger(...args));
      };

      if (typeof historyHtml === "function") {
        const baseHistoryHtml = historyHtml;
        historyHtml = function(kind) {
          if (typeof state === "undefined" || !state) return baseHistoryHtml(kind);
          const specs = [];
          if (["sales", "purchases"].includes(kind)) {
            specs.push([state.store, kind === "sales" ? "sales" : "purchases"]);
          } else if (kind === "rideJobs") {
            specs.push([state.ride, "jobs"]);
          } else if (kind === "rideWithdrawals") {
            specs.push([state.ride, "creditWithdrawals"]);
          } else if (kind === "debts") {
            specs.push([state.ledger, "obligations"]);
          }
          return specs.length ? withFilteredCollections(specs, () => baseHistoryHtml(kind)) : baseHistoryHtml(kind);
        };
      }
    }

    function install() {
      if (installed) return;
      if (typeof renderCalendar !== "function" || typeof renderStore !== "function" || typeof renderRide !== "function" || typeof renderLedger !== "function") {
        setTimeout(install, 40);
        return;
      }
      installed = true;
      globalThis.YGPH_METROPOLIS_R5_3_VERSION = METROPOLIS_R5_3_VERSION;
      patchRenderers();
      if (globalThis.YGPHRuntime?.register) {
        globalThis.YGPHRuntime.register("METROPOLIS_R53_STATUS_SIGNAL", {
          afterRender: () => withLiveCalendar(applyLiveSignals)
        });
      }
      hideCancelledControls();
      applyPatchVersion();
      if (typeof state !== "undefined" && state && typeof renderAll === "function") renderAll();
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
    else install();
  })();
}
