import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { mountSnapshot } from '../www/patch/patch-runtime.mjs';

const root = new URL('../', import.meta.url);
const read = (relative) => readFile(new URL(relative, root), 'utf8');

async function loadPatchInput() {
  return JSON.parse(await read('test/fixtures/front-door-0.0.3-input.json'));
}

async function buildPatchSnapshot(input) {
  return {
    version: input.version,
    assets: {
      'ui.html': input.files['ui.html'],
      'ui.css': input.files['ui.css'],
      'logic.mjs': input.files['logic.mjs'],
      'rules.json': await read('www/app/rules.json'),
      'vocabulary.json': await read('www/app/vocabulary.json'),
    },
  };
}

function createFrontDoorDom({ foundationControls = true } = {}) {
  const foundation = foundationControls
    ? '<aside class="patch-controls"><input id="patch-file" type="file"><button id="patch-rollback" type="button">Rollback</button><p id="patch-status"></p></aside>'
    : '';
  const dom = new JSDOM(`<!doctype html><html><head></head><body><div id="app"></div>${foundation}</body></html>`, {
    url: 'https://lighthouse.test/',
  });
  return {
    dom,
    app: dom.window.document.getElementById('app'),
  };
}

async function mountFrontDoor(input, { foundationControls = true } = {}) {
  const { dom, app } = createFrontDoorDom({ foundationControls });
  const snapshot = await buildPatchSnapshot(input);
  const cleanup = await mountSnapshot(snapshot, {
    root: app,
    documentRef: dom.window.document,
    createModuleUrl: (source) => `data:text/javascript;base64,${Buffer.from(source, 'utf8').toString('base64')}`,
    importModule: (url) => import(url),
    revokeModuleUrl: () => {},
  });
  return { dom, app, cleanup };
}

test('0.0.3 front door ships as patch input while packaged 0.0.1 stays unchanged', async () => {
  const packagedHtml = await read('www/app/ui.html');
  assert.match(packagedHtml, /LIGHTHOUSE APK Foundation Proof/);

  const input = await loadPatchInput();
  assert.equal(input.baseVersion, '0.0.1');
  assert.equal(input.version, '0.0.3');
  assert.deepEqual(Object.keys(input.files).sort(), ['logic.mjs', 'ui.css', 'ui.html']);
});

test('patch runtime mounts 0.0.3 and the real chat submit renders user + truthful disconnected reply', async () => {
  const input = await loadPatchInput();
  const { dom, app, cleanup } = await mountFrontDoor(input);

  try {
    assert.equal(app.querySelector('[data-lighthouse-version]').textContent, '0.0.3');
    assert.equal(app.querySelector('[data-empty-state]').hidden, false);

    const composer = app.querySelector('[data-chat-form]');
    const chatInput = app.querySelector('[data-chat-input]');
    chatInput.value = 'ข้าว 65';
    const submitted = composer.dispatchEvent(new dom.window.Event('submit', {
      bubbles: true,
      cancelable: true,
    }));

    assert.equal(submitted, false, 'submit handler must prevent browser form navigation');
    assert.equal(chatInput.value, '');
    assert.equal(app.querySelector('[data-empty-state]').hidden, true);

    const messages = [...app.querySelectorAll('.message')];
    assert.equal(messages.length, 2);
    assert.equal(messages[0].classList.contains('message-user'), true);
    assert.equal(messages[0].textContent, 'ข้าว 65');
    assert.equal(messages[1].classList.contains('message-lighthouse'), true);
    assert.match(messages[1].textContent, /ระบบตีความยังไม่เชื่อม/);
    assert.match(messages[1].textContent, /ยังไม่มีการบันทึกหรือดำเนินการ/);
  } finally {
    await cleanup();
    dom.window.close();
  }
});

test('mounted Settings opens and Patch/Rollback actions proxy the foundation runtime controls', async () => {
  const input = await loadPatchInput();
  const { dom, app, cleanup } = await mountFrontDoor(input);

  try {
    const settings = app.querySelector('[data-settings-panel]');
    assert.equal(settings.hidden, true);
    app.querySelector('[data-settings-open]').click();
    assert.equal(settings.hidden, false);

    let filePickerClicks = 0;
    let rollbackClicks = 0;
    dom.window.document.getElementById('patch-file').addEventListener('click', () => { filePickerClicks += 1; });
    dom.window.document.getElementById('patch-rollback').addEventListener('click', () => { rollbackClicks += 1; });

    app.querySelector('[data-patch-import]').click();
    app.querySelector('[data-patch-rollback]').click();
    assert.equal(filePickerClicks, 1);
    assert.equal(rollbackClicks, 1);

    app.querySelector('[data-settings-close]').click();
    assert.equal(settings.hidden, true);
  } finally {
    await cleanup();
    dom.window.close();
  }
});

test('mounted 0.0.3 shows a real system alert when foundation Patch controls are unavailable', async () => {
  const input = await loadPatchInput();
  const { dom, app, cleanup } = await mountFrontDoor(input, { foundationControls: false });

  try {
    const alert = app.querySelector('[data-system-alert]');
    assert.equal(alert.hidden, true);

    app.querySelector('[data-patch-import]').click();
    assert.equal(alert.hidden, false);
    assert.match(app.querySelector('[data-system-alert-copy]').textContent, /ไม่พบช่องนำเข้า Patch/);

    app.querySelector('[data-system-alert-close]').click();
    assert.equal(alert.hidden, true);
  } finally {
    await cleanup();
    dom.window.close();
  }
});

test('0.0.3 patch remains manual, web-only, and does not wire the future Intent execution path', async () => {
  const input = await loadPatchInput();
  const html = input.files['ui.html'];
  const css = input.files['ui.css'];
  const logic = input.files['logic.mjs'];

  assert.match(html, /เลือกไฟล์ Patch/);
  assert.match(html, /Rollback/);
  assert.doesNotMatch(html, /ตรวจหา Patch ใหม่/);
  assert.match(css, /\.patch-controls\s*\{[^}]*display\s*:\s*none/is);
  assert.doesNotMatch(logic, /\/api\/v1\/interpret|prepareMasterExecution|executePreparedMasterIntent|fetch\s*\(/);
  assert.doesNotMatch(logic, /geolocation|navigator\.permissions|google\.maps|capacitor/i);
  assert.doesNotMatch(html, /ความมั่นใจ|confidence|บันทึกสำเร็จ|บันทึกและอ่านกลับแล้ว/i);
});
