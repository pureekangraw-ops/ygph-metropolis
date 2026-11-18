/**
 * LINE Messaging API adapter with HMAC-SHA256 verification and
 * webhook redelivery / duplicate event deduplication.
 */

export const LINE_REPLY_API_URL = 'https://api.line.me/v2/bot/message/reply';
const textEncoder = new TextEncoder();

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function timingSafeEqual(a, b) {
  const aBytes = textEncoder.encode(a);
  const bBytes = textEncoder.encode(b);
  let diff = aBytes.length ^ bBytes.length;
  const maxLen = Math.max(aBytes.length, bBytes.length);
  for (let i = 0; i < maxLen; i++) {
    diff |= (aBytes[i] ?? 0) ^ (bBytes[i] ?? 0);
  }
  return diff === 0;
}

export async function computeLineSignature(rawBody, channelSecret) {
  const key = await crypto.subtle.importKey(
    'raw',
    textEncoder.encode(channelSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signatureBuffer = await crypto.subtle.sign('HMAC', key, textEncoder.encode(rawBody));
  return arrayBufferToBase64(signatureBuffer);
}

export async function verifyLineSignature(rawBody, signatureHeader, channelSecret) {
  if (!signatureHeader || !channelSecret) return false;
  const trimmed = signatureHeader.trim();
  if (!trimmed) return false;
  const expected = await computeLineSignature(rawBody, channelSecret);
  return timingSafeEqual(expected, trimmed);
}

/**
 * Prevents duplicate handling when LINE redelivers the same webhook event.
 */
export class EventDeduplicator {
  constructor({ ttlMs = 10 * 60 * 1000, clock = Date.now } = {}) {
    this.ttlMs = ttlMs;
    this.clock = clock;
    this.seen = new Map();
  }

  getEventKey(event) {
    if (event?.webhookEventId) return `eid:${event.webhookEventId}`;
    if (event?.message?.id) return `mid:${event.message.id}`;
    if (event?.replyToken) return `rt:${event.replyToken}`;
    return null;
  }

  isDuplicateAndMark(event) {
    const key = this.getEventKey(event);
    if (!key) return false;

    const now = this.clock();
    // Prune expired entries opportunistically
    for (const [k, exp] of this.seen.entries()) {
      if (exp <= now) this.seen.delete(k);
    }

    const existingExp = this.seen.get(key);
    if (existingExp && existingExp > now) {
      return true;
    }

    this.seen.set(key, now + this.ttlMs);
    return false;
  }
}

export async function replyToLine({ replyToken, text, channelAccessToken, fetchImpl = globalThis.fetch }) {
  if (!replyToken || !text || !channelAccessToken) {
    return { ok: false, status: 400, error: 'Missing required reply parameters' };
  }

  const res = await fetchImpl(LINE_REPLY_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${channelAccessToken}`,
    },
    body: JSON.stringify({
      replyToken,
      messages: [{ type: 'text', text: text.slice(0, 5000) }],
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    return { ok: false, status: res.status, error: detail };
  }
  return { ok: true, status: res.status };
}
