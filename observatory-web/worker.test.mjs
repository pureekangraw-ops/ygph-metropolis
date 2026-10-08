import test from 'node:test';
import assert from 'node:assert/strict';
import { Script } from 'node:vm';
import worker from './worker.mjs';

test('health reports local-only support', async () => {
 const r = await worker.fetch(new Request('https://observatory.example/health'));
 assert.equal(r.status, 200);
 assert.equal((await r.json()).storage, 'BROWSER_LOCAL_ONLY');
});

test('HTML loads with valid inline JavaScript', async () => {
 const r = await worker.fetch(new Request('https://observatory.example/'));
 assert.equal(r.status, 200);
 const html = await r.text();
 assert.match(html, /OpenStreetMap/);
 assert.match(html, /localStorage/);
 assert.match(html, /GeoJSON/);
 const script = html.split('<script>')[1]?.split('</script>')[0];
 assert.ok(script);
 assert.doesNotThrow(() => new Script(script));
});

test('no unintended write endpoints', async () => {
 const r = await worker.fetch(new Request('https://observatory.example/',{method:'POST'}));
 assert.equal(r.status,404);
});
