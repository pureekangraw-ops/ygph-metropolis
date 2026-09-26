const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = process.cwd();
const runtimePath = path.join(root, 'greenfield/runtime.mjs');
const persistencePath = path.join(root, 'greenfield/persistence.mjs');
const coordinatorPath = path.join(root, 'greenfield/mutation-coordinator.mjs');
const retryPath = path.join(root, 'lighthouse-next/mutation-retry.mjs');

function read(file) {
  assert.equal(fs.existsSync(file), true, `missing ${path.relative(root, file)}`);
  return fs.readFileSync(file, 'utf8');
}

test('Core Data Truth keeps one encrypted owner with serialized mutations and verified readback', () => {
  const runtime = read(runtimePath);
  const persistence = read(persistencePath);
  const coordinator = read(coordinatorPath);

  assert.match(runtime, /createMutationCoordinator/);
  assert.match(runtime, /coordinator\.run\(async \(\) => \{[\s\S]*?executeAtomicWorkflow/);
  assert.match(runtime, /commitEncryptedState\(\{[\s\S]*?expectedDurableRevision:current\.revision/);
  assert.match(runtime, /lastState\s*=\s*await readEncryptedState\(\{ store, passphrase \}\)/);
  assert.match(persistence, /expectedDurableRevision/);
  assert.match(persistence, /durableAfter\s*=\s*await readEncryptedState/);
  assert.match(persistence, /DURABLE_READBACK_MISMATCH/);
  assert.match(coordinator, /GREENFIELD_WRITE_LOCK/);
  assert.match(coordinator, /mode: 'WEB_LOCKS'/);
});

test('Core Data Truth keeps ambiguous retry identity stable without storing business payload', () => {
  const retry = read(retryPath);
  assert.match(retry, /fingerprintMutationPayload/);
  assert.match(retry, /verificationPending/);
  assert.match(retry, /LIGHTHOUSE_MUTATION_RETRY_PAYLOAD_LOCKED/);
  assert.doesNotMatch(retry, /JSON\.stringify\(payload\)/);
});
