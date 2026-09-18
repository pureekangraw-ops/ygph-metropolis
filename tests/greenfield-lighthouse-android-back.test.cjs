const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = process.cwd();
const modulePath = path.join(root, 'lighthouse-next', 'android-back.mjs');

async function loadModule() {
  assert.equal(fs.existsSync(modulePath), true, 'missing lighthouse-next/android-back.mjs');
  return import(`${modulePath}?t=${Date.now()}-${Math.random()}`);
}

function fakeRoot({ recovery=false, dialog=false, detail=false, activeRoot='manual' } = {}) {
  const clicks=[];
  const closed=[];
  const elements = {
    '#recovery-form': { hidden:!recovery },
    'dialog[open]': dialog ? { close(){ closed.push('dialog'); } } : null,
    '#manual-detail': { hidden:!detail },
    '#manual-back': { click(){ clicks.push('manual-back'); } },
    '.nav-item.active': { dataset:{ rootTarget:activeRoot } },
    '[data-root-target="manual"]': { click(){ clicks.push('manual-root'); } },
    '#cancel-recovery': { click(){ clicks.push('cancel-recovery'); } },
  };
  return {
    querySelector(selector){ return elements[selector] ?? null; },
    clicks,
    closed,
  };
}

test('Android Back prioritizes recovery, dialogs, MANUAL detail, root return, then minimize', async () => {
  const { handleAndroidBack } = await loadModule();
  const minimized=[];
  const App={ async minimizeApp(){ minimized.push(true); } };

  let root=fakeRoot({ recovery:true });
  assert.equal(await handleAndroidBack({ root, App }), 'RECOVERY_LOGIN');
  assert.deepEqual(root.clicks, ['cancel-recovery']);

  root=fakeRoot({ dialog:true });
  assert.equal(await handleAndroidBack({ root, App }), 'CLOSE_DIALOG');
  assert.deepEqual(root.closed, ['dialog']);

  root=fakeRoot({ detail:true });
  assert.equal(await handleAndroidBack({ root, App }), 'MANUAL_HUB');
  assert.deepEqual(root.clicks, ['manual-back']);

  root=fakeRoot({ activeRoot:'chat' });
  assert.equal(await handleAndroidBack({ root, App }), 'MANUAL_ROOT');
  assert.deepEqual(root.clicks, ['manual-root']);

  root=fakeRoot({ activeRoot:'manual' });
  assert.equal(await handleAndroidBack({ root, App }), 'MINIMIZE');
  assert.equal(minimized.length, 1);
});

test('native adapter registers official App plugin through injected Capacitor global and web stays no-op', async () => {
  const { installAndroidBackHandler } = await loadModule();
  const root=fakeRoot();
  let listener=null;
  const App={
    async addListener(name, callback){ assert.equal(name, 'backButton'); listener=callback; return { remove:async()=>{} }; },
    async minimizeApp(){},
  };
  const calls=[];
  const capacitor={
    isNativePlatform:()=>true,
    isPluginAvailable:name=>name==='App',
    registerPlugin(name){ calls.push(name); return App; },
  };
  assert.equal(await installAndroidBackHandler({ root, capacitor }), true);
  assert.deepEqual(calls, ['App']);
  assert.equal(typeof listener, 'function');

  assert.equal(await installAndroidBackHandler({
    root,
    capacitor:{ isNativePlatform:()=>false, isPluginAvailable:()=>false, registerPlugin(){ throw new Error('not native'); } },
  }), false);
});

test('Android shell declares official Capacitor App plugin and keeps sync script', () => {
  const pkg=JSON.parse(fs.readFileSync(path.join(root, 'android-shell', 'package.json'), 'utf8'));
  assert.match(String(pkg.dependencies?.['@capacitor/app'] || ''), /^8\./);
  assert.equal(pkg.scripts?.['android:sync'], 'npx cap sync android');
});
