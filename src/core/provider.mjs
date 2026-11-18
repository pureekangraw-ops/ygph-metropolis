/**
 * OpenAI-compatible HTTPS LLM provider (ported from `ModelConfiguration.kt` & `ModelConnection.kt`).
 */

function parseModelJson(content) {
  if (typeof content !== 'string') throw new Error('MODEL_EMPTY_CONTENT');
  const trimmed = content.trim();
  // Strip optional ```json ... ``` wrapper if a model adds markdown fences
  const unwrapped = trimmed.startsWith('```')
    ? trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
    : trimmed;
  return JSON.parse(unwrapped);
}

export function validateEndpoint(endpoint) {
  const u = new URL(endpoint);
  if (u.protocol !== 'https:' || !u.hostname || u.username || u.password || u.hash || u.search) {
    throw new Error('ENDPOINT_INVALID: Use an HTTPS endpoint without credentials or query');
  }
}

export function createOpenAICompatibleProvider({
  endpoint,
  model,
  apiKey,
  maxTokens = 500,
  fetchImpl = globalThis.fetch,
} = {}) {
  if (!endpoint || !model || !apiKey) {
    throw new Error('PROVIDER_CONFIG_MISSING');
  }
  validateEndpoint(endpoint);
  if (typeof fetchImpl !== 'function') {
    throw new Error('FETCH_UNAVAILABLE');
  }

  return async function callProvider({ system, text, context, policy, signal }) {
    const userPayload = JSON.stringify({ text, context, policy });
    const body = JSON.stringify({
      model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: userPayload },
      ],
      max_tokens: maxTokens,
    });

    if (new TextEncoder().encode(body).byteLength > 64 * 1024) {
      throw new Error('MODEL_REQUEST_TOO_LARGE');
    }

    const res = await fetchImpl(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body,
      signal,
    });

    if (!res.ok) {
      throw new Error(`MODEL_HTTP_ERROR_${res.status}`);
    }

    const rawText = await res.text();
    if (new TextEncoder().encode(rawText).byteLength > 64 * 1024) {
      throw new Error('MODEL_RESPONSE_TOO_LARGE');
    }

    const data = JSON.parse(rawText);
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || content.length > 4000) {
      throw new Error('MODEL_CONTENT_INVALID');
    }

    return parseModelJson(content);
  };
}
