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
  const href = (node) => {
    if (!(node instanceof HTMLAnchorElement) || !node.href) return null;
    try { const u = new URL(node.href); if (!['http:', 'https:'].includes(u.protocol)) return null; u.username = ''; u.password = ''; u.hash = ''; return u.href.slice(0, 800); } catch { return null; }
  };
  const signature = (node) => [node.tagName, node.getAttribute('type') || '', node.getAttribute('role') || '', node.getAttribute('href') || '', label(node)].join('\u001f');
  const nativePort = browser.runtime.connectNative('observatory_observer');
  nativePort.onMessage.addListener((message) => {
    if (!message || message.type !== 'EXECUTE') return;
    const command = message;
    const saved = window.__observatoryTargets;
    const p = command.parameters || {};
    let result = {ok: false, reason: 'STALE_CAPTURE'};
    if (saved && saved.captureId === command.captureId && (p.frameId || command.frameId || 'frame-0') === (saved.frameId || 'frame-0')) {
      if (command.action === 'SCROLL') {
        const amount = Number(p.amount || 400); result = Number.isFinite(amount) && Math.abs(amount) <= 10000 ? (window.scrollBy(0, amount), {ok:true, reason:'SCROLL_DISPATCHED'}) : {ok:false, reason:'INVALID_SCROLL'};
      } else {
        const match = /^(?:[^:]+::)?target-(\d+)$/.exec(p.targetId || command.targetId || ''); const index = match ? Number(match[1]) : -1; const node = index >= 0 ? saved.nodes[index] : null;
        const style = node && getComputedStyle(node), rect = node && node.getBoundingClientRect();
        if (!node || !document.contains(node)) result = {ok:false, reason:'TARGET_NOT_FOUND'};
        else if (style.display === 'none' || style.visibility === 'hidden' || rect.width <= 0 || rect.height <= 0 || node.disabled || node.getAttribute('aria-disabled') === 'true') result = {ok:false, reason:'TARGET_NOT_VISIBLE'};
        else if ((node.type || '').toLowerCase() === 'password' || /password|passcode|otp|verification/i.test(node.getAttribute('autocomplete') || '')) result = {ok:false, reason:'PASSWORD_TARGET_REJECTED'};
        else if (saved.signatures[index] !== [node.tagName, node.getAttribute('type') || '', node.getAttribute('role') || '', node.getAttribute('href') || '', label(node)].join('\u001f') || (p.signature && p.signature !== saved.signatures[index])) result = {ok:false, reason:'TARGET_CHANGED'};
        else if (command.action === 'CLICK') { node.click(); result = {ok:true, reason:'CLICK_DISPATCHED'}; publish(); }
        else if (command.action === 'FILL' && ['INPUT','TEXTAREA','SELECT'].includes(node.tagName)) { const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(node), 'value')?.set; if (setter) setter.call(node, p.value || ''); else node.value = p.value || ''; node.dispatchEvent(new Event('input', {bubbles:true})); node.dispatchEvent(new Event('change', {bubbles:true})); result = {ok:true, reason:'FILL_DISPATCHED'}; publish(); }
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
        targetId: `${frameId}::target-${index}`, frameId, tag, type: String(node.getAttribute('type') || (tag === 'select' ? 'select' : tag)),
        role: node.getAttribute('role') || null, label: label(node), text: clean(node.innerText || node.textContent, 300), href: href(node),
        visibility: 'visible', disabled: Boolean(node.disabled || node.getAttribute('aria-disabled') === 'true'), signature: signature(node),
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
