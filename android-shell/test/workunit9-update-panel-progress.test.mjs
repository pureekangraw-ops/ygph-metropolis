import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createSettingsUpdatePanel } from '../app/public/ui/settings-update-panel.mjs';

function fixture() {
  const dom = new JSDOM('<!doctype html><body></body>');
  const panel = createSettingsUpdatePanel({ document:dom.window.document });
  dom.window.document.body.append(panel.element);
  return { dom, panel };
}

test('known total renders determinate progress with truthful transfer detail and aria value text', () => {
  const { panel } = fixture();
  panel.render({
    state:'DOWNLOADING',
    bytesDownloaded:41_200_000,
    totalBytes:50_000_000,
    percent:82.4,
    speedBps:3_400_000,
  });

  const progress = panel.element.querySelector('[data-role="update-progress"]');
  const detail = panel.element.querySelector('[data-role="update-detail"]');
  assert.ok(progress, 'update panel must render one progress element');
  assert.equal(progress.getAttribute('max'), '100');
  assert.equal(progress.getAttribute('value'), '82.4');
  assert.match(detail.textContent, /41\.2 MB \/ 50 MB/);
  assert.match(detail.textContent, /3\.4 MB\/s/);
  assert.match(detail.textContent, /82\.4%/);
  assert.match(progress.getAttribute('aria-valuetext') || '', /41\.2 MB \/ 50 MB/);
  assert.match(progress.getAttribute('aria-valuetext') || '', /82\.4%/);
});

test('unknown total is indeterminate and never invents a percentage', () => {
  const { panel } = fixture();
  panel.render({
    state:'DOWNLOADING',
    bytesDownloaded:41_200_000,
    totalBytes:null,
    percent:null,
    speedBps:3_400_000,
  });

  const progress = panel.element.querySelector('[data-role="update-progress"]');
  const detail = panel.element.querySelector('[data-role="update-detail"]');
  assert.ok(progress);
  assert.equal(progress.hasAttribute('value'), false, 'indeterminate progress must not have a value attribute');
  assert.match(detail.textContent, /ดาวน์โหลดแล้ว 41\.2 MB/);
  assert.match(detail.textContent, /3\.4 MB\/s/);
  assert.doesNotMatch(detail.textContent, /%/);
  assert.doesNotMatch(progress.getAttribute('aria-valuetext') || '', /%/);
});

test('non-transfer states clear stale progress value and transfer detail', () => {
  const { panel } = fixture();
  panel.render({ state:'DOWNLOADING', bytesDownloaded:5_000_000, totalBytes:10_000_000, percent:50, speedBps:1_000_000 });
  panel.render({ state:'READY_TO_INSTALL', bytesDownloaded:10_000_000, totalBytes:10_000_000, percent:100, speedBps:null });

  const progress = panel.element.querySelector('[data-role="update-progress"]');
  const detail = panel.element.querySelector('[data-role="update-detail"]');
  assert.equal(progress.hidden, true);
  assert.equal(progress.hasAttribute('value'), false);
  assert.equal(progress.hasAttribute('aria-valuetext'), false);
  assert.equal(detail.textContent, '');
});
