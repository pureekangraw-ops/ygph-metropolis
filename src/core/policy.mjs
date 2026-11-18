/**
 * Configurable policy engine evolved from YGG Lyra/Genome (`policy.mjs`).
 * Supports data-driven rules & brief schemas while preserving safety guardrails.
 */

const nonempty = (v) => typeof v === 'string' && v.trim().length > 0;
const sensitivePattern = /password|passcode|otp|token|secret|authorization|cookie|รหัสผ่าน|รหัสยืนยัน|รหัสลับ|บัตรเครดิต/i;

export const DEFAULT_BRIEF_FIELDS = [
  { key: 'goal', prompt: 'งานนี้อยากนำไปใช้ทำอะไรครับ?' },
  { key: 'scope', prompt: 'อยากให้ช่วยทำส่วนไหนของงานนี้ครับ?' },
];

function matchesRule(rule, text, ctx) {
  if (typeof rule.match === 'function') {
    return Boolean(rule.match(text, ctx));
  }
  if (rule.match instanceof RegExp) {
    return rule.match.test(text);
  }
  if (Array.isArray(rule.match)) {
    const lower = text.toLowerCase();
    return rule.match.some((kw) => typeof kw === 'string' && lower.includes(kw.toLowerCase()));
  }
  return false;
}

export function evaluatePolicy(input, options = {}, now = Date.now()) {
  if (!input || !nonempty(input.text) || input.text.length > 8000) {
    throw new Error('TEXT_INVALID');
  }
  if (!Number.isSafeInteger(now) || now < 0) {
    throw new Error('CLOCK_INVALID');
  }
  const ctx = input.context ?? {};
  if (!ctx || typeof ctx !== 'object' || Array.isArray(ctx)) {
    throw new Error('CONTEXT_INVALID');
  }

  const plan = {
    action: 'CLARIFY',
    status: 'WAITING',
    reason: null,
    reply: 'อยากให้ช่วยอะไรต่อจากข้อมูลนี้ครับ?',
    allowModel: true,
    matchedRuleId: null,
    businessOutcome: 'UNKNOWN',
    commercial: { payment: 'UNKNOWN' },
  };
  const answer = (fields) => ({ ...plan, ...fields });

  // 1. Hard safety block: never process secrets/credentials/card numbers
  if (sensitivePattern.test(input.text)) {
    return answer({
      action: 'BLOCKED',
      status: 'BLOCKED',
      reason: 'SENSITIVE_INPUT_BLOCKED',
      reply: 'เพื่อความปลอดภัย กรุณาอย่าส่งรหัสผ่าน OTP หรือข้อมูลบัตรผ่านแชทนะครับ',
      allowModel: false,
    });
  }

  // 2. Custom pluggable rules (evaluated in order)
  const customRules = Array.isArray(options.rules) ? options.rules : [];
  for (const rule of customRules) {
    if (rule && matchesRule(rule, input.text, ctx)) {
      return answer({
        action: rule.action ?? 'CUSTOM_RULE',
        status: rule.status ?? 'WAITING',
        reason: rule.reason ?? rule.id ?? 'CUSTOM_RULE',
        reply: rule.reply ?? plan.reply,
        allowModel: Boolean(rule.allowModel),
        matchedRuleId: rule.id ?? null,
      });
    }
  }

  // 3. Built-in commercial & escalation guardrails (from GENOME:SHOP)
  if (/โอน|ชำระ|จ่ายแล้ว|สลิป|payment|paid/i.test(input.text)) {
    return answer({
      action: 'REVIEW_PAYMENT',
      reply: 'รับทราบเรื่องการชำระครับ ต้องตรวจหลักฐานก่อนยืนยันยอดนะครับ',
      allowModel: false,
    });
  }
  if (/ร้องเรียน|ไม่พอใจ|งานช้า|refund|complaint/i.test(input.text)) {
    return answer({
      action: 'HANDOFF',
      reason: 'COMPLAINT',
      reply: 'รับทราบปัญหาครับ จะเตรียมรายละเอียดให้ทีมตรวจต่อทันทีครับ',
      allowModel: false,
    });
  }
  if (/คุย.*(?:คน|ทีม|พนักงาน)|เจ้าหน้าที่|แอดมิน|human|manager/i.test(input.text)) {
    return answer({
      action: 'HANDOFF',
      reason: 'HUMAN_REQUEST',
      reply: 'ได้ครับ จะเตรียมข้อมูลที่คุยไว้ให้ทีมงานรับช่วงต่อนะครับ',
      allowModel: false,
    });
  }

  const selectedKnowledge = options.selectedKnowledge ?? {};
  const hasCatalogue = Array.isArray(selectedKnowledge.catalogue) && selectedKnowledge.catalogue.length > 0;
  const hasFaq = Array.isArray(selectedKnowledge.faq) && selectedKnowledge.faq.length > 0;

  if (/ราคา|เท่าไหร่|กี่บาท|แพ็กเกจ|ประเมิน|ใบเสนอ|estimate|quote/i.test(input.text)) {
    if (hasCatalogue) {
      return answer({
        action: 'OBSERVE',
        status: 'OBSERVED',
        reason: 'CATALOGUE_QUOTE',
        reply: 'สามารถดูรายละเอียดแพ็กเกจและราคาจากรายการที่ยืนยันแล้วได้เลยครับ',
        allowModel: true,
      });
    }
    return answer({
      action: 'REQUEST_ESTIMATE',
      reply: 'ได้ครับ จะเตรียมขอบเขตให้ทีมประเมิน ยังไม่มีราคาที่ตรวจยืนยันครับ',
      allowModel: false,
    });
  }

  // 4. Brief collection flow (customizable via briefFields)
  const brief = ctx.brief ?? {};
  if (/เปลี่ยน|เพิ่ม|change|เพิ่มขอบเขต/i.test(input.text) && brief.confirmed) {
    return answer({
      action: 'RECONFIRM_SCOPE',
      reply: 'ขอบเขตเปลี่ยนแล้วครับ ช่วยยืนยันรายละเอียดส่วนที่เปลี่ยนก่อนส่งต่อได้ไหมครับ?',
      allowModel: false,
    });
  }

  // If user is asking a general question and we have knowledge, let LLM answer naturally
  if (/[?？]|ไหม|ยังไง|คืออะไร|มีอะไรบ้าง|รายละเอียด|แนะนำ/i.test(input.text) && (hasCatalogue || hasFaq)) {
    return answer({
      action: 'OBSERVE',
      status: 'OBSERVED',
      reason: 'KNOWLEDGE_QUERY',
      reply: 'ให้รายละเอียดเพิ่มเติมจากข้อมูลที่มีอยู่ครับ',
      allowModel: true,
    });
  }

  const fields = Array.isArray(options.briefFields) && options.briefFields.length > 0
    ? options.briefFields
    : DEFAULT_BRIEF_FIELDS;

  for (const field of fields) {
    if (!nonempty(brief[field.key])) {
      return answer({
        action: 'CLARIFY',
        reason: `MISSING_${String(field.key).toUpperCase()}`,
        reply: field.prompt,
        allowModel: true,
      });
    }
  }

  if (!brief.confirmed) {
    const summaryParts = fields
      .map((f) => (nonempty(brief[f.key]) ? `${f.key}: "${brief[f.key]}"` : null))
      .filter(Boolean);
    const summaryText = summaryParts.length > 0 ? ` (${summaryParts.join(' | ')})` : '';
    return answer({
      action: 'CONFIRM_BRIEF',
      reply: `รายละเอียดที่สรุปไว้${summaryText} ตรงกับงานที่ต้องการไหมครับ?`,
      allowModel: true,
    });
  }

  return answer({
    action: 'PREPARE_HANDOFF',
    reply: 'สรุปพร้อมให้ทีมรับต่อแล้วครับ ยังรอหลักฐานการรับงานนะครับ',
    allowModel: false,
  });
}
