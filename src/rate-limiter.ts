/**
 * API Rate Limiting Middleware
 */

import rateLimit from 'express-rate-limit';
import type { Request, Response, NextFunction } from 'express';
import { getLogger } from './logger.js';

const logger = getLogger();

/**
 * General rate limiter - applies to all routes
 */
export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req: Request, _res: Response) => {
    logger.warn('RateLimiter', 'Rate limit exceeded', {
      ip: _req.ip
    });
  }
});

/**
 * Strict rate limiter for sensitive operations
 */
export const strictLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5, // Limit to 5 requests per minute
  message: 'Too many sensitive operations, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
  skipFailedRequests: false,
  handler: (_req: Request, _res: Response) => {
    logger.warn('RateLimiter', 'Strict rate limit exceeded', {
      ip: _req.ip,
      method: _req.method,
      path: _req.path
    });
  }
});

/**
 * Auth rate limiter - limits login/auth attempts
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit to 5 attempts per 15 minutes
  message: 'Too many authentication attempts, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  handler: (_req: Request, _res: Response) => {
    logger.warn('RateLimiter', 'Auth rate limit exceeded', {
      ip: _req.ip
    });
  }
});

/**
 * API endpoint rate limiter
 */
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // Limit to 30 requests per minute per IP
  message: 'API rate limit exceeded, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req: Request, _res: Response) => {
    logger.warn('RateLimiter', 'API rate limit exceeded', {
      ip: _req.ip,
      endpoint: _req.path
    });
  }
});

/**
 * Custom rate limiter factory for fine-grained control
 */
export function createCustomLimiter(options: {
  windowMs?: number;
  max?: number;
  message?: string;
  keyGenerator?: (req: Request) => string;
  skip?: (req: Request) => boolean;
}) {
  return rateLimit({
    windowMs: options.windowMs || 15 * 60 * 1000,
    max: options.max || 100,
    message: options.message || 'Too many requests, please try again later.',
    keyGenerator: options.keyGenerator || ((req: Request) => req.ip || 'unknown'),
    skip: options.skip,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req: Request, _res: Response) => {
      logger.warn('RateLimiter', 'Custom rate limit exceeded', {
        ip: _req.ip,
        path: _req.path
      });
    }
  });
}

/**
 * Admin token-aware rate limiter (higher limit for admin token)
 */
export function createAdminAwareLimiter(adminToken: string) {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 1000, // 1000 requests for regular users
    keyGenerator: (req: Request) => {
      // Use user token/IP as key
      const token = req.headers.authorization?.split(' ')[1];
      return token === adminToken ? `admin-${req.ip}` : req.ip || 'unknown';
    },
    skip: (req: Request) => {
      // Skip rate limiting for admin token
      const token = req.headers.authorization?.split(' ')[1];
      return token === adminToken;
    },
    handler: (_req: Request, _res: Response) => {
      logger.warn('RateLimiter', 'Rate limit exceeded', {
        ip: _req.ip
      });
    }
  });
}

/**
 * Per-user rate limiter based on Discord ID
 */
export function createPerUserLimiter(options: {
  windowMs?: number;
  max?: number;
} = {}) {
  return rateLimit({
    windowMs: options.windowMs || 60 * 1000,
    max: options.max || 50,
    keyGenerator: (req: Request) => {
      // Extract Discord ID from request if available
      const userId = (req.query.userId as string) || (req.user as any)?.id || req.ip || 'unknown';
      return userId;
    },
    handler: (_req: Request, _res: Response) => {
      logger.warn('RateLimiter', 'Per-user rate limit exceeded', {
        userId: (req.query.userId as string) || (req.user as any)?.id
      });
    }
  });
}

/**
 * Middleware to track rate limit headers in logs
 */
export function rateLimitLogger() {
  return (req: Request, res: Response, next: NextFunction) => {
    // Store rate limit info
    res.on('finish', () => {
      const remaining = res.get('RateLimit-Remaining');
      const limit = res.get('RateLimit-Limit');
      const reset = res.get('RateLimit-Reset');

      if (remaining && parseInt(remaining) < 10) {
        logger.warn('RateLimiter', 'Approaching rate limit', {
          ip: req.ip,
          remaining: parseInt(remaining),
          limit: parseInt(limit || '0'),
          resetAt: new Date(parseInt(reset || '0') * 1000).toISOString()
        });
      }
    });

    next();
  };
}

/**
 * Distributed rate limiting store (for multi-process/cluster scenarios)
 * This is a placeholder for Redis-backed store in production
 */
export class DistributedRateLimitStore {
  private store: Map<string, { count: number; resetTime: number }> = new Map();
  private cleanupInterval: NodeJS.Timeout;

  constructor(private windowMs: number = 60000) {
    // Cleanup old entries every minute
    this.cleanupInterval = setInterval(() => this.cleanup(), 60000);
  }

  get(key: string): number {
    const entry = this.store.get(key);
    if (!entry) return 0;
    if (Date.now() > entry.resetTime) {
      this.store.delete(key);
      return 0;
    }
    return entry.count;
  }

  increment(key: string): void {
    const entry = this.store.get(key);
    if (!entry) {
      this.store.set(key, {
        count: 1,
        resetTime: Date.now() + this.windowMs
      });
    } else {
      entry.count++;
    }
  }

  reset(key: string): void {
    this.store.delete(key);
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.store.entries()) {
      if (now > entry.resetTime) {
        this.store.delete(key);
      }
    }
  }

  destroy(): void {
    clearInterval(this.cleanupInterval);
    this.store.clear();
  }
}

export default {
  generalLimiter,
  strictLimiter,
  authLimiter,
  apiLimiter,
  createCustomLimiter,
  createAdminAwareLimiter,
  createPerUserLimiter,
  rateLimitLogger,
  DistributedRateLimitStore
};
