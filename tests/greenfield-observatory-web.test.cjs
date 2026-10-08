const test = require('node:test');
const assert = require('node:assert/strict');
const { Script } = require('node:vm');

test('Observatory Web Map serves healthy local-only capabilities', async () => {
  const { default: worker } = await import('../observatory-web/worker.mjs');
  const res = await worker.fetch(new Request('https://observatory.example/health'));
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), {
    service: 'YGG_OBSERVATORY_WEB_MAP',
    status: 'READY',
    storage: 'BROWSER_LOCAL_ONLY',
    remotePin: false
  });
});

test('Observatory Web Map serves safe HTML with parseable client code', async () => {
  const { default: worker } = await import('../observatory-web/worker.mjs');
  const res = await worker.fetch(new Request('https://observatory.example/'));
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/html/);
  assert.match(res.headers.get('content-security-policy'), /object-src 'none'/);
  // OSM's tile service rejects browsers that suppress the cross-origin Referer.
  assert.equal(res.headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
  // Leaflet requests the apex tile.openstreetmap.org host; a wildcard alone does not match it.
  const policy = res.headers.get('content-security-policy');
  assert.match(policy, /img-src[^;]*https:\/\/tile\.openstreetmap\.org(?:[; ]|$)/);
  const html = await res.text();
  assert.match(html, /OpenStreetMap/);
  assert.match(html, /localStorage/);
  assert.match(html, /GeoJSON/);
  assert.match(html, /เฉพาะในเบราว์เซอร์นี้/);
  const inline = html.split('<script>')[1]?.split('</script>')[0];
  assert.ok(inline);
  assert.doesNotThrow(() => new Script(inline));
});

test('Observatory Web Map does not expose a public write API', async () => {
  const { default: worker } = await import('../observatory-web/worker.mjs');
  const res = await worker.fetch(new Request('https://observatory.example/', { method: 'POST' }));
  assert.equal(res.status, 404);
});
