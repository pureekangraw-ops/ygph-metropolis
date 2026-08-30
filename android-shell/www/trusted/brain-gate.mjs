function frozen(value) {
  return Object.freeze(value);
}

function stopped(status, reason) {
  return frozen({ status, reason });
}

function formatBaht(amountSatang) {
  const amount = Number(amountSatang);
  return Number.isSafeInteger(amount) ? (amount / 100).toFixed(2) : '—';
}

function captureConfirm(confirmImpl) {
  if (typeof confirmImpl === 'function') return confirmImpl;
  const confirmFn = globalThis.confirm;
  if (typeof confirmFn !== 'function') throw new Error('TRUSTED_CONFIRMATION_UI_UNAVAILABLE');
  return confirmFn.bind(globalThis);
}

export function createTrustedBrainGate({
  brain,
  confirmImpl = null,
} = {}) {
  if (!brain || typeof brain.send !== 'function' || typeof brain.execute !== 'function') {
    throw new TypeError('TRUSTED_BRAIN_GATE_BRAIN_REQUIRED');
  }
  const trustedConfirm = captureConfirm(confirmImpl);

  let readyPreview = null;
  let confirmationInFlight = false;

  async function send(rawText) {
    if (confirmationInFlight) return stopped('BLOCKED', 'TRUSTED_CONFIRMATION_IN_FLIGHT');
    const result = await brain.send(rawText);
    readyPreview = result?.status === 'READY' ? frozen({ ...(result.preview ?? {}) }) : null;
    return result;
  }

  async function requestExecution() {
    if (confirmationInFlight) return stopped('BLOCKED', 'TRUSTED_CONFIRMATION_IN_FLIGHT');
    if (!readyPreview) return stopped('BLOCKED', 'TRUSTED_CONFIRMATION_NOT_READY');

    confirmationInFlight = true;
    const preview = readyPreview;
    try {
      const title = String(preview?.title ?? 'รายการ').trim() || 'รายการ';
      const approved = await trustedConfirm(`ยืนยันบันทึก ${title} ${formatBaht(preview?.amountSatang)} บาท?`);
      if (!approved) return stopped('CANCELLED', 'TRUSTED_CONFIRMATION_DECLINED');

      const result = await brain.execute();
      if (result?.status === 'SUCCESS') readyPreview = null;
      if (result?.status === 'BLOCKED' && result?.reason === 'TRUSTED_BRAIN_NOT_READY') readyPreview = null;
      return result;
    } finally {
      confirmationInFlight = false;
    }
  }

  return frozen({ send, requestExecution });
}
