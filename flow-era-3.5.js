"use strict";

/*
  YGPH FLOW ERA v3.5.0 — clean visibility and daily RIDE layer
  Additive only: no DB, Vault, encryption, schema, Owner, Route or money semantics changes.
*/

(() => {
  const FLOW35_VERSION = "3.5.0";
  const FLOW35_TZ = "Asia/Bangkok";
  const FLOW35_ROLLOVER_REASON = "DAY_ROLLOVER";
  let rolloverBusy = false;
  let polishQueued = false;

  window.YGPH_FLOW_UI_VERSION = FLOW35_VERSION;
  document.documentElement.dataset.flowUiVersion = FLOW35_VERSION;

  function hasState() {
    return typeof state !== "undefined" && state && state.ride && state.ledger;
  }

  function todayKey(date = new Date()) {
    if (typeof localISO === "function") return localISO(date);
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: FLOW35_TZ,
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).formatToParts(date);
    const map = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return `${map.year}-${map.month}-${map.day}`;
  }

  function itemDate(item) {
    if (typeof recordDate === "function") return recordDate(item);
    const direct = String(item?.date || item?.due || "").slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(direct)) return direct;
    return todayKey(new Date(item?.createdAt || Date.now()));
  }

  function safeText(value) {
    return typeof esc === "function" ? esc(value) : String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function moneyText(value) {
    return typeof money === "function" ? money(value) : (Number(value || 0) / 100).toLocaleString("th-TH", { maximumFractionDigits: 2 });
  }

  function numberText(value) {
    return typeof numberFmt === "function" ? numberFmt(value) : Number(value || 0).toLocaleString("th-TH", { maximumFractionDigits: 2 });
  }

  function dateText(value) {
    return typeof dateTH === "function" ? dateTH(value) : String(value || "—");
  }

  function timeText(value) {
    return typeof displayTime === "function" ? displayTime(value) : new Date(value).toLocaleString("th-TH", { timeZone: FLOW35_TZ });
  }

  function activeJobs() {
    if (!hasState()) return [];
    if (typeof activeRideJobs === "function") return activeRideJobs();
    return (state.ride.jobs || []).filter(item => item.status !== "CANCELLED");
  }

  function queueStatus(source, id, fallback) {
    if (typeof queueFor !== "function") return fallback;
    return queueFor(source, id)?.status || fallback;
  }

  function updateVersionLabels(root = document) {
    root.querySelectorAll(".status-line, .brand-copy p, .hero h2, .hero-value, .technical, .tech-info, details, small, p, h1, h2, h3").forEach(node => {
      if (node.children.length && !node.matches(".status-line")) return;
      const text = node.textContent || "";
      let next = text
        .replace(/FLOW ERA v3(?:\.0(?:\.2)?)?/gi, "FLOW ERA v3.5")
        .replace(/YGPH FLOW ERA v3(?:\.0(?:\.2)?)?/gi, "YGPH FLOW ERA v3.5")
        .replace(/FLOW layer:\s*3\.0\.2/gi, `FLOW layer: ${FLOW35_VERSION}`);
      if (next !== text) node.textContent = next;
    });

    const settingsTech = [...root.querySelectorAll("#settingsPage *")].find(node =>
      node.children.length === 0 && /FLOW layer:/i.test(node.textContent || "")
    );
    if (settingsTech) settingsTech.textContent = settingsTech.textContent.replace(/FLOW layer:\s*[^\s]+/i, `FLOW layer: ${FLOW35_VERSION}`);
  }

  function removeHomeShortcutButtons() {
    const candidates = document.querySelectorAll("#homePage button, #homePage a");
    candidates.forEach(node => {
      const label = (node.textContent || "").replace(/\s+/g, " ").trim();
      if (!["ดึงรายงาน", "ตั้งค่า"].includes(label)) return;
      if (node.closest(".bottom-nav, .topbar") || node.classList.contains("flow-header-settings")) return;
      const parent = node.parentElement;
      node.remove();
      if (parent && !parent.children.length && !parent.textContent.trim()) parent.remove();
    });
  }

  function decorateHeadingForList(listId, icon) {
    const list = document.getElementById(listId);
    if (!list) return;
    const card = list.closest(".card, .content-card, .hub-card, section") || list.parentElement;
    const heading = card?.querySelector("h2, h3, .section-title h2, .section-title h3");
    if (!heading || heading.dataset.flow35Icon === icon) return;
    const existing = heading.querySelector(".flow35-heading-icon");
    if (existing) existing.remove();
    const span = document.createElement("span");
    span.className = "flow35-heading-icon";
    span.setAttribute("aria-hidden", "true");
    span.textContent = icon;
    heading.prepend(span);
    heading.dataset.flow35Icon = icon;
  }

  function decorateCategoryHeadings() {
    [
      ["salesList", "🧾"],
      ["purchaseList", "📦"],
      ["withdrawList", "📤"],
      ["rideList", "🛵"],
      ["rideExpenseList", "⛽"],
      ["rideWithdrawalList", "🏧"]
    ].forEach(([id, icon]) => decorateHeadingForList(id, icon));
  }

  function classifyCashRows() {
    document.querySelectorAll("#flowLatestCashList .flow-tx-row").forEach(row => {
      const amount = row.querySelector("strong")?.textContent?.trim() || "";
      row.classList.toggle("flow35-cash-in", amount.startsWith("+"));
      row.classList.toggle("flow35-cash-out", amount.startsWith("−") || amount.startsWith("-"));
      const first = row.firstElementChild;
      if (first && /^[↘↗↓↑←→]+$/.test((first.textContent || "").trim())) first.remove();
    });
  }

  function classifyTaskRows() {
    document.querySelectorAll(".flow-task-row").forEach(row => {
      row.querySelector(".flow-task-dot")?.remove();
      const text = (row.textContent || "").toLowerCase();
      row.classList.toggle("flow35-task-overdue", row.classList.contains("overdue") || /เกินกำหนด|เลยกำหนด/.test(text));
      row.classList.toggle("flow35-task-verify", /ต้องตรวจสอบ|verify|คำเตือน/.test(text));
      row.classList.toggle("flow35-task-today", row.classList.contains("today") || /วันนี้/.test(text));
      row.classList.toggle("flow35-task-planned", row.classList.contains("next") || (!row.classList.contains("flow35-task-overdue") && !row.classList.contains("flow35-task-verify") && !row.classList.contains("flow35-task-today")));
    });
  }

  function markBottomNavigation() {
    document.querySelectorAll(".bottom-nav .nav-btn").forEach(button => {
      const text = (button.textContent || "").replace(/\s+/g, " ").trim();
      button.classList.remove("flow35-nav-store", "flow35-nav-ride", "flow35-nav-home", "flow35-nav-ledger", "flow35-nav-calendar");
      if (/ร้านค้า/.test(text)) button.classList.add("flow35-nav-store");
      else if (/วิ่งงาน/.test(text)) button.classList.add("flow35-nav-ride");
      else if (/หน้าหลัก/.test(text)) button.classList.add("flow35-nav-home");
      else if (/การเงิน/.test(text)) button.classList.add("flow35-nav-ledger");
      else if (/ปฏิทิน/.test(text)) button.classList.add("flow35-nav-calendar");
    });
  }

  function calendarOwner(card) {
    const text = (card.textContent || "").toUpperCase();
    if (/\bSTORE\b/.test(text) || /ร้านค้า/.test(text)) return "store";
    if (/\bRIDE\b/.test(text) || /วิ่งงาน/.test(text)) return "ride";
    if (/\bLEDGER\b/.test(text) || /การเงิน/.test(text)) return "ledger";
    return "calendar";
  }

  function removeEmojiTile(card) {
    const candidates = card.querySelectorAll(".record-icon, .flow-item-icon, .queue-icon, .flow-swipe-icon, [class*='icon-box']");
    candidates.forEach(node => node.classList.add("flow35-hidden-row-icon"));

    card.querySelectorAll("div, span").forEach(node => {
      if (node.children.length || node.closest("button")) return;
      const text = (node.textContent || "").trim();
      if (!text || text.length > 6) return;
      if (/^\p{Extended_Pictographic}[\uFE0F\u200D\p{Extended_Pictographic}]*$/u.test(text)) {
        const styleClass = node.className?.toString() || "";
        if (/icon|emoji|avatar|thumb/i.test(styleClass) || node.parentElement === card.firstElementChild) {
          node.classList.add("flow35-hidden-row-icon");
        }
      }
    });
  }

  function styleCalendarCards() {
    const cards = document.querySelectorAll("#calendarPage .flow-swipe-card, #calendarPage .record, #calendarPage .queue-card, #calendarPage [data-owner]");
    cards.forEach(card => {
      removeEmojiTile(card);
      card.classList.remove("flow35-owner-store", "flow35-owner-ride", "flow35-owner-ledger", "flow35-owner-calendar");
      card.classList.add(`flow35-owner-${calendarOwner(card)}`);
    });
  }

  function renderTodayRideList() {
    if (!hasState()) return;
    const list = document.getElementById("rideList");
    if (!list || typeof recordHtml !== "function") return;
    const today = todayKey();
    const jobs = activeJobs().filter(item => itemDate(item) === today);
    const desired = jobs.length ? [...jobs]
      .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
      .slice(0, 5)
      .map(job => {
        const mode = job.paymentMode === "CASH" ? "เงินสด" : job.paymentMode === "CREDIT" ? "เครดิต" : "งานเดิมรอยืนยัน";
        return recordHtml("", `${moneyText(job.amountSatang)} บาท · ${numberText(job.distanceKm)} กม.`, `${mode} · ${job.note || "งานวิ่ง"}`, `${moneyText(job.amountSatang)} ฿`, queueStatus("RIDE", job.id, job.status), "RIDE", job.id);
      }).join("") : '<div class="empty">ยังไม่มีงานวันนี้</div>';
    if (list.innerHTML !== desired) list.innerHTML = desired;
    document.getElementById("allRideJobsBtn")?.classList.add("hidden");

    const expenses = (state.ride.expenses || []).filter(item => itemDate(item) === today);
    const expenseList = document.getElementById("rideExpenseList");
    if (expenseList && typeof recordHtml === "function") {
      const expenseHtml = expenses.length ? expenses
        .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
        .slice(0, 5)
        .map(item => recordHtml("", item.label || item.note || "ค่าใช้จ่ายวิ่งงาน", dateText(item.date || item.createdAt), `${moneyText(item.amountSatang)} ฿`, item.status || "RECORDED", "RIDE", item.id)).join("")
        : '<div class="empty">ยังไม่มีค่าใช้จ่ายวันนี้</div>';
      if (expenseList.innerHTML !== expenseHtml) expenseList.innerHTML = expenseHtml;
    }
  }

  function closeTimeForBangkokDate(date) {
    return new Date(`${date}T23:59:59.999+07:00`).toISOString();
  }

  async function ensureRideDayRollover() {
    if (rolloverBusy || !hasState() || !state.ride.currentRound) return false;
    if (typeof cryptoKey !== "undefined" && !cryptoKey) return false;
    const round = state.ride.currentRound;
    const startedDate = todayKey(new Date(round.startedAt || round.createdAt || Date.now()));
    const today = todayKey();
    if (startedDate >= today) return false;

    rolloverBusy = true;
    try {
      round.status = "ENDED";
      round.endedAt = closeTimeForBangkokDate(startedDate);
      round.closeReason = FLOW35_ROLLOVER_REASON;
      round.closedBy = "SYSTEM_DAY_ROLLOVER";
      if (typeof bumpSource === "function") bumpSource(round);
      else {
        round.revision = Number(round.revision || 1) + 1;
        round.updatedAt = typeof nowIso === "function" ? nowIso() : new Date().toISOString();
      }
      state.ride.rounds = Array.isArray(state.ride.rounds) ? state.ride.rounds : [];
      state.ride.rounds.push(round);
      state.ride.currentRound = null;
      state.sync ||= {};
      state.sync.flow ||= {};
      state.sync.flow.lastRideDayRollover = {
        roundId: round.id,
        fromDate: startedDate,
        detectedDate: today,
        at: typeof nowIso === "function" ? nowIso() : new Date().toISOString(),
        version: FLOW35_VERSION
      };
      if (typeof addAudit === "function") addAudit("RIDE_ROUND_DAY_ROLLOVER", `${round.id} · ${startedDate}`);
      if (typeof persistAndRender === "function") await persistAndRender("ปิดรอบเดิมเมื่อเปลี่ยนวันแล้ว");
      return true;
    } catch (error) {
      console.error("FLOW35 DAY ROLLOVER FAILED", error);
      if (typeof toast === "function") toast(`เปลี่ยนวันยังไม่สำเร็จ: ${error.message}`);
      return false;
    } finally {
      rolloverBusy = false;
    }
  }

  function inRange(item, start, end) {
    const date = itemDate(item);
    return date >= start && date <= end;
  }

  function rideHistoryHtml(start, end) {
    if (!hasState()) return "";
    const jobs = (state.ride.jobs || []).filter(item => inRange(item, start, end) && item.status !== "CANCELLED");
    const expenses = (state.ride.expenses || []).filter(item => inRange(item, start, end));
    const rounds = (state.ride.rounds || []).filter(item => {
      const date = todayKey(new Date(item.startedAt || item.createdAt || Date.now()));
      return date >= start && date <= end;
    });
    const dates = [...new Set([...jobs.map(itemDate), ...expenses.map(itemDate), ...rounds.map(item => todayKey(new Date(item.startedAt || item.createdAt || Date.now())))] )].sort().reverse();
    if (!dates.length) return '<div class="empty">ไม่มีประวัติวิ่งงานในช่วงนี้</div>';

    return dates.map(date => {
      const dayJobs = jobs.filter(item => itemDate(item) === date);
      const dayExpenses = expenses.filter(item => itemDate(item) === date);
      const dayRounds = rounds.filter(item => todayKey(new Date(item.startedAt || item.createdAt || Date.now())) === date);
      const gross = dayJobs.reduce((sum, item) => sum + Number(item.amountSatang || 0), 0);
      const distance = dayJobs.reduce((sum, item) => sum + Number(item.distanceKm || 0), 0);
      const expense = dayExpenses.reduce((sum, item) => sum + Number(item.amountSatang || 0), 0);
      const jobRows = dayJobs.length ? dayJobs.map(job => {
        const mode = job.paymentMode === "CASH" ? "เงินสด" : job.paymentMode === "CREDIT" ? "เครดิต" : "รอยืนยัน";
        return `<div class="flow35-report-row"><span><b>${safeText(job.note || "งานวิ่ง")}</b><small>${mode} · ${numberText(job.distanceKm)} กม. · ${timeText(job.createdAt)}</small></span><strong>${moneyText(job.amountSatang)} ฿</strong></div>`;
      }).join("") : '<div class="empty">ไม่มีงาน</div>';
      const roundRows = dayRounds.map(round => `<div class="flow35-round-history"><span>${timeText(round.startedAt)} → ${timeText(round.endedAt)}</span><b>${round.closeReason === FLOW35_ROLLOVER_REASON ? "ปิดเมื่อเปลี่ยนวัน" : "จบรอบปกติ"}</b></div>`).join("");
      return `<section class="flow35-report-day"><h4>${dateText(date)}</h4><div class="flow35-report-summary"><span>${dayJobs.length} งาน</span><span>${numberText(distance)} กม.</span><span>รายได้ ${moneyText(gross)} ฿</span><span>ค่าใช้จ่าย ${moneyText(expense)} ฿</span></div>${jobRows}${roundRows}</section>`;
    }).join("");
  }

  function appendRideHistoryReport() {
    const report = document.getElementById("reportResult");
    if (!report || report.classList.contains("hidden") || !hasState()) return;
    const selection = typeof reportSelection !== "undefined" && reportSelection ? reportSelection : null;
    const start = selection?.start || document.getElementById("reportStart")?.value;
    const end = selection?.end || document.getElementById("reportEnd")?.value;
    if (!start || !end) return;

    let card = document.getElementById("flow35RideHistory");
    if (!card) {
      card = document.createElement("div");
      card.id = "flow35RideHistory";
      card.className = "card content-card flow35-ride-history";
      const anchor = document.getElementById("rideReport")?.closest(".card, .content-card") || document.getElementById("rideReport");
      if (anchor?.parentElement) anchor.insertAdjacentElement("afterend", card);
      else report.appendChild(card);
    }
    card.innerHTML = `<h3><span class="flow35-heading-icon" aria-hidden="true">🛵</span>ประวัติวิ่งงาน</h3><small class="flow35-report-range">${dateText(start)} ถึง ${dateText(end)}</small>${rideHistoryHtml(start, end)}`;
  }

  function polishUi() {
    updateVersionLabels();
    removeHomeShortcutButtons();
    decorateCategoryHeadings();
    classifyCashRows();
    classifyTaskRows();
    markBottomNavigation();
    styleCalendarCards();
    renderTodayRideList();
    appendRideHistoryReport();
  }

  function schedulePolish() {
    if (polishQueued) return;
    polishQueued = true;
    requestAnimationFrame(() => {
      polishQueued = false;
      try { polishUi(); } catch (error) { console.error("FLOW35 UI POLISH FAILED", error); }
    });
  }

  function start() {
    YGPHRuntime.register("flow-era-3.5", {
      afterRender: schedulePolish,
      afterPageChange: schedulePolish,
      afterReport: () => {
        appendRideHistoryReport();
        schedulePolish();
      }
    });
    schedulePolish();
    ensureRideDayRollover().finally(schedulePolish);

    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) ensureRideDayRollover().finally(schedulePolish);
    });
    window.addEventListener("focus", () => ensureRideDayRollover().finally(schedulePolish));
    setInterval(() => ensureRideDayRollover().finally(schedulePolish), 60_000);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();
