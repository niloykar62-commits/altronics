'use client';

import { useState, useRef, useEffect } from 'react';

// ─── Emoji Data ───────────────────────────────────────────────────────────────
export const EMOJI_CATEGORIES: Record<string, string[]> = {
  '😊': ['😀','😃','😄','😁','😆','😅','😂','🤣','😊','😇','🙂','🙃','😉','😌','😍','🥰','😘','😗','😙','😚','😋','😛','😝','😜','🤪','🤨','🧐','🤓','😎','🥸','🤩','🥳','😏','😒','😞','😔','😟','😕','🙁','☹️','😣','😖','😫','😩','🥺','😢','😭','😤','😠','😡','🤬','🤯','😳','🥵','🥶','😱','😨','😰','😥','😓','🤗','🤔','🫢','🫣','🤭','🤫','🤥','😶','😐','😑','😬','🙄','😯','😦','😧','😮','😲','🥱','😴','🤤','😪','😵','🤐','🥴','🤢','🤮','🤧','😷','🤒','🤕'],
  '👋': ['👋','🤚','🖐️','✋','🖖','👌','🤌','🤏','✌️','🤞','🤟','🤘','🤙','👈','👉','👆','🖕','👇','☝️','👍','👎','✊','👊','🤛','🤜','👏','🙌','👐','🤲','🤝','🙏','✍️','💅','🤳','💪','🦾','🦿','🦵','🦶','👂','🦻','👃','👶','🧒','👦','👧','🧑','👱','👨','🧔','👩','🧓','👴','👵'],
  '❤️': ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣️','💕','💞','💓','💗','💖','💘','💝','💟','♥️','🔥','⚡','🌊','🌈','⭐','🌟','✨','💫','💥','🎉','🎊','🏆','🥇','🎁','🎀','🎈','🎯','💯','✅','☑️','❎','🆒','🆕','🆙','🆓','🆖','🆗','🆘'],
  '🐶': ['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐸','🐵','🙈','🙉','🙊','🐒','🐔','🐧','🐦','🐤','🦆','🦅','🦉','🦇','🐺','🐗','🐴','🦄','🐝','🐛','🦋','🐌','🐞','🐜','🦟','🦗','🦂','🐢','🐍','🦎','🦖','🦕','🐙','🦑','🦐','🦞','🦀','🐡','🐟','🐠','🐬','🐳','🐋','🦈','🐊','🐅','🐆','🦓','🦍','🦧','🦣','🐘','🦛','🦏','🐪','🐫','🦒','🦘','🦬','🐃','🐂','🐄','🐎','🐖','🐏','🐑','🦙','🐐','🦌','🐕','🐩','🦮','🐕‍🦺','🐈','🐈‍⬛','🪶','🐓','🦃','🦤','🦚','🦜','🦢','🕊️','🐇','🦝','🦨','🦡','🦫','🦦','🦥','🐁','🐀','🐿️'],
  '🍕': ['🍕','🍔','🍟','🌭','🍿','🧂','🥓','🥚','🍳','🧇','🥞','🧈','🍞','🥐','🥖','🫓','🥨','🥯','🧀','🥗','🥙','🥪','🌮','🌯','🫔','🥫','🍱','🍘','🍙','🍚','🍛','🍜','🍝','🍠','🍢','🍣','🍤','🍥','🥮','🍡','🥟','🥠','🥡','🦪','🍦','🍧','🍨','🍩','🍪','🎂','🍰','🧁','🥧','🍫','🍬','🍭','🍮','🍯','🍷','🍸','🍹','🧉','🍺','🍻','🥂','🥃','🧃','🥤','🧋','☕','🍵','🫖','🧊'],
  '🏠': ['🏠','🏡','🏢','🏣','🏤','🏥','🏦','🏨','🏩','🏪','🏫','🏬','🏭','🏯','🏰','💒','🗼','🗽','⛪','🕌','🛕','🕍','⛩️','🗾','🎑','🏞','🌅','🌄','🌠','🎇','🎆','🌇','🌆','🏙','🌃','🌉','🌌','🌁','🎠','🎡','🎢','🚂','🚃','🚄','🚅','🚆','🚇','🚈','🚉','🚊','🚝','🚞','🚋','🚌','🚍','🚎','🚐','🚑','🚒','🚓','🚔','🚕','🚖','🚗','🚘','🚙','🛻','🚚','🚛','🚜','🏎','🏍','🛵','🛺','🚲','🛴','🛹','🛼','🚏','🛣','🛤','🛞','⛽','🚨','🚥','🚦','🛑','🚧','⚓','🛟','⛵','🛶','🚤','🛳','⛴','🚢','✈️','🛩','🛫','🛬','🪂','💺','🚁','🚟','🚠','🚡','🛰','🚀','🛸'],
  '⚽': ['⚽','🏀','🏈','⚾','🥎','🎾','🏐','🏉','🥏','🎱','🪀','🏓','🏸','🏒','🏑','🥍','🏏','🪃','🥅','⛳','🪁','🎣','🤿','🎽','🎿','🛷','🥌','🎯','🪃','🏹','🎣','🤿','🥊','🥋','🎖','🏆','🥇','🥈','🥉','🏅','🎗','🎫','🎟','🎪','🤹','🎭','🎨','🎬','🎤','🎧','🎼','🎹','🥁','🪘','🎷','🎺','🪗','🎸','🪕','🎻','🎲','♟️','🎭','🎨','🖼','🎰','🚗','🚕','🚙'],
};

export const QUICK_REACTIONS = ['❤️', '😂', '😮', '😢', '😡', '👍', '👎', '🔥'];

// ─── Types ────────────────────────────────────────────────────────────────────
interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  onClose?: () => void;
  position?: 'top' | 'bottom';
  align?: 'left' | 'right';
  style?: React.CSSProperties;
}

// ─── Main EmojiPicker Component ───────────────────────────────────────────────
export default function EmojiPicker({ onSelect, onClose, position = 'top', align = 'left', style }: EmojiPickerProps) {
  const [activeCategory, setActiveCategory] = useState('😊');
  const [searchQuery, setSearchQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose?.();
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onClose]);

  const currentEmojis = searchQuery
    ? Object.values(EMOJI_CATEGORIES).flat().filter(() => true).slice(0, 60) // simple: show all when searching
    : EMOJI_CATEGORIES[activeCategory] || [];

  return (
    <div
      ref={ref}
      style={{
        position: 'absolute',
        [position === 'top' ? 'bottom' : 'top']: '100%',
        [align === 'right' ? 'right' : 'left']: 0,
        zIndex: 999,
        width: 300,
        background: '#111118',
        border: '0.5px solid rgba(139,92,246,0.3)',
        borderRadius: 18,
        boxShadow: '0 20px 60px rgba(0,0,0,0.6), 0 0 0 0.5px rgba(139,92,246,0.1)',
        overflow: 'hidden',
        marginBottom: position === 'top' ? 8 : 0,
        marginTop: position === 'bottom' ? 8 : 0,
        ...style,
      }}
    >
      {/* Search */}
      <div style={{ padding: '10px 10px 6px', borderBottom: '0.5px solid rgba(255,255,255,0.05)' }}>
        <input
          autoFocus
          placeholder="Search emoji..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{
            width: '100%', padding: '7px 12px', borderRadius: 10,
            background: 'rgba(139,92,246,0.08)', border: '0.5px solid rgba(139,92,246,0.2)',
            color: '#f3f4f6', fontSize: 12, fontFamily: 'Inter,sans-serif', outline: 'none',
            boxSizing: 'border-box',
          }}
        />
      </div>

      {/* Category tabs */}
      {!searchQuery && (
        <div style={{ display: 'flex', padding: '6px 6px 0', gap: 2, borderBottom: '0.5px solid rgba(255,255,255,0.05)' }}>
          {Object.keys(EMOJI_CATEGORIES).map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              style={{
                flex: 1, padding: '6px 0', borderRadius: 8, border: 'none',
                background: activeCategory === cat ? 'rgba(139,92,246,0.2)' : 'transparent',
                cursor: 'pointer', fontSize: 14,
                boxShadow: activeCategory === cat ? '0 0 0 0.5px rgba(139,92,246,0.4)' : 'none',
                transition: 'all 0.15s',
              }}
            >
              {cat}
            </button>
          ))}
        </div>
      )}

      {/* Emoji grid */}
      <div
        style={{
          display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)',
          gap: 2, padding: '8px', maxHeight: 200, overflowY: 'auto',
        }}
      >
        {currentEmojis.map((emoji, i) => (
          <button
            key={i}
            onClick={() => { onSelect(emoji); }}
            style={{
              fontSize: 20, padding: '6px', borderRadius: 8, border: 'none',
              background: 'transparent', cursor: 'pointer', lineHeight: 1,
              transition: 'background 0.1s', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(139,92,246,0.15)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Quick Reaction Bar (for hovering over messages) ─────────────────────────
interface QuickReactionBarProps {
  onReact: (emoji: string) => void;
  onShowFull: () => void;
  isMe: boolean;
}

export function QuickReactionBar({ onReact, onShowFull, isMe }: QuickReactionBarProps) {
  return (
    <div
      style={{
        position: 'absolute',
        top: -38,
        [isMe ? 'right' : 'left']: 0,
        display: 'flex',
        gap: 3,
        background: '#111118',
        border: '0.5px solid rgba(139,92,246,0.3)',
        borderRadius: 24,
        padding: '4px 6px',
        boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
        zIndex: 50,
        animation: 'reactionPop 0.15s cubic-bezier(0.34,1.56,0.64,1)',
      }}
    >
      <style>{`
        @keyframes reactionPop {
          from { opacity: 0; transform: scale(0.7) translateY(4px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
      {QUICK_REACTIONS.map((emoji) => (
        <button
          key={emoji}
          onClick={() => onReact(emoji)}
          style={{
            fontSize: 18, padding: '2px 3px', border: 'none', background: 'transparent',
            cursor: 'pointer', borderRadius: 8, lineHeight: 1, transition: 'transform 0.1s',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.3)')}
          onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
        >
          {emoji}
        </button>
      ))}
      {/* "+" to open full picker */}
      <button
        onClick={onShowFull}
        style={{
          fontSize: 14, padding: '2px 6px', border: '0.5px solid rgba(139,92,246,0.3)',
          background: 'rgba(139,92,246,0.1)', color: '#a78bfa', cursor: 'pointer',
          borderRadius: 8, fontWeight: 700, lineHeight: 1, transition: 'background 0.1s',
          fontFamily: 'Inter,sans-serif',
        }}
      >
        +
      </button>
    </div>
  );
}

// ─── Reaction Bubbles (displayed under a message) ─────────────────────────────
interface ReactionBubble {
  emoji: string;
  count: number;
  reactedByMe: boolean;
}

interface ReactionBubblesProps {
  reactions: Record<string, string[]>; // emoji → array of userIds
  myUid: string;
  onToggle: (emoji: string) => void;
}

export function ReactionBubbles({ reactions, myUid, onToggle }: ReactionBubblesProps) {
  const entries = Object.entries(reactions).filter(([, uids]) => uids.length > 0);
  if (entries.length === 0) return null;

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
      {entries.map(([emoji, uids]) => {
        const reactedByMe = uids.includes(myUid);
        return (
          <button
            key={emoji}
            onClick={() => onToggle(emoji)}
            style={{
              display: 'flex', alignItems: 'center', gap: 3,
              padding: '2px 8px', borderRadius: 20,
              background: reactedByMe ? 'rgba(139,92,246,0.25)' : 'rgba(255,255,255,0.06)',
              border: reactedByMe ? '0.5px solid rgba(139,92,246,0.5)' : '0.5px solid rgba(255,255,255,0.1)',
              cursor: 'pointer', fontSize: 13, lineHeight: 1,
              transition: 'all 0.15s',
            }}
          >
            <span>{emoji}</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: reactedByMe ? '#a78bfa' : '#9ca3af', fontFamily: 'Inter,sans-serif' }}>
              {uids.length}
            </span>
          </button>
        );
      })}
    </div>
  );
}
