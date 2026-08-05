/*
 * Minimal in-memory sliding-window rate limiter for the contact route.
 *
 * Deliberately dependency-free: a studio inquiry form sees a handful of
 * submissions a day, and this stops someone hammering the endpoint into
 * the email quota. Caveats worth knowing before scaling:
 *   - state lives in the process, so it resets on deploy/cold start and
 *     is not shared between serverless instances;
 *   - for stricter guarantees, swap in a shared store (Upstash Redis,
 *     Vercel KV) behind the same `rateLimit()` signature.
 */

type Hit = { count: number; resetAt: number };

const buckets = new Map<string, Hit>();

const WINDOW_MS = 10 * 60_000; // 10 minutes
const MAX_HITS = 5; // submissions per window per key
const MAX_BUCKETS = 5_000; // hard cap so the map can't grow unbounded

export type RateResult = {
  ok: boolean;
  /** Seconds until the window resets (only meaningful when !ok). */
  retryAfter: number;
};

export function rateLimit(
  key: string,
  { windowMs = WINDOW_MS, max = MAX_HITS } = {}
): RateResult {
  const now = Date.now();

  // opportunistic sweep of expired buckets
  if (buckets.size > MAX_BUCKETS) {
    for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k);
  }

  const hit = buckets.get(key);
  if (!hit || hit.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfter: 0 };
  }
  hit.count += 1;
  if (hit.count > max) {
    return { ok: false, retryAfter: Math.ceil((hit.resetAt - now) / 1000) };
  }
  return { ok: true, retryAfter: 0 };
}

/** Best-effort client IP from proxy headers. */
export function clientIp(headers: Headers): string {
  const fwd = headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return headers.get("x-real-ip") ?? "unknown";
}
