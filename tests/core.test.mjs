import test from 'node:test';
import assert from 'node:assert/strict';
import { createChatbot } from '../src/core/runtime.mjs';
import { defaultBotConfig } from '../config/default-bot.mjs';

test('custom rules and built-in escalations use deterministic policy replies without calling LLM', async () => {
  let llmCalled = false;
  const bot = createChatbot({
    ...defaultBotConfig,
    provider: async () => {
      llmCalled = true;
      return { reply: 'ควรไม่ถูกเรียก' };
    },
  });

  const greeting = await bot.respond({ text: 'สวัสดี' });
  assert.equal(greeting.plan.matchedRuleId, 'GREETING_MENU');
  assert.equal(greeting.modelStatus, 'SKIPPED_POLICY_REPLY');

  const payment = await bot.respond({ text: 'โอนแล้วครับ' });
  assert.equal(payment.plan.action, 'REVIEW_PAYMENT');
  assert.equal(payment.modelStatus, 'SKIPPED_POLICY_REPLY');

  const urgent = await bot.respond({ text: 'ขอแบบด่วนวันนี้เลย' });
  assert.equal(urgent.plan.action, 'HANDOFF');
  assert.equal(urgent.plan.reason, 'URGENT_REQUEST');
  assert.equal(llmCalled, false);
});

test('price guardrail allows verified catalogue prices and blocks fabricated prices', async () => {
  const validBot = createChatbot({
    ...defaultBotConfig,
    provider: async () => ({
      reply: 'แพ็กเกจ Starter Chatbot Setup ราคา 4,900 บาท ครับ',
    }),
  });
  const okRes = await validBot.respond({ text: 'ราคาเท่าไหร่ครับ' });
  assert.equal(okRes.modelStatus, 'RESPONDED');
  assert.match(okRes.reply, /4,900 บาท/);

  const hallucinatingBot = createChatbot({
    ...defaultBotConfig,
    provider: async () => ({
      reply: 'ลดพิเศษให้เลยเหลือ 999 บาท ครับ',
    }),
  });
  const blockedRes = await hallucinatingBot.respond({ text: 'ราคาเท่าไหร่ครับ' });
  assert.equal(blockedRes.modelStatus, 'INVALID_OUTPUT');
  assert.equal(blockedRes.reply.includes('999'), false);
});

test('blocks sensitive inputs (OTP/password/card) and sanitizes leaked secrets in context', async () => {
  let receivedCall = null;
  const bot = createChatbot({
    ...defaultBotConfig,
    provider: async (call) => {
      receivedCall = call;
      return { reply: 'ขอทราบรายละเอียดเพิ่มเติมครับ' };
    },
  });

  const sensitiveRes = await bot.respond({ text: 'รหัส OTP ของฉันคือ 123456' });
  assert.equal(sensitiveRes.plan.status, 'BLOCKED');
  assert.equal(sensitiveRes.plan.reason, 'SENSITIVE_INPUT_BLOCKED');

  await bot.respond({
    text: 'อยากทำแชทบอทขายของ Bearer abc99999',
    context: { brief: { goal: 'ขายของ' }, apiKey: 'xyz-key-123' },
  });
  assert.equal(receivedCall.text.includes('abc99999'), false);
  assert.equal(receivedCall.context.apiKey, undefined);
});

test('blocks internal system jargon and false completion claims from LLM', async () => {
  const bot = createChatbot({
    ...defaultBotConfig,
    provider: async () => ({ reply: 'ส่งเข้า GO Hub เรียบร้อย ชำระแล้วครับ' }),
  });

  const res = await bot.respond({ text: 'ช่วยแนะนำหน่อย' });
  assert.equal(res.modelStatus, 'INVALID_OUTPUT');
});

test('session store preserves brief and history across turns for the same sessionId', async () => {
  let lastCall = null;
  const bot = createChatbot({
    ...defaultBotConfig,
    provider: async (call) => {
      lastCall = call;
      return { reply: 'รับทราบครับ' };
    },
  });

  await bot.respond({
    sessionId: 'user-1',
    text: 'อยากทำบอทขายคอร์สเรียน',
    context: { brief: { goal: 'ขายคอร์สเรียน' } },
  });

  await bot.respond({
    sessionId: 'user-1',
    text: 'ใช้เวลาติดตั้งกี่วันครับ',
  });

  assert.equal(lastCall.context.brief.goal, 'ขายคอร์สเรียน');
  assert.equal(lastCall.context.history.length, 2);
});

test('unavailable provider falls back gracefully without leaking internal error details', async () => {
  const bot = createChatbot({
    ...defaultBotConfig,
    provider: async () => {
      throw new Error('upstream_secret_key_failed');
    },
  });

  const res = await bot.respond({ text: 'อยากทำบอท' });
  assert.equal(res.modelStatus, 'UNAVAILABLE');
  assert.equal(res.reply.includes('upstream_secret_key_failed'), false);
});
