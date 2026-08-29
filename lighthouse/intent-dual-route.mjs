import { parseIntentTask1 } from './intent-parser.mjs';
import { FOUNDATION_PATTERN_EXPENSE_TERMS } from './pattern-input.mjs';

const DIRECT_TARGETS = new Set(FOUNDATION_PATTERN_EXPENSE_TERMS);
const POLITE_PREFIX_RE = /^\s*ช่วย\s*/u;
const POLITE_SUFFIX_RE = /\s*(?:ให้หน่อย)?\s*(?:ครับ|ค่ะ|คะ|นะครับ|นะคะ)\s*$/u;
const EXPLICIT_NEXT_COMMAND_RE = /\s+(?:แล้ว|และ)\s*(?=(?:ไม่ต้อง\s*)?ลง)/gu;

function freeze(value) {
  return Object.freeze(value);
}

function resolvedSlot(group, role) {
  return group?.slots?.find(slot => slot?.role === role && slot?.state === 'RESOLVED') ?? null;
}

function normalizeProbeText(rawText) {
  let text = rawText.trim();
  text = text.replace(POLITE_PREFIX_RE, '');
  text = text.replace(POLITE_SUFFIX_RE, '');
  return text.trim();
}

function splitExplicitCommandRanges(rawText) {
  const ranges = [];
  let start = 0;
  EXPLICIT_NEXT_COMMAND_RE.lastIndex = 0;
  let match;
  while ((match = EXPLICIT_NEXT_COMMAND_RE.exec(rawText))) {
    const leftEnd = match.index;
    if (rawText.slice(start, leftEnd).trim()) ranges.push({ start, end:leftEnd });
    start = match.index + match[0].length;
  }
  if (ranges.length === 0) return null;
  if (rawText.slice(start).trim()) ranges.push({ start, end:rawText.length });
  return ranges.length > 1 ? ranges : null;
}

function rebaseSlot(slot, offset, originalText, groupId, slotIndex) {
  const start = slot.rawSpan.start + offset;
  const end = slot.rawSpan.end + offset;
  return freeze({
    ...slot,
    slotId:`${groupId}-S${slotIndex + 1}`,
    rawSpan:freeze({ start, end }),
    rawValue:originalText.slice(start, end),
  });
}

function rebaseGroup(group, range, originalText, groupIndex) {
  const groupId = `G${groupIndex + 1}`;
  const start = range.start + group.rawSpan.start;
  const end = range.start + group.rawSpan.end;
  return freeze({
    ...group,
    groupId,
    rawSpan:freeze({ start, end }),
    rawText:originalText.slice(start, end),
    slots:freeze(group.slots.map((slot, slotIndex) => rebaseSlot(slot, range.start, originalText, groupId, slotIndex))),
  });
}

function parseExplicitGroups(rawText, ranges) {
  const groups = [];
  let needsRecovery = false;
  for (const [index, range] of ranges.entries()) {
    const localText = rawText.slice(range.start, range.end).trim();
    const trimLead = rawText.slice(range.start, range.end).indexOf(localText);
    const actualRange = { start:range.start + trimLead, end:range.start + trimLead + localText.length };
    const parsed = parseIntentTask1(localText);
    if (parsed.status !== 'PARSED') needsRecovery = true;
    for (const group of parsed.groups) groups.push(rebaseGroup(group, actualRange, rawText, groups.length));
  }
  return freeze({
    status:needsRecovery ? 'RECOVERY_REQUIRED' : 'PARSED',
    rawText,
    groups:freeze(groups),
  });
}

function parseForDecision(rawText) {
  const explicitRanges = splitExplicitCommandRanges(rawText);
  if (explicitRanges) return parseExplicitGroups(rawText, explicitRanges);
  return parseIntentTask1(rawText);
}

function groupIsClearDirect(group) {
  if (!group || group.prohibited || group.intent !== 'COMMAND') return false;
  const target = resolvedSlot(group, 'TARGET');
  const money = resolvedSlot(group, 'MONEY');
  const title = typeof target?.resolvedValue === 'string' ? target.resolvedValue.trim() : '';
  return DIRECT_TARGETS.has(title)
    && Number.isSafeInteger(money?.resolvedValue?.amountSatang)
    && money.resolvedValue.amountSatang > 0;
}

export function decideInputRoute(rawText) {
  if (typeof rawText !== 'string' || !rawText.trim()) throw new TypeError('INTENT_DUAL_ROUTE_TEXT_REQUIRED');

  const originalParsed = parseForDecision(rawText.trim());
  if (originalParsed.groups.length > 1) {
    return freeze({ route:'INTERPRET', reason:'MULTI_GROUP', parsed:originalParsed, normalizedForProbe:null });
  }

  const normalizedForProbe = normalizeProbeText(rawText);
  const probeParsed = parseForDecision(normalizedForProbe);
  const direct = probeParsed.status === 'PARSED'
    && probeParsed.groups.length === 1
    && groupIsClearDirect(probeParsed.groups[0]);

  if (direct) {
    return freeze({ route:'DIRECT', reason:'SINGLE_CLEAR', parsed:probeParsed, normalizedForProbe });
  }

  return freeze({ route:'INTERPRET', reason:'UNCLEAR', parsed:originalParsed, normalizedForProbe });
}
