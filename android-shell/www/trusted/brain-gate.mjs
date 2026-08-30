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
  return Number.isSafeInteger(amount) ? (amount / 100).toFixed(2) : '—';
}

function errorReason(error) {
  return String(error?.message || error || 'TRUSTED_BRAIN_ERROR');
}

function normalizeAnswer(value) {
  return String(value ?? '').trim();
}

function createDocumentConfirmation(documentRef) {
  return async (question) => {
    if (!documentRef?.body || typeof documentRef.createElement !== 'function') {
      throw new Error('TRUSTED_CONFIRMATION_UI_UNAVAILABLE');
    }

    return new Promise((resolve) => {
      const host = documentRef.createElement('section');
      host.setAttribute('data-lighthouse-trusted-confirmation-host', '');
      host.style.cssText = 'position:fixed;z-index:2147483647;inset:0;display:grid;place-items:end center;padding:16px;background:rgba(8,18,34,.32)';
      const shadow = host.attachShadow({ mode:'closed' });
      shadow.innerHTML = `
        <style>
          :host{all:initial}
          .card{box-sizing:border-box;width:min(32rem,100%);padding:16px;border-radius:18px;background:#fff;color:#10213d;box-shadow:0 18px 60px rgba(8,18,34,.28);font:15px/1.45 Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
          .mark{font-size:12px;font-weight:800;letter-spacing:.03em;color:#647187}
          p{margin:7px 0 12px;font-size:16px;font-weight:700}
          form{display:grid;gap:8px}
          input{box-sizing:border-box;width:100%;min-height:46px;padding:10px 12px;border:1px solid #cfd7e3;border-radius:12px;font:inherit;color:#10213d;background:#fff}
          button{min-height:44px;border:0;border-radius:12px;background:#10213d;color:#fff;font:inherit;font-weight:800}
          .status{min-height:20px;color:#a02d2d;font-size:13px}
        </style>
        <div class="card" role="dialog" aria-modal="true" aria-label="LIGHTHOUSE trusted confirmation">
          <div class="mark">LIGHTHOUSE · Trusted confirmation</div>
          <p data-question></p>
          <form>
            <input autocomplete="off" inputmode="text" aria-label="พิมพ์ ยืนยัน หรือ ยกเลิก" placeholder="พิมพ์ ยืนยัน หรือ ยกเลิก" required>
            <button type="submit">ส่งคำตอบ</button>
            <div class="status" role="alert"></div>
          </form>
        </div>`;

      const questionNode = shadow.querySelector('[data-question]');
      const form = shadow.querySelector('form');
      const input = shadow.querySelector('input');
      const status = shadow.querySelector('.status');
      questionNode.textContent = question;

      const finish = (answer) => {
        host.remove();
        resolve(answer);
      };

      form.addEventListener('submit', (event) => {
        event.preventDefault();
        if (event.isTrusted !== true) return;
        const answer = normalizeAnswer(input.value);
        if (answer === 'ยืนยัน' || answer === 'ยกเลิก') {
          finish(answer);
          return;
        }
        status.textContent = 'พิมพ์ “ยืนยัน” หรือ “ยกเลิก”';
        input.select();
      });

      documentRef.body.append(host);
      input.focus();
    });
  };
}

function captureTypedConfirmation({ confirmTextImpl, confirmImpl, documentRef } = {}) {
  if (typeof confirmTextImpl === 'function') return confirmTextImpl;
  if (typeof confirmImpl === 'function') {
    return async (question) => (await confirmImpl(question)) ? 'ยืนยัน' : 'ยกเลิก';
  }
  if (documentRef?.body && typeof documentRef.createElement === 'function') {
    return createDocumentConfirmation(documentRef);
  }
  const confirmFn = globalThis.confirm;
  if (typeof confirmFn !== 'function') throw new Error('TRUSTED_CONFIRMATION_UI_UNAVAILABLE');
  const captured = confirmFn.bind(globalThis);
  return async (question) => (await captured(question)) ? 'ยืนยัน' : 'ยกเลิก';
}

export function createTrustedBrainGate({
  brain,
  confirmImpl = null,
  confirmTextImpl = null,
  documentRef = globalThis.document,
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

  const trustedConfirm = captureTypedConfirmation({ confirmTextImpl, confirmImpl, documentRef });

  let readyPreview = null;
  let readyCommand = '';
  let readyAppVersion = 'unknown';
  let confirmationInFlight = false;

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

  async function send(rawText, context = {}) {
    if (confirmationInFlight) return stopped('BLOCKED', 'TRUSTED_CONFIRMATION_IN_FLIGHT');
    const command = String(rawText ?? '').trim();
    const appVersion = String(context?.appVersion ?? 'unknown').trim() || 'unknown';
    let result;
    try {
      result = await brain.send(rawText);
    } catch (error) {
      result = stopped('ERROR', errorReason(error));
    }

    if (result?.status === 'READY') {
      readyPreview = frozen({ ...(result.preview ?? {}) });
      readyCommand = command;
      readyAppVersion = appVersion;
      return result;
    }

    readyPreview = null;
    readyCommand = '';
    readyAppVersion = 'unknown';
    if (isTrustedFailure(result)) return exposeFailure(result, { command, appVersion });
    return result;
  }

  async function requestExecution(context = {}) {
    if (confirmationInFlight) return stopped('BLOCKED', 'TRUSTED_CONFIRMATION_IN_FLIGHT');
    if (!readyPreview) return stopped('BLOCKED', 'TRUSTED_CONFIRMATION_NOT_READY');

    confirmationInFlight = true;
    const preview = readyPreview;
    const command = readyCommand;
    const appVersion = String(context?.appVersion ?? readyAppVersion ?? 'unknown').trim() || 'unknown';
    try {
      const title = String(preview?.title ?? 'รายการ').trim() || 'รายการ';
      const answer = normalizeAnswer(await trustedConfirm(
        `จะบันทึก ${title} ${formatBaht(preview?.amountSatang)} บาท ใช่ไหม? พิมพ์ “ยืนยัน” หรือ “ยกเลิก”`,
      ));

      if (answer === 'ยกเลิก') {
        readyPreview = null;
        readyCommand = '';
        readyAppVersion = 'unknown';
        return stopped('CANCELLED', 'TRUSTED_CONFIRMATION_DECLINED', { confirmationText:'ยกเลิก' });
      }
      if (answer !== 'ยืนยัน') {
        return stopped('BLOCKED', 'TRUSTED_CONFIRMATION_TEXT_INVALID');
      }

      let result;
      try {
        result = await brain.execute();
      } catch (error) {
        result = stopped('ERROR', errorReason(error));
      }

      readyPreview = null;
      readyCommand = '';
      readyAppVersion = 'unknown';
      if (result?.status === 'SUCCESS') {
        return frozen({ ...result, confirmationText:'ยืนยัน' });
      }
      if (isTrustedFailure(result)) return exposeFailure(result, { command, appVersion });
      return result;
    } finally {
      confirmationInFlight = false;
    }
  }

  return frozen({ send, requestExecution });
}
