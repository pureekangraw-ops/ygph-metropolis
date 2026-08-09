"use strict";

const VAULT_VERSION = 1;
const CORE_DATA_RELEASE_VERSION = "2.1.4";
const STATE_SCHEMA = 4;
const DB_NAME = "stock-pocket-secure";
const DB_VERSION = 1;
const DB_STORE = "kv";
const VAULT_KEY = "vault";
const ROLLBACK_VAULT_KEY = "vault:rollback:latest";
const ROLLBACK_META_KEY = "vault:rollback:metadata";
const TRUSTED_DEVICE_KEY = "trusted-device:key";
const TRUSTED_DEVICE_VERSION = 1;
const AAD = new TextEncoder().encode("stock-pocket-secure-v1");
const PBKDF2_ITERATIONS = 600000;
const TZ = "Asia/Bangkok";
const MAX_INSTALLMENTS = 120;
const MAX_QUANTITY = 1_000_000;
const MAX_ALLOWED_SATANG = 10_000_000_000; // 100,000,000 บาท

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const byId = (id) => document.getElementById(id);
const nowIso = () => new Date().toISOString();
const localISO = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const map = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
};
const uid = (prefix = "ID") => `${prefix}-${Date.now().toString(36)}-${crypto.getRandomValues(new Uint32Array(1))[0].toString(36)}`;
const esc = (value) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
function parseSatang(value, { allowZero = true, maximum = MAX_ALLOWED_SATANG, label = "จำนวนเงิน" } = {}) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || !Number.isSafeInteger(amount)) throw new Error(`${label}ไม่ใช่จำนวนสตางค์ที่ถูกต้อง`);
  if (amount < 0 || (!allowZero && amount === 0)) throw new Error(`${label}ต้อง${allowZero ? "ไม่ติดลบ" : "มากกว่า 0"}`);
  if (amount > maximum) throw new Error(`${label}เกินขอบเขตที่ระบบรองรับ`);
  return amount;
}
function parseMoneyToSatang(value, { allowZero = true, maximum = MAX_ALLOWED_SATANG, label = "จำนวนเงิน" } = {}) {
  const text = String(value ?? "").trim();
  if (!text) {
    if (allowZero) return 0;
    throw new Error(`กรอก${label}`);
  }
  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) throw new Error(`${label}ต้องเป็นตัวเลขและมีทศนิยมไม่เกิน 2 ตำแหน่ง`);
  const baht = Number(text);
  if (!Number.isFinite(baht) || baht < 0) throw new Error(`${label}ไม่ถูกต้อง`);
  const rawSatang = baht * 100;
  const satang = Math.round(rawSatang);
  return parseSatang(satang, { allowZero, maximum, label });
}
function parseQuantity(value, { allowZero = false, maximum = MAX_QUANTITY, label = "จำนวน" } = {}) {
  const quantity = Number(value);
  if (!Number.isSafeInteger(quantity) || quantity < 0 || (!allowZero && quantity === 0)) throw new Error(`${label}ต้องเป็นจำนวนเต็ม${allowZero ? "ที่ไม่ติดลบ" : "มากกว่า 0"}`);
  if (quantity > maximum) throw new Error(`${label}เกินขอบเขตที่ระบบรองรับ`);
  return quantity;
}
const bahtToSatang = (value) => parseMoneyToSatang(value, { allowZero: true });
const satangToBaht = (value) => Number(value || 0) / 100;
const money = (satang) => satangToBaht(satang).toLocaleString("th-TH", { maximumFractionDigits: 2 });
const numberFmt = (value) => Number(value || 0).toLocaleString("th-TH", { maximumFractionDigits: 2 });
function validISODate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));
  if (!match) return false;
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}
const dateTH = (value) => value && validISODate(String(value).slice(0, 10)) ? new Date(`${String(value).slice(0, 10)}T12:00:00`).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" }) : "-";

const clone = (value) => structuredClone(value);
const dateKey = (value = new Date()) => {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = value instanceof Date ? value : new Date(value);
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const map = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
};
const recordDate = (record) => String(record?.date || record?.due || dateKey(record?.createdAt || new Date())).slice(0, 10);
const isInRange = (record, start, end) => { const d = recordDate(record); return d >= start && d <= end; };
const isToday = (record) => recordDate(record) === localISO();
const sortNewest = (records) => [...records].sort((a, b) => String(b.createdAt || b.updatedAt || "").localeCompare(String(a.createdAt || a.updatedAt || "")));
const lastFive = (records) => sortNewest(records).slice(0, 5);
const displayTime = (value) => value ? new Date(value).toLocaleString("th-TH", { timeZone: TZ }) : "—";


let db = null;
let cryptoKey = null;
let currentVault = null;
let state = null;
let currentPage = "home";
let queueFilter = "ALL";
let selectedDate = null;
let calendarMonth = localISO().slice(0, 7);
let modalHandler = null;
let modalBusy = false;
let toastTimer = null;
let inactivityTimer = null;
let hiddenAt = null;
let trustedDeviceActive = false;
let failedUnlocks = 0;
let deferredInstallPrompt = null;
let reportSelection = null;
let lastReportData = null;
let durableCommitInProgress = false;
let lastDurableReadback = null;
let pendingBackupCandidate = null;
let serviceWorkerRegistration = null;
let serviceWorkerStatus = null;
let reloadForServiceWorker = false;

const YGPHRuntime = globalThis.YGPHRuntime || (() => {
  const hookNames = ["afterRender", "afterPageChange", "afterReport"];
  const transformNames = ["exchange", "audit"];
  const hooks = Object.fromEntries(hookNames.map(name => [name, []]));
  const transforms = Object.fromEntries(transformNames.map(name => [name, []]));
  const registered = new Set();

  function register(name, contract = {}) {
    const pluginName = String(name || "").trim();
    if (!pluginName) throw new Error("Runtime plugin ต้องมีชื่อ");
    if (registered.has(pluginName)) return false;
    for (const hook of hookNames) {
      if (typeof contract[hook] === "function") hooks[hook].push({ pluginName, handler: contract[hook] });
    }
    for (const transform of transformNames) {
      if (typeof contract[transform] === "function") transforms[transform].push({ pluginName, handler: contract[transform] });
    }
    registered.add(pluginName);
    return true;
  }

  function run(hook, context = {}) {
    for (const { pluginName, handler } of hooks[hook] || []) {
      try {
        const result = handler(context);
        if (result && typeof result.catch === "function") result.catch(error => console.error(`RUNTIME_HOOK_FAILED:${pluginName}:${hook}`, error));
      } catch (error) {
        console.error(`RUNTIME_HOOK_FAILED:${pluginName}:${hook}`, error);
      }
    }
  }

  function transform(kind, value, context = {}) {
    let current = value;
    for (const { pluginName, handler } of transforms[kind] || []) {
      try {
        const result = handler(current, context);
        if (result && typeof result.then === "function") throw new Error("Runtime transform ต้องทำงานแบบ synchronous");
        if (result !== undefined) current = result;
      } catch (error) {
        console.error(`RUNTIME_TRANSFORM_FAILED:${pluginName}:${kind}`, error);
        throw error;
      }
    }
    return current;
  }

  return Object.freeze({ register, run, transform });
})();

globalThis.YGPHRuntime = YGPHRuntime;

const THEME_MAP = {
  navy: ["#0b355d", "#eaf4fc", "11,53,93"],
  green: ["#16744f", "#e8f7ef", "22,116,79"],
  orange: ["#c96612", "#fff0df", "201,102,18"],
  purple: ["#7848ad", "#f1eafd", "120,72,173"]
};

function defaultState(defaultPriceSatang = 80000, openingBalanceSatang = 0) {
  const createdAt = nowIso();
  return {
    schema: STATE_SCHEMA,
    revision: 1,
    createdAt,
    updatedAt: createdAt,
    settings: { defaultPriceSatang, lockMinutes: 5, lowStockThreshold: 3, themeColor: "navy" },
    store: { stockQty: 0, stockValueSatang: 0, sales: [], purchases: [], withdrawals: [] },
    ride: { currentRound: null, rounds: [], jobs: [], expenses: [], creditBalanceSatang: 0, creditWithdrawals: [] },
    ledger: { openingBalanceSatang, balanceVerified: true, verifiedAt: createdAt, transactions: [], obligations: [] },
    calendar: [],
    audit: [{ id: uid("AUD"), at: createdAt, event: "SYSTEM_CREATED", note: `YGPH v${CORE_DATA_RELEASE_VERSION}` }],
    events: [],
    sync: { lastExportAt: null, lastImportAt: null, pendingImport: null, lastBatchId: null, appliedCommandKeys: {} },
    migration: { fromSchema: null, migratedAt: null, sourceRelease: null }
  };
}

function normalizeState(value) {
  value.revision = Number(value.revision || 1);
  value.updatedAt ||= nowIso();
  value.settings ||= {};
  value.settings.defaultPriceSatang = Number(value.settings.defaultPriceSatang ?? value.defaultPriceSatang ?? 80000);
  value.settings.lockMinutes = Number(value.settings.lockMinutes || 5);
  value.settings.lowStockThreshold = Math.max(0, Number(value.settings.lowStockThreshold ?? 3));
  value.settings.themeColor ||= "navy";
  value.store ||= {};
  value.store.stockQty = Number(value.store.stockQty ?? 0);
  value.store.stockValueSatang = Number(value.store.stockValueSatang ?? 0);
  if (value.store.stockQty === 0 && Number.isSafeInteger(value.store.stockValueSatang)) value.store.stockValueSatang = 0;
  value.store.sales = Array.isArray(value.store.sales) ? value.store.sales : [];
  value.store.purchases = Array.isArray(value.store.purchases) ? value.store.purchases : [];
  value.store.withdrawals = Array.isArray(value.store.withdrawals) ? value.store.withdrawals : [];
  value.ride ||= {};
  value.ride.currentRound ||= null;
  value.ride.rounds = Array.isArray(value.ride.rounds) ? value.ride.rounds : [];
  value.ride.jobs = Array.isArray(value.ride.jobs) ? value.ride.jobs : [];
  value.ride.expenses = Array.isArray(value.ride.expenses) ? value.ride.expenses : [];
  value.ride.creditBalanceSatang = Math.max(0, Number(value.ride.creditBalanceSatang || 0));
  value.ride.creditWithdrawals = Array.isArray(value.ride.creditWithdrawals) ? value.ride.creditWithdrawals : [];
  value.ledger ||= {};
  value.ledger.openingBalanceSatang = Number(value.ledger.openingBalanceSatang || 0);
  value.ledger.balanceVerified = Boolean(value.ledger.balanceVerified);
  value.ledger.transactions = Array.isArray(value.ledger.transactions) ? value.ledger.transactions : [];
  value.ledger.obligations = Array.isArray(value.ledger.obligations) ? value.ledger.obligations : [];
  value.calendar = Array.isArray(value.calendar) ? value.calendar : [];
  value.audit = Array.isArray(value.audit) ? value.audit : [];
  value.events = Array.isArray(value.events) ? value.events : [];
  value.sync ||= {};
  value.sync.lastExportAt ||= null;
  value.sync.lastImportAt ||= null;
  value.sync.pendingImport ||= null;
  value.sync.lastBatchId ||= null;
  value.sync.appliedCommandKeys = value.sync.appliedCommandKeys && typeof value.sync.appliedCommandKeys === "object" ? value.sync.appliedCommandKeys : {};
  value.migration ||= { fromSchema: null, migratedAt: null, sourceRelease: null };
  value.dataFixes ||= {};

  [...value.store.sales, ...value.store.purchases, ...value.store.withdrawals, ...value.ride.jobs, ...value.ride.expenses, ...value.ride.creditWithdrawals, ...value.ledger.obligations].forEach(record => {
    record.revision = Number(record.revision || 1);
    record.createdAt ||= nowIso();
    record.updatedAt ||= record.createdAt;
  });
  value.ride.jobs.forEach(job => { job.paymentMode ||= job.status === "SETTLED" ? "CASH" : "LEGACY_PENDING"; });
  value.ride.creditWithdrawals.forEach(item => { item.status ||= "PENDING"; item.due ||= recordDate(item); item.confirmedAt ||= null; item.cancelledAt ||= null; });
  value.ledger.obligations.forEach(item => {
    item.detail ||= "";
    item.installmentCount = Number(item.installmentCount || 1);
    item.firstDue ||= value.calendar.find(q => q.source === "LEDGER" && q.sourceId === item.id)?.due || recordDate(item);
    item.installments = Array.isArray(item.installments) ? item.installments : [];
    item.paidSatang = Number(item.paidSatang || 0);
    item.remainingSatang = Math.max(0, Number(item.remainingSatang ?? item.originalSatang ?? 0));
  });
  value.calendar.forEach((item, index) => {
    item.recordId ||= item.id;
    item.owner ||= item.source;
    item.recordType ||= "CALENDAR_ACTION";
    item.revision = Number(item.revision || 1);
    item.expectedRevision = Number(item.expectedRevision || 1);
    item.sourceRevision = Number(item.sourceRevision || item.expectedRevision || 1);
    item.sequence = Number(item.sequence || index + 1);
    item.appliedActions ||= {};
    item.history = Array.isArray(item.history) ? item.history : [];
    item.effects ||= { complete: "", cancel: "" };
    item.due ||= String(item.dueAt || "").slice(0, 10) || localISO();
    item.dueAt ||= `${item.due}T09:00:00+07:00`;
    item.triggerAt ||= item.dueAt;
    item.createdAt ||= nowIso();
    item.updatedAt ||= item.createdAt;
    item.paidSatang = Number(item.paidSatang || 0);
    item.installmentNumber = item.installmentNumber == null ? null : Number(item.installmentNumber);
    item.installmentCount = item.installmentCount == null ? null : Number(item.installmentCount);
    if (["PAY_OBLIGATION", "PAY_OBLIGATION_INSTALLMENT"].includes(item.actionType) && Number(item.installmentCount || 1) === 1) {
      item.installmentNumber = 1;
      item.installmentCount = 1;
    }
  });
  repairSafeStateInvariants(value);
  validateStateInvariants(value, { quarantine: true });
  return value;
}

function migrateSchema1(oldState) {
  const migrated = defaultState(Number(oldState.defaultPriceSatang || 80000), 0);
  migrated.ledger.balanceVerified = false;
  migrated.ledger.verifiedAt = null;
  migrated.settings.lockMinutes = Number(oldState.settings?.lockMinutes || 5);
  migrated.settings.lowStockThreshold = Number(oldState.settings?.lowStockThreshold ?? 3);
  migrated.settings.themeColor = oldState.settings?.themeColor === "indigo" ? "navy" : (oldState.settings?.themeColor || "navy");
  migrated.store.stockQty = Number(oldState.stockQty || 0);
  migrated.store.stockValueSatang = Number(oldState.stockValueSatang || 0);
  const debts = new Map((oldState.debts || []).map(d => [d.id, d]));
  const salesByDebt = new Map();

  for (const tx of oldState.transactions || []) {
    const createdAt = tx.createdAt || `${tx.date || localISO()}T12:00:00+07:00`;
    if (tx.type === "stock") {
      const id = `BUY-${tx.id}`;
      migrated.store.purchases.push({
        id, name: tx.note || "รับสินค้าเข้าจาก Stock Pocket", qty: Number(tx.qty || 0),
        costSatang: Number(tx.lotCostSatang || 0), paidAmountSatang: Number(tx.lotCostSatang || 0),
        status: "ACTIVE", date: tx.date || localISO(), createdAt, updatedAt: createdAt, revision: 1,
        cancelledAt: null, legacyId: tx.id
      });
      if (Number(tx.lotCostSatang || 0) > 0) addTransactionToState(migrated, {
        direction: "OUT", amountSatang: Number(tx.lotCostSatang), label: `ซื้อสินค้า ${id}`,
        source: "STORE", sourceId: id, subtype: "PURCHASE_PAYMENT", actionKey: `migration:${tx.id}`,
        createdAt
      });
    }
    if (tx.type === "withdraw") {
      migrated.store.withdrawals.push({
        id: `WD-${tx.id}`, qty: Number(tx.qty || 0), costSatang: Number(tx.costSatang || 0),
        reason: tx.reason || "เบิกใช้", note: tx.note || "", date: tx.date || localISO(),
        createdAt, updatedAt: createdAt, revision: 1, legacyId: tx.id
      });
    }
    if (tx.type === "sale") {
      const debt = tx.debtId ? debts.get(tx.debtId) : null;
      const outstandingSatang = debt ? Number(debt.balanceSatang || 0) : Number(tx.debtSatang || 0);
      const receivedSatang = Math.max(0, Number(tx.totalSatang || 0) - outstandingSatang);
      const sale = {
        id: `SALE-${tx.id}`, customer: tx.customer || "ลูกค้า", contact: tx.contact || "",
        qty: Number(tx.qty || 0), unitPriceSatang: Number(tx.unitPriceSatang || 0), totalSatang: Number(tx.totalSatang || 0),
        receivedSatang, outstandingSatang, costSatang: Number(tx.costSatang || 0),
        status: outstandingSatang > 0 ? (receivedSatang > 0 ? "PARTIAL" : "OPEN") : "COMPLETED",
        note: tx.note || "", date: tx.date || localISO(), createdAt, updatedAt: createdAt, revision: 1,
        cancelledAt: null, stockRestored: false, legacyId: tx.id, legacyDebtId: tx.debtId || null
      };
      migrated.store.sales.push(sale);
      if (tx.debtId) salesByDebt.set(tx.debtId, sale);
      const initialReceived = Number(tx.receivedSatang || 0);
      if (initialReceived > 0) addTransactionToState(migrated, {
        direction: "IN", amountSatang: initialReceived, label: `รับเงินจริงจากบิล ${sale.id}`,
        source: "STORE", sourceId: sale.id, subtype: "SALE_INITIAL_RECEIPT", actionKey: `migration:${tx.id}:initial`, createdAt
      });
    }
  }

  for (const tx of oldState.transactions || []) {
    if (tx.type !== "payment") continue;
    const sale = salesByDebt.get(tx.debtId);
    if (!sale) continue;
    addTransactionToState(migrated, {
      direction: "IN", amountSatang: Number(tx.amountSatang || 0), label: `รับชำระ ${sale.id}`,
      source: "STORE", sourceId: sale.id, subtype: "SALE_RECEIPT", actionKey: `migration:${tx.id}:payment`,
      createdAt: tx.createdAt || `${tx.date || localISO()}T12:00:00+07:00`
    });
  }

  for (const debt of oldState.debts || []) {
    const sale = salesByDebt.get(debt.id);
    if (!sale || Number(debt.balanceSatang || 0) <= 0) continue;
    addQueueToState(migrated, {
      source: "STORE", sourceId: sale.id, actionType: "RECEIVE_CUSTOMER_PAYMENT",
      status: Number(debt.balanceSatang) < Number(debt.originalSatang || debt.balanceSatang) ? "PARTIAL" : "OPEN",
      amountSatang: Number(debt.balanceSatang), due: debt.dueDate || localISO(),
      effects: { complete: "เพิ่มเงินจริงใน LEDGER และลดยอดลูกหนี้ร้านค้า", cancel: "ยกเลิกบิล คืนสต็อก และย้อนเงินที่เคยรับ" }
    });
  }

  migrated.migration = {
    fromSchema: 1,
    migratedAt: nowIso(),
    sourceRelease: "YGGDRASIL POCKET v1.1.0",
    legacySummary: {
      transactions: (oldState.transactions || []).length,
      debts: (oldState.debts || []).length,
      stockQty: Number(oldState.stockQty || 0)
    }
  };
  migrated.audit.unshift({ id: uid("AUD"), at: nowIso(), event: "MIGRATED_SCHEMA_1_TO_3", note: "รักษาสต็อก บิลขาย ลูกหนี้ และประวัติเดิม; เพิ่มโครง YGPH v2.1.2 และรอยืนยันยอดเงินปัจจุบัน" });
  return normalizeState(migrated);
}


function migrateSchema2(oldState) {
  const migrated = clone(oldState);
  migrated.schema = STATE_SCHEMA;
  migrated.ride ||= {};
  migrated.ride.creditBalanceSatang = Number(migrated.ride.creditBalanceSatang || 0);
  migrated.ride.creditWithdrawals = Array.isArray(migrated.ride.creditWithdrawals) ? migrated.ride.creditWithdrawals : [];
  migrated.ride.jobs = Array.isArray(migrated.ride.jobs) ? migrated.ride.jobs : [];
  migrated.ride.jobs.forEach(job => { job.paymentMode ||= job.status === "SETTLED" ? "CASH" : "LEGACY_PENDING"; });
  migrated.ledger ||= {};
  migrated.ledger.obligations = Array.isArray(migrated.ledger.obligations) ? migrated.ledger.obligations : [];
  migrated.calendar = Array.isArray(migrated.calendar) ? migrated.calendar : [];
  migrated.ledger.obligations.forEach(obligation => {
    obligation.detail ||= "";
    obligation.installmentCount = Math.max(1, Number(obligation.installmentCount || 1));
    const queue = migrated.calendar.find(q => q.source === "LEDGER" && q.sourceId === obligation.id);
    obligation.firstDue ||= queue?.due || recordDate(obligation);
    obligation.installments = Array.isArray(obligation.installments) ? obligation.installments : [];
  });
  migrated.calendar.forEach(item => {
    item.paidSatang = Number(item.paidSatang || 0);
    item.installmentNumber = item.installmentNumber == null ? null : Number(item.installmentNumber);
    item.installmentCount = item.installmentCount == null ? null : Number(item.installmentCount);
    const source = findSourceInState(migrated, item.source, item.sourceId);
    if (source) { item.expectedRevision = Number(source.revision || 1); item.sourceRevision = item.expectedRevision; }
  });
  migrated.sync = { lastExportAt: oldState.sync?.lastExportAt || null, lastImportAt: oldState.sync?.lastImportAt || null, pendingImport: null, lastBatchId: null };
  migrated.migration = { ...(oldState.migration || {}), fromSchema: 2, migratedAt: nowIso(), sourceRelease: "YGPH v2.0.0" };
  migrated.audit = Array.isArray(migrated.audit) ? migrated.audit : [];
  migrated.audit.unshift({ id: uid("AUD"), at: nowIso(), event: "MIGRATED_SCHEMA_2_TO_3", note: "เพิ่มเครดิตงานวิ่ง งวดภาระ รายงานตามวันที่ และ EXCHANGE v1 โดยรักษาข้อมูลเดิม" });
  return normalizeState(migrated);
}

const LEGACY_RECEIVABLE_PATCH_KEY = "v2.1.2:receivable-reclass:SALE-mscw6t7o-lsmn5p:80000";
const LEGACY_RECEIVABLE_SAFETY_REPAIR_KEY = "v4.0.0:repair-receivable-evidence:SALE-mscw6t7o-lsmn5p:80000";

function applyLegacySchema3ReceivablePatch(target, timestamp = nowIso()) {
  target.dataFixes ||= {};
  if (target.dataFixes[LEGACY_RECEIVABLE_PATCH_KEY]) return target.dataFixes[LEGACY_RECEIVABLE_PATCH_KEY];

  const saleId = "SALE-mscw6t7o-lsmn5p";
  const sale = target.store?.sales?.find(item => item.id === saleId);
  const badReceipt = target.ledger?.transactions?.find(transaction =>
    transaction.source === "STORE" && transaction.sourceId === saleId && transaction.direction === "IN"
    && Number(transaction.amountSatang || 0) === 80000 && transaction.subtype === "SALE_RECEIPT" && !transaction.reversedBy
  );
  if (!sale || !badReceipt || Number(sale.outstandingSatang || 0) < 80000) {
    target.dataFixes[LEGACY_RECEIVABLE_PATCH_KEY] = { appliedAt: timestamp, skipped: true, reason: "ไม่พบเงื่อนไขข้อมูลเดิมครบถ้วน" };
    return target.dataFixes[LEGACY_RECEIVABLE_PATCH_KEY];
  }

  sale.receivedSatang = Math.max(0, Number(sale.receivedSatang || 0) - 80000);
  sale.outstandingSatang = Math.max(0, Number(sale.totalSatang || 0) - sale.receivedSatang);
  sale.status = sale.outstandingSatang === 0 ? "COMPLETED" : sale.receivedSatang > 0 ? "PARTIAL" : "OPEN";
  sale.revision = Number(sale.revision || 1) + 1;
  sale.updatedAt = timestamp;
  const queue = target.calendar?.find(item => item.source === "STORE" && item.sourceId === saleId && item.actionType === "RECEIVE_CUSTOMER_PAYMENT" && !["COMPLETED", "CANCELLED"].includes(item.status));
  if (queue) {
    queue.amountSatang = sale.outstandingSatang;
    queue.status = sale.status;
    queue.expectedRevision = sale.revision;
    queue.sourceRevision = sale.revision;
    queue.revision = Number(queue.revision || 1) + 1;
    queue.updatedAt = timestamp;
    queue.history = Array.isArray(queue.history) ? queue.history : [];
    queue.history.push({ at: timestamp, event: "RECEIVABLE_CORRECTED", note: "เพิ่มยอดค้าง 800 บาทที่ยังไม่ได้รับเงินจริง" });
  }
  const reversal = addTransactionToState(target, {
    direction: "OUT",
    amountSatang: 80000,
    label: "ย้อนรายการรับเงินที่จัดเป็นลูกหนี้",
    source: "STORE",
    sourceId: saleId,
    subtype: "REVERSAL_SALE_RECEIPT",
    actionKey: LEGACY_RECEIVABLE_PATCH_KEY,
    reversalOf: badReceipt.id,
    reversalReason: "RECEIVABLE_RECLASSIFICATION",
    createdAt: timestamp
  });
  if (!reversal) throw new Error("สร้าง Reversal สำหรับ Migration ลูกหนี้ไม่สำเร็จ");
  badReceipt.reversedBy = reversal.id;
  target.audit = Array.isArray(target.audit) ? target.audit : [];
  target.audit.unshift({
    id: uid("AUD"), at: timestamp, event: "RECEIVABLE_RECLASSIFIED",
    note: "ปรับ 800 บาทออกจากเงินปัจจุบันและคืนเป็นลูกหนี้ เพราะยังไม่ได้รับเงินจริง"
  });
  target.dataFixes[LEGACY_RECEIVABLE_PATCH_KEY] = { appliedAt: timestamp, amountSatang: 80000, sourceId: saleId, newOutstandingSatang: sale.outstandingSatang };
  return target.dataFixes[LEGACY_RECEIVABLE_PATCH_KEY];
}

function applyLegacySchema4ReceivableEvidenceRepair(target, timestamp = nowIso()) {
  target.dataFixes ||= {};
  if (target.dataFixes[LEGACY_RECEIVABLE_SAFETY_REPAIR_KEY]) {
    return { applied: false, alreadyApplied: true, evidence: target.dataFixes[LEGACY_RECEIVABLE_SAFETY_REPAIR_KEY] };
  }

  const saleId = "SALE-mscw6t7o-lsmn5p";
  const sale = target.store?.sales?.find(item => item.id === saleId);
  const oldReceipt = target.ledger?.transactions?.find(transaction =>
    transaction.source === "STORE"
    && transaction.sourceId === saleId
    && transaction.direction === "IN"
    && Number(transaction.amountSatang || 0) === 80000
    && transaction.subtype === "SALE_RECEIPT"
    && transaction.reclassifiedBy === LEGACY_RECEIVABLE_PATCH_KEY
    && !transaction.reversedBy
  );
  const oldAdjustment = target.ledger?.transactions?.find(transaction =>
    transaction.source === "STORE"
    && transaction.sourceId === saleId
    && transaction.direction === "OUT"
    && Number(transaction.amountSatang || 0) === 80000
    && transaction.subtype === "RECEIVABLE_RECLASSIFICATION"
    && transaction.actionKey === LEGACY_RECEIVABLE_PATCH_KEY
    && !transaction.reversedBy
  );
  if (!sale || !oldReceipt || !oldAdjustment) return { applied: false, alreadyApplied: false, evidence: null };

  const reverseAdjustment = addTransactionToState(target, {
    direction: "IN",
    amountSatang: oldAdjustment.amountSatang,
    label: "ย้อนหลักฐานปรับลูกหนี้แบบเดิม",
    source: oldAdjustment.source,
    sourceId: oldAdjustment.sourceId,
    subtype: "REVERSAL_RECEIVABLE_RECLASSIFICATION",
    actionKey: `${LEGACY_RECEIVABLE_SAFETY_REPAIR_KEY}:adjustment:${oldAdjustment.id}`,
    reversalOf: oldAdjustment.id,
    reversalReason: "LEGACY_RECEIVABLE_EVIDENCE_REPAIR",
    createdAt: timestamp
  });
  const reverseReceipt = addTransactionToState(target, {
    direction: "OUT",
    amountSatang: oldReceipt.amountSatang,
    label: "ย้อนรายการรับเงินเดิมให้เชื่อมหลักฐานครบ",
    source: oldReceipt.source,
    sourceId: oldReceipt.sourceId,
    subtype: "REVERSAL_SALE_RECEIPT",
    actionKey: `${LEGACY_RECEIVABLE_SAFETY_REPAIR_KEY}:receipt:${oldReceipt.id}`,
    reversalOf: oldReceipt.id,
    reversalReason: "LEGACY_RECEIVABLE_EVIDENCE_REPAIR",
    createdAt: timestamp
  });
  if (!reverseAdjustment || !reverseReceipt) throw new Error("สร้างคู่ Reversal สำหรับซ่อมหลักฐานลูกหนี้ไม่สำเร็จ");
  oldAdjustment.reversedBy = reverseAdjustment.id;
  oldReceipt.reversedBy = reverseReceipt.id;

  target.audit = Array.isArray(target.audit) ? target.audit : [];
  target.audit.unshift({
    id: uid("AUD"),
    at: timestamp,
    event: "LEGACY_RECEIVABLE_EVIDENCE_REPAIRED",
    note: "เติมคู่ Reversal ให้หลักฐานลูกหนี้เดิมโดยยอดเงินจริงสุทธิไม่เปลี่ยน"
  });
  const evidence = {
    appliedAt: timestamp,
    sourceId: saleId,
    amountSatang: oldReceipt.amountSatang,
    oldReceiptId: oldReceipt.id,
    oldAdjustmentId: oldAdjustment.id,
    receiptReversalId: reverseReceipt.id,
    adjustmentReversalId: reverseAdjustment.id,
    netCashChangeSatang: 0
  };
  target.dataFixes[LEGACY_RECEIVABLE_SAFETY_REPAIR_KEY] = evidence;
  return { applied: true, alreadyApplied: false, evidence };
}

function prepareSchema4SafetyRepair(sourceState, core = resolveYGPHCore(), timestamp = nowIso()) {
  const before = normalizeState(clone(sourceState));
  const next = clone(before);
  const repair = applyLegacySchema4ReceivableEvidenceRepair(next, timestamp);
  if (!repair.applied) return { state: before, repaired: false, repair };

  next.revision = Number(before.revision || 0) + 1;
  next.updatedAt = timestamp;
  next.events = Array.isArray(next.events) ? next.events : [];
  next.sync ||= {};
  next.sync.appliedCommandKeys = next.sync.appliedCommandKeys && typeof next.sync.appliedCommandKeys === "object" ? next.sync.appliedCommandKeys : {};
  validateStateInvariants(next, { quarantine: false });

  const identityHash = core.hash({
    repairKey: LEGACY_RECEIVABLE_SAFETY_REPAIR_KEY,
    sourceRevision: Number(before.revision || 0),
    oldReceiptId: repair.evidence.oldReceiptId,
    oldAdjustmentId: repair.evidence.oldAdjustmentId
  });
  const actionId = `FIX-${identityHash.replace("fnv1a-", "")}`;
  const plan = core.buildPlan(before, next, {
    actionId,
    actor: "SYSTEM_SAFETY_REPAIR",
    eventType: "LEGACY_RECEIVABLE_EVIDENCE_REPAIRED",
    sourceDomain: "CORE",
    sourceOwner: "SYSTEM",
    targetDomain: ["CORE", "STORE", "LEDGER", "AUDIT"],
    correlationId: actionId,
    causationId: LEGACY_RECEIVABLE_PATCH_KEY,
    idempotencyKey: LEGACY_RECEIVABLE_SAFETY_REPAIR_KEY,
    timestamp,
    payloadVersion: 1,
    provenance: { repairKey: LEGACY_RECEIVABLE_SAFETY_REPAIR_KEY, netCashChangeSatang: 0 }
  });
  core.validatePlan(plan, before, next);
  next.sync.appliedCommandKeys[plan.idempotencyKey] = {
    actionId,
    eventType: plan.eventType,
    sourceDomain: plan.sourceDomain,
    appliedAt: timestamp,
    revision: next.revision
  };
  next.events.push(core.createEventEnvelope({ plan, nextState: next, eventId: `EV-${identityHash.replace("fnv1a-", "")}` }));
  return { state: next, repaired: true, repair, plan };
}

function migrateSchema3(oldState) {
  const migrated = clone(oldState);
  migrated.schema = STATE_SCHEMA;
  applyLegacySchema3ReceivablePatch(migrated);
  migrated.migration = { ...(oldState.migration || {}), fromSchema: 3, migratedAt: nowIso(), sourceRelease: "YGPH v2.1.1" };
  migrated.audit = Array.isArray(migrated.audit) ? migrated.audit : [];
  migrated.audit.unshift({ id: uid("AUD"), at: nowIso(), event: "MIGRATED_SCHEMA_3_TO_4", note: "แยกลูกหนี้ออกจากเงินจริง และปรับรายงาน/การเงินเป็นฐานเงินสด" });
  return normalizeState(migrated);
}

function validateState(value) {
  if (!value || ![1, 2, 3, STATE_SCHEMA].includes(Number(value.schema))) throw new Error("โครงข้อมูลไม่รองรับ");
  if (Number(value.schema) === 1 && (!Array.isArray(value.transactions) || !Array.isArray(value.debts))) throw new Error("โครงข้อมูลเดิมไม่สมบูรณ์");
  if ([2, 3, STATE_SCHEMA].includes(Number(value.schema)) && (!value.store || !value.ledger || !Array.isArray(value.calendar))) throw new Error("โครงข้อมูล YGPH ไม่สมบูรณ์");
}
function repairSafeStateInvariants(target) {
  if (!target?.store || !target?.ledger || !Array.isArray(target.calendar)) return;
  target.dataFixes ||= {};
  if (Number(target.store.stockQty || 0) === 0 && Number(target.store.stockValueSatang || 0) !== 0) {
    target.store.stockValueSatang = 0;
    target.dataFixes.stockZeroValueInvariant ||= { appliedAt: nowIso(), release: CORE_DATA_RELEASE_VERSION };
  }
  for (const item of target.calendar) {
    const isPayment = ["RECEIVE_CUSTOMER_PAYMENT", "PAY_OBLIGATION", "PAY_OBLIGATION_INSTALLMENT"].includes(item.actionType);
    const remaining = Math.max(0, Number(item.amountSatang || 0) - Number(item.paidSatang || 0));
    if (item.status === "COMPLETED") {
      item.completedAt ||= item.updatedAt || nowIso();
      item.cancelledAt = null;
    } else if (item.status === "CANCELLED") {
      item.cancelledAt ||= item.updatedAt || nowIso();
      item.completedAt = null;
    } else if (item.completedAt && isPayment && remaining === 0) {
      item.status = "COMPLETED";
      item.cancelledAt = null;
    } else {
      item.completedAt = null;
    }
    if (["PAY_OBLIGATION", "PAY_OBLIGATION_INSTALLMENT"].includes(item.actionType) && Number(item.installmentCount || 1) === 1) {
      item.installmentNumber = 1;
      item.installmentCount = 1;
    }
  }
  for (const obligation of target.ledger.obligations || []) {
    if (Number(obligation.installmentCount || 1) === 1) {
      obligation.installmentCount = 1;
      if (Array.isArray(obligation.installments) && obligation.installments.length === 1) obligation.installments[0].number = 1;
    }
  }
}
function validateStateInvariants(target, { quarantine = false } = {}) {
  const fatal = [], warnings = [];
  try { resolveYGPHCore().validateStateAmounts(target); }
  catch (error) { fatal.push(error.message); }
  try { resolveYGPHCore().validateReversalTopology(target, { allowLegacyUnlinked: true }); }
  catch (error) { fatal.push(error.message); }
  const failMoney = (value, label, allowZero = true) => {
    try { parseSatang(value, { allowZero, label }); } catch (error) { fatal.push(error.message); }
  };
  const stockQty = Number(target?.store?.stockQty);
  if (!Number.isSafeInteger(stockQty) || stockQty < 0 || stockQty > MAX_QUANTITY) fatal.push("จำนวนสต็อกไม่ถูกต้อง");
  failMoney(Number(target?.store?.stockValueSatang), "มูลค่าสต็อก");
  if (stockQty === 0 && Number(target?.store?.stockValueSatang || 0) !== 0) fatal.push("สต็อกเป็นศูนย์แต่มูลค่าสต็อกไม่เป็นศูนย์");
  const openingBalance = Number(target?.ledger?.openingBalanceSatang || 0);
  if (!Number.isSafeInteger(openingBalance) || Math.abs(openingBalance) > MAX_ALLOWED_SATANG) fatal.push("ยอดตั้งต้นไม่ถูกต้อง");
  for (const tx of target?.ledger?.transactions || []) {
    failMoney(Number(tx.amountSatang), `ธุรกรรม ${tx.id} `, false);
    if (!["IN", "OUT"].includes(tx.direction)) fatal.push(`ทิศทางธุรกรรม ${tx.id} ไม่ถูกต้อง`);
  }
  const balance = openingBalance + (target?.ledger?.transactions || []).reduce((sum, tx) => sum + (tx.direction === "IN" ? Number(tx.amountSatang || 0) : -Number(tx.amountSatang || 0)), 0);
  if (!Number.isSafeInteger(balance) || Math.abs(balance) > MAX_ALLOWED_SATANG) fatal.push("ยอดเงินปัจจุบันเกินขอบเขตที่ระบบรองรับ");
  for (const obligation of target?.ledger?.obligations || []) {
    failMoney(Number(obligation.originalSatang), `ภาระ ${obligation.id} `, false);
    failMoney(Number(obligation.paidSatang || 0), `ยอดจ่าย ${obligation.id} `);
    failMoney(Number(obligation.remainingSatang || 0), `ยอดคงเหลือ ${obligation.id} `);
    if (Number(obligation.paidSatang || 0) > Number(obligation.originalSatang || 0) || Number(obligation.remainingSatang || 0) !== Math.max(0, Number(obligation.originalSatang || 0) - Number(obligation.paidSatang || 0))) fatal.push(`สมการยอดภาระ ${obligation.id} ไม่ตรง`);
    const count = Number(obligation.installmentCount || 1);
    const queues = (target.calendar || []).filter(item => item.source === "LEDGER" && item.sourceId === obligation.id && ["PAY_OBLIGATION", "PAY_OBLIGATION_INSTALLMENT"].includes(item.actionType));
    const numbers = queues.map(item => Number(item.installmentNumber)).sort((a, b) => a - b);
    const unique = new Set(numbers);
    const total = queues.reduce((sum, item) => sum + Number(item.amountSatang || 0), 0);
    const scheduleValid = Number.isInteger(count) && count >= 1 && count <= MAX_INSTALLMENTS && queues.length === count && unique.size === count && numbers.every((number, index) => number === index + 1) && total === Number(obligation.originalSatang || 0);
    if (!scheduleValid && !["CANCELLED", "COMPLETED"].includes(obligation.status)) {
      warnings.push(`โครงงวด ${obligation.id} ไม่ครบสมการ`);
      if (quarantine) {
        obligation.status = "VERIFY";
        queues.filter(item => !["CANCELLED", "COMPLETED"].includes(item.status)).forEach(item => { item.status = "VERIFY"; item.requiresRefreshBeforePayment = true; });
      }
    }
  }
  for (const item of target?.calendar || []) {
    failMoney(Number(item.amountSatang || 0), `ยอดคิว ${item.id} `);
    failMoney(Number(item.paidSatang || 0), `ยอดจ่ายคิว ${item.id} `);
    if (!validISODate(item.due)) fatal.push(`วันที่คิว ${item.id} ไม่ถูกต้อง`);
    if (Number(item.paidSatang || 0) > Number(item.amountSatang || 0)) fatal.push(`ยอดจ่ายคิว ${item.id} เกินยอดคิว`);
    const paymentAction = ["RECEIVE_CUSTOMER_PAYMENT", "PAY_OBLIGATION", "PAY_OBLIGATION_INSTALLMENT"].includes(item.actionType);
    if (paymentAction && Number(item.amountSatang || 0) <= 0 && item.status !== "COMPLETED") fatal.push(`คิวเงินจริง ${item.id} ต้องมียอดมากกว่า 0`);
    if (paymentAction && item.status === "COMPLETED" && Math.max(0, Number(item.amountSatang || 0) - Number(item.paidSatang || 0)) !== 0 && item.actionType !== "RECEIVE_CUSTOMER_PAYMENT") fatal.push(`คิว ${item.id} ปิดแล้วแต่ยอดยังไม่ครบ`);
    if (!findSourceInState(target, item.source, item.sourceId)) {
      warnings.push(`คิว ${item.id} ไม่พบข้อมูลต้นทาง`);
      if (quarantine && !["CANCELLED", "COMPLETED"].includes(item.status)) { item.status = "VERIFY"; item.requiresRefreshBeforePayment = true; }
    }
    if (item.status === "COMPLETED" && (!item.completedAt || item.cancelledAt)) fatal.push(`สถานะคิว ${item.id} ขัดกัน`);
    if (item.status === "CANCELLED" && (!item.cancelledAt || item.completedAt)) fatal.push(`สถานะคิว ${item.id} ขัดกัน`);
    if (!["COMPLETED", "CANCELLED"].includes(item.status) && item.completedAt) fatal.push(`คิว ${item.id} เปิดอยู่แต่มีเวลาปิดแล้ว`);
  }
  target.integrity = { checkedAt: nowIso(), release: CORE_DATA_RELEASE_VERSION, fatal: [...new Set(fatal)], warnings: [...new Set(warnings)] };
  if (fatal.length) throw new Error(`ข้อมูลไม่ผ่านกฎความปลอดภัย: ${[...new Set(fatal)].slice(0, 3).join("; ")}`);
  return target.integrity;
}

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(DB_STORE)) request.result.createObjectStore(DB_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
function dbGet(key) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, "readonly");
    const request = tx.objectStore(DB_STORE).get(key);
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error);
  });
}
function dbPut(key, value) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, "readwrite");
    tx.objectStore(DB_STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
function dbDelete(key) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, "readwrite");
    tx.objectStore(DB_STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
function dbPromoteVault(previousVault, candidateVault, metadata) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, "readwrite");
    const store = tx.objectStore(DB_STORE);
    if (previousVault != null) store.put(previousVault, ROLLBACK_VAULT_KEY);
    store.put(metadata, ROLLBACK_META_KEY);
    store.put(candidateVault, VAULT_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error("บันทึก Snapshot และ Vault ไม่สำเร็จ"));
    tx.onabort = () => reject(tx.error || new Error("ยกเลิกการบันทึก Snapshot และ Vault"));
  });
}

async function writeVaultWithSnapshot({
  core,
  previousVault,
  candidateVault,
  metadata,
  atomicPromoteFn = input => dbPromoteVault(input.previousVault, input.candidateVault, input.metadata),
  readSnapshotFn = async () => ({
    rollbackVault: await dbGet(ROLLBACK_VAULT_KEY),
    metadata: await dbGet(ROLLBACK_META_KEY)
  })
}) {
  if (!core?.hash || !candidateVault || !metadata) throw new Error("ข้อมูล Snapshot ก่อนเขียนไม่ครบ");
  await atomicPromoteFn({ previousVault, candidateVault, metadata });
  const saved = await readSnapshotFn();
  if (previousVault != null && core.hash(saved?.rollbackVault) !== core.hash(previousVault)) {
    throw new Error("SNAPSHOT READBACK_FAILED: Rollback Vault ไม่ตรง");
  }
  if (core.hash(saved?.metadata) !== core.hash(metadata)) {
    throw new Error("SNAPSHOT READBACK_FAILED: Metadata ไม่ตรง");
  }
  return saved;
}
function bytesToBase64(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}
function base64ToBytes(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
async function deriveKey(passphrase, salt, iterations = PBKDF2_ITERATIONS) {
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(passphrase), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations, hash: "SHA-256" }, material, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}
async function encryptState(value, key, kdf) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(value));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: AAD, tagLength: 128 }, key, plaintext));
  return { format: "stock-pocket-vault", version: VAULT_VERSION, kdf, cipher: { name: "AES-GCM", iv: bytesToBase64(iv), tagLength: 128 }, ciphertext: bytesToBase64(ciphertext), updatedAt: nowIso() };
}
function validateVault(vault) {
  if (!vault || vault.format !== "stock-pocket-vault" || Number(vault.version) !== VAULT_VERSION) throw new Error("รูปแบบคลังข้อมูลไม่รองรับ");
  if (vault.kdf?.name !== "PBKDF2" || vault.kdf?.hash !== "SHA-256") throw new Error("รูปแบบรหัสไม่รองรับ");
  if (!Number.isInteger(vault.kdf.iterations) || vault.kdf.iterations < 100000) throw new Error("ค่าความปลอดภัยไม่ถูกต้อง");
  if (vault.cipher?.name !== "AES-GCM") throw new Error("รูปแบบการเข้ารหัสไม่รองรับ");
}
async function decryptVault(vault, key) {
  validateVault(vault);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: base64ToBytes(vault.cipher.iv), additionalData: AAD, tagLength: 128 }, key, base64ToBytes(vault.ciphertext));
  const value = JSON.parse(new TextDecoder().decode(plain));
  validateState(value);
  return value;
}

async function commitStateAtomic({
  core,
  beforeState,
  proposedState,
  previousVault,
  commandContext = {},
  encrypt,
  writeVault,
  readVault,
  decrypt,
  restoreVault,
  prepareState = null,
  now = nowIso
}) {
  if (!core?.buildPlan || !core?.validatePlan || !core?.createEventEnvelope || !core?.assertReadback) {
    throw new Error("YGPH Core ไม่พร้อมใช้งาน");
  }
  if (!beforeState || !proposedState) throw new Error("ไม่มี State ก่อนหรือหลังคำสั่ง");
  if (![encrypt, writeVault, readVault, decrypt].every(item => typeof item === "function")) {
    throw new Error("Persistence adapter ไม่ครบ");
  }

  const before = clone(beforeState);
  let next = clone(proposedState);
  if (typeof prepareState === "function") next = (await prepareState(next)) || next;
  next.events = Array.isArray(next.events) ? next.events : [];
  next.sync ||= {};
  next.sync.appliedCommandKeys = next.sync.appliedCommandKeys && typeof next.sync.appliedCommandKeys === "object"
    ? next.sync.appliedCommandKeys
    : {};

  const timestamp = commandContext.timestamp || now();
  next.updatedAt = timestamp;
  next.revision = Number(before.revision || 0) + 1;
  const idempotencyKey = String(commandContext.idempotencyKey || `YGPH:${core.hash({
    sourceRevision: Number(before.revision || 0),
    proposed: core.durableProjection(next)
  })}`);
  const context = {
    ...commandContext,
    timestamp,
    idempotencyKey,
    expectedRevision: next.revision,
    provenance: {
      releaseVersion: CORE_DATA_RELEASE_VERSION,
      ...(commandContext.provenance || {})
    }
  };

  if (core.hasIdempotencyKey(before, idempotencyKey)) {
    const duplicate = new Error(`คำสั่ง ${idempotencyKey} ทำไปแล้ว ระบบไม่คำนวณซ้ำ`);
    duplicate.code = "DUPLICATE";
    throw duplicate;
  }

  const plan = core.buildPlan(before, next, context);
  core.validatePlan(plan, before, next);
  next.sync.appliedCommandKeys[idempotencyKey] = {
    actionId: plan.actionId,
    eventType: plan.eventType,
    sourceDomain: plan.sourceDomain,
    appliedAt: timestamp,
    revision: next.revision
  };
  const event = core.createEventEnvelope({ plan, nextState: next, eventId: commandContext.eventId });
  next.events.push(event);

  let writeAttempted = false;
  try {
    const vault = await encrypt(next);
    writeAttempted = true;
    await writeVault(vault);
    const storedVault = await readVault();
    if (!storedVault) throw new Error("HIGHWAY READBACK_FAILED: ไม่พบ Vault หลังบันทึก");
    const storedState = await decrypt(storedVault);
    const durableHash = core.assertReadback(next, storedState);
    const storedEvent = storedState.events?.find(item => item.eventId === event.eventId);
    if (!storedEvent || storedEvent.checksum !== event.checksum) {
      throw new Error("HIGHWAY READBACK_FAILED: Event Envelope ไม่ตรงกับคำสั่ง");
    }
    if (storedEvent.expectedDurableHash !== core.hash(core.eventHashProjection(storedState))) {
      throw new Error("HIGHWAY READBACK_FAILED: Expected Durable Hash ไม่ตรง");
    }
    return {
      state: storedState,
      vault: storedVault,
      plan,
      event: storedEvent,
      readback: {
        status: "VERIFIED",
        verifiedAt: now(),
        actionId: plan.actionId,
        stateRevision: storedState.revision,
        durableHash
      }
    };
  } catch (error) {
    if (writeAttempted && previousVault != null && typeof restoreVault === "function") {
      try {
        await restoreVault(previousVault);
        const restored = await readVault();
        if (core.hash(restored) !== core.hash(previousVault)) throw new Error("Raw Vault หลัง Rollback ไม่ตรงกับ Snapshot");
        error.rollbackVerified = true;
      } catch (rollbackError) {
        const failure = new Error(`${error.message || error}; ROLLBACK_FAILED: ${rollbackError.message || rollbackError}`);
        failure.cause = error;
        failure.rollbackVerified = false;
        throw failure;
      }
    }
    throw error;
  }
}

function backupPreviewForState(value, compatibility, integrity = {}) {
  const transactions = Array.isArray(value?.ledger?.transactions) ? value.ledger.transactions : [];
  const sales = Array.isArray(value?.store?.sales) ? value.store.sales : [];
  const obligations = Array.isArray(value?.ledger?.obligations) ? value.ledger.obligations : [];
  const calendar = Array.isArray(value?.calendar) ? value.calendar : [];
  const balanceSatang = Number(value?.ledger?.openingBalanceSatang || 0) + transactions.reduce(
    (sum, transaction) => sum + (transaction.direction === "IN" ? Number(transaction.amountSatang || 0) : -Number(transaction.amountSatang || 0)),
    0
  );
  const receivableSatang = sales
    .filter(sale => sale.status !== "CANCELLED")
    .reduce((sum, sale) => sum + Math.max(0, Number(sale.outstandingSatang || 0)), 0);

  return {
    sourceSchema: compatibility.sourceSchema,
    targetSchema: compatibility.targetSchema,
    mode: compatibility.mode,
    migrationPath: clone(compatibility.migrationPath),
    stateRevision: Number(value?.revision || 0),
    stockQty: Number(value?.store?.stockQty || 0),
    stockValueSatang: Number(value?.store?.stockValueSatang || 0),
    balanceSatang,
    receivableSatang,
    obligationRemainingSatang: obligations.reduce((sum, item) => sum + Math.max(0, Number(item.remainingSatang || 0)), 0),
    records: {
      sales: sales.length,
      purchases: value?.store?.purchases?.length || 0,
      rideJobs: value?.ride?.jobs?.length || 0,
      transactions: transactions.length,
      obligations: obligations.length,
      calendar: calendar.length,
      audit: value?.audit?.length || 0,
      events: value?.events?.length || 0
    },
    queue: {
      open: calendar.filter(item => !["COMPLETED", "CANCELLED"].includes(item.status)).length,
      verify: calendar.filter(item => item.status === "VERIFY" || item.requiresRefreshBeforePayment).length
    },
    warnings: [...new Set(integrity?.warnings || value?.integrity?.warnings || [])]
  };
}

function migrateStateToCurrent(value) {
  const schema = Number(value?.schema);
  if (schema === 1) return migrateSchema1(value);
  if (schema === 2) return migrateSchema2(value);
  if (schema === 3) return migrateSchema3(value);
  if (schema === STATE_SCHEMA) return prepareSchema4SafetyRepair(value).state;
  throw new Error(`Schema ${schema} ไม่รองรับ`);
}

function finalizeMigrationEvidence(sourceState, migratedState, compatibility, core, timestamp, identityMaterial) {
  const next = clone(migratedState);
  const sourceRevision = Number(sourceState?.revision || 0);
  next.revision = sourceRevision + 1;
  next.updatedAt = timestamp;
  next.events = Array.isArray(next.events) ? next.events : [];
  next.sync ||= {};
  next.sync.appliedCommandKeys = next.sync.appliedCommandKeys && typeof next.sync.appliedCommandKeys === "object" ? next.sync.appliedCommandKeys : {};
  const materialHash = core.hash(identityMaterial || {
    schema: compatibility.sourceSchema,
    revision: sourceRevision,
    createdAt: sourceState?.createdAt || null
  });
  const idempotencyKey = `migration:${compatibility.sourceSchema}:to:${compatibility.targetSchema}:${materialHash}`;
  if (next.sync.appliedCommandKeys[idempotencyKey] || next.events.some(event => event.idempotencyKey === idempotencyKey)) return next;
  const actionId = `MIG-${materialHash.replace("fnv1a-", "")}`;
  const plan = {
    actionId,
    actor: "SYSTEM_MIGRATION",
    eventType: "STATE_SCHEMA_MIGRATED",
    sourceDomain: "CORE",
    sourceOwner: "SYSTEM",
    targetDomain: ["CORE", "STORE", "RIDE", "LEDGER", "CALENDAR"],
    correlationId: actionId,
    causationId: actionId,
    idempotencyKey,
    timestamp,
    payloadVersion: 1,
    provenance: { migrationPath: clone(compatibility.migrationPath) },
    sourceRevision,
    expectedRevision: next.revision,
    changes: [],
    deletions: [],
    stateChanges: [{ path: "schema", before: compatibility.sourceSchema, after: compatibility.targetSchema }]
  };
  next.sync.appliedCommandKeys[idempotencyKey] = {
    actionId,
    eventType: plan.eventType,
    sourceDomain: plan.sourceDomain,
    appliedAt: timestamp,
    revision: next.revision
  };
  next.events.push(core.createEventEnvelope({ plan, nextState: next, eventId: `EV-${materialHash.replace("fnv1a-", "")}` }));
  return next;
}

async function inspectBackupCandidate(parsed, passphrase, dependencies = {}) {
  const core = dependencies.core || resolveYGPHCore();
  const clock = dependencies.now || nowIso;
  const deriveKeyFn = dependencies.deriveKeyFn || deriveKey;
  const decryptVaultFn = dependencies.decryptVaultFn || decryptVault;
  const migrateStateFn = dependencies.migrateStateFn || migrateStateToCurrent;
  const normalizeStateFn = dependencies.normalizeStateFn || normalizeState;
  const prepareSafetyRepairFn = dependencies.prepareSafetyRepairFn || prepareSchema4SafetyRepair;
  const validateCandidateShapeFn = dependencies.validateCandidateShapeFn || validateState;
  const validateInvariantsFn = dependencies.validateInvariantsFn || (value => validateStateInvariants(value, { quarantine: false }));
  const encryptStateFn = dependencies.encryptStateFn || encryptState;
  const inspectionTimestamp = clock();

  const envelope = core.validateBackupEnvelope(parsed);
  if (typeof passphrase !== "string" || !passphrase) throw new Error("กรอกรหัสของไฟล์สำรอง");
  const sourceVault = envelope.vault;
  const key = await deriveKeyFn(passphrase, base64ToBytes(sourceVault.kdf.salt), sourceVault.kdf.iterations);
  const decrypted = await decryptVaultFn(sourceVault, key);
  const originalSchema = Number(decrypted?.schema);
  const compatibility = core.compatibilityFor(originalSchema);
  if (!compatibility.supported) throw new Error(`Schema ${originalSchema} ไม่รองรับ`);
  validateCandidateShapeFn(decrypted);

  let candidateState = compatibility.mode === "MIGRATE"
    ? migrateStateFn(clone(decrypted))
    : normalizeStateFn(clone(decrypted));
  if (compatibility.mode === "MIGRATE") {
    candidateState = finalizeMigrationEvidence(decrypted, candidateState, compatibility, core, inspectionTimestamp, sourceVault);
  }
  const safetyRepair = prepareSafetyRepairFn(candidateState, core, inspectionTimestamp);
  candidateState = safetyRepair?.state || candidateState;
  if (Number(candidateState?.schema) !== STATE_SCHEMA) throw new Error("Migration ไม่ได้ผลลัพธ์เป็น Schema 4");
  validateCandidateShapeFn(candidateState);
  const integrity = validateInvariantsFn(candidateState) || { fatal: [], warnings: [] };
  if (integrity.fatal?.length) throw new Error(`ข้อมูลไม่ผ่านกฎความปลอดภัย: ${integrity.fatal.join("; ")}`);
  const candidateVault = await encryptStateFn(candidateState, key, sourceVault.kdf);

  return {
    inspectedAt: inspectionTimestamp,
    originalSchema,
    compatibility,
    sourceEnvelope: envelope,
    sourceVault,
    candidateVault,
    state: candidateState,
    key,
    preview: backupPreviewForState(candidateState, compatibility, integrity)
  };
}

async function promoteLegacyMigration(sourceVault, key, sourceState) {
  const core = resolveYGPHCore();
  const compatibility = core.compatibilityFor(sourceState?.schema);
  if (!compatibility.supported || compatibility.mode !== "MIGRATE") throw new Error(`Schema ${sourceState?.schema} ไม่รองรับการ Migration`);
  const timestamp = nowIso();
  let candidateState = migrateStateToCurrent(clone(sourceState));
  candidateState = finalizeMigrationEvidence(sourceState, candidateState, compatibility, core, timestamp, sourceVault);
  validateState(candidateState);
  validateStateInvariants(candidateState, { quarantine: false });
  const candidateVault = await encryptState(candidateState, key, sourceVault.kdf);
  return promoteBackupCandidate({
    originalSchema: Number(sourceState.schema),
    compatibility,
    sourceVault,
    candidateVault,
    state: candidateState,
    key,
    promotionType: "LEGACY_MIGRATION"
  });
}

async function promoteBackupCandidate(candidate, dependencies = {}) {
  const core = dependencies.core || resolveYGPHCore();
  const readVaultFn = dependencies.readVaultFn || (() => dbGet(VAULT_KEY));
  const atomicPromoteFn = dependencies.atomicPromoteFn || (input => dbPromoteVault(input.previousVault, input.candidateVault, input.metadata));
  const decryptVaultFn = dependencies.decryptVaultFn || decryptVault;
  const restoreVaultFn = dependencies.restoreVaultFn || (vault => dbPut(VAULT_KEY, vault));
  const readSnapshotFn = dependencies.readSnapshotFn || (!dependencies.atomicPromoteFn ? async () => ({
    rollbackVault: await dbGet(ROLLBACK_VAULT_KEY),
    metadata: await dbGet(ROLLBACK_META_KEY)
  }) : null);
  const clock = dependencies.now || nowIso;
  if (!candidate?.candidateVault || !candidate?.state || !candidate?.key) throw new Error("ยังไม่มี Backup ที่ผ่าน Preview");

  const previousVault = await readVaultFn();
  const metadata = {
    type: candidate.promotionType || "BACKUP_RESTORE",
    status: "SNAPSHOT_CREATED",
    createdAt: clock(),
    sourceSchema: candidate.originalSchema,
    targetSchema: Number(candidate.state.schema),
    sourceExportedAt: candidate.sourceEnvelope?.exportedAt || null,
    candidateHash: core.hash(candidate.candidateVault),
    previousHash: previousVault ? core.hash(previousVault) : null
  };
  let promotionAttempted = false;
  try {
    promotionAttempted = true;
    await atomicPromoteFn({ previousVault, candidateVault: candidate.candidateVault, metadata, key: candidate.key });
    if (typeof readSnapshotFn === "function") {
      const snapshot = await readSnapshotFn();
      if (previousVault != null && core.hash(snapshot?.rollbackVault) !== core.hash(previousVault)) throw new Error("RESTORE READBACK_FAILED: Rollback Snapshot ไม่ตรง");
      if (core.hash(snapshot?.metadata) !== core.hash(metadata)) throw new Error("RESTORE READBACK_FAILED: Snapshot Metadata ไม่ตรง");
    }
    const storedVault = await readVaultFn();
    if (core.hash(storedVault) !== core.hash(candidate.candidateVault)) throw new Error("RESTORE READBACK_FAILED: Vault ที่อ่านกลับไม่ตรงกับไฟล์ที่ยืนยัน");
    const storedState = await decryptVaultFn(storedVault, candidate.key);
    const durableHash = core.assertReadback(candidate.state, storedState);
    return {
      state: storedState,
      vault: storedVault,
      key: candidate.key,
      previousVault,
      metadata,
      readback: { status: "VERIFIED", verifiedAt: clock(), stateRevision: storedState.revision, durableHash }
    };
  } catch (error) {
    if (promotionAttempted && previousVault != null) {
      try {
        await restoreVaultFn(previousVault);
        const restoredVault = await readVaultFn();
        if (core.hash(restoredVault) !== core.hash(previousVault)) throw new Error("Raw Vault หลัง Rollback ไม่ตรงกับ Snapshot");
        error.rollbackVerified = true;
      } catch (rollbackError) {
        const failure = new Error(`${error.message || error}; RESTORE_ROLLBACK_FAILED: ${rollbackError.message || rollbackError}`);
        failure.cause = error;
        failure.rollbackVerified = false;
        throw failure;
      }
    }
    throw error;
  }
}

function resolveYGPHCore() {
  if (globalThis.YGPHCore) return globalThis.YGPHCore;
  if (typeof module === "object" && module.exports && typeof require === "function") return require("./highway-gate.js");
  throw new Error("YGPH Core ไม่พร้อมใช้งาน กรุณาโหลด highway-gate.js ก่อน app.js");
}

async function commitCurrentState(commandContext = {}) {
  if (!cryptoKey || !state || !currentVault) throw new Error("แอปยังล็อกอยู่");
  if (durableCommitInProgress) throw new Error("กำลังบันทึกคำสั่งก่อนหน้า กรุณารอสักครู่");
  durableCommitInProgress = true;
  const proposed = clone(state);
  let durableBefore = null;
  try {
    const core = resolveYGPHCore();
    const previousVault = await dbGet(VAULT_KEY);
    if (!previousVault) throw new Error("ไม่พบ Vault ก่อนบันทึก");
    validateVault(previousVault);
    durableBefore = await decryptVault(previousVault, cryptoKey);
    const result = await commitStateAtomic({
      core,
      beforeState: durableBefore,
      proposedState: proposed,
      previousVault,
      commandContext,
      prepareState: candidate => {
        if (candidate.sync?.flow) delete candidate.sync.flow.lastReadbackRuntime;
        if (typeof globalThis.flowPrepareCommit === "function") globalThis.flowPrepareCommit(candidate);
        repairSafeStateInvariants(candidate);
        validateStateInvariants(candidate, { quarantine: true });
        return candidate;
      },
      encrypt: candidate => encryptState(candidate, cryptoKey, previousVault.kdf),
      writeVault: vault => commandContext.snapshotBeforeWrite
        ? writeVaultWithSnapshot({
          core,
          previousVault,
          candidateVault: vault,
          metadata: {
            type: commandContext.snapshotType || "COMMAND_SNAPSHOT",
            status: "SNAPSHOT_CREATED",
            createdAt: commandContext.timestamp || nowIso(),
            idempotencyKey: commandContext.idempotencyKey || null,
            sourceRevision: Number(durableBefore?.revision || 0),
            targetRevision: Number(durableBefore?.revision || 0) + 1,
            previousHash: core.hash(previousVault),
            candidateHash: core.hash(vault)
          }
        })
        : dbPut(VAULT_KEY, vault),
      readVault: () => dbGet(VAULT_KEY),
      decrypt: vault => decryptVault(vault, cryptoKey),
      restoreVault: vault => dbPut(VAULT_KEY, vault)
    });
    state = result.state;
    currentVault = result.vault;
    lastDurableReadback = result.readback;
    state.sync ||= {};
    state.sync.flow ||= {};
    state.sync.flow.lastReadbackRuntime = result.readback;
    return result;
  } catch (error) {
    try {
      const durableVault = await dbGet(VAULT_KEY);
      if (durableVault && cryptoKey) {
        currentVault = durableVault;
        state = normalizeState(await decryptVault(durableVault, cryptoKey));
      } else if (durableBefore) {
        state = normalizeState(clone(durableBefore));
      }
    } catch (recoveryError) {
      console.error("ROLLBACK_STATE_RECOVERY_FAILED", recoveryError);
    }
    throw error;
  } finally {
    durableCommitInProgress = false;
  }
}

async function saveEncryptedState(commandContext = {}) {
  return commitCurrentState(commandContext);
}

async function persistAndRender(message = "บันทึกแล้ว", commandContext = {}) {
  try {
    const result = await commitCurrentState(commandContext);
    renderAll();
    resetInactivityTimer();
    if (message) toast(`${message} · ตรวจอ่านกลับแล้ว`);
    return result.readback;
  } catch (error) {
    if (state) renderAll();
    throw error;
  }
}

function addTransactionToState(target, { direction, amountSatang, label, source, sourceId, subtype, actionKey, reversalOf = null, reversalReason = null, createdAt = nowIso() }) {
  const amount = parseSatang(Number(amountSatang || 0), { allowZero: true, label: "ยอดธุรกรรม" });
  if (!amount) return null;
  if (!['IN', 'OUT'].includes(direction)) throw new Error("ทิศทางธุรกรรมไม่ถูกต้อง");
  if (actionKey && target.ledger.transactions.some(t => t.actionKey === actionKey)) return null;
  const tx = { id: uid("TX"), direction, amountSatang: amount, label, source, sourceId, subtype, actionKey: actionKey || uid("ACT"), createdAt, reversedBy: null };
  if (reversalOf) tx.reversalOf = reversalOf;
  if (reversalReason) tx.reversalReason = reversalReason;
  target.ledger.transactions.push(tx);
  return tx;
}
function addQueueToState(target, { source, sourceId, actionType, status = "OPEN", amountSatang = 0, due, effects }) {
  const sourceRecord = findSourceInState(target, source, sourceId);
  const createdAt = nowIso();
  const id = uid("Q");
  const item = {
    id, recordId: id, source, sourceId, owner: source, recordType: "CALENDAR_ACTION",
    revision: 1, actionType, status, amountSatang: parseSatang(Number(amountSatang || 0), { allowZero: true, label: "ยอดคิว" }), paidSatang: 0, installmentNumber: null, installmentCount: null, due,
    dueAt: `${due}T09:00:00+07:00`, triggerAt: `${due}T09:00:00+07:00`, validUntil: null,
    effects, createdAt, updatedAt: createdAt, completedAt: null, cancelledAt: null,
    eventId: uid("EV"), actionId: uid("ACT"), idempotencyKey: `YGPH:${id}`,
    expectedRevision: Number(sourceRecord?.revision || 1), sourceRevision: Number(sourceRecord?.revision || 1),
    sequence: target.calendar.length + 1, previousEventId: null, appliedActions: {},
    history: [{ at: createdAt, event: "CREATED", note: `สร้างจาก ${source}` }]
  };
  target.calendar.push(item);
  return item;
}
function addAudit(event, note = "") {
  state.audit.unshift({ id: uid("AUD"), at: nowIso(), event, note });
}
function bumpSource(record) {
  if (!record) return;
  record.revision = Number(record.revision || 0) + 1;
  record.updatedAt = nowIso();
}
function bumpQueue(item) {
  item.revision = Number(item.revision || 0) + 1;
  item.updatedAt = nowIso();
}
function findSourceInState(target, source, id) {
  if (source === "STORE") return target.store.sales.find(x => x.id === id) || target.store.purchases.find(x => x.id === id) || target.store.withdrawals.find(x => x.id === id);
  if (source === "RIDE") return target.ride.jobs.find(x => x.id === id) || target.ride.expenses.find(x => x.id === id) || target.ride.rounds.find(x => x.id === id) || target.ride.creditWithdrawals.find(x => x.id === id);
  if (source === "LEDGER") return target.ledger.obligations.find(x => x.id === id) || target.ledger.transactions.find(x => x.id === id);
  return null;
}

const findSource = (source, id) => findSourceInState(state, source, id);
const findQueue = (id) => state.calendar.find(x => x.id === id);

function queueFor(source, sourceId) { return state.calendar.find(q => q.source === source && q.sourceId === sourceId && !["CANCELLED", "COMPLETED"].includes(q.status)); }
function addQueue(args) { const item = addQueueToState(state, args); addAudit("QUEUE_CREATED", `${args.source}/${args.sourceId} → ${args.actionType}`); return item; }
function addTransaction(args) { const tx = addTransactionToState(state, args); if (tx) addAudit("LEDGER_MOVEMENT", `${tx.direction} ${money(tx.amountSatang)} · ${tx.label}`); return tx; }
function reverseTransactions(source, sourceId, keyBase) {
  const originals = state.ledger.transactions.filter(t => t.source === source && t.sourceId === sourceId && !String(t.subtype).startsWith("REVERSAL_") && !t.reversedBy);
  let netDelta = 0;
  for (const original of originals) {
    const actionKey = `${keyBase}:${original.id}`;
    if (state.ledger.transactions.some(t => t.actionKey === actionKey)) continue;
    const reversal = addTransaction({
      direction: original.direction === "IN" ? "OUT" : "IN",
      amountSatang: original.amountSatang,
      label: `ย้อน ${original.label}`,
      source, sourceId,
      subtype: `REVERSAL_${original.subtype}`,
      actionKey,
      reversalOf: original.id
    });
    if (reversal) {
      original.reversedBy = reversal.id;
      netDelta += original.direction === "IN" ? -original.amountSatang : original.amountSatang;
    }
  }
  return netDelta;
}
function runOnce(item, key, fn) {
  if (item.appliedActions[key]) { toast("รายการนี้ทำไปแล้ว ระบบไม่คำนวณซ้ำ"); return false; }
  item.appliedActions[key] = nowIso();
  fn();
  bumpQueue(item);
  return true;
}
function addHistory(item, event, note = "") {
  item.history.push({ at: nowIso(), event, note });
  addAudit(`${event} · ${item.id}`, `${item.source}/${item.sourceId} ${note}`);
}


function syncQueueRevisionsForSource(source, sourceId) {
  const record = findSource(source, sourceId);
  if (!record) return;
  state.calendar.filter(item => item.source === source && item.sourceId === sourceId && !["COMPLETED", "CANCELLED"].includes(item.status)).forEach(item => {
    item.expectedRevision = Number(record.revision || 1);
    item.sourceRevision = item.expectedRevision;
    bumpQueue(item);
  });
}
function addMonths(dateText, count) {
  const [year, month, day] = dateText.split("-").map(Number);
  const target = new Date(year, month - 1 + count, 1, 12);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(day, lastDay));
  return localISO(target);
}
function takeStockFromPool(target, qty) {
  const quantity = parseQuantity(qty, { label: "จำนวนสินค้า" });
  const availableQty = Number(target.store.stockQty || 0);
  const availableValue = Number(target.store.stockValueSatang || 0);
  if (quantity > availableQty) throw new Error("จำนวนสต็อกไม่พอ");
  const removedValue = quantity === availableQty ? availableValue : Math.round(availableValue * quantity / availableQty);
  target.store.stockQty = availableQty - quantity;
  target.store.stockValueSatang = Math.max(0, availableValue - removedValue);
  if (target.store.stockQty === 0) target.store.stockValueSatang = 0;
  return removedValue;
}
function splitInstallments(totalSatang, count) {
  const total = parseSatang(Number(totalSatang), { allowZero: false, label: "ยอดภาระ" });
  if (!Number.isInteger(count) || count < 1 || count > MAX_INSTALLMENTS) throw new Error(`จำนวนงวดต้องอยู่ระหว่าง 1–${MAX_INSTALLMENTS}`);
  if (total < count) throw new Error("ยอดภาระต้องไม่น้อยกว่าจำนวนงวด เพื่อให้ทุกงวดอย่างน้อย 1 สตางค์");
  const base = Math.floor(total / count);
  const remainder = total - base * count;
  const amounts = Array.from({ length: count }, (_, index) => base + (index === count - 1 ? remainder : 0));
  if (amounts.some(amount => amount < 1) || amounts.reduce((sum, amount) => sum + amount, 0) !== total) throw new Error("แบ่งงวดไม่ผ่านสมการยอดรวม");
  return amounts;
}
function txInRange(start, end) { return state.ledger.transactions.filter(tx => isInRange(tx, start, end)); }
function signedTransactions(records) { return records.reduce((sum, tx) => sum + signedTransaction(tx), 0); }
function currentBalanceAt(end) { return Number(state.ledger.openingBalanceSatang || 0) + signedTransactions(state.ledger.transactions.filter(tx => recordDate(tx) <= end)); }
function activeAt(record, end) { const created = recordDate(record); const cancelled = record.cancelledAt ? dateKey(record.cancelledAt) : null; return created <= end && (!cancelled || cancelled > end); }
function stockAt(end) {
  const purchased = state.store.purchases.filter(item => activeAt(item, end)).reduce((sum, item) => sum + Number(item.qty || 0), 0);
  const sold = state.store.sales.filter(item => activeAt(item, end)).reduce((sum, item) => sum + Number(item.qty || 0), 0);
  const withdrawn = state.store.withdrawals.filter(item => activeAt(item, end)).reduce((sum, item) => sum + Number(item.qty || 0), 0);
  return Math.max(0, purchased - sold - withdrawn);
}
function receivableAt(end) {
  return state.store.sales.filter(sale => activeAt(sale, end)).reduce((sum, sale) => {
    const received = state.ledger.transactions.filter(tx => tx.source === "STORE" && tx.sourceId === sale.id && recordDate(tx) <= end).reduce((n, tx) => n + signedTransaction(tx), 0);
    return sum + Math.max(0, Number(sale.totalSatang || 0) - Math.max(0, received));
  }, 0);
}
function rideCreditAt(end) {
  const earned = state.ride.jobs.filter(job => job.paymentMode === "CREDIT" && activeAt(job, end)).reduce((sum, job) => sum + Number(job.amountSatang || 0), 0);
  const withdrawn = state.ride.creditWithdrawals.filter(item => activeAt(item, end)).reduce((sum, item) => sum + Number(item.amountSatang || 0), 0);
  return Math.max(0, earned - withdrawn);
}
function reverseQueuePayments(item, keyBase) {
  const originals = state.ledger.transactions.filter(tx => tx.actionKey?.startsWith(`${item.id}:payment:`) && !String(tx.subtype).startsWith("REVERSAL_") && !tx.reversedBy);
  let reversedAmount = 0;
  for (const original of originals) {
    const actionKey = `${keyBase}:${original.id}`;
    const reversal = addTransaction({ direction: original.direction === "IN" ? "OUT" : "IN", amountSatang: original.amountSatang, label: `ย้อน ${original.label}`, source: original.source, sourceId: original.sourceId, subtype: `REVERSAL_${original.subtype}`, actionKey, reversalOf: original.id });
    if (reversal) { original.reversedBy = reversal.id; reversedAmount += original.amountSatang; }
  }
  return reversedAmount;
}

function signedTransaction(tx) { return tx.direction === "IN" ? Number(tx.amountSatang || 0) : -Number(tx.amountSatang || 0); }
const isReceivableAdjustment = (tx) => tx?.subtype === "RECEIVABLE_RECLASSIFICATION"
  || tx?.reversalReason === "LEGACY_RECEIVABLE_EVIDENCE_REPAIR"
  || (tx?.subtype === "REVERSAL_SALE_RECEIPT" && tx?.reversalReason === "RECEIVABLE_RECLASSIFICATION");
const isReclassifiedReceipt = (tx) => Boolean(tx?.reclassifiedBy)
  || Boolean(tx?.reversedBy && state.ledger.transactions.some(reversal => reversal.id === tx.reversedBy && isReceivableAdjustment(reversal)));
const isRealCashTransaction = (tx) => !isReceivableAdjustment(tx) && !isReclassifiedReceipt(tx);
function currentBalanceSatang() { return Number(state.ledger.openingBalanceSatang || 0) + state.ledger.transactions.reduce((sum, tx) => sum + signedTransaction(tx), 0); }
function txTotals() { return state.ledger.transactions.reduce((out, tx) => { if (tx.direction === "IN") out.in += tx.amountSatang; else out.out += tx.amountSatang; return out; }, { in: 0, out: 0 }); }
function sourceNet(source) { return state.ledger.transactions.filter(t => t.source === source).reduce((sum, tx) => sum + signedTransaction(tx), 0); }
function sourceIn(source) { return state.ledger.transactions.filter(t => t.source === source && t.direction === "IN").reduce((sum, tx) => sum + Number(tx.amountSatang || 0), 0); }
function sourceOut(source) { return state.ledger.transactions.filter(t => t.source === source && t.direction === "OUT").reduce((sum, tx) => sum + Number(tx.amountSatang || 0), 0); }
function outstandingTotal() { return state.store.sales.filter(s => s.status !== "CANCELLED").reduce((sum, s) => sum + Number(s.outstandingSatang || 0), 0); }
function obligationsRemaining() { return state.ledger.obligations.filter(o => o.status !== "CANCELLED").reduce((sum, o) => sum + Number(o.remainingSatang || 0), 0); }
function activeSales() { return state.store.sales.filter(s => s.status !== "CANCELLED"); }
function activePurchases() { return state.store.purchases.filter(p => p.status !== "CANCELLED"); }
function activeRideJobs() { return state.ride.jobs.filter(j => j.status !== "CANCELLED"); }

function sourceRevision(item) { return Number(findSource(item.source, item.sourceId)?.revision || 0); }
function integrityGate(item) { return sourceRevision(item) === Number(item.expectedRevision || 0) ? { state: "TRUSTED", cls: "trusted" } : { state: "STALE_INPUT", cls: "stale" }; }
function freshnessGate(item) {
  if (item.status === "VERIFY") return { state: "VERIFY", cls: "verify" };
  if (item.requiresRefreshBeforePayment) return { state: "REFRESH_REQUIRED", cls: "verify" };
  if (item.validUntil) {
    const expiresAt = Date.parse(item.validUntil);
    if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) return { state: "EXPIRED", cls: "verify" };
  }
  return { state: "FRESH", cls: "fresh" };
}
function timeGate(item) {
  if (["COMPLETED", "CANCELLED"].includes(item.status)) return { state: "CLOSED", cls: "closed" };
  const trigger = new Date(item.triggerAt || `${item.due}T09:00:00+07:00`);
  if (Date.now() < trigger.getTime()) return { state: "TOO_EARLY", cls: "early" };
  return { state: "READY", cls: "ready" };
}
function withGates(item, action) {
  if (!item) return toast("ไม่พบคิว");
  const integrity = integrityGate(item);
  if (integrity.state !== "TRUSTED") {
    openModal({ title: "ข้อมูลต้นทางเปลี่ยนแล้ว", text: `คิวอ่านรุ่น ${item.expectedRevision} แต่ข้อมูลในเครื่องเป็นรุ่น ${sourceRevision(item)}`, body: '<div class="flow-note"><b>ระบบหยุดไว้ก่อน</b><br>กลับไปที่การ์ดคิว แล้วเลือก “ยืนยันข้อมูลถูกต้อง”, “แก้ไขข้อมูล” หรือ “ยกเลิกรายการ”</div>', confirm: "รับทราบ", onConfirm: closeModal });
    return;
  }
  const freshness = freshnessGate(item);
  if (freshness.state !== "FRESH") {
    const reason = freshness.state === "EXPIRED" ? "ข้อมูลนี้หมดอายุแล้ว" : freshness.state === "REFRESH_REQUIRED" ? "รายการกำหนดให้บิ๊กตรวจเองก่อนทำเงินจริง" : "รายการอยู่ในสถานะต้องตรวจสอบ";
    openModal({ title: "ยังดำเนินการเงินจริงไม่ได้", text: reason, body: '<div class="flow-note"><b>Safety Gate ล็อกไว้ในเครื่อง</b><br>กลับไปที่การ์ดคิว แล้วเลือกยืนยัน แก้ไข หรือยกเลิก ระบบไม่ต้องเชื่อมอินเทอร์เน็ต</div>', confirm: "รับทราบ", onConfirm: closeModal });
    return;
  }
  const time = timeGate(item);
  if (time.state === "CLOSED") return toast("รายการนี้ปิดแล้ว");
  if (time.state === "TOO_EARLY") {
    openModal({ title: "ยังไม่ถึงวันที่กำหนด", text: `กำหนด ${dateTH(item.due)}`, body: '<div class="flow-note">บิ๊กสามารถยืนยันทำก่อนกำหนดได้ ระบบจะเก็บเหตุผลการข้ามเงื่อนไขเวลาไว้</div>', confirm: "ยืนยันทำก่อนกำหนด", onConfirm: async () => { addAudit("AION_OVERRIDE", `${item.id} · TOO_EARLY`); closeModal(); await action(); } });
    return;
  }
  action();
}

function showOnly(screenId) {
  ["securityGate", "setupScreen", "unlockScreen", "appShell"].forEach(id => byId(id)?.classList.add("hidden"));
  byId(screenId)?.classList.remove("hidden");
}
function showSetup() { showOnly("setupScreen"); }
function showUnlock(message = "") {
  showOnly("unlockScreen");
  byId("unlockPassphrase").value = "";
  byId("unlockStatus").textContent = message;
  setTimeout(() => byId("unlockPassphrase").focus(), 80);
}
function trustedDeviceMatchesVault(record, vault) {
  return Boolean(
    record &&
    record.version === TRUSTED_DEVICE_VERSION &&
    record.key &&
    vault?.kdf &&
    record.salt === vault.kdf.salt &&
    Number(record.iterations) === Number(vault.kdf.iterations)
  );
}

async function rememberTrustedDevice(vault, key) {
  if (!db || !vault?.kdf || !key) return false;
  const record = {
    version: TRUSTED_DEVICE_VERSION,
    vaultVersion: Number(vault.version || VAULT_VERSION),
    salt: vault.kdf.salt,
    iterations: Number(vault.kdf.iterations),
    key,
    savedAt: nowIso()
  };
  try {
    await dbPut(TRUSTED_DEVICE_KEY, record);
    trustedDeviceActive = true;
    clearTimeout(inactivityTimer);
    return true;
  } catch (error) {
    trustedDeviceActive = false;
    console.warn("Trusted-device key could not be stored", error);
    return false;
  }
}

async function clearTrustedDevice() {
  trustedDeviceActive = false;
  if (!db) return;
  try {
    await dbDelete(TRUSTED_DEVICE_KEY);
  } catch (error) {
    console.warn("Trusted-device key could not be cleared", error);
  }
}

async function tryTrustedDeviceUnlock(vault) {
  const record = await dbGet(TRUSTED_DEVICE_KEY);
  if (!record) return false;
  if (!trustedDeviceMatchesVault(record, vault)) {
    await clearTrustedDevice();
    return false;
  }
  try {
    await unlockVaultWithKey(vault, record.key);
    trustedDeviceActive = true;
    return true;
  } catch (error) {
    console.warn("Trusted-device auto-unlock failed", error);
    cryptoKey = null;
    currentVault = null;
    state = null;
    await clearTrustedDevice();
    return false;
  }
}

function showApp() {
  showOnly("appShell");
  applyTheme();
  showPage("home");
  renderAll();
  if (currentVault && cryptoKey) {
    void rememberTrustedDevice(currentVault, cryptoKey).finally(resetInactivityTimer);
  } else {
    resetInactivityTimer();
  }
  if (!state.ledger.balanceVerified) setTimeout(() => promptVerifyBalance(true), 250);
}
function lockApp(message = "ล็อกแล้ว") {
  clearTimeout(inactivityTimer);
  cryptoKey = null; currentVault = null; state = null;
  closeModal();
  showUnlock(message);
}
function resetInactivityTimer() {
  clearTimeout(inactivityTimer);
  if (!state || trustedDeviceActive) return;
  const minutes = Math.max(1, Number(state.settings.lockMinutes || 5));
  inactivityTimer = setTimeout(() => lockApp("ล็อกอัตโนมัติ"), minutes * 60 * 1000);
}
function registerActivity() { if (state) resetInactivityTimer(); }

function applyTheme() {
  const theme = THEME_MAP[state?.settings?.themeColor] || THEME_MAP.navy;
  document.documentElement.style.setProperty("--navy", theme[0]);
  document.documentElement.style.setProperty("--navy2", theme[0]);
}
function statusClass(status) { return ["OPEN", "PARTIAL", "COMPLETED", "CANCELLED", "VERIFY", "ACTIVE", "SETTLED", "PENDING", "CREDIT"].includes(status) ? status.toLowerCase() : "open"; }
function statusLabel(status) { return ({ OPEN: "รอดำเนินการ", PARTIAL: "ทำบางส่วนแล้ว", COMPLETED: "เสร็จแล้ว", CANCELLED: "ยกเลิกแล้ว", VERIFY: "ต้องตรวจสอบ", ACTIVE: "ใช้งานอยู่", SETTLED: "เข้าการเงินแล้ว", PENDING: "กำลังดำเนินการ", CREDIT: "เครดิตในแอป" })[status] || status; }
function sourceLabel(source) { return ({ STORE: "ร้านค้า", RIDE: "วิ่งงาน", LEDGER: "การเงิน", CALENDAR: "ปฏิทิน", OTHER_INCOME: "รายรับอื่น", GENERAL: "ทั่วไป" })[source] || source; }
function actionLabel(type) { return ({ RECEIVE_CUSTOMER_PAYMENT: "รับเงินลูกค้า", PURCHASE_RETURN_WINDOW: "ตรวจ/คืนสินค้า", SETTLE_RIDE_JOB: "ยืนยันรายได้งานเดิม", CONFIRM_RIDE_CREDIT_WITHDRAWAL: "ยืนยันเงินเครดิตเข้า", PAY_OBLIGATION: "จ่ายภาระ", PAY_OBLIGATION_INSTALLMENT: "จ่ายงวดภาระ", VERIFY_SOURCE: "ตรวจข้อมูลต้นทาง" })[type] || type; }
function queueDirection(item) { if (["RECEIVE_CUSTOMER_PAYMENT", "SETTLE_RIDE_JOB", "CONFIRM_RIDE_CREDIT_WITHDRAWAL"].includes(item.actionType)) return "IN"; if (["PAY_OBLIGATION", "PAY_OBLIGATION_INSTALLMENT"].includes(item.actionType)) return "OUT"; if (item.actionType === "VERIFY_SOURCE") return "VERIFY"; return "OTHER"; }
function needsLocalVerification(item) { return integrityGate(item).state !== "TRUSTED" || freshnessGate(item).state !== "FRESH"; }
function gateLabel(item) {
  if (integrityGate(item).state !== "TRUSTED") return { text: "รอบิ๊กตรวจในเครื่อง", cls: "check" };
  const freshness = freshnessGate(item).state;
  if (["VERIFY", "REFRESH_REQUIRED", "EXPIRED"].includes(freshness)) return { text: freshness === "EXPIRED" ? "ข้อมูลหมดอายุ · รอตรวจ" : "รอบิ๊กตรวจในเครื่อง", cls: "check" };
  const time = timeGate(item).state;
  if (["READY", "CLOSED"].includes(time)) return { text: "พร้อมดำเนินการ", cls: "ok" };
  if (time === "TOO_EARLY") return { text: "ยังไม่ถึงเวลา", cls: "wait" };
  return { text: "ติดเงื่อนไข", cls: "stop" };
}
function toast(message) {
  const element = byId("toast");
  element.textContent = message;
  element.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => element.classList.remove("show"), 2200);
}
function openModal({ title, text = "", body = "", confirm = "ยืนยัน", onConfirm, hideConfirm = false }) {
  byId("modalTitle").textContent = title;
  byId("modalText").textContent = text;
  byId("modalBody").innerHTML = body;
  byId("modalConfirm").textContent = confirm;
  byId("modalConfirm").classList.toggle("hidden", hideConfirm);
  modalHandler = onConfirm;
  modalBusy = false;
  byId("modal").classList.remove("hidden");
}
function closeModal({ preserveBackupCandidate = false } = {}) {
  byId("modal").classList.add("hidden");
  modalHandler = null;
  modalBusy = false;
  if (!preserveBackupCandidate) pendingBackupCandidate = null;
}

const pages = { home: "homePage", store: "storePage", ride: "ridePage", ledger: "ledgerPage", calendar: "calendarPage", report: "reportPage", sync: "syncPage", settings: "settingsPage" };
function showPage(page) {
  currentPage = page;
  $$(".page").forEach(element => element.classList.remove("active"));
  byId(pages[page])?.classList.add("active");
  $$(".nav-btn").forEach(button => button.classList.toggle("active", button.dataset.page === page));
  window.scrollTo({ top: 0, behavior: "smooth" });
  renderAll();
  YGPHRuntime.run("afterPageChange", { page });
}
function goCalendar(source, id) {
  queueFilter = "ALL";
  selectedDate = null;
  showPage("calendar");
  setTimeout(() => document.querySelector(`[data-queue-source="${source}:${id}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 120);
}

function recordHtml(icon, title, subtitle, amount, status, source, id) {
  const queue = queueFor(source, id);
  const footer = queue ? `<button class="go-calendar" data-go-calendar="${source}:${id}">ไปจัดการในปฏิทิน</button>` : `<span class="subtle">ไม่มีงานค้างตามวัน</span>`;
  return `<div class="record"><div class="record-head"><div class="record-icon">${icon}</div><div><b>${esc(title)}</b><small>${esc(subtitle)}</small></div><div class="record-amount"><strong>${amount}</strong><span class="status ${statusClass(status)}">${statusLabel(status)}</span></div></div><div class="record-foot">${footer}</div></div>`;
}
function renderHome() {
  const today = localISO();
  const salesTotal = activeSales().filter(item => recordDate(item) === today).reduce((sum, sale) => sum + Number(sale.totalSatang || 0), 0);
  const rideTotal = activeRideJobs().filter(item => recordDate(item) === today).reduce((sum, job) => sum + Number(job.amountSatang || 0), 0);
  byId("homeStoreValue").textContent = `${money(salesTotal)} ฿`;
  byId("homeRideValue").textContent = `${money(rideTotal)} ฿`;
  byId("homeLedgerValue").textContent = state.ledger.balanceVerified ? `${money(currentBalanceSatang())} ฿` : "ต้องยืนยัน";
  const active = state.calendar.filter(q => !["COMPLETED", "CANCELLED"].includes(q.status));
  byId("homeWaitIn").textContent = active.filter(q => queueDirection(q) === "IN").length;
  byId("homeWaitOut").textContent = active.filter(q => queueDirection(q) === "OUT").length;
  byId("homeVerify").textContent = active.filter(q => q.status === "VERIFY" || integrityGate(q).state !== "TRUSTED").length;
  byId("homeCancelled").textContent = state.calendar.filter(q => q.status === "CANCELLED").length;
  byId("homeLastExport").textContent = state.sync.lastExportAt ? displayTime(state.sync.lastExportAt) : "—";
  byId("homeLastImport").textContent = state.sync.lastImportAt ? displayTime(state.sync.lastImportAt) : "—";
  byId("homePendingImport").textContent = `${state.sync.pendingImport?.changes?.length || 0} รายการ`;
}

function renderStore() {
  const today = localISO();
  const sales = activeSales();
  const purchases = activePurchases();
  const todaySales = sales.filter(item => recordDate(item) === today);
  const todayPurchases = purchases.filter(item => recordDate(item) === today);
  const todayStoreTx = state.ledger.transactions.filter(tx => tx.source === "STORE" && recordDate(tx) === today);
  byId("storeRevenue").textContent = money(todaySales.reduce((sum, sale) => sum + Number(sale.totalSatang || 0), 0));
  byId("storeNetRevenue").textContent = money(signedTransactions(todayStoreTx));
  byId("storeStock").textContent = `${numberFmt(state.store.stockQty)} ชิ้น`;
  byId("storeOutstanding").textContent = money(outstandingTotal());
  byId("storePurchases").textContent = money(todayPurchases.reduce((sum, item) => sum + Number(item.costSatang || 0), 0));
  byId("saleList").innerHTML = state.store.sales.length ? lastFive(state.store.sales).map(sale => recordHtml("🧾", `${sale.customer} · ${sale.qty} ชิ้น`, `${dateTH(sale.date)} · รับแล้ว ${money(sale.receivedSatang)} · ค้าง ${money(sale.outstandingSatang)}`, `${money(sale.totalSatang)} ฿`, queueFor("STORE", sale.id)?.status || sale.status, "STORE", sale.id)).join("") : '<div class="empty">ยังไม่มีรายการขาย</div>';
  byId("purchaseList").innerHTML = state.store.purchases.length ? lastFive(state.store.purchases).map(item => recordHtml("📦", item.name, `${item.qty} ชิ้น · ${dateTH(item.date)}`, `${money(item.costSatang)} ฿`, queueFor("STORE", item.id)?.status || item.status, "STORE", item.id)).join("") : '<div class="empty">ยังไม่มีรายการรับสินค้า</div>';
  byId("withdrawList").innerHTML = state.store.withdrawals.length ? lastFive(state.store.withdrawals).map(item => `<div class="record"><div class="record-head"><div class="record-icon">📤</div><div><b>${esc(item.reason)}</b><small>${numberFmt(item.qty)} ชิ้น · ${dateTH(item.date)}${item.note ? ` · ${esc(item.note)}` : ""}</small></div><div class="record-amount"><strong>${money(item.costSatang)} ฿</strong></div></div></div>`).join("") : '<div class="empty">ยังไม่มีการเบิกสินค้า</div>';
  [["allSalesBtn", state.store.sales], ["allPurchasesBtn", state.store.purchases], ["allWithdrawalsBtn", state.store.withdrawals]].forEach(([id, list]) => byId(id).classList.toggle("hidden", list.length <= 5));
}

function renderRide() {
  const today = localISO();
  const jobs = activeRideJobs();
  const todayJobs = jobs.filter(item => recordDate(item) === today);
  const todayCash = todayJobs.filter(job => job.paymentMode === "CASH").reduce((sum, job) => sum + Number(job.amountSatang || 0), 0);
  const pending = state.ride.creditWithdrawals.filter(item => item.status === "PENDING").reduce((sum, item) => sum + Number(item.amountSatang || 0), 0);
  byId("rideSourceIncome").textContent = money(todayJobs.reduce((sum, job) => sum + Number(job.amountSatang || 0), 0));
  byId("rideCashToday").textContent = money(todayCash);
  byId("rideCreditBalance").textContent = money(state.ride.creditBalanceSatang);
  byId("ridePendingWithdrawal").textContent = money(pending);
  byId("rideRoundStatus").textContent = state.ride.currentRound ? `กำลังวิ่ง ${state.ride.currentRound.id.slice(-5)}` : "ยังไม่เริ่ม";
  byId("toggleRoundBtn").textContent = state.ride.currentRound ? "■ จบรอบ" : "▶ เริ่มรอบ";
  byId("withdrawRideCreditBtn").disabled = state.ride.creditBalanceSatang <= 0;
  byId("rideList").innerHTML = state.ride.jobs.length ? lastFive(state.ride.jobs).map(job => {
    const mode = job.paymentMode === "CASH" ? "เงินสด" : job.paymentMode === "CREDIT" ? "เครดิต" : "งานเดิมรอยืนยัน";
    return recordHtml("🛵", `${money(job.amountSatang)} บาท · ${numberFmt(job.distanceKm)} กม.`, `${mode} · ${job.note || "งานวิ่ง"}`, `${money(job.amountSatang)} ฿`, queueFor("RIDE", job.id)?.status || job.status, "RIDE", job.id);
  }).join("") : '<div class="empty">ยังไม่มีงานในรอบ</div>';
  byId("rideWithdrawalList").innerHTML = state.ride.creditWithdrawals.length ? lastFive(state.ride.creditWithdrawals).map(item => recordHtml("🏧", "เบิกเครดิตจากแอปงาน", `${dateTH(item.due)} · ${item.status === "PENDING" ? "กำลังเบิก" : statusLabel(item.status)}`, `${money(item.amountSatang)} ฿`, queueFor("RIDE", item.id)?.status || item.status, "RIDE", item.id)).join("") : '<div class="empty">ยังไม่มีการเบิกเครดิต</div>';
  byId("allRideJobsBtn").classList.toggle("hidden", state.ride.jobs.length <= 5);
  byId("allRideWithdrawalsBtn").classList.toggle("hidden", state.ride.creditWithdrawals.length <= 5);
}

function renderLedger() {
  const today = localISO();
  const todayTx = state.ledger.transactions.filter(tx => recordDate(tx) === today);
  const cashTx = todayTx.filter(isRealCashTransaction);
  const incoming = cashTx.filter(tx => tx.direction === "IN").reduce((sum, tx) => sum + Number(tx.amountSatang || 0), 0);
  const outgoing = cashTx.filter(tx => tx.direction === "OUT").reduce((sum, tx) => sum + Number(tx.amountSatang || 0), 0);
  const adjustment = todayTx.filter(isReceivableAdjustment).reduce((sum, tx) => sum + signedTransaction(tx), 0);
  byId("ledgerBalance").textContent = money(currentBalanceSatang());
  byId("balanceVerifyBadge").textContent = state.ledger.balanceVerified ? "✓ ยืนยันแล้ว" : "⚠ ต้องยืนยันยอด";
  byId("balanceVerifyBadge").className = state.ledger.balanceVerified ? "balance-verified" : "balance-unverified";
  byId("ledgerIn").textContent = money(incoming);
  byId("ledgerOut").textContent = money(outgoing);
  byId("ledgerAdjustment").textContent = `${adjustment > 0 ? "+" : ""}${money(adjustment)}`;
  byId("ledgerReceivable").textContent = money(outstandingTotal());
  byId("ledgerTxCount").textContent = `${todayTx.length} รายการ`;
  byId("ledgerPendingCount").textContent = `${state.calendar.filter(q => queueDirection(q) === "OUT" && !["COMPLETED", "CANCELLED"].includes(q.status)).length} รายการ`;
  byId("debtList").innerHTML = state.ledger.obligations.length ? lastFive(state.ledger.obligations).map(item => {
    const paidInstallments = (item.installments || []).filter(x => x.status === "COMPLETED").length;
    return recordHtml("🧷", item.name, `${item.installmentCount} งวด · จ่ายแล้ว ${paidInstallments}/${item.installmentCount} · เหลือ ${money(item.remainingSatang)}`, `${money(item.originalSatang)} ฿`, queueFor("LEDGER", item.id)?.status || item.status, "LEDGER", item.id);
  }).join("") : '<div class="empty">ยังไม่มีภาระ</div>';
  byId("txList").innerHTML = state.ledger.transactions.length ? lastFive(state.ledger.transactions).map(tx => `<div class="tx"><div><b>${esc(tx.label)}</b><small>${sourceLabel(tx.source)} · ${displayTime(tx.createdAt)}${tx.reversedBy ? " · ถูกย้อนแล้ว" : ""}</small></div><strong class="${tx.direction === "IN" ? "green" : "red"}">${tx.direction === "IN" ? "+" : "−"}${money(tx.amountSatang)} ฿</strong></div>`).join("") : '<div class="empty">ยังไม่มีเงินเข้าออก</div>';
  byId("allDebtsBtn").classList.toggle("hidden", state.ledger.obligations.length <= 5);
  byId("allTransactionsBtn").classList.toggle("hidden", state.ledger.transactions.length <= 5);
}

function renderMonth() {
  const [year, month] = calendarMonth.split("-").map(Number);
  const first = new Date(year, month - 1, 1);
  const last = new Date(year, month, 0);
  byId("monthLabel").textContent = first.toLocaleDateString("th-TH", { month: "long", year: "numeric" });
  const weekdays = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];
  let html = weekdays.map(day => `<div class="weekday">${day}</div>`).join("");
  const startOffset = first.getDay();
  const previousLast = new Date(year, month - 1, 0).getDate();
  for (let index = 0; index < 42; index++) {
    let day, cellMonth = month, cellYear = year, other = false;
    if (index < startOffset) { day = previousLast - startOffset + index + 1; cellMonth = month - 1; other = true; }
    else if (index >= startOffset + last.getDate()) { day = index - startOffset - last.getDate() + 1; cellMonth = month + 1; other = true; }
    else day = index - startOffset + 1;
    if (cellMonth === 0) { cellMonth = 12; cellYear--; }
    if (cellMonth === 13) { cellMonth = 1; cellYear++; }
    const date = `${cellYear}-${String(cellMonth).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const items = state.calendar.filter(q => q.due === date);
    const dots = items.slice(0, 5).map(q => `<span class="cal-dot ${queueDirection(q).toLowerCase()}"></span>`).join("");
    html += `<button class="day-cell ${other ? "other" : ""} ${date === localISO() ? "today" : ""} ${date === selectedDate ? "selected" : ""}" data-date="${date}"><span class="day-num">${day}</span>${items.length ? `<span class="day-count">${items.length}</span>` : ""}<span class="day-dots">${dots}</span></button>`;
  }
  byId("monthGrid").innerHTML = html;
  $$(".day-cell").forEach(button => button.onclick = () => { selectedDate = button.dataset.date; renderCalendar(); });
}
function queueActionButtons(item) {
  if (["COMPLETED", "CANCELLED"].includes(item.status)) return `<button class="edit" data-history="${item.id}">ดูประวัติ</button>`;
  const buttons = [];
  if (needsLocalVerification(item)) {
    buttons.push(`<button class="settle" data-refresh="${item.id}">ยืนยันข้อมูลถูกต้อง</button>`);
    buttons.push(`<button class="edit" data-verify-edit="${item.id}">แก้ไขข้อมูล</button>`);
    buttons.push(`<button class="cancel" data-cancel="${item.id}">ยกเลิกรายการ</button>`);
    buttons.push(`<button class="edit" data-history="${item.id}">ประวัติ</button>`);
    return buttons.join("");
  }
  if (["RECEIVE_CUSTOMER_PAYMENT", "PAY_OBLIGATION", "PAY_OBLIGATION_INSTALLMENT"].includes(item.actionType)) {
    const incoming = item.actionType === "RECEIVE_CUSTOMER_PAYMENT";
    buttons.push(`<button class="${incoming ? "receive" : "pay"}" data-partial="${item.id}">${incoming ? "รับบางส่วน" : "จ่ายบางส่วน"}</button>`);
    buttons.push(`<button class="${incoming ? "receive" : "pay"}" data-full="${item.id}">${incoming ? "รับครบ" : "จ่ายครบ"}</button>`);
  } else {
    const label = item.actionType === "PURCHASE_RETURN_WINDOW" ? "เก็บสินค้าไว้" : item.actionType === "VERIFY_SOURCE" ? "ตรวจแล้ว" : item.actionType === "CONFIRM_RIDE_CREDIT_WITHDRAWAL" ? "ยืนยันเงินเข้า" : "ยืนยันรายได้";
    buttons.push(`<button class="settle" data-complete="${item.id}">${label}</button>`);
  }
  buttons.push(`<button class="edit" data-move="${item.id}">เลื่อน</button>`);
  buttons.push(`<button class="cancel" data-cancel="${item.id}">ยกเลิก</button>`);
  buttons.push(`<button class="edit" data-history="${item.id}">ประวัติ</button>`);
  return buttons.join("");
}

function renderCalendar() {
  renderMonth();
  const active = state.calendar.filter(q => !["COMPLETED", "CANCELLED"].includes(q.status));
  byId("calWaitIn").textContent = active.filter(q => queueDirection(q) === "IN").length;
  byId("calWaitOut").textContent = active.filter(q => queueDirection(q) === "OUT").length;
  byId("calVerify").textContent = active.filter(q => q.status === "VERIFY" || integrityGate(q).state !== "TRUSTED").length;
  byId("selectedDayTitle").textContent = selectedDate ? `รายการวันที่ ${dateTH(selectedDate)}` : "รายการทุกวัน";
  byId("selectedDayMeta").textContent = selectedDate ? "กด “ดูทุกวัน” เพื่อยกเลิกตัวกรอง" : "กดวันที่เพื่อดูเฉพาะวัน";
  let items = [...state.calendar].sort((a, b) => String(a.due).localeCompare(String(b.due)) || Number(a.sequence) - Number(b.sequence));
  if (selectedDate) items = items.filter(item => item.due === selectedDate);
  if (queueFilter !== "ALL") items = items.filter(item => queueFilter === "CANCELLED" ? item.status === "CANCELLED" : queueFilter === "VERIFY" ? item.status === "VERIFY" || integrityGate(item).state !== "TRUSTED" : queueDirection(item) === queueFilter && item.status !== "CANCELLED");
  byId("queueList").innerHTML = items.length ? items.map(item => {
    const source = findSource(item.source, item.sourceId);
    const gate = gateLabel(item);
    const installment = item.installmentNumber ? ` · งวด ${item.installmentNumber}/${item.installmentCount}` : "";
    const remaining = Math.max(0, Number(item.amountSatang || 0) - Number(item.paidSatang || 0));
    return `<div class="queue-item" data-queue-source="${item.source}:${item.sourceId}"><div class="queue-top"><div class="source-badge">${item.source === "STORE" ? "🏪" : item.source === "RIDE" ? "🛵" : "📒"}</div><div class="queue-title"><b>${actionLabel(item.actionType)}${installment}</b><small>${sourceLabel(item.source)} · ${esc(source?.name || source?.customer || source?.note || item.sourceId)}</small><span class="user-status ${gate.cls}">${gate.text}</span></div><div class="queue-money"><b>${money(remaining)} ฿</b><span class="status ${statusClass(item.status)}">${statusLabel(item.status)}</span></div></div><div class="meta-grid"><div class="meta"><small>กำหนด</small><b>${dateTH(item.due)}</b></div><div class="meta"><small>ต้นทาง</small><b>${item.source} · รุ่น ${item.expectedRevision}</b></div></div><div class="queue-actions">${queueActionButtons(item)}</div></div>`;
  }).join("") : '<div class="empty">ไม่มีรายการตามตัวกรองนี้</div>';
  bindQueueActions();
}

function renderReport() {
  if (!byId("reportStart").value) byId("reportStart").value = localISO();
  if (!byId("reportEnd").value) byId("reportEnd").value = localISO();
  if (!reportSelection || !lastReportData) {
    byId("reportResult").classList.add("hidden");
    return;
  }
  const data = lastReportData;
  byId("reportResult").classList.remove("hidden");
  byId("reportRangeLabel").textContent = `${dateTH(data.start)} ถึง ${dateTH(data.end)}`;
  byId("reportBalance").textContent = money(data.snapshot.balanceSatang);
  byId("reportStoreSales").textContent = money(data.store.salesSatang);
  byId("reportRideGross").textContent = money(data.ride.grossSatang);
  byId("reportIn").textContent = money(data.ledger.inSatang);
  byId("reportOut").textContent = money(data.ledger.outSatang);
  byId("storeReport").innerHTML = `<div class="stat-line"><span>ยอดขายสินค้า</span><b>${money(data.store.salesSatang)} บาท</b></div><div class="stat-line"><span>รับเงินจริงตอนขาย</span><b>${money(data.store.cashAtSaleSatang)} บาท</b></div><div class="stat-line"><span>ลูกค้าจ่ายยอดค้างในช่วง</span><b>${money(data.store.receivableCollectedSatang)} บาท</b></div><div class="stat-line"><span>เงินรับจริงสุทธิจากร้านค้า</span><b>${money(data.store.cashInSatang)} บาท</b></div><div class="stat-line"><span>ซื้อสินค้าเข้า</span><b>${money(data.store.purchaseSatang)} บาท</b></div><div class="stat-line"><span>เบิกสินค้า</span><b>${data.store.withdrawQty} ชิ้น · ${money(data.store.withdrawCostSatang)} บาท</b></div><div class="stat-line"><span>สต็อก ณ วันสิ้นสุด</span><b>${data.snapshot.stockQty} ชิ้น</b></div><div class="stat-line"><span>ลูกค้าค้าง ณ วันสิ้นสุด</span><b>${money(data.snapshot.receivableSatang)} บาท</b></div>`;
  byId("rideReport").innerHTML = `<div class="stat-line"><span>รายได้งานทั้งหมด</span><b>${money(data.ride.grossSatang)} บาท</b></div><div class="stat-line"><span>เงินสดจากงาน</span><b>${money(data.ride.cashSatang)} บาท</b></div><div class="stat-line"><span>เครดิตที่หาได้</span><b>${money(data.ride.creditEarnedSatang)} บาท</b></div><div class="stat-line"><span>ค่าใช้จ่ายวิ่งงาน</span><b>${money(data.ride.expenseSatang)} บาท</b></div><div class="stat-line"><span>จำนวนงาน / ระยะทาง</span><b>${data.ride.jobs} งาน · ${numberFmt(data.ride.distanceKm)} กม.</b></div><div class="stat-line"><span>เครดิตคงเหลือ ณ วันสิ้นสุด</span><b>${money(data.snapshot.rideCreditSatang)} บาท</b></div>`;
  byId("ledgerReport").innerHTML = `<div class="stat-line"><span>เงินจริงเข้า</span><b>${money(data.ledger.inSatang)} บาท</b></div><div class="stat-line"><span>รายรับช่องทางอื่น</span><b>${money(data.ledger.otherIncomeSatang)} บาท</b></div><div class="stat-line"><span>เงินจริงออก</span><b>${money(data.ledger.outSatang)} บาท</b></div><div class="stat-line"><span>แก้รายการรับเงินผิดเป็นลูกหนี้</span><b>${money(data.ledger.receivableCorrectionSatang)} บาท</b></div><div class="stat-line"><span>สุทธิเงินจริงในช่วง</span><b>${money(data.ledger.netSatang)} บาท</b></div><div class="stat-line"><span>เงินคงเหลือ ณ วันสิ้นสุด</span><b>${money(data.snapshot.balanceSatang)} บาท</b></div>`;
  byId("queueReport").innerHTML = `<div class="stat-line"><span>สร้างคิวในช่วง</span><b>${data.calendar.created} รายการ</b></div><div class="stat-line"><span>เสร็จในช่วง</span><b>${data.calendar.completed} รายการ</b></div><div class="stat-line"><span>ยกเลิกในช่วง</span><b>${data.calendar.cancelled} รายการ</b></div><div class="stat-line"><span>คงค้าง ณ วันสิ้นสุด</span><b>${data.snapshot.pendingQueues} รายการ</b></div>`;
  byId("auditList").innerHTML = data.audit.length ? data.audit.slice(0, 5).map(item => `<div class="audit"><b>${esc(item.event)}</b><small>${displayTime(item.at)} · ${esc(item.note)}</small></div>`).join("") : '<div class="empty">ไม่มีประวัติในช่วงนี้</div>';
  byId("allAuditBtn").classList.toggle("hidden", data.audit.length <= 5);
  YGPHRuntime.run("afterReport", { selection: reportSelection, report: data });
}


function buildReportData(start, end) {
  const sales = state.store.sales.filter(item => isInRange(item, start, end) && item.status !== "CANCELLED");
  const purchases = state.store.purchases.filter(item => isInRange(item, start, end) && item.status !== "CANCELLED");
  const withdrawals = state.store.withdrawals.filter(item => isInRange(item, start, end));
  const jobs = state.ride.jobs.filter(item => isInRange(item, start, end) && item.status !== "CANCELLED");
  const rideExpenses = state.ride.expenses.filter(item => isInRange(item, start, end));
  const transactions = txInRange(start, end);
  const adjustments = transactions.filter(isReceivableAdjustment);
  const reclassifiedReceipts = transactions.filter(isReclassifiedReceipt);
  const cashTransactions = transactions.filter(isRealCashTransaction);
  const adjustmentSatang = adjustments.reduce((sum, tx) => sum + signedTransaction(tx), 0);
  const receivableCorrectionSatang = reclassifiedReceipts.reduce((sum, tx) => sum + Number(tx.amountSatang || 0), 0);
  const storeCash = cashTransactions.filter(tx => tx.source === "STORE" && ["SALE_INITIAL_RECEIPT", "SALE_RECEIPT"].includes(tx.subtype) && tx.direction === "IN").reduce((sum, tx) => sum + Number(tx.amountSatang || 0), 0);
  const cashAtSaleSatang = cashTransactions.filter(tx => tx.source === "STORE" && (tx.subtype === "SALE_INITIAL_RECEIPT" || (tx.subtype === "SALE_RECEIPT" && String(tx.label || "").startsWith("รับเงินจริงจากบิล")))).reduce((sum, tx) => sum + Number(tx.amountSatang || 0), 0);
  const receivableCollectedSatang = cashTransactions.filter(tx => tx.source === "STORE" && tx.subtype === "SALE_RECEIPT" && String(tx.label || "").startsWith("รับชำระ")).reduce((sum, tx) => sum + Number(tx.amountSatang || 0), 0);
  const otherIncomeSatang = cashTransactions.filter(tx => tx.source === "OTHER_INCOME" && tx.direction === "IN").reduce((sum, tx) => sum + tx.amountSatang, 0);
  const inSatang = cashTransactions.filter(tx => tx.direction === "IN").reduce((sum, tx) => sum + tx.amountSatang, 0);
  const outSatang = cashTransactions.filter(tx => tx.direction === "OUT").reduce((sum, tx) => sum + tx.amountSatang, 0);
  const audit = state.audit.filter(item => { const d = dateKey(item.at); return d >= start && d <= end; });
  const pendingAtEnd = state.calendar.filter(item => recordDate(item) <= end && (!item.completedAt || dateKey(item.completedAt) > end) && (!item.cancelledAt || dateKey(item.cancelledAt) > end)).length;
  return {
    format: "YGPH_REPORT",
    version: 1,
    generatedAt: nowIso(), start, end,
    store: {
      salesSatang: sales.reduce((sum, item) => sum + Number(item.totalSatang || 0), 0),
      cashAtSaleSatang,
      receivableCollectedSatang,
      cashInSatang: storeCash,
      purchaseSatang: purchases.reduce((sum, item) => sum + Number(item.costSatang || 0), 0),
      withdrawQty: withdrawals.reduce((sum, item) => sum + Number(item.qty || 0), 0),
      withdrawCostSatang: withdrawals.reduce((sum, item) => sum + Number(item.costSatang || 0), 0)
    },
    ride: {
      grossSatang: jobs.reduce((sum, item) => sum + Number(item.amountSatang || 0), 0),
      cashSatang: jobs.filter(item => item.paymentMode === "CASH").reduce((sum, job) => sum + Number(job.amountSatang || 0), 0),
      creditEarnedSatang: jobs.filter(item => item.paymentMode === "CREDIT").reduce((sum, job) => sum + Number(job.amountSatang || 0), 0),
      expenseSatang: rideExpenses.reduce((sum, item) => sum + Number(item.amountSatang || 0), 0),
      jobs: jobs.length,
      distanceKm: jobs.reduce((sum, item) => sum + Number(item.distanceKm || 0), 0)
    },
    ledger: { inSatang, outSatang, otherIncomeSatang, adjustmentSatang, receivableCorrectionSatang, netSatang: inSatang - outSatang, transactions: cashTransactions.length },
    calendar: {
      created: state.calendar.filter(item => isInRange(item, start, end)).length,
      completed: state.calendar.filter(item => item.completedAt && dateKey(item.completedAt) >= start && dateKey(item.completedAt) <= end).length,
      cancelled: state.calendar.filter(item => item.cancelledAt && dateKey(item.cancelledAt) >= start && dateKey(item.cancelledAt) <= end).length
    },
    snapshot: { balanceSatang: currentBalanceAt(end), stockQty: stockAt(end), receivableSatang: receivableAt(end), rideCreditSatang: rideCreditAt(end), pendingQueues: pendingAtEnd },
    audit
  };
}
function buildReportFromControls() {
  const start = byId("reportStart").value, end = byId("reportEnd").value;
  if (!start || !end || start > end) return toast("ตรวจช่วงวันที่อีกครั้ง");
  reportSelection = { start, end };
  lastReportData = buildReportData(start, end);
  renderReport();
  toast("ดึงรายงานทั้งระบบแล้ว");
}
function downloadReport() {
  if (!lastReportData) return toast("ดึงรายงานก่อน");
  downloadJson(lastReportData, `YGPH_REPORT_${lastReportData.start}_${lastReportData.end}.json`);
}

function exchangeRecord({ recordId, source, type, title, detail = "", amountSatang = null, quantity = null, installmentCount = null, installmentNumber = null, dueDate = null, status = null, createdAt = null, updatedAt = null }) {
  return { recordId, source, type, title, detail, amountSatang, quantity, installmentCount, installmentNumber, dueDate, status, createdAt, updatedAt, reviewStatus: "MATCHED", proposedAction: "NONE", proposedValue: null, reason: "" };
}

function buildExchange() {
  const records = [];
  state.store.sales.forEach(item => records.push(exchangeRecord({ recordId: item.id, source: "STORE", type: "SALE", title: item.customer, detail: item.note || "", amountSatang: item.totalSatang, quantity: item.qty, dueDate: queueFor("STORE", item.id)?.due || null, status: item.status, createdAt: item.createdAt, updatedAt: item.updatedAt })));
  state.store.purchases.forEach(item => records.push(exchangeRecord({ recordId: item.id, source: "STORE", type: "PURCHASE", title: item.name, detail: "รับสินค้าเข้า", amountSatang: item.costSatang, quantity: item.qty, dueDate: queueFor("STORE", item.id)?.due || null, status: item.status, createdAt: item.createdAt, updatedAt: item.updatedAt })));
  state.store.withdrawals.forEach(item => records.push(exchangeRecord({ recordId: item.id, source: "STORE", type: "STOCK_WITHDRAWAL", title: item.reason, detail: item.note || "", amountSatang: item.costSatang, quantity: item.qty, status: "COMPLETED", createdAt: item.createdAt, updatedAt: item.updatedAt })));
  state.ride.jobs.forEach(item => records.push(exchangeRecord({ recordId: item.id, source: "RIDE", type: "RIDE_JOB", title: item.note || "งานวิ่ง", detail: item.paymentMode || "LEGACY_PENDING", amountSatang: item.amountSatang, quantity: item.distanceKm, status: item.status, createdAt: item.createdAt, updatedAt: item.updatedAt })));
  state.ride.expenses.forEach(item => records.push(exchangeRecord({ recordId: item.id, source: "RIDE", type: "RIDE_EXPENSE", title: item.name, detail: item.type || "", amountSatang: item.amountSatang, status: "COMPLETED", createdAt: item.createdAt, updatedAt: item.updatedAt })));
  state.ride.creditWithdrawals.forEach(item => records.push(exchangeRecord({ recordId: item.id, source: "RIDE", type: "CREDIT_WITHDRAWAL", title: "เบิกเครดิตจากแอปงาน", detail: item.note || "", amountSatang: item.amountSatang, dueDate: item.due, status: item.status, createdAt: item.createdAt, updatedAt: item.updatedAt })));
  records.push(exchangeRecord({ recordId: "RIDE-CREDIT-BALANCE", source: "RIDE", type: "CREDIT_BALANCE", title: "เครดิตคงเหลือในแอปงาน", amountSatang: state.ride.creditBalanceSatang, status: "ACTIVE", createdAt: state.createdAt, updatedAt: state.updatedAt }));
  state.ledger.transactions.forEach(item => records.push(exchangeRecord({ recordId: item.id, source: "LEDGER", type: "TRANSACTION", title: item.label, detail: `${item.direction}:${item.subtype || ""}`, amountSatang: item.amountSatang, status: item.reversedBy ? "REVERSED" : "COMPLETED", createdAt: item.createdAt, updatedAt: item.createdAt })));
  state.ledger.obligations.forEach(item => records.push(exchangeRecord({ recordId: item.id, source: "LEDGER", type: "OBLIGATION", title: item.name, detail: item.detail || "", amountSatang: item.originalSatang, installmentCount: item.installmentCount, dueDate: item.firstDue, status: item.status, createdAt: item.createdAt, updatedAt: item.updatedAt })));
  records.push(exchangeRecord({ recordId: "LEDGER-CURRENT", source: "LEDGER", type: "CURRENT_BALANCE", title: "เงินปัจจุบัน", amountSatang: currentBalanceSatang(), status: state.ledger.balanceVerified ? "VERIFIED" : "UNVERIFIED", createdAt: state.createdAt, updatedAt: state.updatedAt }));
  state.calendar.forEach(item => records.push(exchangeRecord({ recordId: item.id, source: "CALENDAR", type: item.actionType, title: actionLabel(item.actionType), detail: `${item.source}/${item.sourceId}`, amountSatang: Math.max(0, item.amountSatang - item.paidSatang), installmentCount: item.installmentCount, installmentNumber: item.installmentNumber, dueDate: item.due, status: item.status, createdAt: item.createdAt, updatedAt: item.updatedAt })));
  return { format: "YGPH_EXCHANGE", version: 1, batchId: `BATCH-${Date.now()}`, generatedAt: nowIso(), revision: state.revision, records };
}

function renderSync() {
  const pending = state.sync.pendingImport;
  const pendingCount = pending?.changes?.length || 0;
  const lastExport = state.sync.lastExportAt ? displayTime(state.sync.lastExportAt) : "—";
  const lastImport = state.sync.lastImportAt ? displayTime(state.sync.lastImportAt) : "—";
  byId("syncLastExport").textContent = lastExport;
  byId("syncLastImport").textContent = lastImport;
  byId("syncPendingCount").textContent = `${pendingCount} รายการ`;
  byId("syncRevision").textContent = state.revision;
}

async function downloadExport() {
  const exported = buildExchange();
  state.sync.lastExportAt = nowIso();
  state.sync.lastBatchId = exported.batchId;
  await saveEncryptedState();
  downloadJson(exported, `YGPH_EXCHANGE_${localISO()}.json`);
  renderAll();
  toast("สร้างไฟล์ส่งให้โกแล้ว");
}

function downloadJson(value, filename) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = filename; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function isSafeExchangeField(record, field, value) {
  if (record.source === "CALENDAR") {
    if (["COMPLETED", "CANCELLED"].includes(record.status)) return false;
    if (field === "dueDate") return validImportDate(value);
    if (field === "status") return ["OPEN", "VERIFY"].includes(record.status) && ["OPEN", "VERIFY"].includes(value);
    return false;
  }
  if (["SALE", "PURCHASE", "STOCK_WITHDRAWAL", "RIDE_JOB", "CREDIT_WITHDRAWAL", "OBLIGATION"].includes(record.type)) return ["title", "detail"].includes(field);
  return false;
}
function findExchangeTarget(recordId) {
  const queue = findQueue(recordId);
  if (queue) return { kind: "CALENDAR", target: queue };
  for (const source of ["STORE", "RIDE", "LEDGER"]) { const record = findSource(source, recordId); if (record) return { kind: source, target: record }; }
  return null;
}
function applyExchangeChange(change) {
  const found = findExchangeTarget(change.recordId);
  if (!found) throw new Error(`ไม่พบ ${change.recordId}`);
  const target = found.target;
  if (found.kind === "CALENDAR") {
    if (["COMPLETED", "CANCELLED"].includes(target.status)) throw new Error("Import แก้คิวที่ปิดแล้วไม่ได้ ต้องสร้าง Record ใหม่");
    if (change.field === "dueDate") {
      if (!validImportDate(change.newValue)) throw new Error("วันที่นำเข้าไม่ถูกต้อง");
      target.due = change.newValue; target.dueAt = `${change.newValue}T09:00:00+07:00`; target.triggerAt = target.dueAt;
    }
    if (change.field === "status") {
      if (!["OPEN", "VERIFY"].includes(target.status) || !["OPEN", "VERIFY"].includes(change.newValue)) throw new Error("State Transition ของคิวไม่อนุญาต");
      target.status = change.newValue;
      if (change.newValue === "VERIFY") target.requiresRefreshBeforePayment = true;
    }
    addHistory(target, "IMPORT_CHANGE_APPLIED", `${change.field}: ${change.oldValue} → ${change.newValue}`);
    bumpQueue(target);
    return;
  }
  if (change.field === "detail") {
    if ("detail" in target) target.detail = change.newValue;
    else target.note = change.newValue;
  }
  if (change.field === "title") {
    if ("name" in target) target.name = change.newValue;
    else if ("customer" in target) target.customer = change.newValue;
    else target.note = change.newValue;
  }
  bumpSource(target);
  syncQueueRevisionsForSource(found.kind, target.id);
  addAudit("IMPORT_CHANGE_APPLIED", `${found.kind}/${target.id} ${change.field}`);
}


function cleanImportText(value, maximum = 180) {
  return String(value ?? "").trim().slice(0, maximum);
}
function validImportId(value) {
  return /^[A-Za-z0-9._:-]{3,160}$/.test(String(value || ""));
}
function validImportDate(value) {
  return validISODate(value);
}
function isNewRecordProposal(record) {
  return record?.reviewStatus === "NEW" && record?.proposedAction === "NEW_RECORD";
}
function calendarParentId(record) {
  if (record?.source !== "CALENDAR") return null;
  const proposed = record.proposedValue && typeof record.proposedValue === "object" ? record.proposedValue : {};
  if (proposed.source === "LEDGER" && proposed.sourceId) return String(proposed.sourceId);
  const detailMatch = /^LEDGER\/(.+)$/.exec(String(record.detail || ""));
  return detailMatch ? detailMatch[1] : null;
}
function sanitizeImportedQueue(record, parentId) {
  const proposed = record.proposedValue && typeof record.proposedValue === "object" ? record.proposedValue : {};
  const due = String(record.dueDate || "");
  const actionType = ["PAY_OBLIGATION", "PAY_OBLIGATION_INSTALLMENT"].includes(record.type) ? record.type : "PAY_OBLIGATION";
  return {
    id: String(record.recordId), actionType,
    status: ["OPEN", "VERIFY"].includes(record.status) ? record.status : (proposed.requiresRefreshBeforePayment ? "VERIFY" : "OPEN"),
    amountSatang: parseSatang(Number(record.amountSatang || 0), { allowZero: false, label: "ยอดคิว" }), due,
    dueAt: cleanImportText(proposed.dueAt || `${due}T09:00:00+07:00`, 80),
    triggerAt: cleanImportText(proposed.triggerAt || proposed.dueAt || `${due}T09:00:00+07:00`, 80),
    validUntil: proposed.validUntil ? cleanImportText(proposed.validUntil, 80) : null,
    sourceProvider: cleanImportText(proposed.sourceProvider, 80) || null,
    providerEventId: cleanImportText(proposed.providerEventId, 220) || null,
    providerEventTitle: cleanImportText(proposed.providerEventTitle, 260) || null,
    idempotencyKey: cleanImportText(proposed.idempotencyKey, 220) || `YGPH:IMPORT:CALENDAR:${record.recordId}`,
    requiresRefreshBeforePayment: Boolean(proposed.requiresRefreshBeforePayment),
    effects: {
      complete: cleanImportText(proposed.effects?.complete, 220) || "หักเงินจริงและลดยอดภาระตามยอดที่ผู้ใช้ยืนยัน",
      cancel: cleanImportText(proposed.effects?.cancel, 260) || "ยกเลิกคิวและย้อนเฉพาะธุรกรรมจากคิวนี้"
    },
    installmentNumber: record.installmentNumber == null ? null : Number(record.installmentNumber),
    installmentCount: record.installmentCount == null ? null : Number(record.installmentCount),
    createdAt: cleanImportText(record.createdAt || nowIso(), 80), updatedAt: cleanImportText(record.updatedAt || record.createdAt || nowIso(), 80),
    parentId
  };
}
function validateNewQueueRecord(record, parentId) {
  if (!validImportId(record.recordId)) return "รหัสคิวไม่ถูกต้อง";
  if (record.source !== "CALENDAR" || !["PAY_OBLIGATION", "PAY_OBLIGATION_INSTALLMENT"].includes(record.type)) return "รองรับเฉพาะคิวจ่ายภาระ";
  if (calendarParentId(record) !== parentId) return "คิวไม่ได้ชี้กลับมายังภาระต้นทาง";
  try { parseSatang(Number(record.amountSatang), { allowZero: false, label: "ยอดคิว" }); } catch (error) { return error.message; }
  if (!validImportDate(record.dueDate)) return "วันที่คิวไม่ถูกต้อง";
  if (!["OPEN", "VERIFY"].includes(record.status)) return "สถานะคิวใหม่ต้องเป็น OPEN หรือ VERIFY";
  return null;
}
function validateNewObligationRecord(record) {
  if (!validImportId(record.recordId)) return "รหัสภาระไม่ถูกต้อง";
  if (record.source !== "LEDGER" || record.type !== "OBLIGATION") return "รองรับเฉพาะภาระใน LEDGER";
  if (!cleanImportText(record.title, 120)) return "ภาระต้องมีชื่อ";
  try { parseSatang(Number(record.amountSatang), { allowZero: false, label: "ยอดภาระ" }); } catch (error) { return error.message; }
  if (!validImportDate(record.dueDate)) return "วันครบกำหนดไม่ถูกต้อง";
  if (!["OPEN", "VERIFY"].includes(record.status)) return "สถานะภาระใหม่ต้องเป็น OPEN หรือ VERIFY";
  const count = Number(record.installmentCount ?? 1);
  if (!Number.isInteger(count) || count < 1 || count > MAX_INSTALLMENTS) return "จำนวนงวดไม่ถูกต้อง";
  if (Number(record.amountSatang) < count) return "ยอดภาระต้องไม่น้อยกว่าจำนวนงวด";
  return null;
}
function sameNewRecordIdentity(original, incoming) {
  return original?.source === incoming?.source && original?.type === incoming?.type;
}
function makeSyntheticQueueRecords(obligation) {
  const proposed = obligation.proposedValue && typeof obligation.proposedValue === "object" ? obligation.proposedValue : {};
  const count = Number(obligation.installmentCount || 1);
  const amounts = splitInstallments(Number(obligation.amountSatang), count);
  return amounts.map((amountSatang, index) => {
    const number = index + 1;
    const queueId = `Q-IMPORT-${obligation.recordId}-${number}`;
    return {
      recordId: queueId, source: "CALENDAR", type: count > 1 ? "PAY_OBLIGATION_INSTALLMENT" : "PAY_OBLIGATION",
      title: `จ่าย ${obligation.title}${count > 1 ? ` งวด ${number}/${count}` : ""}`, detail: `LEDGER/${obligation.recordId}`, amountSatang,
      installmentCount: count, installmentNumber: number,
      dueDate: addMonths(obligation.dueDate, index), status: proposed.requiresRefreshBeforePayment ? "VERIFY" : "OPEN",
      createdAt: obligation.createdAt || nowIso(), updatedAt: obligation.updatedAt || obligation.createdAt || nowIso(), reviewStatus: "NEW", proposedAction: "NEW_RECORD",
      proposedValue: { source: "LEDGER", sourceId: obligation.recordId, sourceProvider: proposed.sourceProvider, providerEventId: proposed.providerEventId, providerEventTitle: proposed.providerEventTitle, requiresRefreshBeforePayment: Boolean(proposed.requiresRefreshBeforePayment), importBatchId: proposed.importBatchId }
    };
  });
}
function validateImportedInstallmentSchedule(obligationRecord, queueRecords) {
  const count = Number(obligationRecord.installmentCount || 1);
  if (queueRecords.length !== count) return `จำนวนคิวต้องเท่ากับจำนวนงวด (${count})`;
  const numbers = queueRecords.map(record => Number(record.installmentNumber)).sort((a, b) => a - b);
  if (new Set(numbers).size !== count || !numbers.every((number, index) => Number.isInteger(number) && number === index + 1)) return `หมายเลขงวดต้องครบ 1–${count} และไม่ซ้ำ`;
  const sum = queueRecords.reduce((total, record) => total + Number(record.amountSatang || 0), 0);
  if (!Number.isSafeInteger(sum) || sum !== Number(obligationRecord.amountSatang)) return "ผลรวมยอดคิวต้องเท่ากับยอดภาระ";
  if (queueRecords.some(record => Number(record.installmentCount) !== count)) return "จำนวนงวดในคิวไม่ตรงกับภาระ";
  return null;
}
function applyNewObligationImport(change) {
  let obligation = findSource("LEDGER", change.recordId);
  if (!obligation) {
    const createdAt = change.createdAt || nowIso();
    obligation = {
      id: change.recordId, name: change.title, detail: change.detail, originalSatang: change.amountSatang,
      paidSatang: 0, remainingSatang: change.amountSatang, installmentCount: change.installmentCount,
      firstDue: change.dueDate, installments: [], status: "OPEN", createdAt, updatedAt: change.updatedAt || createdAt,
      revision: 1, cancelledAt: null,
      importMeta: { sourceProvider: change.sourceProvider, providerEventId: change.providerEventId, providerEventTitle: change.providerEventTitle, observedAt: change.observedAt, requiresRefreshBeforePayment: change.requiresRefreshBeforePayment, importBatchId: change.importBatchId }
    };
    state.ledger.obligations.push(obligation);
    addAudit("IMPORT_NEW_OBLIGATION", `${obligation.id} · ${obligation.name} · ${money(obligation.originalSatang)} บาท`);
  }
  const queueRecords = Array.isArray(change.queueRecords) ? change.queueRecords : [];
  queueRecords.forEach((record, index) => {
    if (findQueue(record.id)) return;
    const queue = addQueueToState(state, { source: "LEDGER", sourceId: obligation.id, actionType: record.actionType, status: record.status, amountSatang: record.amountSatang, due: record.due, effects: record.effects });
    queue.id = record.id; queue.recordId = record.id;
    queue.dueAt = record.dueAt; queue.triggerAt = record.triggerAt; queue.validUntil = record.validUntil;
    queue.sourceProvider = record.sourceProvider; queue.providerEventId = record.providerEventId; queue.providerEventTitle = record.providerEventTitle;
    queue.idempotencyKey = record.idempotencyKey; queue.requiresRefreshBeforePayment = record.requiresRefreshBeforePayment;
    queue.createdAt = record.createdAt || queue.createdAt; queue.updatedAt = record.updatedAt || queue.updatedAt;
    queue.installmentNumber = Number.isInteger(record.installmentNumber) ? record.installmentNumber : index + 1;
    queue.installmentCount = Number.isInteger(record.installmentCount) ? record.installmentCount : Number(obligation.installmentCount || queueRecords.length || 1);
    queue.history = [{ at: queue.createdAt, event: "IMPORTED", note: `นำเข้าจาก ${record.sourceProvider || "YGPH EXCHANGE"}` }];
    const installmentNumber = queue.installmentNumber || (queueRecords.length === 1 ? 1 : index + 1);
    if (!obligation.installments.some(item => item.queueId === queue.id)) obligation.installments.push({ number: installmentNumber, amountSatang: queue.amountSatang, paidSatang: 0, due: queue.due, status: "PENDING", queueId: queue.id, paidAt: null });
    addAudit("IMPORT_QUEUE_CREATED", `${queue.id} · LEDGER/${obligation.id} → ${queue.actionType}`);
  });
  obligation.installmentCount = Number(change.installmentCount || 1);
  obligation.firstDue ||= queueRecords[0]?.due || localISO();
}

function validateImportProposal(value) {
  if (!value || value.format !== "YGPH_EXCHANGE" || Number(value.version) !== 1 || !Array.isArray(value.records)) throw new Error("ไฟล์ไม่ใช่ YGPH EXCHANGE FORMAT v1");
  const current = new Map(buildExchange().records.map(record => [record.recordId, record]));
  const changes = [], blocked = [], consumed = new Set(), seen = new Set();
  const records = value.records.filter(record => record && typeof record === "object");
  for (const record of records) {
    if (!validImportId(record.recordId)) { blocked.push({ title: record.title || "รายการไม่ทราบชื่อ", reason: "recordId ไม่ถูกต้อง" }); continue; }
    if (seen.has(record.recordId)) blocked.push({ title: record.title || record.recordId, reason: "recordId ซ้ำภายในไฟล์" });
    seen.add(record.recordId);
  }

  const newObligations = records.filter(record => isNewRecordProposal(record) && record.source === "LEDGER" && record.type === "OBLIGATION");
  for (const incoming of newObligations) {
    consumed.add(incoming.recordId);
    const pairedQueues = records.filter(record => isNewRecordProposal(record) && record.source === "CALENDAR" && calendarParentId(record) === incoming.recordId);
    pairedQueues.forEach(record => consumed.add(record.recordId));
    const existing = current.get(incoming.recordId);
    if (existing) {
      if (!sameNewRecordIdentity(existing, incoming)) blocked.push({ title: incoming.title || incoming.recordId, reason: "recordId ชนกับข้อมูลคนละประเภทในเครื่อง" });
      for (const queueRecord of pairedQueues) {
        const existingQueue = current.get(queueRecord.recordId);
        if (!existingQueue) blocked.push({ title: queueRecord.title || queueRecord.recordId, reason: "พบภาระแล้วแต่คิวคู่กันไม่อยู่ในเครื่อง กรุณาส่งออกข้อมูลใหม่ก่อน" });
        else if (!sameNewRecordIdentity(existingQueue, queueRecord)) blocked.push({ title: queueRecord.title || queueRecord.recordId, reason: "รหัสคิวชนกับข้อมูลคนละประเภทในเครื่อง" });
      }
      continue;
    }
    const obligationError = validateNewObligationRecord(incoming);
    if (obligationError) { blocked.push({ title: incoming.title || incoming.recordId, reason: obligationError }); continue; }
    const queueSource = pairedQueues.length ? pairedQueues : makeSyntheticQueueRecords(incoming);
    let queueError = validateImportedInstallmentSchedule(incoming, queueSource);
    for (const queueRecord of queueSource) {
      if (queueError) break;
      const error = validateNewQueueRecord(queueRecord, incoming.recordId);
      if (error) { queueError = `${queueRecord.title || queueRecord.recordId}: ${error}`; break; }
      const existingQueue = current.get(queueRecord.recordId);
      if (existingQueue && !sameNewRecordIdentity(existingQueue, queueRecord)) { queueError = `${queueRecord.title || queueRecord.recordId}: รหัสคิวชนกับข้อมูลเดิม`; break; }
    }
    if (queueError) { blocked.push({ title: incoming.title || incoming.recordId, reason: queueError }); continue; }
    const proposed = incoming.proposedValue && typeof incoming.proposedValue === "object" ? incoming.proposedValue : {};
    changes.push({
      kind: "CREATE_OBLIGATION", recordId: String(incoming.recordId), source: "LEDGER", type: "OBLIGATION",
      title: cleanImportText(incoming.title, 120), detail: cleanImportText(incoming.detail, 180),
      amountSatang: parseSatang(Number(incoming.amountSatang), { allowZero: false, label: "ยอดภาระ" }), installmentCount: Number(incoming.installmentCount || 1), dueDate: String(incoming.dueDate),
      createdAt: cleanImportText(incoming.createdAt || value.generatedAt || nowIso(), 80), updatedAt: cleanImportText(incoming.updatedAt || incoming.createdAt || value.generatedAt || nowIso(), 80),
      sourceProvider: cleanImportText(proposed.sourceProvider, 80) || null, providerEventId: cleanImportText(proposed.providerEventId, 220) || null,
      providerEventTitle: cleanImportText(proposed.providerEventTitle, 260) || null, observedAt: cleanImportText(proposed.observedAt || value.generatedAt, 80) || null,
      requiresRefreshBeforePayment: Boolean(proposed.requiresRefreshBeforePayment), importBatchId: cleanImportText(proposed.importBatchId || value.batchId, 180) || null,
      queueRecords: queueSource.map(record => sanitizeImportedQueue(record, incoming.recordId)), reason: cleanImportText(incoming.reason, 260)
    });
  }

  const comparableFields = ["title", "detail", "amountSatang", "quantity", "installmentCount", "installmentNumber", "dueDate", "status"];
  for (const incoming of records) {
    if (consumed.has(incoming.recordId)) continue;
    const original = current.get(incoming.recordId);
    if (!original) {
      if (isNewRecordProposal(incoming)) blocked.push({ title: incoming.title || incoming.recordId, reason: `ยังไม่รองรับการสร้าง ${incoming.source || "UNKNOWN"}/${incoming.type || "UNKNOWN"} จากไฟล์` });
      continue;
    }
    if (isNewRecordProposal(incoming)) {
      if (!sameNewRecordIdentity(original, incoming)) blocked.push({ title: incoming.title || incoming.recordId, reason: "recordId ชนกับข้อมูลคนละประเภทในเครื่อง" });
      continue;
    }
    const directChanges = comparableFields.filter(field => JSON.stringify(incoming[field] ?? null) !== JSON.stringify(original[field] ?? null));
    if (directChanges.length) blocked.push({ title: original.title, reason: `ไฟล์แก้ต้นฉบับโดยตรง: ${directChanges.join(", ")}` });
    if (incoming.proposedAction === "UPDATE_FIELDS" && incoming.proposedValue && typeof incoming.proposedValue === "object") {
      for (const [field, nextValue] of Object.entries(incoming.proposedValue)) {
        const safe = isSafeExchangeField(original, field, nextValue);
        const change = { kind: "UPDATE_FIELD", recordId: original.recordId, source: original.source, type: original.type, title: original.title, field, oldValue: original[field] ?? null, newValue: nextValue, reason: incoming.reason || "", safe };
        if (safe && JSON.stringify(change.oldValue) !== JSON.stringify(nextValue)) changes.push(change); else if (!safe) blocked.push({ title: original.title, reason: `ช่อง ${field} เปลี่ยนจากไฟล์ไม่ได้` });
      }
    } else if (!["NONE", null, undefined].includes(incoming.proposedAction)) blocked.push({ title: original.title, reason: `ไม่รองรับคำสั่ง ${incoming.proposedAction}` });
  }
  return { batchId: value.batchId || null, changes, blocked, importedAt: nowIso() };
}

function renderImportPreview() {
  const pending = state.sync.pendingImport;
  const cancelBtn = byId("cancelImportBtn"), applyBtn = byId("applyImportBtn");
  if (!pending) {
    byId("importPreview").innerHTML = '<div class="sync-result-row"><b>สถานะ</b><span class="warn">ยังไม่ได้เลือกไฟล์</span></div>';
    cancelBtn.disabled = true; applyBtn.disabled = true; return;
  }
  const changes = pending.changes || [], blocked = pending.blocked || [];
  let html = `<div class="sync-result-row"><b>รายการที่จะนำเข้า</b><span class="${changes.length ? "warn" : "ok"}">${changes.length}</span></div><div class="sync-result-row"><b>รายการที่ไม่อนุญาต</b><span class="${blocked.length ? "bad" : "ok"}">${blocked.length}</span></div>`;
  html += changes.map(change => {
    if (change.kind === "CREATE_OBLIGATION") return `<div class="change-card create-card"><b>เพิ่มภาระ · ${esc(change.title)}</b><div class="create-summary"><div><small>ยอดภาระ</small><b>${money(change.amountSatang)} บาท</b></div><div><small>คิวที่จะสร้าง</small><b>${change.queueRecords.length} รายการ</b></div><div><small>กำหนดแรก</small><b>${dateTH(change.dueDate)}</b></div><div><small>สถานะคิว</small><b>${change.queueRecords.some(item => item.status === "VERIFY") ? "ต้องตรวจสอบ" : "รอดำเนินการ"}</b></div></div>${change.reason ? `<small>${esc(change.reason)}</small>` : ""}<small>การนำเข้าไม่หักเงินจริง</small></div>`;
    return `<div class="change-card"><b>${esc(change.title)} · ${esc(change.field)}</b><div class="change-diff"><div><small>เดิม</small><b>${esc(change.oldValue)}</b></div><span>→</span><div><small>ใหม่</small><b>${esc(change.newValue)}</b></div></div>${change.reason ? `<small>${esc(change.reason)}</small>` : ""}</div>`;
  }).join("");
  if (blocked.length) html += `<div class="blocked-note"><b>ไฟล์ต้องแก้ก่อนนำเข้า</b>${blocked.map(item => `<div>• ${esc(item.title)} — ${esc(item.reason)}</div>`).join("")}</div>`;
  if (!changes.length && !blocked.length) html += '<div class="empty">ข้อมูลตรงกันแล้ว ไม่มีอะไรต้องนำเข้า</div>';
  byId("importPreview").innerHTML = html;
  cancelBtn.disabled = false;
  applyBtn.disabled = !changes.length || Boolean(blocked.length);
}

async function applyPendingImport() {
  const pending = state.sync.pendingImport;
  if (!pending || !pending.changes?.length || pending.blocked?.length) return toast("ไฟล์ยังนำเข้าไม่ได้");
  const createCount = pending.changes.filter(change => change.kind === "CREATE_OBLIGATION").length;
  const updateCount = pending.changes.length - createCount;
  const parts = [];
  if (createCount) parts.push(`เพิ่มภาระ ${createCount} รายการ`);
  if (updateCount) parts.push(`แก้ข้อมูล ${updateCount} รายการ`);
  openModal({ title: "ยืนยันการนำเข้า", text: parts.join(" และ "), body: '<div class="flow-note">ยังไม่มีข้อมูลหรือเงินจริงเปลี่ยนจนกว่าจะกดตกลง การสร้างภาระจะสร้างคิวปฏิทินคู่กันโดยไม่หักเงิน</div>', confirm: "ตกลง นำเข้าข้อมูล", onConfirm: async () => {
    const before = clone(state);
    try {
      const commandTimestamp = nowIso();
      const core = resolveYGPHCore();
      const importIdentity = String(pending.flowPackageId || pending.batchId || core.hash({ changes: pending.changes, blocked: pending.blocked || [] }));
      const targets = [...new Set([
        "CORE",
        ...pending.changes.map(change => change.source).filter(source => ["STORE", "RIDE", "LEDGER", "CALENDAR"].includes(source)),
        ...(pending.changes.some(change => change.kind === "CREATE_OBLIGATION") ? ["LEDGER", "CALENDAR"] : [])
      ])];
      for (const change of pending.changes) {
        if (change.kind === "CREATE_OBLIGATION") applyNewObligationImport(change);
        else applyExchangeChange(change);
      }
      repairSafeStateInvariants(state);
      validateStateInvariants(state, { quarantine: true });
      state.sync.lastImportAt = nowIso();
      state.sync.lastBatchId = pending.batchId || state.sync.lastBatchId;
      state.sync.pendingImport = null;
      closeModal();
      await persistAndRender("นำเข้าข้อมูลแล้ว", {
        eventType: "EXCHANGE_IMPORT_APPLIED",
        sourceDomain: "CORE",
        sourceOwner: "OWNER_LOCAL_IMPORT",
        targetDomain: targets,
        correlationId: importIdentity,
        causationId: importIdentity,
        idempotencyKey: `import:${importIdentity}`,
        timestamp: commandTimestamp,
        snapshotBeforeWrite: true,
        snapshotType: "EXCHANGE_IMPORT"
      });
    } catch (error) {
      state = before;
      closeModal();
      renderAll();
      throw error;
    }
  }});
}
function cancelPendingImport() {
  state.sync.pendingImport = null;
  renderAll();
  toast("ยกเลิกแล้ว ไม่มีข้อมูลเปลี่ยน");
}

function renderSettings() {
  byId("defaultPrice").value = satangToBaht(state.settings.defaultPriceSatang);
  byId("lowStockThreshold").value = state.settings.lowStockThreshold;
  byId("lockMinutes").value = String(state.settings.lockMinutes);
  byId("themeColor").value = state.settings.themeColor;
  byId("balanceStatusNote").innerHTML = state.ledger.balanceVerified ? `<b>ยืนยันแล้ว</b><br>เงินปัจจุบัน ${money(currentBalanceSatang())} บาท · ${displayTime(state.ledger.verifiedAt)}` : `<b>ต้องยืนยันยอด</b><br>กรอกยอดเงินจริงก่อนใช้รายงานการเงิน`;
  const coreVersion = globalThis.YGPHCore?.VERSION || "NOT_LOADED";
  const proof = lastDurableReadback || state.sync?.flow?.lastReadbackRuntime || null;
  const swLine = serviceWorkerStatus?.lifecycle
    ? `${serviceWorkerStatus.lifecycle.serving || "—"}${serviceWorkerStatus.usingPrevious ? " (rollback)" : ""}`
    : "กำลังตรวจ";
  byId("technicalStatus").textContent = `Core/data release: ${CORE_DATA_RELEASE_VERSION}\nCore: ${coreVersion}\nState schema: ${state.schema}\nState revision: ${state.revision}\nEvent envelopes: ${state.events?.length || 0}\nDB: ${DB_NAME}/${DB_STORE}/${VAULT_KEY}\nVault: AES-GCM + PBKDF2 ${currentVault?.kdf?.iterations || PBKDF2_ITERATIONS}\nLast read-back: ${proof ? `${proof.status} / revision ${proof.stateRevision} / ${proof.verifiedAt}` : "ยังไม่มีในรอบนี้"}\nService Worker: ${swLine}\nBalance verified: ${state.ledger.balanceVerified}\nMigration: ${JSON.stringify(state.migration)}`;
}

function renderAll() {
  if (!state) return;
  applyTheme(); renderHome(); renderStore(); renderRide(); renderLedger(); renderCalendar(); renderReport(); renderSync(); renderImportPreview(); renderSettings(); bindGoCalendar(); bindHistoryButtons();
}


function historyHtml(kind) {
  if (kind === "sales") return sortNewest(state.store.sales).map(item => recordHtml("🧾", `${item.customer} · ${item.qty} ชิ้น`, `${dateTH(item.date)} · ค้าง ${money(item.outstandingSatang)}`, `${money(item.totalSatang)} ฿`, item.status, "STORE", item.id)).join("");
  if (kind === "purchases") return sortNewest(state.store.purchases).map(item => recordHtml("📦", item.name, `${item.qty} ชิ้น · ${dateTH(item.date)}`, `${money(item.costSatang)} ฿`, item.status, "STORE", item.id)).join("");
  if (kind === "withdrawals") return sortNewest(state.store.withdrawals).map(item => `<div class="record"><div class="record-head"><div class="record-icon">📤</div><div><b>${esc(item.reason)}</b><small>${item.qty} ชิ้น · ${dateTH(item.date)}</small></div><strong>${money(item.costSatang)} ฿</strong></div></div>`).join("");
  if (kind === "rideJobs") return sortNewest(state.ride.jobs).map(item => recordHtml("🛵", item.note || "งานวิ่ง", `${money(item.amountSatang)} บาท · ${item.paymentMode}`, `${numberFmt(item.distanceKm)} กม.`, item.status, "RIDE", item.id)).join("");
  if (kind === "rideWithdrawals") return sortNewest(state.ride.creditWithdrawals).map(item => recordHtml("🏧", "เบิกเครดิต", dateTH(item.due), `${money(item.amountSatang)} ฿`, item.status, "RIDE", item.id)).join("");
  if (kind === "debts") return sortNewest(state.ledger.obligations).map(item => recordHtml("🧷", item.name, `${item.installmentCount} งวด · เหลือ ${money(item.remainingSatang)}`, `${money(item.originalSatang)} ฿`, item.status, "LEDGER", item.id)).join("");
  if (kind === "transactions") return sortNewest(state.ledger.transactions).map(tx => `<div class="tx"><div><b>${esc(tx.label)}</b><small>${displayTime(tx.createdAt)}</small></div><strong class="${tx.direction === "IN" ? "green" : "red"}">${tx.direction === "IN" ? "+" : "−"}${money(tx.amountSatang)} ฿</strong></div>`).join("");
  if (kind === "audit") return (lastReportData?.audit || []).map(item => `<div class="audit"><b>${esc(item.event)}</b><small>${displayTime(item.at)} · ${esc(item.note)}</small></div>`).join("");
  return '<div class="empty">ไม่มีข้อมูล</div>';
}
function showAllHistory(kind, title) {
  openModal({ title, body: `<div class="history-modal">${historyHtml(kind)}</div>`, confirm: "ปิด", onConfirm: closeModal });
  bindGoCalendar();
}
function bindHistoryButtons() {
  const specs = [
    ["allSalesBtn", "sales", "รายการขายทั้งหมด"], ["allPurchasesBtn", "purchases", "รายการรับสินค้าทั้งหมด"], ["allWithdrawalsBtn", "withdrawals", "การเบิกสินค้าทั้งหมด"],
    ["allRideJobsBtn", "rideJobs", "งานวิ่งทั้งหมด"], ["allRideWithdrawalsBtn", "rideWithdrawals", "การเบิกเครดิตทั้งหมด"], ["allDebtsBtn", "debts", "ภาระทั้งหมด"], ["allTransactionsBtn", "transactions", "เงินเข้า–ออกทั้งหมด"], ["allAuditBtn", "audit", "ประวัติระบบในช่วงรายงาน"]
  ];
  specs.forEach(([id, kind, title]) => { const button = byId(id); if (button) button.onclick = () => showAllHistory(kind, title); });
}

function bindGoCalendar() { $$('[data-go-calendar]').forEach(button => button.onclick = () => { const [source, id] = button.dataset.goCalendar.split(":"); goCalendar(source, id); }); }
function bindQueueActions() {
  $$('[data-partial]').forEach(button => button.onclick = () => openPayment(button.dataset.partial, false));
  $$('[data-full]').forEach(button => button.onclick = () => openPayment(button.dataset.full, true));
  $$('[data-complete]').forEach(button => button.onclick = () => completeQueue(button.dataset.complete));
  $$('[data-cancel]').forEach(button => button.onclick = () => cancelQueue(button.dataset.cancel));
  $$('[data-move]').forEach(button => button.onclick = () => moveQueue(button.dataset.move));
  $$('[data-history]').forEach(button => button.onclick = () => showHistory(button.dataset.history));
  $$('[data-refresh]').forEach(button => button.onclick = () => refreshQueueVerification(button.dataset.refresh));
  $$('[data-verify-edit]').forEach(button => button.onclick = () => editQueueVerification(button.dataset.verifyEdit));
}

function refreshQueueVerification(id) {
  const item = findQueue(id);
  const source = item ? findSource(item.source, item.sourceId) : null;
  if (!item) return toast("ไม่พบคิว");
  if (!source) return toast("ไม่พบข้อมูลต้นทาง จึงยืนยันไม่ได้ กรุณาแก้ไขหรือยกเลิกรายการ");
  openModal({ title: "ยืนยันข้อมูลถูกต้อง", text: "บิ๊กตรวจข้อมูลจากหลักฐานที่มีแล้ว ระบบจะปลด Safety Gate ในเครื่อง", body: `<div class="flow-note"><b>${esc(source.name || source.customer || source.note || item.sourceId)}</b><br>ยอดคิว ${money(Math.max(0, Number(item.amountSatang || 0) - Number(item.paidSatang || 0)))} บาท · กำหนด ${dateTH(item.due)}</div><div class="field"><label>หมายเหตุการตรวจ</label><input id="refreshVerificationNote" maxlength="180" placeholder="เช่น ตรวจบิลหรือยอดในโทรศัพท์แล้ว"></div>`, confirm: "ยืนยันข้อมูลถูกต้อง", onConfirm: async () => {
    const note = cleanImportText(byId("refreshVerificationNote").value, 180);
    if (note.length < 3) { toast("ระบุว่าใช้ข้อมูลอะไรตรวจ"); modalBusy = false; return; }
    item.status = Number(item.paidSatang || 0) > 0 ? "PARTIAL" : "OPEN";
    item.requiresRefreshBeforePayment = false;
    item.validUntil = null;
    item.expectedRevision = Number(source.revision || 1);
    item.sourceRevision = Number(source.revision || 1);
    item.verifiedAt = nowIso();
    item.verifiedNote = note;
    addHistory(item, "OWNER_VERIFIED_LOCAL", note);
    bumpQueue(item);
    closeModal();
    await persistAndRender("ยืนยันข้อมูลในเครื่องและปลด Safety Gate แล้ว");
  }});
}
function editQueueVerification(id) {
  const item = findQueue(id);
  if (!item) return toast("ไม่พบคิว");
  openModal({ title: "แก้ไขข้อมูลที่ต้องตรวจ", text: "แก้เฉพาะกำหนดและหมายเหตุในเครื่อง โดยยังไม่ทำเงินจริง", body: `<div class="field"><label>วันกำหนด</label><input id="verifyEditDue" type="date" value="${esc(item.due)}"></div><div class="field"><label>หมายเหตุ</label><input id="verifyEditNote" maxlength="180" value="${esc(item.reviewNote || item.verifiedNote || "")}" placeholder="ระบุข้อมูลที่ต้องแก้หรือตรวจเพิ่ม"></div><div class="flow-note"><b>ยอด ${money(Math.max(0, Number(item.amountSatang || 0) - Number(item.paidSatang || 0)))} บาท</b><br>ยอดเงินจริงผูกกับข้อมูลต้นทาง จึงไม่แก้ทับจากคิวนี้</div>`, confirm: "บันทึกการแก้ไข", onConfirm: async () => {
    const due = byId("verifyEditDue").value;
    const note = cleanImportText(byId("verifyEditNote").value, 180);
    if (!validISODate(due)) { toast("วันกำหนดไม่ถูกต้อง"); modalBusy = false; return; }
    item.due = due; item.dueAt = `${due}T09:00:00+07:00`; item.triggerAt = item.dueAt;
    item.reviewNote = note;
    item.status = "VERIFY";
    item.requiresRefreshBeforePayment = true;
    item.completedAt = null;
    const source = findSource(item.source, item.sourceId);
    if (source?.installments && item.installmentNumber) {
      const installment = source.installments.find(entry => entry.number === item.installmentNumber);
      if (installment) installment.due = due;
    }
    if (item.actionType === "CONFIRM_RIDE_CREDIT_WITHDRAWAL" && source) source.due = due;
    if (source) { bumpSource(source); syncQueueRevisionsForSource(item.source, item.sourceId); }
    addHistory(item, "OWNER_EDITED_VERIFY", note || `แก้กำหนดเป็น ${due}`);
    bumpQueue(item);
    closeModal();
    await persistAndRender("แก้ข้อมูลแล้ว รายการยังถูกล็อกจนกว่าจะยืนยัน");
  }});
}

async function openPayment(id, full) {
  const item = findQueue(id);
  const source = findSource(item.source, item.sourceId);
  withGates(item, async () => {
    const incoming = item.actionType === "RECEIVE_CUSTOMER_PAYMENT";
    const maximum = incoming ? Number(source.outstandingSatang || 0) : Math.min(Number(source.remainingSatang || 0), Math.max(0, Number(item.amountSatang || 0) - Number(item.paidSatang || 0)));
    if (maximum <= 0) return toast("รายการนี้ไม่มียอดคงเหลือ");
    openModal({ title: incoming ? "รับเงินลูกค้า" : `จ่ายภาระ${item.installmentNumber ? ` งวด ${item.installmentNumber}/${item.installmentCount}` : ""}`, text: "เงินจริงจะเปลี่ยนเมื่อยืนยันเท่านั้น", body: full ? "" : `<div class="field"><label>ยอดครั้งนี้</label><input id="payAmount" type="number" min="0.01" max="${satangToBaht(maximum)}" step="0.01" value="${satangToBaht(maximum)}"></div>`, confirm: incoming ? "รับเงิน" : "จ่ายเงิน", onConfirm: async () => {
      const amount = full ? maximum : parseMoneyToSatang(byId("payAmount").value, { allowZero: false, label: "ยอดครั้งนี้" });
      if (amount <= 0 || amount > maximum) { toast("ยอดไม่ถูกต้อง"); modalBusy = false; return; }
      const sequence = item.history.filter(h => h.event === "PAYMENT_APPLIED").length + 1;
      const key = `payment:${sequence}:${amount}`;
      runOnce(item, key, () => {
        if (incoming) {
          addTransaction({ direction: "IN", amountSatang: amount, label: `รับชำระ ${source.id}`, source: "STORE", sourceId: source.id, subtype: "SALE_RECEIPT", actionKey: `${item.id}:${key}` });
          source.receivedSatang += amount; source.outstandingSatang = Math.max(0, source.totalSatang - source.receivedSatang);
          source.status = source.outstandingSatang === 0 ? "COMPLETED" : "PARTIAL";
          item.amountSatang = source.outstandingSatang;
        } else {
          addTransaction({ direction: "OUT", amountSatang: amount, label: `ชำระ ${source.name}${item.installmentNumber ? ` งวด ${item.installmentNumber}` : ""}`, source: "LEDGER", sourceId: source.id, subtype: "OBLIGATION_PAYMENT", actionKey: `${item.id}:${key}` });
          source.paidSatang += amount; source.remainingSatang = Math.max(0, source.originalSatang - source.paidSatang);
          source.status = source.remainingSatang === 0 ? "COMPLETED" : "PARTIAL";
          item.paidSatang = Number(item.paidSatang || 0) + amount;
          const installment = source.installments?.find(x => x.number === item.installmentNumber);
          if (installment) { installment.paidSatang = Number(installment.paidSatang || 0) + amount; installment.status = installment.paidSatang >= installment.amountSatang ? "COMPLETED" : "PARTIAL"; installment.paidAt = installment.status === "COMPLETED" ? nowIso() : null; }
        }
        bumpSource(source);
        item.expectedRevision = source.revision; item.sourceRevision = source.revision;
        const queueRemaining = incoming ? Number(source.outstandingSatang || 0) : Math.max(0, Number(item.amountSatang || 0) - Number(item.paidSatang || 0));
        item.status = queueRemaining === 0 ? "COMPLETED" : "PARTIAL";
        if (item.status === "COMPLETED") item.completedAt = nowIso();
        addHistory(item, "PAYMENT_APPLIED", `${incoming ? "IN" : "OUT"} ${money(amount)}`);
        syncQueueRevisionsForSource(item.source, item.sourceId);
      });
      closeModal(); await persistAndRender(`${incoming ? "+" : "−"}${money(amount)} บาท`);
    }});
  });
}

async function completeQueue(id) {
  const item = findQueue(id); const source = findSource(item.source, item.sourceId);
  withGates(item, async () => openModal({ title: item.actionType === "CONFIRM_RIDE_CREDIT_WITHDRAWAL" ? "ยืนยันว่าเงินเข้าแล้ว" : "ยืนยันแอคชัน", text: `${sourceLabel(item.source)} · ${actionLabel(item.actionType)}`, body: `<div class="flow-note"><b>ยอด:</b> ${money(item.amountSatang)} บาท</div>`, confirm: "ดำเนินการ", onConfirm: async () => {
    runOnce(item, "complete", () => {
      if (item.actionType === "CONFIRM_RIDE_CREDIT_WITHDRAWAL") {
        addTransaction({ direction: "IN", amountSatang: source.amountSatang, label: `เงินเข้าจากเครดิตงานวิ่ง ${source.id}`, source: "RIDE", sourceId: source.id, subtype: "RIDE_CREDIT_WITHDRAWAL", actionKey: `${item.id}:complete` });
        source.status = "COMPLETED"; source.confirmedAt = nowIso(); bumpSource(source);
      }
      if (item.actionType === "SETTLE_RIDE_JOB") {
        addTransaction({ direction: "IN", amountSatang: source.amountSatang, label: `รายได้งานเดิม ${source.id}`, source: "RIDE", sourceId: source.id, subtype: "RIDE_INCOME", actionKey: `${item.id}:complete` });
        source.status = "SETTLED"; source.paymentMode ||= "LEGACY_PENDING"; bumpSource(source);
      }
      if (item.actionType === "PURCHASE_RETURN_WINDOW") { source.status = "ACTIVE"; bumpSource(source); }
      if (item.actionType === "VERIFY_SOURCE" && source) { source.verifiedAt = nowIso(); bumpSource(source); }
      if (source) { item.expectedRevision = source.revision; item.sourceRevision = source.revision; syncQueueRevisionsForSource(item.source, item.sourceId); }
      item.status = "COMPLETED"; item.completedAt = nowIso(); addHistory(item, "COMPLETED", "แอคชันสำเร็จ");
    });
    closeModal(); await persistAndRender(item.actionType === "CONFIRM_RIDE_CREDIT_WITHDRAWAL" ? "เงินเข้าการเงินแล้ว" : "ปิดคิวแล้ว");
  }}));
}

async function cancelQueue(id) {
  const item = findQueue(id); const source = findSource(item.source, item.sourceId);
  if (item.status === "CANCELLED") return toast("รายการนี้ยกเลิกแล้ว");
  openModal({ title: "ยกเลิกรายการ", text: "ระบบจะย้อนเฉพาะผลที่เคยเกิดจากคิวนี้", body: `<div class="flow-note"><b>${item.source}/${item.sourceId}</b><br>${actionLabel(item.actionType)}</div>`, confirm: "ยืนยันยกเลิก", onConfirm: async () => {
    if (item.actionType === "PURCHASE_RETURN_WINDOW" && source && state.store.stockQty < source.qty) {
      item.status = "VERIFY"; item.requiresRefreshBeforePayment = true; addHistory(item, "CANCEL_BLOCKED", "จำนวนสต็อกคงเหลือไม่พอสำหรับคืนลอต"); closeModal(); await persistAndRender("ต้องตรวจสต็อกก่อนคืนของ"); return;
    }
    runOnce(item, "cancel", () => {
      let cashDelta = 0;
      if (item.actionType === "RECEIVE_CUSTOMER_PAYMENT" && source) {
        cashDelta = reverseTransactions(item.source, item.sourceId, `${item.id}:cancel`);
        if (!source.stockRestored) { state.store.stockQty += source.qty; state.store.stockValueSatang += source.costSatang; source.stockRestored = true; }
        source.status = "CANCELLED"; source.cancelledAt = nowIso(); source.receivedSatang = 0; source.outstandingSatang = 0; bumpSource(source);
      } else if (item.actionType === "PURCHASE_RETURN_WINDOW" && source) {
        cashDelta = reverseTransactions(item.source, item.sourceId, `${item.id}:cancel`);
        const inventoryCostSatang = takeStockFromPool(state, Number(source.qty));
        source.returnInventoryCostSatang = inventoryCostSatang;
        source.returnCostDifferenceSatang = Number(source.costSatang || 0) - inventoryCostSatang;
        source.returnedAt = nowIso();
        addAudit("STOCK_RETURN_VALUATION", `${source.id} · คืน ${source.qty} ชิ้น · ต้นทุนกอง ${money(inventoryCostSatang)} · ส่วนต่าง ${source.returnCostDifferenceSatang >= 0 ? "+" : ""}${money(source.returnCostDifferenceSatang)}`);
        source.status = "CANCELLED"; source.cancelledAt = nowIso(); source.paidAmountSatang = 0; bumpSource(source);
      } else if (item.actionType === "SETTLE_RIDE_JOB" && source) {
        cashDelta = reverseTransactions(item.source, item.sourceId, `${item.id}:cancel`);
        source.status = "CANCELLED"; source.cancelledAt = nowIso(); bumpSource(source);
      } else if (item.actionType === "CONFIRM_RIDE_CREDIT_WITHDRAWAL" && source) {
        if (source.status === "PENDING") state.ride.creditBalanceSatang += source.amountSatang;
        source.status = "CANCELLED"; source.cancelledAt = nowIso(); bumpSource(source);
      } else if (["PAY_OBLIGATION", "PAY_OBLIGATION_INSTALLMENT"].includes(item.actionType) && source) {
        const reversed = reverseQueuePayments(item, `${item.id}:cancel`);
        source.paidSatang = Math.max(0, source.paidSatang - reversed);
        source.remainingSatang = Math.max(0, source.originalSatang - source.paidSatang);
        source.status = source.paidSatang ? "PARTIAL" : "OPEN";
        const installment = source.installments?.find(x => x.number === item.installmentNumber);
        if (installment) { installment.paidSatang = Math.max(0, Number(installment.paidSatang || 0) - reversed); installment.status = installment.paidSatang ? "PARTIAL" : "CANCELLED"; installment.paidAt = null; }
        cashDelta = reversed;
        bumpSource(source);
      }
      item.status = "CANCELLED"; item.cancelledAt = nowIso(); item.completedAt = null;
      if (source) { item.expectedRevision = source.revision; item.sourceRevision = source.revision; syncQueueRevisionsForSource(item.source, item.sourceId); }
      addHistory(item, "CANCELLED", `ผลเงินจริงสุทธิ ${cashDelta >= 0 ? "+" : ""}${money(cashDelta)}`);
    });
    closeModal(); await persistAndRender("ยกเลิกแล้ว");
  }});
}

function moveQueue(id) {
  const item = findQueue(id);
  openModal({ title: "เลื่อนกำหนด", text: `${sourceLabel(item.source)} · ${item.sourceId}`, body: `<div class="field"><label>วันใหม่</label><input id="newDue" type="date" value="${item.due}"></div>`, confirm: "บันทึกวันใหม่", onConfirm: async () => {
    const due = byId("newDue").value;
    if (!validISODate(due)) { toast("วันใหม่ไม่ถูกต้อง"); modalBusy = false; return; }
    runOnce(item, `move:${due}`, () => {
      item.due = due; item.dueAt = `${due}T09:00:00+07:00`; item.triggerAt = item.dueAt;
      const source = findSource(item.source, item.sourceId);
      if (source?.installments && item.installmentNumber) { const installment = source.installments.find(x => x.number === item.installmentNumber); if (installment) installment.due = due; }
      if (item.actionType === "CONFIRM_RIDE_CREDIT_WITHDRAWAL" && source) source.due = due;
      addHistory(item, "MOVED", `เลื่อนไป ${due}`);
    });
    closeModal(); await persistAndRender("เลื่อนคิวแล้ว");
  }});
}

function showHistory(id) {
  const item = findQueue(id);
  openModal({ title: `ประวัติ ${item.id}`, text: `${sourceLabel(item.source)} · ${item.sourceId}`, body: item.history.map(h => `<div class="audit"><b>${esc(h.event)}</b><small>${new Date(h.at).toLocaleString("th-TH")} · ${esc(h.note)}</small></div>`).join(""), confirm: "ปิด", onConfirm: closeModal });
}

function promptVerifyBalance(migrationPrompt = false) {
  const initialVerification = migrationPrompt || !state.ledger.balanceVerified;
  openModal({ title: initialVerification ? "ยืนยันยอดเงินปัจจุบันหลังย้ายข้อมูล" : "กระทบยอดเงินปัจจุบัน", text: initialVerification ? "ตั้งฐานเงินครั้งแรกหลัง Migration เท่านั้น" : "ระบบจะสร้างรายการปรับยอด ณ เวลานี้ โดยไม่เปลี่ยนประวัติย้อนหลัง", body: `<div class="field"><label>เงินปัจจุบัน</label><input id="verifiedBalance" type="number" min="0" step="0.01" value="${state.ledger.balanceVerified ? satangToBaht(currentBalanceSatang()) : 0}"></div>${initialVerification ? "" : '<div class="field"><label>เหตุผลส่วนต่าง</label><input id="balanceReason" maxlength="180" placeholder="เช่น ตรวจเงินสดและยอดบัญชีแล้ว"></div>'}`, confirm: initialVerification ? "ยืนยันยอดตั้งต้น" : "บันทึกรายการปรับยอด", onConfirm: async () => {
    const target = parseMoneyToSatang(byId("verifiedBalance").value, { allowZero: true, label: "เงินปัจจุบัน" });
    const current = currentBalanceSatang();
    if (initialVerification) {
      const movement = state.ledger.transactions.reduce((sum, tx) => sum + signedTransaction(tx), 0);
      state.ledger.openingBalanceSatang = target - movement;
      state.ledger.balanceVerified = true;
      state.ledger.verifiedAt = nowIso();
      addAudit("BALANCE_INITIALIZED", `เงินตั้งต้น ${money(target)} บาท`);
    } else {
      const reason = cleanImportText(byId("balanceReason").value, 180);
      if (reason.length < 3) { toast("ระบุเหตุผลการปรับยอด"); modalBusy = false; return; }
      const difference = target - current;
      if (difference !== 0) addTransaction({ direction: difference > 0 ? "IN" : "OUT", amountSatang: Math.abs(difference), label: `ปรับยอดจากการตรวจจริง: ${reason}`, source: "LEDGER", sourceId: "LEDGER-CURRENT", subtype: "BALANCE_RECONCILIATION", actionKey: `balance-reconciliation:${Date.now()}` });
      state.ledger.verifiedAt = nowIso();
      addAudit("BALANCE_RECONCILED", `${reason} · ${difference >= 0 ? "+" : ""}${money(difference)} บาท`);
    }
    closeModal(); await persistAndRender(initialVerification ? "ยืนยันยอดตั้งต้นแล้ว" : "บันทึกส่วนต่าง ณ วันนี้แล้ว");
  }});
}

function setupActions() {
  byId("addSaleBtn").onclick = () => openModal({ title: "ขายสินค้า", text: "รับเงินได้ทันทีจะจบที่ร้านค้า ยอดค้างจะไปปฏิทิน", body: `<div class="form-grid"><div class="field"><label>จำนวนชิ้น</label><input id="saleQty" type="number" min="1" value="1"></div><div class="field"><label>ราคาต่อชิ้น</label><input id="saleUnitPrice" type="number" min="0" step="0.01" value="${satangToBaht(state.settings.defaultPriceSatang)}"></div><div class="field"><label>รับเงินจริงครั้งนี้</label><input id="saleReceived" type="number" min="0" step="0.01" value="0"><small>กรอกเฉพาะเงินที่ได้รับจริงตอนนี้ ยอดที่ยังไม่รับจะเป็นลูกหนี้</small></div><div class="field"><label>ลูกค้า</label><input id="saleCustomer" maxlength="80"></div><div class="field full"><label>ช่องทางติดต่อ</label><input id="saleContact" maxlength="100"></div><div class="field full"><label>วันนัดยอดค้าง</label><input id="saleDue" type="date" value="${localISO()}"></div><div class="field full"><label>หมายเหตุ</label><input id="saleNote" maxlength="200"></div></div>`, confirm: "บันทึกขาย", onConfirm: async () => {
    const qty = parseQuantity(byId("saleQty").value, { label: "จำนวนขาย" }), unitPriceSatang = parseMoneyToSatang(byId("saleUnitPrice").value, { allowZero: true, label: "ราคาต่อชิ้น" }), receivedSatang = parseMoneyToSatang(byId("saleReceived").value, { allowZero: true, label: "เงินรับ" });
    const totalSatang = parseSatang(qty * unitPriceSatang, { allowZero: true, label: "ยอดขายรวม" });
    if (receivedSatang > totalSatang || qty > state.store.stockQty) { toast("ตรวจเงินรับและสต็อก"); modalBusy = false; return; }
    const customer = byId("saleCustomer").value.trim() || (receivedSatang < totalSatang ? "ลูกค้าไม่ระบุชื่อ" : "ขายเงินสด");
    const due = byId("saleDue").value; if (receivedSatang < totalSatang && !due) { toast("รายการค้างต้องมีวันนัด"); modalBusy = false; return; }
    const costSatang = takeStockFromPool(state, qty);
    const id = uid("SALE"), createdAt = nowIso();
    const sale = { id, customer, contact: byId("saleContact").value.trim(), qty, unitPriceSatang, totalSatang, receivedSatang, outstandingSatang: totalSatang - receivedSatang, costSatang, status: receivedSatang === totalSatang ? "COMPLETED" : receivedSatang > 0 ? "PARTIAL" : "OPEN", note: byId("saleNote").value.trim(), date: localISO(), createdAt, updatedAt: createdAt, revision: 1, cancelledAt: null, stockRestored: false };
    state.store.sales.push(sale);
    if (receivedSatang > 0) addTransaction({ direction: "IN", amountSatang: receivedSatang, label: `รับเงินจริงจากบิล ${id}`, source: "STORE", sourceId: id, subtype: "SALE_INITIAL_RECEIPT", actionKey: `${id}:initial` });
    if (sale.outstandingSatang > 0) addQueue({ source: "STORE", sourceId: id, actionType: "RECEIVE_CUSTOMER_PAYMENT", status: sale.status, amountSatang: sale.outstandingSatang, due, effects: { complete: "เพิ่มเงินจริงและลดยอดค้าง", cancel: "ยกเลิกบิล คืนสต็อก และย้อนเงิน" } });
    closeModal(); await persistAndRender("สร้างบิลขายแล้ว");
  }});

  byId("addPurchaseBtn").onclick = () => openModal({ title: "รับสินค้าเข้า", text: "จ่ายทันทีจะหักเงินและจบ หากมีวันตรวจ/คืนของจึงส่งปฏิทิน", body: `<div class="form-grid"><div class="field full"><label>ชื่อรายการ</label><input id="buyName" maxlength="120" value="สินค้าลอตใหม่"></div><div class="field"><label>จำนวนชิ้น</label><input id="buyQty" type="number" min="1"></div><div class="field"><label>ต้นทุนรวม</label><input id="buyCost" type="number" min="0" step="0.01"></div><div class="field full"><label>วันตรวจ/คืนของ (ไม่บังคับ)</label><input id="buyDue" type="date"></div></div>`, confirm: "ซื้อและรับเข้า", onConfirm: async () => {
    const qty = parseQuantity(byId("buyQty").value, { label: "จำนวนรับเข้า" }), costSatang = parseMoneyToSatang(byId("buyCost").value, { allowZero: true, label: "ต้นทุน" }), due = byId("buyDue").value;
    if (state.store.stockQty + qty > MAX_QUANTITY) { toast("จำนวนสต็อกรวมเกินขอบเขต"); modalBusy = false; return; }
    parseSatang(Number(state.store.stockValueSatang || 0) + costSatang, { allowZero: true, label: "มูลค่าสต็อกรวม" });
    if (due && !validISODate(due)) { toast("วันตรวจ/คืนของไม่ถูกต้อง"); modalBusy = false; return; }
    const id = uid("BUY"), createdAt = nowIso();
    const purchase = { id, name: byId("buyName").value.trim() || "สินค้า", qty, costSatang, paidAmountSatang: costSatang, status: "ACTIVE", date: localISO(), createdAt, updatedAt: createdAt, revision: 1, cancelledAt: null };
    state.store.purchases.push(purchase); state.store.stockQty += qty; state.store.stockValueSatang += costSatang;
    if (costSatang > 0) addTransaction({ direction: "OUT", amountSatang: costSatang, label: `ซื้อสินค้า ${id}`, source: "STORE", sourceId: id, subtype: "PURCHASE_PAYMENT", actionKey: `${id}:purchase` });
    if (due) addQueue({ source: "STORE", sourceId: id, actionType: "PURCHASE_RETURN_WINDOW", amountSatang: costSatang, due, effects: { complete: "ปิดช่วงตรวจและเก็บสินค้า", cancel: "คืนสินค้าและคืนเงิน" } });
    closeModal(); await persistAndRender("รับสินค้าเข้าแล้ว");
  }});

  byId("withdrawStockBtn").onclick = () => openModal({ title: "เบิกสินค้า", text: "ตัดสต็อกโดยไม่เพิ่มยอดขายและไม่หักเงินซ้ำ", body: `<div class="form-grid"><div class="field"><label>จำนวนชิ้น</label><input id="withdrawQty" type="number" min="1"></div><div class="field"><label>เหตุผล</label><select id="withdrawReason"><option>ใช้เอง</option><option>แจก</option><option>ชำรุด</option><option>ตัวอย่างสินค้า</option><option>อื่น ๆ</option></select></div><div class="field full"><label>หมายเหตุ</label><input id="withdrawNote" maxlength="160"></div></div>`, confirm: "บันทึกการเบิก", onConfirm: async () => {
    const qty = parseQuantity(byId("withdrawQty").value, { label: "จำนวนเบิก" }); if (qty > state.store.stockQty) { toast("สต็อกไม่พอ"); modalBusy = false; return; }
    const costSatang = takeStockFromPool(state, qty);
    const createdAt = nowIso();
    state.store.withdrawals.push({ id: uid("WD"), qty, costSatang, reason: byId("withdrawReason").value, note: byId("withdrawNote").value.trim(), date: localISO(), createdAt, updatedAt: createdAt, revision: 1 });
    addAudit("STOCK_WITHDRAWN", `${qty} ชิ้น · ${byId("withdrawReason").value}`); closeModal(); await persistAndRender("บันทึกการเบิกแล้ว");
  }});

  byId("toggleRoundBtn").onclick = async () => {
    if (!state.ride.currentRound) { state.ride.currentRound = { id: uid("ROUND"), status: "ACTIVE", startedAt: nowIso(), endedAt: null, revision: 1, createdAt: nowIso(), updatedAt: nowIso() }; addAudit("RIDE_ROUND_STARTED", state.ride.currentRound.id); await persistAndRender("เริ่มรอบวิ่งแล้ว"); }
    else { const round = state.ride.currentRound; round.status = "ENDED"; round.endedAt = nowIso(); bumpSource(round); state.ride.rounds.push(round); state.ride.currentRound = null; addAudit("RIDE_ROUND_ENDED", round.id); await persistAndRender("จบรอบวิ่งแล้ว"); }
  };
  byId("addRideJobBtn").onclick = async () => {
    try {
      if (!state.ride.currentRound) return toast("เริ่มรอบก่อนเพิ่มงาน");
      const amountSatang = parseMoneyToSatang(byId("rideAmount").value, { allowZero: false, label: "รายได้งาน" }), distanceKm = Number(byId("rideKm").value), paymentMode = byId("ridePaymentMode").value;
      if (!Number.isFinite(distanceKm) || distanceKm <= 0 || !["CASH", "CREDIT"].includes(paymentMode)) return toast("กรอกระยะทางและรูปแบบรายได้");
      if (paymentMode === "CREDIT") parseSatang(Number(state.ride.creditBalanceSatang || 0) + amountSatang, { allowZero: true, label: "เครดิตงานรวม" });
      const id = uid("RIDE"), createdAt = nowIso();
      const job = { id, roundId: state.ride.currentRound.id, amountSatang, distanceKm, paymentMode, note: byId("rideNote").value.trim(), status: paymentMode === "CASH" ? "SETTLED" : "CREDIT", date: localISO(), createdAt, updatedAt: createdAt, revision: 1, cancelledAt: null };
      state.ride.jobs.push(job);
      if (paymentMode === "CASH") addTransaction({ direction: "IN", amountSatang, label: `เงินสดงานวิ่ง ${id}`, source: "RIDE", sourceId: id, subtype: "RIDE_CASH_INCOME", actionKey: `${id}:cash` });
      else state.ride.creditBalanceSatang += amountSatang;
      byId("rideAmount").value = ""; byId("rideKm").value = ""; byId("rideNote").value = "";
      await persistAndRender(paymentMode === "CASH" ? "บันทึกเงินสดเข้าการเงินแล้ว" : "เพิ่มเครดิตในแอปงานแล้ว");
    } catch (error) { toast(error.message || "ข้อมูลงานวิ่งไม่ถูกต้อง"); }
  };
  byId("withdrawRideCreditBtn").onclick = () => {
    if (state.ride.creditBalanceSatang <= 0) return toast("ไม่มีเครดิตให้เบิก");
    openModal({ title: "เบิกเครดิตจากแอปงาน", text: `เครดิตคงเหลือ ${money(state.ride.creditBalanceSatang)} บาท`, body: `<div class="form-grid"><div class="field"><label>ยอดที่เบิก</label><input id="creditWithdrawAmount" type="number" min="0.01" max="${satangToBaht(state.ride.creditBalanceSatang)}" step="0.01"></div><div class="field"><label>วันที่คาดว่าเงินเข้า</label><input id="creditWithdrawDue" type="date" value="${localISO()}"></div><div class="field full"><label>หมายเหตุ</label><input id="creditWithdrawNote" maxlength="120"></div></div>`, confirm: "ยืนยันการเบิก", onConfirm: async () => {
      const amountSatang = parseMoneyToSatang(byId("creditWithdrawAmount").value, { allowZero: false, label: "ยอดเบิกเครดิต" }), due = byId("creditWithdrawDue").value;
      if (amountSatang <= 0 || amountSatang > state.ride.creditBalanceSatang || !due) { toast("ตรวจยอดและวันที่"); modalBusy = false; return; }
      const id = uid("RCW"), createdAt = nowIso();
      const withdrawal = { id, amountSatang, due, note: byId("creditWithdrawNote").value.trim(), status: "PENDING", createdAt, updatedAt: createdAt, revision: 1, confirmedAt: null, cancelledAt: null };
      state.ride.creditBalanceSatang -= amountSatang; state.ride.creditWithdrawals.push(withdrawal);
      addQueue({ source: "RIDE", sourceId: id, actionType: "CONFIRM_RIDE_CREDIT_WITHDRAWAL", amountSatang, due, effects: { complete: "เพิ่มเงินจริงเข้าการเงิน", cancel: "คืนยอดกลับเครดิตคงเหลือ" } });
      closeModal(); await persistAndRender("ส่งยอดไปสถานะกำลังเบิกแล้ว");
    }});
  };
  byId("addRideExpenseBtn").onclick = () => openModal({ title: "ค่าใช้จ่ายรอบ", text: "หักเงินจริงทันที ไม่เข้าปฏิทิน", body: `<div class="form-grid"><div class="field full"><label>รายการ</label><input id="rideExpenseName" value="ค่าน้ำมัน"></div><div class="field"><label>จำนวนเงิน</label><input id="rideExpenseAmount" type="number" min="0" step="0.01"></div><div class="field"><label>ประเภท</label><select id="rideExpenseType"><option>น้ำมัน</option><option>ทางด่วน</option><option>จอดรถ</option><option>อื่น ๆ</option></select></div></div>`, confirm: "หักเงิน", onConfirm: async () => {
    const amountSatang = parseMoneyToSatang(byId("rideExpenseAmount").value, { allowZero: false, label: "ค่าใช้จ่ายงาน" }); if (amountSatang <= 0) { toast("กรอกยอด"); modalBusy = false; return; }
    const id = uid("REXP"), createdAt = nowIso(); state.ride.expenses.push({ id, roundId: state.ride.currentRound?.id || null, name: byId("rideExpenseName").value.trim() || "ค่าใช้จ่ายวิ่งงาน", type: byId("rideExpenseType").value, amountSatang, createdAt, updatedAt: createdAt, revision: 1 });
    addTransaction({ direction: "OUT", amountSatang, label: byId("rideExpenseName").value.trim() || "ค่าใช้จ่ายวิ่งงาน", source: "RIDE", sourceId: id, subtype: "DIRECT_EXPENSE", actionKey: `${id}:expense` }); closeModal(); await persistAndRender("หักค่าใช้จ่ายรอบแล้ว");
  }});

  byId("addOtherIncomeBtn").onclick = () => openModal({ title: "รายรับช่องทางอื่น", text: "ใช้เมื่อเงินจริงเข้ามาแล้ว และต้องระบุแหล่งที่มาเพื่อให้ตรวจย้อนหลังได้", body: `<div class="form-grid"><div class="field full"><label>รายละเอียดรายรับ</label><input id="otherIncomeName" maxlength="120" placeholder="เช่น รับจ้างพิเศษ หรือเงินคืน"></div><div class="field"><label>จำนวนเงิน</label><input id="otherIncomeAmount" type="number" min="0.01" step="0.01" inputmode="decimal"></div><div class="field"><label>แหล่งรายรับ</label><select id="otherIncomeSource"><option value="FREELANCE">งานรับจ้าง</option><option value="REFUND">เงินคืน</option><option value="SALE_OTHER">ขายของอื่น</option><option value="GIFT">ได้รับเงิน</option><option value="OTHER">อื่น ๆ</option></select></div><div class="field"><label>ช่องทางเงินเข้า</label><select id="otherIncomeChannel"><option value="TRANSFER">เงินโอน</option><option value="CASH">เงินสด</option><option value="OTHER">ช่องทางอื่น</option></select></div><div class="field full"><label>หมายเหตุ</label><input id="otherIncomeNote" maxlength="180"></div></div>`, confirm: "เพิ่มเงินเข้าการเงิน", onConfirm: async () => {
    const amountSatang = parseMoneyToSatang(byId("otherIncomeAmount").value, { allowZero: false, label: "รายรับอื่น" });
    const name = byId("otherIncomeName").value.trim();
    if (amountSatang <= 0 || !name) { toast("กรอกรายละเอียดและจำนวนเงิน"); modalBusy = false; return; }
    const sourceType = byId("otherIncomeSource").value;
    const channel = byId("otherIncomeChannel").value;
    const note = byId("otherIncomeNote").value.trim();
    const id = uid("OIN");
    addTransaction({ direction: "IN", amountSatang, label: name, source: "OTHER_INCOME", sourceId: id, subtype: `DIRECT_OTHER_INCOME:${sourceType}:${channel}${note ? `:${note}` : ""}`, actionKey: `${id}:income` });
    closeModal(); await persistAndRender("เพิ่มรายรับช่องทางอื่นเข้าการเงินแล้ว");
  }});

  byId("addDebtBtn").onclick = () => openModal({ title: "เพิ่มภาระ", text: "รายการตั้งแต่ 2 งวดขึ้นไปจะสร้างคิวทุกงวดในปฏิทิน", body: `<div class="form-grid"><div class="field full"><label>รายละเอียด</label><input id="debtName" maxlength="120" placeholder="เช่น ค่าซ่อมห้อง"></div><div class="field full"><label>หมายเหตุเพิ่มเติม</label><input id="debtDetail" maxlength="180"></div><div class="field"><label>ยอดรวม</label><input id="debtAmount" type="number" min="0.01" step="0.01"></div><div class="field"><label>จำนวนงวด</label><input id="debtInstallments" type="number" min="1" max="120" step="1" value="1"></div><div class="field full"><label>วันครบกำหนดงวดแรก</label><input id="debtDue" type="date" value="${localISO()}"></div></div>`, confirm: "เพิ่มภาระ", onConfirm: async () => {
    const originalSatang = parseMoneyToSatang(byId("debtAmount").value, { allowZero: false, label: "ยอดภาระ" }), installmentCount = Number(byId("debtInstallments").value), firstDue = byId("debtDue").value;
    if (!Number.isInteger(installmentCount) || installmentCount < 1 || installmentCount > MAX_INSTALLMENTS || originalSatang < installmentCount || !validISODate(firstDue)) { toast("ตรวจยอด จำนวนงวด 1–120 และวันครบกำหนด"); modalBusy = false; return; }
    const id = uid("OBL"), createdAt = nowIso(), amounts = splitInstallments(originalSatang, installmentCount);
    const obligation = { id, name: byId("debtName").value.trim() || "ภาระ", detail: byId("debtDetail").value.trim(), originalSatang, paidSatang: 0, remainingSatang: originalSatang, installmentCount, firstDue, installments: [], status: "OPEN", createdAt, updatedAt: createdAt, revision: 1, cancelledAt: null };
    state.ledger.obligations.push(obligation);
    amounts.forEach((amountSatang, index) => {
      const number = index + 1, due = addMonths(firstDue, index);
      const queue = addQueue({ source: "LEDGER", sourceId: id, actionType: installmentCount >= 2 ? "PAY_OBLIGATION_INSTALLMENT" : "PAY_OBLIGATION", amountSatang, due, effects: { complete: "หักเงินจริงและลดยอดภาระ", cancel: "ยกเลิกคิวและย้อนเฉพาะยอดที่จ่ายจากคิวนี้" } });
      queue.installmentNumber = number; queue.installmentCount = installmentCount;
      obligation.installments.push({ number, amountSatang, paidSatang: 0, due, status: "PENDING", queueId: queue.id, paidAt: null });
    });
    closeModal(); await persistAndRender(`เพิ่มภาระ ${installmentCount} งวดในปฏิทินแล้ว`);
  }});
  byId("addExpenseBtn").onclick = () => openModal({ title: "เพิ่มรายจ่าย", text: "รายการที่จ่ายแล้วจะหักเงินทันทีและไม่เข้าปฏิทิน", body: `<div class="form-grid"><div class="field full"><label>รายการ</label><input id="expenseName" maxlength="120"></div><div class="field"><label>จำนวนเงิน</label><input id="expenseAmount" type="number" min="0" step="0.01"></div><div class="field"><label>หมวด</label><select id="expenseCategory"><option value="GENERAL">ทั่วไป</option><option value="STORE">ร้านค้า</option><option value="RIDE">วิ่งงาน</option></select></div></div>`, confirm: "หักเงินทันที", onConfirm: async () => {
    const amountSatang = parseMoneyToSatang(byId("expenseAmount").value, { allowZero: false, label: "รายจ่าย" }); if (amountSatang <= 0) { toast("กรอกยอด"); modalBusy = false; return; }
    const source = byId("expenseCategory").value, id = uid("EXP"); addTransaction({ direction: "OUT", amountSatang, label: byId("expenseName").value.trim() || "รายจ่าย", source, sourceId: id, subtype: "DIRECT_EXPENSE", actionKey: `${id}:expense` }); closeModal(); await persistAndRender("หักรายจ่ายแล้ว");
  }});
}

async function unlockVaultWithKey(vault, key) {
  const decrypted = await decryptVault(vault, key);
  const compatibility = resolveYGPHCore().compatibilityFor(decrypted.schema);
  if (!compatibility.supported) throw new Error(`Schema ${decrypted.schema} ไม่รองรับ`);
  if (compatibility.mode === "MIGRATE") {
    const promoted = await promoteLegacyMigration(vault, key, decrypted);
    currentVault = promoted.vault;
    cryptoKey = key;
    state = promoted.state;
    lastDurableReadback = promoted.readback;
  } else {
    const core = resolveYGPHCore();
    const prepared = prepareSchema4SafetyRepair(decrypted, core, nowIso());
    validateState(prepared.state);
    validateStateInvariants(prepared.state, { quarantine: false });
    if (prepared.repaired) {
      const candidateVault = await encryptState(prepared.state, key, vault.kdf);
      const promoted = await promoteBackupCandidate({
        originalSchema: STATE_SCHEMA,
        compatibility,
        sourceVault: vault,
        candidateVault,
        state: prepared.state,
        key,
        promotionType: "SCHEMA4_SAFETY_REPAIR"
      });
      currentVault = promoted.vault;
      cryptoKey = key;
      state = promoted.state;
      lastDurableReadback = promoted.readback;
    } else {
      currentVault = vault;
      cryptoKey = key;
      state = prepared.state;
    }
  }
  failedUnlocks = 0; showApp();
}

function wireEvents() {
  byId("setupForm").addEventListener("submit", async event => {
    event.preventDefault(); const passphrase = byId("setupPassphrase").value;
    try {
      if (passphrase.length < 8) { byId("setupConfirm").setCustomValidity("รหัสต้องมีอย่างน้อย 8 ตัว"); byId("setupConfirm").reportValidity(); return; }
      if (passphrase !== byId("setupConfirm").value) { byId("setupConfirm").setCustomValidity("รหัสไม่ตรงกัน"); byId("setupConfirm").reportValidity(); return; }
      byId("setupConfirm").setCustomValidity("");
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const kdf = { name: "PBKDF2", hash: "SHA-256", iterations: PBKDF2_ITERATIONS, salt: bytesToBase64(salt) };
      const key = await deriveKey(passphrase, salt, kdf.iterations);
      const created = defaultState(parseMoneyToSatang(byId("setupPrice").value, { allowZero: true, label: "ราคาขายตั้งต้น" }), parseMoneyToSatang(byId("setupBalance").value, { allowZero: true, label: "เงินตั้งต้น" }));
      validateStateInvariants(created, { quarantine: true });
      const core = resolveYGPHCore();
      const setupAudit = created.audit[0];
      const setupPlan = {
        actionId: setupAudit.id,
        actor: "OWNER_LOCAL_UI",
        eventType: "SYSTEM_CREATED",
        sourceDomain: "CORE",
        sourceOwner: "OWNER",
        targetDomain: ["CORE", "STORE", "RIDE", "LEDGER", "CALENDAR"],
        correlationId: setupAudit.id,
        causationId: setupAudit.id,
        idempotencyKey: `setup:${created.createdAt}`,
        timestamp: created.createdAt,
        payloadVersion: 1,
        provenance: { releaseVersion: CORE_DATA_RELEASE_VERSION },
        sourceRevision: 0,
        expectedRevision: created.revision,
        changes: [],
        deletions: [],
        stateChanges: [{ path: "schema", before: null, after: STATE_SCHEMA }]
      };
      created.sync.appliedCommandKeys[setupPlan.idempotencyKey] = { actionId: setupPlan.actionId, eventType: setupPlan.eventType, sourceDomain: "CORE", appliedAt: created.createdAt, revision: created.revision };
      created.events.push(core.createEventEnvelope({ plan: setupPlan, nextState: created }));
      const vault = await encryptState(created, key, kdf);
      await dbPut(VAULT_KEY, vault);
      const storedVault = await dbGet(VAULT_KEY);
      const storedState = await decryptVault(storedVault, key);
      const durableHash = core.assertReadback(created, storedState);
      cryptoKey = key;
      currentVault = storedVault;
      state = storedState;
      lastDurableReadback = { status: "VERIFIED", verifiedAt: nowIso(), stateRevision: storedState.revision, durableHash };
      showApp();
    } catch (error) {
      byId("setupBalance").setCustomValidity(error.message || "ข้อมูลตั้งค่าไม่ถูกต้อง");
      byId("setupBalance").reportValidity();
      setTimeout(() => byId("setupBalance").setCustomValidity(""), 500);
    }
  });
  byId("unlockForm").addEventListener("submit", async event => {
    event.preventDefault(); const button = byId("unlockBtn"); button.disabled = true; button.textContent = "กำลังปลดล็อก…";
    try {
      const vault = await dbGet(VAULT_KEY); const salt = base64ToBytes(vault.kdf.salt);
      const key = await deriveKey(byId("unlockPassphrase").value, salt, vault.kdf.iterations);
      await unlockVaultWithKey(vault, key);
    } catch (error) {
      failedUnlocks++; console.warn(error); byId("unlockStatus").textContent = failedUnlocks >= 5 ? "รหัสไม่ถูกต้อง กรุณารอสักครู่แล้วลองใหม่" : "รหัสไม่ถูกต้องหรือข้อมูลเสียหาย";
      if (failedUnlocks >= 5) { button.disabled = true; setTimeout(() => { failedUnlocks = 0; button.disabled = false; }, 30000); }
    } finally { button.textContent = "ปลดล็อก"; if (failedUnlocks < 5) button.disabled = false; }
  });
  byId("headerHome").onclick = () => showPage("home"); byId("headerLockBtn").onclick = () => lockApp();
  $$('[data-page]').forEach(button => button.onclick = () => showPage(button.dataset.page));
  $$('[data-filter]').forEach(button => button.onclick = () => { queueFilter = button.dataset.filter; $$('.filter-btn').forEach(item => item.classList.toggle('active', item === button)); renderCalendar(); });
  byId("prevMonth").onclick = () => { const [y, m] = calendarMonth.split("-").map(Number); const date = new Date(y, m - 2, 1); calendarMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`; selectedDate = null; renderCalendar(); };
  byId("nextMonth").onclick = () => { const [y, m] = calendarMonth.split("-").map(Number); const date = new Date(y, m, 1); calendarMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`; selectedDate = null; renderCalendar(); };
  byId("clearDateFilter").onclick = () => { selectedDate = null; renderCalendar(); };
  byId("modalCancel").onclick = closeModal; byId("modal").onclick = event => { if (event.target.id === "modal") closeModal(); };
  byId("modalConfirm").onclick = async () => { if (modalBusy) return; modalBusy = true; try { await modalHandler?.(); } catch (error) { console.error(error); toast(error.message || "ดำเนินการไม่สำเร็จ"); } finally { setTimeout(() => { modalBusy = false; }, 250); } };
  ["exportJsonBtn", "homeExportBtn"].forEach(id => byId(id).onclick = downloadExport);
  ["importProposalBtn", "homeImportBtn"].forEach(id => byId(id).onclick = () => { showPage("sync"); byId("importProposalInput").click(); });
  byId("importProposalInput").onchange = async () => {
    try { const file = byId("importProposalInput").files[0]; if (!file) return; state.sync.pendingImport = validateImportProposal(JSON.parse(await file.text())); renderAll(); toast("อ่านไฟล์แล้ว กรุณาตรวจรายการ · ยังไม่เขียนข้อมูล"); }
    catch (error) { toast(error.message || "ไฟล์ไม่รองรับ"); }
    byId("importProposalInput").value = "";
  };
  byId("cancelImportBtn").onclick = cancelPendingImport;
  byId("applyImportBtn").onclick = applyPendingImport;
  byId("buildReportBtn").onclick = buildReportFromControls;
  byId("downloadReportBtn").onclick = downloadReport;
  byId("verifyBalanceBtn").onclick = () => promptVerifyBalance(false);
  byId("settingsForm").onsubmit = async event => { event.preventDefault(); try { state.settings.defaultPriceSatang = parseMoneyToSatang(byId("defaultPrice").value, { allowZero: true, label: "ราคาขายตั้งต้น" }); state.settings.lowStockThreshold = Math.max(0, Math.trunc(Number(byId("lowStockThreshold").value))); state.settings.lockMinutes = Math.max(1, Math.trunc(Number(byId("lockMinutes").value))); state.settings.themeColor = byId("themeColor").value; await persistAndRender("บันทึกการตั้งค่าแล้ว"); } catch (error) { toast(error.message || "การตั้งค่าไม่ถูกต้อง"); } };
  byId("exportBackupBtn").onclick = async () => { const vault = await dbGet(VAULT_KEY); downloadJson({ backupFormat: "stock-pocket-encrypted-backup", backupVersion: 1, exportedAt: nowIso(), releaseVersion: CORE_DATA_RELEASE_VERSION, vault }, `YGPH-encrypted-backup-${localISO()}.json`); toast("ส่งออกไฟล์สำรองแล้ว"); };
  byId("restoreBackupBtn").onclick = () => byId("restoreBackupInput").click();
  byId("restoreBackupInput").onchange = async () => { try { await importBackupFile(byId("restoreBackupInput").files[0]); } catch (error) { toast(error.message || "กู้คืนไม่สำเร็จ"); } byId("restoreBackupInput").value = ""; };
  byId("restoreFromLockBtn").onclick = () => byId("restoreFromLockInput").click();
  byId("restoreFromLockInput").onchange = async () => { try { await importBackupFile(byId("restoreFromLockInput").files[0]); } catch (error) { byId("unlockStatus").textContent = error.message || "กู้คืนไม่สำเร็จ"; } byId("restoreFromLockInput").value = ""; };
  byId("changePassBtn").onclick = () => openModal({ title: "เปลี่ยนรหัสปลดล็อก", text: "ต้องรู้รหัสปัจจุบัน", body: `<div class="field"><label>รหัสปัจจุบัน</label><input id="currentPass" type="password"></div><div class="field"><label>รหัสใหม่</label><input id="newPass" type="password" minlength="8"></div><div class="field"><label>ยืนยันรหัสใหม่</label><input id="newPassConfirm" type="password" minlength="8"></div>`, confirm: "เปลี่ยนรหัส", onConfirm: changePassphrase });
  byId("persistBtn").onclick = async () => { if (!navigator.storage?.persist) return toast("เบราว์เซอร์ไม่รองรับ"); toast(await navigator.storage.persist() ? "อนุญาตพื้นที่ถาวรแล้ว" : "เบราว์เซอร์ยังไม่อนุญาต"); };
  byId("installBtn").onclick = async () => { if (!deferredInstallPrompt) return; deferredInstallPrompt.prompt(); await deferredInstallPrompt.userChoice; deferredInstallPrompt = null; byId("installBtn").disabled = true; };
  ["pointerdown", "keydown", "touchstart"].forEach(name => document.addEventListener(name, registerActivity, { passive: true }));
  document.addEventListener("visibilitychange", () => { if (document.hidden) { hiddenAt = Date.now(); byId("privacyCover").classList.remove("hidden"); } else { byId("privacyCover").classList.add("hidden"); if (state && !trustedDeviceActive && hiddenAt && Date.now() - hiddenAt > 30000) lockApp("ล็อกหลังออกจากแอปเกิน 30 วินาที"); hiddenAt = null; } });
  setupActions();
}

async function importBackupFile(file) {
  if (!file) throw new Error("ไม่พบไฟล์");
  const parsed = JSON.parse(await file.text());
  resolveYGPHCore().validateBackupEnvelope(parsed);
  pendingBackupCandidate = null;
  openModal({
    title: "ตรวจไฟล์สำรองก่อนกู้คืน",
    text: "ขั้นนี้ยังไม่เขียนข้อมูล กรุณาใส่รหัสของไฟล์สำรองเพื่อเปิดและตรวจ",
    body: '<div class="field"><label>รหัสของไฟล์สำรอง</label><input id="backupCandidatePassphrase" type="password" autocomplete="current-password"></div><div class="flow-note">ระบบจะตรวจ Schema 1–4, ยอดเงิน, สต็อก, คิว และ Source ก่อนแสดงตัวอย่าง</div>',
    confirm: "เปิดและตรวจไฟล์",
    onConfirm: async () => {
      const passphrase = byId("backupCandidatePassphrase").value;
      const candidate = await inspectBackupCandidate(parsed, passphrase);
      pendingBackupCandidate = candidate;
      closeModal({ preserveBackupCandidate: true });
      const preview = candidate.preview;
      const route = preview.mode === "MIGRATE" ? `Schema ${preview.sourceSchema} → ${preview.targetSchema}` : `Schema ${preview.targetSchema}`;
      const warnings = preview.warnings.length
        ? `<div class="blocked-note"><b>รายการที่ต้องตรวจ</b>${preview.warnings.map(item => `<div>• ${esc(item)}</div>`).join("")}</div>`
        : '<div class="flow-note"><b>ผลตรวจ:</b> ไม่พบข้อผิดพลาดที่ขวางการกู้คืน</div>';
      openModal({
        title: "ตัวอย่างก่อนกู้คืน",
        text: `${route} · ยังไม่มีข้อมูลเดิมเปลี่ยน`,
        body: `<div class="create-summary"><div><small>เงินตาม Ledger</small><b>${money(preview.balanceSatang)} บาท</b></div><div><small>มูลค่าสต็อก</small><b>${money(preview.stockValueSatang)} บาท</b></div><div><small>สต็อก</small><b>${numberFmt(preview.stockQty)} ชิ้น</b></div><div><small>ลูกหนี้</small><b>${money(preview.receivableSatang)} บาท</b></div><div><small>ธุรกรรม</small><b>${preview.records.transactions} รายการ</b></div><div><small>คิวเปิด/VERIFY</small><b>${preview.queue.open}/${preview.queue.verify}</b></div></div>${warnings}<div class="flow-note">เมื่อยืนยัน ระบบจะเก็บ Vault ปัจจุบันเป็น Rollback Snapshot ก่อน แล้วจึงกู้คืนแบบ Atomic และอ่านกลับตรวจอีกครั้ง</div>`,
        confirm: "ยืนยันกู้คืน",
        onConfirm: async () => {
          if (!pendingBackupCandidate) throw new Error("ตัวอย่างหมดอายุ กรุณาเลือกไฟล์ใหม่");
          const promoted = await promoteBackupCandidate(pendingBackupCandidate);
          cryptoKey = promoted.key;
          currentVault = promoted.vault;
          state = promoted.state;
          lastDurableReadback = promoted.readback;
          pendingBackupCandidate = null;
          closeModal();
          failedUnlocks = 0;
          showApp();
          toast("กู้คืนสำเร็จ · Snapshot และอ่านกลับแล้ว");
        }
      });
    }
  });
}
async function changePassphrase() {
  const current = byId("currentPass").value, next = byId("newPass").value, confirm = byId("newPassConfirm").value;
  if (next.length < 8 || next !== confirm) { toast("ตรวจรหัสใหม่"); modalBusy = false; return; }
  const previousVault = await dbGet(VAULT_KEY);
  const oldKey = await deriveKey(current, base64ToBytes(previousVault.kdf.salt), previousVault.kdf.iterations);
  const before = await decryptVault(previousVault, oldKey);
  const salt = crypto.getRandomValues(new Uint8Array(16)); const kdf = { name: "PBKDF2", hash: "SHA-256", iterations: PBKDF2_ITERATIONS, salt: bytesToBase64(salt) };
  const newKey = await deriveKey(next, salt, kdf.iterations);
  const proposed = clone(state);
  const changedAt = nowIso();
  proposed.audit.unshift({ id: uid("AUD"), at: changedAt, event: "PASSPHRASE_CHANGED", note: "เปลี่ยนรหัสสำเร็จ" });
  const result = await commitStateAtomic({
    core: resolveYGPHCore(),
    beforeState: before,
    proposedState: proposed,
    previousVault,
    commandContext: {
      eventType: "PASSPHRASE_CHANGED",
      sourceDomain: "CORE",
      sourceOwner: "OWNER",
      targetDomain: ["CORE"],
      idempotencyKey: `passphrase-change:${changedAt}`,
      timestamp: changedAt
    },
    prepareState: candidate => {
      if (candidate.sync?.flow) delete candidate.sync.flow.lastReadbackRuntime;
      repairSafeStateInvariants(candidate);
      validateStateInvariants(candidate, { quarantine: true });
      return candidate;
    },
    encrypt: candidate => encryptState(candidate, newKey, kdf),
    writeVault: vault => dbPut(VAULT_KEY, vault),
    readVault: () => dbGet(VAULT_KEY),
    decrypt: vault => decryptVault(vault, newKey),
    restoreVault: vault => dbPut(VAULT_KEY, vault)
  });
  cryptoKey = newKey;
  currentVault = result.vault;
  state = result.state;
  lastDurableReadback = result.readback;
  await rememberTrustedDevice(currentVault, cryptoKey);
  closeModal();
  renderAll();
  toast("เปลี่ยนรหัสแล้ว · ตรวจอ่านกลับแล้ว");
}

function serviceWorkerMessage(target, type, timeoutMs = 8000) {
  if (!target) return Promise.reject(new Error("Service Worker ยังไม่พร้อม"));
  return new Promise((resolve, reject) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => reject(new Error("Service Worker ไม่ตอบกลับ")), timeoutMs);
    channel.port1.onmessage = event => {
      clearTimeout(timer);
      if (event.data?.ok === false) reject(new Error(event.data.error || "Service Worker ทำงานไม่สำเร็จ"));
      else resolve(event.data || {});
    };
    target.postMessage({ type }, [channel.port2]);
  });
}

function renderServiceWorkerStatus(message = "") {
  const target = byId("swUpdateStatus");
  if (!target) return;
  const waiting = serviceWorkerRegistration?.waiting || null;
  const usingPrevious = Boolean(serviceWorkerStatus?.usingPrevious);
  const canRollback = Boolean(serviceWorkerStatus?.canRollback);
  if (message) target.textContent = message;
  else if (waiting) target.textContent = "มีรุ่นใหม่พร้อมแล้ว ข้อมูลเดิมยังไม่เปลี่ยน กด ‘ใช้รุ่นใหม่’ เมื่อต้องการ";
  else if (usingPrevious) target.textContent = "กำลังใช้ไฟล์รุ่นก่อนหน้า ข้อมูลในเครื่องยังอยู่เหมือนเดิม";
  else if (serviceWorkerStatus?.lifecycle?.current) target.textContent = canRollback ? "กำลังใช้รุ่นล่าสุด และยังย้อนกลับรุ่นก่อนได้" : "กำลังใช้รุ่นล่าสุด พร้อมใช้งานออฟไลน์";
  else target.textContent = "ติดตั้งไฟล์ออฟไลน์แล้ว จะพร้อมเต็มรูปแบบหลังเปิดแอปครั้งถัดไป";

  if (byId("activateUpdateBtn")) byId("activateUpdateBtn").disabled = !waiting;
  if (byId("rollbackUpdateBtn")) byId("rollbackUpdateBtn").disabled = !canRollback || usingPrevious;
  if (byId("activateCurrentVersionBtn")) byId("activateCurrentVersionBtn").disabled = !usingPrevious;
}

async function refreshServiceWorkerStatus() {
  const controller = navigator.serviceWorker?.controller;
  if (!controller) {
    renderServiceWorkerStatus();
    return null;
  }
  serviceWorkerStatus = await serviceWorkerMessage(controller, "GET_UPDATE_STATUS");
  renderServiceWorkerStatus();
  if (state) renderSettings();
  return serviceWorkerStatus;
}

function watchInstallingWorker(worker) {
  if (!worker) return;
  const update = () => {
    if (worker.state === "installed") renderServiceWorkerStatus(navigator.serviceWorker.controller
      ? "มีรุ่นใหม่พร้อมแล้ว ข้อมูลเดิมยังไม่เปลี่ยน กด ‘ใช้รุ่นใหม่’ เมื่อต้องการ"
      : "ติดตั้งไฟล์ออฟไลน์แล้ว จะพร้อมหลัง Service Worker เริ่มทำงาน");
    else if (worker.state === "redundant") renderServiceWorkerStatus("อัปเดตไม่สำเร็จ ยังใช้รุ่นเดิมอยู่");
  };
  worker.addEventListener("statechange", update);
  update();
}

async function setupServiceWorkerLifecycle() {
  const supported = "serviceWorker" in navigator && (location.protocol === "https:" || ["localhost", "127.0.0.1"].includes(location.hostname));
  if (!supported) {
    renderServiceWorkerStatus("เบราว์เซอร์นี้ยังใช้ระบบออฟไลน์ไม่ได้");
    return;
  }

  serviceWorkerRegistration = await navigator.serviceWorker.register("sw.js", { updateViaCache: "none" });
  watchInstallingWorker(serviceWorkerRegistration.installing);
  serviceWorkerRegistration.addEventListener("updatefound", () => watchInstallingWorker(serviceWorkerRegistration.installing));
  navigator.serviceWorker.addEventListener("message", event => {
    if (event.data?.type === "UPDATE_STATUS") {
      serviceWorkerStatus = event.data;
      renderServiceWorkerStatus();
    }
  });
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloadForServiceWorker) location.reload();
    else refreshServiceWorkerStatus().catch(console.warn);
  });

  const checkUpdateButton = byId("checkUpdateBtn");
  const activateUpdateButton = byId("activateUpdateBtn");
  const rollbackUpdateButton = byId("rollbackUpdateBtn");
  const activateCurrentButton = byId("activateCurrentVersionBtn");
  if (checkUpdateButton) checkUpdateButton.onclick = async () => {
    try {
      renderServiceWorkerStatus("กำลังตรวจอัปเดต");
      await serviceWorkerRegistration.update();
      setTimeout(() => refreshServiceWorkerStatus().catch(console.warn), 500);
    } catch (error) {
      renderServiceWorkerStatus(`ตรวจอัปเดตไม่สำเร็จ: ${error.message}`);
    }
  };
  if (activateUpdateButton) activateUpdateButton.onclick = () => {
    const waiting = serviceWorkerRegistration.waiting;
    if (!waiting) return renderServiceWorkerStatus("ยังไม่มีรุ่นใหม่รอใช้งาน");
    reloadForServiceWorker = true;
    renderServiceWorkerStatus("กำลังเปลี่ยนเป็นรุ่นใหม่");
    waiting.postMessage({ type: "ACTIVATE_UPDATE" });
  };
  if (rollbackUpdateButton) rollbackUpdateButton.onclick = async () => {
    try {
      renderServiceWorkerStatus("กำลังย้อนกลับรุ่นก่อนหน้า");
      await serviceWorkerMessage(navigator.serviceWorker.controller, "ROLLBACK_UPDATE");
      location.reload();
    } catch (error) {
      renderServiceWorkerStatus(error.message);
    }
  };
  if (activateCurrentButton) activateCurrentButton.onclick = async () => {
    try {
      renderServiceWorkerStatus("กำลังกลับมาใช้รุ่นล่าสุด");
      await serviceWorkerMessage(navigator.serviceWorker.controller, "ACTIVATE_CURRENT_CACHE");
      location.reload();
    } catch (error) {
      renderServiceWorkerStatus(error.message);
    }
  };

  renderServiceWorkerStatus();
  await refreshServiceWorkerStatus().catch(() => null);
}

async function init() {
  wireEvents();
  byId("reportStart").value = localISO(); byId("reportEnd").value = localISO();
  if (!window.isSecureContext || !window.crypto?.subtle || !window.indexedDB) { showOnly("securityGate"); return; }
  try {
    db = await openDb();
    const vault = await dbGet(VAULT_KEY);
    if (!vault) {
      showSetup();
    } else {
      const trustedUnlocked = await tryTrustedDeviceUnlock(vault);
      if (!trustedUnlocked) showUnlock();
    }
  }
  catch (error) { console.error(error); showOnly("securityGate"); }
  setupServiceWorkerLifecycle().catch(error => renderServiceWorkerStatus(`ระบบออฟไลน์เริ่มไม่สำเร็จ: ${error.message}`));
  window.addEventListener("beforeinstallprompt", event => { event.preventDefault(); deferredInstallPrompt = event; byId("installBtn").disabled = false; byId("installHint").textContent = "พร้อมติดตั้งเป็นแอปบนมือถือ"; });
  window.addEventListener("appinstalled", () => { byId("installHint").textContent = "ติดตั้งแล้ว"; byId("installBtn").disabled = true; });
  const tick = () => { byId("clock").textContent = new Date().toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", timeZone: TZ }).replace(".", ":"); };
  tick(); setInterval(tick, 30000);
}


if (typeof module === "object" && module.exports) {
  module.exports = {
    commitStateAtomic,
    writeVaultWithSnapshot,
    deriveKey,
    encryptState,
    decryptVault,
    inspectBackupCandidate,
    promoteBackupCandidate,
    backupPreviewForState,
    migrateStateToCurrent,
    applyLegacySchema3ReceivablePatch,
    prepareSchema4SafetyRepair
  };
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  init().catch(error => {
    console.error(error);
    showOnly("securityGate");
  });
}
