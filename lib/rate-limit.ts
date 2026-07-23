import { getRedisClient } from './redis';

// ── Rate limiting configuration ─────────────────────────────────────────────────
const RATE_LIMIT_CONFIG = {
  MAX_ATTEMPTS_PER_IP_PER_MINUTE: 10,
  MAX_FAILED_ATTEMPTS_PER_ACCOUNT: 5,
  ACCOUNT_LOCKOUT_DURATION_SECONDS: 15 * 60, // 15 minutes
  CAPTCHA_TRIGGER_THRESHOLD: 3, // Failed attempts before CAPTCHA required
  PROGRESSIVE_DELAYS: [1000, 2000, 5000, 15000, 30000], // 1s, 2s, 5s, 15s, 30s
};

// ── Rate limit check per IP ────────────────────────────────────────────────────
export async function checkRateLimit(ip: string): Promise<{ allowed: boolean; remaining: number; resetTime?: number }> {
  const redis = getRedisClient();
  const key = `ratelimit:ip:${ip}`;
  
  try {
    const current = await redis.incr(key);
    
    if (current === 1) {
      // Set expiry on first request
      await redis.expire(key, 60); // 1 minute window
    }
    
    const remaining = Math.max(0, RATE_LIMIT_CONFIG.MAX_ATTEMPTS_PER_IP_PER_MINUTE - current);
    const allowed = current <= RATE_LIMIT_CONFIG.MAX_ATTEMPTS_PER_IP_PER_MINUTE;
    
    // Get TTL for reset time
    const ttl = await redis.ttl(key);
    const resetTime = ttl > 0 ? Date.now() + ttl * 1000 : undefined;
    
    return { allowed, remaining, resetTime };
  } catch (err) {
    console.error('[RateLimit] Error checking rate limit:', err);
    // Fail open - allow request if Redis fails
    return { allowed: true, remaining: RATE_LIMIT_CONFIG.MAX_ATTEMPTS_PER_IP_PER_MINUTE };
  }
}

// ── Track failed login attempt per account ────────────────────────────────────
export async function trackFailedAttempt(email: string, ip: string): Promise<{ 
  attemptCount: number; 
  isLocked: boolean; 
  lockoutEnd?: number;
  requiresCaptcha: boolean;
}> {
  const redis = getRedisClient();
  const accountKey = `login:attempts:${email.toLowerCase()}`;
  const ipKey = `login:ip:${ip}`;
  
  try {
    // Increment account attempt counter
    const accountAttempts = await redis.incr(accountKey);
    if (accountAttempts === 1) {
      await redis.expire(accountKey, RATE_LIMIT_CONFIG.ACCOUNT_LOCKOUT_DURATION_SECONDS);
    }
    
    // Increment IP attempt counter
    const ipAttempts = await redis.incr(ipKey);
    if (ipAttempts === 1) {
      await redis.expire(ipKey, RATE_LIMIT_CONFIG.ACCOUNT_LOCKOUT_DURATION_SECONDS);
    }
    
    // Check if account should be locked
    const isLocked = accountAttempts >= RATE_LIMIT_CONFIG.MAX_FAILED_ATTEMPTS_PER_ACCOUNT;
    
    // Check if CAPTCHA should be required
    const requiresCaptcha = accountAttempts >= RATE_LIMIT_CONFIG.CAPTCHA_TRIGGER_THRESHOLD ||
                           ipAttempts >= RATE_LIMIT_CONFIG.CAPTCHA_TRIGGER_THRESHOLD;
    
    // Get lockout end time if locked
    let lockoutEnd: number | undefined;
    if (isLocked) {
      const ttl = await redis.ttl(accountKey);
      lockoutEnd = ttl > 0 ? Date.now() + ttl * 1000 : undefined;
    }
    
    return { 
      attemptCount: accountAttempts, 
      isLocked, 
      lockoutEnd,
      requiresCaptcha 
    };
  } catch (err) {
    console.error('[RateLimit] Error tracking failed attempt:', err);
    // Fail open
    return { attemptCount: 0, isLocked: false, requiresCaptcha: false };
  }
}

// ── Check if account is locked ───────────────────────────────────────────────────
export async function isAccountLocked(email: string): Promise<{ locked: boolean; remainingTime?: number }> {
  const redis = getRedisClient();
  const key = `login:locked:${email.toLowerCase()}`;
  
  try {
    const locked = await redis.get(key);
    if (!locked) return { locked: false };
    
    const ttl = await redis.ttl(key);
    const remainingTime = ttl > 0 ? ttl * 1000 : 0;
    
    if (ttl <= 0) {
      // Lock expired, clean up
      await redis.del(key);
      return { locked: false };
    }
    
    return { locked: true, remainingTime };
  } catch (err) {
    console.error('[RateLimit] Error checking lock status:', err);
    return { locked: false };
  }
}

// ── Lock account ────────────────────────────────────────────────────────────────
export async function lockAccount(email: string, durationSeconds: number = RATE_LIMIT_CONFIG.ACCOUNT_LOCKOUT_DURATION_SECONDS): Promise<void> {
  const redis = getRedisClient();
  const key = `login:locked:${email.toLowerCase()}`;
  
  try {
    await redis.set(key, '1', 'EX', durationSeconds);
  } catch (err) {
    console.error('[RateLimit] Error locking account:', err);
  }
}

// ── Reset failed attempts on successful login ───────────────────────────────────
export async function resetFailedAttempts(email: string, ip: string): Promise<void> {
  const redis = getRedisClient();
  const accountKey = `login:attempts:${email.toLowerCase()}`;
  const ipKey = `login:ip:${ip}`;
  
  try {
    await redis.del(accountKey);
    await redis.del(ipKey);
  } catch (err) {
    console.error('[RateLimit] Error resetting attempts:', err);
  }
}

// ── Get progressive delay based on attempt count ───────────────────────────────
export function getProgressiveDelay(attemptCount: number): number {
  const index = Math.min(attemptCount - 1, RATE_LIMIT_CONFIG.PROGRESSIVE_DELAYS.length - 1);
  return RATE_LIMIT_CONFIG.PROGRESSIVE_DELAYS[Math.max(0, index)];
}

// ── Sleep utility for progressive delay ───────────────────────────────────────
export async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ── Extract IP address from request ───────────────────────────────────────────
export function getClientIP(request: Request): string {
  // Try various headers that might contain the real IP
  const forwarded = request.headers.get('x-forwarded-for');
  const realIP = request.headers.get('x-real-ip');
  const cfConnectingIP = request.headers.get('cf-connecting-ip');
  
  if (forwarded) {
    // x-forwarded-for can contain multiple IPs, take the first one
    return forwarded.split(',')[0].trim();
  }
  
  if (cfConnectingIP) {
    return cfConnectingIP;
  }
  
  if (realIP) {
    return realIP;
  }
  
  // Fallback to a hash of the request (not ideal but better than nothing)
  return 'unknown';
}
