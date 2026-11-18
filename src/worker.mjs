/**
 * Cloudflare Worker entrypoint for `ygph-metropolis-chatbot`.
 * Exposes:
 * - GET  /health
 * - POST /api/chat       (central channel-agnostic chat API)
 * - POST /webhook/line   (LINE webhook with HMAC verification, deduplication, and waitUntil)
 */

import { createChatbot } from './core/runtime.mjs';
import { createOpenAICompatibleProvider } from './core/provider.mjs';
import { InMemorySessionStore, KVSessionStore } from './core/session.mjs';
import { EventDeduplicator, replyToLine, verifyLineSignature } from './channels/line.mjs';
import { defaultBotConfig } from '../config/default-bot.mjs';

const defaultSessionStore = new InMemorySessionStore();
const defaultDeduplicator = new EventDeduplicator();

export function createWorkerChatbot(env = {}, overrides = {}) {
  let provider = overrides.provider ?? null;
  if (!provider && env.LLM_ENDPOINT && env.LLM_MODEL && env.LLM_API_KEY) {
    provider = createOpenAICompatibleProvider({
      endpoint: env.LLM_ENDPOINT,
      model: env.LLM_MODEL,
      apiKey: env.LLM_API_KEY,
      fetchImpl: overrides.fetchImpl,
    });
  }

  const sessionStore = overrides.sessionStore
    ?? (env.CHAT_SESSIONS ? new KVSessionStore(env.CHAT_SESSIONS) : defaultSessionStore);

  return createChatbot({
    ...defaultBotConfig,
    ...(overrides.botConfig ?? {}),
    provider,
    sessionStore,
    clock: overrides.clock,
  });
}

async function processLineEvents(events, { env, chatbot, deduplicator, fetchImpl }) {
  const accessToken = env.LINE_CHANNEL_ACCESS_TOKEN ?? '';
  const summary = { processed: 0, skippedDuplicate: 0, replied: 0, failed: 0 };

  for (const event of events) {
    if (deduplicator.isDuplicateAndMark(event)) {
      summary.skippedDuplicate += 1;
      continue;
    }

    if (!event.replyToken) continue;

    let replyText = null;
    if (event.type === 'follow') {
      replyText = 'สวัสดีครับ! ยินดีต้อนรับครับ สอบถามข้อมูลสินค้าหรือแจ้งงานที่ต้องการได้เลยครับ';
    } else if (event.type === 'message' && event.message?.type === 'text') {
      const text = (event.message.text ?? '').trim();
      if (!text) continue;

      const sessionId = event.source?.userId
        ? `line:${event.source.userId}`
        : `line:${event.source?.groupId ?? event.source?.roomId ?? 'anon'}`;

      const result = await chatbot.respond({ sessionId, text });
      replyText = result.reply;
    }

    if (!replyText) continue;
    summary.processed += 1;

    const replyRes = await replyToLine({
      replyToken: event.replyToken,
      text: replyText,
      channelAccessToken: accessToken,
      fetchImpl,
    });

    if (replyRes.ok) {
      summary.replied += 1;
    } else {
      summary.failed += 1;
      console.error(`LINE Reply API error: status=${replyRes.status} detail=${replyRes.error ?? ''}`);
    }
  }

  return summary;
}

export async function handleRequest(request, env = {}, ctx = {}, deps = {}) {
  const url = new URL(request.url);

  if (request.method === 'GET' && (url.pathname === '/health' || url.pathname === '/api/health')) {
    return Response.json({
      ok: true,
      service: 'ygph-metropolis-chatbot',
      environment: env.ENVIRONMENT ?? 'staging',
      llmConfigured: Boolean(env.LLM_ENDPOINT && env.LLM_MODEL && env.LLM_API_KEY),
    });
  }

  if (url.pathname === '/api/chat') {
    if (request.method !== 'POST') {
      return Response.json({ ok: false, error: 'Method Not Allowed' }, { status: 405, headers: { Allow: 'POST' } });
    }
    let body;
    try {
      body = await request.json();
    } catch {
      return Response.json({ ok: false, error: 'Invalid JSON payload' }, { status: 400 });
    }
    if (!body || typeof body.text !== 'string' || !body.text.trim()) {
      return Response.json({ ok: false, error: 'Missing text field' }, { status: 400 });
    }

    const chatbot = deps.chatbot ?? createWorkerChatbot(env, deps);
    const result = await chatbot.respond({
      sessionId: typeof body.sessionId === 'string' ? body.sessionId : 'api:default',
      text: body.text,
      context: body.context,
    });
    return Response.json({ ok: true, ...result });
  }

  if (url.pathname === '/webhook/line') {
    if (request.method !== 'POST') {
      return Response.json({ ok: false, error: 'Method Not Allowed' }, { status: 405, headers: { Allow: 'POST' } });
    }

    const channelSecret = env.LINE_CHANNEL_SECRET ?? '';
    const accessToken = env.LINE_CHANNEL_ACCESS_TOKEN ?? '';
    if (!channelSecret || !accessToken) {
      return Response.json({ ok: false, error: 'Server configuration error' }, { status: 500 });
    }

    const rawBody = await request.text();
    const signature = request.headers.get('x-line-signature');
    const validSig = await verifyLineSignature(rawBody, signature, channelSecret);
    if (!validSig) {
      return Response.json({ ok: false, error: 'Invalid signature' }, { status: 401 });
    }

    let parsed;
    try {
      parsed = JSON.parse(rawBody);
    } catch {
      return Response.json({ ok: false, error: 'Invalid JSON payload' }, { status: 400 });
    }
    if (!parsed || !Array.isArray(parsed.events)) {
      return Response.json({ ok: false, error: 'Invalid webhook payload' }, { status: 400 });
    }

    const chatbot = deps.chatbot ?? createWorkerChatbot(env, deps);
    const deduplicator = deps.deduplicator ?? defaultDeduplicator;
    const workPromise = processLineEvents(parsed.events, {
      env,
      chatbot,
      deduplicator,
      fetchImpl: deps.fetchImpl,
    });

    if (typeof ctx?.waitUntil === 'function') {
      ctx.waitUntil(workPromise);
      return Response.json({ ok: true, accepted: parsed.events.length, async: true }, { status: 200 });
    }

    const summary = await workPromise;
    return Response.json({ ok: true, accepted: parsed.events.length, async: false, ...summary }, { status: 200 });
  }

  return Response.json({ ok: false, error: 'Not Found' }, { status: 404 });
}

export default {
  async fetch(request, env, ctx) {
    return handleRequest(request, env, ctx);
  },
};
