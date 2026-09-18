import { RequestGuardError, readInterpretRequest } from './guards.mjs';
import { errorResponse, jsonResponse, makeRequestId } from './http.mjs';
import { enforceInterpretRateLimit } from './rate-limit.mjs';
import { gateIntentProposal } from '../master-input/intent-contract.mjs';
import { InterpreterProviderError, interpretTextWithOpenAI } from '../master-input/interpreter-provider.mjs';
import { gateGoClientProposal, interpretGoClientTextWithOpenAI } from '../master-input/go-client-interpreter-provider.mjs';
import { gateGoClientManagerDecision, interpretGoClientManagerWithOpenAI } from '../master-input/go-client-manager-provider.mjs';

const PUBLIC_CLIENT_ASSETS = Object.freeze(new Map([
  ['/client/assets/styles.css', '/client/assets/styles.css'],
  ['/client/assets/go-client.css', '/client/assets/go-client.css'],
  ['/client/assets/ui/go-client-entry.mjs', '/client/assets/ui/go-client-entry.mjs'],
  ['/client/assets/ui/go-client.mjs', '/client/assets/ui/go-client.mjs'],
  ['/client/assets/ui/go-client-flow.mjs', '/client/assets/ui/go-client-flow.mjs'],
]));

function surfaceOf(input) {
  return String(input?.context?.surface || '').trim().toUpperCase();
}

function publicClientInput(input) {
  const requestedSurface = surfaceOf(input);
  return {
    ...input,
    context:{
      ...(input?.context || {}),
      surface:requestedSurface === 'GO_CLIENT_MANAGER' ? 'GO_CLIENT_MANAGER' : 'GO_CLIENT',
    },
  };
}

function assetRequest(request, pathname) {
  const url = new URL(request.url);
  url.pathname = pathname;
  url.search = '';
  return new Request(url.toString(), { method:'GET', headers:request.headers });
}

async function fetchPublicClientAsset(request, env, pathname) {
  const sourcePath = PUBLIC_CLIENT_ASSETS.get(pathname);
  if (!sourcePath || typeof env?.ASSETS?.fetch !== 'function') return null;
  return env.ASSETS.fetch(assetRequest(request, sourcePath));
}

async function publicClientDocument(request, env, requestId) {
  if (request.method !== 'GET') return errorResponse({ requestId, code:'METHOD_NOT_ALLOWED', status:405 });
  if (typeof env?.ASSETS?.fetch !== 'function') return errorResponse({ requestId, code:'NOT_FOUND', status:404 });
  const response = await env.ASSETS.fetch(assetRequest(request, '/client/index.html'));
  if (!response?.ok) return errorResponse({ requestId, code:'NOT_FOUND', status:404 });
  const headers = new Headers(response.headers);
  headers.delete('content-length');
  headers.delete('etag');
  headers.set('cache-control', 'no-store');
  headers.set('content-type', 'text/html; charset=utf-8');
  return new Response(await response.text(), { status:200, headers });
}

async function interpretRequest(input, env, deps) {
  const explicitlyEnabled = String(env?.INTERPRETER_PROVIDER_ENABLED || '').trim().toLowerCase() === 'true';
  const hasInjectedProvider = typeof deps?.interpretText === 'function'
    || typeof deps?.interpretGoClientText === 'function'
    || typeof deps?.interpretGoClientManager === 'function';
  const injectedTestProvider = hasInjectedProvider && env?.INTERPRETER_PROVIDER_ENABLED == null;
  const apiKey = typeof env?.OPENAI_API_KEY === 'string' ? env.OPENAI_API_KEY.trim() : '';
  if ((!explicitlyEnabled && !injectedTestProvider) || !apiKey) throw new InterpreterProviderError('INTERPRETER_NOT_CONFIGURED', 503);

  const surface = surfaceOf(input);
  if (surface === 'GO_CLIENT_MANAGER') {
    const packet = input?.context?.managerPacket;
    if (!packet || typeof packet !== 'object' || Array.isArray(packet)) throw new InterpreterProviderError('INTERPRETER_INVALID_INPUT', 400);
    const interpretGoClientManager = typeof deps?.interpretGoClientManager === 'function' ? deps.interpretGoClientManager : interpretGoClientManagerWithOpenAI;
    let decision;
    try {
      decision = await interpretGoClientManager({ apiKey, packet });
    } catch (error) {
      if (error instanceof InterpreterProviderError) throw error;
      throw new InterpreterProviderError('INTERPRETER_PROVIDER_ERROR', 502);
    }
    try {
      return { surface:'GO_CLIENT_MANAGER', ...gateGoClientManagerDecision(decision) };
    } catch (error) {
      if (error instanceof InterpreterProviderError) throw error;
      throw new InterpreterProviderError('INTERPRETER_INVALID_OUTPUT', 502);
    }
  }

  if (surface === 'GO_CLIENT') {
    const interpretGoClientText = typeof deps?.interpretGoClientText === 'function' ? deps.interpretGoClientText : interpretGoClientTextWithOpenAI;
    let proposal;
    try {
      proposal = await interpretGoClientText({ apiKey, text:input.text, context:input.context });
    } catch (error) {
      if (error instanceof InterpreterProviderError) throw error;
      throw new InterpreterProviderError('INTERPRETER_PROVIDER_ERROR', 502);
    }
    try {
      return { surface:'GO_CLIENT', ...gateGoClientProposal(proposal) };
    } catch (error) {
      if (error instanceof InterpreterProviderError) throw error;
      throw new InterpreterProviderError('INTERPRETER_INVALID_OUTPUT', 502);
    }
  }

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
    if (url.pathname === '/client' || url.pathname === '/client/') {
      return publicClientDocument(request, env, requestId);
    }

    if (url.pathname.startsWith('/client/assets/')) {
      if (request.method !== 'GET') return errorResponse({ requestId, code:'METHOD_NOT_ALLOWED', status:405 });
      const response = await fetchPublicClientAsset(request, env, url.pathname);
      return response || errorResponse({ requestId, code:'NOT_FOUND', status:404 });
    }

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

    if (url.pathname === '/api/v1/interpret' || url.pathname === '/client/api/v1/interpret') {
      let input = await readInterpretRequest(request);
      if (url.pathname === '/client/api/v1/interpret') input = publicClientInput(input);
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