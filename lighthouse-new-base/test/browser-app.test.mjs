import test from 'node:test';
import assert from 'node:assert/strict';
import { createBrowserApp } from '../src/browser-app.mjs';

function fakeRoot() {
  const listeners = new Map();
  return {
    innerHTML:'',
    addEventListener(type, handler){ listeners.set(type, handler); },
    removeEventListener(type){ listeners.delete(type); },
    click(dataset = {}) {
      const target = {
        dataset,
        closest(selector) {
          if (selector === '[data-top-route]' && dataset.topRoute) return this;
          if (selector === '[data-manual-house]' && dataset.manualHouse) return this;
          return null;
        },
      };
      listeners.get('click')?.({ target, preventDefault(){} });
    },
  };
}

test('browser app owns one navigation state and real clicks rerender the promised destination', () => {
  const root = fakeRoot();
  const app = createBrowserApp({ root });
  app.start();

  assert.match(root.innerHTML, /data-surface="chat"/);
  root.click({ topRoute:'manual' });
  assert.match(root.innerHTML, /data-manual-dashboard/);

  root.click({ manualHouse:'income' });
  assert.match(root.innerHTML, /data-manual-surface="income"/);
  assert.match(root.innerHTML, /<h1>Income<\/h1>/);

  root.click({ topRoute:'manual' });
  assert.match(root.innerHTML, /data-manual-dashboard/);

  root.click({ manualHouse:'outcome' });
  assert.match(root.innerHTML, /data-manual-surface="outcome"/);

  root.click({ topRoute:'settings' });
  assert.match(root.innerHTML, /data-surface="settings"/);

  assert.deepEqual(app.route(), { top:'settings', manualHouse:null });
});

test('browser app ignores legacy house clicks because the central route owner rejects them', () => {
  const root = fakeRoot();
  const app = createBrowserApp({ root });
  app.start();
  root.click({ topRoute:'manual' });
  const dashboard = root.innerHTML;

  root.click({ manualHouse:'store' });
  assert.equal(root.innerHTML, dashboard);
  assert.deepEqual(app.route(), { top:'manual', manualHouse:null });
});

test('browser app stop removes its click ownership instead of leaving a second hidden router', () => {
  const root = fakeRoot();
  const app = createBrowserApp({ root });
  app.start();
  app.stop();
  const before = root.innerHTML;
  root.click({ topRoute:'settings' });
  assert.equal(root.innerHTML, before);
  assert.deepEqual(app.route(), { top:'chat', manualHouse:null });
});
