"use strict";

/*
  YGPH Highway Gate v2.0.1
  Pure command and evidence core for the local encrypted vault.

  This file intentionally has no DOM, IndexedDB, rendering, or app globals.
  It is loaded as window.YGPHCore in the browser and module.exports in tests.
*/

(function exposeCore(root, factory) {
  const core = factory();
  if (typeof module === "object" && module.exports) module.exports = core;
  if (root) root.YGPHCore = core;
})(typeof globalThis !== "undefined" ? globalThis : this, function createCore() {
  const VERSION = "2.0.1";
  const STATE_SCHEMA = 4;
  const MAX_ALLOWED_SATANG = 10_000_000_000;
  const ALLOWED_DOMAINS = new Set(["STORE", "RIDE", "LEDGER", "CALENDAR", "AUDIT", "CORE", "SYSTEM"]);
  const ALLOWED_TRANSACTION_SOURCES = new Set(["STORE", "RIDE", "LEDGER", "GENERAL", "OTHER_INCOME"]);
  const LINKED_TRANSACTION_SUBTYPES = new Set([
    "PURCHASE_PAYMENT",
    "SALE_INITIAL_RECEIPT",
    "SALE_RECEIPT",
    "RECEIVABLE_RECLASSIFICATION",
    "RIDE_CASH_INCOME",
    "RIDE_CREDIT_WITHDRAWAL",
    "RIDE_INCOME",
    "OBLIGATION_PAYMENT"
  ]);
  const QUEUE_STATUSES = new Set(["OPEN", "VERIFY", "PARTIAL", "COMPLETED", "CANCELLED"]);
  const PROTECTED_COLLECTIONS = [
    ["store", "sales", "STORE", "SALE"],
    ["store", "purchases", "STORE", "PURCHASE"],
    ["store", "withdrawals", "STORE", "STOCK_WITHDRAWAL"],
    ["store", "adjustments", "STORE", "STOCK_ADJUSTMENT", "adjustmentId"],
    ["ride", "rounds", "RIDE", "RIDE_ROUND"],
    ["ride", "jobs", "RIDE", "RIDE_JOB"],
    ["ride", "expenses", "RIDE", "RIDE_EXPENSE"],
    ["ride", "creditWithdrawals", "RIDE", "CREDIT_WITHDRAWAL"],
    ["ledger", "transactions", "LEDGER", "TRANSACTION"],
    ["ledger", "obligations", "LEDGER", "OBLIGATION"],
    [null, "calendar", "CALENDAR", "CALENDAR_ACTION"],
    [null, "audit", "AUDIT", "AUDIT_EVENT"],
    [null, "events", "CORE", "EVENT_ENVELOPE", "eventId"]
  ];

  function clone(value) {
    if (typeof structuredClone === "function") return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
  }

  function stable(value) {
    if (value === undefined) return "undefined";
    if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
    if (value && typeof value === "object") {
      return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
    }
    return JSON.stringify(value);
  }

  function hash(value) {
    const text = stable(value);
    let result = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
      result ^= text.charCodeAt(index);
      result = Math.imul(result, 16777619);
    }
    return `fnv1a-${(result >>> 0).toString(16).padStart(8, "0")}`;
  }

  function changed(before, after) {
    return hash(before) !== hash(after);
  }

  function makeId(prefix) {
    let random = "";
    if (globalThis.crypto?.getRandomValues) {
      random = globalThis.crypto.getRandomValues(new Uint32Array(1))[0].toString(36);
    } else {
      random = Math.floor(Math.random() * 0xffffffff).toString(36);
    }
    return `${prefix}-${Date.now().toString(36)}-${random}`;
  }

  function gateError(code, message) {
    const error = new Error(`HIGHWAY ${code}: ${message}`);
    error.name = "YGPHCoreError";
    error.code = code;
    return error;
  }

  function list(root, parent, key) {
    const value = parent ? root?.[parent]?.[key] : root?.[key];
    return Array.isArray(value) ? value : [];
  }

  function indexById(items, label, idField = "id") {
    const output = new Map();
    for (const item of items) {
      const id = item?.[idField];
      if (!id) throw gateError("BLOCKED", `${label} ไม่มี ${idField}`);
      if (output.has(id)) throw gateError("BLOCKED", `${label} มี ${idField} ซ้ำ ${id}`);
      output.set(id, item);
    }
    return output;
  }

  function validISODate(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));
    if (!match) return false;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  }

  function compatibilityFor(schema) {
    const sourceSchema = Number(schema);
    const rows = {
      1: { supported: true, mode: "MIGRATE", migrationPath: [1, 4], requiresSnapshot: true, verification: ["BALANCE", "SOURCE_LINKS"] },
      2: { supported: true, mode: "MIGRATE", migrationPath: [2, 4], requiresSnapshot: true, verification: ["INSTALLMENTS", "SOURCE_LINKS"] },
      3: { supported: true, mode: "MIGRATE", migrationPath: [3, 4], requiresSnapshot: true, verification: ["RECEIVABLE_PATCH", "CASH_BALANCE"] },
      4: { supported: true, mode: "LOAD", migrationPath: [4], requiresSnapshot: false, verification: ["INTEGRITY"] }
    };
    return rows[sourceSchema]
      ? { sourceSchema, targetSchema: STATE_SCHEMA, ...clone(rows[sourceSchema]) }
      : { sourceSchema, targetSchema: STATE_SCHEMA, supported: false, mode: "BLOCKED", migrationPath: [], requiresSnapshot: false, verification: [] };
  }

  function findSource(root, source, id) {
    if (!id) return null;
    if (source === "STORE") {
      return list(root, "store", "sales").find(item => item.id === id)
        || list(root, "store", "purchases").find(item => item.id === id)
        || list(root, "store", "withdrawals").find(item => item.id === id)
        || null;
    }
    if (source === "RIDE") {
      return list(root, "ride", "jobs").find(item => item.id === id)
        || list(root, "ride", "expenses").find(item => item.id === id)
        || list(root, "ride", "rounds").find(item => item.id === id)
        || list(root, "ride", "creditWithdrawals").find(item => item.id === id)
        || (root?.ride?.currentRound?.id === id ? root.ride.currentRound : null);
    }
    if (source === "LEDGER") {
      return list(root, "ledger", "obligations").find(item => item.id === id)
        || list(root, "ledger", "transactions").find(item => item.id === id)
        || null;
    }
    return null;
  }

  function normalizeDomain(value, fallback = "SYSTEM") {
    const domain = String(value || fallback).toUpperCase();
    return ALLOWED_DOMAINS.has(domain) ? domain : fallback;
  }

  function normalizeTargets(value, fallback) {
    const candidates = Array.isArray(value) ? value : value ? [value] : fallback;
    const output = [];
    for (const item of candidates || []) {
      const domain = normalizeDomain(item, "CORE");
      if (!output.includes(domain)) output.push(domain);
    }
    return output.length ? output : ["CORE"];
  }

  function buildPlan(before, after, options = {}) {
    if (!before || !after) throw gateError("BLOCKED", "ต้องมี State ก่อนและหลังคำสั่ง");
    const changes = [];
    const deletions = [];

    for (const [parent, key, owner, recordType, idField = "id"] of PROTECTED_COLLECTIONS) {
      const previous = indexById(list(before, parent, key), `${owner}/${recordType}`, idField);
      const current = indexById(list(after, parent, key), `${owner}/${recordType}`, idField);

      for (const [id, record] of previous) {
        if (!current.has(id)) deletions.push({ owner, recordType, recordId: id, before: clone(record) });
      }
      for (const [id, record] of current) {
        const oldRecord = previous.get(id);
        if (!oldRecord) {
          changes.push({ changeType: "CREATE", owner, recordType, recordId: id, before: null, after: clone(record) });
        } else if (changed(oldRecord, record)) {
          changes.push({ changeType: "UPDATE", owner, recordType, recordId: id, before: clone(oldRecord), after: clone(record) });
        }
      }
    }

    const scalarPaths = [
      ["settings"],
      ["store", "stockQty"],
      ["store", "stockValueSatang"],
      ["ride", "currentRound"],
      ["ride", "creditBalanceSatang"],
      ["ledger", "openingBalanceSatang"],
      ["ledger", "balanceVerified"],
      ["ledger", "verifiedAt"],
      ["migration"],
      ["dataFixes"]
    ];
    const stateChanges = scalarPaths.flatMap(path => {
      const read = root => path.reduce((value, key) => value?.[key], root);
      const previous = read(before);
      const current = read(after);
      return changed(previous, current) ? [{ path: path.join("."), before: clone(previous), after: clone(current) }] : [];
    });

    const affectedOwners = changes
      .filter(change => !["AUDIT", "CORE"].includes(change.owner))
      .map(change => change.owner);
    if (stateChanges.some(item => item.path.startsWith("store."))) affectedOwners.push("STORE");
    if (stateChanges.some(item => item.path.startsWith("ride."))) affectedOwners.push("RIDE");
    if (stateChanges.some(item => item.path.startsWith("ledger."))) affectedOwners.push("LEDGER");

    const timestamp = options.timestamp || new Date().toISOString();
    const actionId = String(options.actionId || makeId("ACT"));
    const sourceDomain = normalizeDomain(options.sourceDomain || affectedOwners[0] || "SYSTEM");
    const sourceOwner = String(options.sourceOwner || sourceDomain);
    const targetDomain = normalizeTargets(options.targetDomain, [...new Set(affectedOwners)]);
    const sourceRevision = Number(before.revision || 0);
    const expectedRevision = Number(options.expectedRevision ?? (sourceRevision + 1));

    return {
      actionId,
      actor: String(options.actor || "OWNER_LOCAL_UI"),
      eventType: String(options.eventType || `${sourceDomain}_STATE_CHANGED`),
      sourceDomain,
      sourceOwner,
      targetDomain,
      correlationId: String(options.correlationId || actionId),
      causationId: String(options.causationId || options.correlationId || actionId),
      idempotencyKey: String(options.idempotencyKey || actionId),
      timestamp,
      payloadVersion: Number(options.payloadVersion || 1),
      provenance: clone(options.provenance || {}),
      sourceRevision,
      expectedRevision,
      changes,
      deletions,
      stateChanges
    };
  }

  function routeForChange(change) {
    if (change.recordType === "TRANSACTION") {
      const raw = String(change.after?.source || "LEDGER");
      const from = ["GENERAL", "OTHER_INCOME"].includes(raw) ? "LEDGER" : normalizeDomain(raw, "LEDGER");
      return { from, to: "LEDGER", permission: change.changeType };
    }
    if (change.recordType === "CALENDAR_ACTION") {
      return { from: normalizeDomain(change.after?.source, "SYSTEM"), to: "CALENDAR", permission: change.changeType === "CREATE" ? "CREATE" : "PROPOSE" };
    }
    if (change.recordType === "AUDIT_EVENT") return { from: "SYSTEM", to: "AUDIT", permission: change.changeType };
    if (change.recordType === "EVENT_ENVELOPE") return { from: "CORE", to: "CORE", permission: change.changeType };
    return { from: change.owner, to: change.owner, permission: change.changeType };
  }

  function routeAllowed(route) {
    if (route.from === route.to && ["STORE", "RIDE", "LEDGER", "CORE"].includes(route.from)) {
      return ["CREATE", "UPDATE"].includes(route.permission);
    }
    if (route.to === "AUDIT") return route.from === "SYSTEM" && route.permission === "CREATE";
    if (route.to === "CALENDAR") return ["STORE", "RIDE", "LEDGER"].includes(route.from) && ["CREATE", "PROPOSE"].includes(route.permission);
    if (route.to === "LEDGER") return ["STORE", "RIDE", "LEDGER"].includes(route.from) && ["CREATE", "UPDATE"].includes(route.permission);
    return false;
  }

  function assertSatang(value, label, allowZero = false) {
    if (!Number.isSafeInteger(value) || value < (allowZero ? 0 : 1) || value > MAX_ALLOWED_SATANG) {
      throw gateError("BLOCKED", `${label} ต้องเป็นจำนวนเต็มหน่วยสตางค์${allowZero ? "ที่ไม่ติดลบ" : "และมากกว่า 0"}`);
    }
    return value;
  }

  function validateStockAdjustment(item) {
    const id = String(item?.adjustmentId || "").trim();
    if (!id) throw gateError("BLOCKED", "Adjustment ปรับสต็อกไม่มี adjustmentId");
    const beforeQty = item.beforeQty;
    const adjustmentQty = item.adjustmentQty;
    const afterQty = item.afterQty;
    if (![beforeQty, adjustmentQty, afterQty].every(Number.isSafeInteger)) {
      throw gateError("BLOCKED", `Adjustment ${id} ต้องใช้จำนวนเต็มที่ปลอดภัย`);
    }
    if (beforeQty < 0 || afterQty < 0 || beforeQty + adjustmentQty !== afterQty) {
      throw gateError("BLOCKED", `สมการ Adjustment ${id} ไม่ตรง: ก่อน + ปรับ ต้องเท่ากับหลังและไม่ติดลบ`);
    }
    if (typeof item.reason !== "string" || !item.reason.trim() || typeof item.actor !== "string" || !item.actor.trim() || typeof item.note !== "string") {
      throw gateError("BLOCKED", `Adjustment ${id} ไม่มีเหตุผลหรือผู้ดำเนินการ`);
    }
    if (typeof item.at !== "string" || !Number.isFinite(Date.parse(item.at))) throw gateError("BLOCKED", `เวลา Adjustment ${id} ไม่ถูกต้อง`);
    const hasCurrentValueFlag = Object.prototype.hasOwnProperty.call(item, "affectsValue");
    const hasLegacyValueFlag = Object.prototype.hasOwnProperty.call(item, "affectsStockValue");
    if (item.affectsLedger !== false
      || (!hasCurrentValueFlag && !hasLegacyValueFlag)
      || (hasCurrentValueFlag && item.affectsValue !== false)
      || (hasLegacyValueFlag && item.affectsStockValue !== false)) {
      throw gateError("BLOCKED", `ผลกระทบของ Adjustment ${id} ต้องเป็นข้อมูลจำนวนเท่านั้น`);
    }
    return true;
  }

  function validateStockAdjustmentTopology(root) {
    const adjustments = list(root, "store", "adjustments");
    indexById(adjustments, "STORE/STOCK_ADJUSTMENT", "adjustmentId");
    adjustments.forEach(validateStockAdjustment);
    return true;
  }

  function validateStateAmounts(root) {
    const seen = new Set();
    const visit = (value, path) => {
      if (!value || typeof value !== "object" || seen.has(value)) return;
      seen.add(value);
      for (const [key, child] of Object.entries(value)) {
        const childPath = path ? `${path}.${key}` : key;
        if (key.endsWith("Satang")) {
          if (!Number.isSafeInteger(child) || Math.abs(child) > MAX_ALLOWED_SATANG) {
            throw gateError("BLOCKED", `${childPath} ต้องเป็นจำนวนเต็มหน่วยสตางค์`);
          }
        } else {
          visit(child, childPath);
        }
      }
    };
    visit(root, "");
    return true;
  }

  function activeTransactions(root, source, sourceId) {
    return list(root, "ledger", "transactions").filter(transaction =>
      transaction.source === source
      && transaction.sourceId === sourceId
      && !String(transaction.subtype || "").startsWith("REVERSAL_")
      && !transaction.reversedBy
    );
  }

  function activeQueues(root, source, sourceId, actionType = null) {
    return list(root, null, "calendar").filter(item =>
      item.source === source
      && item.sourceId === sourceId
      && !["COMPLETED", "CANCELLED"].includes(item.status)
      && (!actionType || item.actionType === actionType)
    );
  }

  function validateTransaction(transaction, root, { allowMissingActionKey = false } = {}) {
    if (!transaction?.id || !transaction.sourceId) throw gateError("BLOCKED", "ธุรกรรมไม่มี id หรือต้นทาง");
    if (!transaction.actionKey && !allowMissingActionKey) throw gateError("BLOCKED", `ธุรกรรม ${transaction.id} ไม่มี actionKey`);
    if (!["IN", "OUT"].includes(transaction.direction)) throw gateError("BLOCKED", `ทิศทางธุรกรรม ${transaction.id} ไม่ถูกต้อง`);
    assertSatang(transaction.amountSatang, `ยอดธุรกรรม ${transaction.id}`);
    if (!ALLOWED_TRANSACTION_SOURCES.has(transaction.source)) throw gateError("BLOCKED", `เจ้าของธุรกรรม ${transaction.id} ไม่ได้รับอนุญาต`);

    const subtype = String(transaction.subtype || "").replace(/^REVERSAL_/, "");
    if (LINKED_TRANSACTION_SUBTYPES.has(subtype) && !findSource(root, transaction.source, transaction.sourceId)) {
      throw gateError("BLOCKED", `ธุรกรรม ${transaction.id} ย้อนกลับไม่ถึง Source ต้นทาง`);
    }
  }

  function validateTransactionUpdate(change, after) {
    const beforeComparable = clone(change.before);
    const afterComparable = clone(change.after);
    delete beforeComparable.reversedBy;
    delete afterComparable.reversedBy;
    const reversal = list(after, "ledger", "transactions").find(item => item.id === change.after.reversedBy);
    const linkedReversal = reversal
      && String(reversal.subtype || "").startsWith("REVERSAL_")
      && reversal.source === change.before.source
      && reversal.sourceId === change.before.sourceId
      && reversal.direction !== change.before.direction
      && reversal.amountSatang === change.before.amountSatang
      && reversal.reversalOf === change.before.id;
    const allowed = change.before.reversedBy == null
      && Boolean(change.after.reversedBy)
      && hash(beforeComparable) === hash(afterComparable)
      && linkedReversal;
    if (!allowed) throw gateError("BLOCKED", `เงินที่เกิดแล้ว ${change.recordId} แก้ทับไม่ได้ ต้องใช้ Reversal ที่เชื่อมกัน`);
  }

  function validateReversalTopology(root, { allowLegacyUnlinked = false } = {}) {
    const transactions = indexById(list(root, "ledger", "transactions"), "LEDGER/TRANSACTION");
    const claimsByReversal = new Map();
    const reversalsByOriginal = new Map();

    for (const original of transactions.values()) {
      if (!original.reversedBy) continue;
      const reversal = transactions.get(original.reversedBy);
      if (!reversal || !String(reversal.subtype || "").startsWith("REVERSAL_")) {
        throw gateError("BLOCKED", `รายการ ${original.id} ชี้ไปยัง Reversal ที่ไม่มีอยู่จริง`);
      }
      if (reversal.source !== original.source
        || reversal.sourceId !== original.sourceId
        || reversal.direction === original.direction
        || reversal.amountSatang !== original.amountSatang) {
        throw gateError("BLOCKED", `Reversal ${reversal.id} เชื่อมกับรายการ ${original.id} ไม่ครบคู่`);
      }
      if (reversal.reversalOf && reversal.reversalOf !== original.id) {
        throw gateError("BLOCKED", `Reversal ${reversal.id} ถูกเชื่อมซ้ำหลายรายการ`);
      }
      const claims = claimsByReversal.get(reversal.id) || [];
      claims.push(original.id);
      claimsByReversal.set(reversal.id, claims);
    }

    for (const reversal of transactions.values()) {
      if (!String(reversal.subtype || "").startsWith("REVERSAL_")) continue;
      const claims = claimsByReversal.get(reversal.id) || [];
      if (!reversal.reversalOf) {
        if (!allowLegacyUnlinked || claims.length !== 1) {
          throw gateError("BLOCKED", `Reversal ${reversal.id} ไม่ได้เชื่อมกลับรายการเดิมแบบหนึ่งต่อหนึ่ง`);
        }
        continue;
      }
      const original = transactions.get(reversal.reversalOf);
      if (!original || original.id === reversal.id || original.reversedBy !== reversal.id || claims.length !== 1 || claims[0] !== original.id) {
        throw gateError("BLOCKED", `Reversal ${reversal.id} เชื่อมกับรายการเดิมไม่ครบคู่`);
      }
      const linked = reversalsByOriginal.get(original.id) || [];
      linked.push(reversal.id);
      reversalsByOriginal.set(original.id, linked);
    }

    for (const [originalId, reversalIds] of reversalsByOriginal) {
      if (reversalIds.length > 1) throw gateError("BLOCKED", `รายการ ${originalId} มี Reversal ซ้ำ`);
    }
    return true;
  }

  function validateReversalLinks(before, after) {
    validateReversalTopology(after, { allowLegacyUnlinked: true });
    const previous = indexById(list(before, "ledger", "transactions"), "LEDGER/TRANSACTION");
    for (const reversal of list(after, "ledger", "transactions")) {
      if (!String(reversal.subtype || "").startsWith("REVERSAL_") || reversal.reversalOf) continue;
      const oldReversal = previous.get(reversal.id);
      if (!oldReversal || oldReversal.reversalOf || hash(oldReversal) !== hash(reversal)) {
        throw gateError("BLOCKED", `Reversal ${reversal.id} ใหม่ต้องระบุรายการเดิม`);
      }
    }
  }

  function validateQueue(item, root, previous = null) {
    if (!item?.id || !item.sourceId || !item.actionType) throw gateError("BLOCKED", "คิวไม่มี id, Source หรือ Action Type");
    if (!["STORE", "RIDE", "LEDGER"].includes(item.source)) throw gateError("BLOCKED", `เจ้าของคิว ${item.id} ไม่ถูกต้อง`);
    if (!findSource(root, item.source, item.sourceId)) {
      const quarantiningExistingOrphan = Boolean(previous)
        && item.status === "VERIFY"
        && item.requiresRefreshBeforePayment === true;
      if (!quarantiningExistingOrphan) throw gateError("BLOCKED", `คิว ${item.id} ไม่พบ Source ต้นทาง`);
    }
    if (!validISODate(item.due)) throw gateError("BLOCKED", `วันกำหนดของคิว ${item.id} ไม่ถูกต้อง`);
    if (!QUEUE_STATUSES.has(item.status)) throw gateError("BLOCKED", `สถานะคิว ${item.id} ไม่ถูกต้อง`);
    assertSatang(Number(item.amountSatang || 0), `ยอดคิว ${item.id}`, true);
    assertSatang(Number(item.paidSatang || 0), `ยอดจ่ายคิว ${item.id}`, true);
    if (Number(item.paidSatang || 0) > Number(item.amountSatang || 0)) throw gateError("BLOCKED", `ยอดจ่ายคิว ${item.id} เกินยอดคิว`);
  }

  function validateCriticalRoutes(root, changedIds) {
    for (const job of list(root, "ride", "jobs")) {
      if (!changedIds.has(job.id) || job.status === "CANCELLED") continue;
      const transactions = activeTransactions(root, "RIDE", job.id);
      if (job.paymentMode === "CASH" && transactions.length !== 1) {
        throw gateError("BLOCKED", `งานเงินสด ${job.id} ต้องมี Ledger transaction หนึ่งรายการ`);
      }
      if (job.paymentMode === "CREDIT" && transactions.length !== 0) {
        throw gateError("BLOCKED", `งานเครดิต ${job.id} เพิ่มเงินจริงก่อนยืนยันรับไม่ได้`);
      }
    }

    for (const withdrawal of list(root, "ride", "creditWithdrawals")) {
      if (!changedIds.has(withdrawal.id) || withdrawal.status !== "PENDING") continue;
      const queues = activeQueues(root, "RIDE", withdrawal.id, "CONFIRM_RIDE_CREDIT_WITHDRAWAL");
      if (queues.length !== 1) throw gateError("BLOCKED", `เครดิตกำลังเบิก ${withdrawal.id} ต้องมีคิวยืนยันเงินเข้าหนึ่งรายการ`);
    }
  }

  function hasIdempotencyKey(root, key) {
    if (!key) return false;
    if (root?.sync?.appliedCommandKeys?.[key]) return true;
    return list(root, null, "events").some(event => event?.idempotencyKey === key);
  }

  function validatePlan(plan, before, after) {
    if (!plan || !before || !after) throw gateError("BLOCKED", "แผนคำสั่งไม่สมบูรณ์");
    if (!plan.actionId || !plan.eventType || !plan.sourceDomain || !plan.sourceOwner || !plan.correlationId || !plan.causationId || !plan.idempotencyKey) {
      throw gateError("BLOCKED", "Event contract ของคำสั่งไม่ครบ");
    }
    if (!Array.isArray(plan.targetDomain) || !plan.targetDomain.length) throw gateError("BLOCKED", "Event contract ไม่มี targetDomain");
    if (!Number.isInteger(plan.payloadVersion) || plan.payloadVersion < 1) throw gateError("BLOCKED", "payloadVersion ไม่ถูกต้อง");
    if (!Number.isInteger(plan.expectedRevision) || plan.expectedRevision !== Number(before.revision || 0) + 1) {
      throw gateError("BLOCKED", "revision หลังคำสั่งต้องเพิ่มครั้งเดียว");
    }
    if (hasIdempotencyKey(before, plan.idempotencyKey)) throw gateError("DUPLICATE", `คำสั่ง ${plan.idempotencyKey} ทำไปแล้ว ระบบไม่คำนวณซ้ำ`);
    if (plan.deletions.length) {
      const blocked = plan.deletions.map(item => `${item.owner}/${item.recordId}`).join(", ");
      throw gateError("BLOCKED", `ห้ามลบ Record, Transaction, Event หรือ Audit เดิมโดยตรง (${blocked})`);
    }

    validateStateAmounts(after);
    validateStockAdjustmentTopology(after);

    for (const [parent, key, owner, recordType, idField = "id"] of PROTECTED_COLLECTIONS) {
      indexById(list(after, parent, key), `${owner}/${recordType}`, idField);
    }

    const actionKeys = new Map();
    const previousTransactions = indexById(list(before, "ledger", "transactions"), "LEDGER/TRANSACTION");
    for (const transaction of list(after, "ledger", "transactions")) {
      const previous = previousTransactions.get(transaction.id);
      validateTransaction(transaction, after, { allowMissingActionKey: Boolean(previous && !previous.actionKey && !transaction.actionKey) });
      if (!transaction.actionKey) continue;
      const ids = actionKeys.get(transaction.actionKey) || [];
      ids.push(transaction.id);
      actionKeys.set(transaction.actionKey, ids);
    }
    for (const [key, ids] of actionKeys) {
      if (ids.length > 1) throw gateError("BLOCKED", `actionKey ซ้ำ ${key}`);
    }
    validateReversalLinks(before, after);

    for (const change of plan.changes) {
      const route = routeForChange(change);
      change.route = route;
      if (!routeAllowed(route)) throw gateError("BLOCKED", `Route ไม่อนุญาต ${route.from} → ${route.to} (${route.permission})`);
      if (change.recordType === "TRANSACTION" && change.changeType === "UPDATE") validateTransactionUpdate(change, after);
      if (change.recordType === "CALENDAR_ACTION") validateQueue(change.after, after, change.before);
      if (change.recordType === "STOCK_ADJUSTMENT" && change.changeType === "UPDATE") {
        throw gateError("BLOCKED", `หลักฐาน Adjustment ${change.recordId} แก้ย้อนหลังไม่ได้ ต้อง append รายการใหม่`);
      }
      if (change.before?.revision != null && change.after?.revision != null && Number(change.after.revision) < Number(change.before.revision)) {
        throw gateError("BLOCKED", `Revision ของ ${change.owner}/${change.recordId} ย้อนกลับ`);
      }
    }

    const changedIds = new Set(plan.changes.map(change => change.recordId));
    validateCriticalRoutes(after, changedIds);
    return plan;
  }

  function cleanSync(sync) {
    const output = clone(sync || {});
    if (output.flow && typeof output.flow === "object") delete output.flow.lastReadbackRuntime;
    return output;
  }

  function cleanIntegrity(integrity) {
    const output = clone(integrity || {});
    delete output.checkedAt;
    return output;
  }

  function durableProjection(root) {
    const projection = {
      schema: root?.schema,
      revision: root?.revision,
      createdAt: root?.createdAt,
      updatedAt: root?.updatedAt,
      settings: clone(root?.settings || {}),
      store: clone(root?.store || {}),
      ride: clone(root?.ride || {}),
      ledger: clone(root?.ledger || {}),
      calendar: clone(root?.calendar || []),
      audit: clone(root?.audit || []),
      events: clone(root?.events || []),
      sync: cleanSync(root?.sync),
      migration: clone(root?.migration || {}),
      dataFixes: clone(root?.dataFixes || {}),
      integrity: cleanIntegrity(root?.integrity)
    };
    return JSON.parse(JSON.stringify(projection));
  }

  function eventHashProjection(root) {
    const projection = durableProjection(root);
    projection.events = projection.events.map(event => {
      const material = clone(event);
      delete material.expectedDurableHash;
      delete material.checksum;
      return material;
    });
    return projection;
  }

  function createEventEnvelope(input = {}) {
    const plan = input.plan;
    if (!plan || !input.nextState) throw gateError("BLOCKED", "สร้าง Event ไม่ได้เพราะไม่มีแผนหรือ State หลังคำสั่ง");
    const event = {
      eventId: String(input.eventId || makeId("EV")),
      idempotencyKey: plan.idempotencyKey,
      eventType: plan.eventType,
      sourceDomain: plan.sourceDomain,
      sourceOwner: plan.sourceOwner,
      targetDomain: clone(plan.targetDomain),
      correlationId: plan.correlationId,
      causationId: plan.causationId,
      timestamp: plan.timestamp,
      payloadVersion: plan.payloadVersion,
      status: "COMMITTED_PENDING_READBACK",
      actor: plan.actor,
      stateRevision: { before: plan.sourceRevision, after: plan.expectedRevision },
      provenance: {
        coreVersion: VERSION,
        stateSchema: STATE_SCHEMA,
        sourceRevision: plan.sourceRevision,
        expectedRevision: plan.expectedRevision,
        ...clone(plan.provenance || {})
      },
      effectContract: {
        effectGroupId: plan.correlationId,
        cashTruth: "LEDGER_ONLY",
        relatedRecordsAreNotExtraCash: true,
        readbackRequired: true
      },
      payload: {
        actionId: plan.actionId,
        changes: plan.changes
          .filter(change => !["AUDIT_EVENT", "EVENT_ENVELOPE"].includes(change.recordType))
          .map(change => ({
            changeType: change.changeType,
            owner: change.owner,
            recordType: change.recordType,
            recordId: change.recordId,
            route: change.route || routeForChange(change)
          })),
        stateChanges: clone(plan.stateChanges || [])
      }
    };
    const materialState = clone(input.nextState);
    materialState.events = Array.isArray(materialState.events) ? materialState.events : [];
    if (!materialState.events.some(item => item.eventId === event.eventId)) materialState.events.push(event);
    event.expectedDurableHash = hash(eventHashProjection(materialState));
    event.checksum = hash(event);
    return event;
  }

  function assertReadback(expected, actual) {
    if (Number(actual?.revision) !== Number(expected?.revision)) {
      throw gateError("READBACK_FAILED", `revision ${actual?.revision} ไม่ตรงกับ ${expected?.revision}`);
    }
    const expectedHash = hash(durableProjection(expected));
    const actualHash = hash(durableProjection(actual));
    if (actualHash !== expectedHash) throw gateError("READBACK_FAILED", "ข้อมูลที่อ่านกลับไม่ตรงกับข้อมูลที่สั่งบันทึก");
    return actualHash;
  }

  function isBase64(value, minimumLength = 1) {
    return typeof value === "string"
      && value.length >= minimumLength
      && value.length % 4 === 0
      && /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value);
  }

  function validateBackupEnvelope(value) {
    if (!value || value.backupFormat !== "stock-pocket-encrypted-backup" || Number(value.backupVersion) !== 1) {
      throw gateError("BACKUP_INVALID", "ไฟล์สำรองไม่รองรับ");
    }
    const vault = value.vault;
    if (!vault || vault.format !== "stock-pocket-vault" || Number(vault.version) !== 1) throw gateError("BACKUP_INVALID", "รูปแบบ Vault ไม่รองรับ");
    if (vault.kdf?.name !== "PBKDF2" || vault.kdf?.hash !== "SHA-256") throw gateError("BACKUP_INVALID", "รูปแบบรหัสไม่รองรับ");
    if (!Number.isInteger(vault.kdf.iterations) || vault.kdf.iterations < 100000) throw gateError("BACKUP_INVALID", "ค่า KDF ไม่ถูกต้อง");
    if (!isBase64(vault.kdf.salt, 20)) throw gateError("BACKUP_INVALID", "Salt ไม่ถูกต้อง");
    if (vault.cipher?.name !== "AES-GCM" || Number(vault.cipher.tagLength) !== 128) throw gateError("BACKUP_INVALID", "รูปแบบการเข้ารหัสไม่รองรับ");
    if (!isBase64(vault.cipher.iv, 16)) throw gateError("BACKUP_INVALID", "IV ไม่ถูกต้อง");
    if (!isBase64(vault.ciphertext, 24)) throw gateError("BACKUP_INVALID", "Ciphertext ไม่ถูกต้อง");
    return clone(value);
  }

  return Object.freeze({
    VERSION,
    STATE_SCHEMA,
    compatibilityFor,
    buildPlan,
    validatePlan,
    validateStateAmounts,
    validateStockAdjustmentTopology,
    validateReversalTopology,
    createEventEnvelope,
    durableProjection,
    eventHashProjection,
    assertReadback,
    validateBackupEnvelope,
    hasIdempotencyKey,
    findSource,
    hash,
    stable
  });
});
