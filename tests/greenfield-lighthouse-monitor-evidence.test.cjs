const test = require('node:test');
const assert = require('node:assert/strict');

async function load() {
  return import(`../lighthouse-next/monitor-evidence.mjs?t=${Date.now()}-${Math.random()}`);
}

test('Browser Observer health distinguishes live, stale, inactive, unverified, and unavailable states', async () => {
  const { createBrowserObserverHealth } = await load();
  const nowMs = Date.parse('2026-09-26T07:00:00.000Z');
  const base = {
    nowMs,
    lastSeenAt:'2026-09-26T06:59:30.000Z',
    sessionState:'LIVE',
    workerState:'LIVE',
    extensionVerified:true,
  };
  assert.equal(createBrowserObserverHealth(base).status, 'LIVE');
  assert.equal(createBrowserObserverHealth({ ...base, lastSeenAt:'2026-09-26T06:57:00.000Z' }).status, 'STALE');
  assert.equal(createBrowserObserverHealth({ ...base, sessionState:'INACTIVE' }).status, 'SESSION_INACTIVE');
  assert.equal(createBrowserObserverHealth({ ...base, extensionVerified:false }).status, 'EXTENSION_NOT_VERIFIED');
  assert.equal(createBrowserObserverHealth({ ...base, workerState:'HUB_UNAVAILABLE' }).status, 'HUB_UNAVAILABLE');
});

test('Ride Map evidence reports package truth and keeps exact coordinates private by default', async () => {
  const { createRideMapEvidence } = await load();
  const evidence = createRideMapEvidence({
    jobId:'RIDE-1',
    packageState:'ACTIVE',
    packageVersion:'bangkok-v1',
    packageSha256:'a'.repeat(64),
    packageByteLength:1234,
    region:'Bangkok',
    lastOpenedAt:'2026-09-26T06:59:00.000Z',
    pickup:{lat:13.8,lng:100.5,label:'รับ'},
    dropoff:{lat:13.7,lng:100.4,label:'ส่ง'},
  });
  assert.equal(evidence.status, 'ACTIVE');
  assert.equal(evidence.mapAvailable, true);
  assert.equal(evidence.package.sha256, 'a'.repeat(64));
  assert.equal(evidence.pickup.lat, undefined);
  assert.equal(evidence.dropoff.lng, undefined);

  const shared = createRideMapEvidence({
    packageState:'ACTIVE',
    pickup:{lat:13.8,lng:100.5},
    shareCoordinates:true,
  });
  assert.equal(shared.coordinatesShared, true);
  assert.equal(shared.pickup.lat, 13.8);
});

test('Map Evidence Bridge requires explicit consent for a preview and never invents one', async () => {
  const { createMapEvidenceBridge, PREVIEW_CONSENT_REQUIRED } = await load();
  const bridge = createMapEvidenceBridge({ now:() => '2026-09-26T07:00:00.000Z' });
  assert.throws(() => bridge.build({
    job:{recordId:'RIDE-2'},
    mapStatus:{packageState:'ACTIVE'},
    includePreview:true,
    preview:'data:image/png;base64,AA==',
  }), new RegExp(PREVIEW_CONSENT_REQUIRED));

  const silent = bridge.build({
    job:{recordId:'RIDE-2',pickup:{label:'รับ'}},
    mapStatus:{packageState:'ACTIVE'},
  });
  assert.equal(silent.preview, null);
  assert.equal(silent.previewShared, false);
  assert.equal(silent.capturedAt, '2026-09-26T07:00:00.000Z');

  const approved = bridge.build({
    job:{recordId:'RIDE-2'},
    mapStatus:{packageState:'ACTIVE'},
    includePreview:true,
    consent:true,
    preview:'preview-ref-1',
  });
  assert.equal(approved.previewShared, true);
  assert.equal(approved.preview, 'preview-ref-1');
});
