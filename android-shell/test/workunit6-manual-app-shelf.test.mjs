import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createMemoryVaultStore } from '../app/public/logic/storage/persistence.mjs';
import { createModuleControlPlane } from '../app/public/logic/modules/module-control-plane.mjs';
import { createManualAppShelf } from '../app/public/ui/manual-app-shelf.mjs';

function makeDom() {
  const dom = new JSDOM('<!doctype html><html><body><main id="manual"></main></body></html>');
  return { window:dom.window, document:dom.window.document, root:dom.window.document.querySelector('#manual') };
}

test('manual shelf renders from module snapshot without hardcoded tile count', async () => {
  const store = createMemoryVaultStore();
  const modules = createModuleControlPlane({ store });
  await modules.initialize();
  const { window, document, root } = makeDom();
  const shelf = createManualAppShelf({ window, document, root, modules });
  await shelf.render();
  assert.deepEqual([...root.querySelectorAll('[data-module-id]')].map(node => node.dataset.moduleId), ['income','outcome','calendar','ledger']);
});

test('disabled and uninstalled modules disappear from openable snapshot and route uses OPEN first', async () => {
  const store = createMemoryVaultStore();
  const modules = createModuleControlPlane({ store });
  await modules.initialize();
  const initial = await modules.snapshot();
  await modules.execute({ commandId:'disable-income', actor:'USER', source:'UI', moduleId:'income', capability:'DISABLE', input:{}, expectedRevision:initial.revision });
  const afterDisable = await modules.snapshot();
  await modules.execute({ commandId:'uninstall-outcome', actor:'USER', source:'UI', moduleId:'outcome', capability:'UNINSTALL', input:{}, expectedRevision:afterDisable.revision });

  const { window, document, root } = makeDom();
  const opened = [];
  const shelf = createManualAppShelf({ window, document, root, modules, navigate:route => opened.push(route) });
  await shelf.render();
  assert.deepEqual([...root.querySelectorAll('[data-module-id]')].map(node => node.dataset.moduleId), ['calendar','ledger']);
  root.querySelector('[data-module-id="calendar"] button').click();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(opened.length, 1);
  assert.equal(opened[0].moduleId, 'calendar');
  assert.equal(opened[0].opened, true);
});

test('module render failure exposes recovery back to MANUAL instead of breaking shell', async () => {
  const { window, document, root } = makeDom();
  const modules = { list:async () => { throw new Error('REGISTRY_READ_FAILED'); }, open:async () => ({ opened:true }) };
  const shelf = createManualAppShelf({ window, document, root, modules });
  await shelf.render();
  assert.match(root.textContent, /MANUAL/);
  assert.ok(root.querySelector('[data-action="manual-retry"]'));
});
