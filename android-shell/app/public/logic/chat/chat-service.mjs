const CHAT_STATE_KEY = 'chat-conversation-state';
const ROUTES = new Set(['DIRECT_COMMAND', 'LOCAL_QUERY', 'LOCAL_MULTI_GROUP', 'RECOVERY', 'PROVIDER']);

function clone(value) { return structuredClone(value); }
function required(value, code) { const out = String(value ?? '').trim(); if (!out) throw new Error(code); return out; }

function initialState() {
  return { revision:1, requests:{}, order:[] };
}

function normalizeIntent(intent) {
  if (!intent || typeof intent !== 'object' || Array.isArray(intent)) throw new Error('INVALID_CHAT_INTENT');
  const route = required(intent.route, 'CHAT_ROUTE_REQUIRED');
  if (!ROUTES.has(route)) throw new Error(`CHAT_ROUTE_UNSUPPORTED:${route}`);
  return {
    requestId:required(intent.requestId, 'CHAT_REQUEST_ID_REQUIRED'),
    route,
    payload:intent.payload && typeof intent.payload === 'object' ? clone(intent.payload) : {},
  };
}

export function createChatService({ store, modules, query = null, multiGroup = null, recovery = null, provider = null, now = () => new Date().toISOString() } = {}) {
  if (!store || typeof store.get !== 'function' || typeof store.put !== 'function') throw new TypeError('CHAT_STORE_REQUIRED');
  if (!modules || typeof modules.execute !== 'function') throw new TypeError('CHAT_MODULE_SERVICE_REQUIRED');

  async function readState() {
    return clone((await store.get(CHAT_STATE_KEY)) || initialState());
  }

  async function writeState(next) {
    await store.put(CHAT_STATE_KEY, next);
    const durable = await store.get(CHAT_STATE_KEY);
    if (!durable || durable.revision !== next.revision) throw new Error('CHAT_STATE_READBACK_FAILED');
    return clone(durable);
  }

  async function patchRequest(requestId, patch) {
    const state = await readState();
    const previous = state.requests[requestId] || null;
    const next = clone(state);
    next.requests[requestId] = { ...(previous || {}), ...clone(patch), requestId, updatedAt:now() };
    if (!previous) next.order.push(requestId);
    next.revision += 1;
    await writeState(next);
    return clone(next.requests[requestId]);
  }

  async function executeRoute(intent) {
    if (intent.route === 'DIRECT_COMMAND') return modules.execute(intent.payload);
    if (intent.route === 'LOCAL_QUERY') {
      if (typeof query !== 'function') throw new Error('CHAT_QUERY_HANDLER_REQUIRED');
      return query(intent.payload);
    }
    if (intent.route === 'LOCAL_MULTI_GROUP') {
      if (typeof multiGroup !== 'function') throw new Error('CHAT_MULTI_GROUP_HANDLER_REQUIRED');
      return multiGroup(intent.payload);
    }
    if (intent.route === 'RECOVERY') {
      if (!recovery || typeof recovery.retry !== 'function') throw new Error('CHAT_RECOVERY_HANDLER_REQUIRED');
      return recovery.retry(intent.payload);
    }
    if (intent.route === 'PROVIDER') {
      if (typeof provider !== 'function') throw new Error('CHAT_PROVIDER_HANDLER_REQUIRED');
      return provider(intent.payload);
    }
    throw new Error(`CHAT_ROUTE_UNSUPPORTED:${intent.route}`);
  }

  function successResult(intent, raw) {
    const accepted = new Set(['VERIFIED', 'COMMITTED', 'RECOVERED']);
    if (!accepted.has(raw?.status)) throw new Error(`CHAT_RESULT_NOT_VERIFIED:${raw?.status || 'UNKNOWN'}`);
    if ((intent.route === 'DIRECT_COMMAND' || intent.route === 'LOCAL_MULTI_GROUP') && raw?.readback == null) {
      throw new Error('CHAT_MUTATION_READBACK_REQUIRED');
    }
    return {
      requestId:intent.requestId,
      status:'SUCCESS',
      route:intent.route,
      result:clone(raw),
    };
  }

  async function dispatch(rawIntent) {
    const intent = normalizeIntent(rawIntent);
    const state = await readState();
    const recovered = state.requests[intent.requestId];
    if (recovered?.status === 'SUCCESS' || recovered?.status === 'CANCELLED') return clone(recovered.response || recovered);
    if (recovered?.status === 'EXECUTING') throw new Error('CHAT_REQUEST_IN_FLIGHT');

    await patchRequest(intent.requestId, { status:'EXECUTING', route:intent.route, intent });
    try {
      const raw = await executeRoute(intent);
      const response = successResult(intent, raw);
      await patchRequest(intent.requestId, { status:'SUCCESS', response });
      return response;
    } catch (error) {
      await patchRequest(intent.requestId, { status:'ERROR', errorCode:String(error?.message || error) });
      throw error;
    }
  }

  async function getState() { return readState(); }

  async function retry(requestId) {
    requestId = required(requestId, 'CHAT_REQUEST_ID_REQUIRED');
    const state = await readState();
    const record = state.requests[requestId];
    if (!record?.intent) throw new Error('CHAT_REQUEST_NOT_FOUND');
    if (record.status !== 'ERROR') throw new Error('CHAT_RETRY_NOT_ALLOWED');
    const next = clone(state);
    delete next.requests[requestId];
    next.order = next.order.filter(id => id !== requestId);
    next.revision += 1;
    await writeState(next);
    return dispatch(record.intent);
  }

  async function confirm(requestId, answer) {
    requestId = required(requestId, 'CHAT_REQUEST_ID_REQUIRED');
    const state = await readState();
    const record = state.requests[requestId];
    if (!record || record.status !== 'WAITING_CONFIRMATION') throw new Error('CHAT_CONFIRM_NOT_ALLOWED');
    return patchRequest(requestId, { status:answer ? 'EXECUTING' : 'CANCELLED', confirmation:Boolean(answer) });
  }

  async function cancel(requestId) {
    requestId = required(requestId, 'CHAT_REQUEST_ID_REQUIRED');
    const state = await readState();
    const record = state.requests[requestId];
    if (!record) throw new Error('CHAT_REQUEST_NOT_FOUND');
    if (record.status === 'SUCCESS') throw new Error('CHAT_CANCEL_NOT_ALLOWED');
    const response = { requestId, status:'CANCELLED', route:record.route };
    await patchRequest(requestId, { status:'CANCELLED', response });
    return response;
  }

  return Object.freeze({ dispatch, getState, retry, confirm, cancel });
}
