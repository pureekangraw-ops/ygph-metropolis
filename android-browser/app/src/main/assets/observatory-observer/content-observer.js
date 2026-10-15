(() => {
  'use strict';
  const clean = (value, max = 300) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
  const visible = (node) => {
    if (!node || !(node instanceof Element)) return false;
    const style = getComputedStyle(node); const rect = node.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) !== 0 && rect.width > 0 && rect.height > 0;
  };
  const label = (node) => clean(node.getAttribute('aria-label') || node.innerText || node.textContent || node.getAttribute('placeholder') || node.getAttribute('name'));
  const frameId = window.top === window ? 'frame-0' : `frame-${crypto.randomUUID()}`;
  const documentId = crypto.randomUUID();
  const nodeIds = new WeakMap();
  let nextNodeId = 0;
  const targetId = (node) => {
    if (!nodeIds.has(node)) nodeIds.set(node, `${frameId}::${documentId}::target-${++nextNodeId}`);
    return nodeIds.get(node);
  };
  const effectiveType = (node) => String(node.type || node.getAttribute('type') || node.tagName.toLowerCase());
  const href = (node) => {
    if (!(node instanceof HTMLAnchorElement) || !node.href) return null;
    try { const u = new URL(node.href); if (!['http:', 'https:'].includes(u.protocol)) return null; u.username = ''; u.password = ''; u.hash = ''; return u.href.slice(0, 800); } catch { return null; }
  };
  const signature = (node) => [node.tagName, effectiveType(node), node.getAttribute('role') || '', node.getAttribute('href') || '', node.getAttribute('autocomplete') || '', label(node)].join('\u001f');
  // Second safety boundary: native approval cannot override protected fields or high-impact buttons.
  const sensitive = (node) => /password|passcode|otp|verification|credit.card|card.number|cvc|cvv|เลขบัตร|รหัสผ่าน|รหัสยืนยัน/i
    .test([label(node), node.getAttribute('name'), node.getAttribute('autocomplete'), node.getAttribute('type')].join(' '));
  const highImpact = (node) => /pay(?:ment)?|purchase|buy.now|checkout|place.order|transfer|withdraw|delete|remove|erase|discard|submit|send|publish|post|confirm|approve|authorize|accept|consent|ชำระ|จ่ายเงิน|ซื้อ|โอน|ถอน|ลบ|ส่ง|เผยแพร่|ยืนยัน|อนุมัติ/i.test(label(node));

  const nativePort = browser.runtime.connectNative('observatory_observer');
  nativePort.onMessage.addListener((message) => {
    if (!message || message.type !== 'EXECUTE') return;
    const command = message;
    if (!Number.isSafeInteger(command.issuedAtEpochMs) || !Number.isSafeInteger(command.expiresAtEpochMs)
      || command.expiresAtEpochMs <= Date.now() || command.issuedAtEpochMs > Date.now() + 1000
      || command.expiresAtEpochMs - command.issuedAtEpochMs > 30000) {
      nativePort.postMessage({ok:false, reason:'COMMAND_EXPIRED', commandId:command.commandId}); return;
    }
    if (document.visibilityState !== 'visible') {
      nativePort.postMessage({ok:false, reason:'PAGE_NOT_VISIBLE', commandId:command.commandId}); return;
    }
    const saved = window.__observatoryTargets;
    const p = command.parameters || {};
    let result = {ok: false, reason: 'STALE_CAPTURE'};
    if (saved && saved.captureId === command.captureId && (p.frameId || command.frameId || 'frame-0') === (saved.frameId || 'frame-0')) {
      if (command.action === 'SCROLL') {
        const amount = Number(p.amount || 400); result = Number.isFinite(amount) && Math.abs(amount) <= 10000 ? (window.scrollBy(0, amount), {ok:true, reason:'SCROLL_DISPATCHED'}) : {ok:false, reason:'INVALID_SCROLL'};
      } else {
        const index = saved.nodes.findIndex(node => targetId(node) === (p.targetId || command.targetId || '')); const node = index >= 0 ? saved.nodes[index] : null;
        const style = node && getComputedStyle(node), rect = node && node.getBoundingClientRect();
        if (!node || !document.contains(node)) result = {ok:false, reason:'TARGET_NOT_FOUND'};
        else if (style.display === 'none' || style.visibility === 'hidden' || rect.width <= 0 || rect.height <= 0 || node.disabled || node.getAttribute('aria-disabled') === 'true') result = {ok:false, reason:'TARGET_NOT_VISIBLE'};
        else if (sensitive(node) || /one.time.code|current.password|new.password|cc-|webauthn/i.test(node.getAttribute('autocomplete') || '')) result = {ok:false, reason:'SENSITIVE_TARGET'};
        else if (saved.signatures[index] !== signature(node) || !p.signature || p.signature !== saved.signatures[index]) result = {ok:false, reason:'TARGET_CHANGED'};
        else if (command.action === 'CLICK' && (
          highImpact(node) || /^(submit|reset)$/i.test(node.type || '')
          || (node.tagName === 'BUTTON' && node.closest?.('form') && !/^button$/i.test(node.type || ''))
          || (node.tagName === 'A' && (!href(node) || !href(node).startsWith('https://')))
        )) result = {ok:false, reason:'HIGH_IMPACT_REQUIRES_OWNER'};
        else if (command.action === 'CLICK') { node.click(); result = {ok:true, reason:'CLICK_DISPATCHED'}; publish(); }
        else if (command.action === 'FILL' && ['INPUT','TEXTAREA','SELECT'].includes(node.tagName)) {
          if (typeof p.value !== 'string' || p.value.length > 2000 || /^(file|hidden|checkbox|radio|password|submit|reset|button)$/i.test(node.type || '')) result = {ok:false, reason:'UNSAFE_FIELD'};
          else {
            const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(node), 'value')?.set;
            if (setter) setter.call(node, p.value); else node.value = p.value;
            node.dispatchEvent(new Event('input', {bubbles:true})); node.dispatchEvent(new Event('change', {bubbles:true}));
            result = {ok:true, reason:'FILL_DISPATCHED'}; publish();
          }
        }
        else result = {ok:false, reason: command.action === 'FILL' ? 'NON_FORM_TARGET' : 'UNSUPPORTED_ACTION'};
      }
    }
    nativePort.postMessage({...result, commandId: command.commandId});
  });

  const publish = () => {
    if (!document.body || document.visibilityState !== 'visible') return;
    const nodes = [...document.querySelectorAll('a,button,input,textarea,select,[role],[tabindex]')]
      .filter(visible).filter((node) => String(node.type || '').toLowerCase() !== 'password').slice(0, 500);
    const previous = window.__observatoryTargets;
    const targetsChanged = !previous
      || previous.frameId !== frameId
      || previous.url !== location.href
      || previous.nodes.length !== nodes.length
      || nodes.some((node, index) => node !== previous.nodes[index] || signature(node) !== previous.signatures[index]);
    const captureId = targetsChanged ? crypto.randomUUID() : previous.captureId;
    const targets = nodes.map((node, index) => {
      const rect = node.getBoundingClientRect();
      const tag = node.tagName.toLowerCase();
      return {
        targetId: targetId(node), frameId, tag, type: effectiveType(node),
        role: node.getAttribute('role') || null, label: label(node), text: clean(node.innerText || node.textContent, 300), href: href(node),
        visibility: 'visible', disabled: Boolean(node.disabled || node.getAttribute('aria-disabled') === 'true'), signature: signature(node), autocomplete: clean(node.getAttribute('autocomplete') || '', 100),
        left: Math.round(rect.left), top: Math.round(rect.top), right: Math.round(rect.right), bottom: Math.round(rect.bottom)
      };
    });
    window.__observatoryTargets = { captureId, frameId, url: location.href, nodes, signatures: nodes.map(signature) };
    browser.runtime.sendNativeMessage('observatory_observer', {
      type: 'OBSERVATION',
      page: { captureId, frameId, url: location.href, title: document.title || '', text: clean(document.body.innerText, 200000), targets,
        visibility: document.visibilityState, capturesInputValues: false, createsAuthority: false, capturedAt: new Date().toISOString() }
    }).catch(() => {});
  };
  publish();
  const observer = new MutationObserver(() => { clearTimeout(window.__observatoryPublishTimer); window.__observatoryPublishTimer = setTimeout(publish, 350); });
  observer.observe(document.documentElement, {subtree: true, childList: true, attributes: true, attributeFilter: ['aria-label','aria-disabled','disabled','href','role','type']});
  setInterval(publish, 1800);
})();
