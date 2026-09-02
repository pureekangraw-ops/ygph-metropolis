export function createApp() {
  return Object.freeze({
    id: 'lighthouse',
    surface: 'new-base',
    shell: Object.freeze({
      home: 'chat',
      sections: Object.freeze(['chat', 'manual', 'settings']),
    }),
  });
}
