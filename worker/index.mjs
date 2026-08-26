import { RequestGuardError, readInterpretRequest } from './guards.mjs';
import { errorResponse, jsonResponse, makeRequestId } from './http.mjs';
import { enforceInterpretRateLimit } from './rate-limit.mjs';

export async function handleApiRequest(request, env = {}) {
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
      await readInterpretRequest(request);
      await enforceInterpretRateLimit(env);
      return errorResponse({
        requestId,
        code: 'INTERPRETER_NOT_CONFIGURED',
        status: 503,
      });
    }

    return errorResponse({ requestId, code: 'NOT_FOUND', status: 404 });
  } catch (error) {
    if (error instanceof RequestGuardError) {
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
