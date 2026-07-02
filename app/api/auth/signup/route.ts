import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { signupSchema, validateRequest } from '@/lib/validation';

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
    const validation = validateRequest(signupSchema, body);
    if (!validation.success) {
      return NextResponse.json(
        { error: validation.error },
        { status: 400 }
      );
    }

    const { fullName, username, email, password } = validation.data;

    // ── Initialize Firebase Admin ───────────────────────────────────────────
    const app = getAdminApp();
    const auth = getAuth(app);
    const db = getFirestore(app);

    // ── Check username uniqueness ───────────────────────────────────────────
    const usernameQuery = db.collection('users').where('username', '==', username);
    const usernameSnapshot = await usernameQuery.get();

    if (!usernameSnapshot.empty) {
      return NextResponse.json(
        { error: 'Invalid input. Please check your data and try again.' },
        { status: 400 }
      );
    }

    // ── Create user in Firebase Auth ────────────────────────────────────────
    let userRecord;
    try {
      userRecord = await auth.createUser({
        email,
        password,
        displayName: fullName,
      });
    } catch (err: any) {
      console.error('[Signup/Auth]', err.message);
      // Return generic error to prevent account enumeration
      if (err.code === 'auth/email-already-exists') {
        return NextResponse.json(
          { error: 'Invalid input. Please check your data and try again.' },
          { status: 400 }
        );
      }
      return NextResponse.json(
        { error: 'Failed to create account. Please try again.' },
        { status: 500 }
      );
    }

    // ── Create user document in Firestore ───────────────────────────────────
    await db.collection('users').doc(userRecord.uid).set({
      uid: userRecord.uid,
      fullName,
      username,
      email,
      createdAt: new Date().toISOString(),
      following: [],
      followers: [],
      activeStatus: true,
      messageSeen: true,
      photoURL: null,
      bio: '',
      isVerified: false,
      role: 'user',
    });

    // ── Return success (don't return sensitive data) ───────────────────────
    return NextResponse.json(
      { 
        success: true,
        message: 'Account created successfully'
      },
      { status: 201 }
    );

  } catch (err: any) {
    console.error('[Signup/Route]', err.message);
    return NextResponse.json(
      { error: 'An error occurred. Please try again.' },
      { status: 500 }
    );
  }
}
