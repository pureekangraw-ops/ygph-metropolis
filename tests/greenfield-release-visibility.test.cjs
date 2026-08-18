"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const source = file => fs.readFileSync(path.join(root, file), 'utf8');

test('Cloudflare security headers are deployment-owned and enforce frame protection', () => {
  const headers = source('_headers');
  const manifest = JSON.parse(source('RELEASE_MANIFEST.json'));
  assert.match(headers, /Content-Security-Policy:/);
  assert.match(headers, /frame-ancestors 'none'/);
  assert.match(headers, /X-Content-Type-Options: nosniff/);
  assert.match(headers, /Referrer-Policy: no-referrer/);
  assert.match(headers, /Permissions-Policy:/);
  assert.ok((manifest.deploymentFiles || []).some(entry => entry.path === '_headers'));
  assert.equal(manifest.productionFiles.some(entry => entry.path === '_headers'), false);
});

test('visible release authority agrees across package manifest service worker and UI status owner', () => {
  const manifest = JSON.parse(source('RELEASE_MANIFEST.json'));
  const pkg = JSON.parse(source('package.json'));
  const lock = JSON.parse(source('package-lock.json'));
  const sw = source('sw.js');
  const status = source('ui/release-status.mjs');
  const app = source('app.mjs');
  const uiRelease = /APP_RELEASE='([^']+)'/.exec(status)?.[1];
  const swRelease = /const RELEASE='([^']+)'/.exec(sw)?.[1];
  assert.equal(manifest.release, pkg.version);
  assert.equal(lock.version, manifest.release);
  assert.equal(lock.packages[''].version, manifest.release);
  assert.equal(uiRelease, manifest.release);
  assert.equal(swRelease, manifest.release);
  assert.match(app, /import ['"]\.\/ui\/release-status\.mjs['"]/);
  assert.match(status, /import ['"]\.\/theme-shell\.mjs['"]/);
});

test('System reports service-worker lifecycle instead of leaving update state invisible', () => {
  const status = source('ui/release-status.mjs');
  assert.match(status, /systemVersion/);
  assert.match(status, /systemServiceWorker/);
  assert.match(status, /navigator\.serviceWorker\.register\('\.\/sw\.js'\)/);
  for (const label of ['กำลังตรวจสอบ','พร้อมใช้','กำลังอัปเดต','มีอัปเดตพร้อมใช้','อัปเดตแล้ว','มีปัญหา']) assert.match(status, new RegExp(label));
});
