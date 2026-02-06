import { Router } from 'express';
import { createRoom, listRooms, joinRoom, isRoomMember, saveMessage, getRoomMessages, getRoom } from '../lib/rooms';
import { getRoom as dbGetRoom, updateRoomName, getAllRoomMembers, getAllRoomPositions, addRoomMember, isRoomMember as dbIsRoomMember, getParticipantById, listAllParticipants } from '../lib/db';
import { getAuthParticipant } from '../lib/api-helpers';
import { broadcast } from '../lib/ws-server';
import { relayRoomMessage } from '../lib/federation';
import { notifyMentionedParticipants } from '../lib/webhooks';

const router = Router();

// GET /api/rooms — list rooms
router.get('/', (req, res) => {
  res.json(listRooms());
});

// POST /api/rooms — create room
router.post('/', (req, res) => {
  const participant = getAuthParticipant(req);
  if (!participant) return res.status(401).json({ error: 'Unauthorized' });

  const { name, isPrivate, password, federated, posX, posZ } = req.body;
  if (!name) return res.status(400).json({ error: 'Room name required' });

  try {
    const room = createRoom(name, participant.id, !!isPrivate, password, !!federated, posX, posZ);
    res.status(201).json(room);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed to create room';
    res.status(400).json({ error: msg });
  }
});

// PATCH /api/rooms/:id — rename room
router.patch('/:id', (req, res) => {
  const participant = getAuthParticipant(req);
  if (!participant) return res.status(401).json({ error: 'Unauthorized' });

  const room = dbGetRoom(req.params.id);
  if (!room) return res.status(404).json({ error: 'Room not found' });
  if (room.adminId !== participant.id) return res.status(403).json({ error: 'Only room admin can rename' });

  const { name } = req.body;
  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'Name required' });
  }

  try {
    updateRoomName(req.params.id, name.trim());
    res.json({ ...room, name: name.trim() });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed to rename room';
    res.status(400).json({ error: msg });
  }
});

// GET /api/rooms/members — all room members
router.get('/members', (req, res) => {
  const participant = getAuthParticipant(req);
  if (!participant) return res.status(401).json({ error: 'Unauthorized' });
  res.json(getAllRoomMembers());
});

// GET /api/rooms/positions — all room positions
router.get('/positions', (req, res) => {
  res.json(getAllRoomPositions());
});

// POST /api/rooms/:id/invite — invite to room
router.post('/:id/invite', (req, res) => {
  const caller = getAuthParticipant(req);
  if (!caller) return res.status(401).json({ error: 'Unauthorized' });

  const room = dbGetRoom(req.params.id);
  if (!room) return res.status(404).json({ error: 'Room not found' });

  if (!dbIsRoomMember(req.params.id, caller.id)) {
    return res.status(403).json({ error: 'You are not a member of this room' });
  }

  const { participantId } = req.body;
  if (!participantId) return res.status(400).json({ error: 'participantId required' });

  const target = getParticipantById(participantId);
  if (!target) return res.status(404).json({ error: 'Participant not found' });

  // Permission check:
  // - Room admin can invite anyone
  // - Room members can only invite their own children (parentId === caller.id)
  const isAdmin = room.adminId === caller.id;
  if (!isAdmin && target.parentId !== caller.id) {
    return res.status(403).json({ error: 'You can only invite your own agents' });
  }

  // Add the target
  addRoomMember(req.params.id, participantId, caller.id);

  // Auto-invite: when inviting a human, also add all their agents
  const invited = [participantId];
  if (target.type === 'user') {
    const allParticipants = listAllParticipants();
    const children = allParticipants.filter(p => p.parentId === target.id);
    for (const child of children) {
      if (!dbIsRoomMember(req.params.id, child.id)) {
        addRoomMember(req.params.id, child.id, caller.id);
        invited.push(child.id);
      }
    }
  }

  res.json({ invited });
});

// POST /api/rooms/:id/join — join room
router.post('/:id/join', (req, res) => {
  const participant = getAuthParticipant(req);
  if (!participant) return res.status(401).json({ error: 'Unauthorized' });

  const password = req.body?.password;
  const ok = joinRoom(req.params.id, participant.id, password);
  if (!ok) return res.status(400).json({ error: 'Cannot join room (wrong password or room not found)' });
  res.json({ joined: true, roomId: req.params.id });
});

// GET /api/rooms/:id/messages — get room messages
router.get('/:id/messages', (req, res) => {
  const participant = getAuthParticipant(req);
  if (!participant) return res.status(401).json({ error: 'Unauthorized' });
  if (!isRoomMember(req.params.id, participant.id)) return res.status(403).json({ error: 'Not a member' });

  const limit = parseInt(req.query.limit as string || '50');
  const before = (req.query.before as string) || undefined;
  res.json(getRoomMessages(req.params.id, limit, before, participant.id));
});

// POST /api/rooms/:id/messages — post room message
router.post('/:id/messages', (req, res) => {
  const participant = getAuthParticipant(req);
  if (!participant) return res.status(401).json({ error: 'Unauthorized' });
  if (!isRoomMember(req.params.id, participant.id)) return res.status(403).json({ error: 'Not a member' });

  if (participant.type === 'agent' && participant.permission !== 'public') {
    return res.status(403).json({ error: 'Agent does not have public speaking permission' });
  }

  const { content } = req.body;
  if (!content) return res.status(400).json({ error: 'Content required' });

  const msg = saveMessage(req.params.id, participant.id, participant.name, content, false);
  // Broadcast to WebSocket clients so UI updates in real-time
  broadcast(req.params.id, { type: 'new_message', message: msg }, participant.id);

  // Relay to federation gateway if room is federated
  const roomData = getRoom(req.params.id);
  if (roomData?.federated) {
    console.log(`[Federation] Relaying message to gateway from room ${req.params.id}`);
    relayRoomMessage(req.params.id, msg as unknown as Record<string, unknown>);
  }

  // Notify mentioned participants via webhooks (async, don't block response)
  notifyMentionedParticipants(msg, roomData?.name).catch(err => {
    console.error('[Webhooks] Error notifying mentions:', err);
  });

  res.status(201).json(msg);
});

export default router;
