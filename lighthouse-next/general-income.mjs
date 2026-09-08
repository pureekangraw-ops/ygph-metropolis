function normalizeText(text) {
  return String(text || '')
    .replace(/[“”"]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeSource(text) {
  let source = normalizeText(text)
    .replace(/^(?:วันนี้\s*)?(?:ได้เงิน|เงินเข้า|รายรับ|ได้)\s*/u, '')
    .trim();

  source = source.replace(/^จาก\s*/u, '').trim();
  source = source.replace(/\s+จาก\s*$/u, '').trim();
  return source || null;
}

export function parseGeneralIncome(text) {
  const clean = normalizeText(text);
  if (!clean) return null;

  const moneyMatch = clean.match(/(?:฿\s*)?([0-9][0-9,]*(?:\.[0-9]{1,2})?)(?:\s*บาท)?/u);
  if (!moneyMatch) return null;

  const amount = Number(moneyMatch[1].replaceAll(',', ''));
  if (!Number.isFinite(amount) || amount <= 0) return null;

  const before = clean.slice(0, moneyMatch.index);
  const after = clean.slice((moneyMatch.index || 0) + moneyMatch[0].length);
  const source = normalizeSource(`${before} ${after}`);

  return { amount, source };
}
