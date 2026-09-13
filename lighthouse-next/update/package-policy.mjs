export const CRITICAL_CORE_SCOPES = Object.freeze([
  'lighthouse-next/runtime-gate.mjs',
  'greenfield/device-unlock.mjs',
  'greenfield/first-run.mjs',
  'greenfield/runtime.mjs',
  'greenfield/runtime-session.mjs',
  'greenfield/calculation-authority.mjs',
  'greenfield/mutation-coordinator.mjs',
  'greenfield/restore-compat.mjs',
  'lighthouse-next/update/release-trust.mjs',
]);

const ALLOWED_SCOPES = Object.freeze({
  data: new Set([
    'lighthouse-next/assets',
    'lighthouse-next/manifest.webmanifest',
  ]),
  module: new Set([
    'lighthouse-next/view-model.mjs',
    'lighthouse-next/owner-polish.css',
    'lighthouse-next/preview.css',
  ]),
  full: new Set(['full-app']),
});

const CRITICAL_SET = new Set(CRITICAL_CORE_SCOPES);

export function assertPackageScopeAllowed({ packageType, requestedScopes } = {}) {
  const allowed = ALLOWED_SCOPES[packageType];
  if (!allowed) throw new TypeError('Package scope policy received unsupported package type');
  if (!Array.isArray(requestedScopes) || requestedScopes.length === 0) {
    throw new TypeError('Package scope policy requires at least one scope');
  }

  for (const scope of requestedScopes) {
    if (typeof scope !== 'string' || scope.trim() === '') {
      throw new TypeError('Package scope policy received malformed scope');
    }
    if (packageType !== 'full' && CRITICAL_SET.has(scope)) {
      throw new Error(`Package scope is Critical Core and requires a full release: ${scope}`);
    }
    if (!allowed.has(scope)) {
      throw new Error(`Package scope is not allowed for ${packageType}: ${scope}`);
    }
  }

  return Object.freeze([...requestedScopes]);
}
