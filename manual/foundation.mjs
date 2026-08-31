import { INCOME_CORE } from './cores/income.mjs';
import { OUTCOME_CORE } from './cores/outcome.mjs';
import { LEDGER_CORE } from './cores/ledger.mjs';
import { CALENDAR_CORE } from './cores/calendar.mjs';

export const MANUAL_CORE_IDS = Object.freeze(['INCOME', 'OUTCOME', 'LEDGER', 'CALENDAR']);

const cores = [INCOME_CORE, OUTCOME_CORE, LEDGER_CORE, CALENDAR_CORE];

function assertFoundation() {
  const ids = cores.map(core => core.id);
  if (ids.length !== MANUAL_CORE_IDS.length || new Set(ids).size !== MANUAL_CORE_IDS.length) throw new Error('MANUAL_CORE_SET_INVALID');
  for (let index = 0; index < MANUAL_CORE_IDS.length; index += 1) {
    if (ids[index] !== MANUAL_CORE_IDS[index]) throw new Error(`MANUAL_CORE_ORDER_INVALID:${ids[index] || '?'}/${MANUAL_CORE_IDS[index]}`);
  }
  for (const core of cores) {
    if (core.runtimeRoot !== 'GREENFIELD_RUNTIME') throw new Error(`MANUAL_RUNTIME_ROOT_INVALID:${core.id}`);
    if (core.storageOwner !== 'GREENFIELD_VAULT') throw new Error(`MANUAL_STORAGE_OWNER_INVALID:${core.id}`);
  }
  if (LEDGER_CORE.manualRole !== 'HEAD') throw new Error('MANUAL_LEDGER_HEAD_REQUIRED');
  if (CALENDAR_CORE.truthDomain !== 'CALENDAR') throw new Error('MANUAL_CALENDAR_DOMAIN_INVALID');
  if (INCOME_CORE.truthDomain !== 'LEDGER' || OUTCOME_CORE.truthDomain !== 'LEDGER') throw new Error('MANUAL_MONEY_TRUTH_DOMAIN_INVALID');
}

assertFoundation();

export const MANUAL_CORES = Object.freeze(Object.fromEntries(cores.map(core => [core.id, core])));

export function getManualCore(id) {
  const key = String(id ?? '').trim();
  const core = MANUAL_CORES[key];
  if (!core) throw new Error(`MANUAL_CORE_UNKNOWN:${key}`);
  return core;
}
