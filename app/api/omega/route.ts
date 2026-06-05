// app/api/omega/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

export const runtime = 'nodejs';

// ── Firebase Admin init ───────────────────────────────────────────────────────
function getAdminAuth() {
  if (!getApps().length) {
    const projectId   = process.env.FIREBASE_ADMIN_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
    const privateKey  = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n');

    if (!projectId || !clientEmail || !privateKey) {
      throw new Error('Firebase Admin env vars not set. Add FIREBASE_ADMIN_PROJECT_ID, FIREBASE_ADMIN_CLIENT_EMAIL, FIREBASE_ADMIN_PRIVATE_KEY to Vercel.');
    }

    initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
  }
  return getAuth();
}

// ── Verify Firebase ID token sent from client ─────────────────────────────────
async function verifyToken(request: NextRequest): Promise<{ uid: string } | null> {
  try {
    const auth   = request.headers.get('Authorization');
    if (!auth?.startsWith('Bearer ')) return null;
    const token  = auth.slice(7);
    const decoded = await getAdminAuth().verifyIdToken(token);
    return { uid: decoded.uid };
  } catch (err: any) {
    console.error('[Omega/auth]', err.message);
    return null;
  }
}

// ── System prompt ─────────────────────────────────────────────────────────────
function buildSystemPrompt(mode: string, username: string): string {
  const safeName = username.replace(/[^a-zA-Z0-9 _-]/g, '').slice(0, 40) || 'there';
  const base = `You are Omega, the AI assistant built into Altronics — a social media platform. You are helpful, friendly, creative, and concise. You are Omega by Altronics. The user's name is ${safeName}.`;

  const modes: Record<string, string> = {
    chat:    `${base} Help with anything — social media ideas, captions, advice, or just chat. Keep responses short and conversational.`,
    post:    `${base} Help write engaging social media posts. Write punchy posts under 280 characters. Offer 2-3 variations. Use emojis tastefully.`,
    reply:   `${base} Help craft replies to messages. Be natural and match the conversation tone.`,
    caption: `${base} Write creative captions with relevant hashtags. Make them catchy. Include 3-5 hashtags.`,
    game:    `${base} You are the game master for Altronics. Generate Emoji Decode puzzles, Hot Takes, and Word Duel challenges.`,
  };

  return modes[mode] || modes.chat;
}

// ── Groq ──────────────────────────────────────────────────────────────────────
async function callGroq(system: string, messages: any[]): Promise<string> {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error('GROQ_API_KEY not set');

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      max_tokens: 1024,
      temperature: 0.7,
      messages: [{ role: 'system', content: system }, ...messages],
    }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(`Groq ${res.status}: ${data?.error?.message || JSON.stringify(data)}`);
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error('Groq empty response');
  return text;
}

// ── Gemini ────────────────────────────────────────────────────────────────────
async function callGemini(system: string, messages: any[]): Promise<string> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY not set');

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`;

  const contents = messages.map((m: any) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: system }] },
      contents,
      generationConfig: { maxOutputTokens: 1024, temperature: 0.7 },
    }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${data?.error?.message || JSON.stringify(data)}`);
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error(`Gemini empty: ${JSON.stringify(data).slice(0, 200)}`);
  return text;
}

// ── POST handler ──────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {

  // ── Auth check — reject unauthenticated requests ──────────────────────────
  const user = await verifyToken(request);
  if (!user) {
    return NextResponse.json(
      { error: 'Unauthorized — please log in to use Omega.' },
      { status: 401 }
    );
  }

  try {
    const body = await request.json();
    const { messages, mode, username } = body;

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const safeMessages = messages
      .filter((m: any) => m && typeof m.content === 'string' && ['user', 'assistant'].includes(m.role))
      .slice(-20)
      .map((m: any) => ({ role: m.role, content: String(m.content).slice(0, 4000) }));

    const safeMode = ['chat', 'post', 'reply', 'caption', 'game'].includes(mode) ? mode : 'chat';
    const system   = buildSystemPrompt(safeMode, username || '');
    const errors: string[] = [];

    // Try Groq first
    try {
      const reply = await callGroq(system, safeMessages);
      return NextResponse.json({ content: [{ type: 'text', text: reply }], provider: 'groq' });
    } catch (err: any) {
      errors.push(`Groq: ${err.message}`);
      console.error('[Omega/Groq]', err.message);
    }

    // Fall back to Gemini
    try {
      const reply = await callGemini(system, safeMessages);
      return NextResponse.json({ content: [{ type: 'text', text: reply }], provider: 'gemini' });
    } catch (err: any) {
      errors.push(`Gemini: ${err.message}`);
      console.error('[Omega/Gemini]', err.message);
    }

    return NextResponse.json(
      { error: 'AI service temporarily unavailable.', details: errors },
      { status: 503 }
    );

  } catch (err: any) {
    console.error('[Omega/Route]', err.message);
    return NextResponse.json({ error: `Route error: ${err.message}` }, { status: 500 });
  }
}
