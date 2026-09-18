import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { Redis } from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  public client: Redis | null = null;

  onModuleInit() {
    const redisUrl = process.env.REDIS_URL?.trim();

    if (redisUrl) {
      const protocol = new URL(redisUrl).protocol;
      if (protocol !== 'redis:' && protocol !== 'rediss:') {
        this.logger.warn('REDIS_URL must use redis:// or rediss://; caching disabled.');
        return;
      }

      this.client = new Redis(redisUrl, {
        maxRetriesPerRequest: 3,
        retryStrategy: (times) => Math.min(times * 50, 2000),
        lazyConnect: true,
        // Upstash exposes rediss:// (TLS). Pass the option explicitly so TLS is
        // enabled regardless of how ioredis parses the URL scheme.
        tls: protocol === 'rediss:' ? {} : undefined,
      });

      this.client.on('error', (err) => {
        this.logger.warn(`Redis connection error: ${err.message}.`);
      });

      this.client.connect().catch((err) => {
        this.logger.warn(`Redis connect failed: ${err.message}. Caching disabled until Redis recovers.`);
      });
    } else {
      this.logger.log('REDIS_URL not set; caching disabled.');
    }
  }

  async get(key: string): Promise<string | null> {
    if (!this.client) return null;
    try {
      return await this.client.get(key);
    } catch {
      return null;
    }
  }

  async set(key: string, value: string, ttlSec = 60): Promise<void> {
    if (!this.client) return;
    try {
      await this.client.setex(key, ttlSec, value);
    } catch {}
  }

  async del(key: string): Promise<void> {
    if (!this.client) return;
    try {
      await this.client.del(key);
    } catch {}
  }

  async invalidate(pattern: string): Promise<void> {
    if (!this.client) return;
    try {
      const keys = await this.client.keys(pattern);
      if (keys.length) await this.client.del(...keys);
    } catch {}
  }

  onModuleDestroy() {
    this.client?.disconnect();
  }
}
