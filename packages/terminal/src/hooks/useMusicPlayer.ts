'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { PLAYLIST, type Track } from '@/lib/playlist';

interface MusicPrefs {
  volume: number;
  muted: boolean;
  shuffle: boolean;
  lastTrackIndex: number;
}

const PREFS_KEY = 'mesh-music-prefs';

function loadPrefs(): MusicPrefs {
  if (typeof window === 'undefined') return { volume: 0.5, muted: false, shuffle: false, lastTrackIndex: 0 };
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { volume: 0.5, muted: false, shuffle: false, lastTrackIndex: 0 };
}

function savePrefs(prefs: MusicPrefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {}
}

export interface MusicPlayerState {
  isPlaying: boolean;
  currentTrack: Track | null;
  currentIndex: number;
  volume: number;
  isMuted: boolean;
  shuffle: boolean;
  togglePlay: () => void;
  next: () => void;
  prev: () => void;
  setVolume: (v: number) => void;
  toggleMute: () => void;
  toggleShuffle: () => void;
}

export function useMusicPlayer(): MusicPlayerState {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(() => loadPrefs().lastTrackIndex);
  const [volume, setVolumeState] = useState(() => loadPrefs().volume);
  const [isMuted, setIsMuted] = useState(() => loadPrefs().muted);
  const [shuffle, setShuffle] = useState(() => loadPrefs().shuffle);

  const currentTrack = PLAYLIST[currentIndex] ?? null;

  // Persist prefs when they change
  useEffect(() => {
    savePrefs({ volume, muted: isMuted, shuffle, lastTrackIndex: currentIndex });
  }, [volume, isMuted, shuffle, currentIndex]);

  const getAudio = useCallback(() => {
    if (!audioRef.current) {
      audioRef.current = new Audio();
    }
    return audioRef.current;
  }, []);

  const playTrack = useCallback((index: number) => {
    const audio = getAudio();
    const track = PLAYLIST[index];
    if (!track) return;
    audio.src = track.url;
    audio.volume = isMuted ? 0 : volume;
    audio.play().catch(() => {
      // Autoplay blocked — user interaction needed
      setIsPlaying(false);
    });
    setCurrentIndex(index);
    setIsPlaying(true);
  }, [getAudio, isMuted, volume]);

  const pickNextIndex = useCallback((fromIndex: number) => {
    if (shuffle) {
      let next = Math.floor(Math.random() * PLAYLIST.length);
      if (PLAYLIST.length > 1) {
        while (next === fromIndex) {
          next = Math.floor(Math.random() * PLAYLIST.length);
        }
      }
      return next;
    }
    return (fromIndex + 1) % PLAYLIST.length;
  }, [shuffle]);

  // Auto-advance + error skip
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onEnded = () => {
      const nextIdx = pickNextIndex(currentIndex);
      playTrack(nextIdx);
    };
    const onError = () => {
      const nextIdx = pickNextIndex(currentIndex);
      playTrack(nextIdx);
    };

    audio.addEventListener('ended', onEnded);
    audio.addEventListener('error', onError);
    return () => {
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('error', onError);
    };
  }, [currentIndex, pickNextIndex, playTrack]);

  // Sync volume/mute to audio element
  useEffect(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.volume = isMuted ? 0 : volume;
    }
  }, [volume, isMuted]);

  const togglePlay = useCallback(() => {
    const audio = getAudio();
    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      if (!audio.src || audio.src === '') {
        playTrack(currentIndex);
      } else {
        audio.play().catch(() => setIsPlaying(false));
        setIsPlaying(true);
      }
    }
  }, [getAudio, isPlaying, playTrack, currentIndex]);

  const next = useCallback(() => {
    const nextIdx = pickNextIndex(currentIndex);
    if (isPlaying) {
      playTrack(nextIdx);
    } else {
      setCurrentIndex(nextIdx);
    }
  }, [currentIndex, isPlaying, pickNextIndex, playTrack]);

  const prev = useCallback(() => {
    const prevIdx = shuffle
      ? Math.floor(Math.random() * PLAYLIST.length)
      : (currentIndex - 1 + PLAYLIST.length) % PLAYLIST.length;
    if (isPlaying) {
      playTrack(prevIdx);
    } else {
      setCurrentIndex(prevIdx);
    }
  }, [currentIndex, isPlaying, shuffle, playTrack]);

  const setVolume = useCallback((v: number) => {
    const clamped = Math.max(0, Math.min(1, v));
    setVolumeState(clamped);
  }, []);

  const toggleMute = useCallback(() => {
    setIsMuted(m => !m);
  }, []);

  const toggleShuffle = useCallback(() => {
    setShuffle(s => !s);
  }, []);

  return {
    isPlaying,
    currentTrack,
    currentIndex,
    volume,
    isMuted,
    shuffle,
    togglePlay,
    next,
    prev,
    setVolume,
    toggleMute,
    toggleShuffle,
  };
}
