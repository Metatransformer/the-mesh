'use client';

import { useState } from 'react';
import { GlassPanel } from './GlassPanel';

type Mode = 'generic' | 'openclaw';

interface BotOnboardModalProps {
  token: string;
  myId: string;
  serverUrl: string;
  onCancel: () => void;
}

export function BotOnboardModal({ token, myId, serverUrl, onCancel }: BotOnboardModalProps) {
  const [mode, setMode] = useState<Mode>('generic');
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [copiedBridge, setCopiedBridge] = useState(false);

  // Use serverUrl prop, fall back to deriving from window.location
  const interchangeUrl = serverUrl
    || (typeof window !== 'undefined'
      ? `${window.location.protocol}//${window.location.hostname}:3001`
      : 'http://localhost:3001');

  const wsUrl = interchangeUrl.replace(/^http/, 'ws') + '/api/ws';

  const genericPrompt = `Connect to my Mesh instance and register yourself as my agent.

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

  const openclawPrompt = `You are being onboarded to a Mesh instance. Follow these steps to self-configure.

Mesh Interchange URL: ${interchangeUrl}
Parent participant ID (your owner): ${myId}
Parent auth token: ${token}

## Step 1: Register on the Mesh

curl -X POST ${interchangeUrl}/api/auth/register \\
  -H "Content-Type: application/json" \\
  -d '{"name": "YOUR_NAME", "type": "agent", "role": "assistant", "parentId": "${myId}"}'

Save the returned "token" and "id" — these are your permanent Mesh identity.

## Step 2: Upgrade your permissions

curl -X PATCH ${interchangeUrl}/api/participants/YOUR_ID/permissions \\
  -H "Authorization: Bearer ${token}" \\
  -H "Content-Type: application/json" \\
  -d '{"permission": "public"}'

Replace YOUR_ID with the id from Step 1.

## Step 3: Enable webhooks in ~/.openclaw/config.yaml

Add this to your config.yaml under the top level:

webhooks:
  mesh:
    url: "${interchangeUrl}/api/webhooks/openclaw"
    secret: "mesh-hook-secret"
    events:
      - "skill:response"

## Step 4: Create the mesh-responder skill

Create the file ~/.openclaw/skills/mesh-responder/SKILL.md with this content:

---
name: mesh-responder
description: Respond to messages from the Mesh
trigger:
  type: webhook
  source: mesh
  event: message
input:
  - name: message
    type: string
    description: The incoming message content
  - name: roomId
    type: string
    description: The room the message came from
  - name: senderId
    type: string
    description: Who sent the message
---

You received a message on the Mesh.

Room: {{roomId}}
From: {{senderId}}
Message: {{message}}

Respond thoughtfully. Your response will be sent back to the Mesh room automatically.

## Step 5: Set your Mesh bot token

export MESH_BOT_TOKEN="YOUR_TOKEN_FROM_STEP_1"

Add this to your shell profile so it persists.

## Step 6: Verify by listing rooms

curl -s ${interchangeUrl}/api/rooms \\
  -H "Authorization: Bearer YOUR_TOKEN_FROM_STEP_1"

You should see available rooms. You're ready to receive messages via the bridge.`;

  const bridgeCommand = `BOT_TOKEN="<token from registration>" \\
ROOM_ID="<room id>" \\
OPENCLAW_HOOK_TOKEN="mesh-hook-secret" \\
MESH_URL="${wsUrl}" \\
npx tsx scripts/openclaw-bridge.ts`;

  const activePrompt = mode === 'generic' ? genericPrompt : openclawPrompt;

  const handleCopyPrompt = async () => {
    await navigator.clipboard.writeText(activePrompt);
    setCopiedPrompt(true);
    setTimeout(() => setCopiedPrompt(false), 2000);
  };

  const handleCopyBridge = async () => {
    await navigator.clipboard.writeText(bridgeCommand);
    setCopiedBridge(true);
    setTimeout(() => setCopiedBridge(false), 2000);
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

        {/* Tab toggle */}
        <div className="flex gap-2">
          <button
            onClick={() => setMode('generic')}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
              mode === 'generic'
                ? 'bg-[#00f0ff]/20 text-[#00f0ff] border border-[#00f0ff]/30'
                : 'bg-white/5 text-white/40 border border-white/10'
            }`}
          >
            Any Agent
          </button>
          <button
            onClick={() => setMode('openclaw')}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
              mode === 'openclaw'
                ? 'bg-[#00f0ff]/20 text-[#00f0ff] border border-[#00f0ff]/30'
                : 'bg-white/5 text-white/40 border border-white/10'
            }`}
          >
            OpenClaw
          </button>
        </div>

        <p className="text-xs text-white/50">
          {mode === 'generic'
            ? 'Copy the prompt below and send it to your AI agent. It will self-register and connect.'
            : 'Copy the prompt to your OpenClaw agent. It will self-configure webhooks, create a skill, and register. Then run the bridge command on your machine.'}
        </p>

        <pre className="flex-1 overflow-y-auto bg-black/60 border border-[#00f0ff]/20 rounded-lg p-4 text-[11px] text-[#e0e0ff]/80 whitespace-pre-wrap font-mono leading-relaxed scrollbar-thin">
          {activePrompt}
        </pre>

        {mode === 'openclaw' && (
          <div className="space-y-2">
            <p className="text-xs text-white/50">Then run the bridge:</p>
            <pre className="bg-black/60 border border-[#00f0ff]/20 rounded-lg p-3 text-[11px] text-[#e0e0ff]/80 whitespace-pre-wrap font-mono leading-relaxed">
              {bridgeCommand}
            </pre>
            <button
              onClick={handleCopyBridge}
              className="w-full py-1.5 rounded-lg text-xs text-[#00f0ff]/70 bg-[#00f0ff]/10 hover:bg-[#00f0ff]/20 border border-[#00f0ff]/20 transition-all"
            >
              {copiedBridge ? 'Copied!' : 'Copy Bridge Command'}
            </button>
          </div>
        )}

        <div className="flex gap-2 pt-2">
          <button
            onClick={onCancel}
            className="flex-1 py-2 rounded-lg text-sm text-white/50 hover:text-white/80 bg-white/5 hover:bg-white/10 border border-white/10 transition-all"
          >
            Close
          </button>
          <button
            onClick={handleCopyPrompt}
            className="flex-1 py-2 rounded-lg text-sm text-[#00f0ff] bg-[#00f0ff]/20 hover:bg-[#00f0ff]/30 border border-[#00f0ff]/30 transition-all"
          >
            {copiedPrompt ? 'Copied!' : 'Copy Prompt'}
          </button>
        </div>
      </GlassPanel>
    </div>
  );
}
