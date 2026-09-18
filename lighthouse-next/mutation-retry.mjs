function clone(value) {
  return value == null ? value : structuredClone(value);
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
  }
  return value;
}

function payloadKey(value) {
  return JSON.stringify(stable(value ?? null));
}

export function mutationErrorNeedsVerification(error) {
  const code = String(error?.message || error || '').trim();
  if (!code) return true;
  if (code === 'RUNTIME_SESSION_LOCKED') return false;
  if (code.includes('PAYMENT_OVER_REMAINING')) return false;
  if (code.includes('INSUFFICIENT_STOCK')) return false;
  if (code.includes('_REQUIRED') || code.includes('_INVALID') || code.includes('_NOT_ALLOWED')) return false;
  return true;
}

export function createStableMutationAttempt({
  createId,
  prefixes,
} = {}) {
  if (typeof createId !== 'function') throw new TypeError('LIGHTHOUSE_MUTATION_ID_FACTORY_REQUIRED');
  if (!prefixes || typeof prefixes !== 'object' || Array.isArray(prefixes) || !Object.keys(prefixes).length) {
    throw new TypeError('LIGHTHOUSE_MUTATION_PREFIXES_REQUIRED');
  }
  for (const [name, prefix] of Object.entries(prefixes)) {
    if (!String(name || '').trim() || !String(prefix || '').trim()) throw new TypeError('LIGHTHOUSE_MUTATION_PREFIX_INVALID');
  }

  let current = null;

  function acquire(payload) {
    const key = payloadKey(payload);
    if (current?.verificationPending && current.key !== key) {
      throw new Error('LIGHTHOUSE_MUTATION_RETRY_PAYLOAD_LOCKED');
    }
    if (!current || current.key !== key) {
      current = {
        key,
        payload:clone(payload),
        ids:Object.fromEntries(Object.entries(prefixes).map(([name, prefix]) => [name, createId(prefix)])),
        verificationPending:false,
      };
    }
    return Object.freeze({ ...current.ids });
  }

  function markVerificationPending() {
    if (!current) throw new Error('LIGHTHOUSE_MUTATION_ATTEMPT_REQUIRED');
    current.verificationPending = true;
    return snapshot();
  }

  function clear() {
    current = null;
  }

  function snapshot() {
    if (!current) return null;
    return Object.freeze({
      payload:clone(current.payload),
      ids:Object.freeze({ ...current.ids }),
      verificationPending:current.verificationPending,
    });
  }

  return Object.freeze({ acquire, markVerificationPending, clear, snapshot });
}
