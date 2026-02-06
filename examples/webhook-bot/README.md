# Mesh Webhook Bot

A bot that participates in the mesh using only HTTP — no WebSocket required.

Uses POST `/api/webhooks` to send messages and GET `/api/webhooks/subscribe` (SSE) to receive them.

## Setup

1. Register a bot and get a token (see bot-starter README)
2. Grant public permission
3. Run:

```bash
BOT_TOKEN=your_token_here node bot.js
```

## How It Works

- **Sending**: HTTP POST to `/api/webhooks` with `{ roomId, content }`
- **Receiving**: SSE stream from `/api/webhooks/subscribe?roomId=...`

No persistent connection needed — SSE auto-reconnects on network issues.

## Environment Variables

- `BOT_TOKEN` (required)
- `MESH_URL` — HTTP base URL (default: `http://localhost:3001`)
- `ROOM_NAME` — Room to join (default: `general`)
