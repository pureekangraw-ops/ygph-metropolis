"use strict";

const APP_CACHE_PREFIX = "ygph-metropolis-app-";
const LEGACY_CACHE_PREFIXES = Object.freeze([
  "ygph-metropolis-0.1.0-preview."
]);
const RELEASE_ID = "v4.2.4-20260809-r16-ygph-visual-system";
const CURRENT_CACHE = `${APP_CACHE_PREFIX}${RELEASE_ID}`;
const META_CACHE = "ygph-metropolis-meta";
const META_PATH = "__ygph_service_worker_lifecycle__";
const APP_SHELL = [
  "./",
  "index.html",
  "manifest.webmanifest",
  "styles.css",
  "flow-era.css",
  "flow-era-3.5.css",
  "metropolis-v4.css",
  "metropolis-r5.css",
  "metropolis-r5-1.css",
  "metropolis-r5-2.css",
  "metropolis-r5-3.css",
  "metropolis-r5-4.css",
  "sw-bootstrap.js",
  "highway-gate.js",
  "app.js",
  "flow-era.js",
  "flow-era-3.5.js",
  "metropolis-v4.js",
  "metropolis-r5.js",
  "metropolis-r5-1.js",
  "metropolis-r5-2.js",
  "metropolis-r5-3.js",
  "metropolis-r5-4.js",
  "icon-192.png",
  "icon-512.png"
];

function lifecycleBase(value = {}) {
  return {
    version: 1,
    current: value.current || null,
    serving: value.serving || value.current || null,
    previous: value.previous || null,
    rolledBack: Boolean(value.rolledBack),
    updatedAt: value.updatedAt || null
  };
}

function planActivation(existing, installedCache, at = new Date().toISOString()) {
  const before = lifecycleBase(existing);
  if (before.current === installedCache) {
    return { ...before, serving: before.serving || installedCache, updatedAt: at };
  }
  const previous = before.serving && before.serving !== installedCache
    ? before.serving
    : before.current && before.current !== installedCache
      ? before.current
      : before.previous && before.previous !== installedCache
        ? before.previous
        : null;
  return {
    version: 1,
    current: installedCache,
    serving: installedCache,
    previous,
    rolledBack: false,
    updatedAt: at
  };
}

function planRollback(existing, at = new Date().toISOString()) {
  const before = lifecycleBase(existing);
  if (!before.previous || before.previous === before.current) throw new Error("ไม่มีรุ่นก่อนหน้าให้ย้อนกลับ");
  return { ...before, serving: before.previous, rolledBack: true, updatedAt: at };
}

function planUseCurrent(existing, at = new Date().toISOString()) {
  const before = lifecycleBase(existing);
  if (!before.current) throw new Error("ไม่พบรุ่นล่าสุด");
  return { ...before, serving: before.current, rolledBack: false, updatedAt: at };
}

function obsoleteAppCaches(cacheNames, lifecycle) {
  const keep = new Set([lifecycle?.current, lifecycle?.serving, lifecycle?.previous].filter(Boolean));
  return cacheNames.filter(name => name.startsWith(APP_CACHE_PREFIX) && !keep.has(name));
}

function legacyAppCaches(cacheNames = []) {
  return cacheNames.filter(name =>
    LEGACY_CACHE_PREFIXES.some(prefix => name.startsWith(prefix))
  );
}

function shouldAutoActivateLegacyBridge(cacheNames, lifecycle) {
  const state = lifecycleBase(lifecycle);
  const hasSafeGeneration = Boolean(state.current || state.serving || state.previous);
  return !hasSafeGeneration && legacyAppCaches(cacheNames).length > 0;
}

function assertShellReadback(responses) {
  if (!Array.isArray(responses) || responses.length !== APP_SHELL.length || responses.some(response => !response || !response.ok)) {
    throw new Error("ไฟล์ออฟไลน์ไม่ครบ");
  }
  return true;
}

function offlineLookupKeys(request) {
  return request?.mode === "navigate" ? ["index.html", "./"] : [request];
}

if (typeof self !== "undefined" && typeof self.addEventListener === "function") {
  const scopedUrl = path => new URL(path, self.registration.scope).href;
  const lifecycleRequest = () => new Request(scopedUrl(META_PATH));

  async function readLifecycle() {
    const cache = await caches.open(META_CACHE);
    const response = await cache.match(lifecycleRequest());
    if (!response) return lifecycleBase();
    try {
      return lifecycleBase(await response.json());
    } catch {
      return lifecycleBase();
    }
  }

  async function writeLifecycle(value) {
    const next = lifecycleBase(value);
    const cache = await caches.open(META_CACHE);
    await cache.put(lifecycleRequest(), new Response(JSON.stringify(next), {
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
    }));
    const saved = await readLifecycle();
    if (JSON.stringify(saved) !== JSON.stringify(next)) throw new Error("อ่านสถานะ Service Worker กลับแล้วไม่ตรง");
    return saved;
  }

  async function precacheRelease() {
    const cacheNames = await caches.keys();
    const existed = cacheNames.includes(CURRENT_CACHE);
    const cache = await caches.open(CURRENT_CACHE);
    try {
      const requests = APP_SHELL.map(path => new Request(scopedUrl(path), { cache: "reload" }));
      await cache.addAll(requests);
      const readback = await Promise.all(requests.map(request => cache.match(request)));
      assertShellReadback(readback);
    } catch (error) {
      if (!existed) await caches.delete(CURRENT_CACHE);
      throw error;
    }
  }

  async function updateStatus() {
    const lifecycle = await readLifecycle();
    const cacheNames = await caches.keys();
    return {
      type: "UPDATE_STATUS",
      releaseId: RELEASE_ID,
      lifecycle,
      canRollback: Boolean(lifecycle.previous && cacheNames.includes(lifecycle.previous)),
      usingPrevious: Boolean(lifecycle.current && lifecycle.serving !== lifecycle.current)
    };
  }

  async function notifyClients(message) {
    const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    clients.forEach(client => client.postMessage(message));
  }

  async function reply(event, task) {
    try {
      const result = await task();
      event.ports?.[0]?.postMessage({ ok: true, ...result });
      return result;
    } catch (error) {
      event.ports?.[0]?.postMessage({ ok: false, error: error.message || String(error) });
      throw error;
    }
  }

  self.addEventListener("install", event => {
    event.waitUntil((async () => {
      await precacheRelease();
      const [cacheNames, lifecycle] = await Promise.all([
        caches.keys(),
        readLifecycle()
      ]);
      if (shouldAutoActivateLegacyBridge(cacheNames, lifecycle)) {
        await self.skipWaiting();
      }
    })());
  });

  self.addEventListener("activate", event => {
    event.waitUntil((async () => {
      const existing = await readLifecycle();
      const lifecycle = await writeLifecycle(planActivation(existing, CURRENT_CACHE));
      const cacheNames = await caches.keys();
      const cleanup = new Set([
        ...obsoleteAppCaches(cacheNames, lifecycle),
        ...legacyAppCaches(cacheNames)
      ]);
      await Promise.all([...cleanup].map(name => caches.delete(name)));
      await self.clients.claim();
      await notifyClients(await updateStatus());
    })());
  });

  self.addEventListener("message", event => {
    const type = event.data?.type;
    if (type === "ACTIVATE_UPDATE") {
      event.waitUntil(reply(event, async () => {
        await self.skipWaiting();
        return { type: "ACTIVATING_UPDATE" };
      }));
      return;
    }
    if (type === "CHECK_FOR_UPDATE") {
      event.waitUntil(reply(event, async () => {
        await self.registration.update();
        return updateStatus();
      }));
      return;
    }
    if (type === "GET_UPDATE_STATUS") {
      event.waitUntil(reply(event, updateStatus));
      return;
    }
    if (type === "ROLLBACK_UPDATE") {
      event.waitUntil(reply(event, async () => {
        const before = await readLifecycle();
        const next = planRollback(before);
        if (!(await caches.keys()).includes(next.serving)) throw new Error("ไฟล์รุ่นก่อนหน้าไม่ครบ");
        await writeLifecycle(next);
        const status = await updateStatus();
        await notifyClients(status);
        return status;
      }));
      return;
    }
    if (type === "ACTIVATE_CURRENT_CACHE") {
      event.waitUntil(reply(event, async () => {
        const next = planUseCurrent(await readLifecycle());
        if (!(await caches.keys()).includes(next.serving)) throw new Error("ไฟล์รุ่นล่าสุดไม่ครบ");
        await writeLifecycle(next);
        const status = await updateStatus();
        await notifyClients(status);
        return status;
      }));
    }
  });

  self.addEventListener("fetch", event => {
    const request = event.request;
    if (request.method !== "GET") return;
    const url = new URL(request.url);
    if (url.origin !== self.location.origin) return;

    event.respondWith((async () => {
      const lifecycle = await readLifecycle();
      const cacheName = lifecycle.serving || lifecycle.current || CURRENT_CACHE;
      const cache = await caches.open(cacheName);
      for (const key of offlineLookupKeys(request)) {
        const cached = await cache.match(key);
        if (cached) return cached;
      }
      return fetch(request);
    })());
  });
}

if (typeof module === "object" && module.exports) {
  module.exports = {
    APP_CACHE_PREFIX,
    LEGACY_CACHE_PREFIXES,
    RELEASE_ID,
    CURRENT_CACHE,
    META_CACHE,
    APP_SHELL,
    lifecycleBase,
    planActivation,
    planRollback,
    planUseCurrent,
    obsoleteAppCaches,
    legacyAppCaches,
    shouldAutoActivateLegacyBridge,
    assertShellReadback,
    offlineLookupKeys
  };
}
