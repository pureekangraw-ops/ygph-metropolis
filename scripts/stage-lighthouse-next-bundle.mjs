import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const LIGHTHOUSE_RUNTIME_FILES = Object.freeze([
  'index.html',
  'setup.html',
  'styles.css',
  'owner-polish.css',
  'app.mjs',
  'android-back.mjs',
  'capacitor-app.mjs',
  'surface-contract.mjs',
  'calendar-month.mjs',
  'settings-operations.mjs',
  'setup.mjs',
  'view-model.mjs',
  'runtime-gate.mjs',
  'runtime-ledger.mjs',
  'runtime-store.mjs',
  'control-port/capability-registry.mjs',
  'control-port/control-port.mjs',
  'control-port/control-port-runtime.mjs',
  'control-port/control-port-sync.mjs',
  'send-control.mjs',
  'general-income.mjs',
  'store-product.mjs',
  'store-sale.mjs',
  'chat-intent.mjs',
  'chat-read.mjs',
  'chat-intent-recovery.mjs',
  'chat-path.mjs',
  'chat-lifecycle.mjs',
  'mutation-retry.mjs',
  'bangkok-date.mjs',
  'manifest.webmanifest',
]);

export const GREENFIELD_ENTRYPOINTS = Object.freeze([
  'runtime.mjs',
  'runtime-session.mjs',
  'calculation-authority.mjs',
  'first-run.mjs',
]);

export const LIGHTHOUSE_PATH_ENTRYPOINTS = Object.freeze([
  'path-contract.mjs',
  'path-kernel.mjs',
  'pattern-input.mjs',
  'capabilities/expense.mjs',
]);

export const CLIENT_RUNTIME_FILES = Object.freeze([
  'styles.css',
  'go-client.css',
  'ui/go-client-entry.mjs',
  'ui/go-client.mjs',
  'ui/go-client-flow.mjs',
]);

const REQUIRED_ASSETS = Object.freeze([
  'assets/lighthouse-icon.svg',
  'assets/lighthouse-icon-maskable.svg',
]);

const IMPORT_RE = /(?:from\s+|import\s*\(\s*|import\s+)['"](\.[^'"]+\.mjs)['"]/g;

async function exists(path) {
  try { await stat(path); return true; } catch { return false; }
}

function safeRelativeModulePath(value) {
  const relative = normalize(value).replaceAll('\\', '/');
  if (isAbsolute(relative) || relative === '..' || relative.startsWith('../')) throw new Error(`GREENFIELD_STAGE_PATH_INVALID:${relative}`);
  return relative;
}

export async function collectGreenfieldModuleClosure(greenfieldRoot, entrypoints = GREENFIELD_ENTRYPOINTS) {
  const pending = [...entrypoints];
  const seen = new Set();
  while (pending.length) {
    const relative = safeRelativeModulePath(pending.pop());
    if (seen.has(relative)) continue;
    const source = join(greenfieldRoot, relative);
    if (!(await exists(source))) throw new Error(`GREENFIELD_STAGE_SOURCE_MISSING:${relative}`);
    seen.add(relative);
    const text = await readFile(source, 'utf8');
    for (const match of text.matchAll(IMPORT_RE)) pending.push(safeRelativeModulePath(join(dirname(relative), match[1])));
  }
  return [...seen].sort();
}

const ROOT_ENTRY = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>LIGHTHOUSE</title><meta http-equiv="refresh" content="0;url=./lighthouse-next/index.html"></head><body><p>LIGHTHOUSE</p><script>location.replace(\'./lighthouse-next/index.html\');</script></body></html>';

const CLIENT_ENTRY = `<!doctype html>
<html lang="th">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <meta name="theme-color" content="#0B0E14">
  <title>GO Client</title>
  <link rel="stylesheet" href="/client/assets/styles.css">
  <link rel="stylesheet" href="/client/assets/go-client.css" data-go-client-style>
</head>
<body class="go-client-mode">
  <script type="module" src="/client/assets/ui/go-client-entry.mjs"></script>
</body>
</html>`;

function sourceIdentity() {
  const commit = String(process.env.GITHUB_SHA || '').trim() || null;
  const ref = String(process.env.GITHUB_REF_NAME || process.env.GITHUB_HEAD_REF || '').trim() || null;
  const repository = String(process.env.GITHUB_REPOSITORY || 'pureekangraw-ops/ygph-metropolis').trim();
  return { repository, ref, commit };
}

async function hashFiles(root, files) {
  const hash = createHash('sha256');
  for (const relative of [...files].sort()) {
    hash.update(relative);
    hash.update('\0');
    hash.update(await readFile(join(root, relative)));
    hash.update('\0');
  }
  return `sha256-${hash.digest('hex').slice(0, 16)}`;
}

function renderServiceWorker({ release, assetRevision, shell }) {
  return `"use strict";
const RELEASE=${JSON.stringify(release)};
const ASSET_REVISION=${JSON.stringify(assetRevision)};
const CACHE=\`lighthouse-\${RELEASE}-\${ASSET_REVISION}\`;
const SHELL=${JSON.stringify(shell)};
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>(key.startsWith('lighthouse-')||key.startsWith('ygph-metropolis-'))&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
async function networkFirst(request,fallback){try{const response=await fetch(request,{cache:'no-store'});if(response&&response.status===200&&response.type!=='opaque'){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(request,copy));}return response;}catch(error){const cached=await caches.match(request);if(cached)return cached;if(fallback){const shell=await caches.match(fallback);if(shell)return shell;}throw error;}}
async function cacheFirst(request){const cached=await caches.match(request);if(cached)return cached;const response=await fetch(request);if(response&&response.status===200&&response.type!=='opaque'){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(request,copy));}return response;}
self.addEventListener('fetch',event=>{if(event.request.method!=='GET')return;if(event.request.mode==='navigate'){event.respondWith(networkFirst(event.request,'./index.html'));return;}if(event.request.destination==='script'||event.request.destination==='style'){event.respondWith(networkFirst(event.request));return;}event.respondWith(cacheFirst(event.request));});
`;
}

export async function stageLighthouseBundle({ repoRoot, destinationRoot }) {
  const lighthouseRoot = join(repoRoot, 'lighthouse-next');
  const greenfieldRoot = join(repoRoot, 'greenfield');
  const lighthousePathRoot = join(repoRoot, 'lighthouse');

  for (const relative of [...LIGHTHOUSE_RUNTIME_FILES, ...REQUIRED_ASSETS]) {
    if (!(await exists(join(lighthouseRoot, relative)))) throw new Error(`LIGHTHOUSE_NEXT_SOURCE_MISSING:${relative}`);
  }
  for (const relative of CLIENT_RUNTIME_FILES) {
    if (!(await exists(join(repoRoot, relative)))) throw new Error(`GO_CLIENT_SOURCE_MISSING:${relative}`);
  }

  const greenfieldFiles = await collectGreenfieldModuleClosure(greenfieldRoot);
  const lighthousePathFiles = await collectGreenfieldModuleClosure(lighthousePathRoot, LIGHTHOUSE_PATH_ENTRYPOINTS);

  await rm(destinationRoot, { recursive: true, force: true });
  await mkdir(join(destinationRoot, 'lighthouse-next', 'assets'), { recursive: true });
  await mkdir(join(destinationRoot, 'greenfield'), { recursive: true });
  await mkdir(join(destinationRoot, 'lighthouse', 'capabilities'), { recursive: true });
  await mkdir(join(destinationRoot, 'client', 'assets', 'ui'), { recursive: true });

  await writeFile(join(destinationRoot, 'index.html'), ROOT_ENTRY, 'utf8');
  await writeFile(join(destinationRoot, 'client', 'index.html'), CLIENT_ENTRY, 'utf8');
  await cp(join(repoRoot, '_headers'), join(destinationRoot, '_headers'), { force: true });

  const [androidVersion, androidIdentity] = await Promise.all([
    readFile(join(repoRoot, 'android-shell', 'version.json'), 'utf8').then(JSON.parse),
    readFile(join(repoRoot, 'android-shell', 'apk-identity.json'), 'utf8').then(JSON.parse),
  ]);
  if (androidVersion?.owner !== 'ANDROID_APK') throw new Error('LIGHTHOUSE_ANDROID_VERSION_OWNER_INVALID');
  if (!androidIdentity?.applicationId || !Number.isInteger(Number(androidVersion?.versionCode)) || !String(androidVersion?.versionName || '').trim()) {
    throw new Error('LIGHTHOUSE_ANDROID_BUILD_IDENTITY_INVALID');
  }

  const source = sourceIdentity();
  const buildIdentity = {
    owner:'ANDROID_APK',
    applicationId:androidIdentity.applicationId,
    versionCode:Number(androidVersion.versionCode),
    versionName:String(androidVersion.versionName),
    baselineVersionCode:Number(androidVersion.baselineVersionCode),
    sourceRepository:source.repository,
    sourceRef:source.ref,
    sourceCommit:source.commit,
  };
  await writeFile(join(destinationRoot, 'lighthouse-next', 'build-identity.json'), `${JSON.stringify(buildIdentity, null, 2)}\n`, 'utf8');

  for (const relative of LIGHTHOUSE_RUNTIME_FILES) {
    const target = join(destinationRoot, 'lighthouse-next', relative);
    await mkdir(dirname(target), { recursive: true });
    await cp(join(lighthouseRoot, relative), target, { force: true });
  }
  for (const relative of REQUIRED_ASSETS) {
    const target = join(destinationRoot, 'lighthouse-next', relative);
    await mkdir(dirname(target), { recursive: true });
    await cp(join(lighthouseRoot, relative), target, { force: true });
  }
  for (const relative of greenfieldFiles) {
    const target = join(destinationRoot, 'greenfield', relative);
    await mkdir(dirname(target), { recursive: true });
    await cp(join(greenfieldRoot, relative), target, { force: true });
  }
  for (const relative of lighthousePathFiles) {
    const target = join(destinationRoot, 'lighthouse', relative);
    await mkdir(dirname(target), { recursive: true });
    await cp(join(lighthousePathRoot, relative), target, { force: true });
  }
  for (const relative of CLIENT_RUNTIME_FILES) {
    const target = join(destinationRoot, 'client', 'assets', relative);
    await mkdir(dirname(target), { recursive: true });
    await cp(join(repoRoot, relative), target, { force: true });
  }

  const applicationFiles = [
    'index.html',
    'client/index.html',
    'lighthouse-next/build-identity.json',
    ...LIGHTHOUSE_RUNTIME_FILES.map(file => `lighthouse-next/${file}`),
    ...REQUIRED_ASSETS.map(file => `lighthouse-next/${file}`),
    ...greenfieldFiles.map(file => `greenfield/${file}`),
    ...lighthousePathFiles.map(file => `lighthouse/${file}`),
    ...CLIENT_RUNTIME_FILES.map(file => `client/assets/${file}`),
  ];
  const assetRevision = await hashFiles(destinationRoot, applicationFiles);
  const releaseManifest = {
    product:'LIGHTHOUSE',
    architecture:'LIGHTHOUSE_NEXT',
    authority:'scripts/stage-lighthouse-next-bundle.mjs',
    versionName:buildIdentity.versionName,
    versionCode:buildIdentity.versionCode,
    applicationId:buildIdentity.applicationId,
    source,
    assetRevision,
    roots:['CHAT','MANUAL','SETTINGS'],
    legacyShell:'ROLLBACK_ONLY_NOT_DEPLOYED',
    applicationFiles:[...applicationFiles].sort(),
  };
  await writeFile(join(destinationRoot, 'release-manifest.json'), `${JSON.stringify(releaseManifest, null, 2)}\n`, 'utf8');

  const shell = [...applicationFiles, 'release-manifest.json'].sort().map(file => `./${file}`);
  await writeFile(join(destinationRoot, 'sw.js'), renderServiceWorker({
    release:buildIdentity.versionName,
    assetRevision,
    shell,
  }), 'utf8');

  return {
    lighthouseFiles:[...LIGHTHOUSE_RUNTIME_FILES, ...REQUIRED_ASSETS],
    greenfieldFiles,
    lighthousePathFiles,
    clientFiles:[...CLIENT_RUNTIME_FILES],
    applicationFiles:[...applicationFiles, 'release-manifest.json', 'sw.js'],
    assetRevision,
    buildIdentity,
  };
}

const modulePath = fileURLToPath(import.meta.url);
const invokedPath = process.argv[1] ? resolve(process.argv[1]) : null;
if (invokedPath === modulePath) {
  const destinationArg = process.argv[2];
  if (!destinationArg) throw new Error('LIGHTHOUSE_STAGE_DESTINATION_REQUIRED');
  const repoRoot = resolve(dirname(modulePath), '..');
  const destinationRoot = resolve(process.cwd(), destinationArg);
  const result = await stageLighthouseBundle({ repoRoot, destinationRoot });
  console.log(`Staged canonical LIGHTHOUSE bundle (${result.applicationFiles.length} deploy files, ${result.greenfieldFiles.length} Greenfield modules)`);
}
