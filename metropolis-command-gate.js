"use strict";

(() => {
  const COMMAND_GATE_VERSION = "1.0.0";
  const VAULT_LOCK_NAME = "ygph-metropolis-vault-write";
  const STATE_CHANNEL_NAME = "ygph-metropolis-state";

  function safeRevision(value) {
    const revision = Number(value);
    return Number.isSafeInteger(revision) && revision >= 0 ? revision : null;
  }

  function revisionFreshness(memoryRevision, durableRevision) {
    const memory = safeRevision(memoryRevision);
    const durable = safeRevision(durableRevision);
    const state = memory == null || durable == null
      ? "INVALID"
      : durable === memory
        ? "CURRENT"
        : durable > memory
          ? "STALE"
          : "INVALID";
    return {
      state,
      memoryRevision: memory == null ? Number(memoryRevision) : memory,
      durableRevision: durable == null ? Number(durableRevision) : durable
    };
  }

  function storageLabel(value) {
    if (value === true) return "PERSISTENT";
    if (value === false) return "BEST_EFFORT";
    return "UNKNOWN";
  }

  function transportLabel(webLocks, broadcastChannel) {
    if (webLocks && broadcastChannel) return "LOCK+BROADCAST";
    if (webLocks) return "LOCK_ONLY";
    if (broadcastChannel) return "BROADCAST_ONLY";
    return "LOCAL_ONLY";
  }

  function buildRuntimeFingerprint(input = {}) {
    return {
      commandGate: COMMAND_GATE_VERSION,
      product: String(input.productVersion ?? "UNKNOWN"),
      coreData: String(input.coreDataRelease ?? "UNKNOWN"),
      core: String(input.coreVersion ?? "UNKNOWN"),
      flow: String(input.flowVersion ?? "UNKNOWN"),
      schema: safeRevision(input.stateSchema),
      revision: safeRevision(input.stateRevision),
      database: `${String(input.dbName ?? "UNKNOWN")}/v${safeRevision(input.dbVersion) ?? "?"}`,
      vault: `v${safeRevision(input.vaultVersion) ?? "?"}`,
      serviceWorker: {
        releaseId: String(input.swReleaseId ?? "UNKNOWN"),
        serving: String(input.swServing ?? "UNKNOWN")
      },
      readback: String(input.readbackStatus ?? "NONE"),
      storage: storageLabel(input.storagePersisted),
      crossContext: transportLabel(Boolean(input.webLocks), Boolean(input.broadcastChannel))
    };
  }

  function normalizeGateStatus(input = {}) {
    const allowed = new Set(["CURRENT", "STALE", "INVALID", "VERIFY", "BLOCKED"]);
    return {
      state: allowed.has(input.state) ? input.state : "VERIFY",
      reason: String(input.reason || ""),
      observedRevision: safeRevision(input.observedRevision)
    };
  }

  function gateError(code, message, details = {}) {
    const error = new Error(message);
    error.code = code;
    Object.assign(error, details);
    return error;
  }

  function readbackFrom(result) {
    if (result && typeof result === "object" && result.readback && typeof result.readback === "object") return result.readback;
    return result;
  }

  function createGuardedCommit({
    readDurableTruth,
    getMemoryRevision,
    restoreDurableTruth,
    commit,
    withLock,
    onCommitted
  } = {}) {
    const required = { readDurableTruth, getMemoryRevision, restoreDurableTruth, commit, withLock, onCommitted };
    for (const [name, value] of Object.entries(required)) {
      if (typeof value !== "function") throw new TypeError(`Command Gate requires ${name}()`);
    }

    return async function guardedCommit(...args) {
      return withLock(async () => {
        const durable = await readDurableTruth();
        if (durable?.state) {
          const freshness = revisionFreshness(getMemoryRevision(), durable.state.revision);
          if (freshness.state === "STALE") {
            await restoreDurableTruth(durable);
            throw gateError(
              "STALE_CONTEXT",
              `พบข้อมูลรุ่นใหม่กว่าในอีกหน้าต่าง (${freshness.memoryRevision} → ${freshness.durableRevision})`,
              freshness
            );
          }
          if (freshness.state !== "CURRENT") {
            throw gateError(
              "REVISION_DIVERGENCE",
              `State revision ไม่สอดคล้องกับ Vault (${freshness.memoryRevision} / ${freshness.durableRevision})`,
              freshness
            );
          }
        }

        const result = await commit(...args);
        const readback = readbackFrom(result);
        const memoryRevision = safeRevision(getMemoryRevision());
        const readbackRevision = safeRevision(readback?.stateRevision);
        if (memoryRevision == null || readbackRevision !== memoryRevision) {
          throw gateError(
            "READBACK_REVISION_MISMATCH",
            `อ่านกลับหลังบันทึกไม่ตรงกับ State (${memoryRevision ?? "?"} / ${readbackRevision ?? "?"})`,
            { memoryRevision, readbackRevision }
          );
        }
        onCommitted(memoryRevision, readback);
        return result;
      });
    };
  }

  const pureApi = {
    COMMAND_GATE_VERSION,
    revisionFreshness,
    buildRuntimeFingerprint,
    normalizeGateStatus,
    createGuardedCommit
  };

  if (typeof module === "object" && module.exports) module.exports = pureApi;

  if (typeof window === "undefined" || typeof document === "undefined") return;
  if (typeof persistAndRender !== "function" || typeof saveEncryptedState !== "function") return;

  const originalPersistAndRender = persistAndRender;
  const originalSaveEncryptedState = saveEncryptedState;
  let storagePersisted = null;
  let observedExternalRevision = null;
  let gateStatus = normalizeGateStatus({ state: "VERIFY", reason: "ยังไม่มีคำสั่งผ่าน Gate" });
  let localLockTail = Promise.resolve();
  const channelSupported = typeof window.BroadcastChannel === "function";
  const lockSupported = Boolean(window.navigator?.locks && typeof window.navigator.locks.request === "function");
  const channel = channelSupported ? new window.BroadcastChannel(STATE_CHANNEL_NAME) : null;

  function nowText() {
    try { return typeof nowIso === "function" ? nowIso() : new Date().toISOString(); }
    catch (_) { return new Date().toISOString(); }
  }

  async function localLock(task) {
    const run = localLockTail.then(task, task);
    localLockTail = run.catch(() => undefined);
    return run;
  }

  function withVaultLock(task) {
    if (lockSupported) {
      return window.navigator.locks.request(VAULT_LOCK_NAME, { mode: "exclusive" }, task);
    }
    return localLock(task);
  }

  async function readDurableTruth() {
    if (typeof cryptoKey === "undefined" || !cryptoKey) return null;
    if (typeof dbGet !== "function" || typeof decryptVault !== "function") return null;
    const vault = await dbGet(VAULT_KEY);
    if (!vault) return null;
    const durableState = await decryptVault(vault, cryptoKey);
    return { vault, state: durableState };
  }

  async function restoreDurableTruth(durable) {
    if (!durable?.state || !durable?.vault) throw gateError("DURABLE_TRUTH_MISSING", "ไม่พบ Durable State สำหรับกู้บริบท");
    state = durable.state;
    currentVault = durable.vault;
    lastDurableReadback = {
      status: "CONTEXT_REFRESHED",
      verifiedAt: nowText(),
      stateRevision: safeRevision(durable.state.revision),
      durableHash: null
    };
    gateStatus = normalizeGateStatus({
      state: "STALE",
      reason: "โหลด Durable State รุ่นใหม่กว่าแล้ว",
      observedRevision: durable.state.revision
    });
    if (typeof renderAll === "function") renderAll();
  }

  function broadcastCommit(revision) {
    observedExternalRevision = null;
    gateStatus = normalizeGateStatus({ state: "CURRENT", reason: "Durable read-back verified", observedRevision: revision });
    try {
      channel?.postMessage({ type: "STATE_COMMITTED", revision, at: nowText() });
    } catch (_) {}
  }

  if (channel) {
    channel.onmessage = event => {
      if (event?.data?.type !== "STATE_COMMITTED") return;
      const externalRevision = safeRevision(event.data.revision);
      const memoryRevision = safeRevision(typeof state === "undefined" ? null : state?.revision);
      if (externalRevision == null || memoryRevision == null || externalRevision <= memoryRevision) return;
      observedExternalRevision = externalRevision;
      gateStatus = normalizeGateStatus({
        state: "STALE",
        reason: "อีกบริบทบันทึก State รุ่นใหม่กว่า",
        observedRevision: externalRevision
      });
      syncTechnicalStatus();
    };
  }

  const guardedPersist = createGuardedCommit({
    readDurableTruth,
    getMemoryRevision: () => typeof state === "undefined" ? null : state?.revision,
    restoreDurableTruth,
    commit: (...args) => originalPersistAndRender(...args),
    withLock: withVaultLock,
    onCommitted: broadcastCommit
  });

  const guardedSave = createGuardedCommit({
    readDurableTruth,
    getMemoryRevision: () => typeof state === "undefined" ? null : state?.revision,
    restoreDurableTruth,
    commit: (...args) => originalSaveEncryptedState(...args),
    withLock: withVaultLock,
    onCommitted: broadcastCommit
  });

  async function commandGatePersistAndRender(...args) {
    return guardedPersist(...args);
  }
  commandGatePersistAndRender.__YGPH_COMMAND_GATE__ = true;

  async function commandGateSaveEncryptedState(...args) {
    return guardedSave(...args);
  }
  commandGateSaveEncryptedState.__YGPH_COMMAND_GATE__ = true;

  persistAndRender = commandGatePersistAndRender;
  saveEncryptedState = commandGateSaveEncryptedState;

  async function refreshStorageHealth() {
    const storage = window.navigator?.storage;
    if (!storage) {
      storagePersisted = null;
      return storagePersisted;
    }
    try {
      if (typeof storage.persisted === "function") storagePersisted = Boolean(await storage.persisted());
      if (storagePersisted !== true && typeof storage.persist === "function") storagePersisted = Boolean(await storage.persist());
    } catch (_) {
      storagePersisted = null;
    }
    syncTechnicalStatus();
    return storagePersisted;
  }

  function runtimeFingerprint() {
    const proof = (typeof lastDurableReadback !== "undefined" && lastDurableReadback)
      || (typeof state !== "undefined" ? state?.sync?.flow?.lastReadbackRuntime : null)
      || null;
    const sw = typeof serviceWorkerStatus !== "undefined" ? serviceWorkerStatus : null;
    return buildRuntimeFingerprint({
      productVersion: globalThis.YGPH_METROPOLIS_PRODUCT_VERSION || document.documentElement.dataset.metropolisVersion || "UNKNOWN",
      coreDataRelease: typeof CORE_DATA_RELEASE_VERSION !== "undefined" ? CORE_DATA_RELEASE_VERSION : "UNKNOWN",
      coreVersion: globalThis.YGPHCore?.VERSION || "NOT_LOADED",
      flowVersion: globalThis.YGPH_FLOW_UI_VERSION || document.documentElement.dataset.flowUiVersion || "UNKNOWN",
      stateSchema: typeof STATE_SCHEMA !== "undefined" ? STATE_SCHEMA : null,
      stateRevision: typeof state !== "undefined" ? state?.revision : null,
      dbName: typeof DB_NAME !== "undefined" ? DB_NAME : "UNKNOWN",
      dbVersion: typeof DB_VERSION !== "undefined" ? DB_VERSION : null,
      vaultVersion: typeof VAULT_VERSION !== "undefined" ? VAULT_VERSION : null,
      swReleaseId: sw?.releaseId || sw?.lifecycle?.current || "UNKNOWN",
      swServing: sw?.lifecycle?.serving || "UNKNOWN",
      readbackStatus: proof?.status || "NONE",
      storagePersisted,
      webLocks: lockSupported,
      broadcastChannel: channelSupported
    });
  }

  function status() {
    return Object.freeze({
      version: COMMAND_GATE_VERSION,
      ...gateStatus,
      observedExternalRevision,
      storagePersisted,
      fingerprint: runtimeFingerprint()
    });
  }

  function syncTechnicalStatus() {
    const node = document.getElementById("technicalStatus");
    if (!node) return;
    const marker = "Command gate:";
    if (node.textContent.includes(marker)) return;
    const fp = runtimeFingerprint();
    const stateText = gateStatus.state === "CURRENT" ? "CURRENT" : gateStatus.state;
    node.textContent += `\n${marker} ${COMMAND_GATE_VERSION} / ${stateText} / ${fp.crossContext} / Storage ${fp.storage}`;
  }

  const runtimeApi = Object.freeze({
    VERSION: COMMAND_GATE_VERSION,
    revisionFreshness,
    buildRuntimeFingerprint,
    normalizeGateStatus,
    status,
    refreshStorageHealth
  });
  globalThis.YGPHCommandGate = runtimeApi;

  if (globalThis.YGPHRuntime?.register) {
    globalThis.YGPHRuntime.register("METROPOLIS_COMMAND_GATE", {
      afterRender: syncTechnicalStatus,
      afterPageChange: syncTechnicalStatus
    });
  }

  syncTechnicalStatus();
  void refreshStorageHealth();
})();
