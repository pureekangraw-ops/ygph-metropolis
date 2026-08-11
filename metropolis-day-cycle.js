"use strict";

/* YGPH METROPOLIS 4.2.6 — manual day-cycle controls */

const DAY_CYCLE_VERSION = "1.0.0";

function normalizeDayCycle(value) {
  const current = value && typeof value === "object" ? value : {};
  const status = current.status === "ACTIVE" || current.status === "ENDED"
    ? current.status
    : "NOT_STARTED";
  return {
    status,
    date: typeof current.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(current.date) ? current.date : null,
    startedAt: typeof current.startedAt === "string" && current.startedAt ? current.startedAt : null,
    endedAt: typeof current.endedAt === "string" && current.endedAt ? current.endedAt : null
  };
}

function planStartDay(_current, today, at) {
  return {
    status: "ACTIVE",
    date: String(today),
    startedAt: String(at),
    endedAt: null
  };
}

function planEndDay(current, today, at) {
  const before = normalizeDayCycle(current);
  const date = String(today);
  return {
    status: "ENDED",
    date,
    startedAt: before.date === date ? before.startedAt : null,
    endedAt: String(at)
  };
}

function dayCycleStatusText(value) {
  const cycle = normalizeDayCycle(value);
  if (cycle.status === "ACTIVE") return `กำลังทำงาน · ${cycle.date || "วันนี้"}`;
  if (cycle.status === "ENDED") return `จบวันแล้ว · ${cycle.date || "วันนี้"}`;
  return "ยังไม่ได้เริ่มวัน";
}

function dayControlMarkup(value) {
  return `<b>1 · Day Control</b><small>เริ่มวัน ตั้งเป้า และจบวัน โดยเก็บประวัติจริงไว้</small>
    <div class="maintenance-three" id="maintenanceDayActions">
      <button type="button" id="maintenanceStartDayBtn">เริ่มวัน</button>
      <span id="maintenanceTargetSlot"></span>
      <span id="maintenanceEndDaySlot"></span>
    </div>
    <em id="maintenanceDayStatus">${dayCycleStatusText(value)}</em>`;
}

if (typeof module === "object" && module.exports) {
  module.exports = {
    DAY_CYCLE_VERSION,
    normalizeDayCycle,
    planStartDay,
    planEndDay,
    dayControlMarkup
  };
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  (() => {
    let applyQueued = false;
    let actionBusy = false;

    function dayToday() {
      try {
        if (typeof r55Today === "function") return r55Today();
        if (typeof localISO === "function") return localISO();
      } catch (_) {}
      return new Date().toISOString().slice(0, 10);
    }

    function dayNow() {
      try { return typeof nowIso === "function" ? nowIso() : new Date().toISOString(); }
      catch (_) { return new Date().toISOString(); }
    }

    function ensureDayCycleState() {
      if (typeof state === "undefined" || !state) return null;
      state.settings ||= {};
      state.sync ||= {};
      state.sync.flow ||= {};
      state.ride ||= {};
      state.ride.rounds = Array.isArray(state.ride.rounds) ? state.ride.rounds : [];
      return state.sync.flow;
    }

    function currentDayCycle() {
      const flow = ensureDayCycleState();
      return normalizeDayCycle(flow?.dayCycle);
    }

    function dayToast(message) {
      if (typeof toast === "function") toast(message);
    }

    function closeActiveRideRound(at) {
      const round = state?.ride?.currentRound;
      if (!round) return null;
      round.status = "ENDED";
      round.endedAt = at;
      round.closeReason = "OWNER_END_DAY";
      round.closedBy = "OWNER_DAY_CYCLE";
      if (typeof bumpSource === "function") bumpSource(round);
      else {
        round.revision = Number(round.revision || 1) + 1;
        round.updatedAt = at;
      }
      state.ride.rounds = Array.isArray(state.ride.rounds) ? state.ride.rounds : [];
      state.ride.rounds.push(round);
      state.ride.currentRound = null;
      return round.id || null;
    }

    async function startDay() {
      if (actionBusy || !ensureDayCycleState()) return;
      const today = dayToday();
      const current = currentDayCycle();
      if (current.status === "ACTIVE" && current.date === today) {
        dayToast("วันนี้เริ่มวันแล้ว · No action");
        return;
      }

      actionBusy = true;
      const before = typeof clone === "function" ? clone(state) : structuredClone(state);
      const at = dayNow();
      try {
        state.sync.flow.dayCycle = planStartDay(current, today, at);
        state.settings.dailyTargetSatang = 0;
        if (typeof addAudit === "function") addAudit("DAY_STARTED", `${today} · daily target reset`);
        await persistAndRender("เริ่มวันแล้ว · เป้ารายวันเริ่มที่ 0", {
          actor: "OWNER_LOCAL_UI",
          eventType: "DAY_STARTED",
          sourceDomain: "CORE",
          sourceOwner: "OWNER",
          targetDomain: ["CORE", "RIDE"],
          idempotencyKey: `day-start:${today}:${at}`,
          provenance: { day: today, dayCycleVersion: DAY_CYCLE_VERSION, dailyTargetReset: true }
        });
      } catch (error) {
        state = before;
        if (typeof renderAll === "function") renderAll();
        console.error("DAY_CYCLE_START_FAILED", error);
        dayToast(error?.message || "เริ่มวันไม่สำเร็จ");
      } finally {
        actionBusy = false;
      }
    }

    async function endDay(selectedQueueIds = []) {
      if (actionBusy || !ensureDayCycleState()) return;
      const today = dayToday();
      const current = currentDayCycle();
      if (current.status === "ENDED" && current.date === today) {
        dayToast("วันนี้จบวันแล้ว · No action");
        return;
      }

      actionBusy = true;
      const before = typeof clone === "function" ? clone(state) : structuredClone(state);
      const at = dayNow();
      try {
        state.sync.flow.dayCycle = planEndDay(current, today, at);
        state.settings.dailyTargetSatang = 0;
        const closedRoundId = closeActiveRideRound(at);
        if (typeof addAudit === "function") {
          addAudit("DAY_ENDED", `${today}${closedRoundId ? ` · round ${closedRoundId}` : ""} · daily target reset`);
        }

        const selected = Array.isArray(selectedQueueIds) ? selectedQueueIds.filter(Boolean) : [];
        if (selected.length) {
          if (typeof r55ApplyEndDayPayments !== "function") throw new Error("ระบบชำระภาระสิ้นวันยังไม่พร้อม");
          await r55ApplyEndDayPayments(selected);
          dayToast("จบวันแล้ว · ชำระภาระและรีเซ็ตค่ารายวันแล้ว");
        } else {
          await persistAndRender("จบวันแล้ว · รีเซ็ตค่ารายวันแล้ว", {
            actor: "OWNER_LOCAL_UI",
            eventType: "DAY_ENDED",
            sourceDomain: "CORE",
            sourceOwner: "OWNER",
            targetDomain: ["CORE", "RIDE", "AUDIT"],
            idempotencyKey: `day-end:${today}:${at}`,
            provenance: {
              day: today,
              dayCycleVersion: DAY_CYCLE_VERSION,
              dailyTargetReset: true,
              closedRoundId
            }
          });
        }
      } catch (error) {
        state = before;
        if (typeof renderAll === "function") renderAll();
        console.error("DAY_CYCLE_END_FAILED", error);
        dayToast(error?.message || "จบวันไม่สำเร็จ");
      } finally {
        actionBusy = false;
      }
    }

    function openEndDay() {
      const today = dayToday();
      const current = currentDayCycle();
      if (current.status === "ENDED" && current.date === today) {
        dayToast("วันนี้จบวันแล้ว · No action");
        return;
      }
      if (typeof r55OpenEndDay !== "function") {
        dayToast("หน้าสรุปสิ้นวันยังไม่พร้อม");
        return;
      }

      r55OpenEndDay();
      modalHandler = async () => {
        const selected = [...document.querySelectorAll("[data-metro-end-pay]:checked")].map(input => input.value);
        if (typeof closeModal === "function") closeModal();
        await endDay(selected);
      };
    }

    function replaceDuplicateReconcileWithDayControl() {
      const card = document.getElementById("maintenanceRecoveryCard");
      if (!card) return null;

      const title = card.querySelector(".maintenance-title-row h3");
      const subtitle = card.querySelector(".maintenance-title-row small");
      const badge = card.querySelector(".maintenance-title-row span");
      if (title) title.textContent = "Day Control & Recovery";
      if (subtitle) subtitle.textContent = "เริ่ม/จบวันก่อน แล้วใช้ Reset เฉพาะเมื่อจำเป็น";
      if (badge) badge.textContent = "DAY + 3 LEVELS";

      let level = document.getElementById("maintenanceDayControlLevel");
      if (!level) {
        const duplicate = document.getElementById("maintenanceReconcileBtn")?.closest(".maintenance-level")
          || card.querySelector(".maintenance-level.safe");
        if (!duplicate) return null;
        duplicate.id = "maintenanceDayControlLevel";
        duplicate.innerHTML = dayControlMarkup(currentDayCycle());
        level = duplicate;
      }
      return level;
    }

    function moveExistingDayActions(level) {
      if (!level) return;
      const targetButton = document.getElementById("metroDailyTargetEdit");
      const endButton = document.getElementById("metroEndDayBtn");
      const targetSlot = document.getElementById("maintenanceTargetSlot");
      const endSlot = document.getElementById("maintenanceEndDaySlot");

      if (targetButton && targetSlot && targetButton.parentElement !== targetSlot) targetSlot.appendChild(targetButton);
      if (endButton && endSlot && endButton.parentElement !== endSlot) endSlot.appendChild(endButton);

      if (targetButton) {
        targetButton.textContent = "ตั้งเป้ารายวัน";
        targetButton.className = "secondary-btn wide";
        targetButton.onclick = () => {
          if (typeof r55OpenTargetEditor === "function") r55OpenTargetEditor();
          else dayToast("ตัวตั้งเป้ารายวันยังไม่พร้อม");
        };
      }
      if (endButton) {
        endButton.textContent = "จบวัน";
        endButton.className = "secondary-btn wide";
        endButton.onclick = openEndDay;
      }
      const startButton = document.getElementById("maintenanceStartDayBtn");
      if (startButton) startButton.onclick = () => void startDay();
    }

    function syncDayControlStatus() {
      const status = document.getElementById("maintenanceDayStatus");
      if (status) status.textContent = dayCycleStatusText(currentDayCycle());
    }

    function applyDayCycleUi() {
      if (!ensureDayCycleState()) return;
      const level = replaceDuplicateReconcileWithDayControl();
      moveExistingDayActions(level);
      syncDayControlStatus();
    }

    function queueApply() {
      if (applyQueued) return;
      applyQueued = true;
      const schedule = typeof requestAnimationFrame === "function" ? requestAnimationFrame : callback => setTimeout(callback, 0);
      schedule(() => {
        applyQueued = false;
        applyDayCycleUi();
      });
    }

    function install() {
      if (globalThis.__YGPH_DAY_CYCLE_RUNTIME__) return;
      globalThis.__YGPH_DAY_CYCLE_RUNTIME__ = true;
      globalThis.YGPHDayCycle = Object.freeze({
        version: DAY_CYCLE_VERSION,
        getState: currentDayCycle,
        startDay,
        endDay,
        openEndDay,
        apply: applyDayCycleUi
      });
      if (globalThis.YGPHRuntime?.register) {
        globalThis.YGPHRuntime.register("METROPOLIS_DAY_CYCLE", {
          afterRender: queueApply,
          afterPageChange: queueApply
        });
      }
      queueApply();
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
    else install();
  })();
}
