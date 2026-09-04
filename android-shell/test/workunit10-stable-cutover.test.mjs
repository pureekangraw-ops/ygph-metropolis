import test from 'node:test';
import assert from 'node:assert/strict';
import { createGreenfieldState } from '../../greenfield/core.mjs';
import { createMemoryVaultStore, commitEncryptedState } from '../../greenfield/persistence.mjs';
import { createGreenfieldRuntime } from '../../greenfield/runtime.mjs';
import { buildOtherIncomeWorkflow } from '../../greenfield/business-workflows.mjs';

const PASSPHRASE = 'LH-cutover-runtime-passphrase';
const NOW = '2026-09-04T13:10:00.000Z';

async function fixture() {
  const store = createMemoryVaultStore();
  const state = createGreenfieldState({ now:NOW });
  await commitEncryptedState({ store, passphrase:PASSPHRASE, state, expectedDurableRevision:null });
  return { store, runtime:createGreenfieldRuntime({ store, passphrase:PASSPHRASE, lockManager:null, now:() => NOW }) };
}

test('stable cutover exposes canonical multi-group mutation through the existing encrypted runtime owner', async () => {
  const { runtime } = await fixture();
  assert.equal(typeof runtime.executeMultiGroupCommands, 'function');

  const workflow = buildOtherIncomeWorkflow({
    workflowId:'WF-CUTOVER-INCOME-1',
    ledgerTransactionId:'TX-CUTOVER-INCOME-1',
    amountSatang:12345,
    title:'canonical cutover witness',
  });
  const result = await runtime.executeMultiGroupCommands(workflow.commands);
  assert.ok(['COMMITTED','RECOVERED','VERIFIED'].includes(result.status));

  const durable = await runtime.readState();
  const record = durable.domains.LEDGER.records['TX-CUTOVER-INCOME-1']?.record;
  assert.equal(record?.amountSatang, 12345);
  assert.equal(record?.direction, 'IN');
});

test('canonical service metadata stays encrypted in the same durable vault across runtime reopen', async () => {
  const { store, runtime } = await fixture();
  assert.equal(typeof runtime.metadataStore, 'function');
  const metadata = runtime.metadataStore();
  const before = await runtime.readState();

  await metadata.put('module-registry', { revision:1, marker:'CANONICAL' });
  assert.deepEqual(await metadata.get('module-registry'), { revision:1, marker:'CANONICAL' });
  const after = await runtime.readState();
  assert.equal(after.revision, before.revision + 1);
  assert.equal(after.meta?.canonicalServices?.['module-registry']?.marker, 'CANONICAL');

  runtime.close();
  const reopened = createGreenfieldRuntime({ store, passphrase:PASSPHRASE, lockManager:null, now:() => NOW });
  const reopenedMetadata = reopened.metadataStore();
  assert.deepEqual(await reopenedMetadata.get('module-registry'), { revision:1, marker:'CANONICAL' });

  await reopenedMetadata.delete('module-registry');
  assert.equal(await reopenedMetadata.get('module-registry'), null);
  assert.equal((await reopened.readState()).meta?.canonicalServices?.['module-registry'], undefined);
});
