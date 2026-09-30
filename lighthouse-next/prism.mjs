function mountPrism() {
  const page = document.querySelector('#page-prism');
  if (!page) return;
  const toast = page.querySelector('[data-prism-toast]');
  const input = page.querySelector('[data-prism-input]');
  let timer;
  const notify = (message) => { toast.textContent = message; clearTimeout(timer); timer = setTimeout(() => { toast.textContent = ''; }, 2600); };
  page.querySelector('[data-prism-form]')?.addEventListener('submit', (event) => { event.preventDefault(); const value = input.value.trim(); if (!value) return notify('พิมพ์คำสั่งก่อนครับ'); notify('รับคำสั่งแล้ว · PRISM จัด route ให้ GO / LIGHT'); input.value = ''; });
  page.querySelectorAll('[data-prism-command]').forEach((button) => button.addEventListener('click', () => { input.value = button.dataset.prismCommand; input.focus(); }));
  page.querySelector('[data-prism-go]')?.addEventListener('click', () => notify('ส่งงานให้ GO แล้ว · รอ receipt')); 
  page.querySelector('[data-prism-light]')?.addEventListener('click', () => notify('Trigger LIGHT แล้ว · ใช้ Work เดิม ไม่สร้างซ้ำ'));
  page.querySelector('[data-prism-run]')?.addEventListener('click', () => notify('เริ่มงานวิ่ง · ไปจุด 1 รับเอกสารก่อน'));
}
mountPrism();
