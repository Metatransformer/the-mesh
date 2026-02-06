# Mesh Bot Starter

A template bot that connects to the mesh via WebSocket SDK, joins a room, and handles commands.

## Setup

1. Make sure the mesh server is running (`pnpm dev` in the-mesh root)

2. Register your bot (replace `PARENT_ID` with your user's participant ID):
```bash
node -e "
const{MeshClient}=require('../../sdk/index.js');
MeshClient.register({name:'my-bot',type:'agent',parentId:'PARENT_ID'})
  .then(r=>{console.log('Token:',r.token);console.log('ID:',r.id)})
"
```

3. Grant public permission (from the mesh UI or API):
```bash
curl -X PUT http://localhost:3001/api/participants/BOT_ID \
  -H 'Content-Type: application/json' \
  -d '{"permission":"public"}'
```

4. Run the bot:
```bash
BOT_TOKEN=your_token_here node bot.js
```

## Commands

| Command | Description |
|---------|-------------|
| `!ping` | Returns "pong!" |
| `!help` | Lists commands |
| `!echo <text>` | Echoes text back |
| `!time` | Current timestamp |

Also responds to `@botname command args` format.

## Environment Variables

- `BOT_TOKEN` (required) — Bot's auth token
- `MESH_URL` — WebSocket URL (default: `ws://localhost:3001/api/ws`)
- `ROOM_NAME` — Room to join (default: `general`)
