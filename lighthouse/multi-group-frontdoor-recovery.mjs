import {
  createRecoverySession,
  reassembleRecoverySession,
} from './master-input-recovery-session.mjs';
import { routeMasterInputText } from './master-input-route.mjs';

function frozen(value) {
  return Object.freeze(value);
}

function frozenCommands(commands) {
  return Object.freeze((commands ?? []).map(command => frozen({ ...command })));
}

function overallStatus(commands) {
  const states = [...new Set(commands.map(command => command.status))];
  if (states.length === 0) return 'BLOCKED';
  if (states.length === 1) return states[0];
  return 'MIXED';
}

function recoveryRoute(routed) {
  return {
    status:'RECOVERY_REQUIRED',
    reason:'MULTI_GROUP_RECOVERY_REQUIRED',
    prepared:routed.prepared,
  };
}

function requireMultiGroupRoute(routed) {
  if (!routed || routed.route !== 'LOCAL_MULTI_GROUP' || !Array.isArray(routed.commands)) {
    throw new TypeError('MULTI_GROUP_FRONTDOOR_RECOVERY_ROUTE_REQUIRED');
  }
  if (typeof routed.compileId !== 'string' || !routed.compileId.trim()) {
    throw new TypeError('MULTI_GROUP_FRONTDOOR_COMPILE_ID_REQUIRED');
  }
  if (!routed.commands.some(command => command.status === 'WAITING')) {
    throw new TypeError('MULTI_GROUP_FRONTDOOR_WAITING_COMMAND_REQUIRED');
  }
}

function mergeCompletedCommands(currentCommands, previousCommands) {
  const previous = new Map((previousCommands ?? []).map(command => [command.groupId, command]));
  return currentCommands.map(command => {
    const prior = previous.get(command.groupId);
    if (prior?.status !== 'COMPLETE') return command;
    return frozen({ ...command, status:'COMPLETE', reason:null });
  });
}

export function createFrontdoorMultiGroupRecoverySession(routed, options = {}) {
  requireMultiGroupRoute(routed);
  const base = createRecoverySession(recoveryRoute(routed), options);
  return frozen({
    ...base,
    mode:'MULTI_GROUP',
    compileId:routed.compileId,
    commands:frozenCommands(routed.commands),
  });
}

export function updateFrontdoorMultiGroupRecoverySession(session, commands) {
  if (session?.mode !== 'MULTI_GROUP' || typeof session?.compileId !== 'string') {
    throw new TypeError('MULTI_GROUP_FRONTDOOR_RECOVERY_SESSION_REQUIRED');
  }
  if (!Array.isArray(commands)) throw new TypeError('MULTI_GROUP_FRONTDOOR_COMMANDS_REQUIRED');
  return frozen({
    ...session,
    commands:frozenCommands(commands),
  });
}

export async function rejoinFrontdoorMultiGroupRecoverySession(session, options = {}) {
  if (session?.mode !== 'MULTI_GROUP' || typeof session?.compileId !== 'string' || !session.compileId.trim()) {
    throw new TypeError('MULTI_GROUP_FRONTDOOR_RECOVERY_SESSION_REQUIRED');
  }
  const currentRevision = Number(options.currentRevision);
  if (!Number.isSafeInteger(currentRevision) || currentRevision < 0) {
    throw new TypeError('MULTI_GROUP_FRONTDOOR_CURRENT_REVISION_REQUIRED');
  }
  const baseRevision = Number(session.baseRevision);
  if (!Number.isSafeInteger(baseRevision) || baseRevision < 0) {
    throw new TypeError('MULTI_GROUP_FRONTDOOR_BASE_REVISION_REQUIRED');
  }

  const reassembled = reassembleRecoverySession(session);
  const routed = await routeMasterInputText(reassembled.text, {
    receivedAt:options.receivedAt,
    timeZone:options.timeZone,
    baseRevision:currentRevision,
    compileId:session.compileId,
    requestIdFactory:() => session.compileId,
    interpretFallback:async () => { throw new Error('MULTI_GROUP_RECOVERY_PROVIDER_FORBIDDEN'); },
  });

  let resumed = routed;
  if (routed.route === 'LOCAL_MULTI_GROUP') {
    const commands = frozenCommands(mergeCompletedCommands(routed.commands, session.commands));
    resumed = frozen({
      ...routed,
      compileId:session.compileId,
      status:overallStatus(commands),
      commands,
    });
  }

  return frozen({
    ...reassembled,
    routed:resumed,
    revalidation:frozen({
      baseRevision,
      currentRevision,
      revisionChanged:currentRevision !== baseRevision,
    }),
  });
}
