import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { profileUpdateSchema, validateRequest } from '@/lib/validation';

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

// ── Verify Firebase ID token sent from client ─────────────────────────────────
async function verifyToken(request: NextRequest): Promise<{ uid: string } | null> {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return null;
    const token = authHeader.slice(7);
    const auth = getAuth(getAdminApp());
    const decoded = await auth.verifyIdToken(token);
    return { uid: decoded.uid };
  } catch (err: any) {
    console.error('[Profile/Auth]', err.message);
    return null;
  }
}

// ── POST handler ─────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    // ── Auth check ─────────────────────────────────────────────────────────
    const user = await verifyToken(request);
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();

    // ── Server-side validation ───────────────────────────────────────────────
    const validation = validateRequest(profileUpdateSchema, body);
    if (!validation.success) {
      return NextResponse.json(
        { error: validation.error },
        { status: 400 }
      );
    }

    const { fullName, bio } = validation.data;

    // ── Initialize Firebase Admin ───────────────────────────────────────────
    const app = getAdminApp();
    const db = getFirestore(app);

    // ── Build update object with only provided fields ───────────────────────
    const updateData: any = {};
    if (fullName !== undefined) {
      updateData.fullName = fullName;
    }
    if (bio !== undefined) {
      updateData.bio = bio;
    }

    // ── Update user document in Firestore ───────────────────────────────────
    await db.collection('users').doc(user.uid).update(updateData);

    return NextResponse.json(
      { 
        success: true,
        message: 'Profile updated successfully'
      },
      { status: 200 }
    );

  } catch (err: any) {
    console.error('[Profile/Route]', err.message);
    return NextResponse.json(
      { error: 'An error occurred. Please try again.' },
      { status: 500 }
    );
  }
}
