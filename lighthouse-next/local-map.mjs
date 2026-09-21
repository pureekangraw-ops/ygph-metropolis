const LOCAL_MAP_FORMAT = 'PMTILES';
const LOCAL_MAP_TYPE = 'LOCAL_PMTILES_VECTOR_BASEMAP';
const LOCAL_STORAGE_PROTOCOLS = new Set(['file:', 'content:']);
const PACKAGE_STATES = new Set(['STAGED', 'ACTIVE', 'RECOVERY_REQUIRED']);

function text(value, code) {
  const output = String(value ?? '').trim();
  if (!output) throw new Error(code);
  return output;
}

function positiveInteger(value, code) {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(code);
  return value;
}

function packageId(value) {
  const id = text(value, 'LOCAL_MAP_PACKAGE_ID_REQUIRED');
  if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) throw new Error(`LOCAL_MAP_PACKAGE_ID_INVALID:${id}`);
  return id;
}

function packageFileName(value) {
  const fileName = text(value, 'LOCAL_MAP_FILE_NAME_REQUIRED');
  if (fileName.includes('/') || fileName.includes('\\')) throw new Error('LOCAL_MAP_FILE_NAME_MUST_BE_BASENAME');
  if (!/^[^/\\]+\.pmtiles$/i.test(fileName)) throw new Error('LOCAL_MAP_FILE_EXTENSION_INVALID');
  return fileName;
}

export function assertLocalMapUri(value) {
  const uri = text(value, 'LOCAL_MAP_URI_REQUIRED');
  let parsed;
  try {
    parsed = new URL(uri);
  } catch {
    throw new Error('LOCAL_MAP_URI_INVALID');
  }
  if (!LOCAL_STORAGE_PROTOCOLS.has(parsed.protocol)) {
    throw new Error(`LOCAL_MAP_URI_NOT_DEVICE_STORAGE:${parsed.protocol || 'UNKNOWN'}`);
  }
  if (!parsed.pathname || parsed.pathname === '/') throw new Error('LOCAL_MAP_URI_PATH_REQUIRED');
  return uri;
}

export function normalizeMapPackageMetadata(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('LOCAL_MAP_METADATA_REQUIRED');
  const format = text(input.format, 'LOCAL_MAP_FORMAT_REQUIRED').toUpperCase();
  if (format !== LOCAL_MAP_FORMAT) throw new Error(`LOCAL_MAP_FORMAT_UNSUPPORTED:${format}`);
  const sha256 = text(input.sha256, 'LOCAL_MAP_SHA256_REQUIRED').toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(sha256)) throw new Error('LOCAL_MAP_SHA256_INVALID');
  const region = text(input.region, 'LOCAL_MAP_REGION_REQUIRED');
  const version = text(input.version, 'LOCAL_MAP_VERSION_REQUIRED');
  return Object.freeze({
    id: packageId(input.id),
    format,
    region,
    version,
    fileName: packageFileName(input.fileName),
    byteLength: positiveInteger(input.byteLength, 'LOCAL_MAP_BYTE_LENGTH_INVALID'),
    sha256,
    attribution: text(input.attribution, 'LOCAL_MAP_ATTRIBUTION_REQUIRED'),
  });
}

export function createLocalPmtilesSource({ uri, metadata }) {
  const sourceUri = assertLocalMapUri(uri);
  const packageMetadata = normalizeMapPackageMetadata(metadata);
  return Object.freeze({
    type: LOCAL_MAP_TYPE,
    uri: sourceUri,
    metadata: packageMetadata,
    offlineOnly: true,
    networkAllowed: false,
  });
}

export function createLocalMapPackageRecord({ uri, metadata, state = 'STAGED', now = () => new Date().toISOString() }) {
  if (!PACKAGE_STATES.has(state)) throw new Error(`LOCAL_MAP_PACKAGE_STATE_INVALID:${state}`);
  const source = createLocalPmtilesSource({ uri, metadata });
  const timestamp = text(now(), 'LOCAL_MAP_TIMESTAMP_REQUIRED');
  return Object.freeze({
    ...source,
    state,
    stagedAt: timestamp,
    activatedAt: state === 'ACTIVE' ? timestamp : null,
  });
}

export function describeLocalMapRecovery(reason = 'แผนที่ออฟไลน์ใช้ไม่ได้ ต้องเลือกหรือนำเข้าแพ็กเกจใหม่') {
  return Object.freeze({
    state: 'RECOVERY_REQUIRED',
    reason: text(reason, 'LOCAL_MAP_RECOVERY_REASON_REQUIRED'),
    networkAllowed: false,
  });
}

export const LOCAL_MAP_CONTRACT = Object.freeze({
  format: LOCAL_MAP_FORMAT,
  type: LOCAL_MAP_TYPE,
  storageProtocols: Object.freeze([...LOCAL_STORAGE_PROTOCOLS]),
  packageStates: Object.freeze([...PACKAGE_STATES]),
  backgroundLocation: false,
  networkFallback: false,
});
