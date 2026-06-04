// app/api/omega/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

export const runtime = 'nodejs';

// ── Firebase Admin (server-side auth verification) ────────────────────────────
function getAdminAuth() {
  if (!getApps().length) {
    initializeApp({
      credential: cert({
        projectId:   process.env.FIREBASE_ADMIN_PROJECT_ID   || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
        // Replace escaped newlines that some hosting platforms add
        privateKey:  process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      }),
    });
  }
  return getAuth();
}

// ── Verify the Firebase ID token sent from the client ────────────────────────
async function verifyToken(request: NextRequest): Promise<{ uid: string; email?: string } | null> {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return null;
    const token = authHeader.slice(7);
    const decoded = await getAdminAuth().verifyIdToken(token);
    return { uid: decoded.uid, email: decoded.email };
  } catch {
    return null;
  }
}

// ── System prompt built SERVER-SIDE — client cannot override it ───────────────
function buildSystemPrompt(mode: string, username: string): string {
  // Sanitize username to prevent prompt injection
  const safeName = username.replace(/[^a-zA-Z0-9 _-]/g, '').slice(0, 40) || 'there';

  const base = `You are Omega, the AI assistant built into Altronics — a social media platform. You are helpful, friendly, creative, and concise. You know you are Omega by Altronics. The user's name is ${safeName}.`;

  const modes: Record<string, string> = {
    chat:    `${base} Help with anything the user asks — social media ideas, captions, advice, questions, or just chat. Keep responses short and conversational unless detail is needed.`,
    post:    `${base} You help users write engaging social media posts for Altronics. Write punchy, authentic posts. Keep them under 280 characters unless asked for longer. Offer 2-3 variations when possible. Use emojis tastefully.`,
    reply:   `${base} You help users craft replies to messages. Be natural and match the tone of the conversation.`,
    caption: `${base} You write creative captions with relevant hashtags for social media posts and stories. Make them catchy and authentic. Include 3-5 relevant hashtags.`,
    game:    `${base} You are the game master for Altronics entertainment games. Generate fun Emoji Decode puzzles (3 emojis that represent a movie/song/show), Hot Takes (bold opinions for voting), and Word Duel challenges. Be creative and fun.`,
  };

  return modes[mode] || modes.chat;
}

// ── AI provider calls ─────────────────────────────────────────────────────────
async function callGroq(system: string, messages: { role: string; content: string }[]): Promise<string> {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error('GROQ_API_KEY not configured');

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
      messages: [
        { role: 'system', content: system },
        ...messages,
      ],
    }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(`Groq error ${res.status}`);
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error('Groq returned empty content');
  return text;
}

async function callGemini(system: string, messages: { role: string; content: string }[]): Promise<string> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY not configured');

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`;

  const geminiContents = messages.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: system }] },
      contents: geminiContents,
      generationConfig: { maxOutputTokens: 1024, temperature: 0.7 },
    }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(`Gemini error ${res.status}`);
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Gemini returned empty content');
  return text;
}

// ── POST handler ──────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  // ── 1. Verify Firebase auth token ─────────────────────────────────────────
  const user = await verifyToken(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { messages, mode, username } = body;

    // ── 2. Validate messages ───────────────────────────────────────────────
    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    // Sanitize messages — only allow role + content strings, cap length
    const safeMessages = messages
      .filter((m: any) => m && typeof m.content === 'string' && ['user', 'assistant'].includes(m.role))
      .slice(-20) // keep last 20 messages max
      .map((m: any) => ({
        role: m.role as 'user' | 'assistant',
        content: String(m.content).slice(0, 4000),
      }));

    // ── 3. Build system prompt SERVER-SIDE ─────────────────────────────────
    const safeMode = ['chat', 'post', 'reply', 'caption', 'game'].includes(mode) ? mode : 'chat';
    const system = buildSystemPrompt(safeMode, username || '');

    // ── 4. Try Groq first, fall back to Gemini ────────────────────────────
    try {
      const reply = await callGroq(system, safeMessages);
      return NextResponse.json({ content: [{ type: 'text', text: reply }], provider: 'groq' });
    } catch (err: any) {
      console.error('[Omega/Groq]', err.message);
    }

    try {
      const reply = await callGemini(system, safeMessages);
      return NextResponse.json({ content: [{ type: 'text', text: reply }], provider: 'gemini' });
    } catch (err: any) {
      console.error('[Omega/Gemini]', err.message);
    }

    // Both failed — generic error, no internal details leaked
    return NextResponse.json({ error: 'AI service temporarily unavailable. Please try again.' }, { status: 503 });

  } catch (err: any) {
    console.error('[Omega/Route]', err.message);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}
