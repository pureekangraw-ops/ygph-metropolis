export const MAX_INTERPRET_BODY_BYTES = 8192;

export class RequestGuardError extends Error {
  constructor(code, status) {
    super(code);
    this.name = 'RequestGuardError';
    this.code = code;
    this.status = status;
  }
}

function fail(code, status) {
  throw new RequestGuardError(code, status);
}

function isPlainJsonObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export async function readInterpretRequest(request) {
  if (request.method !== 'POST') fail('METHOD_NOT_ALLOWED', 405);

  const contentType = (request.headers.get('content-type') || '').toLowerCase();
  if (!/^application\/json(?:\s*;|$)/.test(contentType)) {
    fail('UNSUPPORTED_MEDIA_TYPE', 415);
  }

  const declaredLength = request.headers.get('content-length');
  if (declaredLength !== null) {
    const declaredBytes = Number(declaredLength);
    if (Number.isFinite(declaredBytes) && declaredBytes > MAX_INTERPRET_BODY_BYTES) {
      fail('PAYLOAD_TOO_LARGE', 413);
    }
  }

  const raw = await request.text();
  const actualBytes = new TextEncoder().encode(raw).byteLength;
  if (actualBytes > MAX_INTERPRET_BODY_BYTES) fail('PAYLOAD_TOO_LARGE', 413);

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    fail('INVALID_JSON', 400);
  }

  if (!isPlainJsonObject(payload)) fail('INVALID_REQUEST', 400);
  if (payload.version !== '1') fail('UNSUPPORTED_VERSION', 400);
  if (typeof payload.text !== 'string' || payload.text.trim().length === 0) {
    fail('INVALID_REQUEST', 400);
  }
  if ('context' in payload && !isPlainJsonObject(payload.context)) {
    fail('INVALID_REQUEST', 400);
  }

  return {
    version: '1',
    text: payload.text.trim(),
    context: payload.context ?? {},
  };
}
