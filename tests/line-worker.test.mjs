import test from 'node:test';
import assert from 'node:assert/strict';
import { computeLineSignature } from '../src/channels/line.mjs';
import { createWorkerChatbot, handleRequest, SlidingWindowRateLimiter } from '../src/worker.mjs';

const TEST_ENV = {
  ENVIRONMENT: 'staging',
  LINE_CHANNEL_SECRET: 'test-channel-secret',
  LINE_CHANNEL_ACCESS_TOKEN: 'test-access-token',
};

test('GET /health returns service status', async () => {
  const res = await handleRequest(new Request('https://example.com/health'), TEST_ENV);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(body.service, 'ygph-metropolis-chatbot');
});

test('POST /api/chat responds using central chatbot core', async () => {
  const chatbot = createWorkerChatbot(TEST_ENV, {
    provider: async () => ({ reply: 'แพ็กเกจ Starter Chatbot Setup ราคา 4,900 บาท ครับ' }),
  });

  const res = await handleRequest(
    new Request('https://example.com/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: 'web-1', text: 'ราคาเท่าไหร่ครับ' }),
    }),
    TEST_ENV,
    {},
    { chatbot },
  );

  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(body.modelStatus, 'RESPONDED');
  assert.match(body.reply, /4,900 บาท/);
});

test('POST /webhook/line rejects invalid signature', async () => {
  const res = await handleRequest(
    new Request('https://example.com/webhook/line', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-line-signature': 'invalid-sig',
      },
      body: JSON.stringify({ events: [] }),
    }),
    TEST_ENV,
  );
  assert.equal(res.status, 401);
});

test('POST /webhook/line uses ctx.waitUntil and deduplicates redelivered events', async () => {
  const sentReplies = [];
  const waitUntilPromises = [];
  const ctx = {
    waitUntil(promise) {
      waitUntilPromises.push(promise);
    },
  };
  const fetchImpl = async (_url, init) => {
    sentReplies.push(JSON.parse(init.body));
    return new Response('{}', { status: 200 });
  };

  const payload = JSON.stringify({
    events: [
      {
        type: 'message',
        webhookEventId: 'evt-unique-001',
        replyToken: 'reply-tok-1',
        source: { type: 'user', userId: 'U123' },
        message: { type: 'text', id: 'msg-1', text: 'สวัสดี' },
      },
    ],
  });
  const signature = await computeLineSignature(payload, TEST_ENV.LINE_CHANNEL_SECRET);

  // First delivery
  const res1 = await handleRequest(
    new Request('https://example.com/webhook/line', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-line-signature': signature },
      body: payload,
    }),
    TEST_ENV,
    ctx,
    { fetchImpl },
  );
  assert.equal(res1.status, 200);
  const body1 = await res1.json();
  assert.equal(body1.async, true);
  assert.equal(waitUntilPromises.length, 1);

  await Promise.all(waitUntilPromises);
  assert.equal(sentReplies.length, 1);
  assert.match(sentReplies[0].messages[0].text, /สวัสดีครับ/);

  // Redelivery of the exact same webhookEventId should be skipped
  const res2 = await handleRequest(
    new Request('https://example.com/webhook/line', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-line-signature': signature },
      body: payload,
    }),
    TEST_ENV,
    ctx,
    { fetchImpl },
  );
  assert.equal(res2.status, 200);
  await Promise.all(waitUntilPromises);
  assert.equal(sentReplies.length, 1);
});

test('POST /api/chat supports per-session demoKnowledge and enforces 429 rate limit', async () => {
  const rateLimiter = new SlidingWindowRateLimiter({ maxRequests: 2, windowMs: 60000 });

  const req1 = await handleRequest(
    new Request('https://example.com/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': '1.2.3.4' },
      body: JSON.stringify({
        sessionId: 'custom-store-1',
        text: 'ราคาเท่าไหร่ครับ',
        demoKnowledge: {
          storeName: 'ร้านดอกไม้',
          catalogue: [{ name: 'ช่อกุหลาบ', price: 850, description: 'กุหลาบแดง 12 ดอก' }],
        },
      }),
    }),
    TEST_ENV,
    {},
    { rateLimiter },
  );
  assert.equal(req1.status, 200);
  const body1 = await req1.json();
  assert.match(body1.reply, /ช่อกุหลาบ/);
  assert.match(body1.reply, /850 บาท/);

  // Second turn in same session remembers demoKnowledge without resending it
  const req2 = await handleRequest(
    new Request('https://example.com/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': '1.2.3.4' },
      body: JSON.stringify({ sessionId: 'custom-store-1', text: 'มีกี่ราคา' }),
    }),
    TEST_ENV,
    {},
    { rateLimiter },
  );
  assert.equal(req2.status, 200);
  const body2 = await req2.json();
  assert.match(body2.reply, /850 บาท/);

  // Third request within window triggers 429
  const req3 = await handleRequest(
    new Request('https://example.com/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': '1.2.3.4' },
      body: JSON.stringify({ sessionId: 'custom-store-1', text: 'สวัสดี' }),
    }),
    TEST_ENV,
    {},
    { rateLimiter },
  );
  assert.equal(req3.status, 429);
});
