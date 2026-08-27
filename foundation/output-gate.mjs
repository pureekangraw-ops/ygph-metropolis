const CREATE_TARGET = Object.freeze({ EXPENSE:'OUTCOME', OTHER_INCOME:'INCOME' });

function text(value, code) {
  const output = String(value ?? '').trim();
  if (!output) throw new Error(code);
  return output;
}

function amount(value) {
  const output = Number(value);
  if (!Number.isSafeInteger(output) || output <= 0) throw new Error('OUTPUT_GATE_INVALID_AMOUNT');
  return output;
}

export function translateIntentToAppLanguage(intent) {
  if (!intent || typeof intent !== 'object' || Array.isArray(intent)) throw new Error('OUTPUT_GATE_INVALID_INTENT');
  if (String(intent.version) !== '1') throw new Error('OUTPUT_GATE_UNSUPPORTED_VERSION');
  if (intent.status !== 'READY') throw new Error(`OUTPUT_GATE_NOT_READY:${String(intent.status || 'UNKNOWN')}`);
  if (intent.action !== 'CREATE') throw new Error(`OUTPUT_GATE_UNSUPPORTED_ACTION:${String(intent.action || 'UNKNOWN')}`);
  const object = text(intent.object, 'OUTPUT_GATE_INVALID_OBJECT').toUpperCase();
  const target = CREATE_TARGET[object];
  if (!target) throw new Error(`OUTPUT_GATE_UNSUPPORTED_OBJECT:${object}`);
  return Object.freeze({
    version:'1',
    action:'CREATE',
    target,
    fields:Object.freeze({
      title:text(intent.fields?.title, 'OUTPUT_GATE_TITLE_REQUIRED'),
      amountSatang:amount(intent.fields?.amountSatang),
    }),
  });
}
