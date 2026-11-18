#!/usr/bin/env node
/**
 * Local Node HTTP server for previewing the Demo Chat Page + API in your browser.
 * Usage: npm run dev
 */

import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleRequest } from '../src/worker.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicIndexPath = path.resolve(__dirname, '../public/index.html');
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '127.0.0.1';

const env = {
  ENVIRONMENT: process.env.ENVIRONMENT || 'demo',
  LINE_CHANNEL_SECRET: process.env.LINE_CHANNEL_SECRET || '',
  LINE_CHANNEL_ACCESS_TOKEN: process.env.LINE_CHANNEL_ACCESS_TOKEN || '',
  LLM_ENDPOINT: process.env.LLM_ENDPOINT || '',
  LLM_MODEL: process.env.LLM_MODEL || '',
  LLM_API_KEY: process.env.LLM_API_KEY || '',
};

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://${host}:${port}`);

    if (req.method === 'GET' && url.pathname === '/') {
      const html = await fs.readFile(publicIndexPath, 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
      return;
    }

    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const body = chunks.length > 0 ? Buffer.concat(chunks) : undefined;
    const webReq = new Request(url.toString(), {
      method: req.method,
      headers: req.headers,
      body: req.method === 'GET' || req.method === 'HEAD' ? undefined : body,
    });

    const webRes = await handleRequest(webReq, env);
    res.writeHead(webRes.status, Object.fromEntries(webRes.headers.entries()));
    const resBuf = Buffer.from(await webRes.arrayBuffer());
    res.end(resBuf);
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: err.message }));
  }
});

server.listen(port, host, () => {
  console.log(`YGG Sales Bot Demo running at http://${host}:${port}`);
});
