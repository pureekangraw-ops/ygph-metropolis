function normalizeText(value) {
  return String(value ?? '').replace(/\s+/gu, ' ').trim();
}

function comparable(value) {
  return normalizeText(value).toLocaleLowerCase('en-US');
}

function normalizeRequired(value, code) {
  const output = normalizeText(value);
  if (!output) throw new Error(code);
  return output;
}

function normalizeOptional(value) {
  const output = normalizeText(value);
  if (!output || output === 'ไม่มี') return null;
  return output;
}

function normalizeDescriptors(values) {
  if (!Array.isArray(values)) return [];
  const seen = new Set();
  const output = [];
  for (const value of values) {
    const descriptor = normalizeOptional(value);
    if (!descriptor) continue;
    const key = comparable(descriptor);
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(descriptor);
  }
  return output.sort((a, b) => a.localeCompare(b, 'th'));
}

export function normalizeProductIdentity(input = {}) {
  const product = { name:normalizeRequired(input.name, 'INVALID_PRODUCT_NAME') };
  const model = normalizeOptional(input.model);
  const color = normalizeOptional(input.color);
  const descriptors = normalizeDescriptors(input.descriptors);
  if (model) product.model = model;
  if (color) product.color = color;
  if (descriptors.length) product.descriptors = descriptors;
  return product;
}

export function listActiveProducts(state) {
  return Object.values(state?.domains?.STORE?.records || {})
    .map(entry => entry?.record)
    .filter(record => record?.type === 'PRODUCT' && record?.status === 'ACTIVE' && record?.productId)
    .map(record => structuredClone(record))
    .sort((a, b) => String(a.productId).localeCompare(String(b.productId)));
}

function descriptorsContain(candidate, requested) {
  if (!requested.length) return true;
  const values = new Set(normalizeDescriptors(candidate).map(comparable));
  return requested.every(value => values.has(comparable(value)));
}

export function findProductCandidates(state, query = {}) {
  const requested = normalizeProductIdentity(query);
  return listActiveProducts(state).filter(product => {
    if (comparable(product.name) !== comparable(requested.name)) return false;
    if (requested.model && comparable(product.model) !== comparable(requested.model)) return false;
    if (requested.color && comparable(product.color) !== comparable(requested.color)) return false;
    if (requested.descriptors && !descriptorsContain(product.descriptors, requested.descriptors)) return false;
    return true;
  });
}
