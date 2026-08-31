import {
  buildTrustedErrorEvent,
  isTrustedFailure,
  publicErrorResult,
} from './error-policy.mjs';

function frozen(value) {
  return Object.freeze(value);
}

function stopped(status, reason, extras = {}) {
  return frozen({ status, reason, ...extras });
}

function formatBaht(amountSatang) {
  const amount = Number(amountSatang);
  if (!Number.isSafeInteger(amount)) return '—';
  const baht = amount / 100;
  return Number.isInteger(baht) ? String(baht) : baht.toFixed(2);
}

function errorReason(error) {
  return String(error?.message || error || 'TRUSTED_BRAIN_ERROR');
}

function normalizeAnswer(value) {
  return String(value ?? '').trim();
}

function confirmationQuestion(preview) {
  const title = String(preview?.title ?? 'รายการ').trim() || 'รายการ';
  return `จะบันทึก ${title} ${formatBaht(preview?.amountSatang)} บาทไหม`;
}

export function createTrustedBrainGate({
  brain,
  now = () => new Date().toISOString(),
  recordErrorEvent = null,
} = {}) {
  if (!brain || typeof brain.send !== 'function' || typeof brain.execute !== 'function') {
    throw new TypeError('TRUSTED_BRAIN_GATE_BRAIN_REQUIRED');
  }
  if (typeof now !== 'function') throw new TypeError('TRUSTED_BRAIN_GATE_NOW_REQUIRED');
  if (recordErrorEvent != null && typeof recordErrorEvent !== 'function') {
    throw new TypeError('TRUSTED_BRAIN_ERROR_RECORDER_INVALID');
  }

  let pending = null;
  let executionInFlight = false;

  async function exposeFailure(result, { command = '', appVersion = 'unknown' } = {}) {
    const publicResult = publicErrorResult(result);
    if (recordErrorEvent) {
      try {
        const event = buildTrustedErrorEvent({
          result,
          command,
          appVersion,
          occurredAt:now(),
        });
        await recordErrorEvent(event);
      } catch (error) {
        globalThis.console?.error?.('TRUSTED_ERROR_RECORD_FAILED', error);
      }
    }
    return publicResult;
  }

  function clearPending() {
    pending = null;
  }

  async function resolvePending(answer, context = {}) {
    if (!pending) return stopped('BLOCKED', 'TRUSTED_CONFIRMATION_NOT_READY');
    if (executionInFlight) return stopped('BLOCKED', 'TRUSTED_CONFIRMATION_IN_FLIGHT');

    const normalized = normalizeAnswer(answer);
    if (normalized === 'ยกเลิก') {
      clearPending();
      return stopped('CANCELLED', 'TRUSTED_CONFIRMATION_DECLINED');
    }
    if (normalized !== 'ยืนยัน') {
      return stopped('BLOCKED', 'TRUSTED_CONFIRMATION_TEXT_INVALID', {
        question:pending.question,
      });
    }

    executionInFlight = true;
    const command = pending.command;
    const appVersion = String(context?.appVersion ?? pending.appVersion ?? 'unknown').trim() || 'unknown';
    try {
      let result;
      try {
        result = await brain.execute();
      } catch (error) {
        result = stopped('ERROR', errorReason(error));
      }
      clearPending();
      if (result?.status === 'SUCCESS') return frozen({ ...result });
      if (isTrustedFailure(result)) return exposeFailure(result, { command, appVersion });
      return result;
    } finally {
      executionInFlight = false;
    }
  }

  async function send(rawText, context = {}) {
    const text = normalizeAnswer(rawText);
    if (pending) return resolvePending(text, context);
    if (executionInFlight) return stopped('BLOCKED', 'TRUSTED_CONFIRMATION_IN_FLIGHT');

    const command = text;
    const appVersion = String(context?.appVersion ?? 'unknown').trim() || 'unknown';
    let result;
    try {
      result = await brain.send(rawText);
    } catch (error) {
      result = stopped('ERROR', errorReason(error));
    }

    if (result?.status === 'READY') {
      const preview = frozen({ ...(result.preview ?? {}) });
      const question = confirmationQuestion(preview);
      pending = frozen({ preview, question, command, appVersion });
      return frozen({ status:'CONFIRMATION_REQUIRED', preview, question });
    }

    if (isTrustedFailure(result)) return exposeFailure(result, { command, appVersion });
    return result;
  }

  return frozen({ send });
}
