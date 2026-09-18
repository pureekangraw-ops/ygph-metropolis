import {
  createIndexedDbLighthouseHubCredentialStore,
  parseLighthouseHubBootstrap,
} from './control-port-credential.mjs';

const API_ROOT = '/hub/api/lighthouse-control-port';

function endpoint(origin, path) {
  return new URL(API_ROOT + path, origin).toString();
}

async function responseJson(response) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(String(body?.code || `LIGHTHOUSE_HUB_HTTP_${response.status}`));
    error.status = response.status;
    throw error;
  }
  return body;
}

export function createLighthouseHubControlPortTransport({
  fetchImpl = globalThis.fetch,
  credentialStore = createIndexedDbLighthouseHubCredentialStore(),
  now = () => Date.now(),
} = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('LIGHTHOUSE_HUB_FETCH_UNAVAILABLE');
  if (!credentialStore || typeof credentialStore.load !== 'function' || typeof credentialStore.save !== 'function') {
    throw new Error('LIGHTHOUSE_HUB_CREDENTIAL_STORE_REQUIRED');
  }

  async function credential() {
    const value = await credentialStore.load();
    if (!value) throw new Error('LIGHTHOUSE_HUB_NOT_PAIRED');
    if (Number(value.expiresAt) <= Number(now())) throw new Error('LIGHTHOUSE_HUB_SESSION_EXPIRED');
    return value;
  }

  async function post(path, body) {
    const paired = await credential();
    const headers = {
      'x-lighthouse-session-id':paired.sessionId,
      'x-lighthouse-session-token':paired.sessionToken,
    };
    if (body !== undefined) headers['content-type'] = 'application/json';
    const response = await fetchImpl(endpoint(paired.hubOrigin, path), {
      method:'POST',
      headers,
      cache:'no-store',
      ...(body === undefined ? {} : { body:JSON.stringify(body) }),
    });
    return responseJson(response);
  }

  async function pair(input) {
    const credential = parseLighthouseHubBootstrap(input);
    await credentialStore.save(credential);
    return Object.freeze({
      status:'PAIRED',
      hubOrigin:credential.hubOrigin,
      sessionId:credential.sessionId,
      expiresAt:credential.expiresAt,
      deviceLabel:credential.deviceLabel,
    });
  }

  async function status() {
    const value = await credentialStore.load();
    if (!value) return Object.freeze({ status:'UNPAIRED' });
    return Object.freeze({
      status:Number(value.expiresAt) <= Number(now()) ? 'EXPIRED' : 'PAIRED',
      hubOrigin:value.hubOrigin,
      sessionId:value.sessionId,
      expiresAt:value.expiresAt,
      deviceLabel:value.deviceLabel,
    });
  }

  async function pullInbox() {
    const body = await post('/pull');
    return Array.isArray(body?.commands) ? body.commands : [];
  }

  async function pushOutbox(receipts) {
    const values = Array.isArray(receipts) ? receipts : [];
    return post('/receipts', { receipts:values });
  }

  async function pushState(packet) {
    if (!packet || typeof packet !== 'object' || Array.isArray(packet)) {
      throw new Error('LIGHTHOUSE_HUB_STATE_REQUIRED');
    }
    return post('/state', packet);
  }

  async function disconnect() {
    let stopped = false;
    try {
      await post('/session/stop');
      stopped = true;
    } finally {
      await credentialStore.clear();
    }
    return Object.freeze({ status:stopped ? 'DISCONNECTED' : 'CLEARED_LOCAL' });
  }

  return Object.freeze({
    pair,
    status,
    pullInbox,
    pushOutbox,
    pushState,
    disconnect,
  });
}
