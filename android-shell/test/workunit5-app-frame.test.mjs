import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createAppFrame } from '../app/public/ui/app-frame.mjs';

function makeDom() {
  const dom = new JSDOM('<!doctype html><html><head></head><body><div id="app"></div></body></html>', { url:'https://lighthouse.local/' });
  Object.defineProperty(dom.window, 'visualViewport', {
    configurable:true,
    value:{ height:720, offsetTop:0, addEventListener(){}, removeEventListener(){} },
  });
  return dom;
}

test('app frame owns root navigation and one shared back history', () => {
  const dom = makeDom();
  const frame = createAppFrame({ window:dom.window, document:dom.window.document });
  assert.equal(frame.current().tab, 'CHAT');
  assert.equal(frame.current().depth, 0);
  frame.selectRoot('MANUAL');
  frame.push({ tab:'MANUAL', route:'module/income', title:'Income' });
  assert.equal(frame.current().route, 'module/income');
  frame.back('HEADER');
  assert.equal(frame.current().tab, 'MANUAL');
  assert.equal(frame.current().depth, 0);
  frame.push({ tab:'MANUAL', route:'module/outcome', title:'Outcome' });
  frame.back('ANDROID');
  assert.equal(frame.current().route, 'MANUAL');
});

test('app frame renders fixed header/content/bottom nav with safe-area ownership', () => {
  const dom = makeDom();
  createAppFrame({ window:dom.window, document:dom.window.document });
  const app = dom.window.document.querySelector('#app');
  assert.ok(app.classList.contains('lighthouse-canvas'));
  assert.ok(app.querySelector('[data-role="app-header"]'));
  assert.ok(app.querySelector('[data-role="content-viewport"]'));
  const tabs = [...app.querySelectorAll('[data-role="bottom-nav"] [data-tab]')].map(node => node.dataset.tab);
  assert.deepEqual(tabs, ['CHAT','MANUAL','SETTINGS']);
  assert.ok(app.classList.contains('safe-area-owner'));
});

test('visualViewport updates canvas height without making document the scroll owner', () => {
  const dom = makeDom();
  const frame = createAppFrame({ window:dom.window, document:dom.window.document });
  frame.syncViewport();
  assert.equal(dom.window.document.documentElement.style.getPropertyValue('--app-viewport-height'), '720px');
  assert.equal(dom.window.document.documentElement.style.overflow, 'hidden');
  assert.equal(dom.window.document.body.style.overflow, 'hidden');
});
