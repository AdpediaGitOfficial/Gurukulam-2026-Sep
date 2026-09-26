import { CanActivate, ExecutionContext, Inject, Injectable, Logger, SetMetadata, type OnModuleDestroy } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import Redis from "ioredis";
import type { FastifyRequest } from "fastify";
import { ENV, type Env } from "../../config/env";
import { ApiException } from "../errors";

export const RATE_LIMIT = "rate:limit";

/**
 * `@RateLimit({ limit: 20, windowSeconds: 60 })`
 *
 * Per-CALLER throttling, distinct from the per-account lockout in
 * LockoutService. Those solve different halves of the same problem: lockout
 * stops many guesses against ONE account; this stops many accounts being
 * tried from one source. An attacker spreading attempts across a thousand
 * addresses never trips lockout at all.
 */
export const RateLimit = (options: { limit: number; windowSeconds: number }) =>
  SetMetadata(RATE_LIMIT, options);

@Injectable()
export class RateLimitGuard implements CanActivate, OnModuleDestroy {
  private readonly logger = new Logger(RateLimitGuard.name);
  private readonly redis: Redis | null;
  private readonly memory = new Map<string, { count: number; expiresAt: number }>();

  /**
   * The in-memory fallback is keyed by CALLER, and a caller is an address —
   * something the other end chooses. Without a bound, an attacker walking a
   * /16 fills this map with a million entries that nothing ever removes, and
   * the process dies of memory rather than of the flood it was meant to
   * survive. Redis expires its own keys; this has to do it itself.
   */
  private static readonly MEMORY_LIMIT = 50_000;
  private sweptAt = 0;

  constructor(
    private readonly reflector: Reflector,
    @Inject(ENV) private readonly env: Env,
  ) {
    this.redis = env.REDIS_URL ? new Redis(env.REDIS_URL, { maxRetriesPerRequest: 2 }) : null;
    this.redis?.on("error", (e) => this.logger.error(`Redis: ${e.message}`));
    if (!this.redis) {
      this.logger.warn(
        "REDIS_URL is not set — rate limiting is per-process and will NOT hold across replicas.",
      );
    }
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const options = this.reflector.getAllAndOverride<{ limit: number; windowSeconds: number }>(
      RATE_LIMIT,
      [context.getHandler(), context.getClass()],
    );
    if (!options) return true;

    const request = context.switchToHttp().getRequest<FastifyRequest>();
    // Keyed on the route PATTERN where Fastify exposes it, so a path
    // parameter cannot be varied to get a fresh bucket per request.
    const route = (request as { routeOptions?: { url?: string } }).routeOptions?.url ?? request.url;
    const key = `ratelimit:${route}:${this.callerOf(request)}`;
    const { count, ttl } = await this.hit(key, options.windowSeconds);

    if (count > options.limit) {
      this.logger.warn(`Rate limit hit on ${request.url} by ${this.callerOf(request)}`);
      throw ApiException.rateLimited(ttl);
    }
    return true;
  }

  /**
   * The caller's address, honouring the proxy header only because Fastify is
   * configured with `trustProxy` — without that, a client could set
   * X-Forwarded-For itself and rotate past the limit at will.
   */
  private callerOf(request: FastifyRequest): string {
    return request.ip || "unknown";
  }

  private async hit(key: string, windowSeconds: number): Promise<{ count: number; ttl: number }> {
    if (this.redis) {
      const count = await this.redis.incr(key);
      // The window starts at the first hit rather than sliding with each one,
      // so a slow attacker still trips it eventually.
      if (count === 1) await this.redis.expire(key, windowSeconds);
      const ttl = await this.redis.ttl(key);
      return { count, ttl: ttl > 0 ? ttl : windowSeconds };
    }

    const now = Date.now();
    this.sweep(now);

    const entry = this.memory.get(key);
    if (!entry || entry.expiresAt <= now) {
      this.memory.set(key, { count: 1, expiresAt: now + windowSeconds * 1000 });
      return { count: 1, ttl: windowSeconds };
    }
    entry.count += 1;
    return { count: entry.count, ttl: Math.ceil((entry.expiresAt - now) / 1000) };
  }

  /**
   * Drops expired buckets, at most once a second.
   *
   * If sweeping is not enough — a flood can create entries faster than they
   * expire — the map is cleared outright. Losing the counts briefly lets a
   * burst through; keeping them costs the process. Under that much traffic the
   * answer is Redis, and the warning at boot says so.
   */
  private sweep(now: number): void {
    if (now - this.sweptAt < 1000 && this.memory.size < RateLimitGuard.MEMORY_LIMIT) return;
    this.sweptAt = now;

    for (const [key, entry] of this.memory) {
      if (entry.expiresAt <= now) this.memory.delete(key);
    }

    if (this.memory.size >= RateLimitGuard.MEMORY_LIMIT) {
      this.logger.warn(
        `In-memory rate-limit store hit ${RateLimitGuard.MEMORY_LIMIT} live entries and was ` +
          "cleared. Set REDIS_URL — this store cannot hold under this much traffic.",
      );
      this.memory.clear();
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis?.quit();
  }
}
