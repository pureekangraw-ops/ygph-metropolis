export const PATCH_SCHEMA = 'lighthouse.patch.v1';
export const PATCH_MAX_BYTES = 2 * 1024 * 1024;
export const PATCH_ALLOWED_FILES = Object.freeze([
  'app/ui.html',
  'app/ui.css',
  'app/logic.mjs',
  'app/rules.json',
  'app/vocabulary.json',
]);

const LEGACY_PATCH_PATHS = Object.freeze({
  'ui.html':'app/ui.html',
  'ui.css':'app/ui.css',
  'logic.mjs':'app/logic.mjs',
  'rules.json':'app/rules.json',
  'vocabulary.json':'app/vocabulary.json',
});
const PATCH_ALGORITHM = 'ECDSA-P256-SHA256';
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u;
const SHA256_HEX = /^[0-9a-f]{64}$/u;
const encoder = new TextEncoder();
const allowedFileSet = new Set(PATCH_ALLOWED_FILES);

export function canonicalPatchPath(path) {
  if (allowedFileSet.has(path)) return path;
  return LEGACY_PATCH_PATHS[path] ?? null;
}

function subtleCrypto() {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error('Web Crypto subtle API is required');
  return subtle;
}

function asObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value;
}

function parseVersion(value, label) {
  if (typeof value !== 'string') throw new Error(`${label} must be a SemVer string`);
  const match = SEMVER.exec(value);
  if (!match) throw new Error(`${label} must be a numeric SemVer triplet`);
  return match.slice(1).map(Number);
}

function compareVersion(left, right) {
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return 0;
}

function base64urlToBytes(value) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error('Patch signature value is required');
  }
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) throw new Error('Patch signature is invalid');
  const padded = `${value.replaceAll('-', '+').replaceAll('_', '/')}${'='.repeat((4 - (value.length % 4)) % 4)}`;
  let binary;
  try {
    binary = globalThis.atob(padded);
  } catch {
    throw new Error('Patch signature is invalid');
  }
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export async function sha256Hex(text) {
  if (typeof text !== 'string') throw new Error('Patch file content must be UTF-8 text');
  const digest = await subtleCrypto().digest('SHA-256', encoder.encode(text));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function canonicalPatchPayload(bundle) {
  const source = asObject(bundle, 'Patch bundle');
  const files = asObject(source.files, 'Patch files');
  const canonicalFiles = Object.keys(files)
    .sort()
    .map((path) => ({ path, sha256: files[path]?.sha256 }));

  return JSON.stringify({
    schema: source.schema,
    baseVersion: source.baseVersion,
    version: source.version,
    files: canonicalFiles,
  });
}

export async function verifyPatchBundle(bundle, { currentVersion, trustedKey } = {}) {
  const source = asObject(bundle, 'Patch bundle');
  const key = asObject(trustedKey, 'Trusted patch key');

  if (source.schema !== PATCH_SCHEMA) {
    throw new Error(`Patch schema must be ${PATCH_SCHEMA}`);
  }

  const current = parseVersion(currentVersion, 'Current version');
  const base = parseVersion(source.baseVersion, 'Patch baseVersion');
  const target = parseVersion(source.version, 'Patch version');

  if (source.baseVersion !== currentVersion || compareVersion(base, current) !== 0) {
    throw new Error('Patch baseVersion must equal the current version');
  }
  if (compareVersion(target, base) <= 0) {
    throw new Error('Patch version must be greater than baseVersion');
  }

  const files = asObject(source.files, 'Patch files');
  const paths = Object.keys(files);
  if (paths.length === 0) throw new Error('Patch files must contain at least one asset');

  let totalBytes = 0;
  const verifiedFiles = {};
  for (const path of paths) {
    const canonicalPath = canonicalPatchPath(path);
    if (!canonicalPath) throw new Error(`Unsupported patch asset path: ${path}`);
    if (verifiedFiles[canonicalPath]) throw new Error(`Duplicate canonical patch asset path: ${canonicalPath}`);
    const entry = asObject(files[path], `Patch file ${path}`);
    if (typeof entry.content !== 'string') throw new Error(`Patch file ${path} content must be UTF-8 text`);
    if (typeof entry.sha256 !== 'string' || !SHA256_HEX.test(entry.sha256)) {
      throw new Error(`Patch file ${path} SHA-256 must be 64 lowercase hex characters`);
    }

    totalBytes += encoder.encode(entry.content).byteLength;
    if (totalBytes > PATCH_MAX_BYTES) throw new Error('Patch content is too large');

    const actualHash = await sha256Hex(entry.content);
    if (actualHash !== entry.sha256) throw new Error(`Patch file ${path} SHA-256 hash mismatch`);
    verifiedFiles[canonicalPath] = { sha256: entry.sha256, content: entry.content };
  }

  const signature = asObject(source.signature, 'Patch signature');
  if (signature.alg !== PATCH_ALGORITHM || key.alg !== PATCH_ALGORITHM) {
    throw new Error(`Patch signature algorithm must be ${PATCH_ALGORITHM}`);
  }
  if (typeof signature.keyId !== 'string' || signature.keyId !== key.keyId) {
    throw new Error('Patch signature key is not trusted');
  }

  const jwk = asObject(key.jwk, 'Trusted patch public JWK');
  let publicKey;
  try {
    publicKey = await subtleCrypto().importKey(
      'jwk',
      jwk,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify'],
    );
  } catch {
    throw new Error('Trusted patch public key is invalid');
  }

  let signatureBytes;
  try {
    signatureBytes = base64urlToBytes(signature.value);
  } catch (error) {
    throw new Error(`Patch signature is invalid: ${error.message}`);
  }

  const validSignature = await subtleCrypto().verify(
    { name: 'ECDSA', hash: 'SHA-256' },
    publicKey,
    signatureBytes,
    encoder.encode(canonicalPatchPayload(source)),
  );
  if (!validSignature) throw new Error('Patch signature verification failed');

  return {
    schema: PATCH_SCHEMA,
    baseVersion: source.baseVersion,
    version: source.version,
    files: verifiedFiles,
  };
}
