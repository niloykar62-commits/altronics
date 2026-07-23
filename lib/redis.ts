import Redis from 'ioredis';

// ── Redis client singleton ─────────────────────────────────────────────────────
let redisClient: Redis | null = null;

export function getRedisClient(): Redis {
  if (!redisClient) {
    const redisUrl = process.env.REDIS_URL || process.env.UPSTASH_REDIS_REST_URL;
    
    if (!redisUrl) {
      console.warn('[Redis] No REDIS_URL or UPSTASH_REDIS_REST_URL found. Rate limiting disabled.');
      // Return a mock client that does nothing
      redisClient = new MockRedis();
    } else {
      redisClient = new Redis(redisUrl, {
        tls: redisUrl.startsWith('rediss://') ? {} : undefined,
        maxRetriesPerRequest: 3,
        retryStrategy: (times: number) => {
          if (times > 3) return null;
          return Math.min(times * 50, 500);
        },
      });

      redisClient.on('error', (err: Error) => {
        console.error('[Redis] Connection error:', err);
      });
    }
  }
  return redisClient;
}

// ── Mock Redis for development when Redis is not configured ─────────────────
class MockRedis {
  private store = new Map<string, { value: string; expiry: number }>();

  async get(key: string): Promise<string | null> {
    const item = this.store.get(key);
    if (!item) return null;
    if (Date.now() > item.expiry) {
      this.store.delete(key);
      return null;
    }
    return item.value;
  }

  async set(key: string, value: string, mode?: string, duration?: number): Promise<'OK' | null> {
    const expiry = duration ? Date.now() + duration * 1000 : Date.now() + 86400000;
    this.store.set(key, { value, expiry });
    return 'OK';
  }

  async incr(key: string): Promise<number> {
    const item = this.store.get(key);
    const current = item ? parseInt(item.value) || 0 : 0;
    const newValue = current + 1;
    this.store.set(key, { value: String(newValue), expiry: item?.expiry || Date.now() + 86400000 });
    return newValue;
  }

  async incrby(key: string, increment: number): Promise<number> {
    const item = this.store.get(key);
    const current = item ? parseInt(item.value) || 0 : 0;
    const newValue = current + increment;
    this.store.set(key, { value: String(newValue), expiry: item?.expiry || Date.now() + 86400000 });
    return newValue;
  }

  async expire(key: string, seconds: number): Promise<number> {
    const item = this.store.get(key);
    if (item) {
      this.store.set(key, { value: item.value, expiry: Date.now() + seconds * 1000 });
      return 1;
    }
    return 0;
  }

  async del(key: string): Promise<number> {
    return this.store.delete(key) ? 1 : 0;
  }

  async ttl(key: string): Promise<number> {
    const item = this.store.get(key);
    if (!item) return -2;
    const ttl = Math.floor((item.expiry - Date.now()) / 1000);
    return ttl > 0 ? ttl : -2;
  }

  async flushdb(): Promise<'OK'> {
    this.store.clear();
    return 'OK';
  }

  on(event: string, handler: Function) {
    // Mock event handler
  }
}
