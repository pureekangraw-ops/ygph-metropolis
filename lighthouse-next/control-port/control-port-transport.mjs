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
  WebSocketImpl = globalThis.WebSocket,
  credentialStore = createIndexedDbLighthouseHubCredentialStore(),
  now = () => Date.now(),
  setTimeoutImpl = globalThis.setTimeout?.bind(globalThis),
  clearTimeoutImpl = globalThis.clearTimeout?.bind(globalThis),
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

  async function postWithCredential(paired, path, body) {
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

  async function post(path, body) {
    return postWithCredential(await credential(), path, body);
  }

  const liveControllers = new Set();

  function liveEndpoint(origin) {
    const url = new URL(API_ROOT + '/live', origin);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.search = '';
    url.hash = '';
    return url.toString();
  }

  async function openLive({
    onSignal = () => {},
    onStatus = () => {},
    isActive = () => true,
    reconnect = true,
    minRetryMs = 1_000,
    maxRetryMs = 30_000,
  } = {}) {
    if (typeof WebSocketImpl !== 'function') {
      throw new Error('LIGHTHOUSE_HUB_WEBSOCKET_UNAVAILABLE');
    }
    if (typeof isActive !== 'function' || !isActive()) throw new Error('LIGHTHOUSE_HUB_LIVE_INACTIVE');
    let active = true;
    let socket = null;
    let retryTimer = null;
    let retryMs = Math.max(250, Number(minRetryMs) || 1_000);
    const retryCap = Math.max(retryMs, Number(maxRetryMs) || 30_000);

    const controller = {
      close() {
        active = false;
        if (retryTimer != null && typeof clearTimeoutImpl === 'function') clearTimeoutImpl(retryTimer);
        retryTimer = null;
        try { socket?.close?.(1000, 'LIGHTHOUSE_APP_INACTIVE'); } catch {}
        socket = null;
        liveControllers.delete(controller);
      },
    };
    liveControllers.add(controller);

    function status(value) {
      try { onStatus(Object.freeze({ ...value })); } catch {}
    }

    function scheduleReconnect() {
      if (!active || !isActive() || !reconnect || typeof setTimeoutImpl !== 'function') return;
      if (retryTimer != null) return;
      const waitMs = retryMs;
      retryMs = Math.min(retryCap, retryMs * 2);
      status({ status:'RECONNECT_WAIT', retryInMs:waitMs });
      retryTimer = setTimeoutImpl(() => {
        retryTimer = null;
        void connect();
      }, waitMs);
    }

    async function connect({ required = false } = {}) {
      if (!active || !isActive()) {
        if (required) throw new Error('LIGHTHOUSE_HUB_LIVE_INACTIVE');
        return false;
      }
      let current;
      try {
        current = await credential();
      } catch (error) {
        status({ status:'OFFLINE', reason:String(error?.message || error || 'CREDENTIAL_UNAVAILABLE') });
        scheduleReconnect();
        if (required) throw error;
        return false;
      }
      if (!active || !isActive()) {
        if (required) throw new Error('LIGHTHOUSE_HUB_LIVE_INACTIVE');
        return false;
      }
      try {
        socket = new WebSocketImpl(liveEndpoint(current.hubOrigin));
      } catch (error) {
        status({ status:'OFFLINE', reason:String(error?.message || error || 'WEBSOCKET_CONNECT_FAILED') });
        scheduleReconnect();
        if (required) throw error;
        return false;
      }
      status({ status:'CONNECTING' });

      socket.addEventListener?.('open', () => {
        if (!active || !isActive()) { try { socket?.close?.(); } catch {} return; }
        retryMs = Math.max(250, Number(minRetryMs) || 1_000);
        try {
          socket.send(JSON.stringify({
            type:'AUTH',
            sessionId:current.sessionId,
            sessionToken:current.sessionToken,
          }));
        } catch (error) {
          status({ status:'OFFLINE', reason:String(error?.message || error || 'WEBSOCKET_AUTH_SEND_FAILED') });
          try { socket.close?.(); } catch {}
        }
      });

      socket.addEventListener?.('message', event => {
        if (!active || !isActive()) return;
        let message = null;
        try { message = JSON.parse(String(event?.data || '')); } catch {}
        if (!message || typeof message !== 'object') return;
        if (message.type === 'READY') {
          status({ status:'LIVE' });
          try { onSignal(Object.freeze({ type:'READY' })); } catch {}
          return;
        }
        if (message.type === 'COMMAND_AVAILABLE') {
          try {
            onSignal(Object.freeze({
              type:'COMMAND_AVAILABLE',
              requestId:message.requestId || null,
              capabilityId:message.capabilityId || null,
            }));
          } catch {}
          return;
        }
        if (message.type === 'ERROR') {
          status({ status:'ERROR', reason:String(message.code || 'LIVE_ERROR') });
        }
      });

      socket.addEventListener?.('close', event => {
        socket = null;
        if (!active) return;
        status({
          status:'OFFLINE',
          reason:event?.reason ? String(event.reason) : 'WEBSOCKET_CLOSED',
        });
        scheduleReconnect();
      });

      socket.addEventListener?.('error', () => {
        status({ status:'OFFLINE', reason:'WEBSOCKET_ERROR' });
      });
      return true;
    }

    try {
      await connect({ required:true });
    } catch (error) {
      controller.close();
      throw error;
    }
    return Object.freeze(controller);
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

  async function pullInbox({ isActive = () => true } = {}) {
    if (typeof isActive !== 'function' || !isActive()) throw new Error('LIGHTHOUSE_HUB_PULL_INACTIVE');
    const paired = await credential();
    if (!isActive()) throw new Error('LIGHTHOUSE_HUB_PULL_INACTIVE');
    const body = await postWithCredential(paired, '/pull');
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
    for (const controller of [...liveControllers]) controller.close();
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
    openLive,
    disconnect,
  });
}
