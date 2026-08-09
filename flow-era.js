"use strict";

/*
  YGPH FLOW ERA v3.0 — additive production-candidate layer
  - Does not change DB_NAME, IndexedDB store, Vault format, AES-GCM or PBKDF2.
  - Audit Center is REPORT_ONLY.
  - Route-based exchange accepts legacy v1 and FLOW_EVENT_EXCHANGE v3.
*/

const FLOW_VERSION = "3.0.2";
const FLOW_FORMAT = "YGPH_FLOW_EVENT_EXCHANGE";
const FLOW_FORMAT_VERSION = 3;
let flowCalendarIndex = 0;
let flowLastAudit = null;
let flowPendingExportLineage = null;

const flowBase = {
  renderAll,
  renderHome,
  renderRide,
  renderLedger,
  renderCalendar,
  renderSync,
  renderSettings,
  buildExchange,
  validateImportProposal,
  applyPendingImport,
  cancelPendingImport,
  persistAndRender
};

const FLOW_ICONS = {
  app: '<svg data-icon="app-metropolis-mark" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path data-role="accent" d="M6 7 12 3l6 4"/><path data-role="primary" d="M6 20V9l6 5 6-5v11"/><path data-role="accent" d="m12 17.2.65 1.2 1.2.65-1.2.65-.65 1.2-.65-1.2-1.2-.65 1.2-.65Z" fill="currentColor" stroke="none"/></svg>',
  home: '<svg data-icon="home" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 11.2 12 4l8.5 7.2"/><path d="M5.5 10.2V20h13v-9.8"/><path d="M9.3 20v-5.5h5.4V20"/></svg>',
  store: '<svg data-icon="storefront" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 10v9h16v-9"/><path d="M3 10l2-5h14l2 5"/><path d="M3 10c0 1.4 1 2.5 2.3 2.5S7.7 11.4 7.7 10c0 1.4 1 2.5 2.3 2.5s2.3-1.1 2.3-2.5c0 1.4 1 2.5 2.3 2.5s2.3-1.1 2.3-2.5c0 1.4 1 2.5 2.3 2.5S21 11.4 21 10"/><path d="M9 19v-4h6v4"/></svg>',
  ride: '<svg data-icon="ride-route" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="6.5" cy="16.5" r="2.4"/><circle cx="17.5" cy="16.5" r="2.4"/><path d="M8.9 16.5h3.2l2.4-6h3.8M11.2 10.5l1.2-3.5h3.2M12.4 7h3.2"/><path d="M3.8 12.5h6.1l2.2 4"/></svg>',
  ledger: '<svg data-icon="ledger-book" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="6" y="3" width="14" height="18" rx="2.5"/><path d="M9 3v18M4 7h4M4 12h4M4 17h4"/><path d="M14.7 8.2c-1.4 0-2.3.7-2.3 1.7 0 1.1 1 1.5 2.3 1.8s2.3.7 2.3 1.8c0 1-.9 1.8-2.4 1.8M14.7 6.9v9.8"/></svg>',
  calendar: '<svg data-icon="calendar-grid" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M8 3v4M16 3v4M3 10h18"/><path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01"/></svg>',
  settings: '<svg data-icon="settings" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.2 14.7l1.1 1.9-2.7 2.7-1.9-1.1a7 7 0 0 1-1.7.7l-.6 2.1H9.6L9 18.9a7 7 0 0 1-1.7-.7l-1.9 1.1-2.7-2.7 1.1-1.9a7 7 0 0 1-.7-1.7L1 12.4V8.6L3.1 8a7 7 0 0 1 .7-1.7L2.7 4.4l2.7-2.7 1.9 1.1A7 7 0 0 1 9 2.1L9.6 0h3.8l.6 2.1a7 7 0 0 1 1.7.7l1.9-1.1 2.7 2.7-1.1 1.9a7 7 0 0 1 .7 1.7l2.1.6v3.8l-2.1.6a7 7 0 0 1-.7 1.7Z" transform="scale(.82) translate(2.6 2.6)"/></svg>',
  wallet: '<svg data-icon="wallet" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 6.5h13.5A2.5 2.5 0 0 1 20 9v9H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h11"/><path d="M15 11h6v4h-6a2 2 0 0 1 0-4Z"/></svg>',
  stock: '<svg data-icon="stock-box" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m4 8 8-4 8 4-8 4-8-4Z"/><path d="M4 8v8l8 4 8-4V8M12 12v8"/></svg>',
  task: '<svg data-icon="task" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="4" width="14" height="17" rx="2.5"/><path d="m8 9 1.4 1.4L12 7.8M8 15l1.4 1.4L12 13.8M13.5 10h2.8M13.5 16h2.8"/></svg>',
  payment: '<svg data-icon="payment" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="M3 9h18M7 15h4"/><circle cx="18" cy="17" r="3" fill="currentColor" stroke="none"/></svg>',
  chevron: '<svg data-icon="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg>',
  tree: '<svg data-icon="tree" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21v-8"/><path d="M12 14c-4.5 0-7-2.8-7-6 4.2-.5 7 1.1 7 6z"/><path d="M12 11c0-4.5 2.8-7 6-7 .5 4.2-1.1 7-6 7z"/><path d="M8 21h8"/></svg>'
};

function flowIcon(name) {
  return `<span class="flow-icon">${FLOW_ICONS[name] || FLOW_ICONS.home}</span>`;
}

function flowEnsureState() {
  if (!state) return;
  state.sync ||= {};
  state.sync.flow ||= {};
  state.sync.flow.processedPackageIds = Array.isArray(state.sync.flow.processedPackageIds) ? state.sync.flow.processedPackageIds : [];
  state.sync.flow.processedEventKeys = Array.isArray(state.sync.flow.processedEventKeys) ? state.sync.flow.processedEventKeys : [];
  state.sync.flow.lastExportPackageId ||= null;
  state.sync.flow.lastExportSourceRevision = Number.isSafeInteger(Number(state.sync.flow.lastExportSourceRevision)) ? Number(state.sync.flow.lastExportSourceRevision) : null;
  state.sync.flow.lastExportRecordMeta = state.sync.flow.lastExportRecordMeta && typeof state.sync.flow.lastExportRecordMeta === "object" ? state.sync.flow.lastExportRecordMeta : {};
  state.calendar.forEach(item => {
    item.displayName ||= "";
    item.note ||= "";
    item.userColor ||= "#4384d4";
    item.reminderEnabled = item.reminderEnabled !== false;
  });
}

function flowCanonical(value) {
  if (Array.isArray(value)) return `[${value.map(flowCanonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).filter(key => key !== "checksum").sort().map(key => `${JSON.stringify(key)}:${flowCanonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function flowChecksum(value) {
  const text = flowCanonical(value);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function flowRouteForRecord(record) {
  if (record.source === "CALENDAR") {
    const owner = String(record.detail || "").split("/")[0] || "CALENDAR";
    return { from: owner, to: "CALENDAR", permission: "READ" };
  }
  if (record.type === "TRANSACTION" || record.type === "CURRENT_BALANCE") return { from: "LEDGER", to: "REVIEW_CENTER", permission: "READ" };
  return { from: record.source, to: "REVIEW_CENTER", permission: "READ" };
}

function flowEffectsForRecord(record) {
  const allowed = ["READ_SNAPSHOT"];
  const forbidden = ["DIRECT_OVERWRITE", "SILENT_APPLY", "DELETE_AUDIT_TRAIL"];
  if (record.source === "CALENDAR") forbidden.push("CALENDAR_OWNS_CASH");
  if (record.source === "RIDE" && record.type === "RIDE_JOB" && String(record.detail) === "CREDIT") forbidden.push("LEDGER_CASH_INCREASED");
  if (record.type === "TRANSACTION") forbidden.push("EDIT_COMPLETED_CASH");
  return { allowed, forbidden };
}

async function flowSha256(value) {
  const bytes = new TextEncoder().encode(flowCanonical(value));
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return `sha256-${[...digest].map(byte => byte.toString(16).padStart(2, "0")).join("")}`;
}

function flowSemanticText(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9\u0E00-\u0E7F._-]/g, "") || "unknown";
}

function flowOwnerForRecord(record) {
  if (record.source === "CALENDAR") return String(record.detail || "").split("/")[0] || "CALENDAR";
  return record.source;
}

function flowSemanticKey(record, effectiveDate) {
  return [
    flowOwnerForRecord(record),
    record.type,
    flowSemanticText(record.title),
    effectiveDate || "unknown-date",
    Number(record.amountSatang ?? 0),
    record.quantity == null ? "na" : Number(record.quantity)
  ].join(":");
}

function flowSourceEntity(record) {
  if (record.source === "STORE") return findSource("STORE", record.recordId);
  if (record.source === "RIDE") return findSource("RIDE", record.recordId);
  if (record.source === "LEDGER") {
    if (record.type === "TRANSACTION") return state.ledger.transactions.find(item => item.id === record.recordId) || null;
    if (record.type === "OBLIGATION") return state.ledger.obligations.find(item => item.id === record.recordId) || null;
  }
  if (record.source === "CALENDAR") return findQueue(record.recordId);
  return null;
}

function flowRelationsForRecord(record) {
  const relations = [];
  const push = (relationType, targetOwner, targetRecordId) => {
    if (!targetOwner || !targetRecordId) return;
    const key = `${relationType}:${targetOwner}:${targetRecordId}`;
    if (relations.some(item => `${item.relationType}:${item.targetOwner}:${item.targetRecordId}` === key)) return;
    relations.push({ relationType, targetOwner, targetRecordId });
  };

  if (record.source === "CALENDAR") {
    const queue = findQueue(record.recordId);
    if (queue) {
      push("CALENDAR_TRIGGER_FOR", queue.source, queue.sourceId);
      if (queue.source === "LEDGER" && queue.installmentNumber) push("INSTALLMENT_OF", "LEDGER", queue.sourceId);
    } else {
      const [owner, id] = String(record.detail || "").split("/");
      push("CALENDAR_TRIGGER_FOR", owner, id);
    }
  }

  if (["STORE", "RIDE", "LEDGER"].includes(record.source) && record.type !== "TRANSACTION" && record.type !== "CURRENT_BALANCE") {
    state.ledger.transactions
      .filter(tx => tx.source === record.source && tx.sourceId === record.recordId)
      .forEach(tx => push("GENERATED_LEDGER_TRANSACTION", "LEDGER", tx.id));
    state.calendar
      .filter(item => item.source === record.source && item.sourceId === record.recordId)
      .forEach(item => push("CALENDAR_TRIGGER_FOR", "CALENDAR", item.id));
  }

  if (record.source === "LEDGER" && record.type === "TRANSACTION") {
    const tx = state.ledger.transactions.find(item => item.id === record.recordId);
    if (tx?.source && tx?.sourceId) push("GENERATED_FROM", tx.source, tx.sourceId);
    if (String(tx?.subtype || "").startsWith("REVERSAL_")) {
      const original = state.ledger.transactions.find(item => item.reversedBy === tx.id);
      if (original) push("REVERSES", "LEDGER", original.id);
    }
    if (tx?.reversedBy) push("SUPERSEDES", "LEDGER", tx.reversedBy);
  }

  return relations;
}

function flowOwnerValidation(record) {
  const entity = flowSourceEntity(record);
  const confirmedAt = entity?.ownerConfirmedAt || entity?.verifiedAt || null;
  const confirmation = confirmedAt ? "OWNER_CONFIRMED" : "UNCONFIRMED";
  return {
    schema: "PASS",
    checksum: "PASS",
    route: "PASS",
    semantic: "PASS",
    ownerConfirmation: confirmation,
    ownerConfirmedAt: confirmedAt,
    ownerConfirmationRevision: confirmedAt ? Number(entity?.revision || state.revision) : null
  };
}

function flowChangeType(previous, record, currentRecordHash) {
  if (!previous) return "CREATED";
  if (previous.hash === currentRecordHash) return "UNCHANGED_SNAPSHOT";
  if (record.status === "REVERSED" && previous.status !== "REVERSED") return "REVERSED";
  if (record.status === "CANCELLED" && previous.status !== "CANCELLED") return "CANCELLED";
  if (["COMPLETED", "SETTLED", "CLOSED"].includes(record.status) && previous.status !== record.status) return "CLOSED";
  if (previous.status !== record.status) return "STATUS_CHANGED";
  return "UPDATED";
}

function flowBalanceEvidence(snapshotAsOf) {
  const openingBalanceSatang = Number(state.ledger.openingBalanceSatang || 0);
  const inflowSatang = state.ledger.transactions.filter(tx => tx.direction === "IN").reduce((sum, tx) => sum + Number(tx.amountSatang || 0), 0);
  const outflowSatang = state.ledger.transactions.filter(tx => tx.direction === "OUT").reduce((sum, tx) => sum + Number(tx.amountSatang || 0), 0);
  const calculatedBalanceSatang = openingBalanceSatang + inflowSatang - outflowSatang;
  const reportedBalanceSatang = currentBalanceSatang();
  return {
    balanceAsOf: snapshotAsOf,
    calculation: {
      openingBalanceSatang,
      inflowSatang,
      outflowSatang,
      excludedReceivablesSatang: outstandingTotal(),
      calculatedBalanceSatang
    },
    includedTransactionIds: state.ledger.transactions.map(tx => tx.id),
    reconciliationStatus: calculatedBalanceSatang === reportedBalanceSatang ? "PASS" : "VERIFY"
  };
}

function flowReconciliation(enriched, previousMeta, currentMeta, balanceEvidence) {
  const events = enriched.map(item => item.event);
  const eventIds = events.map(event => event.eventId);
  const idempotencyKeys = events.map(event => event.idempotencyKey);
  const duplicateCount = values => values.length - new Set(values).size;
  const semanticGroups = new Map();
  enriched.forEach(item => semanticGroups.set(item.semanticKey, [...(semanticGroups.get(item.semanticKey) || []), item.record.recordId]));
  const semanticDuplicates = [...semanticGroups.entries()].filter(([, ids]) => ids.length > 1);

  const orphanLedgerTransactions = state.ledger.transactions.filter(tx => {
    if (!["STORE", "RIDE", "LEDGER"].includes(tx.source) || !tx.sourceId) return false;
    const subtype = String(tx.subtype || "").replace(/^REVERSAL_/, "");
    const expectsOwnerRecord = [
      "PURCHASE_PAYMENT", "SALE_INITIAL_RECEIPT", "SALE_RECEIPT", "RECEIVABLE_RECLASSIFICATION",
      "RIDE_CASH_INCOME", "RIDE_CREDIT_WITHDRAWAL", "RIDE_INCOME", "OBLIGATION_PAYMENT"
    ].includes(subtype);
    if (!expectsOwnerRecord) return false;
    return !findSource(tx.source, tx.sourceId);
  });
  const orphanCalendarItems = state.calendar.filter(item => !findSource(item.source, item.sourceId));
  const removedRecordIds = Object.keys(previousMeta).filter(id => !currentMeta[id]);

  const statusConflicts = [];
  state.ledger.obligations.filter(item => !["CANCELLED", "COMPLETED"].includes(item.status) && Number(item.remainingSatang || 0) > 0).forEach(item => {
    const active = state.calendar.filter(queue => queue.source === "LEDGER" && queue.sourceId === item.id && !["CANCELLED", "COMPLETED"].includes(queue.status));
    if (!active.length) statusConflicts.push({ sourceRecordId: item.id, reason: "ภาระยังเปิดแต่ไม่มีคิวที่ใช้งานอยู่" });
  });
  state.calendar.filter(item => !["CANCELLED", "COMPLETED"].includes(item.status)).forEach(item => {
    const source = findSource(item.source, item.sourceId);
    if (source && ["CANCELLED", "COMPLETED"].includes(source.status)) statusConflicts.push({ queueId: item.id, sourceRecordId: item.sourceId, reason: `คิวยังเปิดแต่ต้นทางเป็น ${source.status}` });
  });

  const unconfirmedRecords = enriched.filter(item => item.event.validation.ownerConfirmation === "UNCONFIRMED").length;
  const blockingIssues = [];
  semanticDuplicates.forEach(([semanticKey, recordIds]) => blockingIssues.push({ code: "SEMANTIC_DUPLICATE", semanticKey, recordIds }));
  if (orphanLedgerTransactions.length) blockingIssues.push({ code: "ORPHAN_LEDGER_TRANSACTION", recordIds: orphanLedgerTransactions.map(tx => tx.id) });
  if (orphanCalendarItems.length) blockingIssues.push({ code: "ORPHAN_CALENDAR_ITEM", recordIds: orphanCalendarItems.map(item => item.id) });
  if (removedRecordIds.length) blockingIssues.push({ code: "MISSING_FROM_CURRENT_SNAPSHOT", recordIds: removedRecordIds });
  if (statusConflicts.length) blockingIssues.push({ code: "CONFLICTING_STATUS", records: statusConflicts });
  if (balanceEvidence.reconciliationStatus !== "PASS") blockingIssues.push({ code: "BALANCE_EQUATION", expected: balanceEvidence.calculation.calculatedBalanceSatang, observed: currentBalanceSatang() });

  const technicalDuplicates = duplicateCount(eventIds) + duplicateCount(idempotencyKeys);
  if (technicalDuplicates) blockingIssues.push({ code: "TECHNICAL_DUPLICATE", count: technicalDuplicates });
  const status = blockingIssues.length ? "VERIFY" : "PASS";
  return {
    status,
    trustLevel: status === "PASS" && unconfirmedRecords === 0 ? "T3_OWNER_SUPPORTED_CURRENT" : "T2_SEMANTICALLY_REVIEWABLE",
    checks: {
      recordEnvelope: "PASS",
      checksum: "PASS",
      technicalDuplicates,
      semanticDuplicates: semanticDuplicates.length,
      orphanLedgerTransactions: orphanLedgerTransactions.length,
      orphanCalendarItems: orphanCalendarItems.length,
      balanceEquation: balanceEvidence.reconciliationStatus,
      removedSincePreviousSnapshot: removedRecordIds.length,
      unconfirmedRecords,
      conflictingStatuses: statusConflicts.length
    },
    blockingIssues
  };
}

async function flowBuildExchange() {
  flowEnsureState();
  const legacy = flowBase.buildExchange();
  const exportedAt = nowIso();
  const snapshotAsOf = state.updatedAt || exportedAt;
  const previousMeta = state.sync.flow.lastExportRecordMeta || {};
  const currentMeta = {};
  const raw = [];

  for (let index = 0; index < legacy.records.length; index++) {
    const sourceRecord = legacy.records[index];
    const record = clone(sourceRecord);
    if (record.type === "CURRENT_BALANCE") Object.assign(record, flowBalanceEvidence(snapshotAsOf));
    const currentRecordHash = await flowSha256(record);
    const previous = previousMeta[record.recordId] || null;
    const effectiveDate = record.dueDate || String(record.createdAt || exportedAt).slice(0, 10);
    const semanticKey = flowSemanticKey(record, effectiveDate);
    const route = flowRouteForRecord(record);
    const effects = flowEffectsForRecord(record);
    const validation = flowOwnerValidation(record);
    const event = {
      schemaVersion: "3.1",
      eventId: `EVT-${legacy.batchId}-${String(index + 1).padStart(4, "0")}`,
      idempotencyKey: `YGPH:${record.source}:${record.recordId}:${record.updatedAt || record.createdAt || state.revision}`,
      semanticKey,
      duplicateGroup: `SEM-${flowChecksum(semanticKey)}`,
      duplicateAssessment: "UNASSESSED",
      changeType: flowChangeType(previous, record, currentRecordHash),
      previousRecordHash: previous?.hash || null,
      currentRecordHash,
      createdAt: exportedAt,
      occurredAt: record.updatedAt || record.createdAt || exportedAt,
      effectiveDate,
      source: record.source,
      owner: flowOwnerForRecord(record),
      eventType: `SNAPSHOT_${record.source}_${record.type}`,
      permission: route.permission,
      route: { from: route.from, to: route.to },
      payload: { record },
      allowedEffects: effects.allowed,
      forbiddenEffects: effects.forbidden,
      relations: flowRelationsForRecord(record),
      relatedRecords: [],
      validation,
      sourceRevision: state.revision
    };
    raw.push({ record, semanticKey, event });
    currentMeta[record.recordId] = { hash: currentRecordHash, status: record.status, source: record.source, type: record.type, updatedAt: record.updatedAt || record.createdAt || exportedAt };
  }

  const semanticGroups = new Map();
  raw.forEach(item => semanticGroups.set(item.semanticKey, [...(semanticGroups.get(item.semanticKey) || []), item.record.recordId]));
  raw.forEach(item => {
    const group = semanticGroups.get(item.semanticKey) || [];
    item.event.duplicateAssessment = group.length > 1 ? "POSSIBLE_DUPLICATE" : "UNIQUE";
    if (group.length > 1) item.event.validation.semantic = "VERIFY";
    item.event.checksum = flowChecksum(item.event);
  });

  const balanceEvidence = flowBalanceEvidence(snapshotAsOf);
  const reconciliation = flowReconciliation(raw, previousMeta, currentMeta, balanceEvidence);
  const baseRevision = state.sync.flow.lastExportSourceRevision;
  const previousPackageId = state.sync.flow.lastExportPackageId;
  const pack = {
    format: FLOW_FORMAT,
    formatVersion: FLOW_FORMAT_VERSION,
    evidenceSchemaVersion: "3.1",
    app: "YGPH FLOW ERA",
    appVersion: FLOW_VERSION,
    coreVersion: typeof RELEASE_VERSION === "string" ? RELEASE_VERSION : "2.1.4",
    packageId: `FLOW-${Date.now()}`,
    packageMode: "SNAPSHOT_AND_DELTA",
    snapshotAsOf,
    exportedAt,
    createdAt: exportedAt,
    baseRevision,
    sourceRevision: state.revision,
    deltaFromRevision: baseRevision,
    deltaToRevision: state.revision,
    previousPackageId,
    timezone: TZ,
    routePolicy: {
      auditCenter: "REPORT_ONLY",
      calendar: "ACTION_HUB_NOT_CASH_OWNER",
      import: "REVIEW_REQUIRED",
      duplicateGuard: "PACKAGE_ID_IDEMPOTENCY_AND_SEMANTIC_KEY"
    },
    events: raw.map(item => item.event),
    delta: {
      changedEventIds: raw.filter(item => item.event.changeType !== "UNCHANGED_SNAPSHOT").map(item => item.event.eventId),
      unchangedEventIds: raw.filter(item => item.event.changeType === "UNCHANGED_SNAPSHOT").map(item => item.event.eventId),
      missingRecordIds: Object.keys(previousMeta).filter(id => !currentMeta[id])
    },
    reconciliation
  };
  pack.checksum = flowChecksum(pack);
  const transformedPack = YGPHRuntime.transform("exchange", pack, { stateRevision: state.revision });
  flowPendingExportLineage = { packageId: transformedPack.packageId, sourceRevision: state.revision, recordMeta: currentMeta, snapshotAsOf };
  return transformedPack;
}
function flowRouteAllowed(event) {
  const permission = String(event.permission || "READ");
  const from = String(event.route?.from || event.source || "");
  const to = String(event.route?.to || "");
  if (permission === "READ") return true;
  if (permission === "APPLY") return false;
  if (permission === "PROPOSE" && ["HEPHAESTUS", "GO", "REVIEW_CENTER"].includes(from) && ["STORE", "RIDE", "LEDGER", "CALENDAR"].includes(to)) return true;
  if (permission === "CREATE") {
    if (from === "STORE" && ["CALENDAR", "LEDGER"].includes(to)) return true;
    if (from === "RIDE" && ["CALENDAR", "LEDGER"].includes(to)) return true;
    if (from === "LEDGER" && to === "CALENDAR") return true;
  }
  return false;
}

function flowValidateImport(value) {
  flowEnsureState();
  if (value?.format === "YGPH_EXCHANGE") return flowBase.validateImportProposal(value);
  if (!value || value.format !== FLOW_FORMAT || Number(value.formatVersion) !== FLOW_FORMAT_VERSION || !Array.isArray(value.events)) {
    throw new Error("ไฟล์ไม่ใช่ YGPH FLOW EVENT EXCHANGE v3");
  }
  if (value.checksum !== flowChecksum(value)) throw new Error("Checksum ของแพ็กเกจไม่ตรง");
  if (state.sync.flow.processedPackageIds.includes(value.packageId)) {
    return { batchId: value.packageId, changes: [], blocked: [{ title: value.packageId, reason: "แพ็กเกจนี้ถูกนำเข้าแล้ว" }], importedAt: nowIso(), flowEventKeys: [], flowPackageId: value.packageId };
  }
  const records = [];
  const blocked = [];
  const eventKeys = [];
  const seenKeys = new Set();
  for (const event of value.events) {
    const title = event?.payload?.record?.title || event?.eventId || "Event";
    if (!event || !event.eventId || !event.idempotencyKey || !event.owner || !event.eventType || !event.route) {
      blocked.push({ title, reason: "Event Envelope ไม่ครบ" });
      continue;
    }
    if (event.checksum !== flowChecksum(event)) {
      blocked.push({ title, reason: "Checksum ของ Event ไม่ตรง" });
      continue;
    }
    if (!flowRouteAllowed(event)) {
      blocked.push({ title, reason: `Route ไม่อนุญาต: ${event.route.from} → ${event.route.to} (${event.permission})` });
      continue;
    }
    if (seenKeys.has(event.idempotencyKey)) {
      blocked.push({ title, reason: "idempotencyKey ซ้ำภายในไฟล์" });
      continue;
    }
    seenKeys.add(event.idempotencyKey);
    if (state.sync.flow.processedEventKeys.includes(event.idempotencyKey)) {
      blocked.push({ title, reason: "Event นี้ถูกนำเข้าแล้ว" });
      continue;
    }
    const record = event.payload?.record;
    if (!record || typeof record !== "object") {
      blocked.push({ title, reason: "ไม่พบ payload.record" });
      continue;
    }
    if (event.permission === "APPLY") {
      blocked.push({ title, reason: "ไฟล์ภายนอกไม่มีสิทธิ์ APPLY" });
      continue;
    }
    records.push(record);
    eventKeys.push(event.idempotencyKey);
  }
  const translated = flowBase.validateImportProposal({
    format: "YGPH_EXCHANGE",
    version: 1,
    batchId: value.packageId,
    generatedAt: value.exportedAt || value.createdAt,
    revision: value.sourceRevision,
    records
  });
  const packageIssues = Array.isArray(value.reconciliation?.blockingIssues)
    ? value.reconciliation.blockingIssues.map(issue => ({ title: issue.code || "RECONCILIATION", reason: JSON.stringify(issue) }))
    : [];
  translated.blocked = [...blocked, ...packageIssues, ...(translated.blocked || [])];
  translated.flowTrustLevel = value.reconciliation?.trustLevel || "T1_TECHNICALLY_VALID";
  translated.flowEventKeys = eventKeys;
  translated.flowPackageId = value.packageId;
  return translated;
}

async function flowDownloadExport() {
  const exported = await flowBuildExchange();
  state.sync.lastExportAt = exported.exportedAt;
  state.sync.lastBatchId = exported.packageId;
  if (flowPendingExportLineage) {
    state.sync.flow.lastExportPackageId = flowPendingExportLineage.packageId;
    state.sync.flow.lastExportSourceRevision = flowPendingExportLineage.sourceRevision;
    state.sync.flow.lastExportRecordMeta = flowPendingExportLineage.recordMeta;
    state.sync.flow.lastSnapshotAsOf = flowPendingExportLineage.snapshotAsOf;
  }
  await saveEncryptedState();
  downloadJson(exported, `YGPH_FLOW_EVIDENCE_${localISO()}.json`);
  renderAll();
  toast(`สร้าง Evidence Package ${exported.reconciliation.trustLevel}`);
}

async function flowReadImportFile() {
  try {
    const file = byId("importProposalInput").files[0];
    if (!file) return;
    state.sync.pendingImport = flowValidateImport(JSON.parse(await file.text()));
    renderAll();
    toast("อ่าน Route แล้ว กรุณาตรวจ Review Center · ยังไม่เขียนข้อมูล");
  } catch (error) {
    toast(error.message || "ไฟล์ไม่รองรับ");
  } finally {
    byId("importProposalInput").value = "";
  }
}

function flowApplyPendingImport() {
  const pending = state.sync.pendingImport;
  if (pending) {
    state.sync.flow.pendingApplyKeys = pending.flowEventKeys || [];
    state.sync.flow.pendingApplyPackageId = pending.flowPackageId || null;
  }
  flowBase.applyPendingImport();
}

function flowCancelPendingImport() {
  if (state?.sync?.flow) {
    state.sync.flow.pendingApplyKeys = [];
    state.sync.flow.pendingApplyPackageId = null;
  }
  flowBase.cancelPendingImport();
}

function flowPrepareCommit(target) {
  if (target?.sync?.flow?.pendingApplyKeys?.length && !target.sync.pendingImport) {
    target.sync.flow.processedEventKeys = [...new Set([...target.sync.flow.processedEventKeys, ...target.sync.flow.pendingApplyKeys])].slice(-5000);
    if (target.sync.flow.pendingApplyPackageId) {
      target.sync.flow.processedPackageIds = [...new Set([...target.sync.flow.processedPackageIds, target.sync.flow.pendingApplyPackageId])].slice(-500);
    }
    target.sync.flow.pendingApplyKeys = [];
    target.sync.flow.pendingApplyPackageId = null;
  }
  return target;
}

globalThis.flowPrepareCommit = flowPrepareCommit;

function flowFinding(severity, category, source, affectedRecords, observed, expected, evidence = "") {
  return {
    findingId: `F-${String((flowLastAudit?.findings?.length || 0) + 1).padStart(3, "0")}`,
    severity, category, source,
    affectedRecords: Array.isArray(affectedRecords) ? affectedRecords : [affectedRecords].filter(Boolean),
    observed, expected, evidence,
    allowedAction: "REPORT_ONLY"
  };
}


function flowIsExplicitPartialCaseSchedule(obligation, queues) {
  const detail = String(obligation?.detail || "");
  const importMeta = obligation?.importMeta && typeof obligation.importMeta === "object" ? obligation.importMeta : {};
  const structuredMode = [obligation?.scheduleMode, importMeta.scheduleMode].includes("CASE_EXPOSURE_PARTIAL_QUEUE");
  const explicitTextMode = detail.includes("ยอดค้างทั้งเคส") && detail.includes("คิวนี้เฉพาะงวด");
  const original = Number(obligation?.originalSatang || 0);
  const remaining = Number(obligation?.remainingSatang ?? original);
  const scheduled = queues.reduce((sum, queue) => sum + Number(queue.amountSatang || 0), 0);
  const verifyLocked = obligation?.status === "VERIFY" && queues.length > 0 && queues.every(queue => queue.status === "VERIFY");
  return (structuredMode || explicitTextMode)
    && verifyLocked
    && Number.isSafeInteger(original)
    && Number.isSafeInteger(remaining)
    && Number.isSafeInteger(scheduled)
    && original > 0
    && scheduled > 0
    && scheduled < original
    && scheduled <= remaining;
}

function flowRunAudit() {
  if (!state) return null;
  const findings = [];
  const push = (severity, category, source, records, observed, expected, evidence = "") => {
    findings.push({
      findingId: `F-${String(findings.length + 1).padStart(3, "0")}`,
      severity, category, source,
      affectedRecords: Array.isArray(records) ? records : [records].filter(Boolean),
      observed, expected, evidence,
      allowedAction: "REPORT_ONLY"
    });
  };

  const allIds = [];
  const collect = (items, label) => (items || []).forEach(item => {
    if (!item?.id) push("ERROR", "IDENTITY", label, [], "พบ Record ไม่มี id", "ทุก Record ต้องมี id");
    else allIds.push([item.id, label]);
  });
  collect(state.store.sales, "STORE");
  collect(state.store.purchases, "STORE");
  collect(state.store.withdrawals, "STORE");
  collect(state.ride.jobs, "RIDE");
  collect(state.ride.expenses, "RIDE");
  collect(state.ride.creditWithdrawals, "RIDE");
  collect(state.ledger.transactions, "LEDGER");
  collect(state.ledger.obligations, "LEDGER");
  collect(state.calendar, "CALENDAR");

  const idCount = new Map();
  allIds.forEach(([id, label]) => idCount.set(id, [...(idCount.get(id) || []), label]));
  idCount.forEach((labels, id) => {
    if (labels.length > 1) push("BLOCKER", "IDENTITY", "SYSTEM", [id], `id ซ้ำ ${labels.join(", ")}`, "Record id ต้องไม่ซ้ำทั้งระบบ");
  });

  if (!Number.isSafeInteger(Number(state.store.stockQty)) || Number(state.store.stockQty) < 0) {
    push("BLOCKER", "FORMULA", "STORE", [], `stockQty=${state.store.stockQty}`, "stockQty ต้องเป็นจำนวนเต็มไม่ติดลบ");
  }
  if (Number(state.store.stockQty) === 0 && Number(state.store.stockValueSatang) !== 0) {
    push("ERROR", "FORMULA", "STORE", [], `จำนวนสต็อก 0 แต่มูลค่า ${state.store.stockValueSatang}`, "จำนวน 0 ต้องมีมูลค่า 0");
  }

  const actionKeys = new Map();
  state.ledger.transactions.forEach(tx => {
    if (!tx.actionKey) push("WARNING", "AUDIT_TRAIL", "LEDGER", [tx.id], "ธุรกรรมไม่มี actionKey", "เงินจริงทุกครั้งควรมี actionKey");
    else actionKeys.set(tx.actionKey, [...(actionKeys.get(tx.actionKey) || []), tx.id]);
  });
  actionKeys.forEach((ids, key) => {
    if (ids.length > 1) push("BLOCKER", "IDEMPOTENCY", "LEDGER", ids, `actionKey ซ้ำ ${key}`, "หนึ่ง actionKey สร้างเงินจริงได้ครั้งเดียว");
  });

  const activeQueue = item => !["COMPLETED", "CANCELLED"].includes(item.status);
  state.calendar.forEach(item => {
    const source = findSource(item.source, item.sourceId);
    if (!source) push("ERROR", "ROUTE", "CALENDAR", [item.id, item.sourceId], "คิวไม่พบข้อมูลต้นทาง", "ทุกคิวต้องย้อนถึง Source Owner");
    if (!validISODate(item.due)) push("BLOCKER", "TIME", "CALENDAR", [item.id], `due=${item.due}`, "วันกำหนดต้องเป็น ISO date ที่มีจริง");
    if (Number(item.paidSatang || 0) > Number(item.amountSatang || 0)) push("BLOCKER", "FORMULA", "CALENDAR", [item.id], "ยอดทำแล้วมากกว่ายอดคิว", "paidSatang ≤ amountSatang");
    if (item.status === "COMPLETED" && (!item.completedAt || item.cancelledAt)) push("ERROR", "STATE", "CALENDAR", [item.id], "COMPLETED แต่เวลาปิดขัดกัน", "COMPLETED ต้องมี completedAt และไม่มี cancelledAt");
    if (item.status === "CANCELLED" && (!item.cancelledAt || item.completedAt)) push("ERROR", "STATE", "CALENDAR", [item.id], "CANCELLED แต่เวลาปิดขัดกัน", "CANCELLED ต้องมี cancelledAt และไม่มี completedAt");
    if (source && Number(item.expectedRevision || 0) !== Number(source.revision || 0) && activeQueue(item)) {
      push("WARNING", "FRESHNESS", item.source, [item.id, item.sourceId], `คิวอ่าน revision ${item.expectedRevision} แต่ต้นทางเป็น ${source.revision}`, "ก่อน Action ต้องยืนยัน Source revision ล่าสุด");
    }
  });

  state.store.sales.filter(s => s.status !== "CANCELLED" && Number(s.outstandingSatang || 0) > 0).forEach(sale => {
    const queues = state.calendar.filter(q => activeQueue(q) && q.source === "STORE" && q.sourceId === sale.id && q.actionType === "RECEIVE_CUSTOMER_PAYMENT");
    if (queues.length !== 1) push("ERROR", "ROUTE", "STORE", [sale.id, ...queues.map(q => q.id)], `ลูกหนี้ ${sale.outstandingSatang} มีคิว ${queues.length}`, "ลูกหนี้เปิดต้องมีคิวรับเงินหนึ่งรายการ");
  });

  state.ride.jobs.filter(j => j.status !== "CANCELLED").forEach(job => {
    const cashTx = state.ledger.transactions.filter(tx => tx.source === "RIDE" && tx.sourceId === job.id && !tx.reversedBy);
    if (job.paymentMode === "CASH" && cashTx.length !== 1) push("ERROR", "ROUTE", "RIDE", [job.id, ...cashTx.map(tx => tx.id)], `งานเงินสดมี Ledger transaction ${cashTx.length}`, "งานเงินสดต้องสร้างเงินจริงหนึ่งครั้ง");
    if (job.paymentMode === "CREDIT" && cashTx.length) push("BLOCKER", "ROUTE", "RIDE", [job.id, ...cashTx.map(tx => tx.id)], "งานเครดิตเพิ่มเงินจริงก่อนรับเงิน", "เครดิตต้องอยู่ RIDE/CALENDAR จนยืนยันรับเงินจริง");
  });

  state.ride.creditWithdrawals.filter(item => item.status === "PENDING").forEach(item => {
    const queues = state.calendar.filter(q => activeQueue(q) && q.source === "RIDE" && q.sourceId === item.id && q.actionType === "CONFIRM_RIDE_CREDIT_WITHDRAWAL");
    if (queues.length !== 1) push("ERROR", "ROUTE", "RIDE", [item.id, ...queues.map(q => q.id)], `ยอดกำลังเบิกมีคิว ${queues.length}`, "ยอดกำลังเบิกต้องมีคิวยืนยันเงินเข้าหนึ่งรายการ");
  });

  state.ledger.obligations.filter(o => !["CANCELLED", "COMPLETED"].includes(o.status)).forEach(obligation => {
    const queues = state.calendar.filter(q => q.source === "LEDGER" && q.sourceId === obligation.id && ["PAY_OBLIGATION", "PAY_OBLIGATION_INSTALLMENT"].includes(q.actionType));
    const sum = queues.reduce((n, q) => n + Number(q.amountSatang || 0), 0);
    const expectedCount = Number(obligation.installmentCount || 1);
    const original = Number(obligation.originalSatang || 0);
    const scheduleMatchesFullObligation = queues.length === expectedCount && sum === original;
    if (!scheduleMatchesFullObligation) {
      if (flowIsExplicitPartialCaseSchedule(obligation, queues)) {
        push(
          "INFO",
          "RELATION",
          "LEDGER",
          [obligation.id, ...queues.map(q => q.id)],
          `ยอดภาระทั้งเคส ${original} แต่คิว VERIFY รอบนี้รวม ${sum}`,
          "อนุญาตคิวเฉพาะงวดเมื่อระบุความหมายชัดเจน ล็อก VERIFY และยอดคิวไม่เกินยอดคงเหลือ",
          "ไม่ถือเป็นสูตรผิด; ต้อง refresh Case View และยืนยันยอดก่อนจ่าย"
        );
      } else {
        push(
          "ERROR",
          "FORMULA",
          "LEDGER",
          [obligation.id, ...queues.map(q => q.id)],
          `ภาระ ${obligation.installmentCount} งวด แต่พบ ${queues.length} คิว รวม ${sum}`,
          "จำนวนคิวและผลรวมต้องตรงยอดภาระ หรือระบุเป็น CASE_EXPOSURE_PARTIAL_QUEUE พร้อมสถานะ VERIFY"
        );
      }
    }
    const remaining = Math.max(0, original - Number(obligation.paidSatang || 0));
    if (remaining !== Number(obligation.remainingSatang || 0)) push("BLOCKER", "FORMULA", "LEDGER", [obligation.id], `remaining=${obligation.remainingSatang}`, `remaining ต้องเท่ากับ ${remaining}`);
  });

  const severityCounts = { BLOCKER: 0, ERROR: 0, WARNING: 0, INFO: 0 };
  findings.forEach(item => severityCounts[item.severity]++);
  const status = severityCounts.BLOCKER ? "BLOCKED" : severityCounts.ERROR ? "ERROR" : severityCounts.WARNING ? "WARNING" : "PASS";
  flowLastAudit = {
    format: "YGPH_SYSTEM_ROUTE_AUDIT",
    version: 3,
    generatedAt: nowIso(),
    appVersion: FLOW_VERSION,
    coreVersion: typeof RELEASE_VERSION === "string" ? RELEASE_VERSION : "2.1.4",
    stateSchema: state.schema,
    stateRevision: state.revision,
    status,
    counts: severityCounts,
    scope: ["FORMULA", "OWNER", "ROUTE", "SEQUENCE", "RELATION", "DUPLICATE", "AUDIT_TRAIL"],
    policy: { repair: "DISABLED", allowedAction: "REPORT_ONLY" },
    manifest: {
      store: { sales: state.store.sales.length, purchases: state.store.purchases.length, withdrawals: state.store.withdrawals.length },
      ride: { jobs: state.ride.jobs.length, expenses: state.ride.expenses.length, creditWithdrawals: state.ride.creditWithdrawals.length },
      ledger: { transactions: state.ledger.transactions.length, obligations: state.ledger.obligations.length },
      calendar: { records: state.calendar.length }
    },
    findings
  };
  flowLastAudit = YGPHRuntime.transform("audit", flowLastAudit, { stateRevision: state.revision });
  flowRenderAuditStatus();
  return flowLastAudit;
}

function flowAuditHtml(report) {
  const rows = report.findings.length ? report.findings.map(item => `
    <article>
      <h3>${esc(item.findingId)} · ${esc(item.severity)} · ${esc(item.category)}</h3>
      <p><b>ต้นทาง:</b> ${esc(item.source)}</p>
      <p><b>รายการ:</b> ${esc(item.affectedRecords.join(", ") || "—")}</p>
      <p><b>พบ:</b> ${esc(item.observed)}</p>
      <p><b>คาดว่า:</b> ${esc(item.expected)}</p>
      ${item.evidence ? `<p><b>หลักฐาน:</b> ${esc(item.evidence)}</p>` : ""}
      <p><b>อำนาจ:</b> REPORT_ONLY</p>
    </article>`).join("") : "<p>ไม่พบความผิดปกติจากกฎที่ตรวจในรุ่นนี้</p>";
  return `<!doctype html><html lang="th"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>YGPH Audit ${report.generatedAt}</title><style>body{font-family:system-ui,sans-serif;background:#f4f8f5;color:#17352b;max-width:900px;margin:auto;padding:24px}header,article{background:white;border:1px solid #dce9e2;border-radius:18px;padding:18px;margin:12px 0}h1{color:#176b4f}small{color:#6c8179}.counts{display:flex;gap:10px;flex-wrap:wrap}.counts b{padding:8px 12px;background:#eaf7f0;border-radius:12px}</style><body><header><h1>YGPH FLOW ERA — System & Route Audit</h1><p>สถานะ: <b>${report.status}</b></p><p>ตรวจเมื่อ ${report.generatedAt}</p><div class="counts">${Object.entries(report.counts).map(([k,v])=>`<b>${k}: ${v}</b>`).join("")}</div><small>ศูนย์ตรวจมีสิทธิ์อ่านและรายงานเท่านั้น ไม่มีการซ่อมหรือแก้ข้อมูลอัตโนมัติ</small></header>${rows}</body></html>`;
}

function flowDownloadAuditJson() {
  const report = flowLastAudit || flowRunAudit();
  downloadJson(report, `YGPH_SYSTEM_ROUTE_AUDIT_${localISO()}.json`);
  toast("ส่งออกรายงาน JSON แล้ว");
}

function flowDownloadAuditHtml() {
  const report = flowLastAudit || flowRunAudit();
  const blob = new Blob([flowAuditHtml(report)], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `YGPH_SYSTEM_ROUTE_AUDIT_${localISO()}.html`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast("ส่งออกรายงาน HTML แล้ว");
}

function flowRenderAuditStatus() {
  const target = byId("flowAuditStatus");
  if (!target) return;
  const report = flowLastAudit;
  if (!report) {
    target.innerHTML = '<div class="flow-note">ยังไม่ได้ตรวจในรอบนี้ ระบบตรวจมีสิทธิ์อ่านและออกรายงานเท่านั้น</div>';
    return;
  }
  target.innerHTML = `<div class="flow-audit-summary">
    <div><small>BLOCKER</small><b>${report.counts.BLOCKER}</b></div>
    <div><small>ERROR</small><b>${report.counts.ERROR}</b></div>
    <div><small>WARNING</small><b>${report.counts.WARNING}</b></div>
    <div><small>สถานะ</small><b>${report.status}</b></div>
  </div><small>State revision ${report.stateRevision} · ${displayTime(report.generatedAt)}</small>`;
}

function flowInstallDom() {
  if (document.documentElement.dataset.flowInstalled) return;
  document.documentElement.dataset.flowInstalled = "true";

  const headerHome = byId("headerHome");
  const headerLock = byId("headerLockBtn");
  if (headerHome) headerHome.classList.add("hidden");
  if (headerLock) headerLock.classList.add("hidden");
  const brand = document.querySelector(".brand");
  if (brand && !byId("flowHeaderSettings")) {
    const button = document.createElement("button");
    button.id = "flowHeaderSettings";
    button.className = "flow-header-settings";
    button.type = "button";
    button.innerHTML = `${flowIcon("settings")}<span>ตั้งค่า</span>`;
    button.onclick = () => showPage("settings");
    brand.appendChild(button);
  }

  document.querySelector(".brand-mark").innerHTML = flowIcon("app");
  const summaryGrid = document.querySelector("#homePage .source-grid");
  summaryGrid?.classList.add("flow-summary-grid");
  const ledgerCard = summaryGrid?.querySelector(".source-card.ledger");
  if (ledgerCard && summaryGrid.firstElementChild !== ledgerCard) summaryGrid.prepend(ledgerCard);
  const sourceTitles = {
    store: ["ร้านค้า", "ยอดขายวันนี้"],
    ride: ["วิ่งงาน", "รายได้วันนี้"],
    ledger: ["เงินปัจจุบัน", "เงินจริงที่มีอยู่"]
  };
  Object.entries(sourceTitles).forEach(([name, labels]) => {
    const card = summaryGrid?.querySelector(`.${name}`);
    if (!card) return;
    card.querySelector("i").innerHTML = flowIcon(name);
    card.querySelector("b").textContent = labels[0];
    card.querySelector("small").textContent = labels[1];
  });

  const hub = document.querySelector("#homePage .hub-card");
  if (hub) {
    hub.querySelector("h2").textContent = "สิ่งที่ต้องจัดการ";
    hub.querySelector("p").textContent = "เรียงตามความเร่งด่วนจากข้อมูลในปฏิทิน";
    const labels = ["เลยกำหนด", "ถึงกำหนดวันนี้", "รายการถัดไป", "ผิดปกติ"];
    const classes = ["flow-overdue", "flow-today", "flow-next", "flow-anomaly"];
    [...hub.querySelectorAll(".hub-mini")].forEach((node, index) => {
      node.querySelector("small").textContent = labels[index];
      node.classList.add(classes[index]);
    });
    if (!byId("flowOverdueAlert")) {
      const alert = document.createElement("div");
      alert.id = "flowOverdueAlert";
      alert.className = "flow-alert hidden";
      hub.querySelector(".hub-grid").before(alert);
    }
    if (!byId("flowHomeTasks")) {
      const list = document.createElement("div");
      list.id = "flowHomeTasks";
      list.className = "flow-task-list";
      hub.querySelector(".hub-open").before(list);
    }
  }

  const exchange = document.querySelector("#homePage .exchange-card");
  exchange?.classList.add("flow-compact");

  if (!byId("flowLatestCash")) {
    const latest = document.createElement("div");
    latest.id = "flowLatestCash";
    latest.className = "card content-card flow-real-cash-card";
    latest.innerHTML = '<h3>เงินจริงล่าสุด <small>5 รายการ</small></h3><div id="flowLatestCashList" class="flow-latest-list"></div>';
    exchange?.before(latest);
  }

  const ledgerHeroMinis = [...document.querySelectorAll("#ledgerPage .hero-grid .mini")];
  [ledgerHeroMinis[3], ledgerHeroMinis[5]].forEach(node => node?.classList.add("flow-hidden-duplicate"));
  const debtCard = byId("debtList")?.closest(".card");
  debtCard?.classList.add("flow-hidden-duplicate");
  if (!byId("flowLedgerCalendarRoute")) {
    const routeCard = document.createElement("div");
    routeCard.id = "flowLedgerCalendarRoute";
    routeCard.className = "card content-card flow-ledger-route-card";
    routeCard.innerHTML = '<h3>ภาระและรายการค้าง</h3><p>การเงินแสดงเฉพาะเงินจริงที่เกิดขึ้นแล้ว รายการรอรับ รอจ่าย และงวดค้างจัดการที่ปฏิทิน</p><button class="secondary-btn wide">เปิดปฏิทิน</button>';
    routeCard.querySelector("button").onclick = () => showPage("calendar");
    document.querySelector("#ledgerPage .action-row")?.after(routeCard);
  }

  const calHero = document.querySelector("#calendarPage .hero");
  if (calHero && !byId("flowCalendarFocus")) {
    const focus = document.createElement("div");
    focus.id = "flowCalendarFocus";
    focus.className = "flow-calendar-focus";
    calHero.appendChild(focus);
    let startX = 0;
    focus.addEventListener("touchstart", event => { startX = event.changedTouches[0].clientX; }, { passive: true });
    focus.addEventListener("touchend", event => {
      const delta = event.changedTouches[0].clientX - startX;
      if (Math.abs(delta) < 45) return;
      flowCalendarIndex += delta < 0 ? 1 : -1;
      flowRenderCalendarFocus();
    }, { passive: true });
  }
  byId("queueList")?.closest(".card")?.classList.add("flow-queue-list-card");

  const settingsPage = byId("settingsPage");
  if (settingsPage && !byId("flowAuditCard")) {
    const audit = document.createElement("div");
    audit.id = "flowAuditCard";
    audit.className = "card content-card flow-settings-card";
    audit.innerHTML = `<h3>ศูนย์ตรวจสอบระบบและเส้นทาง</h3>
      <p>ตรวจสูตร เจ้าของข้อมูล Route ลำดับ ความสัมพันธ์ และรายการซ้ำ โดยไม่ซ่อมหรือแก้ข้อมูลเอง</p>
      <div id="flowAuditStatus"></div>
      <div class="flow-audit-actions">
        <button id="flowRunAuditBtn" class="primary-btn">ตรวจเต็มระบบ</button>
        <button id="flowAuditJsonBtn" class="secondary-btn">รายงาน JSON</button>
        <button id="flowAuditHtmlBtn" class="secondary-btn">รายงาน HTML</button>
      </div>`;
    settingsPage.querySelector(".hero")?.after(audit);
    byId("flowRunAuditBtn").onclick = () => { flowRunAudit(); toast("ตรวจระบบและเส้นทางแล้ว"); };
    byId("flowAuditJsonBtn").onclick = flowDownloadAuditJson;
    byId("flowAuditHtmlBtn").onclick = flowDownloadAuditHtml;
  }
  if (settingsPage && !byId("flowLockNowBtn")) {
    const securityCard = [...settingsPage.querySelectorAll(".card")].find(card => card.textContent.includes("ความปลอดภัยและการติดตั้ง"));
    const lock = document.createElement("button");
    lock.id = "flowLockNowBtn";
    lock.className = "secondary-btn wide";
    lock.textContent = "ล็อกแอปตอนนี้";
    lock.onclick = () => lockApp();
    securityCard?.prepend(lock);
  }

  const rideHero = document.querySelector("#ridePage .hero");
  if (rideHero && !byId("flowRoundPanel")) {
    const panel = document.createElement("div");
    panel.id = "flowRoundPanel";
    panel.className = "flow-round-panel";
    rideHero.appendChild(panel);
  }

  const flowButtonLabels = {
    addSaleBtn: "ขายสินค้า", addPurchaseBtn: "รับสินค้าเข้า", withdrawStockBtn: "เบิกสินค้า",
    toggleRoundBtn: "เพิ่มรอบ", withdrawRideCreditBtn: "เบิกเครดิต", addRideExpenseBtn: "เพิ่มค่าใช้จ่าย",
    addRideJobBtn: "เพิ่มงาน", addOtherIncomeBtn: "รายรับอื่น", addDebtBtn: "เพิ่มภาระ", addExpenseBtn: "เพิ่มรายจ่าย"
  };
  Object.entries(flowButtonLabels).forEach(([id, label]) => { const button = byId(id); if (button) button.textContent = label; });

  const navIcons = { store: "store", ride: "ride", home: "home", ledger: "ledger", calendar: "calendar" };
  document.querySelectorAll(".nav-btn").forEach(button => {
    const icon = navIcons[button.dataset.page];
    if (icon) button.querySelector("i").innerHTML = flowIcon(icon);
  });

  byId("exportJsonBtn").onclick = flowDownloadExport;
  byId("homeExportBtn").onclick = flowDownloadExport;
  byId("importProposalInput").onchange = flowReadImportFile;
  byId("applyImportBtn").onclick = flowApplyPendingImport;
  byId("cancelImportBtn").onclick = flowCancelPendingImport;
}

function flowNeedsVerification(item) {
  if (!item || ["COMPLETED", "CANCELLED"].includes(item.status)) return false;
  return item.status === "VERIFY"
    || integrityGate(item).state !== "TRUSTED"
    || freshnessGate(item).state !== "FRESH";
}

function flowQueueDisplayAmount(item) {
  const amount = Math.max(0, Number(item?.amountSatang || 0));
  const paid = Math.max(0, Number(item?.paidSatang || 0));
  if (item?.status === "COMPLETED") return { value: paid > 0 ? paid : amount, label: paid > 0 ? "ยอดที่ดำเนินการแล้ว" : "ยอดเดิม" };
  if (item?.status === "CANCELLED") return { value: amount, label: "ยอดเดิมก่อนยกเลิก" };
  return { value: Math.max(0, amount - paid), label: paid > 0 ? "ยอดคงเหลือ" : "ยอดตามแผน" };
}

function flowCalendarDiagnostic(selected = selectedDate) {
  const all = Array.isArray(state?.calendar) ? state.calendar : [];
  const selectedItems = selected ? all.filter(item => item.due === selected) : [];
  return {
    checkedAt: nowIso(), selectedDate: selected || null, calendarMonth,
    totalCalendarRecords: all.length,
    selectedDateRecords: selectedItems.length,
    selectedDateRecordIds: selectedItems.map(item => item.id),
    selectedDateStatuses: selectedItems.map(item => item.status),
    missingSources: selectedItems.filter(item => !findSource(item.source, item.sourceId)).map(item => ({ queueId: item.id, source: item.source, sourceId: item.sourceId })),
    closedRecords: selectedItems.filter(item => ["COMPLETED", "CANCELLED"].includes(item.status)).map(item => ({ queueId: item.id, status: item.status, amountSatang: Number(item.amountSatang || 0), paidSatang: Number(item.paidSatang || 0), displayAmountSatang: flowQueueDisplayAmount(item).value }))
  };
}

function flowActiveQueues() {
  return state.calendar.filter(item => !["COMPLETED", "CANCELLED"].includes(item.status));
}

function flowRenderHome() {
  const today = localISO();
  const active = flowActiveQueues().filter(item => item.reminderEnabled !== false);
  const overdue = active.filter(item => item.due < today).sort((a,b) => a.due.localeCompare(b.due));
  const dueToday = active.filter(item => item.due === today);
  const nearDue = active.filter(item => item.due > today).sort((a,b) => a.due.localeCompare(b.due)).slice(0, 5);
  const anomalies = active.filter(flowNeedsVerification);
  const overdueTotal = overdue.reduce((sum,item) => sum + flowQueueDisplayAmount(item).value, 0);

  byId("homeWaitIn").textContent = overdue.length;
  byId("homeWaitOut").textContent = dueToday.length;
  byId("homeVerify").textContent = nearDue.length;
  byId("homeCancelled").textContent = anomalies.length;
  document.querySelector("#homePage .hub-grid")?.classList.add("flow-home-summary-hidden");

  const alert = byId("flowOverdueAlert");
  if (overdue.length) {
    const oldest = overdue.map(item => Math.floor((new Date(`${today}T12:00:00`) - new Date(`${item.due}T12:00:00`)) / 86400000)).sort((a,b)=>b-a)[0] || 0;
    alert.className = "flow-alert";
    alert.innerHTML = `<b>ยอดเลยกำหนด ${money(overdueTotal)} บาท</b><span>${overdue.length} รายการ · เก่าสุด ${oldest} วัน</span>`;
  } else {
    alert.className = "flow-alert flow-alert-clear";
    alert.innerHTML = "<b>ไม่มียอดเลยกำหนด</b><span>รายการวันนี้และใกล้ถึงกำหนดแสดงด้านล่าง</span>";
  }

  let anomaly = byId("flowSystemAnomaly");
  if (!anomaly) {
    anomaly = document.createElement("div"); anomaly.id = "flowSystemAnomaly"; anomaly.className = "flow-system-warning hidden";
    byId("flowHomeTasks")?.before(anomaly);
  }
  if (anomalies.length) {
    anomaly.classList.remove("hidden");
    anomaly.innerHTML = `<b>คำเตือนระบบ ${anomalies.length} รายการ</b><span>ใช้เกณฑ์เดียวกับ “ต้องตรวจสอบ” ในหน้าปฏิทิน</span>`;
  } else { anomaly.classList.add("hidden"); anomaly.innerHTML = ""; }

  const priorities = [...overdue, ...dueToday, ...nearDue].filter((item,index,array) => array.findIndex(row => row.id === item.id) === index).slice(0,5);
  byId("flowHomeTasks").innerHTML = priorities.length ? priorities.map(item => {
    const kind = item.due < today ? "overdue" : item.due === today ? "today" : "next";
    const source = findSource(item.source, item.sourceId);
    const name = item.displayName || source?.name || source?.customer || source?.note || actionLabel(item.actionType);
    const amount = flowQueueDisplayAmount(item);
    return `<button class="flow-task-row ${kind}" data-flow-task="${item.id}"><span class="flow-task-dot"></span><span class="flow-task-copy"><b>${esc(name)}</b><small>${dateTH(item.due)} · ${sourceLabel(item.source)}</small></span><span class="flow-task-money"><strong>${money(amount.value)} ฿</strong><small>${amount.label}</small></span></button>`;
  }).join("") : '<div class="empty">ไม่มีรายการค้างที่ต้องจัดการ</div>';
  document.querySelectorAll("[data-flow-task]").forEach(button => button.onclick = () => {
    const item = findQueue(button.dataset.flowTask);
    selectedDate = item?.due || null;
    if (selectedDate) calendarMonth = selectedDate.slice(0, 7);
    flowCalendarIndex = 0;
    showPage("calendar");
  });

  const latest = sortNewest(state.ledger.transactions.filter(isRealCashTransaction)).slice(0,5);
  byId("flowLatestCashList").innerHTML = latest.length ? latest.map(tx => `<div class="flow-tx-row"><span>${tx.direction === "IN" ? "↘" : "↗"}</span><span><b>${esc(tx.label)}</b><small>${sourceLabel(tx.source)} · ${displayTime(tx.createdAt)}</small></span><strong class="${tx.direction === "IN" ? "green" : "red"}">${tx.direction === "IN" ? "+" : "−"}${money(tx.amountSatang)} ฿</strong></div>`).join("") : '<div class="empty">ยังไม่มีเงินจริงเข้า–ออก</div>';
}
function flowRenderRide() {
  const round = state.ride.currentRound;
  const panel = byId("flowRoundPanel");
  const actionRow = byId("toggleRoundBtn")?.closest(".action-row");
  const jobCard = byId("rideAmount")?.closest(".card");
  const addExpenseBtn = byId("addRideExpenseBtn");
  const startBtn = byId("toggleRoundBtn");
  const creditBtn = byId("withdrawRideCreditBtn");
  if (startBtn) startBtn.textContent = "เพิ่มรอบ";
  if (creditBtn) creditBtn.textContent = "เบิกเครดิต";
  if (addExpenseBtn) addExpenseBtn.textContent = "เพิ่มค่าใช้จ่าย";
  if (byId("addRideJobBtn")) byId("addRideJobBtn").textContent = "เพิ่มงาน";

  if (!round) {
    actionRow?.classList.remove("flow-round-active-actions"); actionRow?.classList.add("flow-round-idle-actions");
    startBtn?.classList.remove("hidden"); creditBtn?.classList.remove("hidden"); addExpenseBtn?.classList.add("hidden"); jobCard?.classList.add("hidden");
    const lastRound = sortNewest(state.ride.rounds || [])[0];
    if (!panel) return;
    if (!lastRound) { panel.innerHTML = '<div class="flow-round-idle"><b>ยังไม่เริ่มรอบ</b><small>เลือก “เพิ่มรอบ” เพื่อเปิดหน้าจับเวลา งาน ระยะ และค่าใช้จ่าย</small></div>'; return; }
    const jobs = state.ride.jobs.filter(job => job.roundId === lastRound.id && job.status !== "CANCELLED");
    const expenses = state.ride.expenses.filter(item => item.roundId === lastRound.id);
    const income = jobs.reduce((sum,item)=>sum+Number(item.amountSatang||0),0), expense = expenses.reduce((sum,item)=>sum+Number(item.amountSatang||0),0), distance = jobs.reduce((sum,item)=>sum+Number(item.distanceKm||0),0);
    const activeMs = Math.max(0, Date.parse(lastRound.endedAt || lastRound.updatedAt) - Date.parse(lastRound.startedAt) - Number(lastRound.pausedMs || 0));
    panel.innerHTML = `<div class="flow-last-round"><div class="flow-focus-head"><b>สรุปรอบล่าสุด</b><span class="flow-route-badge">จบแล้ว</span></div><div class="flow-round-grid"><div><small>จำนวนงาน</small><b>${jobs.length}</b></div><div><small>ระยะรวม</small><b>${numberFmt(distance)} กม.</b></div><div><small>เวลาทำงาน</small><b>${(activeMs/3600000).toFixed(2)} ชม.</b></div><div><small>รายรับ</small><b>${money(income)} ฿</b></div><div><small>ค่าใช้จ่าย</small><b>${money(expense)} ฿</b></div><div><small>สุทธิ</small><b>${money(income-expense)} ฿</b></div></div></div>`;
    return;
  }

  actionRow?.classList.remove("flow-round-idle-actions"); actionRow?.classList.add("flow-round-active-actions");
  startBtn?.classList.add("hidden"); creditBtn?.classList.add("hidden"); addExpenseBtn?.classList.add("hidden"); jobCard?.classList.remove("hidden");
  const jobs = state.ride.jobs.filter(job => job.roundId === round.id && job.status !== "CANCELLED");
  const expenses = state.ride.expenses.filter(item => item.roundId === round.id);
  const income = jobs.reduce((sum,item)=>sum+Number(item.amountSatang||0),0), expense = expenses.reduce((sum,item)=>sum+Number(item.amountSatang||0),0), distance = jobs.reduce((sum,item)=>sum+Number(item.distanceKm||0),0);
  const now = Date.now(), pausedMs = Number(round.pausedMs || 0) + (round.status === "PAUSED" && round.pausedAt ? now - Date.parse(round.pausedAt) : 0), activeMs = Math.max(0, now - Date.parse(round.startedAt) - pausedMs), hours = activeMs / 3600000;
  panel.innerHTML = `<div class="flow-focus-head"><b>สถานะรอบ: ${round.status === "PAUSED" ? "พัก" : "กำลังวิ่ง"}</b><span class="flow-route-badge">RIDE → Event → Ledger</span></div><div class="flow-round-grid"><div><small>เริ่มเวลา</small><b>${new Date(round.startedAt).toLocaleTimeString("th-TH",{hour:"2-digit",minute:"2-digit"})}</b></div><div><small>เวลาทำงานจริง</small><b>${hours.toFixed(2)} ชม.</b></div><div><small>จำนวนงาน</small><b>${jobs.length}</b></div><div><small>ระยะสะสม</small><b>${numberFmt(distance)} กม.</b></div><div><small>ค่าใช้จ่าย</small><b>${money(expense)} ฿</b></div><div><small>สุทธิรอบ</small><b>${money(income-expense)} ฿</b></div></div><div class="flow-round-controls"><button id="flowAddExpense" class="secondary-btn">เพิ่มค่าใช้จ่าย</button><button id="flowPauseRound" class="secondary-btn">${round.status === "PAUSED" ? "ทำงานต่อ" : "พักรอบ"}</button><button id="flowEndRound" class="primary-btn">จบรอบ</button></div>`;
  byId("flowAddExpense").onclick = () => byId("addRideExpenseBtn")?.click();
  byId("flowPauseRound").onclick = async () => { if (round.status === "PAUSED") { round.pausedMs = Number(round.pausedMs || 0) + Math.max(0, Date.now() - Date.parse(round.pausedAt)); round.pausedAt = null; round.status = "ACTIVE"; addAudit("RIDE_ROUND_RESUMED", round.id); } else { round.pausedAt = nowIso(); round.status = "PAUSED"; addAudit("RIDE_ROUND_PAUSED", round.id); } bumpSource(round); await persistAndRender(round.status === "PAUSED" ? "พักรอบแล้ว" : "ทำงานต่อแล้ว"); };
  byId("flowEndRound").onclick = async () => { if (round.status === "PAUSED" && round.pausedAt) round.pausedMs = Number(round.pausedMs || 0) + Math.max(0, Date.now() - Date.parse(round.pausedAt)); round.status = "ENDED"; round.endedAt = nowIso(); round.pausedAt = null; bumpSource(round); state.ride.rounds.push(round); state.ride.currentRound = null; addAudit("RIDE_ROUND_ENDED", round.id); await persistAndRender("จบรอบวิ่งแล้ว"); };
}
function flowRenderLedger() {
  // Intentionally no pending/obligation totals: Calendar owns the pending-action view.
}

function flowCalendarItems() {
  let items = [...state.calendar].sort((a,b)=>String(a.due).localeCompare(String(b.due)) || Number(a.sequence)-Number(b.sequence));
  if (selectedDate) items = items.filter(item => item.due === selectedDate);
  return items;
}

function flowRenderCalendarFocus() {
  const focus = byId("flowCalendarFocus");
  if (!focus || !state) return;
  const page = byId("calendarPage");
  if (!selectedDate) {
    page.classList.remove("calendarPage-selected");
    focus.innerHTML = '<div class="flow-focus-head"><b>กดวันที่เพื่อเปิดรายการด้านบน</b><span class="flow-route-badge">ปัดซ้าย–ขวาเมื่อมีหลายรายการ</span></div>';
    return;
  }
  page.classList.add("calendarPage-selected");
  const items = flowCalendarItems();
  state.sync.flow.lastCalendarDiagnostic = flowCalendarDiagnostic(selectedDate);
  if (!items.length) {
    focus.innerHTML = `<div class="flow-focus-head"><b>${dateTH(selectedDate)}</b><button id="flowClearDay" class="secondary-btn">ดูทุกวัน</button></div><div class="empty">ไม่มีรายการในวันนี้</div>`;
    byId("flowClearDay").onclick = () => { selectedDate = null; flowCalendarIndex = 0; renderCalendar(); };
    return;
  }
  flowCalendarIndex = ((flowCalendarIndex % items.length) + items.length) % items.length;
  const item = items[flowCalendarIndex];
  const source = findSource(item.source, item.sourceId);
  const displayAmount = flowQueueDisplayAmount(item);
  const title = item.displayName || source?.name || source?.customer || source?.note || actionLabel(item.actionType);
  focus.innerHTML = `<div class="flow-focus-head"><div><b>${dateTH(selectedDate)}</b><small>รายการ ${flowCalendarIndex+1}/${items.length}</small></div><button id="flowClearDay" class="secondary-btn">ดูทุกวัน</button></div>
    <div class="flow-swipe-card" style="--item-color:${esc(item.userColor || "#4384d4")}">
      <span class="flow-color-bar"></span>
      <div class="flow-swipe-main"><div><h3>${esc(title)}</h3><small>${sourceLabel(item.source)} · ${actionLabel(item.actionType)}</small><span class="status ${statusClass(item.status)}">${statusLabel(item.status)}</span></div><div class="flow-swipe-amount">${money(displayAmount.value)} ฿<small>${esc(displayAmount.label)} · ${dateTH(item.due)}</small></div></div>
      ${item.note ? `<div class="flow-note">${esc(item.note)}</div>` : ""}
      <div class="flow-swipe-actions"><button class="edit" data-flow-edit="${item.id}">แก้ข้อมูลแผน</button>${queueActionButtons(item)}</div>
    </div>
    <div class="flow-swipe-nav"><button id="flowPrevCard" aria-label="ก่อนหน้า">‹</button><div class="flow-swipe-dots">${items.map((_,i)=>`<span class="${i===flowCalendarIndex?"active":""}"></span>`).join("")}</div><button id="flowNextCard" aria-label="ถัดไป">›</button></div>`;
  byId("flowClearDay").onclick = () => { selectedDate = null; flowCalendarIndex = 0; renderCalendar(); };
  byId("flowPrevCard").onclick = () => { flowCalendarIndex--; flowRenderCalendarFocus(); };
  byId("flowNextCard").onclick = () => { flowCalendarIndex++; flowRenderCalendarFocus(); };
  document.querySelectorAll("[data-flow-edit]").forEach(button => button.onclick = () => flowEditQueue(button.dataset.flowEdit));
  bindQueueActions();
}

function flowEditQueue(id) {
  const item = findQueue(id);
  if (!item) return toast("ไม่พบคิว");
  if (["COMPLETED","CANCELLED"].includes(item.status)) return showHistory(item.id);
  const source = findSource(item.source, item.sourceId);
  const name = item.displayName || source?.name || source?.customer || source?.note || "";
  openModal({
    title: "แก้ข้อมูลแผน",
    text: "ปฏิทินแก้ข้อมูลของเหตุการณ์ ส่วนยอดธุรกิจและเงินจริงยังเป็นของต้นทาง",
    body: `<div class="form-grid">
      <div class="field full"><label>ชื่อที่ใช้แสดง</label><input id="flowEditName" maxlength="100" value="${esc(name)}"></div>
      <div class="field"><label>วันกำหนด</label><input id="flowEditDue" type="date" value="${esc(item.due)}"></div>
      <div class="field"><label>สีประจำรายการ</label><input id="flowEditColor" type="color" value="${esc(item.userColor || "#4384d4")}"></div>
      <div class="field full"><label>หมายเหตุ</label><input id="flowEditNote" maxlength="180" value="${esc(item.note || "")}"></div>
      <div class="field full"><label><input id="flowEditReminder" type="checkbox" ${item.reminderEnabled !== false ? "checked" : ""}> แสดงในสิ่งที่ต้องจัดการ</label></div>
      <div class="field full"><div class="flow-note"><b>ยอดตามต้นทาง ${money(Math.max(0,Number(item.amountSatang||0)-Number(item.paidSatang||0)))} บาท</b><br>ยอดนี้ไม่ถูกแก้ทับจากปฏิทิน เพื่อไม่ให้ต้นทางกับคิวไม่ตรงกัน</div></div>
    </div>`,
    confirm: "บันทึกข้อมูลแผน",
    onConfirm: async () => {
      const due = byId("flowEditDue").value;
      if (!validISODate(due)) { toast("วันกำหนดไม่ถูกต้อง"); modalBusy = false; return; }
      const oldDue = item.due;
      item.displayName = cleanImportText(byId("flowEditName").value,100);
      item.note = cleanImportText(byId("flowEditNote").value,180);
      item.userColor = byId("flowEditColor").value;
      item.reminderEnabled = byId("flowEditReminder").checked;
      item.due = due; item.dueAt = `${due}T09:00:00+07:00`; item.triggerAt = item.dueAt;
      addHistory(item, "PLAN_EDITED", `${oldDue} → ${due}`);
      bumpQueue(item);
      closeModal();
      await persistAndRender("แก้ข้อมูลแผนแล้ว");
    }
  });
}

function flowRenderSync() {
  const pending = state.sync.pendingImport;
  const preview = byId("importPreview");
  if (pending?.flowPackageId && preview && !preview.querySelector(".flow-review-meta")) {
    const meta = document.createElement("div");
    meta.className = "flow-review-meta";
    meta.innerHTML = `<b>FLOW Package:</b> ${esc(pending.flowPackageId)}<br><small>Trust Gate: ${esc(pending.flowTrustLevel || "T1_TECHNICALLY_VALID")} · ผ่าน Route Gate และกำลังรอการยืนยันของเจ้าของ</small>`;
    preview.prepend(meta);
  }
}

function flowRenderSettings() {
  flowRenderAuditStatus();
  const technical = byId("technicalStatus");
  if (technical && !technical.textContent.includes("FLOW layer")) {
    technical.textContent += `\nFLOW layer: ${FLOW_VERSION}\nExchange: ${FLOW_FORMAT} v${FLOW_FORMAT_VERSION} / Evidence 3.1\nAudit authority: REPORT_ONLY\nCalendar diagnostic: ${JSON.stringify(state.sync?.flow?.lastCalendarDiagnostic || null)}`;
  }
}

renderHome = function() { flowBase.renderHome(); flowRenderHome(); };
renderRide = function() { flowBase.renderRide(); flowRenderRide(); };
renderLedger = function() { flowBase.renderLedger(); flowRenderLedger(); };
renderCalendar = function() {
  flowBase.renderCalendar();
  const verifyCount = flowActiveQueues().filter(flowNeedsVerification).length;
  if (byId("calVerify")) byId("calVerify").textContent = verifyCount;
  flowRenderCalendarFocus();
};
renderSync = function() { flowBase.renderSync(); flowRenderSync(); };
renderSettings = function() { flowBase.renderSettings(); flowRenderSettings(); };
renderAll = function() {
  if (!state) return;
  flowEnsureState();
  flowInstallDom();
  flowBase.renderAll();
  flowRenderAuditStatus();
  YGPHRuntime.run("afterRender", { page: currentPage, stateRevision: state.revision });
};

flowInstallDom();
