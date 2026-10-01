// Vendored from Ergasterion-factory 8440e37741b72802df4138b7eca14791a1c65d10; canonical Factory Eye authority remains there.
const byId = (id) => document.getElementById(id);

async function send(type, extra = {}) {
  return browser.runtime.sendMessage({ type, ...extra });
}

function expiryLabel(value) {
  if (!value) return 'not paired';
  const date = new Date(Number(value));
  return Number.isNaN(date.getTime()) ? 'unknown' : date.toLocaleString();
}

async function render() {
  const current = await send('ERGASTERION_FACTORY_EYE_STATUS');
  byId('hub-origin').textContent = current.hubOrigin || '—';
  byId('adapter-id').textContent = current.adapterId || '—';
  byId('version').textContent = current.version || '—';
  byId('paired-state').textContent = current.paired
    ? `Paired · expires ${expiryLabel(current.expiresAt)}`
    : 'Not paired';
  byId('refresh').disabled = !current.paired;
  byId('disconnect').disabled = !current.paired;
}

byId('pair').addEventListener('click', async () => {
  const passcode = byId('passcode').value;
  byId('status').textContent = 'Pairing…';
  const result = await send('ERGASTERION_FACTORY_EYE_PAIR', { passcode });
  byId('passcode').value = '';
  byId('status').textContent = result?.ok
    ? 'Paired. Factory Eye is sending live observations to GO Hub.'
    : `Pair failed: ${result?.error || 'UNKNOWN'}`;
  await render();
});

byId('refresh').addEventListener('click', async () => {
  byId('status').textContent = 'Refreshing…';
  const result = await send('ERGASTERION_FACTORY_EYE_REFRESH');
  byId('status').textContent = result?.ok
    ? 'Observation refreshed.'
    : 'Refresh unavailable. Pair Factory Eye first.';
  await render();
});

byId('disconnect').addEventListener('click', async () => {
  await send('ERGASTERION_FACTORY_EYE_DISCONNECT');
  byId('status').textContent = 'Disconnected.';
  await render();
});

void render();
