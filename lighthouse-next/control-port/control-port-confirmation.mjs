function pendingConfirmation(runtime) {
  return runtime.inbox().find(entry => entry?.status === 'CONFIRMATION_REQUIRED') || null;
}

function commandLabel(command, index) {
  const payload = command?.payload || {};
  const detail = payload.title || payload.source || payload.name || payload.queueId || '';
  const amount = Number(payload.amountBaht);
  const amountText = Number.isFinite(amount) ? ` · ${amount.toLocaleString('th-TH')} บาท` : '';
  const dueText = payload.dueDate ? ` · ${payload.dueDate}` : '';
  return `${index + 1}. ${command?.capabilityId || 'unknown'}${detail ? ` · ${detail}` : ''}${amountText}${dueText}`;
}

function confirmationSummary(entry) {
  if (entry?.capabilityId !== 'system.commandPack') {
    return entry
      ? `${entry.capabilityId}\n${JSON.stringify(entry.payload || {}, null, 2)}`
      : '';
  }
  const commands = Array.isArray(entry?.payload?.commands) ? entry.payload.commands : [];
  const title = String(entry?.payload?.title || '').trim() || 'Command Pack';
  return [
    `system.commandPack · ${title}`,
    `ทั้งหมด ${commands.length} คำสั่ง · ยืนยันครั้งเดียว`,
    '',
    ...commands.map(commandLabel),
  ].join('\n');
}

export function installGoHubCommandConfirmation({
  root = globalThis.document,
  runtime,
  dispatch = event => globalThis.dispatchEvent?.(event),
} = {}) {
  if (!root?.querySelector || !runtime || typeof runtime.inbox !== 'function' ||
      typeof runtime.confirm !== 'function' || typeof runtime.cancel !== 'function') {
    return false;
  }

  const panel = root.querySelector('#go-hub-confirmation');
  const summary = root.querySelector('#go-hub-confirmation-summary');
  const confirmButton = root.querySelector('#go-hub-command-confirm');
  const rejectButton = root.querySelector('#go-hub-command-reject');
  if (!panel || !summary || !confirmButton || !rejectButton || panel.dataset.bound === 'true') return false;
  panel.dataset.bound = 'true';

  function render() {
    const pending = pendingConfirmation(runtime);
    panel.hidden = !pending;
    panel.dataset.requestId = pending?.requestId || '';
    summary.textContent = confirmationSummary(pending);
    return pending;
  }

  async function syncAgain() {
    const EventCtor = globalThis.CustomEvent;
    if (typeof EventCtor === 'function') {
      dispatch(new EventCtor('lighthouse:hub-sync-request'));
    }
  }

  confirmButton.addEventListener('click', async () => {
    const requestId = panel.dataset.requestId || '';
    if (!requestId) return;
    confirmButton.disabled = true;
    rejectButton.disabled = true;
    try {
      await runtime.confirm(requestId);
      try { await runtime.refreshSnapshot?.(); } catch {}
      render();
      await syncAgain();
    } finally {
      confirmButton.disabled = false;
      rejectButton.disabled = false;
    }
  });

  rejectButton.addEventListener('click', async () => {
    const requestId = panel.dataset.requestId || '';
    if (!requestId) return;
    confirmButton.disabled = true;
    rejectButton.disabled = true;
    try {
      runtime.cancel(requestId);
      render();
      await syncAgain();
    } finally {
      confirmButton.disabled = false;
      rejectButton.disabled = false;
    }
  });

  globalThis.addEventListener?.('lighthouse:hub-status', render);
  render();
  return true;
}

export { pendingConfirmation };
