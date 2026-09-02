import { createBrowserApp } from './src/browser-app.mjs';

const root = document.getElementById('app');
if (!root) throw new Error('LIGHTHOUSE_APP_ROOT_MISSING');

const app = createBrowserApp({
  root,
  model: {
    chat: {
      messages: [
        { role:'assistant', text:'พร้อมคุยครับ' },
      ],
    },
    manual: {
      summary: {},
    },
    settings: {
      version:'0.1.0-new-base',
      rollbackSupported:false,
    },
  },
});

app.start();
