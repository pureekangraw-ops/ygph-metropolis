import { preflightConfirmedLedgerRequest } from './source/app/logic/chat/confirmed-ledger-executor.mjs';
import { parseNumericText } from './source/lighthouse/intent-number.mjs';

function frozen(value) {
  return Object.freeze(value);
}

function text(value) {
  return String(value ?? '').trim();
}

function errorReason(error) {
  return String(error?.message || error || 'TRUSTED_BRAIN_ERROR');
}

function routedReason(routed, fallback = 'TRUSTED_BRAIN_ROUTE_STOPPED') {
  return routed?.reason
    ?? routed?.intent?.reason
    ?? routed?.prepared?.reason
    ?? fallback;
}

function previewFromRequest(request) {
  const amountSatang = Number(request?.fields?.amountSatang);
  return frozen({
    title:String(request?.fields?.title ?? ''),
    ...(Number.isSafeInteger(amountSatang) ? { amountSatang } : {}),
    ...(request?.fields?.businessDate ? { businessDate:request.fields.businessDate } : {}),
  });
}

function readyResult(request) {
  return frozen({
    status:'READY',
    reason:null,
    requiresConfirmation:true,
    request:structuredClone(request),
    preview:previewFromRequest(request),
  });
}

function waitingResult(session) {
  return frozen({
    status:'WAITING',
    reason:session?.reason ?? 'RECOVERY_REQUIRED',
    directive:session?.uiDirective ?? null,
  });
}

function clarificationResult(prompt, options = []) {
  return frozen({
    status:'SUCCESS',
    reason:null,
    readback:frozen({
      interactionStatus:'CLARIFICATION_REQUIRED',
      message:String(prompt),
      options:Object.freeze(options.map(value => String(value))),
    }),
  });
}

function stoppedResult(status, reason, extras = {}) {
  return frozen({ status, reason:reason ?? null, ...extras });
}

function incomeCandidate(rawText) {
  const input = text(rawText);
  const match = /^(?:วันนี้\s*)?ได้\s+(.+?)(?:\s*บาท)?$/u.exec(input);
  if (!match) return null;
  const numeric = parseNumericText(match[1]);
  if (numeric.state !== 'RESOLVED' || !Number.isSafeInteger(numeric.amountSatang) || numeric.amountSatang <= 0) return null;
  return frozen({ amountSatang:numeric.amountSatang });
}

function storeSaleDetails(rawText) {
  const input = text(rawText);
  const match = /^(?:ขาย\s*)?(.+?)\s+([0-9๐-๙,]+)\s*(?:กล่อง|ชิ้น|อัน)?$/u.exec(input);
  if (!match) return null;
  const title = text(match[1]);
  const numeric = parseNumericText(match[2]);
  const quantity = numeric.state === 'RESOLVED' ? numeric.value : null;
  if (!title || !Number.isSafeInteger(quantity) || quantity <= 0) return null;
  return frozen({ title, quantity });
}

function storeSaleProduct(rawText) {
  const input = text(rawText).replace(/^ขาย\s*/u, '').trim();
  if (!input || /[0-9๐-๙]/u.test(input)) return null;
  return input;
}

function storeSaleQuantity(rawText) {
  const input = text(rawText);
  const match = /^([0-9๐-๙,]+)\s*(?:กล่อง|ชิ้น|อัน)?$/u.exec(input);
  if (!match) return null;
  const numeric = parseNumericText(match[1]);
  const quantity = numeric.state === 'RESOLVED' ? numeric.value : null;
  return Number.isSafeInteger(quantity) && quantity > 0 ? quantity : null;
}

function sourceQuestion(amountSatang) {
  return `เงิน ${Number(amountSatang) / 100} บาทนี้มาจาก ร้าน / วิ่ง / อย่างอื่น ?`;
}

function storeOperationQuestion() {
  return 'เงินฝั่งร้านนี้เป็น ขายสินค้า หรือ เงินเข้าร้านอย่างอื่น ?';
}

function storeSaleDetailsQuestion(amountSatang) {
  return `ขายอะไร จำนวนเท่าไร? ยอดรวม ${Number(amountSatang) / 100} บาท`;
}

function storeSaleQuantityQuestion(amountSatang, title) {
  return `${String(title)} จำนวนเท่าไร? ยอดรวม ${Number(amountSatang) / 100} บาท`;
}

function noRideRoundQuestion() {
  return 'ยังไม่มีรอบวิ่งที่เปิดอยู่ จะเปิดรอบใหม่ไหม?';
}

export function createTrustedBrainAdapter({
  routeMasterInputText,
  createRecoverySession,
  applySessionOwnerInput,
  rejoinRecoverySession,
  pathKernel,
  requestPreflight = null,
  withRuntimeSession,
  requestIdFactory,
  inputIdFactory,
  receivedAt = () => new Date().toISOString(),
  timeZone = 'Asia/Bangkok',
} = {}) {
  if (typeof routeMasterInputText !== 'function') throw new TypeError('TRUSTED_BRAIN_ROUTE_REQUIRED');
  if (typeof createRecoverySession !== 'function') throw new TypeError('TRUSTED_BRAIN_RECOVERY_CREATE_REQUIRED');
  if (typeof applySessionOwnerInput !== 'function') throw new TypeError('TRUSTED_BRAIN_RECOVERY_INPUT_REQUIRED');
  if (typeof rejoinRecoverySession !== 'function') throw new TypeError('TRUSTED_BRAIN_RECOVERY_REJOIN_REQUIRED');
  if (!pathKernel || typeof pathKernel.preflight !== 'function' || typeof pathKernel.run !== 'function') {
    throw new TypeError('TRUSTED_BRAIN_PATH_KERNEL_REQUIRED');
  }
  if (requestPreflight != null && typeof requestPreflight !== 'function') {
    throw new TypeError('TRUSTED_BRAIN_REQUEST_PREFLIGHT_INVALID');
  }
  if (typeof withRuntimeSession !== 'function') throw new TypeError('TRUSTED_BRAIN_RUNTIME_SESSION_REQUIRED');
  if (typeof requestIdFactory !== 'function') throw new TypeError('TRUSTED_BRAIN_REQUEST_ID_FACTORY_REQUIRED');
  if (typeof inputIdFactory !== 'function') throw new TypeError('TRUSTED_BRAIN_INPUT_ID_FACTORY_REQUIRED');
  if (typeof receivedAt !== 'function') throw new TypeError('TRUSTED_BRAIN_RECEIVED_AT_REQUIRED');

  const preflightRequest = requestPreflight ?? preflightConfirmedLedgerRequest;
  let preparedRequest = null;
  let recoverySession = null;
  let incomeConversation = null;
  let executionInFlight = false;

  async function runtimeState() {
    return withRuntimeSession(async runtime => {
      const state = await runtime.readState();
      if (!state || !Number.isSafeInteger(state.revision)) throw new Error('GREENFIELD_NOT_INITIALIZED');
      return state;
    });
  }

  function rememberReady(request, { preserveIncomeConversation = false } = {}) {
    const preflight = preflightRequest(request);
    if (preflight?.status !== 'READY') {
      preparedRequest = null;
      return stoppedResult(preflight?.status ?? 'BLOCKED', preflight?.reason ?? 'NO_LEGAL_PATH');
    }
    preparedRequest = request;
    recoverySession = null;
    if (!preserveIncomeConversation) incomeConversation = null;
    return readyResult(request);
  }

  function mapRoute(routed, baseRevision) {
    if (routed?.route === 'LOCAL_PATH' && routed?.status === 'READY' && routed?.prepared?.request) {
      return rememberReady(routed.prepared.request);
    }
    if (routed?.status === 'RECOVERY_REQUIRED') {
      preparedRequest = null;
      recoverySession = createRecoverySession(routed, {
        inputId:inputIdFactory(),
        baseRevision,
      });
      return waitingResult(recoverySession);
    }
    preparedRequest = null;
    return stoppedResult(routed?.status ?? 'BLOCKED', routedReason(routed));
  }

  async function routeFresh(rawText) {
    const candidate = incomeCandidate(rawText);
    if (candidate) {
      preparedRequest = null;
      recoverySession = null;
      incomeConversation = { kind:'INCOME_SOURCE', amountSatang:candidate.amountSatang };
      return clarificationResult(sourceQuestion(candidate.amountSatang), ['ร้าน', 'วิ่ง', 'อย่างอื่น']);
    }

    const state = await runtimeState();
    const routed = await routeMasterInputText(rawText, {
      receivedAt:receivedAt(),
      timeZone,
      baseRevision:state.revision,
      requestIdFactory,
      interpretFallback:async () => frozen({ status:'UNSUPPORTED', reason:'REMOTE_INTERPRETER_NOT_CONFIGURED' }),
    });
    return mapRoute(routed, state.revision);
  }

  function otherIncomeRequest(amountSatang) {
    return {
      version:'1', source:'PATTERN', requestId:requestIdFactory(), action:'CREATE', object:'OTHER_INCOME',
      fields:{ title:'รายได้อื่น', amountSatang },
      requiredResult:{ kind:'LEDGER_TRANSACTION', effect:{ owner:'OTHER', direction:'IN', subtype:'OTHER_INCOME', title:'รายได้อื่น', amountSatang } },
    };
  }

  function storeIncomeRequest(amountSatang) {
    return {
      version:'1', source:'PATTERN', requestId:requestIdFactory(), action:'CREATE', object:'STORE_INCOME',
      fields:{ title:'เงินเข้าร้านอย่างอื่น', amountSatang },
      requiredResult:{ kind:'STORE_INCOME_WITH_LEDGER', effect:{ owner:'STORE', ledgerDirection:'IN', title:'เงินเข้าร้านอย่างอื่น', amountSatang, stockEffect:'NONE' } },
    };
  }

  function storeSaleRequest(amountSatang, details) {
    return {
      version:'1', source:'PATTERN', requestId:requestIdFactory(), action:'CREATE', object:'STORE_SALE',
      fields:{ title:details.title, amountSatang, quantity:details.quantity, receivedSatang:amountSatang },
      requiredResult:{ kind:'STORE_SALE_WITH_LEDGER', effect:{ owner:'STORE', ledgerDirection:'IN', title:details.title, amountSatang, quantity:details.quantity, receivedSatang:amountSatang } },
    };
  }

  function rideStartRoundRequest() {
    const requestId = requestIdFactory();
    const roundId = `ROUND-LH-${requestId}`;
    return {
      version:'1', source:'PATTERN', requestId, action:'CREATE', object:'RIDE_START_ROUND',
      fields:{ title:'เปิดรอบวิ่ง', roundId },
      requiredResult:{ kind:'RIDE_ROUND', effect:{ owner:'RIDE', status:'ACTIVE', roundId } },
    };
  }

  function rideJobRequest(amountSatang, roundId) {
    return {
      version:'1', source:'PATTERN', requestId:requestIdFactory(), action:'CREATE', object:'RIDE_JOB',
      fields:{ roundId, amountSatang, paymentMode:'CASH', note:'' },
      requiredResult:{ kind:'RIDE_JOB_WITH_LEDGER', effect:{ owner:'RIDE', ledgerDirection:'IN', amountSatang, paymentMode:'CASH' } },
    };
  }

  async function resolveIncomeConversation(rawText) {
    const answer = text(rawText);
    const conversation = incomeConversation;
    if (!conversation) return null;

    if (answer === 'ยกเลิก') {
      incomeConversation = null;
      preparedRequest = null;
      return stoppedResult('CANCELLED', 'INCOME_CLARIFICATION_CANCELLED');
    }

    if (conversation.kind === 'INCOME_SOURCE') {
      if (answer === 'อย่างอื่น') return rememberReady(otherIncomeRequest(conversation.amountSatang));
      if (answer === 'ร้าน') {
        incomeConversation = { kind:'STORE_OPERATION', amountSatang:conversation.amountSatang };
        return clarificationResult(storeOperationQuestion(), ['ขายสินค้า', 'เงินเข้าร้านอย่างอื่น']);
      }
      if (answer === 'วิ่ง') {
        const state = await runtimeState();
        const activeRounds = Object.values(state?.domains?.RIDE?.records || {})
          .map(entry => entry?.record)
          .filter(record => record?.type === 'ROUND' && record.status === 'ACTIVE');
        if (activeRounds.length === 1) return rememberReady(rideJobRequest(conversation.amountSatang, String(activeRounds[0].recordId)));
        if (activeRounds.length > 1) return stoppedResult('BLOCKED', 'RIDE_ACTIVE_ROUND_INVARIANT');
        incomeConversation = { kind:'RIDE_OPEN', amountSatang:conversation.amountSatang };
        return clarificationResult(noRideRoundQuestion(), ['เปิดรอบ', 'ยกเลิก']);
      }
      return clarificationResult(sourceQuestion(conversation.amountSatang), ['ร้าน', 'วิ่ง', 'อย่างอื่น']);
    }

    if (conversation.kind === 'RIDE_OPEN') {
      if (answer === 'เปิดรอบ' || answer === 'เปิด') {
        incomeConversation = { kind:'INCOME_SOURCE', amountSatang:conversation.amountSatang };
        return rememberReady(rideStartRoundRequest(), { preserveIncomeConversation:true });
      }
      return clarificationResult(noRideRoundQuestion(), ['เปิดรอบ', 'ยกเลิก']);
    }

    if (conversation.kind === 'STORE_OPERATION') {
      if (answer === 'เงินเข้าร้านอย่างอื่น' || answer === 'ไม่ใช่ขาย' || answer === 'ไม่ใช่ขายของ') {
        return rememberReady(storeIncomeRequest(conversation.amountSatang));
      }
      if (answer === 'ขายสินค้า') {
        incomeConversation = { kind:'STORE_SALE_DETAILS', amountSatang:conversation.amountSatang };
        return clarificationResult(storeSaleDetailsQuestion(conversation.amountSatang), []);
      }
      return clarificationResult(storeOperationQuestion(), ['ขายสินค้า', 'เงินเข้าร้านอย่างอื่น']);
    }

    if (conversation.kind === 'STORE_SALE_DETAILS') {
      const details = storeSaleDetails(answer);
      if (details) return rememberReady(storeSaleRequest(conversation.amountSatang, details));

      if (conversation.title) {
        const quantity = storeSaleQuantity(answer);
        if (quantity) {
          return rememberReady(storeSaleRequest(conversation.amountSatang, { title:conversation.title, quantity }));
        }
        return clarificationResult(storeSaleQuantityQuestion(conversation.amountSatang, conversation.title), []);
      }

      const title = storeSaleProduct(answer);
      if (title) {
        incomeConversation = { kind:'STORE_SALE_DETAILS', amountSatang:conversation.amountSatang, title };
        return clarificationResult(storeSaleQuantityQuestion(conversation.amountSatang, title), []);
      }
      return clarificationResult(storeSaleDetailsQuestion(conversation.amountSatang), []);
    }

    return stoppedResult('BLOCKED', 'INCOME_CLARIFICATION_STATE_INVALID');
  }

  async function resume(rawText) {
    const applied = applySessionOwnerInput(recoverySession, rawText);

    if (applied?.status === 'SELECTION_REQUIRED') {
      recoverySession = applied.state ?? recoverySession;
      return waitingResult(recoverySession);
    }

    if (applied?.status === 'ABORTED') {
      recoverySession = null;
      preparedRequest = null;
      if (text(applied.payload)) return routeFresh(applied.payload);
      return stoppedResult('ABORTED', applied.reason ?? 'ABORTED_BY_USER_INTERRUPTION');
    }

    if (applied?.status === 'REPLACE') {
      recoverySession = null;
      preparedRequest = null;
      return routeFresh(applied.payload);
    }

    if (applied?.status !== 'APPLIED' || !applied.state) {
      return stoppedResult(applied?.status ?? 'BLOCKED', applied?.reason ?? 'RECOVERY_INPUT_NOT_APPLIED');
    }

    recoverySession = applied.state;
    const state = await runtimeState();
    const rejoined = await rejoinRecoverySession(recoverySession, {
      currentRevision:state.revision,
      receivedAt:receivedAt(),
      timeZone,
      requestIdFactory,
      capabilityPreflight:preflightRequest,
    });

    if (rejoined?.routed?.route === 'LOCAL_PATH' && rejoined?.routed?.status === 'READY') {
      return rememberReady(rejoined.routed.prepared.request);
    }
    if (rejoined?.recoverySession) {
      preparedRequest = null;
      recoverySession = rejoined.recoverySession;
      return waitingResult(recoverySession);
    }

    preparedRequest = null;
    recoverySession = null;
    return stoppedResult(
      rejoined?.routed?.status ?? 'BLOCKED',
      routedReason(rejoined?.routed, 'RECOVERY_REJOIN_STOPPED'),
    );
  }

  return frozen({
    async send(rawText) {
      if (executionInFlight) return stoppedResult('BLOCKED', 'TRUSTED_BRAIN_EXECUTION_IN_FLIGHT');
      const input = text(rawText);
      if (!input) return stoppedResult('BLOCKED', 'TRUSTED_BRAIN_TEXT_REQUIRED');
      try {
        if (incomeConversation) return await resolveIncomeConversation(input);
        if (recoverySession) return await resume(input);
        preparedRequest = null;
        return await routeFresh(input);
      } catch (error) {
        const reason = errorReason(error);
        if (reason === 'RUNTIME_SESSION_LOCKED') return stoppedResult('LOCKED', reason);
        return stoppedResult('ERROR', reason);
      }
    },

    async execute() {
      if (executionInFlight) return stoppedResult('BLOCKED', 'TRUSTED_BRAIN_EXECUTION_IN_FLIGHT');
      if (!preparedRequest) return stoppedResult('BLOCKED', 'TRUSTED_BRAIN_NOT_READY');
      const request = preparedRequest;
      executionInFlight = true;
      try {
        const result = await withRuntimeSession(runtime => pathKernel.run(request, { runtime }));
        if (result?.status === 'COMPLETE') {
          preparedRequest = null;
          recoverySession = null;
          incomeConversation = null;
          return frozen({
            status:'SUCCESS',
            reason:null,
            readback:result.readback,
          });
        }
        return stoppedResult(result?.status ?? 'VERIFY', result?.reason ?? 'PATH_EXECUTION_NOT_PROVEN');
      } catch (error) {
        const reason = errorReason(error);
        if (reason === 'RUNTIME_SESSION_LOCKED') return stoppedResult('LOCKED', reason);
        return stoppedResult('ERROR', reason);
      } finally {
        executionInFlight = false;
      }
    },
  });
}
