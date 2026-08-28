import { parseNumericText } from './intent-number.mjs';
import { extractConditionPrefix } from './intent-condition.mjs';
export { evaluateConditionRoute } from './intent-condition.mjs';

const KNOWN_SHORT_TARGETS = Object.freeze(['น้ำมัน', 'ข้าว']);
const DIGIT_NUMBER_RE = /[0-9๐-๙][0-9๐-๙,]*(?:\.[0-9๐-๙]+)?/gu;
const REFERENCE_RE = /คำว่า\s*[“"][^”"]+[”"]\s*หมายถึง/u;

function trimRange(text, start, end) {
  while (start < end && /\s/u.test(text[start])) start += 1;
  while (end > start && /\s/u.test(text[end - 1])) end -= 1;
  return { start, end };
}

function removeLeadingCommandWords(text, start, end) {
  let cursor = start;
  let prohibited = false;
  const prefix = text.slice(cursor, end);
  const noMatch = /^ไม่ต้อง\s*/u.exec(prefix);
  if (noMatch) {
    prohibited = true;
    cursor += noMatch[0].length;
  }
  const afterNo = text.slice(cursor, end);
  const downMatch = /^ลง\s*/u.exec(afterNo);
  if (downMatch) cursor += downMatch[0].length;
  return { start:cursor, end, prohibited };
}

function completeShortSegment(segment) {
  const trimmed = segment.trim();
  const commandless = trimmed.replace(/^ไม่ต้อง\s*/u, '').replace(/^ลง\s*/u, '');
  const target = KNOWN_SHORT_TARGETS.find(item => commandless.startsWith(item));
  if (!target) return false;
  const remainder = commandless.slice(target.length).trim();
  if (!remainder) return false;
  return parseNumericText(remainder).state === 'RESOLVED';
}

function splitByBut(rawText) {
  const pieces = [];
  let start = 0;
  const re = /\s*แต่\s*/gu;
  let match;
  while ((match = re.exec(rawText))) {
    const left = trimRange(rawText, start, match.index);
    if (left.end > left.start) pieces.push({ ...left, connectorBefore:pieces.length ? 'แต่' : null });
    start = match.index + match[0].length;
  }
  const tail = trimRange(rawText, start, rawText.length);
  if (tail.end > tail.start) pieces.push({ ...tail, connectorBefore:pieces.length ? 'แต่' : null });
  return pieces;
}

function splitAdjacentShortGroups(rawText) {
  const starts = [];
  for (let index = 0; index < rawText.length; index += 1) {
    for (const target of KNOWN_SHORT_TARGETS) {
      if (rawText.startsWith(target, index)) starts.push(index);
    }
  }
  const unique = [...new Set(starts)].sort((a,b) => a-b);
  if (unique.length < 2) return [trimRange(rawText, 0, rawText.length)];
  const boundaries = [0];
  let segmentStart = 0;
  for (const candidate of unique) {
    if (candidate <= segmentStart) continue;
    if (completeShortSegment(rawText.slice(segmentStart, candidate))) {
      boundaries.push(candidate);
      segmentStart = candidate;
    }
  }
  if (boundaries.length === 1) return [trimRange(rawText, 0, rawText.length)];
  boundaries.push(rawText.length);
  const groups = [];
  for (let index = 0; index < boundaries.length - 1; index += 1) {
    const range = trimRange(rawText, boundaries[index], boundaries[index + 1]);
    if (range.end > range.start) groups.push({ ...range, connectorBefore:null });
  }
  return groups;
}

function segmentGroups(rawText) {
  if (/\bแต่\b/u.test(rawText) || rawText.includes(' แต่')) {
    const byBut = splitByBut(rawText);
    if (byBut.length > 1) return byBut;
  }
  return splitAdjacentShortGroups(rawText);
}

function numericCandidates(rawText, start, end) {
  const list = [];
  const local = rawText.slice(start, end);
  DIGIT_NUMBER_RE.lastIndex = 0;
  let match;
  while ((match = DIGIT_NUMBER_RE.exec(local))) {
    const absStart = start + match.index;
    list.push({ start:absStart, end:absStart + match[0].length, raw:match[0], parsed:parseNumericText(match[0]) });
  }
  if (list.length === 0) {
    const commandless = rawText.slice(start, end);
    const known = KNOWN_SHORT_TARGETS.find(target => commandless.startsWith(target));
    if (known) {
      const remainderStart = start + known.length;
      const range = trimRange(rawText, remainderStart, end);
      if (range.end > range.start) {
        const raw = rawText.slice(range.start, range.end);
        const parsed = parseNumericText(raw);
        if (parsed.state === 'RESOLVED') list.push({ start:range.start, end:range.end, raw, parsed });
      }
    }
  }
  return list;
}

function unitAfter(rawText, candidate, groupEnd) {
  const tail = rawText.slice(candidate.end, groupEnd);
  const match = /^\s*(กล่อง|บาท)/u.exec(tail);
  if (!match) return null;
  return match[1];
}

function makeSlot(groupId, index, role, rawText, start, end, resolvedValue, state) {
  return Object.freeze({
    slotId:`${groupId}-S${index}`,
    role,
    rawSpan:Object.freeze({ start, end }),
    rawValue:rawText.slice(start, end),
    resolvedValue:resolvedValue == null ? null : Object.freeze(resolvedValue),
    state,
  });
}

function targetRange(rawText, workStart, workEnd, numbers) {
  const end = numbers.length ? numbers[0].start : workEnd;
  return trimRange(rawText, workStart, end);
}

function parseGroup(rawText, range, groupIndex) {
  const groupId = `G${groupIndex + 1}`;
  const questionMatch = /หรือยัง/u.exec(rawText.slice(range.start, range.end));
  const question = questionMatch ? Object.freeze({
    rawText:questionMatch[0],
    rawSpan:Object.freeze({
      start:range.start + questionMatch.index,
      end:range.start + questionMatch.index + questionMatch[0].length,
    }),
  }) : null;
  const condition = extractConditionPrefix(rawText, {
    start:range.start,
    end:range.end,
    groupId,
  });
  const commandStart = condition?.rawSpan?.end ?? range.start;
  const command = removeLeadingCommandWords(rawText, commandStart, question?.rawSpan.start ?? range.end);
  const numbers = numericCandidates(rawText, command.start, command.end);
  const target = targetRange(rawText, command.start, command.end, numbers);
  const slots = [];
  let slotIndex = 1;
  if (target.end > target.start) {
    slots.push(makeSlot(groupId, slotIndex++, 'TARGET', rawText, target.start, target.end, rawText.slice(target.start, target.end), 'RESOLVED'));
  }

  const explicitRoles = numbers.map(candidate => ({ candidate, unit:unitAfter(rawText, candidate, command.end) }));
  const hasExplicitUnit = explicitRoles.some(item => item.unit);
  let needsRecovery = false;

  if (numbers.length === 1 && !hasExplicitUnit) {
    const item = numbers[0];
    if (item.parsed.state === 'RESOLVED' && target.end > target.start) {
      slots.push(makeSlot(groupId, slotIndex++, 'MONEY', rawText, item.start, item.end, {
        value:item.parsed.value, unit:null, amountSatang:item.parsed.amountSatang,
      }, 'RESOLVED'));
    } else {
      needsRecovery = true;
      slots.push(makeSlot(groupId, slotIndex++, 'NUMBER', rawText, item.start, item.end, null, 'INVALID'));
    }
  } else if (numbers.length > 1 && !hasExplicitUnit) {
    needsRecovery = true;
    for (const item of numbers) {
      slots.push(makeSlot(groupId, slotIndex++, 'NUMBER', rawText, item.start, item.end,
        item.parsed.state === 'RESOLVED' ? { value:item.parsed.value } : null,
        item.parsed.state === 'RESOLVED' ? 'AMBIGUOUS' : 'INVALID'));
    }
  } else {
    for (const { candidate:item, unit } of explicitRoles) {
      if (item.parsed.state !== 'RESOLVED') {
        needsRecovery = true;
        slots.push(makeSlot(groupId, slotIndex++, 'NUMBER', rawText, item.start, item.end, null, 'INVALID'));
        continue;
      }
      if (unit === 'กล่อง') {
        slots.push(makeSlot(groupId, slotIndex++, 'QUANTITY', rawText, item.start, item.end, { value:item.parsed.value, unit }, 'RESOLVED'));
      } else if (unit === 'บาท') {
        slots.push(makeSlot(groupId, slotIndex++, 'MONEY', rawText, item.start, item.end, { value:item.parsed.value, unit, amountSatang:item.parsed.amountSatang }, 'RESOLVED'));
      } else {
        needsRecovery = true;
        slots.push(makeSlot(groupId, slotIndex++, 'NUMBER', rawText, item.start, item.end, { value:item.parsed.value }, 'AMBIGUOUS'));
      }
    }
  }

  if (numbers.length === 0) needsRecovery = true;
  if (question) {
    slots.push(makeSlot(groupId, slotIndex++, 'QUESTION', rawText,
      question.rawSpan.start, question.rawSpan.end, 'QUERY', 'RESOLVED'));
  }
  return {
    needsRecovery,
    group:Object.freeze({
      groupId,
      rawSpan:Object.freeze({ start:range.start, end:range.end }),
      rawText:rawText.slice(range.start, range.end),
      connectorBefore:range.connectorBefore ?? null,
      prohibited:command.prohibited,
      intent:question ? 'QUERY' : 'COMMAND',
      question,
      condition,
      slots:Object.freeze(slots),
    }),
  };
}

export function parseIntentTask1(rawText) {
  if (typeof rawText !== 'string') throw new TypeError('INTENT_TASK1_TEXT_REQUIRED');
  if (REFERENCE_RE.test(rawText)) return Object.freeze({ status:'REFERENCE', rawText, groups:Object.freeze([]) });
  const ranges = segmentGroups(rawText);
  const parsed = ranges.map((range, index) => parseGroup(rawText, range, index));
  const status = parsed.some(item => item.needsRecovery) ? 'RECOVERY_REQUIRED' : 'PARSED';
  return Object.freeze({ status, rawText, groups:Object.freeze(parsed.map(item => item.group)) });
}
