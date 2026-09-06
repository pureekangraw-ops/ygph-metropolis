function normalizeText(text) {
  return String(text || '')
    .replace(/[“”"]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function productNames(product) {
  return [product.name, ...(Array.isArray(product.aliases) ? product.aliases : [])]
    .map((name) => normalizeText(name))
    .filter(Boolean);
}

function findProductMatches(text, products) {
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

export function parseStoreSale(text, products) {
  const clean = normalizeText(text);
  if (!clean) return null;

  const matches = findProductMatches(clean, products);
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
