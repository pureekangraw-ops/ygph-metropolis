const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

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

test("release wiring reserves command gate as last runtime authority", () => {
  const bootstrap = read("sw-bootstrap.js");
  const sw = read("sw.js");
  const pkg = JSON.parse(read("package.json"));
  const manifest = JSON.parse(read("RELEASE_MANIFEST.json"));

  assert.match(bootstrap, /loadScript\("metropolis-command-gate\.js", "data-metropolis-command-gate"\)/);
  assert.ok(bootstrap.indexOf("metropolis-command-gate.js") > bootstrap.indexOf("metropolis-day-cycle.js"));
  assert.ok(sw.includes('"metropolis-command-gate.js"'));
  assert.match(sw, /v4\.2\.6-20260812-r26-command-runtime-gate/);
  assert.match(pkg.scripts["check:syntax"], /node --check metropolis-command-gate\.js/);
  assert.equal(manifest.serviceWorker.releaseId, "v4.2.6-20260812-r26-command-runtime-gate");
  assert.equal(manifest.runtimeOrder.at(-1), "metropolis-command-gate.js");
  assert.ok(manifest.serviceWorker.runtimeAssets.includes("metropolis-command-gate.js"));
  assert.ok(manifest.productionFiles.some(item => item.path === "metropolis-command-gate.js"));
});
