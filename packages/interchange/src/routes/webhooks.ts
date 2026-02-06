import { Router } from 'express';
import { getAuthParticipant } from '../lib/api-helpers';
import { isRoomMember, saveMessage, getRoom } from '../lib/rooms';
import { getRoomMessages } from '../lib/db';
import { broadcast } from '../lib/ws-server';
import { relayRoomMessage } from '../lib/federation';

const router = Router();

// GET /api/webhooks/subscribe — SSE endpoint for bots to receive messages via HTTP
router.get('/subscribe', (req, res) => {
  const participant = getAuthParticipant(req);
  if (!participant) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const roomId = req.query.roomId as string;
  if (!roomId) {
    return res.status(400).json({ error: 'roomId query param required' });
  }

  if (!isRoomMember(roomId, participant.id)) {
    return res.status(403).json({ error: 'Not a member of this room' });
  }

  // Set SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });

  // Send initial keepalive
  res.write(': connected\n\n');

  let lastSeen = new Date().toISOString();
  let closed = false;

  // Poll for new messages every second
  const interval = setInterval(() => {
    if (closed) {
      clearInterval(interval);
      return;
    }

    try {
      const messages = getRoomMessages(roomId, 50, undefined, participant.id);
      const newMessages = messages.filter((m) => m.createdAt > lastSeen);

      for (const msg of newMessages) {
        const data = JSON.stringify({
          id: msg.id,
          roomId: msg.roomId,
          senderId: msg.senderId,
          senderName: msg.senderName,
          content: msg.content,
          isDm: msg.isDm,
          createdAt: msg.createdAt,
        });
        res.write(`data: ${data}\n\n`);
        lastSeen = msg.createdAt;
      }
    } catch {
      // DB read error, skip this tick
    }
  }, 1000);

  // Keepalive every 15s
  const keepalive = setInterval(() => {
    if (closed) {
      clearInterval(keepalive);
      return;
    }
    try {
      res.write(': keepalive\n\n');
    } catch {
      closed = true;
      clearInterval(keepalive);
      clearInterval(interval);
    }
  }, 15000);

  // Clean up on close
  req.on('close', () => {
    closed = true;
    clearInterval(interval);
    clearInterval(keepalive);
  });
});

// POST /api/webhooks — post message via webhook
router.post('/', (req, res) => {
  const participant = getAuthParticipant(req);
  if (!participant) return res.status(401).json({ error: 'Unauthorized' });

  const { roomId, content } = req.body;

  if (!roomId) return res.status(400).json({ error: 'roomId required' });
  if (!content) return res.status(400).json({ error: 'content required' });
  if (!isRoomMember(roomId, participant.id)) return res.status(403).json({ error: 'Not a member of this room' });

  if (participant.type === 'agent' && participant.permission !== 'public') {
    return res.status(403).json({ error: 'Agent does not have public speaking permission' });
  }

  // Regular message only — no arbitrary code execution
  const msg = saveMessage(roomId, participant.id, participant.name, content, false);
  broadcast(roomId, { type: 'new_message', message: msg }, participant.id);

  const roomData = getRoom(roomId);
  if (roomData?.federated) {
    relayRoomMessage(roomId, msg as unknown as Record<string, unknown>);
  }

  res.status(201).json(msg);
});

export default router;
