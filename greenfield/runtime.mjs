import { GREENFIELD_SCHEMA } from './core.mjs';
import { DB_NAME, VAULT_FORMAT, readEncryptedState, commitEncryptedState } from './persistence.mjs';
import { openGreenfieldVaultStore } from './browser-store.mjs';
import { inspectDeviceUnlock, enrollDeviceUnlock, unlockVaultPassphrase } from './device-unlock.mjs';
import { initializeGreenfieldFromEvidence } from './cutover.mjs';
import { createCommandRuntime } from './command-runtime.mjs';
import { registerGreenfieldDomainCommands } from './domain-operations.mjs';
import { registerRideDomainCommands, projectRideState } from './ride-domain.mjs';
import { executeAtomicWorkflow } from './workflow-runtime.mjs';
import { createMutationCoordinator } from './mutation-coordinator.mjs';
import { projectLedgerBalance, projectCalendarSummary } from './projections.mjs';
import { exportGreenfieldBackup, restoreGreenfieldBackup, restorePortableGreenfieldBackup } from './backup.mjs';
import { buildCalendarActionIntent } from './action-contract.mjs';
import { applyDailyLifecycle, millisecondsUntilNextBangkokMidnight } from './daily-lifecycle.mjs';
import {
  buildSaleWorkflow,
  buildReceiveCustomerPaymentWorkflow,
  buildObligationWorkflow,
  buildPayObligationWorkflow,
  buildPurchaseWorkflow,
  buildStockWithdrawalWorkflow,
  buildStockAdjustmentWorkflow,
  buildBalanceAdjustmentWorkflow,
  buildOtherIncomeWorkflow,
  buildExpenseWorkflow,
  buildCalendarRescheduleWorkflow,
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
  let dailyLifecycleTimer = null;

  function clearDailyLifecycleBoundary() {
    if (dailyLifecycleTimer != null && typeof globalThis.clearTimeout === 'function') globalThis.clearTimeout(dailyLifecycleTimer);
    dailyLifecycleTimer = null;
  }

  function scheduleDailyLifecycleBoundary() {
    if (typeof globalThis.window === 'undefined' || typeof globalThis.setTimeout !== 'function') return;
    clearDailyLifecycleBoundary();
    const delay = millisecondsUntilNextBangkokMidnight(now());
    dailyLifecycleTimer = globalThis.setTimeout(async () => {
      dailyLifecycleTimer = null;
      try {
        const result = await syncDailyLifecycle();
        if (result.state && typeof globalThis.dispatchEvent === 'function') {
          const detail = { activeDay:result.activeDay, closedDays:result.closedDays, status:result.status };
          const event = typeof globalThis.CustomEvent === 'function'
            ? new globalThis.CustomEvent('ygph:daily-lifecycle', { detail })
            : new globalThis.Event('ygph:daily-lifecycle');
          globalThis.dispatchEvent(event);
        }
      } catch (error) {
        globalThis.console?.error?.('DAILY_LIFECYCLE_SYNC_FAILED', error);
      } finally {
        scheduleDailyLifecycleBoundary();
      }
    }, Math.max(1, delay + 25));
  }

  async function syncDailyLifecycle() {
    return coordinator.run(async () => {
      const current = await readEncryptedState({ store, passphrase });
      if (!current) {
        lastState = null;
        clearDailyLifecycleBoundary();
        return { status:'EMPTY', state:null, closedDays:[], activeDay:null };
      }
      const at = now();
      const lifecycle = applyDailyLifecycle(current, { now:at });
      if (!lifecycle.changed) {
        lastState = current;
        scheduleDailyLifecycleBoundary();
        return { status:'UNCHANGED', state:current, closedDays:[], activeDay:lifecycle.activeDay };
      }
      const next = lifecycle.state;
      next.revision = current.revision + 1;
      next.updatedAt = at;
      await commitEncryptedState({ store, passphrase, state:next, expectedDurableRevision:current.revision });
      lastState = await readEncryptedState({ store, passphrase });
      const readback = lastState?.meta?.dailyLifecycle;
      if (!readback || readback.activeDay !== lifecycle.activeDay) throw new Error('DAILY_LIFECYCLE_READBACK_MISMATCH');
      scheduleDailyLifecycleBoundary();
      return { status:'UPDATED', state:lastState, closedDays:lifecycle.closedDays, activeDay:lifecycle.activeDay };
    });
  }

  async function readState() {
    lastState = await readEncryptedState({ store, passphrase });
    return lastState;
  }

  async function initializeFromEvidence(evidence, { expectedPackageId, expectedRevision } = {}) {
    return coordinator.run(async () => {
      const result = await initializeGreenfieldFromEvidence({ store, passphrase, evidence, expectedPackageId, expectedRevision, now: now() });
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

  async function executeResolvedCalendarPayment(input, expectedMethod) {
    return coordinator.run(async () => {
      const current = await readEncryptedState({ store, passphrase });
      if (!current) throw new Error('GREENFIELD_NOT_INITIALIZED');
      const queueId = String(input?.queueId || '');
      const queue = current?.domains?.CALENDAR?.records?.[queueId]?.record;
      if (!queue) throw new Error(`WORKFLOW_QUEUE_NOT_FOUND:${queueId}`);
      const intent = buildCalendarActionIntent(current, queue, input?.amountSatang, { workflowId:input?.workflowId, transactionId:input?.ledgerTransactionId });
      if (intent.method !== expectedMethod) throw new Error(`CALENDAR_ACTION_METHOD_MISMATCH:${expectedMethod}/${intent.method}`);
      const plan = intent.method === 'payObligation' ? buildPayObligationWorkflow(intent.input) : buildReceiveCustomerPaymentWorkflow(intent.input);
      const result = await executeAtomicWorkflow({ store, passphrase, runtime:commandRuntime, commands:plan.commands });
      lastState = result.state;
      return result;
    });
  }

  async function adjustBalance({ workflowId, ledgerTransactionId, targetBalanceSatang, reason = 'ปรับให้ตรงกับเงินจริง' } = {}) {
    return coordinator.run(async () => {
      const current = await readEncryptedState({ store, passphrase });
      if (!current) throw new Error('GREENFIELD_NOT_INITIALIZED');
      const currentBalanceSatang = projectLedgerBalance(current);
      const target = Number(targetBalanceSatang);
      if (!Number.isSafeInteger(target) || target < 0) throw new Error('INVALID_TARGET_BALANCE');
      if (currentBalanceSatang === target) {
        lastState = current;
        return { status:'UNCHANGED', previousBalanceSatang:currentBalanceSatang, balanceSatang:target, state:current };
      }
      const plan = buildBalanceAdjustmentWorkflow({ workflowId, ledgerTransactionId, currentBalanceSatang, targetBalanceSatang:target, reason });
      const result = await executeAtomicWorkflow({ store, passphrase, runtime:commandRuntime, commands:plan.commands });
      lastState = result.state;
      const balanceSatang = projectLedgerBalance(lastState);
      if (balanceSatang !== target) throw new Error(`BALANCE_ADJUSTMENT_READBACK_MISMATCH:${balanceSatang}/${target}`);
      return { ...result, status:'ADJUSTED', previousBalanceSatang:currentBalanceSatang, balanceSatang };
    });
  }

  async function ensureDailyGoal({ date, suggestedSatang }) {
    const key = goalDate(date);
    const suggested = goalAmount(suggestedSatang);
    return coordinator.run(async () => {
      const current = await readEncryptedState({ store, passphrase });
      if (!current) throw new Error('GREENFIELD_NOT_INITIALIZED');
      const existing = current.meta?.dailyGoals?.[key];
      if (existing) { lastState = current; return { status:'EXISTING', goal:structuredClone(existing), state:current }; }
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
      next.meta.dailyGoals[key] = { ...existing, date:key, goalSatang:amount, autoSuggestedSatang:Number(existing.autoSuggestedSatang ?? existing.goalSatang ?? 0), source:'MANUAL', updatedAt:at };
      next.revision += 1;
      next.updatedAt = at;
      await commitEncryptedState({ store, passphrase, state:next, expectedDurableRevision:current.revision });
      lastState = await readEncryptedState({ store, passphrase });
      return { status:'UPDATED', goal:structuredClone(lastState.meta.dailyGoals[key]), state:lastState };
    });
  }

  async function changeDevicePassword({ nextPassword } = {}) {
    return coordinator.run(async () => {
      await enrollDeviceUnlock({ store, vaultPassphrase:passphrase, pin:nextPassword });
      const readback = await unlockVaultPassphrase({ store, pin:nextPassword });
      if (readback !== passphrase) throw new Error('DEVICE_UNLOCK_READBACK_MISMATCH');
      return { status:'RESET' };
    });
  }

  function project() {
    if (!lastState) throw new Error('GREENFIELD_STATE_NOT_LOADED');
    return { revision:lastState.revision, ledgerBalanceSatang:projectLedgerBalance(lastState), calendar:projectCalendarSummary(lastState), ride:projectRideState(lastState, now()) };
  }

  function diagnostics() {
    return { architecture:'GREENFIELD', schema:GREENFIELD_SCHEMA, database:DB_NAME, vault:VAULT_FORMAT, coordination:coordinator.status() };
  }

  async function exportBackup(options = {}) {
    return coordinator.run(() => exportGreenfieldBackup({ store, recoveryKey:passphrase, ...options }));
  }

  async function restoreBackup(backup, { allowOverwrite = false } = {}) {
    return coordinator.run(async () => {
      const result = await restoreGreenfieldBackup({ store, backup, passphrase, allowOverwrite });
      lastState = result.state;
      return result;
    });
  }

  return Object.freeze({
    diagnostics, readState, syncDailyLifecycle, initializeFromEvidence, project, exportBackup, restoreBackup, ensureDailyGoal, overrideDailyGoal, adjustBalance, changeDevicePassword,
    sale: input => executePlan(buildSaleWorkflow(input)),
    receiveCustomerPayment: input => executeResolvedCalendarPayment(input, 'receiveCustomerPayment'),
    obligation: input => executePlan(buildObligationWorkflow(input)),
    payObligation: input => executeResolvedCalendarPayment(input, 'payObligation'),
    purchase: input => executePlan(buildPurchaseWorkflow(input)),
    stockWithdrawal: input => executePlan(buildStockWithdrawalWorkflow(input)),
    stockAdjustment: input => executePlan(buildStockAdjustmentWorkflow(input)),
    otherIncome: input => executePlan(buildOtherIncomeWorkflow(input)),
    expense: input => executePlan(buildExpenseWorkflow(input)),
    calendarReschedule: input => executePlan(buildCalendarRescheduleWorkflow(input)),
    calendarStatus: input => executePlan(buildCalendarStatusWorkflow(input)),
    rideStartRound: input => executePlan(buildRideStartRoundWorkflow(input)),
    rideEndRound: input => executePlan(buildRideEndRoundWorkflow(input)),
    rideJob: input => executePlan(buildRideJobWorkflow(input)),
    rideExpense: input => executePlan(buildRideExpenseWorkflow(input)),
    rideWithdrawCredit: input => executePlan(buildRideWithdrawCreditWorkflow(input)),
    close() { clearDailyLifecycleBoundary(); if (typeof closeStore === 'function') closeStore(); else store.close?.(); },
  });
}

export async function openGreenfieldRuntime({ passphrase, indexedDBImpl = globalThis.indexedDB, lockManager = globalThis.navigator?.locks ?? null, now } = {}) {
  const store = await openGreenfieldVaultStore({ indexedDBImpl });
  return createGreenfieldRuntime({ store, passphrase, lockManager, now, closeStore: () => store.close() });
}

export async function openGreenfieldRuntimeFromBackup({ backup, allowOverwrite = false, indexedDBImpl = globalThis.indexedDB, lockManager = globalThis.navigator?.locks ?? null, now } = {}) {
  const store = await openGreenfieldVaultStore({ indexedDBImpl });
  try {
    const restored = await restorePortableGreenfieldBackup({ store, backup, allowOverwrite });
    const runtime = createGreenfieldRuntime({ store, passphrase:restored.passphrase, lockManager, now, closeStore: () => store.close() });
    await runtime.readState();
    return runtime;
  } catch (error) {
    store.close();
    throw error;
  }
}

export async function inspectGreenfieldDeviceUnlock({ indexedDBImpl = globalThis.indexedDB } = {}) {
  const store = await openGreenfieldVaultStore({ indexedDBImpl });
  try { return await inspectDeviceUnlock({ store }); } finally { store.close(); }
}

export async function enrollGreenfieldDeviceUnlock({ vaultPassphrase, pin, indexedDBImpl = globalThis.indexedDB } = {}) {
  const store = await openGreenfieldVaultStore({ indexedDBImpl });
  try { return await enrollDeviceUnlock({ store, vaultPassphrase, pin }); } finally { store.close(); }
}

export async function verifyGreenfieldRecoveryCode({ recoveryCode, indexedDBImpl = globalThis.indexedDB } = {}) {
  const store = await openGreenfieldVaultStore({ indexedDBImpl });
  try {
    const state = await readEncryptedState({ store, passphrase:recoveryCode });
    if (!state) throw new Error('GREENFIELD_NOT_INITIALIZED');
    return { status:'VERIFIED' };
  } finally { store.close(); }
}

export async function resetGreenfieldDevicePassword({ recoveryCode, nextPassword, indexedDBImpl = globalThis.indexedDB } = {}) {
  const store = await openGreenfieldVaultStore({ indexedDBImpl });
  try {
    const state = await readEncryptedState({ store, passphrase:recoveryCode });
    if (!state) throw new Error('GREENFIELD_NOT_INITIALIZED');
    await enrollDeviceUnlock({ store, vaultPassphrase:recoveryCode, pin:nextPassword });
    const readback = await unlockVaultPassphrase({ store, pin:nextPassword });
    if (readback !== recoveryCode) throw new Error('DEVICE_UNLOCK_READBACK_MISMATCH');
    return { status:'RESET' };
  } finally { store.close(); }
}

export async function openGreenfieldRuntimeWithDevicePin({ pin, indexedDBImpl = globalThis.indexedDB, lockManager = globalThis.navigator?.locks ?? null, now } = {}) {
  const store = await openGreenfieldVaultStore({ indexedDBImpl });
  try {
    const passphrase = await unlockVaultPassphrase({ store, pin });
    return createGreenfieldRuntime({ store, passphrase, lockManager, now, closeStore: () => store.close() });
  } catch (error) {
    store.close();
    throw error;
  }
}
