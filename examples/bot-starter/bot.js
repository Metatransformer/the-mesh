#!/usr/bin/env node
// A starter bot that connects to the mesh and handles commands
const { MeshClient } = require('../../sdk/index.js');

const MESH_URL = process.env.MESH_URL || 'ws://localhost:3000/api/ws';
const BOT_TOKEN = process.env.BOT_TOKEN;
const ROOM_NAME = process.env.ROOM_NAME || 'general';

if (!BOT_TOKEN) {
  console.error('Set BOT_TOKEN environment variable');
  console.error('Register a bot first: node -e "const{MeshClient}=require(\'../../sdk/index.js\');MeshClient.register({name:\'my-bot\',type:\'agent\',parentId:\'PARENT_ID\'}).then(console.log)"');
  process.exit(1);
}

// Command handlers — safe commands only, NO eval/exec
const commands = {
  ping: () => 'pong!',
  help: () => 'Available commands: ping, help, echo <text>, time',
  echo: (args) => args.join(' ') || '(empty)',
  time: () => new Date().toISOString(),
};

const client = new MeshClient({
  url: MESH_URL,
  token: BOT_TOKEN,
  security: {
    allowCommandsFrom: 'local',
    processFederated: true,
    federatedCanExecute: false,
  },
});
let botName = 'bot';
let roomId = null;

client.on('connected', async (participant) => {
  botName = participant.name;
  console.log(`✓ Connected as ${botName} (${participant.id})`);

  // Enable built-in command parsing
  client.enableCommands('!');

  // Register commands via SDK helper
  for (const [name, handler] of Object.entries(commands)) {
    client.onCommand(name, handler);
  }

  // Join target room
  roomId = await client.joinRoomByName(ROOM_NAME);
  if (roomId) {
    console.log(`✓ Joined ${ROOM_NAME} (${roomId})`);
  } else {
    console.error(`✗ Could not find room "${ROOM_NAME}"`);
  }
});

client.on('message', (msg) => {
  // Skip own messages
  if (msg.senderName === botName) return;
  console.log(`[${msg.senderName}] ${msg.content}`);

  // Also handle @mention style: "@botname command args"
  const mentionPrefix = `@${botName} `;
  if (msg.content.startsWith(mentionPrefix)) {
    const rest = msg.content.slice(mentionPrefix.length).trim();
    const [cmd, ...args] = rest.split(/\s+/);
    const handler = commands[cmd];
    if (handler) {
      const result = handler(args, msg, client);
      if (result && typeof result.then === 'function') {
        result.then((r) => r && client.send(msg.roomId, String(r)));
      } else if (result) {
        client.send(msg.roomId, String(result));
      }
    } else {
      client.send(msg.roomId, `Unknown command: ${cmd}. Try @${botName} help`);
    }
  }
});

client.on('dm', (msg) => {
  console.log(`[DM from ${msg.senderName}] ${msg.content}`);
  client.sendDm(msg.senderId, `Echo: ${msg.content}`);
});

client.on('error', (err) => console.error('Error:', err.message));
client.on('disconnected', () => console.log('Disconnected, reconnecting...'));

client.connect();
console.log(`Connecting to ${MESH_URL}...`);
