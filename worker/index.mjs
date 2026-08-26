import { errorResponse, jsonResponse, makeRequestId } from './http.mjs';

export async function handleApiRequest(request) {
  const requestId = makeRequestId();
  const url = new URL(request.url);

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

  return errorResponse({ requestId, code: 'NOT_FOUND', status: 404 });
}

export default {
  fetch(request, env) {
    return handleApiRequest(request, env);
  },
};
