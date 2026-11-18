/**
 * Lightweight conversational brief/slot extractor.
 * Automatically fills the pending brief field or confirms/resets the brief from natural user replies
 * so multi-turn LINE/Web chats progress smoothly without manual context wiring.
 */

import { DEFAULT_BRIEF_FIELDS } from './policy.mjs';

const CONFIRM_PATTERN = /^(ใช่|ใช่ครับ|ใช่ค่ะ|ถูกต้อง|ตรง|ตรงครับ|ตรงค่ะ|โอเค|เค|ok|yes|confirm|ตามนี้|ได้เลย|ได้ครับ|ได้ค่ะ)[!.\s]*$/i;
const REJECT_PATTERN = /^(ไม่ตรง|ไม่ใช่|ไม่ถูก|ผิด|แก้|แก้ไข|เปลี่ยนใหม่|เริ่มใหม่|no|nope)[!.\s]*$/i;
const QUESTION_ONLY_PATTERN = /^(?:.*[?？]|.*(?:ราคา|เท่าไหร่|กี่บาท|กี่วัน|คืออะไร|ยังไง|มีอะไรบ้าง))$/i;
const GREETING_PATTERN = /^(สวัสดี|หวัดดี|ดีจ้า|ดีครับ|ดีค่ะ|ทักครับ|ทักค่ะ|hi|hello|menu|เมนู)[!.\s]*$/i;
const FILLER_PATTERN = /^(หา|ห๊ะ|ฮะ|เอ๊ะ|อืม|อ่อ|อ๋อ|งง|ครับ|ค่ะ|จ้า|โอ้|\.+|\?+)$/i;

export function extractBriefUpdates({ text, currentBrief = {}, pendingField = null, pendingAction = null, briefFields } = {}) {
  if (typeof text !== 'string') return {};
  const trimmed = text.trim();
  if (!trimmed) return {};

  const updates = {};
  const fields = Array.isArray(briefFields) && briefFields.length > 0 ? briefFields : DEFAULT_BRIEF_FIELDS;

  // Handle confirmation or rejection during CONFIRM_BRIEF
  if (pendingAction === 'CONFIRM_BRIEF' && !currentBrief.confirmed) {
    if (CONFIRM_PATTERN.test(trimmed)) {
      updates.confirmed = true;
      return updates;
    }
    if (REJECT_PATTERN.test(trimmed)) {
      for (const field of fields) {
        updates[field.key] = '';
      }
      updates.confirmed = false;
      return updates;
    }
  }

  // Handle change-of-scope after confirmation
  if (currentBrief.confirmed && /เปลี่ยน|เพิ่ม|change|เพิ่มขอบเขต/i.test(trimmed)) {
    updates.confirmed = false;
    return updates;
  }

  // Skip filling slots on greetings, pure questions, or short fillers like "หา"
  if (GREETING_PATTERN.test(trimmed) || QUESTION_ONLY_PATTERN.test(trimmed) || FILLER_PATTERN.test(trimmed) || trimmed.length < 4) {
    return updates;
  }

  // Fill the field we just asked about (or the first missing field if none tracked)
  const targetField = pendingField && fields.some((f) => f.key === pendingField)
    ? pendingField
    : fields.find((f) => !currentBrief[f.key])?.key;

  if (targetField && !currentBrief[targetField]) {
    updates[targetField] = trimmed.slice(0, 500);
  }

  return updates;
}
