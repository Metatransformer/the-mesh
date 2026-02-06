# Mesh Gateway

A lightweight WebSocket relay server for federating Mesh instances. No UI, no database — just message routing between connected mesh nodes.

## Self-Hosting

Run your own gateway in one command:

```bash
cd gateway/
npm install
npm start
```

That's it. Your gateway is running on port 4000.

### Configuration

| Env Var | Default | Description |
|---------|---------|-------------|
| `PORT`  | `4000`  | Port to listen on |

### Registering Mesh Instances

Before a mesh instance can connect, it needs to be registered. Use the HTTP endpoint:

```bash
curl -X POST http://your-gateway:4000/register \
  -H 'Content-Type: application/json' \
  -d '{"meshId": "my-mesh", "secret": "a-strong-secret", "name": "My Mesh"}'
```

Or use the local mesh UI/API (`POST /api/gateway/register`) which does this automatically.

### Health Check

```bash
curl http://your-gateway:4000/health
# {"ok":true,"connected":2}
```

## Connecting a Mesh Instance

Set these environment variables on your local mesh:

```bash
# Required
MESH_ID=my-unique-mesh-id
MESH_SECRET=my-secret

# Gateway URL (point to your own)
MESH_GATEWAY_URL=wss://your-gateway.example.com/gateway
```

Then start your mesh normally (`pnpm dev`). It will auto-connect to the gateway on startup.

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Mesh Node  │     │   Gateway   │     │  Mesh Node  │
│ (localhost)  │◄───►│  (relay)    │◄───►│ (localhost)  │
│  Next.js UI  │     │  WS only    │     │  Next.js UI  │
│  Rooms, DB   │     │  No state   │     │  Rooms, DB   │
└─────────────┘     └─────────────┘     └─────────────┘
```

- **Mesh Nodes** run the full app locally (UI, rooms, messages, DB)
- **Gateway** is just a WebSocket relay — routes messages between nodes
- Federated rooms broadcast messages through the gateway to all connected nodes
- Each node is fully independent and works offline

## Protocol

All messages are JSON over WebSocket at `/gateway`.

### Authentication
```json
→ {"type": "gateway_auth", "meshId": "...", "secret": "..."}
← {"type": "gateway_auth_ok", "meshId": "...", "name": "..."}
← {"type": "gateway_auth_error", "message": "..."}
```

### Discovery
```json
→ {"type": "gateway_discover"}
← {"type": "gateway_discover_result", "instances": [{"meshId": "...", "name": "...", "publicRooms": [...]}]}
```

### Relay (to specific mesh)
```json
→ {"type": "gateway_relay", "targetMeshId": "...", "payload": {...}}
```

### Broadcast (to all connected meshes)
```json
→ {"type": "gateway_broadcast", "payload": {...}}
```

### Incoming (delivered to recipient)
```json
← {"type": "gateway_incoming", "fromMeshId": "...", "fromMeshName": "...", "payload": {...}}
```

## Deployment

The gateway is a single Node.js process. Deploy it anywhere:

- **VPS**: `PORT=4000 npm start` behind nginx/caddy with TLS
- **Docker**: `FROM node:20-slim` + copy + `npm start`
- **Fly.io / Railway / Render**: Point to `gateway/` directory, start command `npm start`

For WebSocket support behind a reverse proxy, ensure your proxy passes `Upgrade` headers (nginx: `proxy_pass` with `proxy_http_version 1.1` and `Upgrade` headers).
