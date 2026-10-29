const test = require('node:test');
const assert = require('node:assert/strict');
async function parseGeoJSONImport(text) {
  const module = await import('../observatory-web/geojson-import.mjs');
  return module.parseGeoJSONImport(text);
}

function collection(features) {
  return JSON.stringify({ type: 'FeatureCollection', features });
}

test('GeoJSON importer accepts 2D Point features and preserves safe properties and IDs', async () => {
  const result = await parseGeoJSONImport(collection([{
    type: 'Feature', id: 'pin-17', properties: { name: 'Market', category: 'food', open: true },
    geometry: { type: 'Point', coordinates: [100.5, 13.7] }
  }]));
  assert.equal(result.featureCount, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(result.pins[0])), {
    id: 'geojson:pin-17', name: 'Market', lat: 13.7, lng: 100.5,
    properties: { name: 'Market', category: 'food', open: true }
  });
});

test('GeoJSON importer creates a stable ID when a feature has no ID', async () => {
  const raw = collection([{ type: 'Feature', properties: { title: 'Park' }, geometry: { type: 'Point', coordinates: [100, 13] } }]);
  const first = await parseGeoJSONImport(raw);
  const second = await parseGeoJSONImport(raw);
  assert.match(first.pins[0].id, /^geojson:sha256:[a-f0-9]{64}$/);
  assert.equal(first.pins[0].id, second.pins[0].id);
});

test('GeoJSON importer rejects non-Point and invalid coordinates without partial results', async () => {
  await assert.rejects(parseGeoJSONImport(collection([
    { type: 'Feature', id: 1, properties: { name: 'ok' }, geometry: { type: 'Point', coordinates: [1, 2] } },
    { type: 'Feature', id: 2, properties: {}, geometry: { type: 'LineString', coordinates: [[1, 2], [3, 4]] } }
  ])), /feature 2 must be a Point/);
  await assert.rejects(parseGeoJSONImport(collection([
    { type: 'Feature', id: 1, properties: {}, geometry: { type: 'Point', coordinates: [181, 2] } }
  ])), /valid 2D WGS84/);
  await assert.rejects(parseGeoJSONImport(collection([
    { type: 'Feature', id: 1, properties: {}, geometry: { type: 'Point', coordinates: [1, 2, 0] } }
  ])), /valid 2D WGS84/);
});

test('GeoJSON importer rejects duplicate IDs, unsafe properties, and oversize files', async () => {
  const duplicate = { type: 'Feature', id: 'same', properties: {}, geometry: { type: 'Point', coordinates: [1, 2] } };
  await assert.rejects(parseGeoJSONImport(collection([duplicate, duplicate])), /duplicate feature id/);
  await assert.rejects(parseGeoJSONImport(collection([{
    type: 'Feature', id: 'unsafe', properties: JSON.parse('{"__proto__":{"x":1}}'), geometry: { type: 'Point', coordinates: [1, 2] }
  }])), /unsafe property key/);
  await assert.rejects(parseGeoJSONImport(' '.repeat(1_048_577)), /file exceeds 1 MiB/);
  await assert.rejects(parseGeoJSONImport(JSON.stringify({ type: 'FeatureCollection', features: Array(501).fill(duplicate) })), /exceeds 500 features/);
});

test('GeoJSON merge skips exact duplicates, blocks conflicts, and refuses partial overflow', async () => {
  const { planGeoJSONMerge } = await import('../observatory-web/geojson-import.mjs');
  const pin = { id: 'geojson:p1', name: 'Market', lat: 13.7, lng: 100.5, properties: { name: 'Market', kind: 'food' } };
  const sameDifferentKeyOrder = { id: 'geojson:p1', name: 'Market', lat: 13.7, lng: 100.5, properties: { kind: 'food', name: 'Market' } };
  const duplicatePlan = planGeoJSONMerge([pin], [sameDifferentKeyOrder]);
  assert.equal(duplicatePlan.duplicates, 1);
  assert.equal(duplicatePlan.canApply, false);
  const conflict = planGeoJSONMerge([pin], [{ ...pin, name: 'Changed' }]);
  assert.equal(conflict.conflicts, 1);
  assert.deepEqual(conflict.pinsToAdd, []);
  const overflow = planGeoJSONMerge([pin], [{ ...pin, id: 'geojson:p2' }, { ...pin, id: 'geojson:p3' }], 2);
  assert.equal(overflow.overflow, 1);
  assert.deepEqual(overflow.pinsToAdd, []);
});
