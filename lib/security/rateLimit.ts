type RateLimitEntry = {
  count: number;
  resetAt: number;
};

type RateLimitConfig = {
  key: string;
  max: number;
  windowMs: number;
  now?: number;
};

type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
};

const rateLimitStore = new Map<string, RateLimitEntry>();

export function getRequestIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() ?? "unknown";
  }
  return request.headers.get("x-real-ip") ?? "unknown";
}

export function applyRateLimit(config: RateLimitConfig): RateLimitResult {
  const now = config.now ?? Date.now();
  const existing = rateLimitStore.get(config.key);
  if (!existing || existing.resetAt <= now) {
    rateLimitStore.set(config.key, { count: 1, resetAt: now + config.windowMs });
    return {
      allowed: true,
      remaining: Math.max(0, config.max - 1),
      retryAfterSeconds: Math.ceil(config.windowMs / 1000)
    };
  }

  if (existing.count >= config.max) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000))
    };
  }

  existing.count += 1;
  rateLimitStore.set(config.key, existing);
  return {
    allowed: true,
    remaining: Math.max(0, config.max - existing.count),
    retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000))
  };
}

export function clearRateLimitStore() {
  rateLimitStore.clear();
}
