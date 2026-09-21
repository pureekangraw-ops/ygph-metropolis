'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

const METADATA = {
  id: 'bangkok-metro-v1',
  format: 'pmtiles',
  region: 'Bangkok + surrounding metropolitan area',
  version: '2026-09-21',
  fileName: 'bangkok-metro.pmtiles',
  byteLength: 1234,
  sha256: 'a'.repeat(64),
  attribution: '© OpenStreetMap contributors © Protomaps',
};

test('local PMTiles contract accepts app-managed device storage only', async () => {
  const {
    LOCAL_MAP_CONTRACT,
    createLocalPmtilesSource,
    normalizeMapPackageMetadata,
  } = await import('../lighthouse-next/local-map.mjs');

  const metadata = normalizeMapPackageMetadata(METADATA);
  const source = createLocalPmtilesSource({ uri: 'file:///data/user/0/com.yggdrasil.lighthouse/files/maps/bangkok-metro.pmtiles', metadata });

  assert.equal(LOCAL_MAP_CONTRACT.format, 'PMTILES');
  assert.equal(LOCAL_MAP_CONTRACT.networkFallback, false);
  assert.equal(LOCAL_MAP_CONTRACT.backgroundLocation, false);
  assert.equal(source.type, 'LOCAL_PMTILES_VECTOR_BASEMAP');
  assert.equal(source.offlineOnly, true);
  assert.equal(source.networkAllowed, false);
  assert.equal(source.metadata.fileName, 'bangkok-metro.pmtiles');
});

test('content URIs are accepted for Android document-provider imports', async () => {
  const { createLocalPmtilesSource } = await import('../lighthouse-next/local-map.mjs');
  const source = createLocalPmtilesSource({ uri: 'content://com.android.providers.downloads.documents/document/42', metadata: METADATA });
  assert.equal(source.uri.startsWith('content://'), true);
  assert.equal(source.networkAllowed, false);
});

test('network URLs fail closed instead of becoming a map source', async () => {
  const { createLocalPmtilesSource } = await import('../lighthouse-next/local-map.mjs');
  assert.throws(
    () => createLocalPmtilesSource({ uri: 'https://tiles.example.test/bangkok.pmtiles', metadata: METADATA }),
    /LOCAL_MAP_URI_NOT_DEVICE_STORAGE:https:/,
  );
  assert.throws(
    () => createLocalPmtilesSource({ uri: 'http://tiles.example.test/bangkok.pmtiles', metadata: METADATA }),
    /LOCAL_MAP_URI_NOT_DEVICE_STORAGE:http:/,
  );
});

test('map package metadata fails closed for unsafe or incomplete packages', async () => {
  const { normalizeMapPackageMetadata } = await import('../lighthouse-next/local-map.mjs');
  assert.throws(() => normalizeMapPackageMetadata({ ...METADATA, fileName: '../bangkok.pmtiles' }), /LOCAL_MAP_FILE_NAME_MUST_BE_BASENAME/);
  assert.throws(() => normalizeMapPackageMetadata({ ...METADATA, fileName: 'bangkok.mbtiles' }), /LOCAL_MAP_FILE_EXTENSION_INVALID/);
  assert.throws(() => normalizeMapPackageMetadata({ ...METADATA, sha256: 'not-a-sha' }), /LOCAL_MAP_SHA256_INVALID/);
  assert.throws(() => normalizeMapPackageMetadata({ ...METADATA, byteLength: 0 }), /LOCAL_MAP_BYTE_LENGTH_INVALID/);
  assert.throws(() => normalizeMapPackageMetadata({ ...METADATA, format: 'mbtiles' }), /LOCAL_MAP_FORMAT_UNSUPPORTED:MBTILES/);
});

test('active and recovery states remain explicit', async () => {
  const { createLocalMapPackageRecord, describeLocalMapRecovery } = await import('../lighthouse-next/local-map.mjs');
  const active = createLocalMapPackageRecord({
    uri: 'file:///data/user/0/com.yggdrasil.lighthouse/files/maps/bangkok-metro.pmtiles',
    metadata: METADATA,
    state: 'ACTIVE',
    now: () => '2026-09-21T06:00:00.000Z',
  });
  assert.equal(active.state, 'ACTIVE');
  assert.equal(active.activatedAt, '2026-09-21T06:00:00.000Z');

  const recovery = describeLocalMapRecovery('ไฟล์แผนที่เสียหาย');
  assert.equal(recovery.state, 'RECOVERY_REQUIRED');
  assert.equal(recovery.networkAllowed, false);
  assert.equal(recovery.reason, 'ไฟล์แผนที่เสียหาย');
});
