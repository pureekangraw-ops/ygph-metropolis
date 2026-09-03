import test from 'node:test';
import assert from 'node:assert/strict';

const requiredServices = [
  'session', 'chat', 'manual', 'modules',
  'recovery', 'backup', 'updates', 'events',
];

test('createAppServices exposes the canonical service surface without DOM dependencies', async () => {
  const { createAppServices } = await import('../app/public/app/app-services.mjs');
  const dependencies = Object.fromEntries(requiredServices.map((name) => [name, Object.freeze({ name })]));
  const services = await createAppServices(dependencies);

  assert.deepEqual(Object.keys(services), requiredServices);
  assert.equal(Object.isFrozen(services), true);
  for (const name of requiredServices) assert.equal(services[name], dependencies[name]);
});

test('createAppServices rejects an incomplete composition root', async () => {
  const { createAppServices } = await import('../app/public/app/app-services.mjs');
  const dependencies = Object.fromEntries(requiredServices.slice(0, -1).map((name) => [name, { name }]));
  await assert.rejects(() => createAppServices(dependencies), /MISSING_APP_SERVICE:events/);
});
