"use strict";
const RELEASE='5.2.6';
const ASSET_REVISION='sha256-1bf369d0196a7735';
const CACHE=`ygph-metropolis-${RELEASE}-${ASSET_REVISION}`;
const SHELL=['./index.html','./app.mjs','./styles.css','./theme.css','./compact-ui.css','./styles/settings-utility.css','./manifest.webmanifest','./icon-192.png','./icon-512.png','./ui/app.mjs','./ui/release-status.mjs','./ui/settings-ui.mjs','./ui/reset-all-ui.mjs','./ui/theme-shell.mjs','./ui/home-ui.mjs','./ui/store-ui.mjs','./ui/finance-ui.mjs','./ui/manual-finance-ui.mjs','./ui/manual-finance.css','./ui/ride-ui.mjs','./ui/action-popups.mjs','./ui/obligation-import-ui.mjs','./ui/ui-model.mjs','./ui/product-model.mjs','./ui/icons.mjs','./ui/master-input.mjs','./ui/master-input.css','./greenfield/action-contract.mjs','./greenfield/calculation-authority.mjs','./greenfield/daily-lifecycle.mjs','./greenfield/runtime.mjs','./greenfield/runtime-session.mjs','./greenfield/device-unlock.mjs','./greenfield/first-run.mjs','./greenfield/core.mjs','./greenfield/persistence.mjs','./greenfield/browser-store.mjs','./greenfield/cutover.mjs','./greenfield/evidence-integrity.mjs','./greenfield/finance-seed-import.mjs','./greenfield/import-evidence.mjs','./greenfield/import-router.mjs','./greenfield/manual-four-houses.mjs','./greenfield/context-reference.mjs','./greenfield/projections.mjs','./greenfield/restore-compat.mjs','./greenfield/obligation-import.mjs','./greenfield/command-runtime.mjs','./greenfield/domain-operations.mjs','./greenfield/ride-domain.mjs','./greenfield/ride-workflows.mjs','./greenfield/master-input-router.mjs','./greenfield/workflow-runtime.mjs','./greenfield/workflow-invariants.mjs','./greenfield/mutation-coordinator.mjs','./greenfield/business-workflows.mjs','./greenfield/backup.mjs','./lighthouse/master-input-route.mjs','./lighthouse/master-input-recovery-session.mjs','./lighthouse/intent-recovery.mjs','./lighthouse/intent-path-adapter.mjs','./lighthouse/intent-parser.mjs','./lighthouse/intent-number.mjs','./lighthouse/intent-condition.mjs','./lighthouse/intent-temporal.mjs','./lighthouse/intent-dual-route.mjs','./lighthouse/intent-vocabulary.mjs','./lighthouse/intent-interpret.mjs','./lighthouse/path-contract.mjs','./lighthouse/pattern-input.mjs','./lighthouse/path-kernel.mjs','./lighthouse/multi-group-contract.mjs','./lighthouse/multi-group-execution.mjs','./lighthouse/multi-group-frontdoor.mjs','./lighthouse/multi-group-frontdoor-runtime.mjs','./lighthouse/multi-group-frontdoor-recovery.mjs','./lighthouse/capabilities/expense.mjs'];

const SNAPSHOT_DATABASE='lighthouse-effective-snapshots-v1';
const SNAPSHOT_DATABASE_VERSION=1;
const SNAPSHOTS_STORE='snapshots';
const META_STORE='meta';
const EFFECTIVE_META_KEY='effective-state-v1';
const BASE_BYPASS_KEY='lighthouse-base';
const PROTECTED_PREFIXES=['patch/','trusted/','greenfield/'];
const PROTECTED_FILES=new Set(['sw.js','effective-base-manifest.json']);

function requestValue(request){return new Promise((resolve,reject)=>{request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error||new Error('SNAPSHOT_DB_REQUEST_FAILED'));});}
function transactionDone(transaction){return new Promise((resolve,reject)=>{transaction.oncomplete=()=>resolve();transaction.onerror=()=>reject(transaction.error||new Error('SNAPSHOT_DB_TRANSACTION_FAILED'));transaction.onabort=()=>reject(transaction.error||new Error('SNAPSHOT_DB_TRANSACTION_ABORTED'));});}
function openSnapshotDatabase(){return new Promise((resolve,reject)=>{const request=indexedDB.open(SNAPSHOT_DATABASE,SNAPSHOT_DATABASE_VERSION);request.onupgradeneeded=()=>{const database=request.result;if(!database.objectStoreNames.contains(SNAPSHOTS_STORE))database.createObjectStore(SNAPSHOTS_STORE);if(!database.objectStoreNames.contains(META_STORE))database.createObjectStore(META_STORE);};request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error||new Error('SNAPSHOT_DB_OPEN_FAILED'));});}

async function sha256Hex(text){const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));return Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');}
function relativePath(url){const scopePath=new URL(self.registration.scope).pathname;let pathname=url.pathname;if(pathname.startsWith(scopePath))pathname=pathname.slice(scopePath.length);pathname=pathname.replace(/^\/+/, '');return pathname||'index.html';}
function protectedPath(path){return PROTECTED_FILES.has(path)||PROTECTED_PREFIXES.some(prefix=>path.startsWith(prefix));}
function contentType(path){if(path.endsWith('.html'))return 'text/html; charset=utf-8';if(path.endsWith('.css'))return 'text/css; charset=utf-8';if(path.endsWith('.mjs')||path.endsWith('.js'))return 'text/javascript; charset=utf-8';if(path.endsWith('.json')||path.endsWith('.webmanifest'))return 'application/json; charset=utf-8';return 'text/plain; charset=utf-8';}

async function effectiveSnapshotResponse(request){
  const url=new URL(request.url);
  if(url.origin!==self.location.origin||url.searchParams.get(BASE_BYPASS_KEY)==='1')return null;
  const path=relativePath(url);
  if(protectedPath(path))return null;
  const database=await openSnapshotDatabase();
  try{
    const transaction=database.transaction([SNAPSHOTS_STORE,META_STORE],'readonly');
    const done=transactionDone(transaction);
    const meta=await requestValue(transaction.objectStore(META_STORE).get(EFFECTIVE_META_KEY));
    if(!meta?.currentSnapshotId){await done;return null;}
    const snapshot=await requestValue(transaction.objectStore(SNAPSHOTS_STORE).get(meta.currentSnapshotId));
    await done;
    const file=snapshot?.files?.[path];
    if(!file||typeof file.content!=='string')return null;
    const actual=await sha256Hex(file.content);
    if(actual!==file.sha256)throw new Error(`SNAPSHOT_FILE_HASH_MISMATCH:${path}`);
    return new Response(file.content,{status:200,headers:{'Content-Type':contentType(path),'Cache-Control':'no-store','X-Lighthouse-Snapshot':snapshot.snapshotId||meta.currentSnapshotId}});
  }finally{database.close();}
}

self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('ygph-metropolis-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
async function navigationNetworkFirst(request){try{const response=await fetch(request,{cache:'no-store'});if(response&&response.status===200&&response.type!=='opaque'){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put('./index.html',copy));}return response;}catch(error){const cached=await caches.match('./index.html');if(cached)return cached;throw error;}}
async function codeNetworkFirst(request){try{const response=await fetch(request,{cache:'no-store'});if(response&&response.status===200&&response.type!=='opaque'){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(request,copy));}return response;}catch(error){const cached=await caches.match(request);if(cached)return cached;throw error;}}
async function assetCacheFirst(request){const cached=await caches.match(request);if(cached)return cached;const response=await fetch(request);if(response&&response.status===200&&response.type!=='opaque'){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(request,copy));}return response;}

self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  event.respondWith((async()=>{
    try{
      const overlay=await effectiveSnapshotResponse(event.request);
      if(overlay)return overlay;
    }catch(error){
      return new Response(`LIGHTHOUSE PATCH_SNAPSHOT_HASH_MISMATCH: ${error.message}`,{status:503,headers:{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'}});
    }
    if(event.request.mode==='navigate')return navigationNetworkFirst(event.request);
    if(event.request.destination==='script'||event.request.destination==='style')return codeNetworkFirst(event.request);
    return assetCacheFirst(event.request);
  })());
});
