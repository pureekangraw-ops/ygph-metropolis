import { parseGeneralIncome } from './general-income.mjs';
import { parseStoreSale } from './store-sale.mjs';

function incomplete(kind, slots, missing = [], ambiguous = []) {
  return {
    kind,
    status: missing.length || ambiguous.length ? 'INCOMPLETE' : 'READY',
    slots,
    missing,
    ambiguous,
  };
}

function storeSaleIntent(parsed) {
  if (!parsed) return null;
  if (parsed.ambiguous) {
    return incomplete(
      'STORE_SALE',
      {
        productId: null,
        productName: null,
        quantity: null,
        priceBaht: null,
        priceBasis: null,
      },
      [],
      [{ slot: 'product', candidates: parsed.candidates || [] }],
    );
  }

  const slots = {
    productId: parsed.productId || null,
    productName: parsed.productName || null,
    quantity: parsed.quantity ?? null,
    priceBaht: parsed.priceBaht ?? parsed.value ?? null,
    priceBasis: parsed.priceBasis ?? null,
  };
  const missing = [];
  if (!slots.quantity) missing.push('quantity');
  if (!slots.priceBaht) missing.push('priceBaht');
  if (slots.quantity > 1 && !slots.priceBasis) missing.push('priceBasis');
  return incomplete('STORE_SALE', slots, missing, []);
}

function generalIncomeIntent(parsed) {
  if (!parsed) return null;
  const slots = {
    amount: parsed.amount,
    source: parsed.source ?? null,
  };
  const missing = [];
  if (!slots.source) missing.push('source');
  return incomplete('GENERAL_INCOME', slots, missing, []);
}

export function interpretChatIntent(text, { storeProducts = [] } = {}) {
  const store = storeSaleIntent(parseStoreSale(text, storeProducts));
  if (store) return store;

  const income = generalIncomeIntent(parseGeneralIncome(text));
  if (income) return income;

  return null;
}
