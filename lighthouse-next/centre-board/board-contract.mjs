export const CENTRE_BOARD_SCHEMA_VERSION = 1;
export const CENTRE_BOARD_PIN_STATUSES = Object.freeze([
  'OPEN',
  'DOING',
  'VERIFY',
  'ARCHIVED',
  'REOPENED',
  'PENDING_RECOVERY',
]);

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const STATUS_SET = new Set(CENTRE_BOARD_PIN_STATUSES);

function clone(value) {
  return value == null ? value : structuredClone(value);
}

function deepFreeze(value, seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const nested of Object.values(value)) deepFreeze(nested, seen);
  return Object.freeze(value);
}

function identifier(value, requiredCode, invalidCode = requiredCode) {
  const output = String(value ?? '').trim();
  if (!output) throw new Error(requiredCode);
  if (!IDENTIFIER.test(output)) throw new Error(invalidCode);
  return output;
}

function optionalIdentifier(value, code) {
  if (value == null || String(value).trim() === '') return null;
  return identifier(value, code, code);
}

function requiredText(value, code) {
  const output = String(value ?? '').trim();
  if (!output) throw new Error(code);
  return output;
}

function stringArray(value, code) {
  if (value == null) return [];
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string' || !item.trim())) {
    throw new Error(code);
  }
  return [...new Set(value.map(item => item.trim()))];
}

function objectArray(value, code) {
  if (value == null) return [];
  if (!Array.isArray(value) || value.some(item => !item || typeof item !== 'object' || Array.isArray(item))) {
    throw new Error(code);
  }
  return clone(value);
}

function positiveRevision(value, code) {
  const output = Number(value ?? 1);
  if (!Number.isSafeInteger(output) || output < 1) throw new Error(code);
  return output;
}

export function createCentrePin(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('CENTRE_BOARD_PIN_INVALID');
  }
  const pinId = identifier(input.pinId, 'CENTRE_BOARD_PIN_ID_REQUIRED', 'CENTRE_BOARD_PIN_ID_INVALID');
  const workId = identifier(input.workId, 'CENTRE_BOARD_WORK_ID_REQUIRED', 'CENTRE_BOARD_WORK_ID_INVALID');
  const status = String(input.status ?? 'OPEN').trim();
  if (!STATUS_SET.has(status)) throw new Error('CENTRE_BOARD_PIN_STATUS_INVALID');
  const title = requiredText(input.title, 'CENTRE_BOARD_PIN_TITLE_REQUIRED');
  const at = requiredText(input.at ?? input.updatedAt ?? input.createdAt, 'CENTRE_BOARD_AT_REQUIRED');
  const ownerEmployeeId = optionalIdentifier(
    input.ownerEmployeeId,
    'CENTRE_BOARD_EMPLOYEE_ID_INVALID',
  );
  const touchedBy = stringArray(input.touchedBy, 'CENTRE_BOARD_TOUCHED_BY_INVALID');
  if (ownerEmployeeId && !touchedBy.includes(ownerEmployeeId)) touchedBy.push(ownerEmployeeId);

  return deepFreeze({
    pinId,
    workId,
    title,
    detail:String(input.detail ?? '').trim(),
    status,
    ownerEmployeeId,
    touchedBy,
    result:input.result == null ? null : String(input.result).trim(),
    nextAction:input.nextAction == null ? null : String(input.nextAction).trim(),
    evidence:objectArray(input.evidence, 'CENTRE_BOARD_EVIDENCE_INVALID'),
    links:objectArray(input.links, 'CENTRE_BOARD_LINKS_INVALID'),
    revision:positiveRevision(input.revision, 'CENTRE_BOARD_PIN_REVISION_INVALID'),
    createdAt:String(input.createdAt ?? at),
    updatedAt:String(input.updatedAt ?? at),
  });
}

export function createCentreBoard(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('CENTRE_BOARD_INVALID');
  }
  const boardId = identifier(input.boardId, 'CENTRE_BOARD_BOARD_ID_REQUIRED', 'CENTRE_BOARD_BOARD_ID_INVALID');
  const workId = identifier(input.workId, 'CENTRE_BOARD_WORK_ID_REQUIRED', 'CENTRE_BOARD_WORK_ID_INVALID');
  const at = requiredText(input.at ?? input.updatedAt, 'CENTRE_BOARD_AT_REQUIRED');
  if (input.pins != null && !Array.isArray(input.pins)) throw new Error('CENTRE_BOARD_PINS_INVALID');
  const pins = (input.pins || []).map(pin => {
    const normalized = createCentrePin(pin);
    if (normalized.workId !== workId) throw new Error('CENTRE_BOARD_PIN_WORK_ID_MISMATCH');
    return normalized;
  });
  if (new Set(pins.map(pin => pin.pinId)).size !== pins.length) {
    throw new Error('CENTRE_BOARD_PIN_ID_CONFLICT');
  }
  const audit = objectArray(input.audit, 'CENTRE_BOARD_AUDIT_INVALID');

  return deepFreeze({
    schemaVersion:CENTRE_BOARD_SCHEMA_VERSION,
    boardId,
    workId,
    revision:positiveRevision(input.revision, 'CENTRE_BOARD_REVISION_INVALID'),
    updatedAt:String(input.updatedAt ?? at),
    pins,
    audit,
  });
}

export function assertEmployeeIdAvailable(board, employeeId) {
  const id = identifier(
    employeeId,
    'CENTRE_BOARD_EMPLOYEE_ID_REQUIRED',
    'CENTRE_BOARD_EMPLOYEE_ID_INVALID',
  );
  const normalized = createCentreBoard({
    ...clone(board),
    at:board?.updatedAt,
  });
  const conflict = normalized.pins.some(pin =>
    pin.status !== 'ARCHIVED'
    && (pin.ownerEmployeeId === id || pin.touchedBy.includes(id)),
  );
  if (conflict) throw new Error(`CENTRE_BOARD_EMPLOYEE_ID_CONFLICT:${id}`);
  return id;
}
