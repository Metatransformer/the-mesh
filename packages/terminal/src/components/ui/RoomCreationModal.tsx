'use client';

import { useState } from 'react';
import { GlassPanel } from './GlassPanel';
import type { ClientParticipant } from '@/hooks/useMeshState';

interface RoomCreationModalProps {
  participants: ClientParticipant[];
  myId: string;
  onConfirm: (name: string, isPrivate: boolean, inviteIds: string[]) => void;
  onCancel: () => void;
}

export function RoomCreationModal({ participants, myId, onConfirm, onCancel }: RoomCreationModalProps) {
  const [name, setName] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const otherParticipants = participants.filter(p => p.id !== myId);

  const toggleParticipant = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSubmit = () => {
    if (!name.trim()) return;
    onConfirm(name.trim(), isPrivate, Array.from(selectedIds));
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <GlassPanel className="w-96 p-6 space-y-4">
        <h2
          className="text-lg font-bold tracking-wide"
          style={{ color: '#00f0ff', textShadow: '0 0 10px #00f0ff40' }}
        >
          Create Room
        </h2>

        <input
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSubmit()}
          placeholder="Room name"
          className="w-full bg-black/60 border border-[#00f0ff]/30 rounded-lg px-4 py-2.5 text-sm text-[#e0e0ff] placeholder-white/30 focus:outline-none focus:border-[#00f0ff] transition-colors"
          autoFocus
        />

        <label className="flex items-center gap-2 text-sm text-white/70 cursor-pointer">
          <input
            type="checkbox"
            checked={isPrivate}
            onChange={e => setIsPrivate(e.target.checked)}
            className="accent-[#00f0ff]"
          />
          Private room
        </label>

        {otherParticipants.length > 0 && (
          <div>
            <div className="text-xs text-white/40 uppercase tracking-wider mb-2">Invite participants</div>
            <div className="max-h-40 overflow-y-auto space-y-1 scrollbar-thin">
              {otherParticipants.map(p => (
                <label
                  key={p.id}
                  className="flex items-center gap-2 px-2 py-1 rounded hover:bg-white/5 cursor-pointer text-sm"
                >
                  <input
                    type="checkbox"
                    checked={selectedIds.has(p.id)}
                    onChange={() => toggleParticipant(p.id)}
                    className="accent-[#00f0ff]"
                  />
                  <span className={p.type === 'agent' ? 'text-[#ff00ff]' : 'text-[#00f0ff]'}>
                    {p.name}
                  </span>
                  <span className="text-[10px] text-white/30">({p.type})</span>
                </label>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-2 pt-2">
          <button
            onClick={onCancel}
            className="flex-1 py-2 rounded-lg text-sm text-white/50 hover:text-white/80 bg-white/5 hover:bg-white/10 border border-white/10 transition-all"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!name.trim()}
            className="flex-1 py-2 rounded-lg text-sm text-[#00f0ff] bg-[#00f0ff]/20 hover:bg-[#00f0ff]/30 border border-[#00f0ff]/30 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Create
          </button>
        </div>
      </GlassPanel>
    </div>
  );
}
