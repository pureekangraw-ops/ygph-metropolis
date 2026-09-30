const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
test('PRISM native base has no LIGHTHOUSE parent',()=>{const s=fs.readFileSync('scripts/stage-prism-native.mjs','utf8');assert.match(s,/PRISM_NATIVE_V1/);assert.doesNotMatch(s,/lighthouse-next/);assert.doesNotMatch(s,/PRISM_INITIAL_PIN|bootstrapPin/);});
test('PRISM owner entry is password protected',()=>{const h=fs.readFileSync('prism/index.html','utf8'),a=fs.readFileSync('prism/app.mjs','utf8');assert.match(h,/id="pin-gate"/);assert.match(a,/PrismPin/);assert.match(a,/PIN_NATIVE_BRIDGE_UNAVAILABLE/);assert.doesNotMatch(h,/1609/);assert.doesNotMatch(a,/1609/);});
test('Android identity is PRISM',()=>{const c=JSON.parse(fs.readFileSync('android-shell/capacitor.config.json'));assert.equal(c.appId,'com.yggdrasil.prism');assert.equal(c.appName,'PRISM');});
test('root surfaces stay bounded',()=>{const h=fs.readFileSync('prism/index.html','utf8');const nav=h.match(/<nav class="bottom-nav"[\s\S]*?<\/nav>/)?.[0]||'';for(const x of ['Copilot','โปรเจกต์','Map','Ledger'])assert.match(nav,new RegExp(x));assert.doesNotMatch(nav,/Ride|Monitor|Handoff/);});


test('PRISM owner-password tooling registers native plugin even when MainActivity already has onCreate', async () => {
  const tool = fs.readFileSync('android-shell/tools/apply-prism-pin.mjs','utf8');
  assert.match(tool, /void onCreate[(]Bundle/);
  assert.match(tool, /registerPlugin\(PrismPinPlugin\.class\)/);
  assert.match(tool, /PRISM_PIN_SUPER_ONCREATE_MISSING/);
});

test('PRISM owner-password gate is balanced for tall and short mobile viewports', async () => {
  const css = fs.readFileSync('prism/styles.css','utf8');
  assert.match(css, /\.pin-card\{[^}]*display:grid[^}]*justify-items:center[^}]*align-content:center/s);
  assert.match(css, /@media\(max-height:760px\)/);
});

test('PRISM browser is a capability of the PRISM shell',()=>{
  const h=fs.readFileSync('prism/index.html','utf8');
  const a=fs.readFileSync('prism/app.mjs','utf8');
  const tool=fs.readFileSync('android-shell/tools/apply-prism-browser.mjs','utf8');
  assert.match(h,/id="open-browser"/);
  assert.match(a,/PrismBrowser/);
  assert.match(tool,/geckoview-omni/);
  assert.match(tool,/PrismBrowserActivity/);
  assert.match(tool,/factoryEye:'0.4.0'/);
});
test('Factory Eye bundle is pinned to canonical Ergasterion v0.4.0 snapshot',()=>{
  const m=JSON.parse(fs.readFileSync('android-shell/native-prism-browser/factory-eye/manifest.json','utf8'));
  const b=fs.readFileSync('android-shell/native-prism-browser/factory-eye/background.js','utf8');
  assert.equal(m.version,'0.4.0');
  assert.match(b,/8440e37741b72802df4138b7eca14791a1c65d10/);
  assert.match(b,/github-pureekangraw-ops/);
  assert.match(b,/cloudflare-dashboard/);
});
test('owner password is not hardcoded and requires at least eight characters',()=>{
  const h=fs.readFileSync('prism/index.html','utf8'),a=fs.readFileSync('prism/app.mjs','utf8'),tool=fs.readFileSync('android-shell/tools/apply-prism-pin.mjs','utf8');
  assert.match(h,/minlength="8"/);
  assert.match(a,/pin.length<8/);
  assert.match(tool,/pin.length\(\)<8/);
  assert.doesNotMatch(h,/value="[0-9]{4,}"/);
});

test('browser installer patches the generated Capacitor root Gradle repository block',()=>{
  const tool=fs.readFileSync('android-shell/tools/apply-prism-browser.mjs','utf8');
  assert.match(tool,/rootGradlePath=join\(androidRoot,'build.gradle'\)/);
  assert.match(tool,/mavenCentral/);
  assert.doesNotMatch(tool,/settingsPath=join\(androidRoot,'settings.gradle'\)/);
});
