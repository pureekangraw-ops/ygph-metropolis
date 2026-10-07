(function () {
  'use strict';
  const saved = window.__observatoryTargets || window.__goObserverTargets;
  if (!saved || saved.captureId !== command.captureId) return {ok:false,reason:'STALE_CAPTURE'};
  const p = command.parameters || {};
  if (command.action === 'SCROLL') {
    const amount = Number(p.amount || 400);
    if (!Number.isFinite(amount) || Math.abs(amount) > 10000) return {ok:false,reason:'INVALID_SCROLL'};
    window.scrollBy(0, amount); return {ok:true,reason:'SCROLL_DISPATCHED'};
  }
  if ((p.frameId || command.frameId || 'frame-0') !== (saved.frameId || 'frame-0')) return {ok:false,reason:'FRAME_MISMATCH'};
  const targetId = p.targetId || command.targetId || '';
  const match = /^frame-[^:]+::target-(\d+)$/.exec(targetId) || /^target-(\d+)$/.exec(targetId);
  const index = match ? Number(match[1]) : -1;
  const el = index >= 0 && saved.nodes?.[index];
  if (!el || !document.contains(el)) return {ok:false,reason:'TARGET_NOT_FOUND'};
  const style = getComputedStyle(el), rect = el.getBoundingClientRect();
  if (style.display === 'none' || style.visibility === 'hidden' || rect.width <= 0 || rect.height <= 0 || el.disabled || el.getAttribute('aria-disabled') === 'true') return {ok:false,reason:'TARGET_NOT_VISIBLE'};
  if ((el.type || '').toLowerCase() === 'password' || /password|passcode|otp|verification/i.test(el.getAttribute('autocomplete') || '')) return {ok:false,reason:'PASSWORD_TARGET_REJECTED'};
  const label = (el.getAttribute('aria-label') || el.innerText || el.textContent || el.getAttribute('placeholder') || el.getAttribute('name') || '').trim().slice(0,300);
  const signature = (saved === window.__goObserverTargets && !saved.frameId)
    ? [el.tagName, el.getAttribute('type') || '', el.getAttribute('href') || '', el.getAttribute('role') || '', label].join('\u001f')
    : [el.tagName, el.getAttribute('type') || '', el.getAttribute('role') || '', el.getAttribute('href') || '', label].join('\u001f');
  if (saved.signatures?.[index] !== signature || (p.signature && p.signature !== signature)) return {ok:false,reason:'TARGET_CHANGED'};
  if (command.action === 'CLICK') { el.click(); return {ok:true,reason:'CLICK_DISPATCHED'}; }
  if (command.action === 'FILL') {
    if (!['INPUT','TEXTAREA','SELECT'].includes(el.tagName)) return {ok:false,reason:'NON_FORM_TARGET'};
    if (el.tagName === 'INPUT' && (el.type || '').toLowerCase() === 'password') return {ok:false,reason:'PASSWORD_TARGET_REJECTED'};
    const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el),'value');
    if (descriptor?.set) descriptor.set.call(el,p.value || ''); else el.value = p.value || '';
    el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true}));
    return {ok:true,reason:'FILL_DISPATCHED'};
  }
  return {ok:false,reason:'UNSUPPORTED_ACTION'};
}())
