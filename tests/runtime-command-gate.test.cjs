const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { loadProductionRuntime, readRuntimeOrder } = require("./helpers/metropolis-runtime-harness.cjs");

const root = path.resolve(__dirname, "..");
const gatePath = path.join(root, "metropolis-command-gate.js");
const read = file => fs.readFileSync(path.join(root, file), "utf8");

function loadGate() {
  assert.ok(fs.existsSync(gatePath), "metropolis-command-gate.js must exist");
  delete require.cache[require.resolve(gatePath)];
  return require(gatePath);
}

test("command gate exposes pure hardening contract", () => {
  const gate = loadGate();
  assert.equal(gate.COMMAND_GATE_VERSION, "1.0.0");
  assert.equal(typeof gate.revisionFreshness, "function");
  assert.equal(typeof gate.buildRuntimeFingerprint, "function");
  assert.equal(typeof gate.normalizeGateStatus, "function");
  assert.equal(typeof gate.createGuardedCommit, "function");
});

test("revision freshness rejects stale or regressed durable truth", () => {
  const { revisionFreshness } = loadGate();
  assert.deepEqual(revisionFreshness(21, 21), {
    state: "CURRENT",
    memoryRevision: 21,
    durableRevision: 21
  });
  assert.deepEqual(revisionFreshness(21, 22), {
    state: "STALE",
    memoryRevision: 21,
    durableRevision: 22
  });
  assert.deepEqual(revisionFreshness(22, 21), {
    state: "INVALID",
    memoryRevision: 22,
    durableRevision: 21
  });
});

test("guarded commit blocks a stale context before commit and restores durable truth", async () => {
  const { createGuardedCommit } = loadGate();
  let memoryRevision = 21;
  let commits = 0;
  let restored = null;
  const durable = { state: { revision: 22, marker: "newer" }, vault: { cipher: "durable" } };

  const guarded = createGuardedCommit({
    readDurableTruth: async () => durable,
    getMemoryRevision: () => memoryRevision,
    restoreDurableTruth: async value => {
      restored = value;
      memoryRevision = value.state.revision;
    },
    commit: async () => {
      commits += 1;
      return { stateRevision: 22 };
    },
    withLock: task => task(),
    onCommitted: () => {}
  });

  await assert.rejects(
    () => guarded("save", { eventType: "TEST" }),
    error => error?.code === "STALE_CONTEXT"
  );
  assert.equal(commits, 0, "stale context must never reach the durable commit");
  assert.deepEqual(restored, durable, "newest durable truth must replace stale in-memory state");
});

test("guarded commit verifies the durable read-back revision before announcing success", async () => {
  const { createGuardedCommit } = loadGate();
  let memoryRevision = 21;
  const announcements = [];
  const guarded = createGuardedCommit({
    readDurableTruth: async () => ({ state: { revision: 21 }, vault: {} }),
    getMemoryRevision: () => memoryRevision,
    restoreDurableTruth: async () => assert.fail("current context must not restore"),
    commit: async () => {
      memoryRevision = 22;
      return { status: "VERIFIED", stateRevision: 22, durableHash: "hash" };
    },
    withLock: task => task(),
    onCommitted: revision => announcements.push(revision)
  });

  const readback = await guarded("save", { eventType: "TEST" });
  assert.equal(readback.stateRevision, 22);
  assert.deepEqual(announcements, [22]);
});

test("guarded commit rejects a mismatched post-write read-back revision", async () => {
  const { createGuardedCommit } = loadGate();
  let memoryRevision = 21;
  const guarded = createGuardedCommit({
    readDurableTruth: async () => ({ state: { revision: 21 }, vault: {} }),
    getMemoryRevision: () => memoryRevision,
    restoreDurableTruth: async () => {},
    commit: async () => {
      memoryRevision = 22;
      return { status: "VERIFIED", stateRevision: 21 };
    },
    withLock: task => task(),
    onCommitted: () => assert.fail("mismatched read-back must not be announced")
  });

  await assert.rejects(
    () => guarded("save", {}),
    error => error?.code === "READBACK_REVISION_MISMATCH"
  );
});

test("runtime fingerprint keeps one diagnostic identity across layers", () => {
  const { buildRuntimeFingerprint } = loadGate();
  const fingerprint = buildRuntimeFingerprint({
    productVersion: "4.2.6",
    coreDataRelease: "2.1.5",
    coreVersion: "2.0.1",
    flowVersion: "3.5.0",
    stateSchema: 4,
    stateRevision: 21,
    dbName: "stock-pocket-secure",
    dbVersion: 1,
    vaultVersion: 1,
    swReleaseId: "v4.2.6-20260812-r26-command-runtime-gate",
    swServing: "ygph-metropolis-app-v4.2.6-20260812-r26-command-runtime-gate",
    readbackStatus: "VERIFIED",
    storagePersisted: true,
    webLocks: true,
    broadcastChannel: true
  });

  assert.deepEqual(fingerprint, {
    commandGate: "1.0.0",
    product: "4.2.6",
    coreData: "2.1.5",
    core: "2.0.1",
    flow: "3.5.0",
    schema: 4,
    revision: 21,
    database: "stock-pocket-secure/v1",
    vault: "v1",
    serviceWorker: {
      releaseId: "v4.2.6-20260812-r26-command-runtime-gate",
      serving: "ygph-metropolis-app-v4.2.6-20260812-r26-command-runtime-gate"
    },
    readback: "VERIFIED",
    storage: "PERSISTENT",
    crossContext: "LOCK+BROADCAST"
  });
});

test("production runtime loads command gate last and wraps durable persistence", async t => {
  const runtime = loadProductionRuntime();
  t.after(() => runtime.close());
  await runtime.flushRuntime();

  assert.equal(runtime.scriptErrors.length, 0, JSON.stringify(runtime.scriptErrors));
  assert.equal(readRuntimeOrder().at(-1), "metropolis-command-gate.js");
  assert.equal(runtime.window.YGPHCommandGate?.VERSION, "1.0.0");
  assert.equal(runtime.evaluate("Boolean(persistAndRender.__YGPH_COMMAND_GATE__)"), true);
  assert.equal(runtime.evaluate("Boolean(saveEncryptedState.__YGPH_COMMAND_GATE__)"), true);
});

test("release wiring reserves command gate as last runtime authority", () => {
  const bootstrap = read("sw-bootstrap.js");
  const sw = read("sw.js");
  const pkg = JSON.parse(read("package.json"));
  const manifest = JSON.parse(read("RELEASE_MANIFEST.json"));

  assert.match(bootstrap, /loadScript\("metropolis-command-gate\.js", "data-metropolis-command-gate"\)/);
  assert.ok(bootstrap.indexOf("metropolis-command-gate.js") > bootstrap.indexOf("metropolis-day-cycle.js"));
  assert.ok(sw.includes('"metropolis-command-gate.js"'));
  assert.match(manifest.serviceWorker.releaseId, /^v4\.2\.6-\d{8}-r\d+-/);
  assert.ok(sw.includes(`const RELEASE_ID = "${manifest.serviceWorker.releaseId}";`));
  assert.match(pkg.scripts["check:syntax"], /node --check metropolis-command-gate\.js/);
  assert.equal(manifest.runtimeOrder.at(-1), "metropolis-command-gate.js");
  assert.ok(manifest.serviceWorker.runtimeAssets.includes("metropolis-command-gate.js"));
  assert.ok(manifest.productionFiles.some(item => item.path === "metropolis-command-gate.js"));
});
