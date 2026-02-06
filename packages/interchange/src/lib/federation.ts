import WebSocket from 'ws';
import { broadcast, broadcastAll } from './ws-server';
import { getRoom, enqueueMessage, getQueuedMessages, updateQueueStatus, resetFailedMessages, abandonStaleMessages } from './db';
import type { QueuedMessage } from './db';
import { findRoomByName, saveMessage } from './rooms';
import { listParticipants } from './auth';
import { notifyMentionedParticipants } from './webhooks';
import { sanitizeFederatedContent, sanitizeFederatedMessage } from './sanitize';

const DEFAULT_GATEWAY_URL = 'ws://localhost:4000/gateway';

export interface MeshInstance {
  meshId: string;
  name: string;
  publicRooms: string[];
}

export interface RemoteParticipant {
  id: string;
  name: string;
  type: string;
  meshId: string;
  meshName: string;
}

interface FederationState {
  gatewayWs: WebSocket | null;
  meshId: string | null;
  meshSecret: string | null;
  gatewayUrl: string | null;
  meshName: string | null;
  authenticated: boolean;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  queueProcessorInterval: ReturnType<typeof setInterval> | null;
  lastDiscoverResult: MeshInstance[];
  remoteParticipants: RemoteParticipant[];
}

// All state on globalThis so API routes + custom server share it
const g = globalThis as unknown as { __meshFed?: FederationState };

function S(): FederationState {
  if (!g.__meshFed) {
    g.__meshFed = {
      gatewayWs: null, meshId: null, meshSecret: null,
      gatewayUrl: null, meshName: null, authenticated: false,
      reconnectTimer: null, queueProcessorInterval: null, lastDiscoverResult: [], remoteParticipants: [],
    };
  }
  return g.__meshFed;
}

export function isGatewayConnected(): boolean {
  const s = S();
  return s.authenticated && s.gatewayWs?.readyState === WebSocket.OPEN;
}

export function getMeshId(): string | null { return S().meshId; }
export function getGatewayUrl(): string | null { return S().gatewayUrl; }
export function getMeshName(): string | null { return S().meshName; }
export function getRemoteParticipants(): RemoteParticipant[] { return S().remoteParticipants; }

export function getGatewayHttpUrl(): string {
  const wsUrl = process.env.MESH_GATEWAY_URL || DEFAULT_GATEWAY_URL;
  return wsUrl
    .replace(/^wss:/, 'https:')
    .replace(/^ws:/, 'http:')
    .replace(/\/gateway\/?$/, '');
}

export function getFederationConfig() {
  return {
    meshId: process.env.MESH_ID || null,
    gatewayUrl: process.env.MESH_GATEWAY_URL || DEFAULT_GATEWAY_URL,
    configured: !!(process.env.MESH_ID && process.env.MESH_SECRET),
    connected: isGatewayConnected(),
    meshName: S().meshName,
  };
}

function sendToGateway(msg: Record<string, unknown>) {
  const s = S();
  if (s.gatewayWs?.readyState === WebSocket.OPEN) {
    s.gatewayWs.send(JSON.stringify(msg));
  }
}

function scheduleReconnect() {
  const s = S();
  if (s.reconnectTimer) clearTimeout(s.reconnectTimer);
  s.reconnectTimer = setTimeout(() => {
    if (!s.authenticated && s.meshId && s.meshSecret) {
      console.log('[Federation] Attempting reconnect...');
      connectToGateway();
    }
  }, 5000);
}

export function connectToGateway() {
  const s = S();
  s.meshId = process.env.MESH_ID || null;
  s.meshSecret = process.env.MESH_SECRET || null;
  s.gatewayUrl = process.env.MESH_GATEWAY_URL || DEFAULT_GATEWAY_URL;

  if (!s.meshId || !s.meshSecret) {
    console.log('[Federation] MESH_ID or MESH_SECRET not set, skipping');
    return;
  }

  console.log(`[Federation] Connecting to gateway at ${s.gatewayUrl}...`);
  startQueueProcessor();

  try {
    s.gatewayWs = new WebSocket(s.gatewayUrl);
  } catch (err) {
    console.error('[Federation] Failed to create WebSocket:', err);
    scheduleReconnect();
    return;
  }

  s.gatewayWs.on('open', () => {
    console.log('[Federation] Connected, authenticating...');
    const localParticipants = listParticipants().map(p => ({ id: p.id, name: p.name, type: p.type }));
    sendToGateway({ type: 'gateway_auth', meshId: s.meshId, secret: s.meshSecret, participants: localParticipants });
  });

  s.gatewayWs.on('message', (data) => {
    let msg: Record<string, unknown>;
    try { msg = JSON.parse(data.toString()); } catch { return; }

    if (msg.type === 'gateway_auth_ok') {
      s.authenticated = true;
      s.meshName = (msg.name as string) || s.meshId;
      console.log(`[Federation] Authenticated as ${msg.name} (${msg.meshId})`);
      const resetCount = resetFailedMessages();
      if (resetCount > 0) console.log(`[Federation Queue] Reset ${resetCount} failed messages on reconnect`);
    } else if (msg.type === 'gateway_auth_error') {
      console.error(`[Federation] Auth failed: ${msg.message}`);
      s.authenticated = false;
    } else if (msg.type === 'gateway_discover_result') {
      s.lastDiscoverResult = msg.instances as MeshInstance[];
    } else if (msg.type === 'gateway_participants') {
      handleRemoteParticipants(msg);
    } else if (msg.type === 'gateway_incoming') {
      handleIncomingRelay(msg);
    }
  });

  s.gatewayWs.on('close', () => {
    console.log('[Federation] Disconnected from gateway');
    s.authenticated = false;
    s.gatewayWs = null;
    scheduleReconnect();
  });

  s.gatewayWs.on('error', (err) => {
    console.error('[Federation] WebSocket error:', err.message);
  });
}

function processQueue() {
  const pending = getQueuedMessages('pending');
  const failed = getQueuedMessages('failed');

  if (pending.length > 0 || failed.length > 0) {
    console.log(`[Federation Queue] Processing: ${pending.length} pending, ${failed.length} failed`);
  }

  // Abandon messages with too many retries
  const abandonCount = abandonStaleMessages();
  if (abandonCount > 0) console.log(`[Federation Queue] Abandoned ${abandonCount} messages after 5 attempts`);

  if (!isGatewayConnected()) return;

  const toProcess: QueuedMessage[] = [...pending, ...failed.filter(m => m.retryCount < 5)];

  for (const msg of toProcess) {
    // Exponential backoff check
    if (msg.lastAttempt) {
      const backoffMs = Math.pow(2, msg.retryCount) * 1000;
      if (Date.now() - new Date(msg.lastAttempt).getTime() < backoffMs) continue;
    }

    const payload = JSON.parse(msg.messagePayload);
    updateQueueStatus(msg.id, 'sending');
    try {
      if (msg.targetMesh === '*') {
        sendToGateway({ type: 'gateway_broadcast', payload });
      } else {
        sendToGateway({ type: 'gateway_relay', targetMeshId: msg.targetMesh, payload });
      }
      updateQueueStatus(msg.id, 'sent');
      console.log(`[Federation Queue] Sent message ${msg.id} to ${msg.targetMesh}`);
    } catch (err: any) {
      const newRetry = msg.retryCount + 1;
      updateQueueStatus(msg.id, 'failed', newRetry);
      console.log(`[Federation Queue] Failed message ${msg.id} (attempt ${newRetry}/5): ${err?.message}`);
    }
  }
}

function startQueueProcessor() {
  const s = S();
  if (s.queueProcessorInterval) return; // already running
  s.queueProcessorInterval = setInterval(processQueue, 30000);
  console.log('[Federation Queue] Queue processor started (30s interval)');
}

export function relayToMesh(targetMeshId: string, payload: unknown) {
  const queued = enqueueMessage(targetMeshId, payload);
  if (isGatewayConnected()) {
    updateQueueStatus(queued.id, 'sending');
    try {
      sendToGateway({ type: 'gateway_relay', targetMeshId, payload });
      updateQueueStatus(queued.id, 'sent');
      console.log(`[Federation Queue] Sent message ${queued.id} to ${targetMeshId}`);
    } catch (err: any) {
      updateQueueStatus(queued.id, 'failed', 1);
      console.log(`[Federation Queue] Failed message ${queued.id} (attempt 1/5): ${err?.message}`);
    }
  }
}

export function broadcastToGateway(payload: unknown) {
  const queued = enqueueMessage('*', payload);
  if (isGatewayConnected()) {
    updateQueueStatus(queued.id, 'sending');
    try {
      sendToGateway({ type: 'gateway_broadcast', payload });
      updateQueueStatus(queued.id, 'sent');
      console.log(`[Federation Queue] Sent message ${queued.id} to *`);
    } catch (err: any) {
      updateQueueStatus(queued.id, 'failed', 1);
      console.log(`[Federation Queue] Failed message ${queued.id} (attempt 1/5): ${err?.message}`);
    }
  }
}

export async function getOnlineMeshes(): Promise<MeshInstance[]> {
  const s = S();
  return new Promise((resolve) => {
    if (!s.authenticated || !s.gatewayWs) { resolve([]); return; }
    sendToGateway({ type: 'gateway_discover' });
    const timeout = setTimeout(() => resolve(s.lastDiscoverResult), 2000);
    const handler = (data: WebSocket.Data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'gateway_discover_result') {
          clearTimeout(timeout);
          s.gatewayWs?.off('message', handler);
          s.lastDiscoverResult = msg.instances;
          resolve(msg.instances);
        }
      } catch {}
    };
    s.gatewayWs.on('message', handler);
  });
}

function handleRemoteParticipants(msg: Record<string, unknown>) {
  const s = S();
  const remoteGroups = msg.remoteParticipants as { meshId: string; meshName: string; participants: { id: string; name: string; type: string }[] }[];
  if (!remoteGroups) return;

  // Replace participants for each mesh that sent an update
  for (const group of remoteGroups) {
    // Remove old entries for this mesh
    s.remoteParticipants = s.remoteParticipants.filter(p => p.meshId !== group.meshId);
    // Add new entries
    for (const p of group.participants) {
      s.remoteParticipants.push({ ...p, meshId: group.meshId, meshName: group.meshName });
    }
  }

  // Broadcast to all local WS clients so UI updates
  broadcastAll({ type: 'remote_participants' as any, participants: s.remoteParticipants } as any);
}

export function pushParticipantUpdate() {
  const s = S();
  if (!s.authenticated) return;
  const localParticipants = listParticipants().map(p => ({ id: p.id, name: p.name, type: p.type }));
  sendToGateway({ type: 'gateway_update_participants', participants: localParticipants });
}

function handleIncomingRelay(msg: Record<string, unknown>) {
  const fromMeshId = msg.fromMeshId as string;
  const fromMeshName = msg.fromMeshName as string;
  const payload = msg.payload as Record<string, unknown>;
  console.log(`[Federation] Incoming relay from ${fromMeshName} (${fromMeshId}), payload type: ${payload?.type}`);
  if (!payload || !payload.type) return;

  if (payload.type === 'new_message' && payload.message) {
    // Sanitize the incoming message — strip unknown fields, flag injection attempts
    const rawMessage = payload.message as Record<string, unknown>;
    const message = sanitizeFederatedMessage(rawMessage);

    const remoteRoomId = message.roomId as string;
    const roomName = message.roomName as string;
    const senderId = message.senderId as string;
    const senderName = message.senderName as string;
    const content = message.content as string;

    // Match by room name (federation key), not by remote room ID
    const localRoom = roomName ? findRoomByName(roomName) : getRoom(remoteRoomId);
    if (localRoom && localRoom.federated) {
      // Save the federated message to local DB with 'federated' trust level
      const saved = saveMessage(
        localRoom.id,
        `federated:${fromMeshId}:${senderId}`,  // Unique sender ID for federated messages
        senderName,
        content,
        false,  // not a DM
        undefined,
        'federated'  // trust level
      );

      // Add federation metadata and broadcast
      const federatedMessage = { ...saved, fromMesh: fromMeshName, fromMeshId, trustLevel: 'federated' as const };
      console.log(`[Federation] Saved and broadcasting message from ${senderName} (${fromMeshName})`);
      broadcast(localRoom.id, {
        type: 'new_message' as const,
        message: federatedMessage,
      });

      // Notify local participants who are @mentioned by federated messages
      notifyMentionedParticipants(saved, localRoom.name).catch(err => {
        console.error('[Webhooks] Error notifying mentions from federated message:', err);
      });
    }
  }
}

export function relayRoomMessage(roomId: string, message: Record<string, unknown>) {
  if (!S().authenticated) {
    console.log(`[Federation] Not relaying — not authenticated`);
    return;
  }
  const room = getRoom(roomId);
  const roomName = room?.name || '';
  console.log(`[Federation] Relaying message to gateway — room: ${roomName} (${roomId}), authenticated: ${S().authenticated}`);
  broadcastToGateway({ type: 'new_message', message: { ...message, roomId, roomName } });
}
