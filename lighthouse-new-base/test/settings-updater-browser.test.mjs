import test from 'node:test';
import assert from 'node:assert/strict';
import { createBrowserApp } from '../src/browser-app.mjs';

function fakeRoot() {
  const listeners = new Map();
  return {
    innerHTML:'',
    addEventListener(type, handler){ listeners.set(type, handler); },
    removeEventListener(type){ listeners.delete(type); },
    async click(dataset = {}) {
      const target = {
        dataset,
        closest(selector) {
          if (selector === '[data-top-route]' && dataset.topRoute) return this;
          if (selector === '[data-settings-action]' && dataset.settingsAction) return this;
          if (selector === '[data-updater-action]' && dataset.updaterAction) return this;
          return null;
        },
      };
      return listeners.get('click')?.({ target, preventDefault(){} });
    },
  };
}

test('Settings check-update button calls the real updater operation and rerenders candidate state', async () => {
  const root = fakeRoot();
  let checks = 0;
  const app = createBrowserApp({
    root,
    model:{
      settings:{
        version:'2.0.1',
        operations:{
          async checkUpdate(){
            checks += 1;
            return {
              state:'update-available',
              canUpdate:true,
              candidate:{ versionName:'2.0.2', versionCode:2002, releaseNotes:'ทดสอบอัปเดต' },
            };
          },
        },
      },
    },
  });
  app.start();
  await root.click({ topRoute:'settings' });
  await root.click({ settingsAction:'check-update' });
  assert.equal(checks, 1);
  assert.match(root.innerHTML, /พบเวอร์ชัน 2\.0\.2/);
  assert.match(root.innerHTML, /data-updater-action="start"/);
});
