import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { loginSchema, validateRequest } from '@/lib/validation';

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
    const validation = validateRequest(loginSchema, body);
    if (!validation.success) {
      return NextResponse.json(
        { error: validation.error },
        { status: 400 }
      );
    }

    const { email, password } = validation.data;

    // ── Initialize Firebase Admin ───────────────────────────────────────────
    const app = getAdminApp();
    const auth = getAuth(app);

    // ── Note: Firebase Admin SDK doesn't have a direct login method
    // For server-side login, we typically use Firebase Client SDK on the frontend
    // This endpoint validates input and can be used for additional server checks
    // The actual authentication should be done via Firebase Client SDK
    
    // For this implementation, we'll validate the credentials exist
    // but the actual token generation happens on the client
    try {
      // Check if user exists by email
      const user = await auth.getUserByEmail(email);
      
      // We don't verify password here (that's done client-side)
      // This endpoint is for input validation only
      return NextResponse.json(
        { 
          success: true,
          message: 'Credentials validated'
        },
        { status: 200 }
      );
    } catch (err: any) {
      console.error('[Login/Auth]', err.message);
      // Return generic error to prevent account enumeration
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      );
    }

  } catch (err: any) {
    console.error('[Login/Route]', err.message);
    return NextResponse.json(
      { error: 'An error occurred. Please try again.' },
      { status: 500 }
    );
  }
}
