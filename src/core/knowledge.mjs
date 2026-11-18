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

/**
 * Normalizes and bounds customer-submitted demo knowledge for a single session
 * so it cannot bloat prompts or mutate the default bot config.
 */
export function normalizeDemoKnowledge(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;

  const storeName = typeof raw.storeName === 'string' ? raw.storeName.trim().slice(0, 80) : '';
  const catalogue = Array.isArray(raw.catalogue)
    ? raw.catalogue
        .slice(0, 20)
        .filter((item) => item && typeof item.name === 'string' && item.name.trim())
        .map((item, idx) => {
          const numPrice = Number(item.price);
          const hasValidPrice = Number.isFinite(numPrice) && numPrice >= 0 && numPrice <= 10000000;
          return {
            id: typeof item.id === 'string' && item.id.trim() ? item.id.trim().slice(0, 40) : `demo-item-${idx + 1}`,
            name: item.name.trim().slice(0, 100),
            category: typeof item.category === 'string' ? item.category.trim().slice(0, 50) : storeName || 'สินค้า',
            price: hasValidPrice ? Math.round(numPrice) : undefined,
            priceText: hasValidPrice
              ? `${Math.round(numPrice).toLocaleString('en-US')} บาท`
              : typeof item.priceText === 'string'
                ? item.priceText.trim().slice(0, 40)
                : '',
            description: typeof item.description === 'string' ? item.description.trim().slice(0, 240) : '',
            tags: Array.isArray(item.tags) ? item.tags.slice(0, 8).map((t) => String(t).slice(0, 30)) : [],
          };
        })
    : [];

  const faq = Array.isArray(raw.faq)
    ? raw.faq
        .slice(0, 20)
        .filter((f) => f && typeof (f.q ?? f.question) === 'string' && typeof (f.a ?? f.answer) === 'string')
        .map((f) => ({
          q: (f.q ?? f.question).trim().slice(0, 160),
          a: (f.a ?? f.answer).trim().slice(0, 300),
          tags: Array.isArray(f.tags) ? f.tags.slice(0, 8).map((t) => String(t).slice(0, 30)) : [],
        }))
    : [];

  const policies = Array.isArray(raw.policies)
    ? raw.policies
        .slice(0, 10)
        .filter((p) => typeof p === 'string' && p.trim())
        .map((p) => p.trim().slice(0, 200))
    : [];

  if (!storeName && catalogue.length === 0 && faq.length === 0 && policies.length === 0) {
    return null;
  }

  return { storeName, catalogue, faq, policies };
}
