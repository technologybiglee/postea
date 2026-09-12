import { Request, Response, NextFunction } from 'express';

interface Bucket {
  count: number;
  resetAt: number;
}

/**
 * Minimal in-memory fixed-window rate limiter, keyed by IP.
 * Intended for login/register/onboarding endpoints to slow down brute-force
 * and abuse. Good enough for a single instance; if this API ever runs behind
 * multiple replicas, swap the in-memory Map for a shared store (e.g. Redis).
 */
export const rateLimit = (options: { windowMs: number; max: number; message?: string }) => {
  const buckets = new Map<string, Bucket>();

  return (req: Request, res: Response, next: NextFunction): void => {
    const key = req.ip ?? 'unknown';
    const now = Date.now();
    const bucket = buckets.get(key);

    if (!bucket || now > bucket.resetAt) {
      buckets.set(key, { count: 1, resetAt: now + options.windowMs });
      next();
      return;
    }

    if (bucket.count >= options.max) {
      res.status(429).json({
        success: false,
        error: options.message ?? 'Too many requests. Please try again later.',
      });
      return;
    }

    bucket.count += 1;
    next();
  };
};
