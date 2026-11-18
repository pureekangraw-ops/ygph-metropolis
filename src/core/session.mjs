/**
 * Session store interface + default in-memory TTL store.
 * Keeps `brief` and recent conversation turns per sessionId/userId.
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
