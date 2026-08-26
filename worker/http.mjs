export function makeRequestId() {
  return `req_${crypto.randomUUID()}`;
}

export function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  });
}

export function errorResponse({ requestId, code, status }) {
  return jsonResponse({
    version: '1',
    requestId,
    status: 'ERROR',
    code,
  }, status);
}
