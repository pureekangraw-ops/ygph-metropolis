import { RequestGuardError } from './guards.mjs';

export const INTERPRET_RATE_LIMIT_KEY = 'metro-interpreter';

export async function enforceInterpretRateLimit(env) {
  const limiter = env?.INTERPRET_RATE_LIMITER;
  if (!limiter || typeof limiter.limit !== 'function') {
    throw new RequestGuardError('RATE_LIMITER_NOT_CONFIGURED', 503);
  }

  const result = await limiter.limit({ key: INTERPRET_RATE_LIMIT_KEY });
  if (!result?.success) {
    throw new RequestGuardError('RATE_LIMITED', 429);
  }
}
