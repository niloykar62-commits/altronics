'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { auth } from '@/lib/firebase';
import {
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  RecaptchaVerifier,
  signInWithPhoneNumber,
} from 'firebase/auth';
import Link from 'next/link';

type Screen = 'login' | 'recover-choice' | 'recover-email' | 'recover-email-sent' | 'recover-phone' | 'recover-phone-otp';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  // ── Recovery state ────────────────────────────────────────────────────────
  const [screen, setScreen] = useState<Screen>('login');
  const [recoverEmail, setRecoverEmail] = useState('');
  const [recoverPhone, setRecoverPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [recoverLoading, setRecoverLoading] = useState(false);
  const [recoverError, setRecoverError] = useState('');
  const [confirmationResult, setConfirmationResult] = useState<any>(null);

  const resetRecovery = () => {
    setScreen('login');
    setRecoverEmail('');
    setRecoverPhone('');
    setOtp('');
    setRecoverError('');
    setConfirmationResult(null);
  };

  // ── Login ─────────────────────────────────────────────────────────────────
  const handleLogin = async () => {
    if (!email || !password) { setError('Please fill in all fields.'); return; }
    setLoading(true); setError('');

    try {
      // ── Call server-side API with validation ───────────────────────────────
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Invalid credentials');
        setLoading(false);
        return;
      }

      // ── After successful validation, sign in with Firebase ───────────────────
      await signInWithEmailAndPassword(auth, email, password);
      router.push('/feed');
    } catch (err: any) {
      if (err.code === 'auth/invalid-credential') setError('Wrong email or password.');
      else setError(err.message);
    }
    setLoading(false);
  };

  // ── Email recovery ────────────────────────────────────────────────────────
  const sendEmailReset = async () => {
    if (!recoverEmail.trim()) { setRecoverError('Enter your email address.'); return; }
    setRecoverLoading(true); setRecoverError('');
    try {
      // ── Call server-side API with validation ───────────────────────────────
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: recoverEmail.trim() }),
      });

      const data = await res.json();

      if (!res.ok) {
        setRecoverError(data.error || 'Failed to send reset email');
        setRecoverLoading(false);
        return;
      }

      setScreen('recover-email-sent');
    } catch (err: any) {
      setRecoverError('Something went wrong. Please try again.');
    }
    setRecoverLoading(false);
  };

  // ── Phone OTP recovery ────────────────────────────────────────────────────
  const sendPhoneOtp = async () => {
    if (!recoverPhone.trim()) { setRecoverError('Enter your phone number.'); return; }
    setRecoverLoading(true); setRecoverError('');
    try {
      // Set up invisible reCAPTCHA
      if (!(window as any).__recaptchaVerifier) {
        (window as any).__recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', { size: 'invisible' });
      }
      const result = await signInWithPhoneNumber(auth, recoverPhone.trim(), (window as any).__recaptchaVerifier);
      setConfirmationResult(result);
      setScreen('recover-phone-otp');
    } catch (err: any) {
      if (err.code === 'auth/invalid-phone-number') setRecoverError('Invalid phone number. Use international format: +8801XXXXXXXXX');
      else if (err.code === 'auth/too-many-requests') setRecoverError('Too many attempts. Please try again later.');
      else setRecoverError(err.message);
      // Reset reCAPTCHA on error
      (window as any).__recaptchaVerifier = null;
    }
    setRecoverLoading(false);
  };

  const verifyPhoneOtp = async () => {
    if (!otp.trim() || otp.length < 6) { setRecoverError('Enter the 6-digit code.'); return; }
    if (!confirmationResult) return;
    setRecoverLoading(true); setRecoverError('');
    try {
      await confirmationResult.confirm(otp.trim());
      // Successfully signed in via phone — redirect
      router.push('/feed');
    } catch (err: any) {
      if (err.code === 'auth/invalid-verification-code') setRecoverError('Wrong code. Please try again.');
      else if (err.code === 'auth/code-expired') setRecoverError('Code expired. Please request a new one.');
      else setRecoverError(err.message);
    }
    setRecoverLoading(false);
  };

  // ── Shared styles ─────────────────────────────────────────────────────────
  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '12px 16px',
    background: 'rgba(139,92,246,0.08)',
    border: '0.5px solid rgba(139,92,246,0.2)',
    borderRadius: 12, color: '#f3f4f6', fontSize: 14,
    fontFamily: 'Inter,sans-serif', outline: 'none',
    boxSizing: 'border-box',
  };
  const primaryBtn: React.CSSProperties = {
    width: '100%', padding: '14px', borderRadius: 14,
    background: 'linear-gradient(135deg,#8b5cf6,#3b82f6)',
    border: 'none', color: 'white', fontSize: 15, fontWeight: 700,
    cursor: 'pointer', fontFamily: 'Inter,sans-serif',
    boxShadow: '0 4px 20px rgba(139,92,246,0.3)',
  };
  const ghostBtn: React.CSSProperties = {
    width: '100%', padding: '12px', borderRadius: 14,
    background: 'rgba(255,255,255,0.04)',
    border: '0.5px solid rgba(255,255,255,0.1)',
    color: '#9ca3af', fontSize: 14, fontWeight: 600,
    cursor: 'pointer', fontFamily: 'Inter,sans-serif',
  };

  const glowBg = (
    <>
      <div style={{ position: 'fixed', top: '20%', left: '10%', width: 300, height: 300, background: 'radial-gradient(circle, rgba(139,92,246,0.12) 0%, transparent 70%)', borderRadius: '50%', pointerEvents: 'none' }} />
      <div style={{ position: 'fixed', bottom: '20%', right: '10%', width: 250, height: 250, background: 'radial-gradient(circle, rgba(59,130,246,0.1) 0%, transparent 70%)', borderRadius: '50%', pointerEvents: 'none' }} />
    </>
  );

  const logo = (
    <div style={{ textAlign: 'center', marginBottom: 32 }}>
      <div style={{ width: 64, height: 64, borderRadius: '50%', border: '1px solid rgba(139,92,246,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px', background: 'rgba(139,92,246,0.1)' }}>
        <span style={{ fontSize: 28 }}>⚡</span>
      </div>
      <h1 style={{ fontSize: 28, fontWeight: 900, letterSpacing: -1, background: 'linear-gradient(135deg,#a78bfa,#60a5fa)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', marginBottom: 4 }}>ALTRONICS</h1>
    </div>
  );

  const errorBox = recoverError ? (
    <div style={{ background: 'rgba(239,68,68,0.1)', border: '0.5px solid rgba(239,68,68,0.3)', borderRadius: 12, padding: '10px 14px', marginBottom: 18, color: '#f87171', fontSize: 13, textAlign: 'center' }}>
      {recoverError}
    </div>
  ) : null;

  // ─────────────────────────────────────────────────────────────────────────
  // SCREENS
  // ─────────────────────────────────────────────────────────────────────────

  // ── LOGIN ─────────────────────────────────────────────────────────────────
  if (screen === 'login') return (
    <div style={{ minHeight: '100vh', background: '#0a0a0f', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, fontFamily: 'Inter, sans-serif' }}>
      {glowBg}
      <div style={{ width: '100%', maxWidth: 400, position: 'relative', zIndex: 1 }}>
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{ width: 72, height: 72, borderRadius: '50%', border: '1px solid rgba(139,92,246,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', background: 'rgba(139,92,246,0.1)' }}>
            <span style={{ fontSize: 32 }}>⚡</span>
          </div>
          <h1 style={{ fontSize: 32, fontWeight: 900, letterSpacing: -1, background: 'linear-gradient(135deg,#a78bfa,#60a5fa)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', marginBottom: 6 }}>ALTRONICS</h1>
          <p style={{ color: '#6b7280', fontSize: 13, letterSpacing: 1, textTransform: 'uppercase' }}>Welcome back</p>
        </div>

        <div style={{ background: 'rgba(17,17,24,0.8)', backdropFilter: 'blur(20px)', border: '0.5px solid rgba(139,92,246,0.2)', borderRadius: 24, padding: 32 }}>
          {error && (
            <div style={{ background: 'rgba(239,68,68,0.1)', border: '0.5px solid rgba(239,68,68,0.3)', borderRadius: 12, padding: '10px 14px', marginBottom: 20, color: '#f87171', fontSize: 13, textAlign: 'center' }}>
              {error}
            </div>
          )}

          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#9ca3af', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
              placeholder="you@example.com" style={inputStyle} />
          </div>

          <div style={{ marginBottom: 8 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#9ca3af', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
              placeholder="••••••••" style={inputStyle} />
          </div>

          {/* Forgot password link */}
          <div style={{ textAlign: 'right', marginBottom: 20 }}>
            <button onClick={() => { setRecoverError(''); setScreen('recover-choice'); }}
              style={{ background: 'none', border: 'none', color: '#a78bfa', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter,sans-serif', padding: 0 }}>
              Forgot password?
            </button>
          </div>

          <button onClick={handleLogin} disabled={loading} style={{ ...primaryBtn, opacity: loading ? 0.7 : 1, cursor: loading ? 'not-allowed' : 'pointer' }}>
            {loading ? 'Signing in...' : 'Sign In'}
          </button>

          <p style={{ textAlign: 'center', marginTop: 20, fontSize: 13, color: '#6b7280' }}>
            No account?{' '}
            <Link href="/signup" style={{ color: '#a78bfa', fontWeight: 600, textDecoration: 'none' }}>Sign up</Link>
          </p>
        </div>
      </div>
    </div>
  );

  // ── RECOVERY CHOICE ───────────────────────────────────────────────────────
  if (screen === 'recover-choice') return (
    <div style={{ minHeight: '100vh', background: '#0a0a0f', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, fontFamily: 'Inter, sans-serif' }}>
      {glowBg}
      <div style={{ width: '100%', maxWidth: 400, position: 'relative', zIndex: 1 }}>
        {logo}
        <div style={{ background: 'rgba(17,17,24,0.8)', backdropFilter: 'blur(20px)', border: '0.5px solid rgba(139,92,246,0.2)', borderRadius: 24, padding: 32 }}>
          <div style={{ textAlign: 'center', marginBottom: 28 }}>
            <div style={{ fontSize: 36, marginBottom: 10 }}>🔐</div>
            <h2 style={{ fontSize: 20, fontWeight: 800, color: '#f3f4f6', margin: '0 0 6px' }}>Recover Account</h2>
            <p style={{ fontSize: 13, color: '#6b7280', margin: 0 }}>Choose how you want to receive your recovery code</p>
          </div>

          {/* Email option */}
          <button onClick={() => { setRecoverError(''); setScreen('recover-email'); }}
            style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 16, padding: '16px 18px', borderRadius: 16, background: 'rgba(139,92,246,0.08)', border: '0.5px solid rgba(139,92,246,0.25)', cursor: 'pointer', marginBottom: 12, fontFamily: 'Inter,sans-serif', transition: 'all 0.2s', textAlign: 'left' }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(139,92,246,0.15)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(139,92,246,0.08)')}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(139,92,246,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>
              ✉️
            </div>
            <div>
              <p style={{ fontSize: 14, fontWeight: 700, color: '#f3f4f6', margin: '0 0 2px' }}>Via Email</p>
              <p style={{ fontSize: 12, color: '#6b7280', margin: 0 }}>Get a reset link in your inbox</p>
            </div>
            <span style={{ marginLeft: 'auto', color: '#6b7280', fontSize: 16 }}>›</span>
          </button>

          {/* Phone option */}
          <button onClick={() => { setRecoverError(''); setScreen('recover-phone'); }}
            style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 16, padding: '16px 18px', borderRadius: 16, background: 'rgba(59,130,246,0.08)', border: '0.5px solid rgba(59,130,246,0.25)', cursor: 'pointer', marginBottom: 24, fontFamily: 'Inter,sans-serif', transition: 'all 0.2s', textAlign: 'left' }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(59,130,246,0.15)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(59,130,246,0.08)')}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(59,130,246,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>
              📱
            </div>
            <div>
              <p style={{ fontSize: 14, fontWeight: 700, color: '#f3f4f6', margin: '0 0 2px' }}>Via Phone (SMS)</p>
              <p style={{ fontSize: 12, color: '#6b7280', margin: 0 }}>Get a code on your linked phone number</p>
            </div>
            <span style={{ marginLeft: 'auto', color: '#6b7280', fontSize: 16 }}>›</span>
          </button>

          <button onClick={resetRecovery} style={ghostBtn}>← Back to Login</button>
        </div>
      </div>
    </div>
  );

  // ── EMAIL RECOVERY FORM ───────────────────────────────────────────────────
  if (screen === 'recover-email') return (
    <div style={{ minHeight: '100vh', background: '#0a0a0f', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, fontFamily: 'Inter, sans-serif' }}>
      {glowBg}
      <div style={{ width: '100%', maxWidth: 400, position: 'relative', zIndex: 1 }}>
        {logo}
        <div style={{ background: 'rgba(17,17,24,0.8)', backdropFilter: 'blur(20px)', border: '0.5px solid rgba(139,92,246,0.2)', borderRadius: 24, padding: 32 }}>
          <div style={{ textAlign: 'center', marginBottom: 28 }}>
            <div style={{ fontSize: 36, marginBottom: 10 }}>✉️</div>
            <h2 style={{ fontSize: 20, fontWeight: 800, color: '#f3f4f6', margin: '0 0 6px' }}>Email Recovery</h2>
            <p style={{ fontSize: 13, color: '#6b7280', margin: 0 }}>We'll send a password reset link to your email</p>
          </div>

          {errorBox}

          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#9ca3af', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>Your Email</label>
            <input
              type="email" value={recoverEmail} onChange={(e) => setRecoverEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && sendEmailReset()}
              placeholder="you@example.com" style={inputStyle} autoFocus />
          </div>

          <button onClick={sendEmailReset} disabled={recoverLoading}
            style={{ ...primaryBtn, opacity: recoverLoading ? 0.7 : 1, cursor: recoverLoading ? 'not-allowed' : 'pointer', marginBottom: 12 }}>
            {recoverLoading ? 'Sending...' : 'Send Reset Link'}
          </button>
          <button onClick={() => setScreen('recover-choice')} style={ghostBtn}>← Back</button>
        </div>
      </div>
    </div>
  );

  // ── EMAIL SENT CONFIRMATION ───────────────────────────────────────────────
  if (screen === 'recover-email-sent') return (
    <div style={{ minHeight: '100vh', background: '#0a0a0f', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, fontFamily: 'Inter, sans-serif' }}>
      {glowBg}
      <div style={{ width: '100%', maxWidth: 400, position: 'relative', zIndex: 1 }}>
        {logo}
        <div style={{ background: 'rgba(17,17,24,0.8)', backdropFilter: 'blur(20px)', border: '0.5px solid rgba(139,92,246,0.2)', borderRadius: 24, padding: 32, textAlign: 'center' }}>
          {/* Animated success icon */}
          <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'rgba(34,197,94,0.12)', border: '1.5px solid rgba(34,197,94,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', fontSize: 32 }}>
            ✅
          </div>
          <h2 style={{ fontSize: 20, fontWeight: 800, color: '#f3f4f6', margin: '0 0 10px' }}>Check Your Inbox</h2>
          <p style={{ fontSize: 14, color: '#9ca3af', lineHeight: 1.6, marginBottom: 8 }}>
            We sent a password reset link to
          </p>
          <p style={{ fontSize: 14, fontWeight: 700, color: '#a78bfa', marginBottom: 20, wordBreak: 'break-all' }}>
            {recoverEmail}
          </p>
          <p style={{ fontSize: 12, color: '#6b7280', marginBottom: 28, lineHeight: 1.6 }}>
            Click the link in the email to set a new password. Check your spam folder if you don't see it.
          </p>

          {/* Resend */}
          <button onClick={sendEmailReset} disabled={recoverLoading}
            style={{ ...ghostBtn, marginBottom: 12, opacity: recoverLoading ? 0.6 : 1 }}>
            {recoverLoading ? 'Resending...' : '🔁 Resend Email'}
          </button>
          <button onClick={resetRecovery} style={primaryBtn}>Back to Login</button>
        </div>
      </div>
    </div>
  );

  // ── PHONE RECOVERY FORM ───────────────────────────────────────────────────
  if (screen === 'recover-phone') return (
    <div style={{ minHeight: '100vh', background: '#0a0a0f', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, fontFamily: 'Inter, sans-serif' }}>
      {glowBg}
      {/* Invisible reCAPTCHA container — required by Firebase */}
      <div id="recaptcha-container" />
      <div style={{ width: '100%', maxWidth: 400, position: 'relative', zIndex: 1 }}>
        {logo}
        <div style={{ background: 'rgba(17,17,24,0.8)', backdropFilter: 'blur(20px)', border: '0.5px solid rgba(139,92,246,0.2)', borderRadius: 24, padding: 32 }}>
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <div style={{ fontSize: 36, marginBottom: 10 }}>📱</div>
            <h2 style={{ fontSize: 20, fontWeight: 800, color: '#f3f4f6', margin: '0 0 6px' }}>Phone Recovery</h2>
            <p style={{ fontSize: 13, color: '#6b7280', margin: 0 }}>Enter the phone number linked to your account</p>
          </div>

          {/* Note card */}
          <div style={{ background: 'rgba(59,130,246,0.08)', border: '0.5px solid rgba(59,130,246,0.2)', borderRadius: 12, padding: '10px 14px', marginBottom: 20, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <span style={{ fontSize: 14, flexShrink: 0 }}>ℹ️</span>
            <p style={{ fontSize: 12, color: '#93c5fd', margin: 0, lineHeight: 1.5 }}>
              Your phone number must be linked to your Altronics account. This will sign you in via SMS OTP.
            </p>
          </div>

          {errorBox}

          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#9ca3af', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>Phone Number</label>
            <input
              type="tel" value={recoverPhone} onChange={(e) => setRecoverPhone(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && sendPhoneOtp()}
              placeholder="+8801XXXXXXXXX" style={inputStyle} autoFocus />
            <p style={{ fontSize: 11, color: '#4b5563', marginTop: 6 }}>Use international format, e.g. +8801712345678</p>
          </div>

          <button onClick={sendPhoneOtp} disabled={recoverLoading}
            style={{ ...primaryBtn, opacity: recoverLoading ? 0.7 : 1, cursor: recoverLoading ? 'not-allowed' : 'pointer', marginBottom: 12 }}>
            {recoverLoading ? 'Sending Code...' : 'Send OTP Code'}
          </button>
          <button onClick={() => setScreen('recover-choice')} style={ghostBtn}>← Back</button>
        </div>
      </div>
    </div>
  );

  // ── PHONE OTP VERIFICATION ────────────────────────────────────────────────
  if (screen === 'recover-phone-otp') return (
    <div style={{ minHeight: '100vh', background: '#0a0a0f', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, fontFamily: 'Inter, sans-serif' }}>
      {glowBg}
      <div id="recaptcha-container" />
      <div style={{ width: '100%', maxWidth: 400, position: 'relative', zIndex: 1 }}>
        {logo}
        <div style={{ background: 'rgba(17,17,24,0.8)', backdropFilter: 'blur(20px)', border: '0.5px solid rgba(139,92,246,0.2)', borderRadius: 24, padding: 32 }}>
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <div style={{ fontSize: 36, marginBottom: 10 }}>🔢</div>
            <h2 style={{ fontSize: 20, fontWeight: 800, color: '#f3f4f6', margin: '0 0 6px' }}>Enter OTP</h2>
            <p style={{ fontSize: 13, color: '#6b7280', margin: 0, lineHeight: 1.6 }}>
              A 6-digit code was sent to<br />
              <span style={{ color: '#60a5fa', fontWeight: 700 }}>{recoverPhone}</span>
            </p>
          </div>

          {errorBox}

          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#9ca3af', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>Verification Code</label>
            <input
              type="text" inputMode="numeric" pattern="[0-9]*"
              value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
              onKeyDown={(e) => e.key === 'Enter' && verifyPhoneOtp()}
              placeholder="• • • • • •"
              maxLength={6}
              style={{ ...inputStyle, textAlign: 'center', fontSize: 24, fontWeight: 700, letterSpacing: 12 }}
              autoFocus />
          </div>

          <button onClick={verifyPhoneOtp} disabled={recoverLoading || otp.length < 6}
            style={{ ...primaryBtn, opacity: (recoverLoading || otp.length < 6) ? 0.6 : 1, cursor: (recoverLoading || otp.length < 6) ? 'not-allowed' : 'pointer', marginBottom: 12 }}>
            {recoverLoading ? 'Verifying...' : 'Verify & Sign In'}
          </button>

          {/* Resend code */}
          <button onClick={() => { setOtp(''); setRecoverError(''); setScreen('recover-phone'); }}
            style={{ ...ghostBtn, marginBottom: 12 }}>
            🔁 Resend Code
          </button>
          <button onClick={resetRecovery} style={{ ...ghostBtn, color: '#6b7280', fontSize: 12 }}>← Back to Login</button>
        </div>
      </div>
    </div>
  );

  return null;
}
