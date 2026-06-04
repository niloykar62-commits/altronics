'use client';

import { useState, useRef, useEffect } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface OmegaChatProps {
  userProfile?: any;
  initialPrompt?: string;        // pre-fill the input (from post/message assistant)
  initialContext?: string;       // context injected into system prompt
  mode?: 'chat' | 'post' | 'reply' | 'caption' | 'game';
  onResult?: (text: string) => void;  // callback for assistant modes
  onClose?: () => void;
}

// ─── Omega system prompt ──────────────────────────────────────────────────────
function buildSystemPrompt(mode: string, context: string, username: string): string {
  const base = `You are Omega, the AI assistant built into Altronics — a social media platform. You are helpful, friendly, creative, and concise. You know you are Omega by Altronics, not Claude or any other AI. The user's name is ${username || 'there'}.`;

  const modes: Record<string, string> = {
    chat: `${base} Help with anything the user asks — social media ideas, captions, advice, questions, or just chat. Keep responses short and conversational unless detail is needed.`,
    post: `${base} You help users write engaging social media posts for Altronics. Write punchy, authentic posts. Keep them under 280 characters unless asked for longer. Offer 2-3 variations when possible. Use emojis tastefully.`,
    reply: `${base} You help users craft replies to messages. Be natural and match the tone of the conversation. ${context ? `Context: ${context}` : ''}`,
    caption: `${base} You write creative captions with relevant hashtags for social media posts and stories. Make them catchy and authentic. Include 3-5 relevant hashtags.`,
    game: `${base} You are the game master for Altronics entertainment games. Generate fun Emoji Decode puzzles (3 emojis that represent a movie/song/show), Hot Takes (bold opinions for voting), and Word Duel challenges. Be creative and fun.`,
  };

  return modes[mode] || modes.chat;
}

// ─── Quick suggestion chips per mode ─────────────────────────────────────────
const SUGGESTIONS: Record<string, string[]> = {
  chat:    ['Write a post about my day', 'Give me caption ideas', 'What should I post today?', 'Help me reply to a message'],
  post:    ['Something funny', 'Motivational post', 'About technology', 'Late night thoughts'],
  reply:   ['Make it friendly', 'Keep it short', 'Make it funny', 'Professional tone'],
  caption: ['Selfie caption', 'Travel photo', 'Food pic', 'Night out'],
  game:    ['New Emoji Decode', 'Hot take idea', 'Word Duel starter', 'Trivia question'],
};

const MODE_LABELS: Record<string, { icon: string; title: string; placeholder: string }> = {
  chat:    { icon: '🤖', title: 'Omega',            placeholder: 'Ask Omega anything…' },
  post:    { icon: '✍️', title: 'Post Writer',       placeholder: 'Describe your post idea…' },
  reply:   { icon: '💬', title: 'Reply Assistant',   placeholder: 'What do you want to say?' },
  caption: { icon: '🎨', title: 'Caption Generator', placeholder: 'Describe your photo or vibe…' },
  game:    { icon: '🎮', title: 'Game Master',       placeholder: 'Ask for a game challenge…' },
};

export default function OmegaChat({
  userProfile,
  initialPrompt = '',
  initialContext = '',
  mode = 'chat',
  onResult,
  onClose,
}: OmegaChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState(initialPrompt);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState<number | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const username = userProfile?.fullName || userProfile?.username || 'there';
  const modeInfo = MODE_LABELS[mode];

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  useEffect(() => {
    if (initialPrompt) inputRef.current?.focus();
  }, [initialPrompt]);

  const sendMessage = async (text?: string) => {
    const content = (text || input).trim();
    if (!content || loading) return;

    setInput('');
    setError('');
    const newMessages: Message[] = [...messages, { role: 'user', content }];
    setMessages(newMessages);
    setLoading(true);

    try {
      // Call our server-side proxy — direct browser→Anthropic is blocked by CORS
      const res = await fetch('/api/omega', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system: buildSystemPrompt(mode, initialContext, username),
          messages: newMessages.map(m => ({ role: m.role, content: m.content })),
        }),
      });

      const data = await res.json();

      if (data.error) {
        // Show real error so we can diagnose issues
        const detail = data.details ? '\n' + data.details.join('\n') : '';
        throw new Error(data.error + detail);
      }

      const reply = data.content?.find((b: any) => b.type === 'text')?.text || '';
      if (!reply) throw new Error('Empty response from AI');

      const updated = [...newMessages, { role: 'assistant' as const, content: reply }];
      setMessages(updated);
      if (onResult) onResult(reply);

    } catch (err: any) {
      // Show the real error message instead of generic text
      setError('⚠️ ' + (err.message || 'Unknown error'));
      console.error('[Omega]', err);
    }
    setLoading(false);
  };

  const copyMessage = (text: string, idx: number) => {
    navigator.clipboard.writeText(text);
    setCopied(idx);
    setTimeout(() => setCopied(null), 2000);
  };

  const useResult = (text: string) => {
    if (onResult) { onResult(text); onClose?.(); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', fontFamily: 'Inter,sans-serif' }}>
      <style>{`
        @keyframes omegaPulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        @keyframes omegaFadeUp { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
        @keyframes omegaSpin { to{transform:rotate(360deg)} }
        .omega-msg { animation: omegaFadeUp 0.2s ease; }
        .omega-input:focus { outline: none; border-color: rgba(139,92,246,0.6) !important; }
        .omega-chip:hover { background: rgba(139,92,246,0.2) !important; }
        .omega-copy:hover { opacity: 1 !important; }
        .omega-use:hover { background: rgba(139,92,246,0.25) !important; }
      `}</style>

      {/* Messages area */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* Welcome state */}
        {messages.length === 0 && (
          <div style={{ textAlign: 'center', padding: '24px 12px 8px' }}>
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'linear-gradient(135deg,#8b5cf6,#3b82f6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, margin: '0 auto 12px', boxShadow: '0 0 24px rgba(139,92,246,0.4)' }}>Ω</div>
            <p style={{ fontSize: 15, fontWeight: 800, color: '#f3f4f6', margin: '0 0 4px' }}>Hi, I'm Omega {modeInfo.icon}</p>
            <p style={{ fontSize: 12, color: '#6b7280', margin: '0 0 20px', lineHeight: 1.5 }}>
              {mode === 'chat' && 'Your AI assistant on Altronics. Ask me anything!'}
              {mode === 'post' && 'Tell me what to write and I\'ll craft the perfect post.'}
              {mode === 'reply' && 'Tell me what you want to say and I\'ll help you say it.'}
              {mode === 'caption' && 'Describe your photo and I\'ll write a fire caption.'}
              {mode === 'game' && 'I\'ll generate challenges for your game rooms!'}
            </p>
            {/* Quick suggestion chips */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
              {(SUGGESTIONS[mode] || SUGGESTIONS.chat).map(s => (
                <button key={s} type="button" onClick={() => sendMessage(s)} className="omega-chip"
                  style={{ padding: '7px 14px', borderRadius: 20, background: 'rgba(139,92,246,0.1)', border: '0.5px solid rgba(139,92,246,0.25)', color: '#a78bfa', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter,sans-serif', transition: 'background 0.15s' }}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Messages */}
        {messages.map((msg, i) => {
          const isUser = msg.role === 'user';
          return (
            <div key={i} className="omega-msg" style={{ display: 'flex', gap: 8, alignItems: 'flex-start', flexDirection: isUser ? 'row-reverse' : 'row' }}>
              {/* Avatar */}
              {!isUser && (
                <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'linear-gradient(135deg,#8b5cf6,#3b82f6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: 'white', fontWeight: 900, flexShrink: 0, boxShadow: '0 0 10px rgba(139,92,246,0.4)' }}>Ω</div>
              )}
              <div style={{ maxWidth: '82%', display: 'flex', flexDirection: 'column', gap: 4, alignItems: isUser ? 'flex-end' : 'flex-start' }}>
                <div style={{ padding: '10px 14px', borderRadius: isUser ? '18px 18px 4px 18px' : '18px 18px 18px 4px', background: isUser ? 'linear-gradient(135deg,#8b5cf6,#3b82f6)' : 'rgba(255,255,255,0.06)', border: isUser ? 'none' : '0.5px solid rgba(255,255,255,0.08)', fontSize: 13, color: '#f3f4f6', lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  {msg.content}
                </div>
                {/* Action buttons on assistant messages */}
                {!isUser && (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button type="button" onClick={() => copyMessage(msg.content, i)} className="omega-copy"
                      style={{ fontSize: 10, padding: '3px 8px', borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: '0.5px solid rgba(255,255,255,0.08)', color: '#6b7280', cursor: 'pointer', fontFamily: 'Inter,sans-serif', opacity: 0.7, transition: 'opacity 0.15s' }}>
                      {copied === i ? '✓ Copied' : 'Copy'}
                    </button>
                    {onResult && (
                      <button type="button" onClick={() => useResult(msg.content)} className="omega-use"
                        style={{ fontSize: 10, padding: '3px 8px', borderRadius: 10, background: 'rgba(139,92,246,0.1)', border: '0.5px solid rgba(139,92,246,0.25)', color: '#a78bfa', cursor: 'pointer', fontFamily: 'Inter,sans-serif', transition: 'background 0.15s' }}>
                        Use this ↑
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* Typing indicator */}
        {loading && (
          <div className="omega-msg" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'linear-gradient(135deg,#8b5cf6,#3b82f6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: 'white', fontWeight: 900, flexShrink: 0 }}>Ω</div>
            <div style={{ padding: '10px 16px', borderRadius: '18px 18px 18px 4px', background: 'rgba(255,255,255,0.06)', border: '0.5px solid rgba(255,255,255,0.08)', display: 'flex', gap: 4, alignItems: 'center' }}>
              {[0, 0.2, 0.4].map((delay, i) => (
                <div key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: '#a78bfa', animation: `omegaPulse 1.2s ease-in-out ${delay}s infinite` }} />
              ))}
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div style={{ padding: '10px 14px', borderRadius: 12, background: 'rgba(239,68,68,0.08)', border: '0.5px solid rgba(239,68,68,0.2)', color: '#f87171', fontSize: 12, textAlign: 'center' }}>
            {error}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div style={{ padding: '10px 14px 12px', borderTop: '0.5px solid rgba(255,255,255,0.06)', display: 'flex', gap: 8, alignItems: 'flex-end' }}>
        <textarea
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
          placeholder={modeInfo.placeholder}
          rows={1}
          className="omega-input"
          style={{ flex: 1, padding: '10px 14px', background: 'rgba(255,255,255,0.05)', border: '0.5px solid rgba(139,92,246,0.25)', borderRadius: 16, color: '#f3f4f6', fontSize: 13, fontFamily: 'Inter,sans-serif', resize: 'none', lineHeight: 1.5, maxHeight: 120, overflowY: 'auto', boxSizing: 'border-box', transition: 'border-color 0.2s' }}
          onInput={e => {
            const t = e.currentTarget;
            t.style.height = 'auto';
            t.style.height = Math.min(t.scrollHeight, 120) + 'px';
          }}
        />
        <button type="button" onClick={() => sendMessage()} disabled={!input.trim() || loading}
          style={{ width: 38, height: 38, borderRadius: '50%', background: input.trim() && !loading ? 'linear-gradient(135deg,#8b5cf6,#3b82f6)' : 'rgba(255,255,255,0.06)', border: 'none', color: 'white', fontSize: 16, cursor: input.trim() && !loading ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'background 0.2s' }}>
          {loading
            ? <div style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: 'white', animation: 'omegaSpin 0.7s linear infinite' }} />
            : '↑'}
        </button>
      </div>
    </div>
  );
}
