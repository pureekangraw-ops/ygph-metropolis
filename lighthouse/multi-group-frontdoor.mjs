import { validateMultiGroupPlan } from './multi-group-contract.mjs';
import { FOUNDATION_PATTERN_EXPENSE_TERMS } from './pattern-input.mjs';

const DIRECT_EXPENSE_TERMS = new Set(FOUNDATION_PATTERN_EXPENSE_TERMS);

function freeze(value) {
  return Object.freeze(value);
}

function resolvedSlot(group, role) {
  return group?.slots?.find(slot => slot?.role === role && slot?.state === 'RESOLVED') || null;
}

function commandState(group, status, reason, extras = {}) {
  return freeze({
    groupId:group?.groupId ?? null,
    rawText:group?.rawText ?? '',
    status,
    reason,
    ...extras,
  });
}

function compileIdentity(options) {
  const provided = typeof options?.compileId === 'string' ? options.compileId.trim() : '';
  if (provided) return provided;
  if (typeof options?.requestIdFactory !== 'function') throw new TypeError('MULTI_GROUP_FRONTDOOR_REQUEST_ID_FACTORY_REQUIRED');
  const generated = String(options.requestIdFactory()).trim();
  if (!generated) throw new Error('MULTI_GROUP_FRONTDOOR_REQUEST_ID_REQUIRED');
  return generated;
}

function compileDirectExpenseGroup(group, { baseRevision, compileId }) {
  if (group?.prohibited) return { command:commandState(group, 'BLOCKED', 'PROHIBITED_GROUP'), box:null };
  if (group?.condition) return { command:commandState(group, 'BLOCKED', 'CONDITION_NOT_SUPPORTED'), box:null };
  if (group?.intent !== 'COMMAND') return { command:commandState(group, 'BLOCKED', 'GROUP_INTENT_NOT_EXECUTABLE'), box:null };

  const target = resolvedSlot(group, 'TARGET');
  const money = resolvedSlot(group, 'MONEY');
  const title = typeof target?.resolvedValue === 'string' ? target.resolvedValue.trim() : '';
  const amountSatang = money?.resolvedValue?.amountSatang;

  if (!title || !Number.isSafeInteger(amountSatang) || amountSatang <= 0) {
    return { command:commandState(group, 'WAITING', 'INTENT_REQUIRED_SLOT_UNRESOLVED'), box:null };
  }
  if (!DIRECT_EXPENSE_TERMS.has(title)) {
    return { command:commandState(group, 'BLOCKED', 'NO_CONNECTED_DIRECT_CAPABILITY'), box:null };
  }

  const plan = validateMultiGroupPlan({
    version:'1',
    planId:`FD-${compileId}-${group.groupId}`,
    baseRevision,
    groups:[{
      groupId:group.groupId,
      action:'CREATE',
      object:'EXPENSE',
      fields:{ title, amountSatang },
      references:{},
      dependsOn:[],
      requiredResult:{
        kind:'LEDGER_TRANSACTION',
        effect:{ direction:'OUT', subtype:'EXPENSE', title, amountSatang },
      },
      confirmation:'NOT_REQUIRED',
    }],
  });

  const boxId = `BOX-${compileId}-${group.groupId}`;
  const command = commandState(group, 'READY', null, { boxId });
  const box = freeze({ boxId, relationship:'INDEPENDENT', commandIds:Object.freeze([group.groupId]), plan });
  return { command, box };
}

function overallStatus(commands) {
  const states = new Set(commands.map(command => command.status));
  if (states.size === 1) return commands[0]?.status ?? 'BLOCKED';
  return 'MIXED';
}

export function compileNaturalLanguageMultiGroup(parsed, options = {}) {
  if (!parsed || !Array.isArray(parsed.groups)) throw new TypeError('MULTI_GROUP_FRONTDOOR_PARSED_REQUIRED');
  if (!Number.isSafeInteger(options.baseRevision) || options.baseRevision < 0) throw new TypeError('MULTI_GROUP_FRONTDOOR_BASE_REVISION_REQUIRED');
  const compileId = compileIdentity(options);

  const commands = [];
  const boxes = [];
  for (const group of parsed.groups) {
    const compiled = compileDirectExpenseGroup(group, { baseRevision:options.baseRevision, compileId });
    commands.push(compiled.command);
    if (compiled.box) boxes.push(compiled.box);
  }

  return freeze({
    compileId,
    status:overallStatus(commands),
    boxes:Object.freeze(boxes),
    commands:Object.freeze(commands),
  });
}
