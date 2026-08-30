import { validatePathRequest } from './path-contract.mjs';

function routingRequest(validated) {
  return Object.freeze({
    version:validated.version,
    action:validated.action,
    object:validated.object,
    fields:validated.fields,
    requiredResult:validated.requiredResult,
  });
}

function executionRequest(validated) {
  return Object.freeze({
    version:validated.version,
    requestId:validated.requestId,
    action:validated.action,
    object:validated.object,
    fields:validated.fields,
    requiredResult:validated.requiredResult,
  });
}

function validCapability(capability) {
  return capability &&
    typeof capability.id === 'string' &&
    capability.id.trim() &&
    typeof capability.matches === 'function' &&
    typeof capability.execute === 'function';
}

function findCapability(registry, validated) {
  const candidateRequest = routingRequest(validated);
  return registry.find(candidate => candidate.matches(candidateRequest)) ?? null;
}

function preflightResult(registry, validated) {
  const source = validated.source;
  const capability = findCapability(registry, validated);
  if (!capability) {
    return Object.freeze({ status:'BLOCKED', route:null, source, reason:'NO_LEGAL_PATH' });
  }
  return Object.freeze({ status:'READY', route:'DIRECT', capabilityId:capability.id, source });
}

export function createPathKernel({ capabilities = [], gemProcessor = null } = {}) {
  if (!Array.isArray(capabilities)) throw new Error('PATH_CAPABILITIES_INVALID');
  const registry = capabilities.map(capability => {
    if (!validCapability(capability)) throw new Error('PATH_CAPABILITY_INVALID');
    return capability;
  });
  if (gemProcessor !== null && typeof gemProcessor !== 'function') throw new Error('PATH_GEM_PROCESSOR_INVALID');

  return Object.freeze({
    preflight(input) {
      const validated = validatePathRequest(input);
      return preflightResult(registry, validated);
    },

    async run(input, { runtime } = {}) {
      const validated = validatePathRequest(input);
      const source = validated.source;
      const capability = findCapability(registry, validated);
      const runRequest = executionRequest(validated);

      if (!capability) {
        return Object.freeze({ status:'BLOCKED', route:null, source, reason:'NO_LEGAL_PATH' });
      }

      let evidence;
      try {
        evidence = await capability.execute({ request:runRequest, runtime });
      } catch (error) {
        return Object.freeze({
          status:'BLOCKED',
          route:'DIRECT',
          capabilityId:capability.id,
          source,
          reason:String(error?.message || error || 'CAPABILITY_EXECUTION_FAILED'),
        });
      }

      if (evidence?.evidenceStatus === 'PROVEN') {
        return Object.freeze({
          status:'COMPLETE',
          route:'DIRECT',
          capabilityId:capability.id,
          source,
          readback:evidence.readback,
        });
      }

      return Object.freeze({
        status:'VERIFY',
        route:'DIRECT',
        capabilityId:capability.id,
        source,
        reason:evidence?.reason || 'CAPABILITY_EVIDENCE_UNPROVEN',
      });
    },
  });
}
