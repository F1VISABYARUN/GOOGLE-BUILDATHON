import type { Request, Response, NextFunction } from 'express';

export interface RateLimiterOptions {
  maxRequests: number;
  windowMs: number;
  message?: string;
}

export function createIpRateLimiter(options: RateLimiterOptions) {
  const hitsByIp = new Map<string, number[]>();

  function checkAndRecord(ip: string, nowMs = Date.now()): {
    allowed: boolean;
    remaining: number;
    retryAfterSeconds: number;
  } {
    const cutoff = nowMs - options.windowMs;
    const recent = (hitsByIp.get(ip) ?? []).filter((ts) => ts > cutoff);

    if (recent.length >= options.maxRequests) {
      const oldest = recent[0];
      const retryAfterSeconds = Math.max(1, Math.ceil((oldest + options.windowMs - nowMs) / 1000));
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
