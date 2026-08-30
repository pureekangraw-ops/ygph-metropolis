import { validateMultiGroupPlan } from './multi-group-contract.mjs';
import { prepareMultiGroupPlan, executeMultiGroupPlan } from './multi-group-execution.mjs';

function frozen(value) {
  return Object.freeze(value);
}

function normalizePreflightStatus(result) {
  if (result?.status === 'NEEDS_INFO' || result?.status === 'AMBIGUOUS' || result?.status === 'AWAITING_CONFIRMATION') return 'WAITING';
  if (result?.status === 'BLOCKED') return 'BLOCKED';
  if (result?.status === 'VERIFY') return 'VERIFY';
  return 'ERROR';
}

function normalizeExecutionStatus(result) {
  if (result?.status === 'COMPLETE') return 'COMPLETE';
  if (result?.status === 'NEEDS_INFO' || result?.status === 'AMBIGUOUS' || result?.status === 'AWAITING_CONFIRMATION') return 'WAITING';
  if (result?.status === 'BLOCKED') return 'BLOCKED';
  if (result?.status === 'VERIFY') return 'VERIFY';
  return 'ERROR';
}

function overallStatus(commands) {
  const states = [...new Set(commands.map(command => command.status))];
  if (states.length === 0) return 'BLOCKED';
  if (states.length === 1) return states[0];
  return 'MIXED';
}

function rebasePlan(inputPlan, baseRevision) {
  const plan = structuredClone(inputPlan);
  plan.baseRevision = baseRevision;
  return validateMultiGroupPlan(plan);
}

function updateCommands(commands, groupIds, status, reason = null) {
  const targets = new Set(groupIds);
  return commands.map(command => targets.has(command.groupId)
    ? frozen({ ...command, status, reason })
    : command);
}

function retryableCommandStatus(status) {
  return status === 'READY' || status === 'ERROR' || status === 'VERIFY';
}

export async function executeFrontdoorMultiGroupBoxes(runtime, routed) {
  if (!runtime || typeof runtime.readState !== 'function' || typeof runtime.executeMultiGroupCommands !== 'function') {
    throw new Error('MULTI_GROUP_FRONTDOOR_RUNTIME_INVALID');
  }
  if (!routed || routed.route !== 'LOCAL_MULTI_GROUP' || !Array.isArray(routed.boxes) || !Array.isArray(routed.commands)) {
    throw new Error('MULTI_GROUP_FRONTDOOR_ROUTE_INVALID');
  }

  let commands = routed.commands.map(command => frozen({ ...command }));
  const boxResults = [];

  for (const box of routed.boxes) {
    const groupIds = Array.isArray(box.commandIds) ? box.commandIds : [];
    const childStates = commands.filter(command => groupIds.includes(command.groupId));

    if (childStates.length > 0 && childStates.every(command => command.status === 'COMPLETE')) {
      boxResults.push(frozen({
        boxId:box.boxId,
        relationship:box.relationship,
        status:'COMPLETE',
        reason:'BOX_ALREADY_COMPLETE',
        preflightBaseRevision:null,
      }));
      continue;
    }

    if (childStates.length === 0 || childStates.some(command => !retryableCommandStatus(command.status))) {
      boxResults.push(frozen({
        boxId:box.boxId,
        relationship:box.relationship,
        status:'WAITING',
        reason:'BOX_CHILD_NOT_READY',
        preflightBaseRevision:null,
      }));
      continue;
    }

    const current = await runtime.readState();
    if (!current || !Number.isSafeInteger(current.revision)) throw new Error('MULTI_GROUP_RUNTIME_STATE_INVALID');
    const plan = rebasePlan(box.plan, current.revision);
    const preflight = await prepareMultiGroupPlan(runtime, plan);
    if (preflight.status !== 'PREPARED') {
      const status = normalizePreflightStatus(preflight);
      commands = updateCommands(commands, groupIds, status, preflight.reason || null);
      boxResults.push(frozen({
        boxId:box.boxId,
        relationship:box.relationship,
        status,
        reason:preflight.reason || null,
        preflightBaseRevision:current.revision,
      }));
      continue;
    }

    try {
      const result = await executeMultiGroupPlan(runtime, plan);
      const status = normalizeExecutionStatus(result);
      commands = updateCommands(commands, groupIds, status, result.reason || null);
      boxResults.push(frozen({
        boxId:box.boxId,
        relationship:box.relationship,
        status,
        reason:result.reason || null,
        preflightBaseRevision:current.revision,
        result,
      }));
    } catch (error) {
      const reason = String(error?.message || error || 'MULTI_GROUP_RUNTIME_ERROR');
      commands = updateCommands(commands, groupIds, 'ERROR', reason);
      boxResults.push(frozen({
        boxId:box.boxId,
        relationship:box.relationship,
        status:'ERROR',
        reason,
        preflightBaseRevision:current.revision,
      }));
    }
  }

  const finalCommands = Object.freeze(commands);
  return frozen({
    status:overallStatus(finalCommands),
    commands:finalCommands,
    boxes:Object.freeze(boxResults),
  });
}
