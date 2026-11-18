/**
 * Central Chatbot Runtime evolved from YGG Lyra/Genome (`runtime.mjs`).
 * Combines deterministic policy guardrails, pluggable knowledge, session memory,
 * and verified-price output validation.
 */

import { evaluatePolicy } from './policy.mjs';
import { buildSystemPrompt } from './prompts.mjs';
import { extractVerifiedPrices, selectKnowledge } from './knowledge.mjs';
import { InMemorySessionStore } from './session.mjs';

const sensitiveKey = /password|passcode|otp|token|secret|credential|cookie|authorization/i;
const internalTerms = /GO Hub|Work ID|checkpoint|runtime|HERMES|MIMIR|AION|PIXIE|bridge/i;

export function sanitize(value, depth = 0) {
  if (depth > 6) return null;
  if (typeof value === 'string') {
    return value
      .slice(0, 4000)
      .replace(/\bBearer\s+\S+/gi, '[REDACTED]')
      .replace(/\b(password|passcode|otp|token|secret|api[-_ ]?key)\s*[:=]\s*\S+/gi, '[REDACTED]');
  }
  if (Array.isArray(value)) {
    return value.slice(0, 32).map((x) => sanitize(x, depth + 1));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !sensitiveKey.test(key))
        .slice(0, 40)
        .map(([key, item]) => [key, sanitize(item, depth + 1)]),
    );
  }
  return ['number', 'boolean'].includes(typeof value) ? value : null;
}

/**
 * Validates LLM JSON output.
 * Blocks fabricated payment/completion claims, internal jargon, and unverified prices,
 * while allowing verified prices that exist in `knowledge.catalogue`.
 */
export function validReply(output, { verifiedPrices = new Set(), allowInternalTerms = false } = {}) {
  if (
    !output ||
    typeof output !== 'object' ||
    Array.isArray(output) ||
    Object.keys(output).length !== 1 ||
    typeof output.reply !== 'string'
  ) {
    return false;
  }

  const reply = output.reply.trim();
  if (!reply || reply.length > 700) return false;
  if (/[<>]|SYSTEM PROMPT|Bearer\s|password\s*[:=]|token\s*[:=]/i.test(reply)) return false;

  // Never allow the LLM to falsely claim payment or job completion
  if (/เสร็จแล้ว|สำเร็จแล้ว|ชำระแล้ว|รับเงินแล้ว|completed|payment verified|successfully/i.test(reply)) {
    return false;
  }

  if (!allowInternalTerms && internalTerms.test(reply)) {
    return false;
  }

  // Price guardrail: every "X บาท" mentioned must exist in verifiedPrices from catalogue
  const priceMatches = [...reply.matchAll(/(\d[\d,]*)\s*บาท/g)];
  for (const match of priceMatches) {
    const rawNum = match[1];
    const plainNum = rawNum.replace(/,/g, '');
    if (!verifiedPrices.has(rawNum) && !verifiedPrices.has(plainNum)) {
      return false;
    }
  }

  // If reply mentions "ราคา" without any verified catalogue prices at all, block it
  if (/ราคา/i.test(reply) && verifiedPrices.size === 0) {
    return false;
  }

  return true;
}

export function createChatbot({
  rolePrompt,
  persona = '',
  knowledge = {},
  rules = [],
  briefFields,
  provider = null,
  sessionStore = new InMemorySessionStore(),
  clock = Date.now,
  timeoutMs = 10000,
  allowInternalTerms = false,
} = {}) {
  if (provider !== null && typeof provider !== 'function') {
    throw new Error('PROVIDER_INVALID');
  }
  if (typeof clock !== 'function' || !Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 30000) {
    throw new Error('RUNTIME_CONFIG_INVALID');
  }

  const verifiedPrices = extractVerifiedPrices(knowledge);
  const system = buildSystemPrompt({
    rolePrompt,
    persona,
    policies: knowledge.policies ?? [],
  });

  return Object.freeze({
    async respond(input) {
      if (!input || typeof input !== 'object') {
        throw new Error('INPUT_INVALID');
      }

      const request = structuredClone(input);
      const sessionId = typeof request.sessionId === 'string' ? request.sessionId : null;
      const savedSession = sessionId ? (await sessionStore.get(sessionId)) ?? {} : {};

      const mergedContext = {
        ...savedSession,
        ...(request.context ?? {}),
        brief: {
          ...(savedSession.brief ?? {}),
          ...(request.context?.brief ?? {}),
        },
        history: Array.isArray(savedSession.history) ? savedSession.history.slice(-6) : [],
      };

      const selectedKnowledge = selectKnowledge(knowledge, request.text);
      const plan = evaluatePolicy(
        { text: request.text, context: mergedContext },
        { rules, briefFields, selectedKnowledge },
        clock(),
      );

      let finalResult = {
        reply: plan.reply,
        plan,
        executed: false,
        modelStatus: provider ? 'SKIPPED_POLICY_REPLY' : 'NOT_CONFIGURED',
        session: mergedContext,
      };

      if (provider && plan.allowModel && plan.status !== 'BLOCKED') {
        const controller = new AbortController();
        let timer;
        try {
          const call = {
            system,
            text: sanitize(request.text),
            context: sanitize({
              brief: mergedContext.brief,
              history: mergedContext.history,
              knowledge: selectedKnowledge,
            }),
            policy: { action: plan.action, status: plan.status, reason: plan.reason },
            signal: controller.signal,
          };

          const output = await Promise.race([
            Promise.resolve().then(() => provider(call)),
            new Promise((_, reject) => {
              timer = setTimeout(() => {
                controller.abort();
                reject(new Error('PROVIDER_TIMEOUT'));
              }, timeoutMs);
            }),
          ]);

          if (!validReply(output, { verifiedPrices, allowInternalTerms })) {
            finalResult = { ...finalResult, modelStatus: 'INVALID_OUTPUT' };
          } else {
            finalResult = {
              ...finalResult,
              reply: output.reply.trim(),
              modelStatus: 'RESPONDED',
            };
          }
        } catch {
          finalResult = { ...finalResult, modelStatus: 'UNAVAILABLE' };
        } finally {
          clearTimeout(timer);
        }
      }

      if (sessionId && plan.status !== 'BLOCKED') {
        const nextHistory = [
          ...mergedContext.history,
          { role: 'user', text: sanitize(request.text) },
          { role: 'assistant', text: finalResult.reply },
        ].slice(-8);

        await sessionStore.set(sessionId, {
          brief: mergedContext.brief,
          history: nextHistory,
        });
      }

      return finalResult;
    },
  });
}
