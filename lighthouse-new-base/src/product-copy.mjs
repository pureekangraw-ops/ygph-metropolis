export const PRODUCT_COPY = Object.freeze({
  saved: 'บันทึกแล้ว',
  needsConfirmation: 'กรุณายืนยันก่อนบันทึก',
  tryAgain: 'ยังทำไม่ได้ ลองอีกครั้ง',
  unavailable: 'ยังทำไม่ได้',
});

export function toUserMessage(result) {
  if (result === 'saved') return PRODUCT_COPY.saved;
  if (result === 'needs-confirmation') return PRODUCT_COPY.needsConfirmation;
  if (result === 'try-again') return PRODUCT_COPY.tryAgain;
  return PRODUCT_COPY.unavailable;
}
