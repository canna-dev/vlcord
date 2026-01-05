/**
 * Redis Caching Layer for Distributed & Multi-Instance Support
 */

import redis from 'redis';
import type { MovieMetadata, TVShowMetadata, CircuitBreakerStatus } from './types.js';
import { getLogger } from './logger.js';

const logger = getLogger();

interface CacheOptions {
  ttl?: number; // seconds
  compress?: boolean;
}

/**
 * Redis Cache Manager
 */
export class RedisCacheManager {
  private client: redis.RedisClient | null = null;
  private isConnected: boolean = false;
  private defaultTTL: number = 3600; // 1 hour

  constructor(
    private host: string = 'localhost',
    private port: number = 6379,
    private db: number = 0,
    private password?: string
  ) {}

  /**
   * Connect to Redis
   */
  async connect(): Promise<void> {
    try {
      const options: any = {
        host: this.host,
        port: this.port,
        db: this.db,
        socket: {
          reconnectStrategy: (retries: number) => Math.min(retries * 50, 500)
        }
      };

      if (this.password) {
        options.password = this.password;
      }

      // Using redis v4+ client
      this.client = redis.createClient(options);

      this.client.on('error', (err: Error) => {
        logger.error('Redis', 'Connection error', err);
        this.isConnected = false;
      });

      this.client.on('connect', () => {
        logger.info('Redis', 'Connected to Redis');
        this.isConnected = true;
      });

      await this.client.connect();
      this.isConnected = true;
      logger.info('Redis', `Connected to ${this.host}:${this.port}`);
    } catch (error) {
      logger.error('Redis', 'Failed to connect', error as Error);
      this.isConnected = false;
      throw error;
    }
  }

  /**
   * Disconnect from Redis
   */
  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.quit();
      this.isConnected = false;
      logger.info('Redis', 'Disconnected');
    }
  }

  /**
   * Set cache value
   */
  async set(key: string, value: unknown, options?: CacheOptions): Promise<void> {
    if (!this.isConnected || !this.client) {
      logger.warn('Redis', 'Not connected, skipping cache write', { key });
      return;
    }

    try {
      const ttl = options?.ttl || this.defaultTTL;
      const serialized = JSON.stringify(value);

      await this.client.setEx(key, ttl, serialized);
      logger.debug('Redis', 'Cache set', { key, ttl });
    } catch (error) {
      logger.error('Redis', 'Failed to set cache', error as Error, { key });
    }
  }

  /**
   * Get cache value
   */
  async get<T>(key: string): Promise<T | null> {
    if (!this.isConnected || !this.client) {
      return null;
    }

    try {
      const value = await this.client.get(key);
      if (!value) return null;

      const parsed = JSON.parse(value) as T;
      logger.debug('Redis', 'Cache hit', { key });
      return parsed;
    } catch (error) {
      logger.error('Redis', 'Failed to get cache', error as Error, { key });
      return null;
    }
  }

  /**
   * Delete cache key
   */
  async delete(key: string): Promise<void> {
    if (!this.isConnected || !this.client) return;

    try {
      await this.client.del(key);
      logger.debug('Redis', 'Cache deleted', { key });
    } catch (error) {
      logger.error('Redis', 'Failed to delete cache', error as Error, { key });
    }
  }

  /**
   * Clear all cache
   */
  async clear(pattern?: string): Promise<void> {
    if (!this.isConnected || !this.client) return;

    try {
      if (pattern) {
        const keys = await this.client.keys(pattern);
        if (keys.length > 0) {
          await this.client.del(keys);
        }
      } else {
        await this.client.flushDb();
      }
      logger.info('Redis', 'Cache cleared', { pattern });
    } catch (error) {
      logger.error('Redis', 'Failed to clear cache', error as Error);
    }
  }

  /**
   * Check if connected
   */
  getConnectionStatus(): boolean {
    return this.isConnected;
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<Record<string, unknown>> {
    if (!this.isConnected || !this.client) {
      return { connected: false };
    }

    try {
      const info = await this.client.info('memory');
      const dbSize = await this.client.dbSize();

      return {
        connected: true,
        dbSize,
        info: info ? info.split('\n').slice(0, 10) : []
      };
    } catch (error) {
      logger.error('Redis', 'Failed to get stats', error as Error);
      return { connected: false, error: (error as Error).message };
    }
  }
}

/**
 * Cache key generators
 */
export const CacheKeys = {
  metadata: (type: 'movie' | 'show', title: string, year?: number): string =>
    `metadata:${type}:${title}${year ? `:${year}` : ''}`,

  circuitBreakerState: (service: string): string =>
    `cb:${service}:state`,

  userPermissions: (userId: string): string =>
    `rbac:perms:${userId}`,

  healthStatus: (): string =>
    'health:status',

  activityStats: (): string =>
    'stats:activity',

  overridesList: (): string =>
    'metadata:overrides:list',

  vlcStatus: (): string =>
    'vlc:status',

  rateLimitCounter: (ip: string, endpoint: string): string =>
    `ratelimit:${ip}:${endpoint}`,

  session: (token: string): string =>
    `session:${token}`
};

/**
 * Cache invalidation helpers
 */
export const CacheInvalidation = {
  onMetadataUpdate: async (cache: RedisCacheManager): Promise<void> => {
    await cache.delete(CacheKeys.overridesList());
    await cache.clear('metadata:*');
  },

  onConfigChange: async (cache: RedisCacheManager): Promise<void> => {
    await cache.clear('*');
  },

  onCircuitBreakerChange: async (
    cache: RedisCacheManager,
    service: string
  ): Promise<void> => {
    await cache.delete(CacheKeys.circuitBreakerState(service));
    await cache.delete(CacheKeys.healthStatus());
  },

  onActivityUpdate: async (cache: RedisCacheManager): Promise<void> => {
    await cache.delete(CacheKeys.activityStats());
    await cache.delete(CacheKeys.healthStatus());
  }
};

/**
 * Caching decorators for common operations
 */
export function withCache(
  cacheManager: RedisCacheManager,
  keyGenerator: () => string,
  ttl: number = 3600
) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const key = keyGenerator();

      // Try cache first
      const cached = await cacheManager.get(key);
      if (cached) {
        logger.debug('Cache', 'Hit', { key });
        return cached;
      }

      // Execute original method
      const result = await originalMethod.apply(this, args);

      // Cache result
      if (result) {
        await cacheManager.set(key, result, { ttl });
      }

      return result;
    };

    return descriptor;
  };
}

// Singleton instance
let redisCacheManager: RedisCacheManager | null = null;

export function initializeRedisCache(
  host?: string,
  port?: number,
  password?: string
): RedisCacheManager {
  redisCacheManager = new RedisCacheManager(
    host || process.env.REDIS_HOST || 'localhost',
    port || parseInt(process.env.REDIS_PORT || '6379'),
    0,
    password || process.env.REDIS_PASSWORD
  );
  return redisCacheManager;
}

export function getRedisCacheManager(): RedisCacheManager {
  if (!redisCacheManager) {
    redisCacheManager = initializeRedisCache();
  }
  return redisCacheManager;
}

export default getRedisCacheManager();
