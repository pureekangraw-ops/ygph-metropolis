#!/usr/bin/env node
/**
 * Interactive local CLI to test the central chatbot in your terminal.
 * Usage:
 *   npm run chat
 *   LLM_ENDPOINT=... LLM_MODEL=... LLM_API_KEY=... npm run chat
 */

import readline from 'node:readline';
import { createChatbot } from '../src/core/runtime.mjs';
import { createOpenAICompatibleProvider } from '../src/core/provider.mjs';
import { defaultBotConfig } from '../config/default-bot.mjs';

const hasLLM = Boolean(process.env.LLM_ENDPOINT && process.env.LLM_MODEL && process.env.LLM_API_KEY);
const provider = hasLLM
  ? createOpenAICompatibleProvider({
      endpoint: process.env.LLM_ENDPOINT,
      model: process.env.LLM_MODEL,
      apiKey: process.env.LLM_API_KEY,
    })
  : null;

const bot = createChatbot({
  ...defaultBotConfig,
  provider,
});

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const sessionId = 'cli:local';

console.log(`YGG Central Chatbot CLI (${hasLLM ? 'LLM Connected' : 'Policy-only Mode'})`);
console.log('พิมพ์ข้อความเพื่อคุยได้เลย (พิมพ์ "exit" เพื่อออก)\n');

function ask() {
  rl.question('คุณ: ', async (line) => {
    const text = line.trim();
    if (!text || text.toLowerCase() === 'exit') {
      rl.close();
      return;
    }
    try {
      const res = await bot.respond({ sessionId, text });
      console.log(`บอท: ${res.reply}`);
      console.log(`     [action=${res.plan.action} status=${res.modelStatus} brief=${JSON.stringify(res.session.brief)}]\n`);
    } catch (err) {
      console.error(`Error: ${err.message}\n`);
    }
    ask();
  });
}

ask();
