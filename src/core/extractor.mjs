/**
 * Lightweight conversational brief/slot extractor.
 * Automatically fills the pending brief field or confirms the brief from natural user replies
 * so multi-turn LINE/Web chats progress smoothly without manual context wiring.
 */

import { DEFAULT_BRIEF_FIELDS } from './policy.mjs';

const CONFIRM_PATTERN = /^(ใช่|ใช่ครับ|ใช่ค่ะ|ถูกต้อง|ตรง|ตรงครับ|ตรงค่ะ|โอเค|เค|ok|yes|confirm|ตามนี้|ได้เลย|ได้ครับ|ได้ค่ะ)[!.\s]*$/i;
const QUESTION_ONLY_PATTERN = /^(?:.*[?？]|.*(?:ราคา|เท่าไหร่|กี่บาท|กี่วัน|คืออะไร|ยังไง|มีอะไรบ้าง))$/i;
const GREETING_PATTERN = /^(สวัสดี|หวัดดี|ดีครับ|ดีค่ะ|hi|hello|menu|เมนู)$/i;

export function extractBriefUpdates({ text, currentBrief = {}, pendingField = null, pendingAction = null, briefFields } = {}) {
  if (typeof text !== 'string') return {};
  const trimmed = text.trim();
  if (!trimmed) return {};

  const updates = {};
  const fields = Array.isArray(briefFields) && briefFields.length > 0 ? briefFields : DEFAULT_BRIEF_FIELDS;

  // Handle confirmation turn
  if (pendingAction === 'CONFIRM_BRIEF' && !currentBrief.confirmed && CONFIRM_PATTERN.test(trimmed)) {
    updates.confirmed = true;
    return updates;
  }

  // Handle change-of-scope after confirmation
  if (currentBrief.confirmed && /เปลี่ยน|เพิ่ม|change|เพิ่มขอบเขต/i.test(trimmed)) {
    updates.confirmed = false;
    return updates;
  }

  // Skip filling slots on greetings or pure questions
  if (GREETING_PATTERN.test(trimmed) || QUESTION_ONLY_PATTERN.test(trimmed)) {
    return updates;
  }

  // Fill the field we just asked about (or the first missing field if none tracked)
  const targetField = pendingField && fields.some((f) => f.key === pendingField)
    ? pendingField
    : fields.find((f) => !currentBrief[f.key])?.key;

  if (targetField && !currentBrief[targetField] && trimmed.length >= 2) {
    updates[targetField] = trimmed.slice(0, 500);
  }

  return updates;
}
