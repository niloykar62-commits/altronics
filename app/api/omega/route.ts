// app/api/omega/route.ts
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

async function callGroq(system: string, messages: any[]): Promise<string> {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error('GROQ_API_KEY not set in environment variables');

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
  if (!res.ok) throw new Error(`Groq ${res.status}: ${data?.error?.message || JSON.stringify(data)}`);
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error('Groq returned empty content');
  return text;
}

async function callGemini(system: string, messages: any[]): Promise<string> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY not set in environment variables');

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`;

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
      generationConfig: { maxOutputTokens: 1024, temperature: 0.7 },
    }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${data?.error?.message || JSON.stringify(data)}`);
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error(`Gemini empty content. Response: ${JSON.stringify(data).slice(0, 300)}`);
  return text;
}

export async function POST(request: NextRequest) {
  const errors: string[] = [];

  try {
    const body = await request.json();
    const { messages, system } = body;

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    // ── Try Groq ──────────────────────────────────────────────────────────
    try {
      const reply = await callGroq(system, messages);
      return NextResponse.json({ content: [{ type: 'text', text: reply }], provider: 'groq' });
    } catch (err: any) {
      errors.push(`Groq: ${err.message}`);
      console.error('[Omega/Groq]', err.message);
    }

    // ── Try Gemini ────────────────────────────────────────────────────────
    try {
      const reply = await callGemini(system, messages);
      return NextResponse.json({ content: [{ type: 'text', text: reply }], provider: 'gemini' });
    } catch (err: any) {
      errors.push(`Gemini: ${err.message}`);
      console.error('[Omega/Gemini]', err.message);
    }

    // ── Both failed — return full error details ───────────────────────────
    return NextResponse.json(
      { error: 'Both providers failed', details: errors },
      { status: 503 }
    );

  } catch (err: any) {
    return NextResponse.json({ error: `Route error: ${err.message}` }, { status: 500 });
  }
}
