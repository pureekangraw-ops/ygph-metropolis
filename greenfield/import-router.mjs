export const METRO_IMPORT_KIND = Object.freeze({
  BACKUP:'BACKUP',
  FINANCE_SEED:'FINANCE_SEED',
  OBLIGATION:'OBLIGATION',
});

export function detectMetroImport(documentPayload) {
  if (!documentPayload || typeof documentPayload !== 'object' || Array.isArray(documentPayload)) {
    throw new Error('UNSUPPORTED_METRO_IMPORT');
  }
  if (documentPayload.backupFormat === 'ygph-metropolis-greenfield-backup') return METRO_IMPORT_KIND.BACKUP;
  if (documentPayload.format === 'YGPH_METRO_FINANCE_SEED') return METRO_IMPORT_KIND.FINANCE_SEED;
  if (documentPayload.format === 'YGPH_METROPOLIS_RUNTIME_PAYLOAD' && documentPayload.entryPoint === 'runtime.obligation') {
    return METRO_IMPORT_KIND.OBLIGATION;
  }
  throw new Error('UNSUPPORTED_METRO_IMPORT');
}

export function previewMetroImport(documentPayload) {
  const kind = detectMetroImport(documentPayload);
  if (kind === METRO_IMPORT_KIND.BACKUP) return 'ไฟล์นี้จะแทนที่ข้อมูลปัจจุบันทั้งหมด';
  if (kind === METRO_IMPORT_KIND.FINANCE_SEED) {
    const count = Array.isArray(documentPayload.commands) ? documentPayload.commands.length : 0;
    return `จะเพิ่ม ${count} รายการ`;
  }
  const installments = Array.isArray(documentPayload?.payload?.installments)
    ? documentPayload.payload.installments
    : Array.isArray(documentPayload?.installments) ? documentPayload.installments : [];
  return `จะเพิ่มภาระ 1 รายการ และกำหนดชำระ ${installments.length} รายการ`;
}
