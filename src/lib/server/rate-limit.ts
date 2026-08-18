import { getRagConfig } from "@/lib/env";

interface Bucket {
  count: number;
  resetAt: number;
}

/**
 * Rate limiter in-memory per-kunci (IP) per menit untuk internal API.
 *
 * Sederhana dan cukup untuk n8n/single-instance. Untuk multi-instance
 * gunakan Redis/Postgres — ditandai TODO di komentar.
 */
const buckets = new Map<string, Bucket>();

export function rateLimit(
  key: string,
  limit: number = getRagConfig().rateLimitPerMinute,
  windowMs = 60_000,
): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, resetAt: now + windowMs };
  }

  bucket.count += 1;
  if (bucket.count > limit) {
    return { allowed: false, remaining: 0, resetAt: bucket.resetAt };
  }
  return { allowed: true, remaining: limit - bucket.count, resetAt: bucket.resetAt };
}

/** Bersihkan bucket kedaluwarsa (panggil opsional dari timer). */
export function clearExpiredRateLimitBuckets(): void {
  const now = Date.now();
  for (const [key, b] of buckets) {
    if (b.resetAt <= now) buckets.delete(key);
  }
}
