// app/api/omega/route.ts
// Primary: Groq (Llama 3 — fastest, free)
// Fallback: Google Gemini (most generous free tier)

import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

// ─── Groq ─────────────────────────────────────────────────────────────────────
async function callGroq(system: string, messages: any[]): Promise<string> {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile', // best free Groq model
      max_tokens: 1024,
      temperature: 0.7,
      messages: [
        { role: 'system', content: system },
        ...messages,
      ],
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Groq error ${res.status}: ${err?.error?.message || res.statusText}`);
  }

  const data = await res.json();
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error('Groq returned empty response');
  return text;
}

// ─── Gemini ───────────────────────────────────────────────────────────────────
async function callGemini(system: string, messages: any[]): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

  // Convert OpenAI-style messages to Gemini format
  const geminiContents = messages.map((m: any) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: system }] },
      contents: geminiContents,
      generationConfig: {
        maxOutputTokens: 1024,
        temperature: 0.7,
      },
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Gemini error ${res.status}: ${err?.error?.message || res.statusText}`);
  }

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Gemini returned empty response');
  return text;
}

// ─── Route handler ────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { messages, system } = body;

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    let reply = '';
    let usedProvider = '';
    let lastError = '';

    // ── Try Groq first ────────────────────────────────────────────────────
    if (process.env.GROQ_API_KEY) {
      try {
        reply = await callGroq(system, messages);
        usedProvider = 'groq';
      } catch (err: any) {
        lastError = err.message;
        console.warn('[Omega] Groq failed, trying Gemini:', err.message);
      }
    }

    // ── Fall back to Gemini ───────────────────────────────────────────────
    if (!reply && process.env.GEMINI_API_KEY) {
      try {
        reply = await callGemini(system, messages);
        usedProvider = 'gemini';
      } catch (err: any) {
        lastError = err.message;
        console.error('[Omega] Gemini also failed:', err.message);
      }
    }

    // ── Both failed ───────────────────────────────────────────────────────
    if (!reply) {
      return NextResponse.json(
        { error: 'Omega is currently unavailable. Please try again shortly.', detail: lastError },
        { status: 503 }
      );
    }

    // Return in the same shape OmegaChat.tsx expects
    return NextResponse.json({
      content: [{ type: 'text', text: reply }],
      provider: usedProvider,
    });

  } catch (err: any) {
    console.error('[Omega route]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
