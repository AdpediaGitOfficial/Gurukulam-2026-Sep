import { Inject, Injectable, Logger, type OnModuleDestroy } from "@nestjs/common";
import Redis from "ioredis";
import { ENV, type Env } from "../../config/env";

/**
 * Login lockout: five failures inside fifteen minutes locks the account for
 * thirty (admin-portal-plan.md M1).
 *
 * Redis is the store because the API runs multiple replicas — an in-process
 * counter lets an attacker get five attempts per replica, which defeats the
 * control entirely. Without REDIS_URL it falls back to memory and says so
 * loudly at boot, so a single-instance dev setup works while nobody can
 * mistake it for production behaviour.
 */
export interface LockoutStatus {
  locked: boolean;
  retryAfterSeconds: number;
}

@Injectable()
export class LockoutService implements OnModuleDestroy {
  private readonly logger = new Logger(LockoutService.name);
  private readonly redis: Redis | null;
  private readonly memory = new Map<string, { count: number; expiresAt: number; lockedUntil: number }>();

  constructor(@Inject(ENV) private readonly env: Env) {
    if (env.REDIS_URL) {
      this.redis = new Redis(env.REDIS_URL, { lazyConnect: false, maxRetriesPerRequest: 2 });
      this.redis.on("error", (e) => this.logger.error(`Redis: ${e.message}`));
    } else {
      this.redis = null;
      this.logger.warn(
        "REDIS_URL is not set — login lockout is per-process and will NOT hold across " +
          "replicas. Acceptable for local development only.",
      );
    }
  }

  private key(actor: string, identifier: string): string {
    return `lockout:${actor}:${identifier.toLowerCase()}`;
  }

  /** Called before checking a password. */
  async check(actor: string, identifier: string): Promise<LockoutStatus> {
    const key = this.key(actor, identifier);

    if (this.redis) {
      const ttl = await this.redis.ttl(`${key}:locked`);
      return ttl > 0 ? { locked: true, retryAfterSeconds: ttl } : { locked: false, retryAfterSeconds: 0 };
    }

    const entry = this.memory.get(key);
    const now = Date.now();
    if (entry && entry.lockedUntil > now) {
      return { locked: true, retryAfterSeconds: Math.ceil((entry.lockedUntil - now) / 1000) };
    }
    return { locked: false, retryAfterSeconds: 0 };
  }

  /** Called after a failed password check. Returns the resulting status. */
  async recordFailure(actor: string, identifier: string): Promise<LockoutStatus> {
    const key = this.key(actor, identifier);
    const { LOCKOUT_MAX_ATTEMPTS, LOCKOUT_WINDOW_SECONDS, LOCKOUT_DURATION_SECONDS } = this.env;

    if (this.redis) {
      const count = await this.redis.incr(key);
      // Only the first failure sets the window, so the window is a fixed
      // period after the first attempt rather than sliding forward with each
      // one — otherwise a slow attacker never trips it.
      if (count === 1) await this.redis.expire(key, LOCKOUT_WINDOW_SECONDS);

      if (count >= LOCKOUT_MAX_ATTEMPTS) {
        await this.redis.set(`${key}:locked`, "1", "EX", LOCKOUT_DURATION_SECONDS);
        await this.redis.del(key);
        return { locked: true, retryAfterSeconds: LOCKOUT_DURATION_SECONDS };
      }
      return { locked: false, retryAfterSeconds: 0 };
    }

    const now = Date.now();
    const entry = this.memory.get(key);
    if (!entry || entry.expiresAt <= now) {
      this.memory.set(key, {
        count: 1,
        expiresAt: now + LOCKOUT_WINDOW_SECONDS * 1000,
        lockedUntil: 0,
      });
      return { locked: false, retryAfterSeconds: 0 };
    }

    entry.count += 1;
    if (entry.count >= LOCKOUT_MAX_ATTEMPTS) {
      entry.lockedUntil = now + LOCKOUT_DURATION_SECONDS * 1000;
      entry.count = 0;
      return { locked: true, retryAfterSeconds: LOCKOUT_DURATION_SECONDS };
    }
    return { locked: false, retryAfterSeconds: 0 };
  }

  /** Called after a successful login — a good password clears the counter. */
  async clear(actor: string, identifier: string): Promise<void> {
    const key = this.key(actor, identifier);
    if (this.redis) {
      await this.redis.del(key, `${key}:locked`);
      return;
    }
    this.memory.delete(key);
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis?.quit();
  }
}
