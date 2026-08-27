import { RequestGuardError, readInterpretRequest } from './guards.mjs';
import { errorResponse, jsonResponse, makeRequestId } from './http.mjs';
import { enforceInterpretRateLimit } from './rate-limit.mjs';
import { gateIntentProposal } from '../master-input/intent-contract.mjs';
import { InterpreterProviderError, interpretTextWithOpenAI } from '../master-input/interpreter-provider.mjs';

async function interpretRequest(input, env, deps) {
  const explicitlyEnabled = String(env?.INTERPRETER_PROVIDER_ENABLED || '').trim().toLowerCase() === 'true';
  const injectedTestProvider = typeof deps?.interpretText === 'function' && env?.INTERPRETER_PROVIDER_ENABLED == null;
  const apiKey = typeof env?.OPENAI_API_KEY === 'string' ? env.OPENAI_API_KEY.trim() : '';
  if ((!explicitlyEnabled && !injectedTestProvider) || !apiKey) throw new InterpreterProviderError('INTERPRETER_NOT_CONFIGURED', 503);
  const interpretText = typeof deps?.interpretText === 'function' ? deps.interpretText : interpretTextWithOpenAI;
  let proposal;
  try {
    proposal = await interpretText({ apiKey, text:input.text });
  } catch (error) {
    if (error instanceof InterpreterProviderError) throw error;
    throw new InterpreterProviderError('INTERPRETER_PROVIDER_ERROR', 502);
  }
  try {
    return gateIntentProposal(proposal);
  } catch {
    throw new InterpreterProviderError('INTERPRETER_INVALID_OUTPUT', 502);
  }
}

export async function handleApiRequest(request, env = {}, deps = {}) {
  const requestId = makeRequestId();
  const url = new URL(request.url);

  try {
    if (url.pathname === '/api/v1/health') {
      if (request.method !== 'GET') {
        return errorResponse({ requestId, code: 'METHOD_NOT_ALLOWED', status: 405 });
      }
      return jsonResponse({
        version: '1',
        requestId,
        status: 'ok',
      });
    }

    if (url.pathname === '/api/v1/interpret') {
      const input = await readInterpretRequest(request);
      await enforceInterpretRateLimit(env);
      const intent = await interpretRequest(input, env, deps);
      return jsonResponse({ ...intent, requestId });
    }

    return errorResponse({ requestId, code: 'NOT_FOUND', status: 404 });
  } catch (error) {
    if (error instanceof RequestGuardError) {
      return errorResponse({ requestId, code: error.code, status: error.status });
    }
    if (error instanceof InterpreterProviderError) {
      return errorResponse({ requestId, code: error.code, status: error.status });
    }
    return errorResponse({ requestId, code: 'INTERNAL_ERROR', status: 500 });
  }
}

export default {
  fetch(request, env) {
    return handleApiRequest(request, env);
  },
};
