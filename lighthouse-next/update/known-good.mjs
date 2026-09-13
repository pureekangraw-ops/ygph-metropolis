export const KNOWN_GOOD_KEY = 'patchmaster-known-good-v1';

function clone(value) {
  return value == null ? value : structuredClone(value);
}

function freezeState(state) {
  return Object.freeze({
    current: clone(state.current ?? null),
    previous: clone(state.previous ?? null),
    candidate: clone(state.candidate ?? null),
    lastFailure: state.lastFailure ?? null,
  });
}

function assertStore(storage) {
  if (!storage || typeof storage.get !== 'function' || typeof storage.put !== 'function') {
    throw new TypeError('Known-good store requires get/put storage');
  }
}

function sameRelease(left, right) {
  if (!left || !right) return false;
  return left.releaseId === right.releaseId
    && left.version === right.version
    && left.payloadHash === right.payloadHash;
}

export function createKnownGoodStore(storage) {
  assertStore(storage);

  async function readRaw() {
    const found = await storage.get(KNOWN_GOOD_KEY);
    return found ?? { current: null, previous: null, candidate: null, lastFailure: null };
  }

  async function write(next) {
    const normalized = {
      current: clone(next.current ?? null),
      previous: clone(next.previous ?? null),
      candidate: clone(next.candidate ?? null),
      lastFailure: next.lastFailure ?? null,
    };
    await storage.put(KNOWN_GOOD_KEY, normalized);
    return freezeState(normalized);
  }

  return Object.freeze({
    async read() {
      return freezeState(await readRaw());
    },

    async beginCandidate(evidence) {
      if (!evidence || typeof evidence !== 'object') throw new TypeError('Candidate evidence is required');
      const state = await readRaw();
      return write({ ...state, candidate: evidence, lastFailure: null });
    },

    async commitAfterReadback(readback) {
      const state = await readRaw();
      if (!state.candidate) throw new Error('No candidate release is pending');
      if (!sameRelease(state.candidate, readback)) throw new Error('Candidate readback does not match pending release');
      return write({
        current: state.candidate,
        previous: state.current ?? state.previous ?? null,
        candidate: null,
        lastFailure: null,
      });
    },

    async abortCandidate(reason) {
      const state = await readRaw();
      return write({
        current: state.current ?? null,
        previous: state.previous ?? null,
        candidate: null,
        lastFailure: String(reason ?? 'candidate aborted'),
      });
    },
  });
}
