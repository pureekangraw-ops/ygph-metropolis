(function () {
  'use strict';
  const visible = (node) => {
    const style = getComputedStyle(node);
    const rect = node.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
  };
  const label = (node) => (node.getAttribute('aria-label') || node.innerText || node.textContent || '').trim().slice(0, 300);
  const nodes = Array.from(document.querySelectorAll('a,button,[role],input,select,textarea,[tabindex]'))
    .filter(visible)
    .filter((node) => (node.type || '').toLowerCase() !== 'password')
    .slice(0, 500);
  const previous = window.__goObserverTargets;
  const targetsChanged = !previous || previous.url !== location.href || previous.nodes.length !== nodes.length || nodes.some((node,index) => node !== previous.nodes[index]);
  const signature = node => [node.tagName, node.type || '', node.getAttribute('href') || '', node.getAttribute('role') || '', label(node)].join('\u001f');
  window.__goObserverTargets = {captureId: captureToken, nodes, signatures:nodes.map(signature), url: location.href};
  return JSON.stringify({
    captureId: captureToken,
    targetsChanged,
    title: document.title || '',
    url: location.origin + location.pathname,
    text: (document.body && document.body.innerText || '').slice(0, 200000),
    targets: nodes.map((node, index) => {
      const rect = node.getBoundingClientRect();
      return { id: `target-${index}`, role: node.getAttribute('role'), label: label(node), kind: node.tagName.toLowerCase(), left: Math.round(rect.left), top: Math.round(rect.top), right: Math.round(rect.right), bottom: Math.round(rect.bottom) };
    })
  });
}())
