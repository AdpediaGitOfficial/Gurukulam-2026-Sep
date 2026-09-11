/**
 * Clears this machine's auth rate-limit buckets.
 *
 * The verification suites all sign in repeatedly from one address, so without
 * this the throttle treats a full sweep as credential spraying — which is the
 * control working correctly and a dozen unrelated-looking failures. The suites
 * are not the threat model, so each clears its own bucket at start.
 *
 * The default matches .env: the API loads that file, a plain tsx process
 * does not.
 */
export async function clearRateLimit(): Promise<void> {
  const url = process.env.REDIS_URL ?? "redis://127.0.0.1:6379";
  const { default: Redis } = await import("ioredis");
  const redis = new Redis(url, { maxRetriesPerRequest: 1, lazyConnect: true });
  try {
    await redis.connect();
    const keys = await redis.keys("ratelimit:*");
    if (keys.length) await redis.del(...keys);
  } catch {
    // No Redis means the guard fell back to per-process counters, which die
    // with the API anyway. Nothing to clear.
  } finally {
    redis.disconnect();
  }
}
