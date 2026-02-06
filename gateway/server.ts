import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'http';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

// --- Types ---

interface GatewayMessage {
  type: string;
  [key: string]: unknown;
}

interface RegisteredMesh {
  meshId: string;
  secretHash: string;
  name: string;
}

interface RemoteParticipant {
  id: string;
  name: string;
  type: string;
}

interface ConnectedMesh {
  ws: WebSocket;
  meshId: string;
  name: string;
  publicRooms: string[];
  participants: RemoteParticipant[];
}

// --- Registry (JSON file) ---

const REGISTRY_PATH = path.join(__dirname, 'registry.json');

function loadRegistry(): RegisteredMesh[] {
  try {
    if (fs.existsSync(REGISTRY_PATH)) {
      return JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf-8'));
    }
  } catch {}
  return [];
}

function saveRegistry(registry: RegisteredMesh[]) {
  fs.writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2));
}

function hashSecret(secret: string): string {
  return crypto.createHash('sha256').update(secret).digest('hex');
}

export function registerMesh(meshId: string, secret: string, name: string): boolean {
  const registry = loadRegistry();
  const existing = registry.find(m => m.meshId === meshId);
  if (existing) {
    existing.secretHash = hashSecret(secret);
    existing.name = name;
  } else {
    registry.push({ meshId, secretHash: hashSecret(secret), name });
  }
  saveRegistry(registry);
  return true;
}

function verifyMesh(meshId: string, secret: string): RegisteredMesh | null {
  const registry = loadRegistry();
  const entry = registry.find(m => m.meshId === meshId);
  if (!entry) return null;
  if (entry.secretHash !== hashSecret(secret)) return null;
  return entry;
}

// --- Security: payload limits and rate limiting ---

const MAX_PAYLOAD_BYTES = 10 * 1024; // 10KB
const RATE_LIMIT_PER_MINUTE = 60;

const RELAY_PAYLOAD_WHITELIST = new Set([
  'type', 'message',
]);
const MESSAGE_FIELD_WHITELIST = new Set([
  'id', 'roomId', 'senderId', 'senderName', 'content',
  'isDm', 'createdAt', 'fromMesh', 'fromMeshId', 'roomName', 'trustLevel',
]);

// Rate limit tracking per mesh
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkMeshRateLimit(meshId: string): boolean {
  const now = Date.now();
  let entry = rateLimitMap.get(meshId);
  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + 60_000 };
    rateLimitMap.set(meshId, entry);
  }
  entry.count++;
  return entry.count <= RATE_LIMIT_PER_MINUTE;
}

function sanitizeRelayPayload(payload: Record<string, unknown>): Record<string, unknown> {
  const clean: Record<string, unknown> = {};
  for (const key of RELAY_PAYLOAD_WHITELIST) {
    if (key in payload) clean[key] = payload[key];
  }
  // Deep-sanitize message field
  if (clean.message && typeof clean.message === 'object') {
    const msg = clean.message as Record<string, unknown>;
    const cleanMsg: Record<string, unknown> = {};
    for (const key of MESSAGE_FIELD_WHITELIST) {
      if (key in msg) cleanMsg[key] = msg[key];
    }
    cleanMsg.trustLevel = 'federated';
    clean.message = cleanMsg;
  }
  return clean;
}

// --- Connected meshes ---

const connectedMeshes = new Map<string, ConnectedMesh>();

function send(ws: WebSocket, msg: GatewayMessage) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

// --- WebSocket Server ---

const server = createServer((req, res) => {
  // Simple HTTP endpoint for registration
  if (req.method === 'POST' && req.url === '/register') {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      try {
        const { meshId, secret, name } = JSON.parse(body);
        if (!meshId || !secret || !name) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'meshId, secret, and name required' }));
          return;
        }
        registerMesh(meshId, secret, name);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
      }
    });
    return;
  }

  // Health check
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, connected: connectedMeshes.size }));
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

const wss = new WebSocketServer({ server, path: '/gateway' });

wss.on('connection', (ws: WebSocket) => {
  let authedMeshId: string | null = null;

  // Must auth within 10s
  const authTimeout = setTimeout(() => {
    if (!authedMeshId) {
      send(ws, { type: 'gateway_auth_error', message: 'Auth timeout' });
      ws.close();
    }
  }, 10_000);

  ws.on('message', (data) => {
    // Enforce max payload size
    const raw = data.toString();
    if (raw.length > MAX_PAYLOAD_BYTES) {
      send(ws, { type: 'error', message: `Payload too large (max ${MAX_PAYLOAD_BYTES} bytes)` });
      return;
    }

    let msg: GatewayMessage;
    try { msg = JSON.parse(raw); } catch { return; }

    if (msg.type === 'gateway_auth') {
      const meshId = msg.meshId as string;
      const secret = msg.secret as string;
      const entry = verifyMesh(meshId, secret);
      if (!entry) {
        send(ws, { type: 'gateway_auth_error', message: 'Invalid credentials' });
        ws.close();
        return;
      }
      clearTimeout(authTimeout);
      authedMeshId = meshId;

      // Close any existing connection for this meshId
      const existing = connectedMeshes.get(meshId);
      if (existing) {
        existing.ws.close();
      }

      const participants = (msg.participants as RemoteParticipant[]) || [];

      connectedMeshes.set(meshId, {
        ws,
        meshId,
        name: entry.name,
        publicRooms: (msg.publicRooms as string[]) || [],
        participants,
      });

      console.log(`[Gateway] Mesh authenticated: ${entry.name} (${meshId})`);
      send(ws, { type: 'gateway_auth_ok', meshId, name: entry.name });

      // Send existing remote participants to the newly connected mesh
      const remoteParticipants: { meshId: string; meshName: string; participants: RemoteParticipant[] }[] = [];
      for (const [id, mesh] of connectedMeshes) {
        if (id !== meshId && mesh.participants.length > 0) {
          remoteParticipants.push({ meshId: id, meshName: mesh.name, participants: mesh.participants });
        }
      }
      if (remoteParticipants.length > 0) {
        send(ws, { type: 'gateway_participants', remoteParticipants });
      }

      // Broadcast this mesh's participants to all other meshes
      if (participants.length > 0) {
        for (const [id, mesh] of connectedMeshes) {
          if (id !== meshId) {
            send(mesh.ws, { type: 'gateway_participants', remoteParticipants: [{ meshId, meshName: entry.name, participants }] });
          }
        }
      }
      return;
    }

    if (!authedMeshId) {
      send(ws, { type: 'gateway_auth_error', message: 'Not authenticated' });
      return;
    }

    if (msg.type === 'gateway_discover') {
      const instances = Array.from(connectedMeshes.values()).map(m => ({
        meshId: m.meshId,
        name: m.name,
        publicRooms: m.publicRooms,
      }));
      send(ws, { type: 'gateway_discover_result', instances });
    } else if (msg.type === 'gateway_relay') {
      if (!checkMeshRateLimit(authedMeshId)) {
        send(ws, { type: 'error', message: 'Rate limited (max 60 messages/minute)' });
        return;
      }
      const targetMeshId = msg.targetMeshId as string;
      const payload = sanitizeRelayPayload(msg.payload as Record<string, unknown>);
      const target = connectedMeshes.get(targetMeshId);
      if (target) {
        send(target.ws, {
          type: 'gateway_incoming',
          fromMeshId: authedMeshId,
          fromMeshName: connectedMeshes.get(authedMeshId)?.name || authedMeshId,
          payload,
        });
      }
    } else if (msg.type === 'gateway_broadcast') {
      if (!checkMeshRateLimit(authedMeshId)) {
        send(ws, { type: 'error', message: 'Rate limited (max 60 messages/minute)' });
        return;
      }
      const payload = sanitizeRelayPayload(msg.payload as Record<string, unknown>);
      console.log(`[Gateway] Broadcast from ${authedMeshId}, targets: ${[...connectedMeshes.keys()].filter(id => id !== authedMeshId).join(', ') || 'none'}`);
      for (const [id, mesh] of connectedMeshes) {
        if (id !== authedMeshId) {
          console.log(`[Gateway] Relaying to ${id}`);
          send(mesh.ws, {
            type: 'gateway_incoming',
            fromMeshId: authedMeshId,
            fromMeshName: connectedMeshes.get(authedMeshId)?.name || authedMeshId,
            payload,
          });
        }
      }
    } else if (msg.type === 'gateway_update_participants') {
      const mesh = connectedMeshes.get(authedMeshId);
      if (mesh) {
        mesh.participants = (msg.participants as RemoteParticipant[]) || [];
        // Broadcast to other meshes
        for (const [id, other] of connectedMeshes) {
          if (id !== authedMeshId) {
            send(other.ws, { type: 'gateway_participants', remoteParticipants: [{ meshId: authedMeshId, meshName: mesh.name, participants: mesh.participants }] });
          }
        }
      }
    } else if (msg.type === 'gateway_update_rooms') {
      const mesh = connectedMeshes.get(authedMeshId);
      if (mesh) {
        mesh.publicRooms = (msg.publicRooms as string[]) || [];
      }
    }
  });

  ws.on('close', () => {
    if (authedMeshId) {
      console.log(`[Gateway] Mesh disconnected: ${authedMeshId}`);
      connectedMeshes.delete(authedMeshId);
    }
    clearTimeout(authTimeout);
  });
});

const port = parseInt(process.env.PORT || '4000');
server.listen(port, () => {
  console.log(`🌐 Mesh Gateway running on port ${port}`);
});
