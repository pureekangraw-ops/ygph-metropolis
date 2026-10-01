'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

async function contract() {
  return import('../prism/product-contract.mjs');
}

test('PRISM Full Product Spec exposes bounded surfaces and explicit system boundaries', async () => {
  const { PRISM_BOUNDARIES, buildPrismProductSnapshot } = await contract();
  const snapshot = buildPrismProductSnapshot({});
  assert.deepEqual(snapshot.surfaces, ['COPILOT', 'PROJECTS', 'HANDOFF', 'MAP', 'LEDGER', 'MONITOR']);
  assert.equal(PRISM_BOUNDARIES.PRISM, 'OWNER_INTERFACE_AND_WORK_RUNTIME');
  assert.equal(PRISM_BOUNDARIES.GO_HUB, 'COORDINATION_AND_BACKEND_ORCHESTRATION');
  assert.equal(PRISM_BOUNDARIES.FACTORY, 'PRODUCTION_AND_MUTATION');
  assert.equal(PRISM_BOUNDARIES.FACTORY_EYE, 'OBSERVATION');
  assert.equal(PRISM_BOUNDARIES.LEDGER, 'FINANCIAL_TRUTH');
  assert.equal(snapshot.projection.readOnly, true);
  assert.equal(snapshot.projection.sourceOfTruth, 'UPSTREAM_WORK_AND_DOMAIN_SYSTEMS');
});

test('PRISM keeps request, route, execution, and verification distinct', async () => {
  const { buildPrismProductSnapshot } = await contract();
  const snapshot = buildPrismProductSnapshot({
    route: { route: 'MANUAL', fallback: true },
    executed: false,
    verified: false,
  });
  assert.equal(snapshot.dispatch.route, 'MANUAL');
  assert.equal(snapshot.dispatch.fallback, true);
  assert.equal(snapshot.dispatch.outcome, 'MANUAL_REQUIRED');
  assert.equal(snapshot.dispatch.dispatchable, false);
  assert.equal(snapshot.dispatch.executed, false);
  assert.equal(snapshot.dispatch.verified, false);
});

test('observer and evidence truth preserve UNKNOWN, STALE, and OFFLINE', async () => {
  const { buildPrismProductSnapshot } = await contract();
  assert.equal(buildPrismProductSnapshot({}).observer.status, 'UNKNOWN');
  assert.equal(buildPrismProductSnapshot({ observer: { status: 'STALE' }, browserEvidence: { url: 'https://example.test' } }).evidence.status, 'STALE');
  assert.equal(buildPrismProductSnapshot({ observer: { status: 'OFFLINE' }, browserEvidence: { url: 'https://example.test' } }).evidence.status, 'OFFLINE');
  assert.equal(buildPrismProductSnapshot({ observer: { status: 'LIVE' }, browserEvidence: { url: 'https://example.test' } }).evidence.status, 'PRESENT');
});

test('Full Product Spec does not create a second work or financial source of truth', async () => {
  const { buildPrismProductSnapshot } = await contract();
  const snapshot = buildPrismProductSnapshot({
    works: [{ workId: 'W1', checkpointId: 'C1', title: 'A', status: 'WAIT', decision: { kind: 'VERIFY' } }],
  });
  assert.equal(snapshot.projects.active, 1);
  assert.equal(snapshot.decisions[0].workId, 'W1');
  assert.equal(snapshot.boundaries.LEDGER, 'FINANCIAL_TRUTH');
  assert.equal(snapshot.projection.readOnly, true);
  assert.equal(Object.prototype.hasOwnProperty.call(snapshot, 'ledgerTruth'), false);
});
