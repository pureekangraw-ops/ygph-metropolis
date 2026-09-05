import { preflightConfirmedLedgerRequest } from './source/app/logic/chat/confirmed-ledger-executor.mjs';

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
  return frozen({
    title:String(request?.fields?.title ?? ''),
    amountSatang:Number(request?.fields?.amountSatang ?? 0),
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

function stoppedResult(status, reason, extras = {}) {
  return frozen({ status, reason:reason ?? null, ...extras });
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
  let executionInFlight = false;

  async function runtimeState() {
    return withRuntimeSession(async runtime => {
      const state = await runtime.readState();
      if (!state || !Number.isSafeInteger(state.revision)) throw new Error('GREENFIELD_NOT_INITIALIZED');
      return state;
    });
  }

  function rememberReady(request) {
    const preflight = preflightRequest(request);
    if (preflight?.status !== 'READY') {
      preparedRequest = null;
      return stoppedResult(preflight?.status ?? 'BLOCKED', preflight?.reason ?? 'NO_LEGAL_PATH');
    }
    preparedRequest = request;
    recoverySession = null;
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
