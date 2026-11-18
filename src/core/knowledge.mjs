/**
 * Knowledge selector & price-verification helper.
 * Keeps LLM context focused and provides verified price facts for output guardrails.
 */

function tokenize(text) {
  if (typeof text !== 'string') return [];
  return text
    .toLowerCase()
    .split(/[\s,.;:!?()[\]{}"'`/\\]+/)
    .filter((t) => t.length >= 2);
}

function scoreMatch(queryTokens, itemText) {
  if (!queryTokens.length || typeof itemText !== 'string') return 0;
  const lower = itemText.toLowerCase();
  let score = 0;
  for (const token of queryTokens) {
    if (lower.includes(token)) score += 1;
  }
  return score;
}

/**
 * Selects relevant catalogue and FAQ items for a given query while preserving
 * the full list of verified prices for the output guardrail.
 */
export function selectKnowledge(knowledge = {}, query = '', { maxItems = 8 } = {}) {
  const catalogue = Array.isArray(knowledge.catalogue) ? knowledge.catalogue : [];
  const faq = Array.isArray(knowledge.faq) ? knowledge.faq : [];
  const policies = Array.isArray(knowledge.policies) ? knowledge.policies : [];
  const tokens = tokenize(query);

  const rank = (items, toText) => {
    if (items.length <= maxItems) return items;
    return items
      .map((item, idx) => ({ item, idx, score: scoreMatch(tokens, toText(item)) }))
      .sort((a, b) => b.score - a.score || a.idx - b.idx)
      .slice(0, maxItems)
      .map((x) => x.item);
  };

  const selectedCatalogue = rank(
    catalogue,
    (c) => `${c.id ?? ''} ${c.name ?? ''} ${c.category ?? ''} ${c.description ?? ''} ${(c.tags ?? []).join(' ')}`,
  );

  const selectedFaq = rank(
    faq,
    (f) => `${f.q ?? f.question ?? ''} ${f.a ?? f.answer ?? ''} ${(f.tags ?? []).join(' ')}`,
  );

  return {
    catalogue: selectedCatalogue,
    faq: selectedFaq,
    policies: policies.slice(0, maxItems),
  };
}

/**
 * Extracts verified numeric prices from the knowledge catalogue so the output
 * guardrail can allow real prices while blocking fabricated ones.
 */
export function extractVerifiedPrices(knowledge = {}) {
  const catalogue = Array.isArray(knowledge.catalogue) ? knowledge.catalogue : [];
  const prices = new Set();

  for (const item of catalogue) {
    if (typeof item?.price === 'number' && Number.isFinite(item.price) && item.price >= 0) {
      prices.add(String(Math.round(item.price)));
      prices.add(item.price.toLocaleString('en-US'));
    }
    if (typeof item?.priceText === 'string') {
      const matches = item.priceText.match(/\d[\d,]*/g) ?? [];
      for (const m of matches) {
        prices.add(m);
        prices.add(m.replace(/,/g, ''));
      }
    }
  }

  return prices;
}
