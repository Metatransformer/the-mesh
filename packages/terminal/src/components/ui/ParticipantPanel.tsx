'use client';

import { useState } from 'react';
import type { ClientParticipant } from '@/hooks/useMeshState';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { NpcSpawnModal } from '@/components/ui/NpcSpawnModal';
import { BotOnboardModal } from '@/components/ui/BotOnboardModal';
import { ParticipantList } from '@/components/chat/ParticipantList';

interface ParticipantPanelProps {
  participants: ClientParticipant[];
  myId: string;
  token: string;
  serverUrl: string;
  roomMembers?: Record<string, string[]>;
  activeRoom?: string | null;
  onParticipantsChanged?: () => void;
}

export function ParticipantPanel({ participants, myId, token, serverUrl, roomMembers, activeRoom, onParticipantsChanged }: ParticipantPanelProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [showSpawnModal, setShowSpawnModal] = useState(false);
  const [showBotModal, setShowBotModal] = useState(false);

  if (collapsed) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        className="fixed left-4 top-20 z-50 w-10 h-10 rounded-full backdrop-blur-xl bg-black/60 border border-[#00f0ff]/30 flex items-center justify-center hover:border-[#00f0ff]/60 transition-all group"
      >
        <svg
          className="w-5 h-5 text-[#00f0ff] group-hover:scale-110 transition-transform"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
        </svg>
      </button>
    );
  }

  return (
    <>
      <GlassPanel className="fixed left-4 top-20 bottom-4 w-72 z-50 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-[#00f0ff]/10">
          <span className="text-xs font-semibold text-white/50 uppercase tracking-wider">
            Participants
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowBotModal(true)}
              className="p-1 text-[#00f0ff]/60 hover:text-[#00f0ff] transition-colors"
              title="Bring in your bot"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m9.86-2.54 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" />
              </svg>
            </button>
            <button
              onClick={() => setShowSpawnModal(true)}
              className="p-1 text-[#ff00ff]/60 hover:text-[#ff00ff] transition-colors"
              title="Spawn NPC"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
            </button>
            <button
              onClick={() => setCollapsed(true)}
              className="p-1 text-white/30 hover:text-white/60 transition-colors"
              title="Minimize"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 12h-15" />
              </svg>
            </button>
          </div>
        </div>

        {/* Scrollable participant list */}
        <div className="flex-1 overflow-y-auto scrollbar-thin">
          <ParticipantList
            participants={participants}
            allParticipants={participants}
            myId={myId}
            token={token}
            serverUrl={serverUrl}
            roomMembers={roomMembers}
            activeRoom={activeRoom}
            onParticipantsChanged={onParticipantsChanged}
          />
        </div>
      </GlassPanel>

      {showSpawnModal && (
        <NpcSpawnModal
          token={token}
          myId={myId}
          serverUrl={serverUrl}
          activeRoom={activeRoom ?? null}
          onSpawned={() => {
            setShowSpawnModal(false);
            onParticipantsChanged?.();
          }}
          onCancel={() => setShowSpawnModal(false)}
        />
      )}

      {showBotModal && (
        <BotOnboardModal
          token={token}
          myId={myId}
          serverUrl={serverUrl}
          onCancel={() => setShowBotModal(false)}
        />
      )}
    </>
  );
}
