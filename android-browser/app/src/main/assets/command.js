(function () {
  'use strict';
  const saved = window.__goObserverTargets;
  if (!saved || saved.captureId !== command.captureId || saved.url !== location.href) return {ok:false,reason:'STALE_CAPTURE'};
  const p = command.parameters || {};
  if (command.action === 'SCROLL') {
    const amount = Number(p.amount || 400);
    if (!Number.isFinite(amount) || Math.abs(amount) > 10000) return {ok:false,reason:'INVALID_SCROLL'};
    window.scrollBy(0, amount);
    return {ok:true,reason:'SCROLL_DISPATCHED'};
  }
  const match = /^target-(\d+)$/.exec(p.targetId || '');
  const el = match && saved.nodes[Number(match[1])];
  if (!el || !document.contains(el)) return {ok:false,reason:'TARGET_NOT_FOUND'};
  const style = getComputedStyle(el), rect = el.getBoundingClientRect();
  if (style.display === 'none' || style.visibility === 'hidden' || rect.width <= 0 || rect.height <= 0 || el.disabled) return {ok:false,reason:'TARGET_NOT_VISIBLE'};
  if ((el.type || '').toLowerCase() === 'password') return {ok:false,reason:'PASSWORD_TARGET_REJECTED'};
  if (command.action === 'CLICK') {
    el.click(); return {ok:true,reason:'CLICK_DISPATCHED'};
  }
  if (command.action === 'FILL') {
    if (!['INPUT','TEXTAREA','SELECT'].includes(el.tagName)) return {ok:false,reason:'NON_FORM_TARGET'};
    const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el),'value');
    if (descriptor && descriptor.set) descriptor.set.call(el,p.value || ''); else el.value = p.value || '';
    el.dispatchEvent(new Event('input',{bubbles:true}));
    el.dispatchEvent(new Event('change',{bubbles:true}));
    return {ok:true,reason:'FILL_DISPATCHED'};
  }
  return {ok:false,reason:'UNSUPPORTED_ACTION'};
}())
