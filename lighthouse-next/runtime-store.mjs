import { withRuntimeSession } from '../greenfield/runtime-session.mjs';
import { projectStockTruth } from '../greenfield/calculation-authority.mjs';
import { listActiveProducts } from '../greenfield/store-products.mjs';

function requiredText(value, code) {
  const output = String(value ?? '').trim();
  if (!output) throw new Error(code);
  return output;
}

function positiveQuantity(value) {
  const output = Number(value);
  if (!Number.isSafeInteger(output) || output <= 0) throw new Error('LIGHTHOUSE_STORE_QUANTITY_INVALID');
  return output;
}

function bahtToSatang(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('LIGHTHOUSE_STORE_AMOUNT_INVALID');
  const satang = Math.round(amount * 100);
  if (!Number.isSafeInteger(satang) || satang <= 0 || Math.abs((satang / 100) - amount) > 1e-9) {
    throw new Error('LIGHTHOUSE_STORE_AMOUNT_INVALID');
  }
  return satang;
}

function duplicateCommand(error) {
  return String(error?.message || error || '').startsWith('DUPLICATE_COMMAND:');
}

function sameOptional(expected, actual) {
  const left = expected == null || String(expected).trim() === '' || String(expected).trim() === 'ไม่มี' ? null : String(expected).trim();
  const right = actual == null || String(actual).trim() === '' ? null : String(actual).trim();
  return left === right;
}

function sameDescriptors(expected, actual) {
  const normalize = values => (Array.isArray(values) ? values : [])
    .map(value => String(value ?? '').trim())
    .filter(Boolean)
    .sort((a,b) => a.localeCompare(b, 'th'));
  return JSON.stringify(normalize(expected)) === JSON.stringify(normalize(actual));
}

function buildTruth(state) {
  if (!state) throw new Error('LIGHTHOUSE_STORE_STATE_REQUIRED');
  const stock = projectStockTruth(state);
  const products = listActiveProducts(state).map(product => Object.freeze({
    ...structuredClone(product),
    quantity:Number(stock.byProductId?.[product.productId] ?? 0),
  }));
  return Object.freeze({
    revision:state.revision ?? null,
    stockQuantity:Number(stock.stockQuantity || 0),
    legacyUnassignedQuantity:Number(stock.legacyUnassignedQuantity || 0),
    products:Object.freeze(products),
  });
}

function productFrom(state, productId) {
  const record = state?.domains?.STORE?.records?.[productId]?.record;
  return record?.type === 'PRODUCT' && record?.productId === productId && record?.status === 'ACTIVE' ? record : null;
}

function verifyProduct(state, { productId, name, model, color, descriptors }) {
  const record = productFrom(state, productId);
  if (!record || String(record.name || '') !== name || !sameOptional(model, record.model) || !sameOptional(color, record.color) || !sameDescriptors(descriptors, record.descriptors)) {
    throw new Error('LIGHTHOUSE_STORE_READBACK_MISMATCH');
  }
  return record;
}

function verifyStockMovement(state, { stockRecordId, productId, quantity }) {
  const record = state?.domains?.STORE?.records?.[stockRecordId]?.record;
  if (!record || record.type !== 'STOCK_ADJUSTMENT' || record.productId !== productId || Number(record.quantity) !== quantity || record.status !== 'COMPLETED') {
    throw new Error('LIGHTHOUSE_STORE_READBACK_MISMATCH');
  }
  return record;
}

function verifySale(state, { saleId, ledgerTransactionId, productId, quantity, amountSatang }) {
  const sale = state?.domains?.STORE?.records?.[saleId]?.record;
  const ledger = state?.domains?.LEDGER?.records?.[ledgerTransactionId]?.record;
  if (!sale || sale.type !== 'SALE' || sale.productId !== productId || Number(sale.quantity) !== quantity ||
      Number(sale.totalSatang ?? sale.amountSatang) !== amountSatang || Number(sale.receivedSatang) !== amountSatang || sale.status !== 'COMPLETED') {
    throw new Error('LIGHTHOUSE_STORE_READBACK_MISMATCH');
  }
  if (!ledger || ledger.type !== 'TRANSACTION' || ledger.direction !== 'IN' || Number(ledger.amountSatang) !== amountSatang ||
      ledger.detail !== 'IN:SALE' || ledger.sourceRef !== `STORE/${saleId}`) {
    throw new Error('LIGHTHOUSE_STORE_READBACK_MISMATCH');
  }
  return { sale, ledger };
}

export function createLighthouseStoreBridge(deps = {}) {
  const withSession = deps.withSession ?? withRuntimeSession;

  async function readStoreTruth() {
    return withSession(async runtime => buildTruth(await runtime.readState()));
  }

  async function createProductWithStock({ workflowId, productId, stockRecordId, name, model, color, descriptors, quantity } = {}) {
    const workflow = requiredText(workflowId, 'LIGHTHOUSE_STORE_WORKFLOW_ID_REQUIRED');
    const product = requiredText(productId, 'LIGHTHOUSE_STORE_PRODUCT_ID_REQUIRED');
    const stockRecord = requiredText(stockRecordId, 'LIGHTHOUSE_STORE_STOCK_RECORD_ID_REQUIRED');
    const productName = requiredText(name, 'LIGHTHOUSE_STORE_PRODUCT_NAME_REQUIRED');
    const qty = positiveQuantity(quantity);
    return withSession(async runtime => {
      const before = await runtime.readState();
      const existingProduct = productFrom(before, product);
      const existingStock = before?.domains?.STORE?.records?.[stockRecord]?.record;
      let recovered = false;
      if (existingProduct || existingStock) {
        verifyProduct(before, { productId:product, name:productName, model, color, descriptors });
        verifyStockMovement(before, { stockRecordId:stockRecord, productId:product, quantity:qty });
        recovered = true;
      } else {
        try {
          await runtime.createProductStock({ workflowId:workflow, productId:product, stockRecordId:stockRecord, name:productName, model, color, descriptors, quantity:qty });
        } catch (error) {
          if (!duplicateCommand(error)) throw error;
          recovered = true;
        }
      }
      const state = await runtime.readState();
      verifyProduct(state, { productId:product, name:productName, model, color, descriptors });
      verifyStockMovement(state, { stockRecordId:stockRecord, productId:product, quantity:qty });
      const truth = buildTruth(state);
      const actual = truth.products.find(item => item.productId === product)?.quantity;
      if (actual !== qty) throw new Error('LIGHTHOUSE_STORE_READBACK_MISMATCH');
      return Object.freeze({ status:'VERIFIED', recovered, product:structuredClone(productFrom(state, product)), stock:actual, truth });
    });
  }

  async function addProductStock({ workflowId, productId, stockRecordId, title, quantity } = {}) {
    const workflow = requiredText(workflowId, 'LIGHTHOUSE_STORE_WORKFLOW_ID_REQUIRED');
    const product = requiredText(productId, 'LIGHTHOUSE_STORE_PRODUCT_ID_REQUIRED');
    const stockRecord = requiredText(stockRecordId, 'LIGHTHOUSE_STORE_STOCK_RECORD_ID_REQUIRED');
    const stockTitle = requiredText(title, 'LIGHTHOUSE_STORE_STOCK_TITLE_REQUIRED');
    const qty = positiveQuantity(quantity);
    return withSession(async runtime => {
      const beforeState = await runtime.readState();
      if (!productFrom(beforeState, product)) throw new Error(`LIGHTHOUSE_STORE_PRODUCT_NOT_FOUND:${product}`);
      const before = Number(projectStockTruth(beforeState).byProductId?.[product] ?? 0);
      const existing = beforeState?.domains?.STORE?.records?.[stockRecord]?.record;
      let recovered = false;
      if (existing) {
        verifyStockMovement(beforeState, { stockRecordId:stockRecord, productId:product, quantity:qty });
        recovered = true;
      } else {
        try {
          await runtime.addProductStock({ workflowId:workflow, productId:product, stockRecordId:stockRecord, title:stockTitle, quantity:qty });
        } catch (error) {
          if (!duplicateCommand(error)) throw error;
          recovered = true;
        }
      }
      const state = await runtime.readState();
      verifyStockMovement(state, { stockRecordId:stockRecord, productId:product, quantity:qty });
      const post = Number(projectStockTruth(state).byProductId?.[product] ?? 0);
      if (!recovered && post !== before + qty) throw new Error('LIGHTHOUSE_STORE_READBACK_MISMATCH');
      if (recovered && existing && post !== before) throw new Error('LIGHTHOUSE_STORE_READBACK_MISMATCH');
      return Object.freeze({ status:'VERIFIED', recovered, postStock:post, truth:buildTruth(state) });
    });
  }

  async function sellProduct({ workflowId, saleId, ledgerTransactionId, productId, productName, quantity, totalBaht } = {}) {
    const workflow = requiredText(workflowId, 'LIGHTHOUSE_STORE_WORKFLOW_ID_REQUIRED');
    const saleRecord = requiredText(saleId, 'LIGHTHOUSE_STORE_SALE_ID_REQUIRED');
    const ledgerRecord = requiredText(ledgerTransactionId, 'LIGHTHOUSE_STORE_LEDGER_ID_REQUIRED');
    const product = requiredText(productId, 'LIGHTHOUSE_STORE_PRODUCT_ID_REQUIRED');
    const title = requiredText(productName, 'LIGHTHOUSE_STORE_PRODUCT_NAME_REQUIRED');
    const qty = positiveQuantity(quantity);
    const amountSatang = bahtToSatang(totalBaht);
    return withSession(async runtime => {
      const beforeState = await runtime.readState();
      if (!productFrom(beforeState, product)) throw new Error(`LIGHTHOUSE_STORE_PRODUCT_NOT_FOUND:${product}`);
      const existingSale = beforeState?.domains?.STORE?.records?.[saleRecord]?.record;
      const existingLedger = beforeState?.domains?.LEDGER?.records?.[ledgerRecord]?.record;
      if (existingSale || existingLedger) {
        verifySale(beforeState, { saleId:saleRecord, ledgerTransactionId:ledgerRecord, productId:product, quantity:qty, amountSatang });
        const currentStock = Number(projectStockTruth(beforeState).byProductId?.[product] ?? 0);
        return Object.freeze({ status:'VERIFIED', recovered:true, postStock:currentStock, truth:buildTruth(beforeState) });
      }
      const beforeStock = Number(projectStockTruth(beforeState).byProductId?.[product] ?? 0);
      if (beforeStock < qty) throw new Error(`LIGHTHOUSE_STORE_INSUFFICIENT_STOCK:${beforeStock}/${qty}`);
      let recovered = false;
      try {
        await runtime.sale({
          workflowId:workflow,
          saleId:saleRecord,
          ledgerTransactionId:ledgerRecord,
          productId:product,
          title,
          amountSatang,
          quantity:qty,
          receivedSatang:amountSatang,
          storeCostSatang:0,
        });
      } catch (error) {
        if (!duplicateCommand(error)) throw error;
        recovered = true;
      }
      const state = await runtime.readState();
      verifySale(state, { saleId:saleRecord, ledgerTransactionId:ledgerRecord, productId:product, quantity:qty, amountSatang });
      const postStock = Number(projectStockTruth(state).byProductId?.[product] ?? 0);
      if (postStock !== beforeStock - qty) throw new Error('LIGHTHOUSE_STORE_READBACK_MISMATCH');
      return Object.freeze({ status:'VERIFIED', recovered, postStock, truth:buildTruth(state) });
    });
  }

  return Object.freeze({ readStoreTruth, createProductWithStock, addProductStock, sellProduct });
}
