#!/usr/bin/env node
// A bot that connects via HTTP webhooks + SSE instead of WebSocket
// Works for serverless/stateless environments

const MESH_URL = process.env.MESH_URL || 'http://localhost:3000';
const BOT_TOKEN = process.env.BOT_TOKEN;
const ROOM_NAME = process.env.ROOM_NAME || 'general';

if (!BOT_TOKEN) {
  console.error('Set BOT_TOKEN environment variable');
  process.exit(1);
}

const headers = {
  'Content-Type': 'application/json',
  Authorization: `Bearer ${BOT_TOKEN}`,
};

// Command handlers
const commands = {
  ping: () => 'pong!',
  help: () => 'Commands: ping, help, echo <text>, time',
  echo: (args) => args.join(' ') || '(empty)',
  time: () => new Date().toISOString(),
};

async function postMessage(roomId, content) {
  const res = await fetch(`${MESH_URL}/api/webhooks`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ roomId, content }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    console.error('Failed to post:', err.error || res.status);
  }
}

async function findRoom(name) {
  const res = await fetch(`${MESH_URL}/api/rooms`);
  const rooms = await res.json();
  return rooms.find((r) => r.name === name);
}

async function joinRoom(roomId) {
  await fetch(`${MESH_URL}/api/rooms/${roomId}/join`, {
    method: 'POST',
    headers,
    body: '{}',
  });
}

function handleMessage(msg, botName, roomId) {
  if (msg.senderName === botName) return;
  console.log(`[${msg.senderName}] ${msg.content}`);

  // Check for !command or @botname command
  let cmdText = null;
  if (msg.content.startsWith('!')) {
    cmdText = msg.content.slice(1);
  } else if (msg.content.startsWith(`@${botName} `)) {
    cmdText = msg.content.slice(botName.length + 2);
  }

  if (cmdText) {
    const [cmd, ...args] = cmdText.trim().split(/\s+/);
    const handler = commands[cmd];
    if (handler) {
      const result = handler(args);
      if (result) postMessage(roomId, String(result));
    }
  }
}

async function main() {
  // Get bot info
  const meRes = await fetch(`${MESH_URL}/api/participants`, { headers });
  // Find our room
  const room = await findRoom(ROOM_NAME);
  if (!room) {
    console.error(`Room "${ROOM_NAME}" not found`);
    process.exit(1);
  }

  await joinRoom(room.id);
  console.log(`✓ Joined ${ROOM_NAME} (${room.id})`);

  // Subscribe to messages via SSE
  const sseUrl = `${MESH_URL}/api/webhooks/subscribe?roomId=${room.id}`;
  console.log(`Subscribing to SSE: ${sseUrl}`);

  // Use native fetch for SSE (Node 18+)
  const res = await fetch(sseUrl, { headers: { Authorization: `Bearer ${BOT_TOKEN}` } });

  if (!res.ok) {
    console.error(`SSE connection failed: ${res.status}`);
    process.exit(1);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const botName = 'webhook-bot'; // adjust to your bot's name

  console.log('✓ Listening for messages via SSE...');

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          const msg = JSON.parse(line.slice(6));
          handleMessage(msg, botName, room.id);
        } catch {}
      }
    }
  }

  console.log('SSE stream ended, exiting');
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
