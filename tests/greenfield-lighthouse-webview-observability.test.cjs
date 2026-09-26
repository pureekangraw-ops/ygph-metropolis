const assert = require('node:assert/strict');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

(async () => {
  const modulePath = require('node:fs').existsSync(require('node:path').join(__dirname, '..', 'lighthouse-next', 'webview-observability.mjs'))
    ? pathToFileURL(require('node:path').join(__dirname, '..', 'lighthouse-next', 'webview-observability.mjs')).href
    : pathToFileURL('/data/webview-observability.mjs').href;
  const { createLighthouseWebViewEvidence } = await import(modulePath);

  test('WebView evidence is read-only, sanitized, and bounded', () => {
    const evidence = createLighthouseWebViewEvidence({
      activeRoot:'manual',
      keyboardOpen:true,
      viewport:{ innerWidth:390, innerHeight:740, visualViewport:{ width:390, height:420 } },
      appShell:{ hidden:false, scrollTop:88, scrollHeight:1800, clientHeight:640 },
      bottomNav:{ hidden:false },
      focusedControl:{ tagName:'INPUT', type:'password', id:'device-password', value:'secret-value' },
      mapEvidence:{
        evidence:{
          status:'ACTIVE',
          mapAvailable:true,
          jobId:'J-001',
          package:{state:'ACTIVE', version:'bangkok-v1', sha256:'abc', byteLength:12, region:'Bangkok'},
          lastOpenedAt:'2026-09-26T09:00:00Z',
          pickup:{label:'รับของ', address:'private address', lat:13.7, lng:100.5},
          dropoff:{label:'ส่งของ', lat:13.8, lng:100.6},
        },
      },
      nativeBridgeState:'AVAILABLE',
      focusedControl:null,
    });
    assert.equal(evidence.schemaVersion, 'lighthouse-webview-evidence-v1');
    assert.deepEqual(evidence.viewport, { width:390, height:740, visualWidth:390, visualHeight:420 });
    assert.deepEqual(evidence.scroll, { owner:'app-shell', top:88, height:1800, clientHeight:640, bodyScrollDisabled:true });
    assert.equal(evidence.keyboardOpen, true);
    assert.equal(evidence.map.package.sha256, 'abc');
    assert.equal(evidence.map.coordinatesShared, false);
    assert.equal('lat' in evidence.map.pickup, false);
    assert.equal('lng' in evidence.map.dropoff, false);
    assert.equal('value' in evidence, false);
    assert.equal(evidence.nativeBridge.state, 'AVAILABLE');
    assert.equal(Object.isFrozen(evidence), true);
  });
})();
