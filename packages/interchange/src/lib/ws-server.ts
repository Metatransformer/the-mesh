import { WebSocketServer, WebSocket } from 'ws';
import type { IncomingMessage } from 'http';
import type { Socket } from 'net';
import { getParticipantByToken, getParticipantById } from './auth';
import { joinRoom, isRoomMember, saveMessage, getRoomMembers, getRoom, setFederated } from './rooms';
import { getAllRoomMembers } from './db';
import { checkRateLimit } from './rate-limit';
import { relayRoomMessage, isGatewayConnected } from './federation';
import { notifyMentionedParticipants } from './webhooks';
import type { Participant, WsMessage } from './types';

interface AuthedSocket extends WebSocket {
  participant?: Participant;
  rooms: Set<string>;
  isAlive: boolean;
}

// Use globalThis so the custom server and Next.js API routes share the same state
const g = globalThis as unknown as {
  __meshWss?: WebSocketServer;
  __meshConnections?: Map<string, AuthedSocket>;
};

function getConnections(): Map<string, AuthedSocket> {
  if (!g.__meshConnections) g.__meshConnections = new Map();
  return g.__meshConnections;
}

function getStoredWss(): WebSocketServer | null {
  return g.__meshWss || null;
}
function setStoredWss(w: WebSocketServer) {
  g.__meshWss = w;
}

export function getWss(): WebSocketServer {
  let wss = getStoredWss();
  if (!wss) {
    wss = new WebSocketServer({ noServer: true });
    setStoredWss(wss);
    wss.on('connection', handleConnection);

    // Heartbeat
    setInterval(() => {
      wss!.clients.forEach((ws) => {
        const s = ws as AuthedSocket;
        if (!s.isAlive) return s.terminate();
        s.isAlive = false;
        s.ping();
      });
    }, 30_000);
  }
  return wss;
}

export function handleUpgrade(req: IncomingMessage, socket: Socket, head: Buffer) {
  const server = getWss();
  server.handleUpgrade(req, socket, head, (ws) => {
    server.emit('connection', ws, req);
  });
}

function send(ws: WebSocket, msg: WsMessage) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

export function broadcast(roomId: string, msg: WsMessage, excludeId?: string) {
  const members = getRoomMembers(roomId);
  for (const memberId of members) {
    if (memberId === excludeId) continue;
    const conn = getConnections().get(memberId);
    if (conn && conn.rooms.has(roomId)) {
      send(conn, msg);
    }
  }
}

// Internal broadcast via HTTP — used by API routes since they can't access WS connections directly
export function setupInternalBroadcast(server: import('http').Server) {
  // Nothing needed — we use globalThis now
}

export function broadcastAll(msg: WsMessage) {
  for (const [, conn] of getConnections()) {
    send(conn, msg);
  }
}

export function getOnlineParticipants(): string[] {
  return Array.from(getConnections().keys());
}

function broadcastRoomMembers() {
  const members = getAllRoomMembers();
  const msg: WsMessage = { type: 'room_members', members };
  for (const [, conn] of getConnections()) {
    send(conn, msg);
  }
}

function handleConnection(ws: WebSocket) {
  const socket = ws as AuthedSocket;
  socket.rooms = new Set();
  socket.isAlive = true;

  socket.on('pong', () => { socket.isAlive = true; });

  // Must auth within 10s
  const authTimeout = setTimeout(() => {
    if (!socket.participant) {
      send(socket, { type: 'auth_error', message: 'Auth timeout' });
      socket.close();
    }
  }, 10_000);

  socket.on('message', (data) => {
    let msg: WsMessage;
    try { msg = JSON.parse(data.toString()); } catch { return; }

    // Auth
    if (msg.type === 'auth') {
      const p = getParticipantByToken(msg.token as string);
      if (!p) {
        send(socket, { type: 'auth_error', message: 'Invalid token' });
        return socket.close();
      }
      clearTimeout(authTimeout);
      socket.participant = p;
      getConnections().set(p.id, socket);
      console.log(`[WS] Authenticated: ${p.name} (${p.id})`);
      send(socket, { type: 'auth_ok', participant: { id: p.id, name: p.name, type: p.type } });

      // Broadcast online status
      for (const [, conn] of getConnections()) {
        if (conn !== socket) {
          send(conn, { type: 'participant_online', participantId: p.id, name: p.name });
        }
      }
      broadcastRoomMembers();
      return;
    }

    if (!socket.participant) {
      send(socket, { type: 'error', message: 'Not authenticated' });
      return;
    }

    if (!checkRateLimit(socket.participant.id)) {
      send(socket, { type: 'error', message: 'Rate limited' });
      return;
    }

    const p = socket.participant;

    if (msg.type === 'join_room') {
      const roomId = msg.roomId as string;
      const password = msg.password as string | undefined;
      if (joinRoom(roomId, p.id, password)) {
        socket.rooms.add(roomId);
        send(socket, { type: 'room_joined', roomId });
        broadcast(roomId, { type: 'participant_online', participantId: p.id, name: p.name, roomId }, p.id);
        broadcastRoomMembers();
      } else {
        send(socket, { type: 'error', message: 'Cannot join room' });
      }
    } else if (msg.type === 'leave_room') {
      const roomId = msg.roomId as string;
      socket.rooms.delete(roomId);
      send(socket, { type: 'room_left', roomId });
      broadcastRoomMembers();
    } else if (msg.type === 'message') {
      const roomId = msg.roomId as string;
      const content = msg.content as string;
      if (!content || !roomId) return;
      if (!isRoomMember(roomId, p.id)) {
        send(socket, { type: 'error', message: 'Not a member of this room' });
        return;
      }
      // Re-read participant from DB to get current permission (may have changed since WS auth)
      const currentP = getParticipantById(p.id);
      if (currentP) {
        p.permission = currentP.permission;
        socket.participant = currentP;
      }
      // Check agent permissions
      if (p.type === 'agent' && p.permission === 'silent') {
        send(socket, { type: 'error', message: 'Agent is muted' });
        return;
      }
      if (p.type === 'agent' && p.permission === 'dm-only') {
        send(socket, { type: 'error', message: 'Agent can only send DMs' });
        return;
      }
      const saved = saveMessage(roomId, p.id, p.name, content, false);
      broadcast(roomId, { type: 'new_message', message: saved });
      // Relay to gateway if room is federated
      const roomData = getRoom(roomId);
      if (roomData?.federated) {
        relayRoomMessage(roomId, saved as unknown as Record<string, unknown>);
      }
      // Notify mentioned participants via webhooks
      notifyMentionedParticipants(saved, roomData?.name).catch(err => {
        console.error('[Webhooks] Error notifying mentions:', err);
      });
    } else if (msg.type === 'federate_room') {
      const roomId = msg.roomId as string;
      const federated = msg.federated as boolean;
      const room = getRoom(roomId);
      if (!room) {
        send(socket, { type: 'error', message: 'Room not found' });
        return;
      }
      if (room.adminId !== p.id) {
        send(socket, { type: 'error', message: 'Only room admin can federate/unfederate' });
        return;
      }
      setFederated(roomId, federated);
      broadcast(roomId, { type: 'federation_status', roomId, federated });
    } else if (msg.type === 'dm') {
      const recipientId = msg.recipientId as string;
      const content = msg.content as string;
      const roomId = msg.roomId as string || null;
      if (!content || !recipientId) return;
      // Re-read permission from DB
      const currentPDm = getParticipantById(p.id);
      if (currentPDm) {
        p.permission = currentPDm.permission;
        socket.participant = currentPDm;
      }
      if (p.type === 'agent' && p.permission === 'silent') {
        send(socket, { type: 'error', message: 'Agent is muted' });
        return;
      }
      const saved = saveMessage(roomId, p.id, p.name, content, true, recipientId);
      const recipient = getConnections().get(recipientId);
      if (recipient) send(recipient, { type: 'new_message', message: saved });
      send(socket, { type: 'new_message', message: saved });
    }
  });

  socket.on('close', () => {
    if (socket.participant) {
      getConnections().delete(socket.participant.id);
      for (const [, conn] of getConnections()) {
        send(conn, { type: 'participant_offline', participantId: socket.participant.id, name: socket.participant.name });
      }
      broadcastRoomMembers();
    }
  });
}
