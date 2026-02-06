'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { MESH_THEME } from '@/lib/theme';
import { PLAYLIST_ATTRIBUTION } from '@/lib/playlist';
import type { MusicPlayerState } from '@/hooks/useMusicPlayer';

interface CommandItem {
  key: string;
  label: string;
  action?: () => void;
}

interface CommandSection {
  title: string;
  items: CommandItem[];
}

interface CommandMenuProps {
  isOpen: boolean;
  onClose: () => void;
  musicPlayer: MusicPlayerState;
}

export function CommandMenu({ isOpen, onClose, musicPlayer }: CommandMenuProps) {
  const [search, setSearch] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus search input when opened
  useEffect(() => {
    if (isOpen) {
      setSearch('');
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const sections: CommandSection[] = useMemo(() => [
    {
      title: 'Navigation',
      items: [
        { key: 'W / ↑', label: 'Pan camera up' },
        { key: 'A / ←', label: 'Pan camera left' },
        { key: 'S / ↓', label: 'Pan camera down' },
        { key: 'D / →', label: 'Pan camera right' },
        { key: '] / +', label: 'Zoom in' },
        { key: '[ / -', label: 'Zoom out' },
        { key: 'Mouse drag', label: 'Orbit camera' },
        { key: 'Scroll', label: 'Zoom in/out' },
      ],
    },
    {
      title: 'Music',
      items: [
        { key: 'M', label: 'Play / Pause', action: musicPlayer.togglePlay },
        { key: 'Shift+M', label: 'Toggle mute', action: musicPlayer.toggleMute },
        { key: ',', label: 'Previous track', action: musicPlayer.prev },
        { key: '.', label: 'Next track', action: musicPlayer.next },
        { key: 'Shift+↑', label: 'Volume up', action: () => musicPlayer.setVolume(musicPlayer.volume + 0.1) },
        { key: 'Shift+↓', label: 'Volume down', action: () => musicPlayer.setVolume(musicPlayer.volume - 0.1) },
      ],
    },
    {
      title: 'Interface',
      items: [
        { key: '`', label: 'Toggle command menu', action: onClose },
        { key: 'Ctrl/⌘+K', label: 'Toggle command menu', action: onClose },
        { key: 'Escape', label: 'Close menu / modal', action: onClose },
      ],
    },
  ], [musicPlayer, onClose]);

  const filteredSections = useMemo(() => {
    if (!search.trim()) return sections;
    const q = search.toLowerCase();
    return sections
      .map(section => ({
        ...section,
        items: section.items.filter(
          item =>
            item.label.toLowerCase().includes(q) ||
            item.key.toLowerCase().includes(q) ||
            section.title.toLowerCase().includes(q)
        ),
      }))
      .filter(section => section.items.length > 0);
  }, [sections, search]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center"
      style={{ backdropFilter: 'blur(8px)', background: 'rgba(5,5,16,0.7)' }}
      onClick={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <GlassPanel
        className="w-full max-w-lg max-h-[70vh] flex flex-col overflow-hidden"
        style={{ border: `1px solid ${MESH_THEME.cyan}30` }}
      >
        {/* Header */}
        <div className="p-4 border-b border-white/5">
          <div className="flex items-center gap-3 mb-3">
            <span
              className="text-sm font-bold tracking-wider"
              style={{ color: MESH_THEME.cyan, textShadow: `0 0 10px ${MESH_THEME.cyan}60` }}
            >
              COMMANDS
            </span>
            <div className="flex-1" />
            <button
              onClick={onClose}
              className="text-white/30 hover:text-white/60 text-xs transition-colors"
            >
              ESC
            </button>
          </div>
          <input
            ref={inputRef}
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search commands..."
            className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white/80 placeholder-white/20 font-mono focus:outline-none focus:border-cyan-500/30 transition-colors"
            onKeyDown={e => {
              if (e.key === 'Escape') {
                e.stopPropagation();
                onClose();
              }
            }}
          />
        </div>

        {/* Sections */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {filteredSections.map(section => (
            <div key={section.title}>
              <h3
                className="text-[10px] uppercase tracking-widest mb-2 font-mono"
                style={{ color: MESH_THEME.magenta, textShadow: `0 0 6px ${MESH_THEME.magenta}40` }}
              >
                {section.title}
              </h3>
              <div className="space-y-1">
                {section.items.map(item => (
                  <button
                    key={`${section.title}-${item.key}`}
                    className="w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-sm transition-all hover:bg-white/5"
                    style={{ cursor: item.action ? 'pointer' : 'default' }}
                    onClick={() => {
                      if (item.action) {
                        item.action();
                        onClose();
                      }
                    }}
                  >
                    <span className="text-white/60">{item.label}</span>
                    <kbd
                      className="text-[10px] font-mono px-2 py-0.5 rounded"
                      style={{
                        background: 'rgba(0,240,255,0.08)',
                        border: `1px solid ${MESH_THEME.cyan}20`,
                        color: MESH_THEME.cyan,
                      }}
                    >
                      {item.key}
                    </kbd>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer: Attribution */}
        <div
          className="px-4 py-2 border-t border-white/5 text-center"
          style={{ fontSize: 9, color: 'rgba(255,255,255,0.2)', fontFamily: 'monospace' }}
        >
          {PLAYLIST_ATTRIBUTION}
        </div>
      </GlassPanel>
    </div>
  );
}
