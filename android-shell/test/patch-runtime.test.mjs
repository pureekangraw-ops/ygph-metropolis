import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (relative) => readFile(new URL(relative, root), 'utf8');

async function loadRuntime() {
  try {
    return await import('../www/patch/patch-runtime.mjs');
  } catch (error) {
    assert.fail(`patch runtime module is required: ${error?.code ?? error?.message ?? error}`);
  }
}

function response(body, { json = false } = {}) {
  return {
    ok: true,
    async text() { return body; },
    async json() { return json ? JSON.parse(body) : JSON.parse(body); },
  };
}

test('runtime rejects a wrong selected file type before reading content', async () => {
  const { parseSelectedPatchFile } = await loadRuntime();
  let reads = 0;
  const file = {
    name: 'sample-update.bin',
    async text() {
      reads += 1;
      return '{"schema":"lighthouse.patch.v1"}';
    },
  };

  await assert.rejects(
    parseSelectedPatchFile(file),
    /must use \.lhpatch/i,
  );
  assert.equal(reads, 0, 'wrong file types must be rejected before content is read');
});

test('packaged base snapshot contains every patchable logical asset at version 0.0.1', async () => {
  const version = JSON.parse(await read('www/app/version.json'));
  assert.equal(version.version, '0.0.1');

  const ui = await read('www/app/ui.html');
  const css = await read('www/app/ui.css');
  const logic = await read('www/app/logic.mjs');
  const rules = JSON.parse(await read('www/app/rules.json'));
  const vocabulary = JSON.parse(await read('www/app/vocabulary.json'));

  assert.match(ui, /LIGHTHOUSE APK Foundation Proof/);
  assert.ok(css.length > 0);
  assert.match(logic, /export\s+async\s+function\s+mount/);
  assert.equal(typeof rules, 'object');
  assert.equal(typeof vocabulary, 'object');
});

test('loadBaseSnapshot reads only packaged local app assets', async () => {
  const { loadBaseSnapshot } = await loadRuntime();
  const requested = [];
  const bodies = new Map([
    ['./app/version.json', response('{"version":"0.0.1"}', { json: true })],
    ['./app/ui.html', response('<main>base ui</main>')],
    ['./app/ui.css', response('main{}')],
    ['./app/logic.mjs', response('export async function mount() {}')],
    ['./app/rules.json', response('{}')],
    ['./app/vocabulary.json', response('{"hello":"สวัสดี"}')],
  ]);

  const snapshot = await loadBaseSnapshot({
    fetchImpl: async (url) => {
      requested.push(url);
      const result = bodies.get(url);
      if (!result) return { ok: false, status: 404 };
      return result;
    },
  });

  assert.equal(snapshot.version, '0.0.1');
  assert.equal(snapshot.assets['ui.html'], '<main>base ui</main>');
  assert.equal(snapshot.assets['vocabulary.json'], '{"hello":"สวัสดี"}');
  assert.deepEqual(requested, [
    './app/version.json',
    './app/ui.html',
    './app/ui.css',
    './app/logic.mjs',
    './app/rules.json',
    './app/vocabulary.json',
  ]);
});

test('mountSnapshot mounts verified HTML CSS data and logic through injected module loader', async () => {
  const { mountSnapshot } = await loadRuntime();
  const rootElement = { innerHTML: '' };
  const styles = new Map();
  const head = {
    append(element) { styles.set(element.id, element); },
  };
  const documentRef = {
    head,
    getElementById(id) { return styles.get(id) ?? null; },
    createElement(tag) {
      assert.equal(tag, 'style');
      return { id: '', textContent: '' };
    },
  };
  const mounted = [];
  const revoked = [];
  const snapshot = {
    version: '0.0.2',
    assets: {
      'ui.html': '<main>patched ui</main>',
      'ui.css': 'main{font-weight:700}',
      'logic.mjs': 'export async function mount() {}',
      'rules.json': '{"mode":"patched"}',
      'vocabulary.json': '{"hello":"สวัสดี"}',
    },
  };

  const cleanup = await mountSnapshot(snapshot, {
    root: rootElement,
    documentRef,
    createModuleUrl: () => 'blob:test-module',
    importModule: async (url) => {
      assert.equal(url, 'blob:test-module');
      return {
        async mount(args) { mounted.push(args); },
      };
    },
    revokeModuleUrl: (url) => revoked.push(url),
  });

  assert.equal(rootElement.innerHTML, '<main>patched ui</main>');
  assert.equal(styles.get('lighthouse-patch-style').textContent, 'main{font-weight:700}');
  assert.equal(mounted.length, 1);
  assert.deepEqual(mounted[0], {
    root: rootElement,
    rules: { mode: 'patched' },
    vocabulary: { hello: 'สวัสดี' },
    version: '0.0.2',
  });

  await cleanup();
  assert.deepEqual(revoked, ['blob:test-module']);
});

test('stable index exposes unrestricted manual patch import and rollback without a remote update endpoint', async () => {
  const index = await read('www/index.html');
  assert.match(index, /id="app"/);
  assert.match(index, /id="patch-file"/);
  const picker = index.match(/<input\b[^>]*\bid=["']patch-file["'][^>]*>/i)?.[0];
  assert.ok(picker, 'patch file input must exist');
  assert.doesNotMatch(picker, /\baccept\s*=/i);
  assert.match(index, /id="patch-rollback"/);
  assert.match(index, /patch\/patch-runtime\.mjs/);

  const runtime = await read('www/patch/patch-runtime.mjs');
  assert.match(runtime, /endsWith\(['"]\.lhpatch['"]\)/);
  assert.match(runtime, /verifyPatchBundle\(/);
  assert.doesNotMatch(runtime, /https?:\/\//i);
  assert.doesNotMatch(runtime, /auto(?:matic)?[-_ ]?update|setInterval|WebSocket/i);
});
