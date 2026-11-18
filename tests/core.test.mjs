import test from 'node:test';
import assert from 'node:assert/strict';
import { createChatbot } from '../src/core/runtime.mjs';
import { KVSessionStore } from '../src/core/session.mjs';
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

test('multi-turn conversation automatically fills goal -> scope -> confirm -> handoff', async () => {
  const bot = createChatbot({
    ...defaultBotConfig,
    provider: null,
  });

  // Turn 1: greeting asks/welcomes
  const t1 = await bot.respond({ sessionId: 'lead-1', text: 'สวัสดี' });
  assert.equal(t1.plan.matchedRuleId, 'GREETING_MENU');

  // Turn 2: user states goal -> bot asks for scope
  const t2 = await bot.respond({ sessionId: 'lead-1', text: 'อยากทำบอทขายคอร์สเรียนออนไลน์' });
  assert.equal(t2.session.brief.goal, 'อยากทำบอทขายคอร์สเรียนออนไลน์');
  assert.equal(t2.plan.reason, 'MISSING_SCOPE');

  // Turn 3: user states scope -> bot asks to confirm brief
  const t3 = await bot.respond({ sessionId: 'lead-1', text: 'อยากให้ตอบคำถามลูกค้าและเก็บเบอร์โทรติดต่อ' });
  assert.equal(t3.session.brief.scope, 'อยากให้ตอบคำถามลูกค้าและเก็บเบอร์โทรติดต่อ');
  assert.equal(t3.plan.action, 'CONFIRM_BRIEF');

  // Turn 4: user confirms -> bot prepares handoff
  const t4 = await bot.respond({ sessionId: 'lead-1', text: 'ใช่ครับ' });
  assert.equal(t4.session.brief.confirmed, true);
  assert.equal(t4.plan.action, 'PREPARE_HANDOFF');
});

test('ignores greetings/short fillers and resets brief when user rejects confirmation', async () => {
  const bot = createChatbot({
    ...defaultBotConfig,
    provider: null,
  });

  const greet = await bot.respond({ sessionId: 'lead-2', text: 'ดีจ้า' });
  assert.equal(greet.plan.matchedRuleId, 'GREETING_MENU');
  assert.equal(greet.session.brief.goal, undefined);

  const filler = await bot.respond({ sessionId: 'lead-2', text: 'หา' });
  assert.equal(filler.session.brief.goal, undefined);
  assert.equal(filler.plan.reason, 'MISSING_GOAL');

  await bot.respond({ sessionId: 'lead-2', text: 'ทำบอทขายเสื้อผ้า' });
  const confirmTurn = await bot.respond({ sessionId: 'lead-2', text: 'ตอบแชทลูกค้าและเก็บเบอร์โทร' });
  assert.equal(confirmTurn.plan.action, 'CONFIRM_BRIEF');
  assert.match(confirmTurn.reply, /ทำบอทขายเสื้อผ้า/);

  const rejectTurn = await bot.respond({ sessionId: 'lead-2', text: 'ไม่ตรง' });
  assert.equal(rejectTurn.session.brief.goal, '');
  assert.equal(rejectTurn.session.brief.scope, '');
  assert.equal(rejectTurn.plan.reason, 'MISSING_GOAL');
});

test('handles sales intents (discovery, demo, objection, discount, closing) cleanly', async () => {
  const bot = createChatbot({
    ...defaultBotConfig,
    provider: null,
  });

  const interest = await bot.respond({ sessionId: 'sales-1', text: 'สนใจครับ' });
  assert.equal(interest.plan.matchedRuleId, 'INTEREST_DISCOVERY');
  assert.equal(interest.session.brief.goal, undefined);

  const demo = await bot.respond({ sessionId: 'sales-1', text: 'ขอดูตัวอย่างหน่อย' });
  assert.equal(demo.plan.matchedRuleId, 'PORTFOLIO_DEMO');

  const objection = await bot.respond({ sessionId: 'sales-1', text: 'แพงไปหน่อย ขอคิดดูก่อน' });
  assert.equal(objection.plan.matchedRuleId, 'OBJECTION_HESITATION');

  const discount = await bot.respond({ sessionId: 'sales-1', text: 'ลดได้ไหมครับ' });
  assert.equal(discount.plan.matchedRuleId, 'DISCOUNT_NEGOTIATION');
  assert.equal(discount.plan.action, 'HANDOFF');

  const closing = await bot.respond({ sessionId: 'sales-1', text: 'เอาอันนี้ครับ ขอเลขบัญชี' });
  assert.equal(closing.plan.matchedRuleId, 'CLOSING_READY');
  assert.equal(closing.plan.action, 'HANDOFF');
});

test('policy-only mode answers price, comparison, and offer questions using real catalogue/faq data', async () => {
  const bot = createChatbot({
    ...defaultBotConfig,
    provider: null,
  });

  const prices = await bot.respond({ sessionId: 'q-1', text: 'มีกี่ราคา' });
  assert.match(prices.reply, /4,900 บาท/);
  assert.match(prices.reply, /12,900 บาท/);

  const compare = await bot.respond({ sessionId: 'q-1', text: 'แบบไหนคุ้ม' });
  assert.equal(compare.plan.action, 'OBSERVE');
  assert.equal(compare.session.brief.goal, undefined);
  assert.match(compare.reply, /แนะนำเบื้องต้น/);

  const offer = await bot.respond({ sessionId: 'q-1', text: 'มีข้อเสนอไหม' });
  assert.equal(offer.plan.action, 'OBSERVE');
  assert.match(offer.reply, /Starter Chatbot Setup/);
});

test('handles competitor compare, tech integration, and prevents intent/filler leak into brief', async () => {
  const bot = createChatbot({
    ...defaultBotConfig,
    provider: null,
  });

  const thanks = await bot.respond({ sessionId: 'sales-2', text: 'ขอบคุณครับ' });
  assert.equal(thanks.session.brief.goal, undefined);

  const viewWork = await bot.respond({ sessionId: 'sales-2', text: 'ขอดูงาน' });
  assert.equal(viewWork.plan.matchedRuleId, 'PORTFOLIO_DEMO');
  assert.equal(viewWork.session.brief.goal, undefined);

  const overBudget = await bot.respond({ sessionId: 'sales-2', text: 'เกินงบ' });
  assert.equal(overBudget.plan.matchedRuleId, 'OBJECTION_HESITATION');
  assert.equal(overBudget.session.brief.goal, undefined);

  const compare = await bot.respond({ sessionId: 'sales-2', text: 'ต่างจากเจ้าอื่นยังไง' });
  assert.equal(compare.plan.matchedRuleId, 'COMPETITOR_COMPARE');
  assert.equal(compare.plan.allowModel, true);

  const tech = await bot.respond({ sessionId: 'sales-2', text: 'เชื่อม Google Sheet ได้ไหม' });
  assert.equal(tech.plan.matchedRuleId, 'INTEGRATION_TECH');
  assert.equal(tech.plan.allowModel, true);
});

test('KVSessionStore persists and retrieves session state', async () => {
  const backing = new Map();
  const fakeKV = {
    async get(k) { return backing.get(k) ?? null; },
    async put(k, v) { backing.set(k, v); },
    async delete(k) { backing.delete(k); },
  };
  const store = new KVSessionStore(fakeKV);
  await store.set('u1', { brief: { goal: 'ทดสอบ KV' } });
  const loaded = await store.get('u1');
  assert.equal(loaded.brief.goal, 'ทดสอบ KV');
  await store.delete('u1');
  assert.equal(await store.get('u1'), null);
});

test('dynamic store sandbox isolates sessions, computes verifiedPrices per session, and leaves defaultBotConfig untouched', async () => {
  const originalCatalogueLen = defaultBotConfig.knowledge.catalogue.length;

  const bot = createChatbot({
    ...defaultBotConfig,
    provider: async ({ context }) => {
      const firstItem = context.knowledge.catalogue[0];
      return { reply: `สินค้า ${firstItem.name} ราคา ${firstItem.priceText} ครับ` };
    },
  });

  // Session A sets custom coffee shop catalogue (120 บาท)
  const resA = await bot.respond({
    sessionId: 'store-a',
    text: 'ราคาเท่าไหร่ครับ',
    context: {
      demoKnowledge: {
        storeName: 'ร้านกาแฟอารีย์',
        catalogue: [{ name: 'มัทฉะลาเต้', price: 120, description: 'เกรดพิธีชง' }],
      },
    },
  });
  assert.equal(resA.modelStatus, 'RESPONDED');
  assert.match(resA.reply, /มัทฉะลาเต้/);
  assert.match(resA.reply, /120 บาท/);

  // Session B has NO demoKnowledge -> uses defaultBotConfig (4,900 บาท), no bleed from Session A
  const resB = await bot.respond({
    sessionId: 'store-b',
    text: 'ราคาเท่าไหร่ครับ',
  });
  assert.equal(resB.modelStatus, 'RESPONDED');
  assert.match(resB.reply, /Starter Chatbot Setup/);
  assert.equal(resB.reply.includes('มัทฉะลาเต้'), false);

  // Session A trying to mention defaultBotConfig's 4,900 บาท or fake 999 บาท gets blocked by per-session verifiedPrices
  const strictBot = createChatbot({
    ...defaultBotConfig,
    provider: async () => ({ reply: 'ราคา 4,900 บาท ครับ' }),
  });
  const blockedCrossPrice = await strictBot.respond({
    sessionId: 'store-a-strict',
    text: 'ราคาเท่าไหร่ครับ',
    context: {
      demoKnowledge: {
        storeName: 'ร้านกาแฟอารีย์',
        catalogue: [{ name: 'มัทฉะลาเต้', price: 120 }],
      },
    },
  });
  assert.equal(blockedCrossPrice.modelStatus, 'INVALID_OUTPUT');
  assert.equal(defaultBotConfig.knowledge.catalogue.length, originalCatalogueLen);
});

test('maxLlmTurns caps LLM calls per session and falls back to policy-only reply', async () => {
  let calls = 0;
  const bot = createChatbot({
    ...defaultBotConfig,
    maxLlmTurns: 2,
    provider: async () => {
      calls += 1;
      return { reply: `ตอบรอบที่ ${calls}` };
    },
  });

  const t1 = await bot.respond({ sessionId: 'cap-1', text: 'ราคาเท่าไหร่ครับ' });
  const t2 = await bot.respond({ sessionId: 'cap-1', text: 'แบบไหนคุ้มครับ' });
  const t3 = await bot.respond({ sessionId: 'cap-1', text: 'มีข้อเสนอไหม' });

  assert.equal(t1.modelStatus, 'RESPONDED');
  assert.equal(t2.modelStatus, 'RESPONDED');
  assert.equal(t3.modelStatus, 'QUOTA_EXCEEDED');
  assert.equal(calls, 2);
  assert.match(t3.reply, /4,900 บาท/);
});
