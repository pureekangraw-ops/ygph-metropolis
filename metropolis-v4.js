"use strict";

/*
  YGPH METROPOLIS v4.0.0
  UI architecture layer only:
  - Four app experiences: STORE / RIDE / LEDGER / CALENDAR
  - One encrypted local state and the existing Source/Route rules
  - No migration, formula, vault, IndexedDB or transaction mutation
*/

const METROPOLIS_VERSION = "4.0.0";
const METROPOLIS_NAME = "YGPH METROPOLIS";
const METROPOLIS_ARCHITECTURE = "FOUR_APP_CONNECTED_SUITE";

const METROPOLIS_APPS = {
  store: {
    title: "ร้านค้า",
    english: "STORE",
    tagline: "ขายสินค้า · สต็อก · ลูกหนี้",
    icon: "store",
    emoji: "🏪",
    valueId: "homeStoreValue",
    valueLabel: "ยอดขายวันนี้"
  },
  ride: {
    title: "วิ่งงาน",
    english: "RIDE",
    tagline: "รอบวิ่ง · รายได้ · เครดิต",
    icon: "ride",
    emoji: "🛵",
    valueId: "homeRideValue",
    valueLabel: "รายได้วันนี้"
  },
  ledger: {
    title: "การเงิน",
    english: "LEDGER",
    tagline: "เงินจริง · รายรับ · รายจ่าย",
    icon: "ledger",
    emoji: "💳",
    valueId: "homeLedgerValue",
    valueLabel: "เงินปัจจุบัน"
  },
  calendar: {
    title: "ปฏิทิน",
    english: "CALENDAR",
    tagline: "คิวงาน · วันครบกำหนด · การยืนยัน",
    icon: "calendar",
    emoji: "📅",
    valueId: "homeCalendarValue",
    valueLabel: "รายการที่ต้องทำ"
  },
  report: {
    title: "รายงาน",
    english: "REPORT",
    tagline: "สรุปและส่งออกข้อมูล",
    icon: "report",
    emoji: "📊"
  },
  settings: {
    title: "ตั้งค่า",
    english: "SETTINGS",
    tagline: "สำรอง กู้คืน และความปลอดภัย",
    icon: "settings",
    emoji: "⚙️"
  },
  sync: {
    title: "ศูนย์รับ–ส่ง",
    english: "REVIEW CENTER",
    tagline: "ส่งหลักฐานและรับข้อเสนอกลับ",
    icon: "sync",
    emoji: "🔄"
  }
};

function metropolisIcon(app) {
  const meta = METROPOLIS_APPS[app] || METROPOLIS_APPS.store;
  try {
    if (typeof flowIcon === "function" && ["store", "ride", "ledger", "calendar", "settings"].includes(meta.icon)) {
      return flowIcon(meta.icon);
    }
  } catch (error) {
    console.warn("Metropolis icon fallback", error);
  }
  return `<span class="metropolis-emoji" aria-hidden="true">${meta.emoji}</span>`;
}

function metropolisActivePage() {
  const active = document.querySelector(".page.active");
  if (!active?.id) return "home";
  return active.id.replace(/Page$/, "").toLowerCase() || "home";
}

function metropolisShowPage(page) {
  if (typeof showPage === "function") {
    showPage(page);
    return;
  }
  document.querySelectorAll(".page").forEach(node => node.classList.toggle("active", node.id === `${page}Page`));
  metropolisApplyPage(page);
}

function metropolisFormatMoney(value) {
  try {
    if (typeof money === "function") return `${money(value)} บาท`;
  } catch (_) {}
  return `${(Number(value || 0) / 100).toLocaleString("th-TH", { maximumFractionDigits: 2 })} บาท`;
}

function metropolisToday() {
  try {
    if (typeof localISO === "function") return localISO();
  } catch (_) {}
  return new Date().toISOString().slice(0, 10);
}

function metropolisBuildLauncher() {
  const home = document.getElementById("homePage");
  if (!home || home.dataset.metropolisLauncher === "true") return;

  const firstSection = home.querySelector(".section");
  const grid = firstSection?.querySelector(".source-grid");
  if (!firstSection || !grid) {
    setTimeout(metropolisBuildLauncher, 60);
    return;
  }

  home.dataset.metropolisLauncher = "true";
  home.classList.add("metropolis-home");

  const cityHero = document.createElement("section");
  cityHero.className = "metropolis-city-hero";
  cityHero.innerHTML = `
    <div class="metropolis-city-copy">
      <span class="metropolis-eyebrow">FOUR APPS · ONE FLOW</span>
      <h2>เลือกแอปที่ต้องใช้</h2>
      <p>แต่ละงานแยกพื้นที่ชัดเจน แต่ยังใช้ฐานข้อมูลกลางและเส้นทางข้อมูลร่วมกัน</p>
    </div>
    <div class="metropolis-city-state">
      <span class="metropolis-live-dot"></span>
      <div><b>พร้อมใช้งานออฟไลน์</b><small>ข้อมูลเข้ารหัสอยู่ในเครื่อง</small></div>
    </div>`;
  home.insertBefore(cityHero, firstSection);

  const title = firstSection.querySelector(".section-title h2");
  if (title) title.textContent = "แอปของบิ๊ก";
  const sectionTitle = firstSection.querySelector(".section-title");
  if (sectionTitle && !sectionTitle.querySelector(".metropolis-section-note")) {
    const note = document.createElement("p");
    note.className = "metropolis-section-note";
    note.textContent = "เปิดเฉพาะงานที่กำลังทำ หน้าจอจึงไม่รก";
    sectionTitle.appendChild(note);
  }

  grid.classList.remove("flow-summary-grid");
  grid.classList.add("metropolis-launcher-grid");

  const existingCards = {
    store: grid.querySelector(".source-card.store"),
    ride: grid.querySelector(".source-card.ride"),
    ledger: grid.querySelector(".source-card.ledger")
  };

  ["store", "ride", "ledger"].forEach(app => {
    const card = existingCards[app];
    const meta = METROPOLIS_APPS[app];
    if (!card) return;
    const currentValue = card.querySelector("strong")?.textContent || "0";
    card.classList.add("metropolis-app-card");
    card.dataset.metropolisApp = app;
    card.setAttribute("aria-label", `เปิดแอป${meta.title}`);
    card.innerHTML = `
      <span class="metropolis-app-top">
        <span class="metropolis-app-icon">${metropolisIcon(app)}</span>
        <span class="metropolis-open-mark" aria-hidden="true">↗</span>
      </span>
      <span class="metropolis-app-copy">
        <span class="metropolis-app-english">${meta.english}</span>
        <b>${meta.title}</b>
        <small>${meta.tagline}</small>
      </span>
      <span class="metropolis-app-value">
        <small>${meta.valueLabel}</small>
        <strong id="${meta.valueId}">${currentValue}</strong>
      </span>
      <span class="metropolis-app-status" id="metropolis-${app}-status">ใช้ข้อมูลกลางร่วมกัน</span>`;
  });

  let calendarCard = grid.querySelector(".source-card.calendar");
  if (!calendarCard) {
    calendarCard = document.createElement("button");
    calendarCard.type = "button";
    calendarCard.className = "source-card calendar metropolis-app-card";
    calendarCard.dataset.metropolisApp = "calendar";
    calendarCard.setAttribute("aria-label", "เปิดแอปปฏิทิน");
    calendarCard.innerHTML = `
      <span class="metropolis-app-top">
        <span class="metropolis-app-icon">${metropolisIcon("calendar")}</span>
        <span class="metropolis-open-mark" aria-hidden="true">↗</span>
      </span>
      <span class="metropolis-app-copy">
        <span class="metropolis-app-english">CALENDAR</span>
        <b>ปฏิทิน</b>
        <small>คิวงาน · วันครบกำหนด · การยืนยัน</small>
      </span>
      <span class="metropolis-app-value">
        <small>รายการที่ต้องทำ</small>
        <strong id="homeCalendarValue">0</strong>
      </span>
      <span class="metropolis-app-status" id="metropolis-calendar-status">รับคิวจากทุกแอป</span>`;
    calendarCard.addEventListener("click", () => metropolisShowPage("calendar"));
  }

  [existingCards.store, existingCards.ride, existingCards.ledger, calendarCard]
    .filter(Boolean)
    .forEach(card => grid.appendChild(card));

  const utilityBar = document.createElement("div");
  utilityBar.className = "metropolis-utility-bar";
  utilityBar.innerHTML = `
    <button type="button" data-metropolis-open="report"><span>📊</span><b>รายงาน</b></button>
    <button type="button" data-metropolis-open="settings"><span>⚙️</span><b>ตั้งค่า</b></button>`;
  utilityBar.querySelectorAll("[data-metropolis-open]").forEach(button => {
    button.addEventListener("click", () => metropolisShowPage(button.dataset.metropolisOpen));
  });
  firstSection.appendChild(utilityBar);

  const drawer = document.createElement("details");
  drawer.className = "metropolis-system-drawer";
  drawer.innerHTML = `
    <summary>
      <span><b>ศูนย์เชื่อมระบบ</b><small>คิวรวม รายงาน และการรับ–ส่งข้อมูลกับโก</small></span>
      <span class="metropolis-summary-arrow" aria-hidden="true">⌄</span>
    </summary>
    <div class="metropolis-system-content"></div>`;
  const content = drawer.querySelector(".metropolis-system-content");
  const movable = [
    home.querySelector(".hub-card"),
    document.getElementById("flowLatestCash"),
    home.querySelector(".exchange-card"),
    home.querySelector(".home-actions")
  ].filter(Boolean);
  movable.forEach(node => content.appendChild(node));
  firstSection.after(drawer);
}

function metropolisBuildAppBar() {
  if (document.getElementById("metropolisAppBar")) return;
  const shell = document.getElementById("appShell");
  const main = shell?.querySelector("main");
  if (!main) return;

  const bar = document.createElement("section");
  bar.id = "metropolisAppBar";
  bar.className = "metropolis-app-bar hidden";
  bar.innerHTML = `
    <button type="button" class="metropolis-back" aria-label="กลับหน้ารวม">
      <span aria-hidden="true">←</span><span>หน้ารวม</span>
    </button>
    <div class="metropolis-current-icon" id="metropolisCurrentIcon"></div>
    <div class="metropolis-current-copy">
      <small id="metropolisCurrentEnglish">APP</small>
      <b id="metropolisCurrentTitle">แอป</b>
      <span id="metropolisCurrentTagline">ข้อมูลเชื่อมกันผ่านระบบกลาง</span>
    </div>
    <div class="metropolis-linked-badge"><span></span> ใช้ข้อมูลร่วมกัน</div>`;
  bar.querySelector(".metropolis-back").addEventListener("click", () => metropolisShowPage("home"));
  main.prepend(bar);
}

function metropolisFixLegacyCopy() {
  const replacements = [
    [document.querySelector("#setupScreen h1"), `ตั้งค่า ${METROPOLIS_NAME}`],
    [document.querySelector("#unlockScreen h1"), METROPOLIS_NAME],
    [document.querySelector(".brand-copy h1"), METROPOLIS_NAME]
  ];
  replacements.forEach(([node, text]) => {
    if (node && node.textContent !== text) node.textContent = text;
  });

  const setupLead = document.querySelector("#setupScreen .gate-card > p");
  if (setupLead) setupLead.textContent = "ข้อมูลทั้งหมดจะเข้ารหัสและเก็บไว้ในเครื่อง รหัสนี้ไม่มีระบบกู้คืน";
  const unlockLead = document.querySelector("#unlockScreen .gate-card > p");
  if (unlockLead) unlockLead.textContent = "ใส่รหัสเพื่อปลดล็อกข้อมูลที่เข้ารหัสไว้ในเครื่อง";
  const restoreButton = document.getElementById("restoreFromLockBtn");
  if (restoreButton) restoreButton.textContent = "กู้คืนจากไฟล์สำรองที่เข้ารหัส";
}

function metropolisApplyBranding() {
  metropolisFixLegacyCopy();
  document.documentElement.dataset.metropolisVersion = METROPOLIS_VERSION;
  document.body.classList.add("metropolis-v4");
  document.title = `${METROPOLIS_NAME} v${METROPOLIS_VERSION}`;

  const setupTitle = document.querySelector("#setupScreen h1");
  if (setupTitle) setupTitle.textContent = `ตั้งค่า ${METROPOLIS_NAME}`;
  const unlockTitle = document.querySelector("#unlockScreen h1");
  if (unlockTitle) unlockTitle.textContent = METROPOLIS_NAME;

  const brandTitle = document.querySelector(".brand-copy h1");
  const brandSub = document.querySelector(".brand-copy p");
  if (brandTitle) brandTitle.textContent = METROPOLIS_NAME;
  if (brandSub) brandSub.textContent = "Four Apps. One Flow. — แยกเป็นแอป เชื่อมเป็นระบบ";

  const status = document.querySelector(".status-line");
  if (status) {
    const version = status.querySelector("b");
    const detail = status.querySelector("span:not(.dot)");
    if (version) version.textContent = `METROPOLIS v${METROPOLIS_VERSION}`;
    if (detail) detail.textContent = "• 4 แอป • ออฟไลน์ • เข้ารหัส";
  }
}

function metropolisApplyPage(page = metropolisActivePage()) {
  const normalized = METROPOLIS_APPS[page] ? page : "home";
  document.body.dataset.metropolisPage = normalized;

  const bar = document.getElementById("metropolisAppBar");
  if (!bar) return;
  const isHome = normalized === "home";
  bar.classList.toggle("hidden", isHome);
  if (isHome) {
    document.title = `${METROPOLIS_NAME} v${METROPOLIS_VERSION}`;
    return;
  }

  const meta = METROPOLIS_APPS[normalized] || {
    title: "ระบบกลาง",
    english: "METROPOLIS",
    tagline: "ข้อมูลเชื่อมกันผ่านระบบกลาง",
    emoji: "🏙️"
  };
  const icon = document.getElementById("metropolisCurrentIcon");
  const english = document.getElementById("metropolisCurrentEnglish");
  const title = document.getElementById("metropolisCurrentTitle");
  const tagline = document.getElementById("metropolisCurrentTagline");
  if (icon) icon.innerHTML = metropolisIcon(normalized);
  if (english) english.textContent = meta.english;
  if (title) title.textContent = meta.title;
  if (tagline) tagline.textContent = meta.tagline;
  document.title = `${meta.title} · ${METROPOLIS_NAME}`;
  metropolisRefresh();
}

function metropolisRefresh() {
  metropolisFixLegacyCopy();
  const calendarValue = document.getElementById("homeCalendarValue");
  const storeStatus = document.getElementById("metropolis-store-status");
  const rideStatus = document.getElementById("metropolis-ride-status");
  const ledgerStatus = document.getElementById("metropolis-ledger-status");
  const calendarStatus = document.getElementById("metropolis-calendar-status");

  try {
    if (typeof state === "undefined" || !state) return;
    const activeQueues = (state.calendar || []).filter(item => !["COMPLETED", "CANCELLED"].includes(item.status));
    const verifyQueues = activeQueues.filter(item => item.status === "VERIFY");
    if (calendarValue) calendarValue.textContent = activeQueues.length.toLocaleString("th-TH");
    if (calendarStatus) calendarStatus.textContent = verifyQueues.length ? `ต้องตรวจ ${verifyQueues.length} รายการ` : "คิวพร้อมจัดการ";

    const stock = Number(state.store?.stockQty || 0);
    const receivable = (state.store?.sales || []).reduce((sum, item) => sum + Number(item.outstandingSatang || 0), 0);
    if (storeStatus) storeStatus.textContent = `สต็อก ${stock.toLocaleString("th-TH")} · ค้าง ${metropolisFormatMoney(receivable)}`;

    const today = metropolisToday();
    const todayJobs = (state.ride?.jobs || []).filter(item => String(item.date || item.createdAt || "").slice(0, 10) === today && item.status !== "CANCELLED");
    if (rideStatus) rideStatus.textContent = state.ride?.currentRound ? `กำลังวิ่ง · ${todayJobs.length} งานวันนี้` : `${todayJobs.length} งานวันนี้ · ยังไม่เริ่มรอบ`;

    const currentBalance = typeof currentBalanceSatang === "function" ? currentBalanceSatang() : Number(state.ledger?.openingBalanceSatang || 0);
    if (ledgerStatus) ledgerStatus.textContent = `ยอดจริง ${metropolisFormatMoney(currentBalance)}`;
  } catch (error) {
    console.warn("Metropolis refresh skipped", error);
  }
}

function metropolisStampPackage(pack) {
  if (!pack || typeof pack !== "object") return pack;
  pack.app = METROPOLIS_NAME;
  pack.appVersion = METROPOLIS_VERSION;
  pack.uiArchitecture = METROPOLIS_ARCHITECTURE;
  pack.connectedApps = ["STORE", "RIDE", "LEDGER", "CALENDAR"];
  try {
    if (typeof flowChecksum === "function") pack.checksum = flowChecksum(pack);
  } catch (error) {
    console.warn("Metropolis package checksum unchanged", error);
  }
  return pack;
}

function metropolisStampAudit(report) {
  if (!report || typeof report !== "object") return report;
  report.app = METROPOLIS_NAME;
  report.appVersion = METROPOLIS_VERSION;
  report.uiArchitecture = METROPOLIS_ARCHITECTURE;
  return report;
}

function metropolisRegisterRuntime() {
  YGPHRuntime.register("metropolis-v4", {
    afterRender: metropolisRefresh,
    afterPageChange: ({ page }) => metropolisApplyPage(page || metropolisActivePage()),
    exchange: metropolisStampPackage,
    audit: metropolisStampAudit
  });
}

function metropolisInstall() {
  if (document.documentElement.dataset.metropolisInstalled === "true") return;
  document.documentElement.dataset.metropolisInstalled = "true";
  metropolisApplyBranding();
  metropolisBuildLauncher();
  metropolisBuildAppBar();
  metropolisRegisterRuntime();
  metropolisApplyPage(metropolisActivePage());
  metropolisRefresh();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => setTimeout(metropolisInstall, 0), { once: true });
} else {
  setTimeout(metropolisInstall, 0);
}
