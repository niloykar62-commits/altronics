// ── CAPTCHA verification utility (Cloudflare Turnstile) ───────────────────────

export interface CaptchaVerifyResult {
  success: boolean;
  error?: string;
}

// ── Verify Cloudflare Turnstile token ───────────────────────────────────────────
export async function verifyTurnstileToken(token: string, ip?: string): Promise<CaptchaVerifyResult> {
  const secretKey = process.env.TURNSTILE_SECRET_KEY;
  
  if (!secretKey) {
    console.warn('[Captcha] No TURNSTILE_SECRET_KEY configured. Skipping verification.');
    return { success: true };
  }
  
  if (!token) {
    return { success: false, error: 'CAPTCHA token is required' };
  }
  
  try {
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        secret: secretKey,
        response: token,
        remoteip: ip,
      }),
    });
    
    const result = await response.json();
    
    if (result.success) {
      return { success: true };
    } else {
      console.error('[Captcha] Verification failed:', result['error-codes']);
      return { success: false, error: 'CAPTCHA verification failed' };
    }
  } catch (err) {
    console.error('[Captcha] Error verifying token:', err);
    return { success: false, error: 'CAPTCHA verification error' };
  }
}

// ── Verify hCaptcha token (alternative) ────────────────────────────────────────
export async function verifyHCaptchaToken(token: string, ip?: string): Promise<CaptchaVerifyResult> {
  const secretKey = process.env.HCAPTCHA_SECRET_KEY;
  
  if (!secretKey) {
    console.warn('[Captcha] No HCAPTCHA_SECRET_KEY configured. Skipping verification.');
    return { success: true };
  }
  
  if (!token) {
    return { success: false, error: 'CAPTCHA token is required' };
  }
  
  try {
    const response = await fetch('https://api.hcaptcha.com/siteverify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        secret: secretKey,
        response: token,
        remoteip: ip || '',
      }),
    });
    
    const result = await response.json();
    
    if (result.success) {
      return { success: true };
    } else {
      console.error('[Captcha] Verification failed:', result['error-codes']);
      return { success: false, error: 'CAPTCHA verification failed' };
    }
  } catch (err) {
    console.error('[Captcha] Error verifying token:', err);
    return { success: false, error: 'CAPTCHA verification error' };
  }
}

// ── Generic CAPTCHA verification (tries Turnstile first, then hCaptcha) ────────
export async function verifyCaptcha(token: string, ip?: string): Promise<CaptchaVerifyResult> {
  // Try Turnstile first
  if (process.env.TURNSTILE_SECRET_KEY) {
    return verifyTurnstileToken(token, ip);
  }
  
  // Fall back to hCaptcha
  if (process.env.HCAPTCHA_SECRET_KEY) {
    return verifyHCaptchaToken(token, ip);
  }
  
  // No CAPTCHA configured, allow through
  console.warn('[Captcha] No CAPTCHA secret key configured. Skipping verification.');
  return { success: true };
}
