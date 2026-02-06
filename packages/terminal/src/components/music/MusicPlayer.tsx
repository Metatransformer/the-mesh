'use client';

import { useState, useRef, useEffect } from 'react';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { MESH_THEME } from '@/lib/theme';
import type { MusicPlayerState } from '@/hooks/useMusicPlayer';

interface MusicPlayerProps {
  player: MusicPlayerState;
}

export function MusicPlayer({ player }: MusicPlayerProps) {
  const [collapsed, setCollapsed] = useState(true);
  const [showVolume, setShowVolume] = useState(false);
  const volumeTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const volumeRef = useRef<HTMLDivElement>(null);

  // Close volume popup on outside click
  useEffect(() => {
    if (!showVolume) return;
    const onClick = (e: MouseEvent) => {
      if (volumeRef.current && !volumeRef.current.contains(e.target as Node)) {
        setShowVolume(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [showVolume]);

  const handleVolumeEnter = () => {
    if (volumeTimeout.current) clearTimeout(volumeTimeout.current);
    setShowVolume(true);
  };

  const handleVolumeLeave = () => {
    volumeTimeout.current = setTimeout(() => setShowVolume(false), 300);
  };

  if (collapsed) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        className="fixed bottom-4 left-4 z-50 w-10 h-10 rounded-full flex items-center justify-center transition-all hover:scale-110"
        style={{
          background: 'rgba(0,0,0,0.6)',
          border: `1px solid ${player.isPlaying ? MESH_THEME.cyan + '60' : 'rgba(255,255,255,0.1)'}`,
          boxShadow: player.isPlaying ? `0 0 12px ${MESH_THEME.cyan}40` : 'none',
        }}
        title="Music Player"
      >
        <span style={{ color: player.isPlaying ? MESH_THEME.cyan : 'rgba(255,255,255,0.4)' }}>
          {player.isPlaying ? '♫' : '♪'}
        </span>
      </button>
    );
  }

  const trackTitle = player.currentTrack?.title ?? 'No track';

  return (
    <GlassPanel
      className="fixed bottom-4 left-4 z-50 p-3"
      style={{ width: 280 }}
    >
      {/* Collapse button */}
      <button
        onClick={() => setCollapsed(true)}
        className="absolute top-1 right-2 text-white/30 hover:text-white/60 text-xs transition-colors"
        title="Minimize"
      >
        ▾
      </button>

      {/* Track name with marquee */}
      <div
        className="overflow-hidden mb-2 mt-1"
        style={{ height: 16 }}
      >
        <div
          className={trackTitle.length > 28 ? 'marquee-scroll' : ''}
          style={{
            fontSize: 11,
            fontFamily: 'monospace',
            color: player.isPlaying ? MESH_THEME.cyan : 'rgba(255,255,255,0.4)',
            whiteSpace: 'nowrap',
            textShadow: player.isPlaying ? `0 0 8px ${MESH_THEME.cyan}60` : 'none',
          }}
        >
          {trackTitle}
        </div>
      </div>

      {/* Controls row */}
      <div className="flex items-center gap-1">
        {/* Prev */}
        <ControlButton onClick={player.prev} title="Previous (,)">
          ⏮
        </ControlButton>

        {/* Play/Pause */}
        <ControlButton
          onClick={player.togglePlay}
          title="Play/Pause (M)"
          active={player.isPlaying}
          activeColor={MESH_THEME.cyan}
        >
          {player.isPlaying ? '⏸' : '▶'}
        </ControlButton>

        {/* Next */}
        <ControlButton onClick={player.next} title="Next (.)">
          ⏭
        </ControlButton>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Shuffle */}
        <ControlButton
          onClick={player.toggleShuffle}
          title="Shuffle"
          active={player.shuffle}
          activeColor={MESH_THEME.magenta}
        >
          ⇄
        </ControlButton>

        {/* Volume */}
        <div
          className="relative"
          ref={volumeRef}
          onMouseEnter={handleVolumeEnter}
          onMouseLeave={handleVolumeLeave}
        >
          <ControlButton
            onClick={() => setShowVolume(v => !v)}
            title={`Volume (Shift+M to mute)`}
            active={!player.isMuted}
            activeColor={MESH_THEME.cyan}
          >
            {player.isMuted ? '🔇' : player.volume > 0.5 ? '🔊' : '🔉'}
          </ControlButton>

          {/* Volume popup */}
          {showVolume && (
            <GlassPanel
              className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 p-3 flex flex-col items-center gap-2"
              style={{ width: 40, height: 120 }}
              onMouseEnter={handleVolumeEnter}
              onMouseLeave={handleVolumeLeave}
            >
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={player.isMuted ? 0 : player.volume}
                onChange={e => player.setVolume(parseFloat(e.target.value))}
                className="neon-range"
                style={{
                  writingMode: 'vertical-lr',
                  direction: 'rtl',
                  height: 90,
                  width: 4,
                }}
              />
            </GlassPanel>
          )}
        </div>
      </div>
    </GlassPanel>
  );
}

function ControlButton({
  children,
  onClick,
  title,
  active,
  activeColor,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  active?: boolean;
  activeColor?: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="w-8 h-8 rounded-lg flex items-center justify-center text-sm transition-all hover:bg-white/10"
      style={{
        color: active && activeColor ? activeColor : 'rgba(255,255,255,0.5)',
        textShadow: active && activeColor ? `0 0 8px ${activeColor}80` : 'none',
      }}
    >
      {children}
    </button>
  );
}
