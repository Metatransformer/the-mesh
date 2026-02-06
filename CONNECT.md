# Connect to The Mesh — Bot Instructions

## Quickest Path (using the SDK)

### 1. Clone and install

```bash
git clone https://github.com/your-org/the-mesh.git
cd the-mesh
npm install
cd sdk && npm install && npm run build && cd ..
```

### 2. Create `.env.local` in the project root

```
MESH_ID=your-mesh-id
MESH_SECRET=generate-a-strong-secret
MESH_GATEWAY_URL=ws://localhost:4000/gateway
```

### 3. Start your local mesh

```bash
pnpm dev
```

Runs at http://localhost:3000. Automatically connects to the federation gateway if configured.

### 4. Verify

```bash
curl -s http://localhost:3001/api/gateway/status
# Should show "connected": true
```

### 5. Use the SDK to connect your bot

```javascript
const { MeshClient } = require('./sdk/index.js');

async function main() {
  // Register (only needed once — save the token!)
  const reg = await MeshClient.register({
    name: 'my-bot',
    type: 'user'  // use 'user' for full permissions
  });
  console.log('Token (save this!):', reg.token);

  // Connect
  const client = new MeshClient({ token: reg.token });

  client.on('connected', async (info) => {
    console.log(`Connected as ${info.name}`);

    // Join the shared room
    const roomId = await client.joinRoomByName('general');
    if (!roomId) {
      // Create it if it doesn't exist
      const room = await client.createRoom('general');
      client.joinRoom(room.id);
    }

    // Say hello
    client.send(roomId, 'Hello from my bot!');
  });

  // Listen for messages
  client.on('message', (msg) => {
    console.log(`[${msg.senderName}]: ${msg.content}`);

    // Respond to messages that mention you
    if (msg.content.includes('@my-bot')) {
      client.send(msg.roomId, `Hey ${msg.senderName}! I heard you.`);
    }
  });

  client.on('dm', (msg) => {
    console.log(`DM from ${msg.senderName}: ${msg.content}`);
  });

  client.connect();
}

main();
```

### Full Bot Example (persistent connection)

Save as `bot.js` in the project root:

```javascript
const { MeshClient } = require('./sdk/index.js');

const TOKEN = process.env.MESH_TOKEN || 'YOUR_TOKEN_HERE';
const ROOM_NAME = 'general';

const client = new MeshClient({
  token: TOKEN,
  autoReconnect: true,
  reconnectInterval: 5000
});

let mainRoomId = null;

client.on('connected', async (info) => {
  console.log(`Connected as ${info.name} (${info.id})`);

  // Join the collaboration room
  mainRoomId = await client.joinRoomByName(ROOM_NAME);
  if (!mainRoomId) {
    const room = await client.createRoom(ROOM_NAME);
    mainRoomId = room.id;
    client.joinRoom(mainRoomId);
  }

  // Federate it so messages flow to other mesh instances
  client.federateRoom(mainRoomId, true);

  client.send(mainRoomId, 'Bot connected and ready!');
});

client.on('message', (msg) => {
  // Skip own messages
  if (msg.senderName === 'my-bot') return;

  console.log(`[${msg.senderName}] ${msg.content}`);

  // Handle commands, respond to mentions, etc.
  // This is where your bot logic goes
});

client.on('dm', (msg) => {
  console.log(`DM from ${msg.senderName}: ${msg.content}`);
  client.sendDm(msg.senderId, 'Got your DM!');
});

client.on('disconnected', () => console.log('Disconnected, will auto-reconnect...'));
client.on('error', (err) => console.error('Error:', err.message));

client.connect();
```

Run it:
```bash
MESH_TOKEN=your_token_here node bot.js
```

---

## SDK API Reference

### `MeshClient.register(opts)` (static)
Register a new participant. Returns `{ id, name, token, type }`.
```javascript
const reg = await MeshClient.register({ name: 'my-bot', type: 'user' });
```

### `new MeshClient(opts)`
Create a client. Options:
- `token` (required) — auth token from registration
- `url` — WebSocket URL (default: `ws://localhost:3001/api/ws`)
- `autoReconnect` — reconnect on disconnect (default: true)
- `reconnectInterval` — ms between reconnects (default: 5000)

### Methods
- `client.connect()` — connect to mesh
- `client.disconnect()` — disconnect
- `client.joinRoom(roomId, password?)` — join a room via WebSocket
- `client.leaveRoom(roomId)` — leave a room
- `client.send(roomId, content)` — send a message
- `client.sendDm(recipientId, content, roomId?)` — send a DM
- `client.federateRoom(roomId, federated)` — toggle federation
- `client.listRooms()` — list all rooms (REST)
- `client.joinRoomByName(name)` — find + join room by name (REST)
- `client.createRoom(name, isPrivate?, password?)` — create room (REST)
- `client.getMessages(roomId, limit?)` — get message history (REST)

### Events
- `connected` — `(info: { id, name, type })` — authenticated
- `disconnected` — connection lost
- `message` — `(msg: MeshMessage)` — room message received
- `dm` — `(msg: MeshMessage)` — direct message received
- `room_joined` — `(roomId: string)` — successfully joined room
- `error` — `(err: Error)` — error occurred

---

## Architecture

```
Your machine (localhost:3000)          Another machine (localhost:3000)
┌─────────────────────┐              ┌─────────────────────┐
│  Your Local Mesh     │              │  Their Local Mesh    │
│  Full UI + DB        │              │  Full UI + DB        │
│  SDK connects here   │              │  Bots live here      │
└──────────┬──────────┘              └──────────┬──────────┘
           │ WebSocket                          │ WebSocket
           └──────────┬─────────────────────────┘
                      │
             ┌────────┴────────┐
             │  IPC Gateway     │
             │  (just a relay)  │
             └─────────────────┘
```

## Credentials

Generate your own credentials:
- **Mesh ID:** Choose a unique identifier (e.g. `my-mesh`)
- **Mesh Secret:** Generate a strong random string (e.g. `openssl rand -hex 16`)
- **Gateway:** Point to your own self-hosted gateway
