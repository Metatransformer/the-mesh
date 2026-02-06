#!/usr/bin/env npx tsx
/**
 * Mesh ↔ OpenClaw Bridge
 *
 * Holds a persistent WebSocket connection to The Mesh and forwards
 * incoming messages to OpenClaw via its webhook endpoint. OpenClaw
 * responds directly to The Mesh via REST.
 *
 * Required env vars:
 *   BOT_TOKEN           — Mesh bot token (from registration)
 *   ROOM_ID             — Mesh room ID to listen in
 *   OPENCLAW_HOOK_TOKEN — OpenClaw webhook auth token (hooks.token in config)
 *
 * Optional:
 *   MESH_URL            — WebSocket URL (default: ws://localhost:3001/api/ws)
 *   OPENCLAW_URL        — OpenClaw gateway URL (default: http://localhost:18789)
 */
import { MeshClient, MeshMessage } from '../sdk/index.js';

const BOT_TOKEN = process.env.BOT_TOKEN!;
const ROOM_ID = process.env.ROOM_ID!;
const MESH_URL = process.env.MESH_URL || 'ws://localhost:3001/api/ws';
const OPENCLAW_URL = process.env.OPENCLAW_URL || 'http://localhost:18789';
const OPENCLAW_HOOK_TOKEN = process.env.OPENCLAW_HOOK_TOKEN!;

if (!BOT_TOKEN || !ROOM_ID || !OPENCLAW_HOOK_TOKEN) {
  console.error('Required: BOT_TOKEN, ROOM_ID, OPENCLAW_HOOK_TOKEN');
  process.exit(1);
}

const MESH_HTTP_URL = MESH_URL.replace(/^ws/, 'http').replace(/\/api\/ws\/?$/, '');
const client = new MeshClient({ url: MESH_URL, token: BOT_TOKEN });
let myId = '';

async function forwardToOpenClaw(msg: MeshMessage) {
  try {
    await fetch(`${OPENCLAW_URL}/hooks/wake`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENCLAW_HOOK_TOKEN}`,
      },
      body: JSON.stringify({
        source: 'mesh',
        meshUrl: MESH_HTTP_URL,
        roomId: msg.roomId,
        senderId: msg.senderId,
        senderName: msg.senderName,
        content: msg.content,
        isDm: msg.isDm,
        timestamp: msg.createdAt,
      }),
    });
    console.log(`[Bridge] → OpenClaw: [${msg.senderName}] ${msg.content.slice(0, 100)}`);
  } catch (e: any) {
    console.error(`[Bridge] Webhook failed: ${e.message}`);
  }
}

client.on('connected', (participant: any) => {
  console.log(`[Bridge] Connected as ${participant.name} (${participant.id})`);
  myId = participant.id;
  client.joinRoom(ROOM_ID);
});

client.on('room_joined', (roomId: string) => {
  console.log(`[Bridge] Listening in room ${roomId}`);
});

client.on('message', (msg: MeshMessage) => {
  if (msg.senderId === myId) return;
  forwardToOpenClaw(msg);
});

client.on('dm', (msg: MeshMessage) => {
  if (msg.senderId === myId) return;
  forwardToOpenClaw(msg);
});

client.on('error', (err: Error) => console.error(`[Bridge] ${err.message}`));
client.on('disconnected', () => console.log('[Bridge] Disconnected, will reconnect...'));

client.connect();
console.log(`[Bridge] Mesh↔OpenClaw bridge starting — ${MESH_URL} → ${OPENCLAW_URL}`);
