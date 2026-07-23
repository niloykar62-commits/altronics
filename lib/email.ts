// ── Email notification utility ─────────────────────────────────────────────────

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

// ── Send email using Resend (recommended for Next.js) ─────────────────────────
export async function sendEmail(options: SendEmailOptions): Promise<{ success: boolean; error?: string }> {
  const resendApiKey = process.env.RESEND_API_KEY;
  
  if (!resendApiKey) {
    console.warn('[Email] No RESEND_API_KEY configured. Email notifications disabled.');
    return { success: false, error: 'Email service not configured' };
  }
  
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM || 'noreply@altronics.com',
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text,
      }),
    });
    
    if (!response.ok) {
      const error = await response.text();
      console.error('[Email] Failed to send email:', error);
      return { success: false, error: 'Failed to send email' };
    }
    
    return { success: true };
  } catch (err) {
    console.error('[Email] Error sending email:', err);
    return { success: false, error: 'Email service error' };
  }
}

// ── Send account lockout notification ───────────────────────────────────────
export async function sendLockoutNotification(email: string, lockoutDurationMinutes: number = 15): Promise<void> {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Account Locked - Altronics</title>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
        .container { background: #f9f9f9; border-radius: 8px; padding: 30px; }
        .header { text-align: center; margin-bottom: 30px; }
        .logo { font-size: 24px; font-weight: bold; color: #8b5cf6; }
        .alert { background: #fee2e2; border-left: 4px solid #ef4444; padding: 15px; margin: 20px 0; border-radius: 4px; }
        .alert h3 { margin: 0 0 10px 0; color: #dc2626; }
        .info { background: #e0e7ff; border-left: 4px solid #6366f1; padding: 15px; margin: 20px 0; border-radius: 4px; }
        .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #6b7280; text-align: center; }
        .button { display: inline-block; background: #8b5cf6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 20px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div class="logo">⚡ ALTRONICS</div>
        </div>
        
        <div class="alert">
          <h3>🔒 Account Temporarily Locked</h3>
          <p>We detected multiple failed login attempts on your account. To protect your security, your account has been temporarily locked.</p>
        </div>
        
        <div class="info">
          <p><strong>Lockout Duration:</strong> ${lockoutDurationMinutes} minutes</p>
          <p><strong>What happened:</strong> There were too many incorrect password attempts.</p>
          <p><strong>What to do:</strong> Your account will automatically unlock after ${lockoutDurationMinutes} minutes. If you didn't attempt to log in, someone else may have tried to access your account.</p>
        </div>
        
        <p><strong>Security Recommendations:</strong></p>
        <ul>
          <li>Ensure your password is strong and unique</li>
          <li>Enable two-factor authentication if available</li>
          <li>Never share your password with anyone</li>
          <li>Check for any suspicious activity on your account</li>
        </ul>
        
        <p>If you believe this is an error or need immediate assistance, please contact our support team.</p>
        
        <div class="footer">
          <p>This is an automated email from Altronics. Please do not reply to this message.</p>
          <p>If you didn't request this change, you can safely ignore this email.</p>
        </div>
      </div>
    </body>
    </html>
  `;
  
  await sendEmail({
    to: email,
    subject: 'Account Temporarily Locked - Altronics Security Alert',
    html,
    text: `Your Altronics account has been temporarily locked due to multiple failed login attempts. The lockout will expire in ${lockoutDurationMinutes} minutes. If you didn't attempt to log in, please secure your account and contact support.`,
  });
}
