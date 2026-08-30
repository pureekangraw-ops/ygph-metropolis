export async function mount({ root, version }) {
  const versionNode = root?.querySelector?.('[data-lighthouse-version]');
  if (versionNode) versionNode.textContent = version;
}
