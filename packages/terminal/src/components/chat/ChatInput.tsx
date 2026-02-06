'use client';

import { useState, useRef, useCallback } from 'react';
import type { ClientParticipant } from '@/hooks/useMeshState';

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  participants: ClientParticipant[];
}

export function ChatInput({ value, onChange, onSend, participants }: ChatInputProps) {
  const [showMentions, setShowMentions] = useState(false);
  const [mentionFilter, setMentionFilter] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = showMentions
    ? participants
        .filter(p => p.name.toLowerCase().startsWith(mentionFilter.toLowerCase()))
        .slice(0, 8)
    : [];

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      onChange(val);

      const cursorPos = e.target.selectionStart || val.length;
      const textBefore = val.slice(0, cursorPos);
      const atMatch = textBefore.match(/@(\w*)$/);

      if (atMatch) {
        setShowMentions(true);
        setMentionFilter(atMatch[1]);
        setSelectedIndex(0);
      } else {
        setShowMentions(false);
      }
    },
    [onChange]
  );

  const insertMention = useCallback(
    (name: string) => {
      const cursorPos = inputRef.current?.selectionStart || value.length;
      const textBefore = value.slice(0, cursorPos);
      const atMatch = textBefore.match(/@(\w*)$/);
      if (atMatch) {
        const before = textBefore.slice(0, atMatch.index);
        const after = value.slice(cursorPos);
        onChange(`${before}@${name} ${after}`);
      }
      setShowMentions(false);
      inputRef.current?.focus();
    },
    [value, onChange]
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (showMentions && filtered.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(i => (i + 1) % filtered.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(i => (i - 1 + filtered.length) % filtered.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        insertMention(filtered[selectedIndex].name);
        return;
      }
    }

    if (e.key === 'Escape') {
      setShowMentions(false);
      return;
    }

    if (e.key === 'Enter' && !showMentions) {
      onSend();
    }
  };

  return (
    <div className="relative">
      {/* Mention autocomplete dropdown */}
      {showMentions && filtered.length > 0 && (
        <div className="absolute bottom-full left-0 mb-2 w-64 backdrop-blur-xl bg-black/70 border border-[#00f0ff]/20 rounded-lg shadow-lg py-1 z-50">
          {filtered.map((p, i) => (
            <button
              key={p.id}
              className={`w-full text-left px-3 py-1.5 text-sm flex items-center gap-2 transition-colors ${
                i === selectedIndex
                  ? 'bg-[#00f0ff]/20 text-[#00f0ff]'
                  : 'text-[#e0e0ff] hover:bg-white/10'
              }`}
              onMouseDown={e => {
                e.preventDefault();
                insertMention(p.name);
              }}
              onMouseEnter={() => setSelectedIndex(i)}
            >
              <span
                className={`w-2 h-2 rounded-full flex-shrink-0 ${
                  p.online ? 'bg-green-400' : 'bg-white/20'
                }`}
              />
              <span className="truncate">{p.name}</span>
              <span className="text-xs text-white/40 ml-auto">
                {p.type === 'agent' ? 'agent' : 'user'}
              </span>
            </button>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <input
          ref={inputRef}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder="Type a message... (@name for DM)"
          className="flex-1 bg-black/60 border border-[#00f0ff]/30 rounded-lg px-4 py-2.5 text-sm text-[#e0e0ff] placeholder-white/30 focus:outline-none focus:border-[#00f0ff] transition-colors"
        />
        <button
          onClick={onSend}
          className="bg-[#00f0ff]/20 hover:bg-[#00f0ff]/30 text-[#00f0ff] border border-[#00f0ff]/30 px-5 py-2.5 rounded-lg text-sm font-medium transition-colors"
        >
          Send
        </button>
      </div>
    </div>
  );
}
