'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { auth, db } from '@/lib/firebase';
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { doc, setDoc, serverTimestamp, collection, query, where, getDocs } from 'firebase/firestore';
import Link from 'next/link';

// ── Input sanitization ────────────────────────────────────────────────────────
const sanitize = (str: string) => str.replace(/[<>'"&]/g, '').trim();
const RESERVED = ['admin','root','altronics','support','help','mod','moderator','system','official','staff'];

// ── Password strength checker ─────────────────────────────────────────────────
function getPasswordStrength(pw: string): { score: number; label: string; color: string } {
  let score = 0;
  if (pw.length >= 8)  score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  if (score <= 1) return { score, label: 'Weak',   color: '#ef4444' };
  if (score <= 2) return { score, label: 'Fair',   color: '#f59e0b' };
  if (score <= 3) return { score, label: 'Good',   color: '#3b82f6' };
  return             { score, label: 'Strong', color: '#22c55e' };
}

// ── Rate limiting (client-side basic) ────────────────────────────────────────
const ATTEMPT_KEY = 'signup_attempts';
const LOCKOUT_KEY = 'signup_lockout';
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes

function checkRateLimit(): { allowed: boolean; remaining: number; waitMins: number } {
  if (typeof window === 'undefined') return { allowed: true, remaining: MAX_ATTEMPTS, waitMins: 0 };
  const lockout = localStorage.getItem(LOCKOUT_KEY);
  if (lockout) {
    const remaining = parseInt(lockout) - Date.now();
    if (remaining > 0) return { allowed: false, remaining: 0, waitMins: Math.ceil(remaining / 60000) };
    localStorage.removeItem(LOCKOUT_KEY);
    localStorage.removeItem(ATTEMPT_KEY);
  }
  const attempts = parseInt(localStorage.getItem(ATTEMPT_KEY) || '0');
  if (attempts >= MAX_ATTEMPTS) {
    localStorage.setItem(LOCKOUT_KEY, String(Date.now() + LOCKOUT_MS));
    return { allowed: false, remaining: 0, waitMins: 15 };
  }
  return { allowed: true, remaining: MAX_ATTEMPTS - attempts, waitMins: 0 };
}

function recordAttempt() {
  const attempts = parseInt(localStorage.getItem(ATTEMPT_KEY) || '0');
  localStorage.setItem(ATTEMPT_KEY, String(attempts + 1));
}

function clearAttempts() {
  localStorage.removeItem(ATTEMPT_KEY);
  localStorage.removeItem(LOCKOUT_KEY);
}

const inp: React.CSSProperties = {
  width: '100%', padding: '12px 16px',
  background: 'rgba(139,92,246,0.08)',
  border: '0.5px solid rgba(139,92,246,0.2)',
  borderRadius: 12, color: '#f3f4f6', fontSize: 14,
  fontFamily: 'Inter,sans-serif', outline: 'none', boxSizing: 'border-box',
};
const lbl: React.CSSProperties = {
  display: 'block', fontSize: 12, fontWeight: 600, color: '#9ca3af',
  marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5,
};

export default function Signup() {
  const { push } = useRouter();
  const [fullName, setFullName]   = useState('');
  const [username, setUsername]   = useState('');
  const [email, setEmail]         = useState('');
  const [password, setPassword]   = useState('');
  const [showPw, setShowPw]       = useState(false);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const pwStrength = getPasswordStrength(password);

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    const cleanName = sanitize(fullName);
    const cleanUser = sanitize(username).toLowerCase().replace(/\s/g, '');
    const cleanEmail = sanitize(email);

    if (!cleanName || cleanName.length < 2)
      errs.fullName = 'Full name must be at least 2 characters.';
    if (cleanName.length > 50)
      errs.fullName = 'Full name too long (max 50 chars).';

    if (!cleanUser || cleanUser.length < 3)
      errs.username = 'Username must be at least 3 characters.';
    if (cleanUser.length > 20)
      errs.username = 'Username too long (max 20 chars).';
    if (!/^[a-z0-9._]+$/.test(cleanUser))
      errs.username = 'Only letters, numbers, dots and underscores allowed.';
    if (RESERVED.includes(cleanUser))
      errs.username = 'This username is reserved.';

    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail))
      errs.email = 'Please enter a valid email address.';

    if (password.length < 8)
      errs.password = 'Password must be at least 8 characters.';
    if (pwStrength.score < 2)
      errs.password = 'Password is too weak. Add uppercase, numbers or symbols.';

    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSignup = async () => {
    // Rate limit check
    const limit = checkRateLimit();
    if (!limit.allowed) {
      setError(`Too many attempts. Please wait ${limit.waitMins} minutes.`);
      return;
    }

    if (!validate()) return;
    setLoading(true); setError('');

    const cleanName = sanitize(fullName);
    const cleanUser = sanitize(username).toLowerCase().replace(/\s/g, '');
    const cleanEmail = sanitize(email).toLowerCase();

    try {
      // ── Check username uniqueness ──────────────────────────────────────────
      const usnQuery = query(collection(db, 'users'), where('username', '==', cleanUser));
      const usnSnap  = await getDocs(usnQuery);
      if (!usnSnap.empty) {
        setFieldErrors((p) => ({ ...p, username: 'Username already taken.' }));
        setLoading(false);
        return;
      }

      // ── Create auth user ───────────────────────────────────────────────────
      recordAttempt();
      const { user } = await createUserWithEmailAndPassword(auth, cleanEmail, password);
      await updateProfile(user, { displayName: cleanName });

      // ── Create Firestore user doc ──────────────────────────────────────────
      await setDoc(doc(db, 'users', user.uid), {
        uid:        user.uid,
        fullName:   cleanName,
        username:   cleanUser,
        email:      cleanEmail,
        createdAt:  serverTimestamp(),
        following:  [],
        followers:  [],
        activeStatus:   true,
        messageSeen:    true,
        photoURL:       null,
        bio:            '',
        isVerified:     false,
        role:           'user',
      });

      clearAttempts();
      push('/feed');
    } catch (err: any) {
      recordAttempt();
      if (err.code === 'auth/email-already-in-use')
        setError('An account with this email already exists.');
      else if (err.code === 'auth/invalid-email')
        setError('Invalid email address format.');
      else if (err.code === 'auth/weak-password')
        setError('Password is too weak. Please choose a stronger one.');
      else {
        // Don't expose raw Firebase error messages to users
        console.error('Signup error:', err);
        setError('Something went wrong. Please try again.');
      }
    }
    setLoading(false);
  };

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0f', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, fontFamily: 'Inter, sans-serif' }}>
      <div style={{ position: 'fixed', top: '20%', right: '10%', width: 300, height: 300, background: 'radial-gradient(circle, rgba(59,130,246,0.1) 0%, transparent 70%)', borderRadius: '50%', pointerEvents: 'none' }} />
      <div style={{ position: 'fixed', bottom: '20%', left: '10%', width: 250, height: 250, background: 'radial-gradient(circle, rgba(139,92,246,0.12) 0%, transparent 70%)', borderRadius: '50%', pointerEvents: 'none' }} />

      <div style={{ width: '100%', maxWidth: 400, position: 'relative', zIndex: 1 }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ width: 72, height: 72, borderRadius: '50%', border: '1px solid rgba(139,92,246,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', background: 'rgba(139,92,246,0.1)' }}>
            <span style={{ fontSize: 32 }}>⚡</span>
          </div>
          <h1 style={{ fontSize: 32, fontWeight: 900, letterSpacing: -1, background: 'linear-gradient(135deg,#a78bfa,#60a5fa)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', marginBottom: 6 }}>ALTRONICS</h1>
          <p style={{ color: '#6b7280', fontSize: 13, letterSpacing: 1, textTransform: 'uppercase' }}>Create your account</p>
        </div>

        <div style={{ background: 'rgba(17,17,24,0.8)', backdropFilter: 'blur(20px)', border: '0.5px solid rgba(139,92,246,0.2)', borderRadius: 24, padding: 32 }}>
          {error && (
            <div style={{ background: 'rgba(239,68,68,0.1)', border: '0.5px solid rgba(239,68,68,0.3)', borderRadius: 12, padding: '10px 14px', marginBottom: 20, color: '#f87171', fontSize: 13, textAlign: 'center' }}>
              🚫 {error}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Full Name */}
            <div>
              <label style={lbl}>Full Name</label>
              <input value={fullName} maxLength={50}
                onChange={(e) => { setFullName(e.target.value); setFieldErrors((p) => ({ ...p, fullName: '' })); }}
                placeholder="John Doe" style={{ ...inp, borderColor: fieldErrors.fullName ? 'rgba(239,68,68,0.5)' : undefined }} />
              {fieldErrors.fullName && <p style={{ color: '#f87171', fontSize: 12, marginTop: 4 }}>{fieldErrors.fullName}</p>}
            </div>

            {/* Username */}
            <div>
              <label style={lbl}>Username</label>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#6b7280', fontSize: 14 }}>@</span>
                <input value={username} maxLength={20}
                  onChange={(e) => { setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9._]/g, '')); setFieldErrors((p) => ({ ...p, username: '' })); }}
                  placeholder="johndoe" style={{ ...inp, paddingLeft: 30, borderColor: fieldErrors.username ? 'rgba(239,68,68,0.5)' : undefined }} />
              </div>
              {fieldErrors.username && <p style={{ color: '#f87171', fontSize: 12, marginTop: 4 }}>{fieldErrors.username}</p>}
              <p style={{ color: '#4b5563', fontSize: 12, marginTop: 4 }}>Letters, numbers, dots and underscores only</p>
            </div>

            {/* Email */}
            <div>
              <label style={lbl}>Email</label>
              <input type="email" value={email} maxLength={100}
                onChange={(e) => { setEmail(e.target.value); setFieldErrors((p) => ({ ...p, email: '' })); }}
                placeholder="you@example.com" style={{ ...inp, borderColor: fieldErrors.email ? 'rgba(239,68,68,0.5)' : undefined }} />
              {fieldErrors.email && <p style={{ color: '#f87171', fontSize: 12, marginTop: 4 }}>{fieldErrors.email}</p>}
            </div>

            {/* Password + strength */}
            <div>
              <label style={lbl}>Password</label>
              <div style={{ position: 'relative' }}>
                <input type={showPw ? 'text' : 'password'} value={password}
                  onChange={(e) => { setPassword(e.target.value); setFieldErrors((p) => ({ ...p, password: '' })); }}
                  onKeyDown={(e) => e.key === 'Enter' && handleSignup()}
                  placeholder="Min 8 characters" style={{ ...inp, paddingRight: 44, borderColor: fieldErrors.password ? 'rgba(239,68,68,0.5)' : undefined }} />
                <button type="button" onClick={() => setShowPw(!showPw)}
                  aria-label={showPw ? 'Hide password' : 'Show password'}
                  style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: 16 }}>
                  {showPw ? '🙈' : '👁️'}
                </button>
              </div>
              {/* Strength bar */}
              {password.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
                    {[1,2,3,4,5].map((i) => (
                      <div key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: i <= pwStrength.score ? pwStrength.color : 'rgba(255,255,255,0.08)', transition: 'background 0.2s' }} />
                    ))}
                  </div>
                  <p style={{ fontSize: 12, color: pwStrength.color, fontWeight: 600 }}>{pwStrength.label} password</p>
                </div>
              )}
              {fieldErrors.password && <p style={{ color: '#f87171', fontSize: 12, marginTop: 4 }}>{fieldErrors.password}</p>}
              <p style={{ color: '#4b5563', fontSize: 12, marginTop: 4 }}>Use 8+ chars with uppercase, numbers & symbols</p>
            </div>
          </div>

          <button type="button"
            onClick={handleSignup} disabled={loading}
            style={{ width: '100%', padding: 14, borderRadius: 14, background: 'linear-gradient(135deg,#8b5cf6,#3b82f6)', border: 'none', color: 'white', fontSize: 15, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1, fontFamily: 'Inter,sans-serif', boxShadow: '0 4px 20px rgba(139,92,246,0.3)', marginTop: 24 }}>
            {loading ? 'Creating account...' : 'Create Account'}
          </button>

          <p style={{ textAlign: 'center', marginTop: 20, fontSize: 13, color: '#6b7280' }}>
            Have an account?{' '}
            <Link href="/login" style={{ color: '#a78bfa', fontWeight: 600, textDecoration: 'none' }}>Log in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
