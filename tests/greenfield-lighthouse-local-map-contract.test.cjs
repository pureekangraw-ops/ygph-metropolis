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

const MANAGED_ROOT_URI = 'file:///data/user/0/com.yggdrasil.lighthouse/files/maps/';
const FILE_URI = `${MANAGED_ROOT_URI}bangkok-metro.pmtiles`;
const OUTSIDE_FILE_URI = 'file:///sdcard/Download/bangkok-metro.pmtiles';
const CONTENT_URI = 'content://com.android.providers.downloads.documents/document/42';

test('local PMTiles contract accepts app-managed device storage only', async () => {
  const {
    LOCAL_MAP_CONTRACT,
    createLocalPmtilesSource,
    normalizeMapPackageMetadata,
  } = await import('../lighthouse-next/local-map.mjs');

  const metadata = normalizeMapPackageMetadata(METADATA);
  const source = createLocalPmtilesSource({ uri: FILE_URI, metadata });

  assert.equal(LOCAL_MAP_CONTRACT.format, 'PMTILES');
  assert.equal(LOCAL_MAP_CONTRACT.contentUriRole, 'IMPORT_ONLY');
  assert.equal(LOCAL_MAP_CONTRACT.activeUriProtocol, 'file:');
  assert.equal(LOCAL_MAP_CONTRACT.networkFallback, false);
  assert.equal(LOCAL_MAP_CONTRACT.backgroundLocation, false);
  assert.equal(source.type, 'LOCAL_PMTILES_VECTOR_BASEMAP');
  assert.equal(source.offlineOnly, true);
  assert.equal(source.networkAllowed, false);
  assert.equal(source.metadata.fileName, 'bangkok-metro.pmtiles');
});

test('content URIs are accepted only as import input, never as active package storage', async () => {
  const { createLocalPmtilesSource, createLocalMapPackageRecord } = await import('../lighthouse-next/local-map.mjs');
  const source = createLocalPmtilesSource({ uri: CONTENT_URI, metadata: METADATA });
  assert.equal(source.uri.startsWith('content://'), true);
  assert.equal(source.networkAllowed, false);
  assert.throws(
    () => createLocalMapPackageRecord({ uri: CONTENT_URI, metadata: METADATA, state: 'ACTIVE', managedRootUri: MANAGED_ROOT_URI }),
    /LOCAL_MAP_ACTIVE_URI_MUST_BE_STAGED_FILE/,
  );
  assert.equal(createLocalMapPackageRecord({ uri: CONTENT_URI, metadata: METADATA, state: 'STAGED' }).state, 'STAGED');
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

test('recovery uses the same package record shape with explicit reason', async () => {
  const { createLocalMapPackageRecord, describeLocalMapRecovery } = await import('../lighthouse-next/local-map.mjs');
  const recovery = createLocalMapPackageRecord({
    state: 'RECOVERY_REQUIRED',
    reason: 'ไฟล์แผนที่เสียหาย',
    now: () => '2026-09-21T06:00:00.000Z',
  });
  const helperRecovery = describeLocalMapRecovery('เลือกแพ็กเกจใหม่');

  for (const record of [recovery, helperRecovery]) {
    assert.equal(record.type, 'LOCAL_PMTILES_VECTOR_BASEMAP');
    assert.equal(record.state, 'RECOVERY_REQUIRED');
    assert.equal(record.uri, null);
    assert.equal(record.metadata, null);
    assert.equal(record.stagedAt, null);
    assert.equal(record.activatedAt, null);
    assert.equal(record.networkAllowed, false);
    assert.equal(record.offlineOnly, true);
    assert.equal(typeof record.recoveryAt, 'string');
    assert.equal(typeof record.recoveryReason, 'string');
  }
  assert.equal(recovery.recoveryReason, 'ไฟล์แผนที่เสียหาย');
});

test('active package requires Lighthouse-managed staged file storage', async () => {
  const { createLocalMapPackageRecord } = await import('../lighthouse-next/local-map.mjs');

  assert.throws(
    () => createLocalMapPackageRecord({ uri: FILE_URI, metadata: METADATA, state: 'ACTIVE' }),
    /LOCAL_MAP_MANAGED_ROOT_URI_REQUIRED/,
  );
  assert.throws(
    () => createLocalMapPackageRecord({
      uri: OUTSIDE_FILE_URI,
      metadata: METADATA,
      state: 'ACTIVE',
      managedRootUri: MANAGED_ROOT_URI,
    }),
    /LOCAL_MAP_ACTIVE_URI_OUTSIDE_MANAGED_ROOT/,
  );

  const active = createLocalMapPackageRecord({
    uri: FILE_URI,
    metadata: METADATA,
    state: 'ACTIVE',
    managedRootUri: MANAGED_ROOT_URI,
    now: () => '2026-09-21T06:00:00.000Z',
  });
  assert.equal(active.state, 'ACTIVE');
  assert.equal(active.uri, FILE_URI);
  assert.equal(active.activatedAt, '2026-09-21T06:00:00.000Z');
  assert.equal(active.recoveryReason, null);
});
