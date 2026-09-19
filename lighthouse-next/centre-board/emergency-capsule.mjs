import { returnCentreBoard } from './board-session.mjs';

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const SECRET_KEY = /(pin|password|recovery|vault|secret|token|passphrase)/i;

function deepFreeze(value, seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const nested of Object.values(value)) deepFreeze(nested, seen);
  return Object.freeze(value);
}

function id(value, requiredCode, invalidCode = requiredCode) {
  const output = String(value ?? '').trim();
  if (!output) throw new Error(requiredCode);
  if (!IDENTIFIER.test(output)) throw new Error(invalidCode);
  return output;
}

function requiredText(value, code) {
  const output = String(value ?? '').trim();
  if (!output) throw new Error(code);
  return output;
}

function positiveRevision(value) {
  const output = Number(value);
  if (!Number.isSafeInteger(output) || output < 1) {
    throw new Error('CENTRE_BOARD_REVISION_INVALID');
  }
  return output;
}

function objectArray(value, code, { nonEmpty = false } = {}) {
  if (!Array.isArray(value) || (nonEmpty && value.length === 0)) throw new Error(code);
  if (value.some(item => !item || typeof item !== 'object' || Array.isArray(item))) throw new Error(code);
  return structuredClone(value);
}

function stringArray(value, code, { nonEmpty = false } = {}) {
  if (!Array.isArray(value) || (nonEmpty && value.length === 0)) throw new Error(code);
  const output = value.map(item => id(item, code, code));
  if (new Set(output).size !== output.length) throw new Error(code);
  return output;
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function containsSecret(value, seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return false;
  seen.add(value);
  return Object.entries(value).some(([key, nested]) =>
    SECRET_KEY.test(key) || containsSecret(nested, seen),
  );
}

function recoveryReceipt(returnReceipt, capsule) {
  return deepFreeze({
    ...returnReceipt,
    type:'RECOVERY',
    capsuleId:capsule.capsuleId,
    fingerprint:capsule.fingerprint,
  });
}

export function createEmergencyCapsule(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('CENTRE_BOARD_EMERGENCY_CAPSULE_INVALID');
  }
  const payload = {
    capsuleId:id(input.capsuleId, 'CENTRE_BOARD_CAPSULE_ID_REQUIRED', 'CENTRE_BOARD_CAPSULE_ID_INVALID'),
    workId:id(input.workId, 'CENTRE_BOARD_WORK_ID_REQUIRED', 'CENTRE_BOARD_WORK_ID_INVALID'),
    employeeId:id(input.employeeId, 'CENTRE_BOARD_EMPLOYEE_ID_REQUIRED', 'CENTRE_BOARD_EMPLOYEE_ID_INVALID'),
    reason:requiredText(input.reason, 'CENTRE_BOARD_EMERGENCY_REASON_REQUIRED'),
    baseBoardRevision:positiveRevision(input.baseBoardRevision),
    claimedPinIds:stringArray(input.claimedPinIds, 'CENTRE_BOARD_PIN_IDS_REQUIRED', { nonEmpty:true }),
    pendingChanges:objectArray(input.pendingChanges, 'CENTRE_BOARD_RETURN_UPDATES_REQUIRED', { nonEmpty:true }),
    evidence:objectArray(input.evidence, 'CENTRE_BOARD_EVIDENCE_INVALID'),
    at:requiredText(input.at, 'CENTRE_BOARD_AT_REQUIRED'),
  };
  if (containsSecret(payload)) throw new Error('CENTRE_BOARD_EMERGENCY_SECRET_FORBIDDEN');
  const fingerprint = `canonical-v1:${canonical(payload)}`;
  return deepFreeze({
    ...payload,
    status:'PENDING_RECOVERY',
    fingerprint,
  });
}

export function recoverEmergencyCapsule(board, capsuleValue, {
  receiptId:receiptValue,
  at:atValue,
} = {}) {
  const capsule = createEmergencyCapsule(capsuleValue);
  const receiptId = id(receiptValue, 'CENTRE_BOARD_RECEIPT_ID_REQUIRED', 'CENTRE_BOARD_RECEIPT_ID_INVALID');
  const at = requiredText(atValue, 'CENTRE_BOARD_AT_REQUIRED');

  const previous = Array.isArray(board?.audit)
    ? board.audit.find(event => event?.receiptId === receiptId)
    : null;
  if (!previous && board?.revision !== capsule.baseBoardRevision) {
    return deepFreeze({
      status:'CONFLICT',
      reason:'CENTRE_BOARD_RECOVERY_CONFLICT',
      board,
      capsule,
    });
  }

  try {
    const returned = returnCentreBoard(board, {
      receiptId,
      workId:capsule.workId,
      employeeId:capsule.employeeId,
      expectedRevision:capsule.baseBoardRevision,
      updates:capsule.pendingChanges,
      at,
    });
    return deepFreeze({
      status:'RECOVERED',
      board:returned.board,
      capsule,
      receipt:recoveryReceipt(returned.receipt, capsule),
    });
  } catch (error) {
    if (String(error?.message || error).startsWith('CENTRE_BOARD_REVISION_CONFLICT:')) {
      return deepFreeze({
        status:'CONFLICT',
        reason:'CENTRE_BOARD_RECOVERY_CONFLICT',
        board,
        capsule,
      });
    }
    throw error;
  }
}
