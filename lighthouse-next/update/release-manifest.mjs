export const REQUIRED_MANIFEST_FIELDS = Object.freeze([
  'app_id',
  'release_id',
  'version',
  'channel',
  'package_type',
  'min_current_version',
  'allowed_scope',
  'payload_hash',
  'signing_identity',
  'source_commit',
  'build_provenance',
  'dependencies',
  'rollback_policy',
  'created_at',
]);

const PACKAGE_TYPES = new Set(['full', 'module', 'data']);

function assertPresent(input, field) {
  if (!(field in input) || input[field] === null || input[field] === undefined || input[field] === '') {
    throw new TypeError(`Release manifest missing required field: ${field}`);
  }
}

function freezeArray(value) {
  return Object.freeze([...value]);
}

function freezeObject(value) {
  return Object.freeze({ ...value });
}

export function parseReleaseManifest(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('Release manifest must be an object');
  }

  for (const field of REQUIRED_MANIFEST_FIELDS) assertPresent(input, field);

  if (!PACKAGE_TYPES.has(input.package_type)) {
    throw new TypeError('Release manifest package_type is not supported');
  }

  if (!Array.isArray(input.allowed_scope) || input.allowed_scope.length === 0 || input.allowed_scope.some((scope) => typeof scope !== 'string' || scope.trim() === '')) {
    throw new TypeError('Release manifest allowed_scope must contain at least one non-empty scope');
  }

  if (!Array.isArray(input.dependencies)) {
    throw new TypeError('Release manifest dependencies must be an array');
  }

  if (!input.build_provenance || typeof input.build_provenance !== 'object' || Array.isArray(input.build_provenance)) {
    throw new TypeError('Release manifest build_provenance must be an object');
  }

  return Object.freeze({
    ...input,
    allowed_scope: freezeArray(input.allowed_scope),
    dependencies: freezeArray(input.dependencies),
    build_provenance: freezeObject(input.build_provenance),
  });
}
