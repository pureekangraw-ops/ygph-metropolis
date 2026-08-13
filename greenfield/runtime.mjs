import { GREENFIELD_SCHEMA } from './core.mjs';
import { DB_NAME, VAULT_FORMAT, readEncryptedState, commitEncryptedState } from './persistence.mjs';
import { openGreenfieldVaultStore } from './browser-store.mjs';
import { initializeGreenfieldFromEvidence } from './cutover.mjs';
import { createCommandRuntime } from './command-runtime.mjs';
import { registerGreenfieldDomainCommands } from './domain-operations.mjs';
import { registerRideDomainCommands, projectRideCredit } from './ride-domain.mjs';
import { executeAtomicWorkflow } from './workflow-runtime.mjs';
import { createMutationCoordinator } from './mutation-coordinator.mjs';
import { projectLedgerBalance, projectCalendarSummary } from './projections.mjs';
import { exportGreenfieldBackup, restoreGreenfieldBackup } from './backup.mjs';
import {
  buildSaleWorkflow,
  buildReceiveCustomerPaymentWorkflow,
  buildObligationWorkflow,
  buildPayObligationWorkflow,
  buildPurchaseWorkflow,
  buildStockWithdrawalWorkflow,
  buildStockAdjustmentWorkflow,
  buildOtherIncomeWorkflow,
  buildExpenseWorkflow,
  buildCalendarStatusWorkflow,
} from './business-workflows.mjs';
import {
  buildRideStartRoundWorkflow,
  buildRideEndRoundWorkflow,
  buildRideJobWorkflow,
  buildRideExpenseWorkflow,
  buildRideWithdrawCreditWorkflow,
} from './ride-workflows.mjs';

function goalDate(value) {
  const date = String(value || '');
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) throw new Error('INVALID_GOAL_DATE');
  const probe = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (probe.getUTCFullYear() !== Number(match[1]) || probe.getUTCMonth() !== Number(match[2]) - 1 || probe.getUTCDate() !== Number(match[3])) throw new Error('INVALID_GOAL_DATE');
  return date;
}

function goalAmount(value) {
  const amount = Number(value);
  if (!Number.isSafeInteger(amount) || amount < 0) throw new Error('INVALID_DAILY_GOAL');
  return amount;
}

export function createGreenfieldRuntime({ store, passphrase, lockManager = globalThis.navigator?.locks ?? null, now = () => new Date().toISOString(), closeStore = null } = {}) {
  if (!store || typeof store.get !== 'function' || typeof store.put !== 'function') throw new TypeError('INVALID_GREENFIELD_STORE');
  if (typeof passphrase !== 'string' || passphrase.length < 12) throw new Error('PASSPHRASE_TOO_SHORT');

  const commandRuntime = createCommandRuntime();
  registerGreenfieldDomainCommands(commandRuntime, { now });
  registerRideDomainCommands(commandRuntime, { now });
  const coordinator = createMutationCoordinator({ lockManager });
  let lastState = null;

  async function readState() {
    lastState = await readEncryptedState({ store, passphrase });
    return lastState;
  }

  async function initializeFromEvidence(evidence, { expectedPackageId, expectedRevision } = {}) {
    return coordinator.run(async () => {
      const result = await initializeGreenfieldFromEvidence({
        store,
        passphrase,
        evidence,
        expectedPackageId,
        expectedRevision,
        now: now(),
      });
      lastState = result.state;
      return result;
    });
  }

  async function executePlan(plan) {
    if (!plan || !Array.isArray(plan.commands) || plan.commands.length === 0) throw new Error('INVALID_WORKFLOW_PLAN');
    return coordinator.run(async () => {
      const result = await executeAtomicWorkflow({ store, passphrase, runtime: commandRuntime, commands: plan.commands });
      lastState = result.state;
      return result;
    });
  }

  async function ensureDailyGoal({ date, suggestedSatang }) {
    const key = goalDate(date);
    const suggested = goalAmount(suggestedSatang);
    return coordinator.run(async () => {
      const current = await readEncryptedState({ store, passphrase });
      if (!current) throw new Error('GREENFIELD_NOT_INITIALIZED');
      const existing = current.meta?.dailyGoals?.[key];
      if (existing) {
        lastState = current;
        return { status:'EXISTING', goal:structuredClone(existing), state:current };
      }
      const at = now();
      const next = structuredClone(current);
      next.meta = next.meta && typeof next.meta === 'object' ? next.meta : {};
      next.meta.dailyGoals = next.meta.dailyGoals && typeof next.meta.dailyGoals === 'object' ? next.meta.dailyGoals : {};
      next.meta.dailyGoals[key] = { date:key, goalSatang:suggested, autoSuggestedSatang:suggested, source:'AUTO', createdAt:at, updatedAt:at };
      next.revision += 1;
      next.updatedAt = at;
      await commitEncryptedState({ store, passphrase, state:next, expectedDurableRevision:current.revision });
      lastState = await readEncryptedState({ store, passphrase });
      return { status:'CREATED', goal:structuredClone(lastState.meta.dailyGoals[key]), state:lastState };
    });
  }

  async function overrideDailyGoal({ date, goalSatang }) {
    const key = goalDate(date);
    const amount = goalAmount(goalSatang);
    return coordinator.run(async () => {
      const current = await readEncryptedState({ store, passphrase });
      if (!current) throw new Error('GREENFIELD_NOT_INITIALIZED');
      const existing = current.meta?.dailyGoals?.[key];
      if (!existing) throw new Error(`DAILY_GOAL_NOT_INITIALIZED:${key}`);
      const at = now();
      const next = structuredClone(current);
      next.meta.dailyGoals[key] = {
        ...existing,
        date:key,
        goalSatang:amount,
        autoSuggestedSatang:Number(existing.autoSuggestedSatang ?? existing.goalSatang ?? 0),
        source:'MANUAL',
        updatedAt:at,
      };
      next.revision += 1;
      next.updatedAt = at;
      await commitEncryptedState({ store, passphrase, state:next, expectedDurableRevision:current.revision });
      lastState = await readEncryptedState({ store, passphrase });
      return { status:'UPDATED', goal:structuredClone(lastState.meta.dailyGoals[key]), state:lastState };
    });
  }

  function project() {
    if (!lastState) throw new Error('GREENFIELD_STATE_NOT_LOADED');
    const rideRecords = Object.values(lastState.domains.RIDE?.records || {}).map(entry => entry?.record).filter(Boolean);
    return {
      revision: lastState.revision,
      ledgerBalanceSatang: projectLedgerBalance(lastState),
      calendar: projectCalendarSummary(lastState),
      ride: {
        pendingCreditSatang: projectRideCredit(lastState.domains.RIDE),
        activeRound: rideRecords.find(record => record.type === 'ROUND' && record.status === 'ACTIVE') ?? null,
      },
    };
  }

  function diagnostics() {
    return {
      architecture: 'GREENFIELD',
      schema: GREENFIELD_SCHEMA,
      database: DB_NAME,
      vault: VAULT_FORMAT,
      coordination: coordinator.status(),
    };
  }

  async function exportBackup(options = {}) {
    return coordinator.run(() => exportGreenfieldBackup({ store, ...options }));
  }

  async function restoreBackup(backup) {
    return coordinator.run(async () => {
      const result = await restoreGreenfieldBackup({ store, backup, passphrase });
      lastState = result.state;
      return result;
    });
  }

  return Object.freeze({
    diagnostics,
    readState,
    initializeFromEvidence,
    project,
    exportBackup,
    restoreBackup,
    ensureDailyGoal,
    overrideDailyGoal,
    sale: input => executePlan(buildSaleWorkflow(input)),
    receiveCustomerPayment: input => executePlan(buildReceiveCustomerPaymentWorkflow(input)),
    obligation: input => executePlan(buildObligationWorkflow(input)),
    payObligation: input => executePlan(buildPayObligationWorkflow(input)),
    purchase: input => executePlan(buildPurchaseWorkflow(input)),
    stockWithdrawal: input => executePlan(buildStockWithdrawalWorkflow(input)),
    stockAdjustment: input => executePlan(buildStockAdjustmentWorkflow(input)),
    otherIncome: input => executePlan(buildOtherIncomeWorkflow(input)),
    expense: input => executePlan(buildExpenseWorkflow(input)),
    calendarStatus: input => executePlan(buildCalendarStatusWorkflow(input)),
    rideStartRound: input => executePlan(buildRideStartRoundWorkflow(input)),
    rideEndRound: input => executePlan(buildRideEndRoundWorkflow(input)),
    rideJob: input => executePlan(buildRideJobWorkflow(input)),
    rideExpense: input => executePlan(buildRideExpenseWorkflow(input)),
    rideWithdrawCredit: input => executePlan(buildRideWithdrawCreditWorkflow(input)),
    close() { if (typeof closeStore === 'function') closeStore(); else store.close?.(); },
  });
}

export async function openGreenfieldRuntime({ passphrase, indexedDBImpl = globalThis.indexedDB, lockManager = globalThis.navigator?.locks ?? null, now } = {}) {
  const store = await openGreenfieldVaultStore({ indexedDBImpl });
  return createGreenfieldRuntime({ store, passphrase, lockManager, now, closeStore: () => store.close() });
}
