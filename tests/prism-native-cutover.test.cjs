const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
test('PRISM native base has no LIGHTHOUSE parent',()=>{const s=fs.readFileSync('scripts/stage-prism-native.mjs','utf8');assert.match(s,/PRISM_NATIVE_V1/);assert.doesNotMatch(s,/lighthouse-next/);assert.doesNotMatch(s,/PRISM_INITIAL_PIN|bootstrapPin/);});
test('PRISM owner entry is PIN protected',()=>{const h=fs.readFileSync('prism/index.html','utf8'),a=fs.readFileSync('prism/app.mjs','utf8');assert.match(h,/id="pin-gate"/);assert.match(a,/PrismPin/);assert.match(a,/PIN_NATIVE_BRIDGE_UNAVAILABLE/);assert.doesNotMatch(h,/1609/);assert.doesNotMatch(a,/1609/);});
test('Android identity is PRISM',()=>{const c=JSON.parse(fs.readFileSync('android-shell/capacitor.config.json'));assert.equal(c.appId,'com.yggdrasil.prism');assert.equal(c.appName,'PRISM');});
test('root surfaces stay bounded',()=>{const h=fs.readFileSync('prism/index.html','utf8');const nav=h.match(/<nav class="bottom-nav"[\s\S]*?<\/nav>/)?.[0]||'';for(const x of ['Copilot','โปรเจกต์','Map','Ledger'])assert.match(nav,new RegExp(x));assert.doesNotMatch(nav,/Ride|Monitor|Handoff/);});


test('PRISM PIN tooling registers native plugin even when MainActivity already has onCreate', async () => {
  const tool = fs.readFileSync('android-shell/tools/apply-prism-pin.mjs','utf8');
  assert.match(tool, /void\\s\+onCreate/);
  assert.match(tool, /registerPlugin\(PrismPinPlugin\.class\)/);
  assert.match(tool, /PRISM_PIN_SUPER_ONCREATE_MISSING/);
});

test('PRISM PIN gate is balanced for tall and short mobile viewports', async () => {
  const css = fs.readFileSync('prism/styles.css','utf8');
  assert.match(css, /\.pin-card\{[^}]*display:grid[^}]*justify-items:center[^}]*align-content:center/s);
  assert.match(css, /@media\(max-height:760px\)/);
});
