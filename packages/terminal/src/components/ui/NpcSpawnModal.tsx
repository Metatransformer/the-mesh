'use client';

import { useState } from 'react';
import { GlassPanel } from './GlassPanel';
import { NPC_PRESETS, type NpcPreset } from '@/lib/npc-presets';

interface NpcSpawnModalProps {
  token: string;
  myId: string;
  serverUrl: string;
  activeRoom: string | null;
  onSpawned: () => void;
  onCancel: () => void;
}

export function NpcSpawnModal({ token, myId, serverUrl, activeRoom, onSpawned, onCancel }: NpcSpawnModalProps) {
  const [selected, setSelected] = useState<NpcPreset | null>(null);
  const [name, setName] = useState('');
  const [permission, setPermission] = useState<string>('');
  const [spawning, setSpawning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectPreset = (preset: NpcPreset) => {
    setSelected(preset);
    const suffix = Math.random().toString(36).slice(2, 6);
    setName(`${preset.type}-${suffix}`);
    setPermission(preset.defaultPermission);
    setError(null);
  };

  const handleSpawn = async () => {
    if (!selected || !name.trim()) return;
    setSpawning(true);
    setError(null);

    try {
      // 1. Register the agent
      const base = serverUrl;
      const regRes = await fetch(base ? `${base}/api/auth/register` : '/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          type: 'agent',
          role: selected.role,
          parentId: myId,
        }),
      });
      if (!regRes.ok) {
        const data = await regRes.json();
        throw new Error(data.error || 'Registration failed');
      }
      const agent = await regRes.json();

      // 2. Set permission if different from default
      if (permission !== 'dm-only') {
        await fetch(base ? `${base}/api/participants/${agent.id}/permissions` : `/api/participants/${agent.id}/permissions`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ permission }),
        });
      }

      // 3. Invite to active room if one is selected
      if (activeRoom) {
        await fetch(base ? `${base}/api/rooms/${activeRoom}/invite` : `/api/rooms/${activeRoom}/invite`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ participantId: agent.id }),
        });
      }

      onSpawned();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Spawn failed');
      setSpawning(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <GlassPanel className="w-[420px] p-6 space-y-4">
        <h2
          className="text-lg font-bold tracking-wide"
          style={{ color: '#ff00ff', textShadow: '0 0 10px #ff00ff40' }}
        >
          Spawn NPC
        </h2>

        {!selected ? (
          /* Preset grid */
          <div className="grid grid-cols-2 gap-2">
            {NPC_PRESETS.map(preset => (
              <button
                key={preset.type}
                onClick={() => selectPreset(preset)}
                className="flex items-start gap-3 p-3 rounded-lg bg-white/5 border border-white/10 hover:border-[#ff00ff]/40 hover:bg-white/10 transition-all text-left"
              >
                <span className="text-2xl">{preset.icon}</span>
                <div>
                  <div className="text-sm font-medium text-[#ff00ff]">{preset.type}</div>
                  <div className="text-[11px] text-white/40 leading-tight">{preset.description}</div>
                  <div className={`text-[10px] mt-1 ${
                    preset.defaultPermission === 'public' ? 'text-green-400' :
                    preset.defaultPermission === 'dm-only' ? 'text-yellow-400' : 'text-red-400'
                  }`}>
                    {preset.defaultPermission}
                  </div>
                </div>
              </button>
            ))}
          </div>
        ) : (
          /* Configuration */
          <div className="space-y-3">
            <button
              onClick={() => setSelected(null)}
              className="text-xs text-white/40 hover:text-white/60 transition-colors"
            >
              &larr; Back to presets
            </button>

            <div className="flex items-center gap-3 p-3 rounded-lg bg-white/5 border border-[#ff00ff]/20">
              <span className="text-2xl">{selected.icon}</span>
              <div>
                <div className="text-sm font-medium text-[#ff00ff]">{selected.type}</div>
                <div className="text-[11px] text-white/40">{selected.description}</div>
              </div>
            </div>

            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Agent name"
              className="w-full bg-black/60 border border-[#ff00ff]/30 rounded-lg px-4 py-2.5 text-sm text-[#e0e0ff] placeholder-white/30 focus:outline-none focus:border-[#ff00ff] transition-colors"
            />

            <div className="flex items-center gap-2">
              <span className="text-xs text-white/40">Permission:</span>
              <select
                value={permission}
                onChange={e => setPermission(e.target.value)}
                className="bg-black/60 border border-white/10 rounded px-2 py-1 text-xs text-white/70 focus:outline-none"
              >
                <option value="public">public</option>
                <option value="dm-only">dm-only</option>
                <option value="silent">silent</option>
              </select>
            </div>

            {error && (
              <div className="text-xs text-red-400">{error}</div>
            )}
          </div>
        )}

        <div className="flex gap-2 pt-2">
          <button
            onClick={onCancel}
            className="flex-1 py-2 rounded-lg text-sm text-white/50 hover:text-white/80 bg-white/5 hover:bg-white/10 border border-white/10 transition-all"
          >
            Cancel
          </button>
          {selected && (
            <button
              onClick={handleSpawn}
              disabled={!name.trim() || spawning}
              className="flex-1 py-2 rounded-lg text-sm text-[#ff00ff] bg-[#ff00ff]/20 hover:bg-[#ff00ff]/30 border border-[#ff00ff]/30 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
            >
              {spawning ? 'Spawning...' : 'Spawn'}
            </button>
          )}
        </div>
      </GlassPanel>
    </div>
  );
}
