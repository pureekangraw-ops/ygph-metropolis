/**
 * Session store interface + InMemorySessionStore + Cloudflare KVSessionStore.
 * Keeps `brief`, pending slot tracking, and recent conversation turns per sessionId.
 */

export class InMemorySessionStore {
  constructor({ ttlMs = 24 * 60 * 60 * 1000, clock = Date.now } = {}) {
    this.ttlMs = ttlMs;
    this.clock = clock;
    this.store = new Map();
  }

  async get(sessionId) {
    if (!sessionId) return null;
    const entry = this.store.get(sessionId);
    if (!entry) return null;
    if (this.clock() > entry.expiresAt) {
      this.store.delete(sessionId);
      return null;
    }
    return structuredClone(entry.data);
  }

  async set(sessionId, data) {
    if (!sessionId) return;
    this.store.set(sessionId, {
      data: structuredClone(data),
      expiresAt: this.clock() + this.ttlMs,
    });
  }

  async delete(sessionId) {
    if (!sessionId) return;
    this.store.delete(sessionId);
  }
}

export class KVSessionStore {
  constructor(kvNamespace, { ttlSeconds = 24 * 60 * 60, prefix = 'chat_session:' } = {}) {
    if (!kvNamespace || typeof kvNamespace.get !== 'function' || typeof kvNamespace.put !== 'function') {
      throw new Error('KV_NAMESPACE_INVALID');
    }
    this.kv = kvNamespace;
    this.ttlSeconds = ttlSeconds;
    this.prefix = prefix;
  }

  async get(sessionId) {
    if (!sessionId) return null;
    const raw = await this.kv.get(`${this.prefix}${sessionId}`);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  async set(sessionId, data) {
    if (!sessionId) return;
    await this.kv.put(`${this.prefix}${sessionId}`, JSON.stringify(data), {
      expirationTtl: this.ttlSeconds,
    });
  }

  async delete(sessionId) {
    if (!sessionId) return;
    await this.kv.delete(`${this.prefix}${sessionId}`);
  }
}
