(() => {
  'use strict';
  const clean = (value, max = 300) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
  const visible = (node) => {
    if (!node || !(node instanceof Element)) return false;
    const style = getComputedStyle(node); const rect = node.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) !== 0 && rect.width > 0 && rect.height > 0;
  };
  const label = (node) => clean(node.getAttribute('aria-label') || node.innerText || node.textContent || node.getAttribute('placeholder') || node.getAttribute('name'));
  const frameId = window.top === window ? 'frame-0' : `frame-${Math.abs([...(`${location.href}|${window.name}`)].reduce((n, ch) => ((n * 31) + ch.charCodeAt(0)) | 0, 7))}`;
  const href = (node) => {
    if (!(node instanceof HTMLAnchorElement) || !node.href) return null;
    try { const u = new URL(node.href); if (!['http:', 'https:'].includes(u.protocol)) return null; u.username = ''; u.password = ''; u.hash = ''; return u.href.slice(0, 800); } catch { return null; }
  };
  const signature = (node) => [node.tagName, node.getAttribute('type') || '', node.getAttribute('role') || '', node.getAttribute('href') || '', label(node)].join('\u001f');
  const publish = () => {
    if (!document.body || document.visibilityState !== 'visible') return;
    const nodes = [...document.querySelectorAll('a,button,input,textarea,select,[role],[tabindex]')]
      .filter(visible).filter((node) => String(node.type || '').toLowerCase() !== 'password').slice(0, 500);
    const captureId = crypto.randomUUID();
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
