import { CONTROL_PORT_GUARD } from './control-port.mjs';

export const CONTROL_PORT_STORAGE_KEY = 'lighthouse-control-port-v1';
export const CONTROL_PORT_STATE_SCHEMA = 1;
export const CONTROL_PORT_SNAPSHOT_CONTRACT_VERSION = 1;

const TERMINAL = new Set(['COMPLETE','ERROR','CANCELLED']);
const SECRET_KEY = /^(?:(?:device|owner|security)?pin(?:hash|code|value)?|.*password|.*passphrase|recovery(?:code|key|phrase|token|secret)|vault(?:key|password|secret|token)|.*secret|.*token)$/i;

function clone(value) {
  return value == null ? value : structuredClone(value);
}

function optionalText(value) {
  const output = String(value ?? '').trim();
  return output || null;
}

function stateRecord(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const record = clone(value);
    const status = optionalText(record.status) || 'UNKNOWN';
    return Object.freeze({ ...record, status });
  }
  return Object.freeze({ status:optionalText(value) || 'UNKNOWN' });
}

function text(value, code) {
  const output = String(value ?? '').trim();
  if (!output) throw new Error(code);
  return output;
}

function requestId(value) {
  const id = text(value, 'LIGHTHOUSE_CONTROL_PORT_REQUEST_ID_REQUIRED');
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(id)) throw new Error('LIGHTHOUSE_CONTROL_PORT_REQUEST_ID_INVALID');
  return id;
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function containsSecret(value, seen = new Set()) {
  if (!value || typeof value !== 'object') return false;
  if (seen.has(value)) return false;
  seen.add(value);
  for (const [key, nested] of Object.entries(value)) {
    if (SECRET_KEY.test(String(key).replace(/[^A-Za-z0-9]/g, ''))) return true;
    if (containsSecret(nested, seen)) return true;
  }
  return false;
}

function newState(at) {
  return {
    schema:CONTROL_PORT_STATE_SCHEMA,
    localRevision:1,
    updatedAt:at,
    inbox:{},
    outbox:{},
    work:{
      pendingRequestId:null,
      blocker:null,
      nextAction:'WAITING_COMMAND',
      lastSuccessfulReadback:null,
    },
    snapshot:null,
    audit:[],
  };
}

function normalizeState(value, at) {
  if (!value || typeof value !== 'object' || value.schema !== CONTROL_PORT_STATE_SCHEMA) return newState(at);
  return {
    schema:CONTROL_PORT_STATE_SCHEMA,
    localRevision:Number.isSafeInteger(Number(value.localRevision)) && Number(value.localRevision) >= 1 ? Number(value.localRevision) : 1,
    updatedAt:value.updatedAt ? String(value.updatedAt) : at,
    inbox:value.inbox && typeof value.inbox === 'object' && !Array.isArray(value.inbox) ? value.inbox : {},
    outbox:value.outbox && typeof value.outbox === 'object' && !Array.isArray(value.outbox) ? value.outbox : {},
    work:{
      pendingRequestId:value.work?.pendingRequestId ?? null,
      blocker:value.work?.blocker ?? null,
      nextAction:value.work?.nextAction || 'WAITING_COMMAND',
      lastSuccessfulReadback:value.work?.lastSuccessfulReadback ?? null,
    },
    snapshot:value.snapshot ?? null,
    audit:Array.isArray(value.audit) ? value.audit.slice(-200) : [],
  };
}

export function createMemoryControlPortStorage(seed = {}) {
  const values = new Map(Object.entries(seed));
  return Object.freeze({
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
    dump() { return Object.fromEntries(values); },
  });
}

export function createLighthouseControlPortRuntime({
  port,
  storage = globalThis.localStorage,
  storageKey = CONTROL_PORT_STORAGE_KEY,
  now = () => new Date().toISOString(),
  staleAfterMs = 5 * 60 * 1000,
  actor = 'GO_HUB',
  snapshotMetadata = {},
} = {}) {
  if (!port || typeof port.propose !== 'function' || typeof port.commit !== 'function') {
    throw new Error('LIGHTHOUSE_CONTROL_PORT_RUNTIME_PORT_REQUIRED');
  }
  if (!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function') {
    throw new Error('LIGHTHOUSE_CONTROL_PORT_STORAGE_UNAVAILABLE');
  }

  async function resolveSnapshotMetadata(runtimeStatus) {
    const supplied = typeof snapshotMetadata === 'function'
      ? await snapshotMetadata()
      : snapshotMetadata;
    const metadata = supplied && typeof supplied === 'object' && !Array.isArray(supplied) ? supplied : {};
    const ownerInput = metadata.owner && typeof metadata.owner === 'object' && !Array.isArray(metadata.owner)
      ? metadata.owner
      : { system:metadata.owner };

    return Object.freeze({
      contractVersion:CONTROL_PORT_SNAPSHOT_CONTRACT_VERSION,
      appVersion:optionalText(metadata.appVersion),
      mainSha:optionalText(metadata.mainSha),
      buildState:stateRecord(metadata.buildState),
      deployState:stateRecord(metadata.deployState),
      runtimeState:Object.freeze({
        status:runtimeStatus?.status === 'READY' ? 'ACTIVE' : 'INACTIVE',
        controlPortStatus:optionalText(runtimeStatus?.status) || 'UNAVAILABLE',
      }),
      updaterState:stateRecord(metadata.updaterState),
      source:Object.freeze({
        repository:optionalText(metadata.source?.repository) || 'pureekangraw-ops/ygph-metropolis',
        branch:optionalText(metadata.source?.branch),
      }),
      owner:Object.freeze({
        system:optionalText(ownerInput.system) || 'METROPOLIS',
        runtime:optionalText(ownerInput.runtime) || 'LIGHTHOUSE_CONTROL_PORT',
      }),
    });
  }

  function load() {
    const at = now();
    try {
      const raw = storage.getItem(storageKey);
      return normalizeState(raw ? JSON.parse(raw) : null, at);
    } catch {
      return newState(at);
    }
  }

  function persist(state) {
    const next = clone(state);
    next.localRevision = Number(next.localRevision || 0) + 1;
    next.updatedAt = now();
    storage.setItem(storageKey, JSON.stringify(next));
    return next;
  }

  function mutate(operation) {
    const current = load();
    const next = clone(current);
    operation(next);
    return persist(next);
  }

  function nextConfirmation(state) {
    return Object.values(state?.inbox || {}).find(entry => entry?.status === 'CONFIRMATION_REQUIRED') || null;
  }

  function settleWorkAfterTerminal(state) {
    const pending = nextConfirmation(state);
    if (pending) {
      state.work.pendingRequestId = pending.requestId;
      state.work.blocker = 'CONFIRMATION_REQUIRED';
      state.work.nextAction = 'AWAIT_CONFIRMATION';
      return;
    }
    state.work.pendingRequestId = null;
    state.work.blocker = null;
    state.work.nextAction = 'WAITING_COMMAND';
  }

  function audit(state, event) {
    state.audit.push(Object.freeze({
      at:now(),
      actor:String(event.actor || actor),
      requestId:event.requestId ?? null,
      capabilityId:event.capabilityId ?? null,
      action:event.action ?? null,
      beforeRevision:event.beforeRevision ?? null,
      afterRevision:event.afterRevision ?? null,
      result:event.result ?? null,
      readbackRevision:event.readbackRevision ?? null,
    }));
    state.audit = state.audit.slice(-200);
  }

  function receiptFrom(entry, status, details = {}) {
    return Object.freeze({
      requestId:entry.requestId,
      capabilityId:entry.capabilityId,
      status,
      beforeRevision:details.beforeRevision ?? entry.beforeRevision ?? null,
      afterRevision:details.afterRevision ?? entry.afterRevision ?? null,
      readback:details.readback ? clone(details.readback) : null,
      reason:details.reason ?? null,
      updatedAt:now(),
    });
  }

  function receive(command = {}) {
    const id = requestId(command.requestId);
    const capabilityId = text(command.capabilityId, 'LIGHTHOUSE_CONTROL_PORT_CAPABILITY_REQUIRED');
    const current = load();
    const proposal = port.propose({ requestId:id, capabilityId, payload:command.payload || {} });
    if (current.inbox[id]) {
      const existing = current.inbox[id];
      const sameCapability = existing.capabilityId === capabilityId;
      const samePayload = existing.payloadRedacted || canonical(existing.payload || {}) === canonical(command.payload || {});
      if (!sameCapability || !samePayload) throw new Error(`LIGHTHOUSE_CONTROL_PORT_REQUEST_ID_CONFLICT:${id}`);
      return clone(existing);
    }
    const forbiddenPayload = containsSecret(command.payload || {});
    const effectiveGuard = forbiddenPayload ? CONTROL_PORT_GUARD.FORBIDDEN : proposal.guard;
    const safePayload = effectiveGuard === CONTROL_PORT_GUARD.FORBIDDEN ? null : clone(command.payload || {});

    let created;
    mutate(state => {
      created = {
        requestId:id,
        capabilityId,
        payload:safePayload,
        payloadRedacted:effectiveGuard === CONTROL_PORT_GUARD.FORBIDDEN,
        guard:effectiveGuard,
        owner:proposal.owner,
        action:proposal.action,
        status:'RECEIVED',
        receivedAt:now(),
        confirmed:false,
        beforeRevision:null,
        afterRevision:null,
        lastError:null,
      };
      state.inbox[id] = created;
      state.work.pendingRequestId = id;
      state.work.blocker = null;
      state.work.nextAction = effectiveGuard === CONTROL_PORT_GUARD.FORBIDDEN ? 'BLOCK_FORBIDDEN' : 'PROCESS_COMMAND';
      audit(state, {
        requestId:id,
        capabilityId,
        action:proposal.action,
        result:'RECEIVED',
      });
    });
    return clone(created);
  }

  function setTransition(id, status, updates = {}) {
    let output;
    mutate(state => {
      const entry = state.inbox[id];
      if (!entry) throw new Error(`LIGHTHOUSE_CONTROL_PORT_COMMAND_NOT_FOUND:${id}`);
      Object.assign(entry, updates, { status, updatedAt:now() });
      state.inbox[id] = entry;
      output = clone(entry);
    });
    return output;
  }

  function writeReceipt(id, receipt) {
    mutate(state => {
      state.outbox[id] = clone(receipt);
    });
    return clone(receipt);
  }

  async function process(idValue, { confirmed = false } = {}) {
    const id = requestId(idValue);
    let state = load();
    let entry = state.inbox[id];
    if (!entry) throw new Error(`LIGHTHOUSE_CONTROL_PORT_COMMAND_NOT_FOUND:${id}`);
    if (entry.status === 'COMPLETE') return clone(state.outbox[id]);
    if (entry.status === 'CANCELLED') return clone(state.outbox[id]);

    if (entry.guard === CONTROL_PORT_GUARD.FORBIDDEN) {
      const reason = entry.payloadRedacted ? 'FORBIDDEN_OR_SECRET_PAYLOAD' : 'FORBIDDEN';
      setTransition(id, 'BLOCKED', { lastError:reason });
      const receipt = receiptFrom(entry, 'BLOCKED', { reason });
      mutate(next => {
        next.outbox[id] = receipt;
        next.work.pendingRequestId = id;
        next.work.blocker = reason;
        next.work.nextAction = 'REQUIRES_ALLOWED_CAPABILITY';
        audit(next, { requestId:id, capabilityId:entry.capabilityId, action:entry.action, result:'BLOCKED' });
      });
      return clone(receipt);
    }

    entry = setTransition(id, 'PROCESSING', { confirmed:Boolean(confirmed || entry.confirmed), lastError:null });
    mutate(next => {
      next.work.pendingRequestId = id;
      next.work.blocker = null;
      next.work.nextAction = 'OWNER_COMMIT';
      audit(next, { requestId:id, capabilityId:entry.capabilityId, action:entry.action, result:'PROCESSING' });
    });

    const proposal = port.propose({
      requestId:id,
      capabilityId:entry.capabilityId,
      payload:entry.payload || {},
    });

    try {
      const result = await port.commit(proposal, { confirmed:Boolean(confirmed || entry.confirmed) });
      if (result.status === 'CONFIRMATION_REQUIRED') {
        setTransition(id, 'CONFIRMATION_REQUIRED', { confirmed:false });
        const receipt = receiptFrom(entry, 'BLOCKED', { reason:'CONFIRMATION_REQUIRED' });
        mutate(next => {
          next.outbox[id] = receipt;
          next.work.pendingRequestId = id;
          next.work.blocker = 'CONFIRMATION_REQUIRED';
          next.work.nextAction = 'AWAIT_CONFIRMATION';
          audit(next, { requestId:id, capabilityId:entry.capabilityId, action:entry.action, result:'CONFIRMATION_REQUIRED' });
        });
        return clone(receipt);
      }

      setTransition(id, 'READBACK', {
        confirmed:Boolean(confirmed || entry.confirmed),
        beforeRevision:result.beforeRevision ?? null,
        afterRevision:result.afterRevision ?? result.revision ?? null,
      });

      const readbackSummary = {
        requestId:id,
        capabilityId:entry.capabilityId,
        revision:result.revision ?? null,
        updatedAt:result.updatedAt ?? null,
        readbackAt:result.readbackAt ?? now(),
      };
      const receipt = receiptFrom(entry, 'DONE', {
        beforeRevision:result.beforeRevision,
        afterRevision:result.afterRevision ?? result.revision,
        readback:{
          revision:result.revision ?? null,
          updatedAt:result.updatedAt ?? null,
          evidence:clone(result.evidence),
        },
      });
      mutate(next => {
        const target = next.inbox[id];
        target.status = 'COMPLETE';
        target.confirmed = Boolean(confirmed || target.confirmed);
        target.beforeRevision = result.beforeRevision ?? null;
        target.afterRevision = result.afterRevision ?? result.revision ?? null;
        target.updatedAt = now();
        next.inbox[id] = target;
        next.outbox[id] = receipt;
        settleWorkAfterTerminal(next);
        next.work.lastSuccessfulReadback = readbackSummary;
        audit(next, {
          requestId:id,
          capabilityId:entry.capabilityId,
          action:entry.action,
          beforeRevision:result.beforeRevision,
          afterRevision:result.afterRevision ?? result.revision,
          result:'DONE',
          readbackRevision:result.revision,
        });
      });
      return clone(receipt);
    } catch (error) {
      const code = String(error?.message || error || 'CONTROL_PORT_PROCESS_FAILED');
      const verify = /READBACK|OWNER_NOT_VERIFIED|REVISION|RECOVERY_CONFLICT/.test(code);
      const blocked = code === 'RUNTIME_SESSION_LOCKED';
      const receiptStatus = verify ? 'VERIFY' : blocked ? 'BLOCKED' : 'FAILED';
      const inboxStatus = blocked ? 'BLOCKED' : 'ERROR';

      setTransition(id, inboxStatus, { lastError:code, confirmed:Boolean(confirmed || entry.confirmed) });
      const receipt = receiptFrom(entry, receiptStatus, { reason:code });
      mutate(next => {
        next.outbox[id] = receipt;
        next.work.pendingRequestId = id;
        next.work.blocker = code;
        next.work.nextAction = verify ? 'VERIFY_READBACK' : blocked ? 'RETRY_WHEN_RUNTIME_AVAILABLE' : 'REVIEW_ERROR';
        audit(next, { requestId:id, capabilityId:entry.capabilityId, action:entry.action, result:receiptStatus });
      });
      return clone(receipt);
    }
  }

  async function confirm(id) {
    const rid = requestId(id);
    mutate(state => {
      const entry = state.inbox[rid];
      if (!entry) throw new Error(`LIGHTHOUSE_CONTROL_PORT_COMMAND_NOT_FOUND:${rid}`);
      entry.confirmed = true;
      entry.updatedAt = now();
      state.inbox[rid] = entry;
    });
    return process(rid, { confirmed:true });
  }

  function cancel(id) {
    const rid = requestId(id);
    const current = load();
    const entry = current.inbox[rid];
    if (!entry) throw new Error(`LIGHTHOUSE_CONTROL_PORT_COMMAND_NOT_FOUND:${rid}`);
    if (entry.status === 'READBACK' || entry.status === 'COMPLETE') {
      throw new Error(`LIGHTHOUSE_CONTROL_PORT_CANCEL_TOO_LATE:${rid}`);
    }
    const receipt = receiptFrom(entry, 'BLOCKED', { reason:'CANCELLED' });
    mutate(state => {
      state.inbox[rid] = { ...state.inbox[rid], status:'CANCELLED', updatedAt:now() };
      state.outbox[rid] = receipt;
      settleWorkAfterTerminal(state);
      audit(state, { requestId:rid, capabilityId:entry.capabilityId, action:entry.action, result:'CANCELLED' });
    });
    return clone(receipt);
  }

  function retryReceipt(id) {
    const rid = requestId(id);
    const receipt = load().outbox[rid];
    if (!receipt) throw new Error(`LIGHTHOUSE_CONTROL_PORT_RECEIPT_NOT_FOUND:${rid}`);
    return clone(receipt);
  }

  function inbox() {
    return Object.values(load().inbox).map(clone);
  }

  function outbox() {
    return Object.values(load().outbox).map(clone);
  }

  function workState() {
    return clone(load().work);
  }

  function auditLog() {
    return load().audit.map(clone);
  }

  async function processPending() {
    const entries = inbox().filter(entry => !TERMINAL.has(entry.status));
    const results = [];
    for (const entry of entries) {
      if (entry.status === 'CONFIRMATION_REQUIRED') continue;
      if (entry.status === 'BLOCKED' && entry.guard === CONTROL_PORT_GUARD.FORBIDDEN) continue;
      results.push(await process(entry.requestId, { confirmed:Boolean(entry.confirmed) }));
    }
    return results;
  }

  async function refreshSnapshot() {
    const ids = [
      'finance.balance',
      'finance.todayIn',
      'finance.todayOut',
      'finance.net',
      'finance.dailyGoal',
      'finance.obligations',
      'finance.receivables',
      'calendar.records',
      'store.products',
      'ride.summary',
      'centreBoard.read',
      'system.appState',
    ];
    const values = {};
    const revisions = new Set();
    let updatedAt = null;

    for (const capabilityId of ids) {
      const result = await port.query({ capabilityId });
      values[capabilityId] = clone(result.value);
      if (Number.isSafeInteger(Number(result.revision))) revisions.add(Number(result.revision));
      if (result.updatedAt) updatedAt = String(result.updatedAt);
    }
    if (revisions.size > 1) throw new Error('LIGHTHOUSE_CONTROL_PORT_SNAPSHOT_REVISION_DRIFT');

    const health = await port.health();
    if (Number.isSafeInteger(Number(health.revision))) revisions.add(Number(health.revision));
    if (revisions.size > 1) throw new Error('LIGHTHOUSE_CONTROL_PORT_SNAPSHOT_REVISION_DRIFT');

    const runtimeStatus = await port.status();
    const contract = await resolveSnapshotMetadata(runtimeStatus);
    const currentState = load();
    const snapshot = {
      ...contract,
      revision:revisions.size ? [...revisions][0] : null,
      updatedAt:health.updatedAt || updatedAt,
      capturedAt:now(),
      health:clone(health),
      readbackSummary:clone(currentState.work.lastSuccessfulReadback),
      values,
    };
    mutate(state => {
      state.snapshot = snapshot;
    });
    return snapshotStatus();
  }

  async function snapshotStatus() {
    const state = load();
    const snapshot = clone(state.snapshot);
    const runtimeStatus = await port.status();
    const currentContract = await resolveSnapshotMetadata(runtimeStatus);
    const contract = snapshot
      ? {
          contractVersion:snapshot.contractVersion ?? currentContract.contractVersion,
          appVersion:snapshot.appVersion ?? currentContract.appVersion,
          mainSha:snapshot.mainSha ?? currentContract.mainSha,
          buildState:clone(snapshot.buildState ?? currentContract.buildState),
          deployState:clone(snapshot.deployState ?? currentContract.deployState),
          runtimeState:currentContract.runtimeState,
          updaterState:clone(snapshot.updaterState ?? currentContract.updaterState),
          source:clone(snapshot.source ?? currentContract.source),
          owner:clone(snapshot.owner ?? currentContract.owner),
        }
      : currentContract;
    const readbackSummary = clone(state.work.lastSuccessfulReadback ?? snapshot?.readbackSummary ?? null);

    if (!snapshot) {
      return {
        ...contract,
        freshness:'OFFLINE',
        revision:null,
        updatedAt:null,
        capturedAt:null,
        readbackSummary,
        snapshot:null,
        runtimeStatus:runtimeStatus.status,
      };
    }
    if (runtimeStatus.status !== 'READY') {
      return {
        ...contract,
        freshness:'OFFLINE',
        revision:snapshot.revision,
        updatedAt:snapshot.updatedAt,
        capturedAt:snapshot.capturedAt,
        readbackSummary,
        snapshot,
        runtimeStatus:runtimeStatus.status,
      };
    }
    const age = new Date(now()).getTime() - new Date(snapshot.capturedAt).getTime();
    const freshness = Number.isFinite(age) && age <= staleAfterMs ? 'LIVE' : 'STALE';
    return {
      ...contract,
      freshness,
      revision:snapshot.revision,
      updatedAt:snapshot.updatedAt,
      capturedAt:snapshot.capturedAt,
      readbackSummary,
      snapshot,
      runtimeStatus:runtimeStatus.status,
    };
  }

  function state() {
    return load();
  }

  return Object.freeze({
    receive,
    process,
    confirm,
    cancel,
    retryReceipt,
    inbox,
    outbox,
    workState,
    auditLog,
    processPending,
    refreshSnapshot,
    snapshotStatus,
    state,
  });
}
