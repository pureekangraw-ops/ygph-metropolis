import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
const read = relative => readFile(new URL(relative, root), 'utf8');
async function loadRuntime() { try { return await import('../www/patch/patch-runtime.mjs'); } catch (error) { assert.fail(`patch runtime module is required: ${error?.code ?? error?.message ?? error}`); } }
function response(body) { return { ok:true, async text(){ return body; }, async json(){ return JSON.parse(body); } }; }

test('runtime rejects a wrong selected file type before reading content', async () => {
  const { parseSelectedPatchFile } = await loadRuntime(); let reads = 0;
  const file = { name:'sample-update.bin', async text(){ reads += 1; return '{"schema":"lighthouse.patch.v1"}'; } };
  await assert.rejects(parseSelectedPatchFile(file), /must use \.lhpatch/i); assert.equal(reads, 0);
});

test('packaged base snapshot contains every patchable logical asset at current full-app version', async () => {
  const version = JSON.parse(await read('www/app/version.json')); assert.equal(version.version, '0.0.7');
  const ui = await read('www/app/ui.html'); assert.match(ui, /data-chat-log/); assert.match(ui, /data-manual-panel/); assert.match(ui, /data-settings-panel/); assert.ok((await read('www/app/ui.css')).length > 0);
  assert.match(await read('www/app/logic.mjs'), /export\s+async\s+function\s+mount/);
  assert.equal(typeof JSON.parse(await read('www/app/rules.json')), 'object'); assert.equal(typeof JSON.parse(await read('www/app/vocabulary.json')), 'object');
});

test('loadBaseSnapshot reads only packaged local app assets', async () => {
  const { loadBaseSnapshot } = await loadRuntime(); const requested = [];
  const bodies = new Map([['./app/version.json', response('{"version":"0.0.1"}')], ['./app/ui.html', response('<main>base ui</main>')], ['./app/ui.css', response('main{}')], ['./app/logic.mjs', response('export async function mount() {}')], ['./app/rules.json', response('{}')], ['./app/vocabulary.json', response('{"hello":"สวัสดี"}')]]);
  const snapshot = await loadBaseSnapshot({ fetchImpl:async url => { requested.push(url); return bodies.get(url) ?? { ok:false, status:404 }; } });
  assert.equal(snapshot.version, '0.0.1'); assert.equal(snapshot.assets['ui.html'], '<main>base ui</main>');
  assert.deepEqual(requested, ['./app/version.json','./app/ui.html','./app/ui.css','./app/logic.mjs','./app/rules.json','./app/vocabulary.json']);
});

test('mountSnapshot injects trusted brain/updater without making them patchable assets', async () => {
  const { mountSnapshot } = await loadRuntime(); const rootElement = { innerHTML:'' }; const styles = new Map();
  const documentRef = { head:{ append(element){ styles.set(element.id, element); } }, getElementById:id => styles.get(id) ?? null, createElement(tag){ assert.equal(tag,'style'); return { id:'', textContent:'' }; } };
  const mounted = []; const revoked = []; const brain = Object.freeze({ send:async () => ({ status:'BLOCKED' }) }); const patchUpdater = Object.freeze({ updateLatest:async () => ({ status:'LATEST' }) });
  const snapshot = { version:'0.0.5', assets:{ 'ui.html':'<main>patched ui</main>', 'ui.css':'main{font-weight:700}', 'logic.mjs':'export async function mount() {}', 'rules.json':'{"mode":"patched"}', 'vocabulary.json':'{"hello":"สวัสดี"}' } };
  const cleanup = await mountSnapshot(snapshot, { root:rootElement, documentRef, trustedBrain:brain, patchUpdater, createModuleUrl:() => 'blob:test-module', importModule:async url => { assert.equal(url,'blob:test-module'); return { async mount(args){ mounted.push(args); } }; }, revokeModuleUrl:url => revoked.push(url) });
  assert.equal(mounted[0].brain, brain); assert.equal(mounted[0].patchUpdater, patchUpdater); assert.equal(mounted[0].version,'0.0.5');
  await cleanup(); assert.deepEqual(revoked,['blob:test-module']);
});

test('stable foundation owns endpoint verifier one-tap reload path manual fallback and rollback with no background updater', async () => {
  const index = await read('www/index.html');
  assert.match(index,/id="patch-latest"/); assert.match(index,/>Patch</); assert.match(index,/id="patch-file"/); assert.match(index,/id="patch-rollback"/); assert.match(index,/trusted\/bootstrap\.mjs/);
  assert.doesNotMatch(index,/src=["'][^"']*patch\/patch-runtime\.mjs["']/i);
  const bootstrap = await read('www/trusted/bootstrap.mjs'); assert.match(bootstrap,/import\(['"]\.\.\/patch\/patch-runtime\.mjs['"]\)/);
  const runtime = await read('www/patch/patch-runtime.mjs');
  assert.match(runtime,/TRUSTED_PATCH_MANIFEST_URL/); assert.match(runtime,/github\.com\/pureekangraw-ops\/ygph-metropolis\/releases\/latest\/download\/lighthouse-patch-manifest\.json/);
  assert.match(runtime,/verifyPatchBundle\(/); assert.match(runtime,/sha256/i); assert.match(runtime,/openManualPicker/); assert.match(runtime,/await render\(result\.current\)/);
  assert.doesNotMatch(runtime,/setInterval|WebSocket|EventSource/i);
  const patchableLogic = await read('release/front-door-0.0.5/logic.mjs');
  assert.doesNotMatch(patchableLogic,/TRUSTED_PATCH_MANIFEST_URL|releases\/latest\/download|trusted-key\.json|verifyPatchBundle|patchUpdater\.updateLatest/);
  assert.match(patchableLogic,/getElementById\('patch-latest'\)/);
  assert.match(patchableLogic,/getElementById\('patch-file'\)/);
});
