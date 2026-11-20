import type { Request, Response, NextFunction } from 'express';

export interface RateLimiterOptions {
  maxRequests: number;
  windowMs: number;
  message?: string;
}

export function createIpRateLimiter(options: RateLimiterOptions) {
  const hitsByIp = new Map<string, number[]>();

  function checkAndRecord(
    ip: string,
    nowMs = Date.now()
  ): {
    allowed: boolean;
    remaining: number;
    retryAfterSeconds: number;
  } {
    const cutoff = nowMs - options.windowMs;
    const recent = (hitsByIp.get(ip) ?? []).filter((ts) => ts > cutoff);

    if (recent.length >= options.maxRequests) {
      const oldest = recent[0];
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((oldest + options.windowMs - nowMs) / 1000)
      );
      hitsByIp.set(ip, recent);
      return { allowed: false, remaining: 0, retryAfterSeconds };
    }

    recent.push(nowMs);
    hitsByIp.set(ip, recent);
    return {
      allowed: true,
      remaining: Math.max(0, options.maxRequests - recent.length),
      retryAfterSeconds: 0,
    };
  }

  function middleware(req: Request, res: Response, next: NextFunction) {
    const forwarded = req.headers['x-forwarded-for'];
    const clientIp =
      (typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : undefined) ||
      req.ip ||
      'unknown';

    const result = checkAndRecord(clientIp);
    res.setHeader('X-RateLimit-Limit', String(options.maxRequests));
    res.setHeader('X-RateLimit-Remaining', String(result.remaining));

    if (!result.allowed) {
      res.setHeader('Retry-After', String(result.retryAfterSeconds));
      return res.status(429).json({
        error:
          options.message ||
          `Rate limit reached: maximum ${options.maxRequests} document analyses per hour. Please wait and try again.`,
        retryAfterSeconds: result.retryAfterSeconds,
      });
    }

    return next();
  }

  return { middleware, checkAndRecord };
}

export interface GlobalQuotaOptions {
  maxPerHour: number;
  maxPerDay: number;
  maxPerIpPerHour: number;
}

export interface QuotaCheckResult {
  allowed: boolean;
  reason?: string;
  limitType?: 'per_ip_hour' | 'global_hour' | 'global_day';
  retryAfterSeconds: number;
  remainingHour: number;
  remainingDay: number;
  remainingIpHour: number;
}

/**
 * Enforces all three caps together:
 * - Per-IP hourly cap (e.g. 10/hour)
 * - Global hourly cap (30/hour per BUILD_PLAN.md Phase 3)
 * - Global daily cap (200/day per BUILD_PLAN.md Phase 3)
 */
export function createMultiWindowRateLimiter(options: GlobalQuotaOptions) {
  const HOUR_MS = 60 * 60 * 1000;
  const DAY_MS = 24 * 60 * 60 * 1000;

  let globalHits: number[] = [];
  const ipHits = new Map<string, number[]>();

  function checkAndRecord(ip: string, nowMs = Date.now()): QuotaCheckResult {
    const hourCutoff = nowMs - HOUR_MS;
    const dayCutoff = nowMs - DAY_MS;

    // Prune global hits older than 24h
    globalHits = globalHits.filter((ts) => ts > dayCutoff);
    const globalLastHour = globalHits.filter((ts) => ts > hourCutoff);

    // Prune IP hits older than 1h
    const recentIp = (ipHits.get(ip) ?? []).filter((ts) => ts > hourCutoff);

    // 1. Check daily cap (200/day)
    if (globalHits.length >= options.maxPerDay) {
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((globalHits[0] + DAY_MS - nowMs) / 1000)
      );
      return {
        allowed: false,
        limitType: 'global_day',
        reason: `Daily usage limit reached (${options.maxPerDay} runs per day). Please try again tomorrow.`,
        retryAfterSeconds,
        remainingHour: Math.max(0, options.maxPerHour - globalLastHour.length),
        remainingDay: 0,
        remainingIpHour: Math.max(0, options.maxPerIpPerHour - recentIp.length),
      };
    }

    // 2. Check hourly cap (30/hour)
    if (globalLastHour.length >= options.maxPerHour) {
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((globalLastHour[0] + HOUR_MS - nowMs) / 1000)
      );
      return {
        allowed: false,
        limitType: 'global_hour',
        reason: `Hourly usage limit reached (${options.maxPerHour} runs per hour). Please wait a few minutes and try again.`,
        retryAfterSeconds,
        remainingHour: 0,
        remainingDay: Math.max(0, options.maxPerDay - globalHits.length),
        remainingIpHour: Math.max(0, options.maxPerIpPerHour - recentIp.length),
      };
    }

    // 3. Check per-IP hourly cap (10/hour)
    if (recentIp.length >= options.maxPerIpPerHour) {
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((recentIp[0] + HOUR_MS - nowMs) / 1000)
      );
      ipHits.set(ip, recentIp);
      return {
        allowed: false,
        limitType: 'per_ip_hour',
        reason: `Per-device hourly limit reached (${options.maxPerIpPerHour} analyses per hour from your IP). Please wait and try again.`,
        retryAfterSeconds,
        remainingHour: Math.max(0, options.maxPerHour - globalLastHour.length),
        remainingDay: Math.max(0, options.maxPerDay - globalHits.length),
        remainingIpHour: 0,
      };
    }

    // Allowed: record hit
    globalHits.push(nowMs);
    recentIp.push(nowMs);
    ipHits.set(ip, recentIp);

    return {
      allowed: true,
      retryAfterSeconds: 0,
      remainingHour: Math.max(0, options.maxPerHour - (globalLastHour.length + 1)),
      remainingDay: Math.max(0, options.maxPerDay - globalHits.length),
      remainingIpHour: Math.max(0, options.maxPerIpPerHour - recentIp.length),
    };
  }

  function middleware(req: Request, res: Response, next: NextFunction) {
    const forwarded = req.headers['x-forwarded-for'];
    const clientIp =
      (typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : undefined) ||
      req.ip ||
      'unknown';

    const result = checkAndRecord(clientIp);
    res.setHeader('X-RateLimit-Limit', String(options.maxPerIpPerHour));
    res.setHeader('X-RateLimit-Remaining', String(result.remainingIpHour));
    res.setHeader('X-RateLimit-Hourly-Remaining', String(result.remainingHour));
    res.setHeader('X-RateLimit-Daily-Remaining', String(result.remainingDay));

    if (!result.allowed) {
      res.setHeader('Retry-After', String(result.retryAfterSeconds));
      return res.status(429).json({
        error: result.reason,
        limitType: result.limitType,
        retryAfterSeconds: result.retryAfterSeconds,
      });
    }

    return next();
  }

  return { middleware, checkAndRecord };
}
