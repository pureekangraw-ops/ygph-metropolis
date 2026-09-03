export const GREENFIELD_SCHEMA = 2;
export const GREENFIELD_DOMAINS = Object.freeze(['STORE', 'LEDGER', 'CALENDAR', 'RIDE']);
const LEGACY_GREENFIELD_SCHEMA = 1;
const LEGACY_GREENFIELD_DOMAINS = Object.freeze(['STORE', 'LEDGER', 'CALENDAR']);

export function canonicalStringify(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function createGreenfieldState({ now = new Date().toISOString() } = {}) {
  return {
    schema: GREENFIELD_SCHEMA,
    revision: 1,
    createdAt: now,
    updatedAt: now,
    meta: { architecture: 'GREENFIELD', importedFrom: null },
    domains: {
      STORE: { records: {} },
      LEDGER: { records: {} },
      CALENDAR: { records: {} },
      RIDE: { records: {} },
    },
    commandLog: {},
    importReport: null,
  };
}

function legacyShapeErrors(state) {
  const errors = [];
  if (!state || typeof state !== 'object' || Array.isArray(state)) return ['INVALID_STATE'];
  if (state.schema !== LEGACY_GREENFIELD_SCHEMA) errors.push(`INVALID_SCHEMA:${state.schema}`);
  if (!Number.isSafeInteger(state.revision) || state.revision < 1) errors.push('INVALID_REVISION');
  if (!state.domains || typeof state.domains !== 'object' || Array.isArray(state.domains)) errors.push('INVALID_DOMAINS');
  const domains = state.domains && typeof state.domains === 'object' ? Object.keys(state.domains) : [];
  for (const domain of domains) if (!LEGACY_GREENFIELD_DOMAINS.includes(domain)) errors.push(`UNEXPECTED_DOMAIN:${domain}`);
  for (const domain of LEGACY_GREENFIELD_DOMAINS) {
    const records = state.domains?.[domain]?.records;
    if (!records || typeof records !== 'object' || Array.isArray(records)) errors.push(`INVALID_DOMAIN_RECORDS:${domain}`);
  }
  if (!state.commandLog || typeof state.commandLog !== 'object' || Array.isArray(state.commandLog)) errors.push('INVALID_COMMAND_LOG');
  return errors;
}

export function migrateGreenfieldState(state) {
  if (state?.schema === GREENFIELD_SCHEMA) return assertGreenfieldState(structuredClone(state));
  const errors = legacyShapeErrors(state);
  if (errors.length) throw new Error(errors.join('\n'));
  const next = structuredClone(state);
  next.schema = GREENFIELD_SCHEMA;
  next.domains.RIDE = { records: {} };
  return assertGreenfieldState(next);
}

export function validateGreenfieldState(state) {
  const errors = [];
  if (!state || typeof state !== 'object' || Array.isArray(state)) return { ok: false, errors: ['INVALID_STATE'] };
  if (state.schema !== GREENFIELD_SCHEMA) errors.push(`INVALID_SCHEMA:${state.schema}`);
  if (!Number.isSafeInteger(state.revision) || state.revision < 1) errors.push('INVALID_REVISION');
  if (!state.domains || typeof state.domains !== 'object' || Array.isArray(state.domains)) errors.push('INVALID_DOMAINS');
  const domains = state.domains && typeof state.domains === 'object' ? Object.keys(state.domains) : [];
  for (const domain of domains) if (!GREENFIELD_DOMAINS.includes(domain)) errors.push(`UNEXPECTED_DOMAIN:${domain}`);
  for (const domain of GREENFIELD_DOMAINS) {
    const records = state.domains?.[domain]?.records;
    if (!records || typeof records !== 'object' || Array.isArray(records)) errors.push(`INVALID_DOMAIN_RECORDS:${domain}`);
  }
  if (!state.commandLog || typeof state.commandLog !== 'object' || Array.isArray(state.commandLog)) errors.push('INVALID_COMMAND_LOG');
  return { ok: errors.length === 0, errors };
}

export function assertGreenfieldState(state) {
  const result = validateGreenfieldState(state);
  if (!result.ok) throw new Error(result.errors.join('\n'));
  return state;
}
