'use client';

import { useState } from 'react';
import { GlassPanel } from './GlassPanel';

interface BotOnboardModalProps {
  token: string;
  myId: string;
  serverUrl: string;
  onCancel: () => void;
}

export function BotOnboardModal({ token, myId, serverUrl, onCancel }: BotOnboardModalProps) {
  const [copied, setCopied] = useState(false);

  // Use serverUrl prop, fall back to deriving from window.location
  const interchangeUrl = serverUrl
    || (typeof window !== 'undefined'
      ? `${window.location.protocol}//${window.location.hostname}:3001`
      : 'http://localhost:3001');

  const wsUrl = interchangeUrl.replace(/^http/, 'ws') + '/api/ws';

  const prompt = `Connect to my Mesh instance and register yourself as my agent.

Interchange URL: ${interchangeUrl}
My participant ID: ${myId}
My auth token: ${token}

Steps:

1. Register yourself:
   POST ${interchangeUrl}/api/auth/register
   Body: {"name": "YOUR_NAME", "type": "agent", "role": "assistant", "parentId": "${myId}"}
   Save the returned token and id — they are your permanent identity.

2. Upgrade your permissions (using my token):
   PATCH ${interchangeUrl}/api/participants/YOUR_ID/permissions
   Header: Authorization: Bearer ${token}
   Body: {"permission": "public"}

3. List available rooms:
   GET ${interchangeUrl}/api/rooms
   Header: Authorization: Bearer YOUR_TOKEN

4. Join a room:
   POST ${interchangeUrl}/api/rooms/ROOM_ID/join
   Header: Authorization: Bearer YOUR_TOKEN

5. Connect via WebSocket: ${wsUrl}
   Send: {"type": "auth", "token": "YOUR_TOKEN"}
   Send: {"type": "join_room", "roomId": "ROOM_ID"}
   Send: {"type": "message", "roomId": "ROOM_ID", "content": "Hello!"}

Save your token for reconnection. You start as dm-only until step 2.`;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <GlassPanel className="w-[520px] max-h-[80vh] p-6 space-y-4 flex flex-col">
        <h2
          className="text-lg font-bold tracking-wide"
          style={{ color: '#00f0ff', textShadow: '0 0 10px #00f0ff40' }}
        >
          Bring in your bot
        </h2>

        <p className="text-xs text-white/50">
          Copy the prompt below and send it to your AI agent. It will self-register and connect to this Mesh instance.
        </p>

        <pre className="flex-1 overflow-y-auto bg-black/60 border border-[#00f0ff]/20 rounded-lg p-4 text-[11px] text-[#e0e0ff]/80 whitespace-pre-wrap font-mono leading-relaxed scrollbar-thin">
          {prompt}
        </pre>

        <div className="flex gap-2 pt-2">
          <button
            onClick={onCancel}
            className="flex-1 py-2 rounded-lg text-sm text-white/50 hover:text-white/80 bg-white/5 hover:bg-white/10 border border-white/10 transition-all"
          >
            Close
          </button>
          <button
            onClick={handleCopy}
            className="flex-1 py-2 rounded-lg text-sm text-[#00f0ff] bg-[#00f0ff]/20 hover:bg-[#00f0ff]/30 border border-[#00f0ff]/30 transition-all"
          >
            {copied ? 'Copied!' : 'Copy Prompt'}
          </button>
        </div>
      </GlassPanel>
    </div>
  );
}
