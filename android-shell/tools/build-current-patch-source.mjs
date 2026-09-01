import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = new URL('../', import.meta.url);
const contractUrl = new URL('release/current-patch.json', root);
const CANONICAL_PATCH_FILES = Object.freeze([
  'app/ui.html',
  'app/ui.css',
  'app/logic.mjs',
  'app/rules.json',
  'app/vocabulary.json',
]);

function parseVersion(value) {
  if (typeof value !== 'string' || !/^\d+\.\d+\.\d+$/.test(value)) throw new Error('CURRENT_PATCH_VERSION_INVALID');
  return value.split('.').map(Number);
}

function compareVersion(left, right) {
  const a = parseVersion(left);
  const b = parseVersion(right);
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return 0;
}

export function validateCurrentPatchContract(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('CURRENT_PATCH_CONTRACT_INVALID');
  const version = input.version;
  const primaryBaseVersion = input.primaryBaseVersion;
  const bootstrapBaseVersion = input.bootstrapBaseVersion;
  const releaseDirectory = input.releaseDirectory;
  parseVersion(version);
  parseVersion(primaryBaseVersion);
  parseVersion(bootstrapBaseVersion);
  if (compareVersion(version, primaryBaseVersion) <= 0) throw new Error('CURRENT_PATCH_PRIMARY_VERSION_NOT_MONOTONIC');
  if (compareVersion(version, bootstrapBaseVersion) <= 0) throw new Error('CURRENT_PATCH_BOOTSTRAP_VERSION_NOT_MONOTONIC');
  if (releaseDirectory !== `release/front-door-${version}`) throw new Error('CURRENT_PATCH_RELEASE_DIRECTORY_INVALID');
  if (releaseDirectory.includes('..') || releaseDirectory.startsWith('/') || releaseDirectory.includes('\\')) throw new Error('CURRENT_PATCH_RELEASE_DIRECTORY_INVALID');
  return { version, primaryBaseVersion, bootstrapBaseVersion, releaseDirectory };
}

export async function loadCurrentPatchContract() {
  const parsed = JSON.parse(await readFile(contractUrl, 'utf8'));
  return validateCurrentPatchContract(parsed);
}

async function readCanonicalAppBundle() {
  const entries = await Promise.all(CANONICAL_PATCH_FILES.map(async path => [path, await readFile(new URL(`www/${path}`, root), 'utf8')]));
  return Object.fromEntries(entries);
}

export async function buildCurrentPatchSources() {
  const contract = await loadCurrentPatchContract();
  const files = await readCanonicalAppBundle();
  return {
    contract,
    primary: {
      baseVersion: contract.primaryBaseVersion,
      version: contract.version,
      files: { ...files },
    },
    bootstrap: {
      baseVersion: contract.bootstrapBaseVersion,
      version: contract.version,
      files: { ...files },
    },
  };
}

async function main(argv) {
  const [primaryOutputPath, bootstrapOutputPath] = argv;
  if (!primaryOutputPath || !bootstrapOutputPath) {
    throw new Error('Usage: node tools/build-current-patch-source.mjs <primary-output-json> <bootstrap-output-json>');
  }
  const { primary, bootstrap } = await buildCurrentPatchSources();
  await mkdir(dirname(primaryOutputPath), { recursive: true });
  await mkdir(dirname(bootstrapOutputPath), { recursive: true });
  await writeFile(primaryOutputPath, `${JSON.stringify(primary, null, 2)}\n`, 'utf8');
  await writeFile(bootstrapOutputPath, `${JSON.stringify(bootstrap, null, 2)}\n`, 'utf8');
}

const entryUrl = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (entryUrl === import.meta.url) {
  main(process.argv.slice(2)).catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
