"use strict";

(() => {
  const DOMAIN_COMMAND_VERSION = "1.0.0";
  const handlers = new Map();

  function text(value, label) {
    const output = String(value || "").trim();
    if (!output) throw new Error(`INVALID_DOMAIN_COMMAND:${label}`);
    return output;
  }

  function validateEnvelope(command) {
    if (!command || typeof command !== "object" || Array.isArray(command)) throw new Error("INVALID_DOMAIN_COMMAND:envelope");
    command.type = text(command.type, "type");
    command.commandId = text(command.commandId, "commandId");
    command.idempotencyKey = text(command.idempotencyKey, "idempotencyKey");
    if (!command.payload || typeof command.payload !== "object" || Array.isArray(command.payload)) throw new Error("INVALID_DOMAIN_COMMAND:payload");
    state.sync ||= {};
    state.sync.appliedCommandKeys ||= {};
    if (state.sync.appliedCommandKeys[command.idempotencyKey]) throw new Error(`DUPLICATE_DOMAIN_COMMAND:${command.idempotencyKey}`);
  }

  function liveQueue(id) {
    const item = findQueue(text(id, "queueId"));
    if (!item) throw new Error("DOMAIN_SOURCE_NOT_FOUND:queue");
    if (["COMPLETED", "CANCELLED"].includes(item.status)) throw new Error(`DOMAIN_QUEUE_CLOSED:${item.status}`);
    item.appliedActions ||= {};
    item.history ||= [];
    return item;
  }

  function sourceFor(item) {
    const source = findSource(item.source, item.sourceId);
    if (!source) throw new Error(`DOMAIN_SOURCE_NOT_FOUND:${item.source}/${item.sourceId}`);
    return source;
  }

  function applyLegacyOnce(item, key, fn) {
    if (item.appliedActions[key]) throw new Error(`DUPLICATE_DOMAIN_COMMAND:${item.id}:${key}`);
    item.appliedActions[key] = nowIso();
    fn();
    bumpQueue(item);
  }

  function markCommand(command) {
    state.sync.appliedCommandKeys[command.idempotencyKey] = {
      actionId: command.commandId,
      eventType: command.type,
      sourceDomain: command.type.startsWith("CALENDAR_") ? "CALENDAR" : "LEDGER",
      appliedAt: nowIso(),
      revision: Number(state.revision || 0) + 1
    };
  }

  function commandContext(command, domains) {
    return {
      actionId: command.commandId,
      commandId: command.commandId,
      actor: "OWNER",
      eventType: command.type,
      sourceDomain: command.type.startsWith("CALENDAR_") ? "CALENDAR" : "LEDGER",
      sourceOwner: "OWNER",
      targetDomain: domains,
      idempotencyKey: command.idempotencyKey
    };
  }

  async function finish(command, message, result, domains = ["LEDGER", "CALENDAR"]) {
    markCommand(command);
    await persistAndRender(message, commandContext(command, domains));
    return result;
  }

  function register(type, handler) {
    handlers.set(type, handler);
  }

  register("LEDGER_ADD_TRANSACTION", async command => {
    const payload = command.payload;
    const direction = text(payload.direction, "direction");
    if (!["IN", "OUT"].includes(direction)) throw new Error("INVALID_DOMAIN_COMMAND:direction");
    const amountSatang = parseSatang(Number(payload.amountSatang), { allowZero: false, label: "ยอดธุรกรรม" });
    const source = text(payload.source, "source");
    const sourceId = text(payload.sourceId, "sourceId");
    if (source !== "LEDGER" && !findSource(source, sourceId)) throw new Error(`DOMAIN_SOURCE_NOT_FOUND:${source}/${sourceId}`);
    const tx = addTransactionToState(state, {
      direction,
      amountSatang,
      label: text(payload.label, "label"),
      source,
      sourceId,
      subtype: payload.subtype || "DOMAIN_COMMAND",
      actionKey: command.idempotencyKey,
      reversalOf: payload.reversalOf || null,
      reversalReason: payload.reversalReason || null
    });
    if (!tx) throw new Error("DOMAIN_TRANSACTION_NOT_CREATED");
    addAudit("LEDGER_MOVEMENT", `${tx.direction} ${money(tx.amountSatang)} · ${tx.label}`);
    return finish(command, payload.message || `${direction === "IN" ? "+" : "−"}${money(amountSatang)} บาท`, { transactionId: tx.id }, ["LEDGER"]);
  });

  register("LEDGER_REVERSE_SOURCE_TRANSACTIONS", async command => {
    const source = text(command.payload.source, "source");
    const sourceId = text(command.payload.sourceId, "sourceId");
    const reason = String(command.payload.reason || "ย้อนรายการตามคำสั่งเจ้าของ").trim();
    const originals = state.ledger.transactions.filter(tx =>
      tx.source === source
      && tx.sourceId === sourceId
      && !String(tx.subtype || "").startsWith("REVERSAL_")
      && !tx.reversedBy
    );
    if (!originals.length) throw new Error(`DOMAIN_SOURCE_NOT_FOUND:${source}/${sourceId}`);
    const reversalIds = [];
    for (const original of originals) {
      const reversal = addTransactionToState(state, {
        direction: original.direction === "IN" ? "OUT" : "IN",
        amountSatang: original.amountSatang,
        label: `ย้อน ${original.label}`,
        source,
        sourceId,
        subtype: `REVERSAL_${original.subtype || "TRANSACTION"}`,
        actionKey: `${command.idempotencyKey}:${original.id}`,
        reversalOf: original.id,
        reversalReason: reason
      });
      original.reversedBy = reversal.id;
      reversalIds.push(reversal.id);
      addAudit("LEDGER_REVERSAL", `${original.id} → ${reversal.id}`);
    }
    return finish(command, `ย้อนรายการ ${reversalIds.length} รายการแล้ว`, { reversalIds }, ["LEDGER"]);
  });

  register("LEDGER_RECONCILE_BALANCE", async command => {
    const payload = command.payload;
    const targetSatang = parseSatang(Number(payload.targetSatang), { allowZero: true, label: "เงินปัจจุบัน" });
    const current = currentBalanceSatang();
    if (payload.initialVerification) {
      const movement = state.ledger.transactions.reduce((sum, tx) => sum + signedTransaction(tx), 0);
      state.ledger.openingBalanceSatang = targetSatang - movement;
      state.ledger.balanceVerified = true;
      state.ledger.verifiedAt = nowIso();
      addAudit("BALANCE_INITIALIZED", `เงินตั้งต้น ${money(targetSatang)} บาท`);
    } else {
      const reason = text(payload.reason, "reason");
      const difference = targetSatang - current;
      if (difference !== 0) {
        const tx = addTransactionToState(state, {
          direction: difference > 0 ? "IN" : "OUT",
          amountSatang: Math.abs(difference),
          label: `ปรับยอดจากการตรวจจริง: ${reason}`,
          source: "LEDGER",
          sourceId: "LEDGER-CURRENT",
          subtype: "BALANCE_RECONCILIATION",
          actionKey: command.idempotencyKey
        });
        if (tx) addAudit("LEDGER_MOVEMENT", `${tx.direction} ${money(tx.amountSatang)} · ${tx.label}`);
      }
      state.ledger.balanceVerified = true;
      state.ledger.verifiedAt = nowIso();
      addAudit("BALANCE_RECONCILED", `${reason} · ${difference >= 0 ? "+" : ""}${money(difference)} บาท`);
    }
    return finish(command, payload.initialVerification ? "ยืนยันยอดตั้งต้นแล้ว" : "บันทึกส่วนต่าง ณ วันนี้แล้ว", { targetSatang }, ["LEDGER"]);
  });

  register("LEDGER_CREATE_OBLIGATION", async command => {
    const payload = command.payload;
    const originalSatang = parseSatang(Number(payload.originalSatang), { allowZero: false, label: "ยอดภาระ" });
    const installmentCount = Number(payload.installmentCount || 1);
    const firstDue = text(payload.firstDue, "firstDue");
    if (!Number.isInteger(installmentCount) || installmentCount < 1 || installmentCount > MAX_INSTALLMENTS || originalSatang < installmentCount || !validISODate(firstDue)) {
      throw new Error("INVALID_DOMAIN_COMMAND:obligation-schedule");
    }
    const id = payload.id ? text(payload.id, "id") : uid("OBL");
    if (findSource("LEDGER", id)) throw new Error(`DUPLICATE_DOMAIN_SOURCE:${id}`);
    const createdAt = nowIso();
    const obligation = {
      id,
      name: String(payload.name || "ภาระ").trim() || "ภาระ",
      detail: String(payload.detail || "").trim(),
      originalSatang,
      paidSatang: 0,
      remainingSatang: originalSatang,
      installmentCount,
      firstDue,
      installments: [],
      status: "OPEN",
      createdAt,
      updatedAt: createdAt,
      revision: 1,
      cancelledAt: null
    };
    state.ledger.obligations.push(obligation);
    const queueIds = [];
    splitInstallments(originalSatang, installmentCount).forEach((amountSatang, index) => {
      const number = index + 1;
      const due = addMonths(firstDue, index);
      const queue = addQueueToState(state, {
        source: "LEDGER",
        sourceId: id,
        actionType: installmentCount >= 2 ? "PAY_OBLIGATION_INSTALLMENT" : "PAY_OBLIGATION",
        amountSatang,
        due,
        effects: { complete: "หักเงินจริงและลดยอดภาระ", cancel: "ยกเลิกคิวและย้อนเฉพาะยอดที่จ่ายจากคิวนี้" }
      });
      queue.installmentNumber = number;
      queue.installmentCount = installmentCount;
      obligation.installments.push({ number, amountSatang, paidSatang: 0, due, status: "PENDING", queueId: queue.id, paidAt: null });
      queueIds.push(queue.id);
      addAudit("QUEUE_CREATED", `LEDGER/${id} → ${queue.actionType}`);
    });
    addAudit("OBLIGATION_CREATED", `${id} · ${obligation.name} · ${money(originalSatang)} บาท`);
    return finish(command, `เพิ่มภาระ ${installmentCount} งวดในปฏิทินแล้ว`, { obligationId: id, queueIds }, ["LEDGER", "CALENDAR"]);
  });

  register("CALENDAR_CREATE_QUEUE", async command => {
    const payload = command.payload;
    const source = text(payload.source, "source");
    const sourceId = text(payload.sourceId, "sourceId");
    if (!findSource(source, sourceId)) throw new Error(`DOMAIN_SOURCE_NOT_FOUND:${source}/${sourceId}`);
    const amountSatang = parseSatang(Number(payload.amountSatang || 0), { allowZero: true, label: "ยอดคิว" });
    const due = text(payload.due, "due");
    if (!validISODate(due)) throw new Error("INVALID_DOMAIN_COMMAND:due");
    const queue = addQueueToState(state, {
      source,
      sourceId,
      actionType: text(payload.actionType, "actionType"),
      status: payload.status || "OPEN",
      amountSatang,
      due,
      effects: payload.effects || {}
    });
    addAudit("QUEUE_CREATED", `${source}/${sourceId} → ${queue.actionType}`);
    return finish(command, payload.message || "เพิ่มคิวแล้ว", { queueId: queue.id }, ["CALENDAR"]);
  });

  register("CALENDAR_PAY_QUEUE", async command => {
    const item = liveQueue(command.payload.queueId);
    if (!["RECEIVE_CUSTOMER_PAYMENT", "PAY_OBLIGATION", "PAY_OBLIGATION_INSTALLMENT"].includes(item.actionType)) throw new Error(`UNSUPPORTED_CALENDAR_PAYMENT:${item.actionType}`);
    const source = sourceFor(item);
    const incoming = item.actionType === "RECEIVE_CUSTOMER_PAYMENT";
    const maximum = incoming
      ? Number(source.outstandingSatang || 0)
      : Math.min(Number(source.remainingSatang || 0), Math.max(0, Number(item.amountSatang || 0) - Number(item.paidSatang || 0)));
    const amount = parseSatang(Number(command.payload.amountSatang), { allowZero: false, label: "ยอดครั้งนี้" });
    if (amount > maximum) throw new Error("INVALID_DOMAIN_COMMAND:payment-over-remaining");
    const legacyActionKey = String(command.payload.legacyActionKey || `payment:${item.history.filter(entry => entry.event === "PAYMENT_APPLIED").length + 1}:${amount}`);
    let transactionId = null;

    applyLegacyOnce(item, legacyActionKey, () => {
      if (incoming) {
        const tx = addTransactionToState(state, {
          direction: "IN",
          amountSatang: amount,
          label: `รับชำระ ${source.id}`,
          source: "STORE",
          sourceId: source.id,
          subtype: "SALE_RECEIPT",
          actionKey: `${item.id}:${legacyActionKey}`
        });
        if (!tx) throw new Error("DOMAIN_TRANSACTION_NOT_CREATED");
        transactionId = tx.id;
        addAudit("LEDGER_MOVEMENT", `${tx.direction} ${money(tx.amountSatang)} · ${tx.label}`);
        source.receivedSatang = Number(source.receivedSatang || 0) + amount;
        source.outstandingSatang = Math.max(0, Number(source.totalSatang || 0) - source.receivedSatang);
        source.status = source.outstandingSatang === 0 ? "COMPLETED" : "PARTIAL";
        item.amountSatang = source.outstandingSatang;
      } else {
        const tx = addTransactionToState(state, {
          direction: "OUT",
          amountSatang: amount,
          label: `ชำระ ${source.name}${item.installmentNumber ? ` งวด ${item.installmentNumber}` : ""}`,
          source: "LEDGER",
          sourceId: source.id,
          subtype: "OBLIGATION_PAYMENT",
          actionKey: `${item.id}:${legacyActionKey}`
        });
        if (!tx) throw new Error("DOMAIN_TRANSACTION_NOT_CREATED");
        transactionId = tx.id;
        addAudit("LEDGER_MOVEMENT", `${tx.direction} ${money(tx.amountSatang)} · ${tx.label}`);
        source.paidSatang = Number(source.paidSatang || 0) + amount;
        source.remainingSatang = Math.max(0, Number(source.originalSatang || 0) - source.paidSatang);
        source.status = source.remainingSatang === 0 ? "COMPLETED" : "PARTIAL";
        item.paidSatang = Number(item.paidSatang || 0) + amount;
        const installment = source.installments?.find(entry => Number(entry.number) === Number(item.installmentNumber));
        if (installment) {
          installment.paidSatang = Number(installment.paidSatang || 0) + amount;
          installment.status = installment.paidSatang >= installment.amountSatang ? "COMPLETED" : "PARTIAL";
          installment.paidAt = installment.status === "COMPLETED" ? nowIso() : null;
        }
      }
      bumpSource(source);
      item.expectedRevision = source.revision;
      item.sourceRevision = source.revision;
      const queueRemaining = incoming ? Number(source.outstandingSatang || 0) : Math.max(0, Number(item.amountSatang || 0) - Number(item.paidSatang || 0));
      item.status = queueRemaining === 0 ? "COMPLETED" : "PARTIAL";
      item.completedAt = item.status === "COMPLETED" ? nowIso() : null;
      addHistory(item, "PAYMENT_APPLIED", `${incoming ? "IN" : "OUT"} ${money(amount)}`);
      syncQueueRevisionsForSource(item.source, item.sourceId);
    });

    return finish(command, `${incoming ? "+" : "−"}${money(amount)} บาท`, { queueId: item.id, transactionId, status: item.status }, ["LEDGER", "CALENDAR", item.source]);
  });

  register("CALENDAR_EDIT_QUEUE", async command => {
    const item = liveQueue(command.payload.queueId);
    const source = sourceFor(item);
    const payload = command.payload;
    const due = payload.due === undefined ? item.due : text(payload.due, "due");
    if (!validISODate(due)) throw new Error("INVALID_DOMAIN_COMMAND:due");
    const oldDue = item.due;
    if (payload.displayName !== undefined) item.displayName = String(payload.displayName || "").trim();
    if (payload.note !== undefined) item.note = String(payload.note || "").trim();
    if (payload.reminderEnabled !== undefined) item.reminderEnabled = Boolean(payload.reminderEnabled);
    item.due = due;
    item.dueAt = `${due}T09:00:00+07:00`;
    item.triggerAt = item.dueAt;
    if (needsLocalVerification(item)) item.reviewNote = item.note;

    let sourceChanged = false;
    if (source?.installments && item.installmentNumber) {
      const installment = source.installments.find(entry => Number(entry.number) === Number(item.installmentNumber));
      if (installment && installment.due !== due) {
        installment.due = due;
        if (Number(item.installmentNumber) === 1) source.firstDue = due;
        sourceChanged = true;
      }
    }
    if (item.actionType === "CONFIRM_RIDE_CREDIT_WITHDRAWAL" && source && source.due !== due) {
      source.due = due;
      sourceChanged = true;
    }
    if (sourceChanged) {
      bumpSource(source);
      syncQueueRevisionsForSource(item.source, item.sourceId);
    }
    addHistory(item, "PLAN_EDITED", `${oldDue} → ${due}`);
    bumpQueue(item);
    return finish(command, "แก้ไขแล้ว", { queueId: item.id }, ["CALENDAR", item.source]);
  });

  register("CALENDAR_COMPLETE_QUEUE", async command => {
    const item = liveQueue(command.payload.queueId);
    const source = sourceFor(item);
    applyLegacyOnce(item, "complete", () => {
      if (item.actionType === "CONFIRM_RIDE_CREDIT_WITHDRAWAL") {
        addTransaction({ direction: "IN", amountSatang: source.amountSatang, label: `เงินเข้าจากเครดิตงานวิ่ง ${source.id}`, source: "RIDE", sourceId: source.id, subtype: "RIDE_CREDIT_WITHDRAWAL", actionKey: `${item.id}:complete` });
        source.status = "COMPLETED";
        source.confirmedAt = nowIso();
        bumpSource(source);
      }
      if (item.actionType === "SETTLE_RIDE_JOB") {
        addTransaction({ direction: "IN", amountSatang: source.amountSatang, label: `รายได้งานเดิม ${source.id}`, source: "RIDE", sourceId: source.id, subtype: "RIDE_INCOME", actionKey: `${item.id}:complete` });
        source.status = "SETTLED";
        source.paymentMode ||= "LEGACY_PENDING";
        bumpSource(source);
      }
      if (item.actionType === "PURCHASE_RETURN_WINDOW") {
        source.status = "ACTIVE";
        bumpSource(source);
      }
      if (item.actionType === "VERIFY_SOURCE") {
        source.verifiedAt = nowIso();
        bumpSource(source);
      }
      item.expectedRevision = source.revision;
      item.sourceRevision = source.revision;
      syncQueueRevisionsForSource(item.source, item.sourceId);
      item.status = "COMPLETED";
      item.completedAt = nowIso();
      addHistory(item, "COMPLETED", "แอคชันสำเร็จ");
    });
    return finish(command, item.actionType === "CONFIRM_RIDE_CREDIT_WITHDRAWAL" ? "เงินเข้าการเงินแล้ว" : "ปิดคิวแล้ว", { queueId: item.id }, ["CALENDAR", "LEDGER", item.source]);
  });

  register("CALENDAR_CANCEL_QUEUE", async command => {
    const item = liveQueue(command.payload.queueId);
    const source = sourceFor(item);
    const reason = String(command.payload.reason || "ยกเลิกจาก Calendar");

    if (item.actionType === "PURCHASE_RETURN_WINDOW" && state.store.stockQty < source.qty) {
      item.status = "VERIFY";
      item.requiresRefreshBeforePayment = true;
      addHistory(item, "CANCEL_BLOCKED", "จำนวนสต็อกคงเหลือไม่พอสำหรับคืนลอต");
      return finish(command, "ต้องตรวจสต็อกก่อนคืนของ", { queueId: item.id, status: item.status, blocked: true }, ["CALENDAR", "STORE"]);
    }

    let cashDelta = 0;
    applyLegacyOnce(item, "cancel", () => {
      if (item.actionType === "RECEIVE_CUSTOMER_PAYMENT") {
        cashDelta = reverseTransactions(item.source, item.sourceId, `${item.id}:cancel`);
        if (!source.stockRestored) {
          state.store.stockQty += source.qty;
          state.store.stockValueSatang += source.costSatang;
          source.stockRestored = true;
        }
        source.status = "CANCELLED";
        source.cancelledAt = nowIso();
        source.receivedSatang = 0;
        source.outstandingSatang = 0;
        bumpSource(source);
      } else if (item.actionType === "PURCHASE_RETURN_WINDOW") {
        cashDelta = reverseTransactions(item.source, item.sourceId, `${item.id}:cancel`);
        const inventoryCostSatang = takeStockFromPool(state, Number(source.qty));
        source.returnInventoryCostSatang = inventoryCostSatang;
        source.returnCostDifferenceSatang = Number(source.costSatang || 0) - inventoryCostSatang;
        source.returnedAt = nowIso();
        addAudit("STOCK_RETURN_VALUATION", `${source.id} · คืน ${source.qty} ชิ้น · ต้นทุนกอง ${money(inventoryCostSatang)} · ส่วนต่าง ${source.returnCostDifferenceSatang >= 0 ? "+" : ""}${money(source.returnCostDifferenceSatang)}`);
        source.status = "CANCELLED";
        source.cancelledAt = nowIso();
        source.paidAmountSatang = 0;
        bumpSource(source);
      } else if (item.actionType === "SETTLE_RIDE_JOB") {
        cashDelta = reverseTransactions(item.source, item.sourceId, `${item.id}:cancel`);
        source.status = "CANCELLED";
        source.cancelledAt = nowIso();
        bumpSource(source);
      } else if (item.actionType === "CONFIRM_RIDE_CREDIT_WITHDRAWAL") {
        if (source.status === "PENDING") state.ride.creditBalanceSatang += source.amountSatang;
        source.status = "CANCELLED";
        source.cancelledAt = nowIso();
        bumpSource(source);
      } else if (["PAY_OBLIGATION", "PAY_OBLIGATION_INSTALLMENT"].includes(item.actionType)) {
        const reversed = reverseQueuePayments(item, `${item.id}:cancel`);
        source.paidSatang = Math.max(0, Number(source.paidSatang || 0) - reversed);
        source.remainingSatang = Math.max(0, Number(source.originalSatang || 0) - source.paidSatang);
        source.status = source.paidSatang ? "PARTIAL" : "OPEN";
        const installment = source.installments?.find(entry => Number(entry.number) === Number(item.installmentNumber));
        if (installment) {
          installment.paidSatang = Math.max(0, Number(installment.paidSatang || 0) - reversed);
          installment.status = installment.paidSatang ? "PARTIAL" : "CANCELLED";
          installment.paidAt = null;
        }
        cashDelta = reversed;
        bumpSource(source);
      } else {
        throw new Error(`UNSUPPORTED_CALENDAR_CANCEL:${item.actionType}`);
      }
      item.status = "CANCELLED";
      item.cancelledAt = nowIso();
      item.completedAt = null;
      item.expectedRevision = source.revision;
      item.sourceRevision = source.revision;
      syncQueueRevisionsForSource(item.source, item.sourceId);
      addHistory(item, "CANCELLED", `ผลเงินจริงสุทธิ ${cashDelta >= 0 ? "+" : ""}${money(cashDelta)} · ${reason}`);
    });
    return finish(command, "ยกเลิกแล้ว", { queueId: item.id, cashDelta }, ["CALENDAR", "LEDGER", item.source]);
  });

  async function execute(command) {
    validateEnvelope(command);
    const handler = handlers.get(command.type);
    if (!handler) throw new Error(`UNSUPPORTED_DOMAIN_COMMAND:${command.type}`);
    return handler(command);
  }

  function supports(type) {
    return handlers.has(String(type || ""));
  }

  globalThis.YGPHDomainCommands = Object.freeze({
    version: DOMAIN_COMMAND_VERSION,
    execute,
    supports
  });
})();
