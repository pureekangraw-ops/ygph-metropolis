function normalizeText(text) {
  return String(text || '')
    .replace(/[“”"]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function comparable(value) {
  return normalizeText(value).toLocaleLowerCase('en-US');
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function productNames(product) {
  return [product.name, ...(Array.isArray(product.aliases) ? product.aliases : [])]
    .map((name) => normalizeText(name))
    .filter(Boolean);
}

function findLegacyProductMatches(text, products) {
  const matches = [];
  for (const product of Array.isArray(products) ? products : []) {
    if (!product || !product.id || !product.name) continue;
    for (const name of productNames(product)) {
      const index = text.indexOf(name);
      if (index < 0) continue;
      matches.push({
        productId: product.id,
        productName: product.name,
        matchedName: name,
        index,
        end: index + name.length,
      });
    }
  }
  return matches.sort((a, b) => {
    const lengthDiff = b.matchedName.length - a.matchedName.length;
    if (lengthDiff) return lengthDiff;
    return a.index - b.index;
  });
}

function parseNumberTokens(text) {
  const matches = text.matchAll(/(?:฿\s*)?([0-9][0-9,]*(?:\.[0-9]{1,2})?)(?:\s*บาท)?/gu);
  return [...matches]
    .map((match) => Number(match[1].replaceAll(',', '')))
    .filter((value) => Number.isFinite(value) && value > 0);
}

function parseLegacyStoreSale(clean, products) {
  const matches = findLegacyProductMatches(clean, products);
  if (!matches.length) return null;

  const bestLength = matches[0].matchedName.length;
  const strongest = matches.filter((match) => match.matchedName.length === bestLength);
  const strongestProductIds = [...new Set(strongest.map((match) => match.productId))];
  if (strongestProductIds.length > 1) {
    return {
      ambiguous: true,
      candidates: strongest
        .filter((match, index, list) => list.findIndex((item) => item.productId === match.productId) === index)
        .map((match) => ({ productId: match.productId, productName: match.productName })),
    };
  }

  const chosen = strongest[0];
  const numericTokens = parseNumberTokens(clean.slice(chosen.end));
  const value = numericTokens.length >= 1 ? numericTokens[0] : null;
  const quantityCandidate = numericTokens.length >= 2 ? numericTokens[1] : null;
  const quantity = Number.isInteger(quantityCandidate) && quantityCandidate > 0 ? quantityCandidate : null;

  return {
    productId: chosen.productId,
    productName: chosen.productName,
    value,
    quantity,
  };
}

function durableIdentityParts(product) {
  return [product?.name, product?.model, product?.color, ...(Array.isArray(product?.descriptors) ? product.descriptors : [])]
    .map(normalizeText)
    .filter(Boolean);
}

function durableMatches(clean, products) {
  const haystack = comparable(clean);
  const matches = [];
  for (const product of Array.isArray(products) ? products : []) {
    if (!product?.productId || !product?.name) continue;
    const name = normalizeText(product.name);
    if (!haystack.includes(comparable(name))) continue;
    const optionalParts = durableIdentityParts(product).slice(1);
    const matchedOptional = optionalParts.filter(part => haystack.includes(comparable(part)));
    matches.push({
      product,
      score:matchedOptional.length,
      identityLength:name.length + matchedOptional.reduce((sum, part) => sum + part.length, 0),
    });
  }
  if (!matches.length) return [];
  const maxScore = Math.max(...matches.map(match => match.score));
  const strongest = matches.filter(match => match.score === maxScore);
  const maxIdentityLength = Math.max(...strongest.map(match => match.identityLength));
  return strongest.filter(match => match.identityLength === maxIdentityLength);
}

function parsePositiveNumber(value) {
  const output = Number(String(value ?? '').replaceAll(',', ''));
  return Number.isFinite(output) && output > 0 ? output : null;
}

const QUANTITY_UNITS = 'เครื่อง|ชิ้น|อัน|ขวด|ชุด|กล่อง|แพ็ค|แพ็ก|ใบ|ลูก|ตัว|เส้น|คู่';
const UNIT_PRICE_CUES = 'ชิ้นละ|เครื่องละ|อันละ|ขวดละ|ชุดละ|กล่องละ|แพ็คละ|แพ็กละ|ใบละ|ลูกละ|ตัวละ|เส้นละ|คู่ละ|ต่อชิ้น';

function parseDurableNumbers(clean, product) {
  const quantityMatch = new RegExp(`([0-9][0-9,]*)\\s*(?:${QUANTITY_UNITS})`, 'u').exec(clean);
  const quantity = quantityMatch ? Number(String(quantityMatch[1]).replaceAll(',', '')) : null;
  const safeQuantity = Number.isSafeInteger(quantity) && quantity > 0 ? quantity : null;

  const unitMatch = new RegExp(`(?:${UNIT_PRICE_CUES})\\s*(?:฿\\s*)?([0-9][0-9,]*(?:\\.[0-9]{1,2})?)(?:\\s*บาท)?`, 'u').exec(clean);
  if (unitMatch) return { quantity:safeQuantity, priceBaht:parsePositiveNumber(unitMatch[1]), priceBasis:'UNIT' };

  const totalMatch = /(?:รวม|ทั้งหมด|ยอด)\s*(?:฿\s*)?([0-9][0-9,]*(?:\.[0-9]{1,2})?)(?:\s*บาท)?/u.exec(clean);
  if (totalMatch) return { quantity:safeQuantity, priceBaht:parsePositiveNumber(totalMatch[1]), priceBasis:'TOTAL' };

  let remainder = clean.replace(/^(?:ขาย|จำหน่าย)\s*/u, ' ');
  for (const part of durableIdentityParts(product).sort((a, b) => b.length - a.length)) {
    remainder = remainder.replace(new RegExp(escapeRegExp(part), 'igu'), ' ');
  }
  remainder = remainder.replace(new RegExp(`[0-9][0-9,]*\\s*(?:${QUANTITY_UNITS})`, 'gu'), ' ');
  const bare = parseNumberTokens(remainder);
  const priceBaht = bare.length ? bare[bare.length - 1] : null;
  return {
    quantity:safeQuantity,
    priceBaht,
    priceBasis:priceBaht == null ? null : safeQuantity === 1 ? 'UNIT' : null,
  };
}

function parseDurableStoreSale(clean, products) {
  const strongest = durableMatches(clean, products);
  if (!strongest.length) return null;
  if (strongest.length > 1) {
    return {
      ambiguous:true,
      candidates:strongest.map(({ product }) => ({
        productId:product.productId,
        productName:product.name,
      })),
    };
  }

  const product = strongest[0].product;
  const numbers = parseDurableNumbers(clean, product);
  return {
    productId:product.productId,
    productName:product.name,
    quantity:numbers.quantity,
    priceBaht:numbers.priceBaht,
    priceBasis:numbers.priceBasis,
  };
}

export function parseStoreSale(text, products) {
  const clean = normalizeText(text);
  if (!clean) return null;
  const list = Array.isArray(products) ? products : [];
  if (list.some(product => product?.productId)) return parseDurableStoreSale(clean, list);
  return parseLegacyStoreSale(clean, list);
}
