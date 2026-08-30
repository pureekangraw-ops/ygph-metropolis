import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createPrivateKey, createPublicKey, webcrypto } from 'node:crypto';
import {
  PATCH_ALLOWED_FILES,
  PATCH_MAX_BYTES,
  PATCH_SCHEMA,
  canonicalPatchPayload,
  verifyPatchBundle,
} from '../www/patch/patch-contract.mjs';

const encoder = new TextEncoder();
const allowedFiles = new Set(PATCH_ALLOWED_FILES);
const PATCH_ALGORITHM = 'ECDSA-P256-SHA256';
const DEFAULT_KEY_ID = 'lighthouse-debug-patch-1';
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u;
const trustedKeyUrl = new URL('../www/patch/trusted-key.json', import.meta.url);

function asObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value;
}

function parseVersion(value, label) {
  if (typeof value !== 'string' || !SEMVER.test(value)) {
    throw new Error(`${label} must be a numeric SemVer triplet`);
  }
  return value.split('.').map(Number);
}

function compareVersion(left, right) {
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return 0;
}

function pemToBytes(pemText) {
  if (typeof pemText !== 'string') throw new Error('Private key PEM is required');
  const body = pemText
    .replace(/-----BEGIN [^-]+-----/gu, '')
    .replace(/-----END [^-]+-----/gu, '')
    .replace(/\s+/gu, '');
  if (!body) throw new Error('Private key PEM is invalid');
  return Buffer.from(body, 'base64');
}

async function sha256Hex(text) {
  const digest = await webcrypto.subtle.digest('SHA-256', encoder.encode(text));
  return Buffer.from(digest).toString('hex');
}

function base64url(bytes) {
  return Buffer.from(bytes)
    .toString('base64')
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/u, '');
}

export async function assertPrivateKeyMatchesTrustedKey({ privateKeyPem, trustedKey }) {
  const trust = asObject(trustedKey, 'Trusted patch key');
  const jwk = asObject(trust.jwk, 'Trusted public JWK');
  if (trust.alg !== PATCH_ALGORITHM) throw new Error(`Trusted patch key algorithm must be ${PATCH_ALGORITHM}`);
  if (typeof trust.keyId !== 'string' || trust.keyId.length === 0) throw new Error('Trusted patch keyId is required');
  if (jwk.kty !== 'EC' || jwk.crv !== 'P-256' || !jwk.x || !jwk.y) {
    throw new Error('Trusted public JWK must be an EC P-256 public key');
  }

  let derivedJwk;
  try {
    const privateKey = createPrivateKey(privateKeyPem);
    const publicKey = createPublicKey(privateKey);
    derivedJwk = publicKey.export({ format: 'jwk' });
  } catch {
    throw new Error('Private patch signing key is invalid');
  }

  const matches = derivedJwk.kty === jwk.kty
    && derivedJwk.crv === jwk.crv
    && derivedJwk.x === jwk.x
    && derivedJwk.y === jwk.y;
  if (!matches) {
    throw new Error(`Private patch signing key does not match trusted public key ${trust.keyId}`);
  }
  return true;
}

export async function signPatchSource({ source, privateKeyPem, keyId = DEFAULT_KEY_ID }) {
  const input = asObject(source, 'Patch signing source');
  const files = asObject(input.files, 'Patch signing files');
  const base = parseVersion(input.baseVersion, 'Patch baseVersion');
  const target = parseVersion(input.version, 'Patch version');
  if (compareVersion(target, base) <= 0) {
    throw new Error('Patch version must be greater than baseVersion');
  }
  if (typeof keyId !== 'string' || keyId.length === 0) throw new Error('Patch keyId is required');

  const paths = Object.keys(files);
  if (paths.length === 0) throw new Error('Patch must include at least one changed file');

  let totalBytes = 0;
  const entries = {};
  for (const path of paths) {
    if (!allowedFiles.has(path)) throw new Error(`Unsupported patch asset path: ${path}`);
    const content = files[path];
    if (typeof content !== 'string') throw new Error(`Patch file ${path} must be UTF-8 text`);
    totalBytes += encoder.encode(content).byteLength;
    if (totalBytes > PATCH_MAX_BYTES) throw new Error('Patch content is too large');
    entries[path] = {
      sha256: await sha256Hex(content),
      content,
    };
  }

  const bundle = {
    schema: PATCH_SCHEMA,
    baseVersion: input.baseVersion,
    version: input.version,
    files: entries,
    signature: {
      alg: PATCH_ALGORITHM,
      keyId,
      value: '',
    },
  };

  let privateKey;
  try {
    privateKey = await webcrypto.subtle.importKey(
      'pkcs8',
      pemToBytes(privateKeyPem),
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['sign'],
    );
  } catch {
    throw new Error('Private patch signing key is invalid');
  }

  const signature = await webcrypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    privateKey,
    encoder.encode(canonicalPatchPayload(bundle)),
  );
  bundle.signature.value = base64url(signature);
  return bundle;
}

async function main(argv) {
  const [inputPath, privateKeyPath, outputPath] = argv;
  if (!inputPath || !privateKeyPath || !outputPath) {
    throw new Error('Usage: npm run patch:sign -- <input-json> <private-key.pem> <output.lhpatch>');
  }

  const [sourceText, privateKeyPem, trustedKeyText] = await Promise.all([
    readFile(inputPath, 'utf8'),
    readFile(privateKeyPath, 'utf8'),
    readFile(trustedKeyUrl, 'utf8'),
  ]);
  const source = JSON.parse(sourceText);
  const trustedKey = JSON.parse(trustedKeyText);

  await assertPrivateKeyMatchesTrustedKey({ privateKeyPem, trustedKey });
  const bundle = await signPatchSource({
    source,
    privateKeyPem,
    keyId: trustedKey.keyId,
  });
  await verifyPatchBundle(bundle, {
    currentVersion: source.baseVersion,
    trustedKey,
  });
  await writeFile(outputPath, `${JSON.stringify(bundle, null, 2)}\n`, 'utf8');
}

const entryUrl = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (entryUrl === import.meta.url) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
