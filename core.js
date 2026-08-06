export const RELEASE_VERSION = '0.1.0-preview.3';
export const STATE_SCHEMA = 4;
export const DB_NAME = 'stock-pocket-secure';
export const DB_VERSION = 1;
export const DB_STORE = 'kv';
export const VAULT_KEY = 'vault';
export const VAULT_VERSION = 1;
export const PBKDF2_ITERATIONS = 600000;
export const TIME_ZONE = 'Asia/Bangkok';
export const MAX_ALLOWED_SATANG = 10_000_000_000;
export const MAX_QUANTITY = 1_000_000;

export function nowIso() {
  return new Date().toISOString();
}

export function createId(prefix = 'ID') {
  const random = globalThis.crypto?.getRandomValues
    ? globalThis.crypto.getRandomValues(new Uint32Array(1))[0].toString(36)
    : Math.floor(Math.random() * 0xffffffff).toString(36);
  return `${prefix}-${Date.now().toString(36)}-${random}`;
}

export function parseSatang(value, { allowZero = true, maximum = MAX_ALLOWED_SATANG, label = 'จำนวนเงิน' } = {}) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || !Number.isSafeInteger(amount)) {
    throw new Error(`${label}ไม่ใช่จำนวนสตางค์ที่ถูกต้อง`);
  }
  if (amount < 0 || (!allowZero && amount === 0)) {
    throw new Error(`${label}ต้อง${allowZero ? 'ไม่ติดลบ' : 'มากกว่า 0'}`);
  }
  if (amount > maximum) throw new Error(`${label}เกินขอบเขตที่ระบบรองรับ`);
  return amount;
}

export function parseBahtToSatang(value, { allowZero = true, maximum = MAX_ALLOWED_SATANG, label = 'จำนวนเงิน' } = {}) {
  const text = String(value ?? '').trim();
  if (!text) {
    if (allowZero) return 0;
    throw new Error(`กรอก${label}`);
  }
  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) {
    if (text.startsWith('-')) throw new Error(`${label}ไม่ถูกต้อง`);
    throw new Error(`${label}ต้องเป็นตัวเลขและมีทศนิยมไม่เกิน 2 ตำแหน่ง`);
  }
  const satang = Math.round(Number(text) * 100);
  return parseSatang(satang, { allowZero, maximum, label });
}

export function parseQuantity(value, { allowZero = false, maximum = MAX_QUANTITY, label = 'จำนวน' } = {}) {
  const quantity = Number(value);
  if (!Number.isSafeInteger(quantity) || quantity < 0 || (!allowZero && quantity === 0)) {
    throw new Error(`${label}ต้องเป็นจำนวนเต็ม${allowZero ? 'ที่ไม่ติดลบ' : 'มากกว่า 0'}`);
  }
  if (quantity > maximum) throw new Error(`${label}เกินขอบเขตที่ระบบรองรับ`);
  return quantity;
}

export function formatSatang(value) {
  const amount = parseSatang(Number(value ?? 0));
  return new Intl.NumberFormat('th-TH', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount / 100);
}

export function isValidISODate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function dateKey(value = new Date(), timeZone = TIME_ZONE) {
  if (typeof value === 'string' && isValidISODate(value)) return value;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error('วันที่ไม่ถูกต้อง');
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

export function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function createDefaultState({
  now = nowIso(),
  defaultPriceSatang = 80000,
  openingBalanceSatang = 0,
} = {}) {
  parseSatang(defaultPriceSatang, { label: 'ราคาตั้งต้น' });
  parseSatang(openingBalanceSatang, { label: 'ยอดยกมา' });
  return {
    schema: STATE_SCHEMA,
    revision: 1,
    createdAt: now,
    updatedAt: now,
    settings: {
      defaultPriceSatang,
      lockMinutes: 5,
      lowStockThreshold: 3,
      themeColor: 'violet',
    },
    store: {
      stockQty: 0,
      stockValueSatang: 0,
      sales: [],
      purchases: [],
      withdrawals: [],
    },
    ride: {
      currentRound: null,
      rounds: [],
      jobs: [],
      expenses: [],
      creditBalanceSatang: 0,
      creditWithdrawals: [],
    },
    ledger: {
      openingBalanceSatang,
      balanceVerified: true,
      verifiedAt: now,
      transactions: [],
      obligations: [],
    },
    calendar: [],
    audit: [{
      id: createId('AUD'),
      at: now,
      event: 'SYSTEM_CREATED',
      note: `YGPH METROPOLIS ${RELEASE_VERSION}`,
    }],
    sync: {
      lastExportAt: null,
      lastImportAt: null,
      pendingImport: null,
      lastBatchId: null,
    },
    migration: {
      fromSchema: null,
      migratedAt: null,
      sourceRelease: null,
    },
  };
}

function validateRecordList(value, path, errors) {
  if (!Array.isArray(value)) {
    errors.push(`${path} ต้องเป็นรายการ`);
    return;
  }
  const ids = new Set();
  for (const item of value) {
    if (!item || typeof item !== 'object') {
      errors.push(`${path} มีรายการที่ไม่ถูกต้อง`);
      continue;
    }
    if (!item.id) errors.push(`${path} มีรายการไม่มี id`);
    if (item.id && ids.has(item.id)) errors.push(`${path} มี id ซ้ำ ${item.id}`);
    ids.add(item.id);
  }
}

export function validateState(state) {
  const errors = [];
  if (!state || typeof state !== 'object') return { ok: false, errors: ['State ไม่ถูกต้อง'] };
  if (state.schema !== STATE_SCHEMA) errors.push(`รองรับ schema ${STATE_SCHEMA} เท่านั้น`);
  if (!Number.isSafeInteger(state.revision) || state.revision < 1) errors.push('revision ไม่ถูกต้อง');
  try { parseQuantity(state.store?.stockQty ?? -1, { allowZero: true, label: 'สต็อก' }); } catch (error) { errors.push(error.message); }
  try { parseSatang(state.store?.stockValueSatang ?? -1, { label: 'มูลค่าสต็อก' }); } catch (error) { errors.push(error.message); }
  try { parseSatang(state.ride?.creditBalanceSatang ?? -1, { label: 'เครดิตงานวิ่ง' }); } catch (error) { errors.push(error.message); }
  try { parseSatang(state.ledger?.openingBalanceSatang ?? -1, { label: 'ยอดยกมา' }); } catch (error) { errors.push(error.message); }
  validateRecordList(state.store?.sales, 'store.sales', errors);
  validateRecordList(state.store?.purchases, 'store.purchases', errors);
  validateRecordList(state.store?.withdrawals, 'store.withdrawals', errors);
  validateRecordList(state.ride?.rounds, 'ride.rounds', errors);
  validateRecordList(state.ride?.jobs, 'ride.jobs', errors);
  validateRecordList(state.ride?.expenses, 'ride.expenses', errors);
  validateRecordList(state.ride?.creditWithdrawals, 'ride.creditWithdrawals', errors);
  validateRecordList(state.ledger?.transactions, 'ledger.transactions', errors);
  validateRecordList(state.ledger?.obligations, 'ledger.obligations', errors);
  validateRecordList(state.calendar, 'calendar', errors);
  validateRecordList(state.audit, 'audit', errors);

  const actionKeys = new Set();
  for (const tx of state.ledger?.transactions ?? []) {
    try { parseSatang(tx.amountSatang, { allowZero: false, label: `ธุรกรรม ${tx.id}` }); } catch (error) { errors.push(error.message); }
    if (!['IN', 'OUT'].includes(tx.direction)) errors.push(`ธุรกรรม ${tx.id} มีทิศทางไม่ถูกต้อง`);
    if (!tx.actionKey) errors.push(`ธุรกรรม ${tx.id} ไม่มี actionKey`);
    if (tx.actionKey && actionKeys.has(tx.actionKey)) errors.push(`actionKey ซ้ำ ${tx.actionKey}`);
    actionKeys.add(tx.actionKey);
  }

  return { ok: errors.length === 0, errors };
}


export function normalizeState(input) {
  const state = structuredClone(input || {});
  state.schema = Number(state.schema || STATE_SCHEMA);
  state.revision = Number(state.revision || 1);
  state.createdAt ||= nowIso();
  state.updatedAt ||= state.createdAt;
  state.settings ||= {};
  state.settings.defaultPriceSatang = Number(state.settings.defaultPriceSatang ?? 80000);
  state.settings.lockMinutes = Number(state.settings.lockMinutes ?? 5);
  state.settings.lowStockThreshold = Number(state.settings.lowStockThreshold ?? 3);
  state.settings.themeColor ||= 'violet';
  state.store ||= {};
  state.store.stockQty = Number(state.store.stockQty || 0);
  state.store.stockValueSatang = Number(state.store.stockValueSatang || 0);
  state.store.sales = Array.isArray(state.store.sales) ? state.store.sales : [];
  state.store.purchases = Array.isArray(state.store.purchases) ? state.store.purchases : [];
  state.store.withdrawals = Array.isArray(state.store.withdrawals) ? state.store.withdrawals : [];
  state.ride ||= {};
  state.ride.currentRound ||= null;
  state.ride.rounds = Array.isArray(state.ride.rounds) ? state.ride.rounds : [];
  state.ride.jobs = Array.isArray(state.ride.jobs) ? state.ride.jobs : [];
  state.ride.expenses = Array.isArray(state.ride.expenses) ? state.ride.expenses : [];
  state.ride.creditBalanceSatang = Number(state.ride.creditBalanceSatang || 0);
  state.ride.creditWithdrawals = Array.isArray(state.ride.creditWithdrawals) ? state.ride.creditWithdrawals : [];
  state.ledger ||= {};
  state.ledger.openingBalanceSatang = Number(state.ledger.openingBalanceSatang || 0);
  state.ledger.balanceVerified = Boolean(state.ledger.balanceVerified ?? true);
  state.ledger.verifiedAt ||= state.createdAt;
  state.ledger.transactions = Array.isArray(state.ledger.transactions) ? state.ledger.transactions : [];
  state.ledger.obligations = Array.isArray(state.ledger.obligations) ? state.ledger.obligations : [];
  state.calendar = Array.isArray(state.calendar) ? state.calendar : [];
  state.audit = Array.isArray(state.audit) ? state.audit : [];
  state.sync ||= { lastExportAt: null, lastImportAt: null, pendingImport: null, lastBatchId: null };
  state.migration ||= { fromSchema: null, migratedAt: null, sourceRelease: null };
  return state;
}

export function ledgerBalanceSatang(state) {
  const opening = Number(state?.ledger?.openingBalanceSatang || 0);
  return (state?.ledger?.transactions || []).reduce((balance, tx) => {
    if (tx.status === 'CANCELLED') return balance;
    return balance + (tx.direction === 'IN' ? tx.amountSatang : -tx.amountSatang);
  }, opening);
}
