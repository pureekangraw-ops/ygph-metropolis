import { createBrowserApp } from './src/browser-app.mjs';
import { createBrowserModel } from './src/browser-model.mjs';
import { createMemoryDailyControls } from './src/daily-controls.mjs';
import { withRuntimeSession } from '../greenfield/runtime-session.mjs';

const root = document.getElementById('app');
if (!root) throw new Error('LIGHTHOUSE_APP_ROOT_MISSING');

function bangkokParts(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone:'Asia/Bangkok',
    year:'numeric',
    month:'2-digit',
    day:'2-digit',
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return {
    date:`${values.year}-${values.month}-${values.day}`,
    year:Number(values.year),
    month:Number(values.month),
  };
}

const dailyControls = createMemoryDailyControls();
const browserModel = createBrowserModel({
  runtimeProvider: withRuntimeSession,
  dailyControls,
});
const today = bangkokParts();
const projected = await browserModel.read(today);

const app = createBrowserApp({
  root,
  model: projected.available ? {
    chat:{ messages:[] },
    manual:projected.manual,
    income:projected.income,
    outcome:projected.outcome,
    calendar:projected.calendar,
    ledger:projected.ledger,
    settings:{ version:'0.1.0-new-base', rollbackSupported:false },
  } : {
    chat:{ messages:[] },
    manual:{ summary:null },
    settings:{ version:'0.1.0-new-base', rollbackSupported:false },
  },
});

app.start();
