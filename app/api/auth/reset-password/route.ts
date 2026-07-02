import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { passwordResetSchema, validateRequest } from '@/lib/validation';

export const runtime = 'nodejs';

// ── Firebase Admin init ───────────────────────────────────────────────────────
function getAdminApp() {
  if (!getApps().length) {
    const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n');

    if (!projectId || !clientEmail || !privateKey) {
      throw new Error('Firebase Admin env vars not set');
    }

    initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
  }
  return getApps()[0];
}

// ── POST handler ─────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // ── Server-side validation ───────────────────────────────────────────────
    const validation = validateRequest(passwordResetSchema, body);
    if (!validation.success) {
      return NextResponse.json(
        { error: validation.error },
        { status: 400 }
      );
    }

    const { email } = validation.data;

    // ── Initialize Firebase Admin ───────────────────────────────────────────
    const app = getAdminApp();
    const auth = getAuth(app);

    // ── Generate password reset link ─────────────────────────────────────────
    try {
      const resetLink = await auth.generatePasswordResetLink(email);
      
      // In production, you would send this link via email
      // For now, we'll return it (this should be changed to send via email service)
      console.log('[Password Reset Link]', resetLink);
      
      return NextResponse.json(
        { 
          success: true,
          message: 'If an account exists with this email, a password reset link has been sent.'
        },
        { status: 200 }
      );
    } catch (err: any) {
      console.error('[PasswordReset/Auth]', err.message);
      // Return generic message to prevent account enumeration
      // Even if user doesn't exist, return success message
      return NextResponse.json(
        { 
          success: true,
          message: 'If an account exists with this email, a password reset link has been sent.'
        },
        { status: 200 }
      );
    }

  } catch (err: any) {
    console.error('[PasswordReset/Route]', err.message);
    return NextResponse.json(
      { error: 'An error occurred. Please try again.' },
      { status: 500 }
    );
  }
}
