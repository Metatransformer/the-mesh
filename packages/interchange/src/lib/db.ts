import { getDb } from './sqlite';

export interface QueuedMessage {
  id: string;
  targetMesh: string;
  messagePayload: string;
  status: 'pending' | 'sending' | 'sent' | 'failed' | 'abandoned';
  retryCount: number;
  createdAt: string;
  lastAttempt: string | null;
}

export interface DbParticipant {
  id: string;
  name: string;
  type: 'user' | 'agent';
  token: string;
  role: string | null;
  parentId: string | null;
  permission: string;
  webhookUrl: string | null;
  createdAt: string;
}

export interface DbRoom {
  id: string;
  name: string;
  isPrivate: boolean;
  passwordHash: string | null;
  adminId: string;
  federated: boolean;
  posX: number | null;
  posZ: number | null;
  createdAt: string;
}

export interface DbMessage {
  id: string;
  roomId: string | null;
  senderId: string;
  senderName: string;
  content: string;
  isDm: boolean;
  recipientId: string | null;
  createdAt: string;
}

// --- Participants ---

export function getParticipantByToken(token: string): DbParticipant | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM participants WHERE token = ?').get(token) as Record<string, unknown> | undefined;
  return row ? toDbParticipant(row) : null;
}

export function getParticipantById(id: string): DbParticipant | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM participants WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  return row ? toDbParticipant(row) : null;
}

export function getParticipantByName(name: string): DbParticipant | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM participants WHERE name = ?').get(name) as Record<string, unknown> | undefined;
  return row ? toDbParticipant(row) : null;
}

export function insertParticipant(p: DbParticipant) {
  const db = getDb();
  const existing = db.prepare('SELECT id FROM participants WHERE name = ?').get(p.name);
  if (existing) throw new Error('Name already taken');
  db.prepare(
    'INSERT INTO participants (id, name, type, token, role, parentId, permission, webhookUrl, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(p.id, p.name, p.type, p.token, p.role, p.parentId, p.permission, p.webhookUrl, p.createdAt);
}

export function listAllParticipants(): DbParticipant[] {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM participants ORDER BY createdAt ASC').all() as Record<string, unknown>[];
  return rows.map(toDbParticipant);
}

export function updateParticipantPermission(id: string, permission: string): boolean {
  const db = getDb();
  const result = db.prepare('UPDATE participants SET permission = ? WHERE id = ?').run(permission, id);
  return result.changes > 0;
}

export function updateParticipantWebhook(id: string, webhookUrl: string | null): boolean {
  const db = getDb();
  const result = db.prepare('UPDATE participants SET webhookUrl = ? WHERE id = ?').run(webhookUrl, id);
  return result.changes > 0;
}

export function getParticipantsWithWebhook(): DbParticipant[] {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM participants WHERE webhookUrl IS NOT NULL').all() as Record<string, unknown>[];
  return rows.map(toDbParticipant);
}

export function deleteParticipant(id: string): boolean {
  const db = getDb();
  const del = db.transaction(() => {
    db.prepare('DELETE FROM room_members WHERE participantId = ?').run(id);
    const result = db.prepare('DELETE FROM participants WHERE id = ?').run(id);
    return result.changes > 0;
  });
  return del();
}

export function updateParticipantParent(id: string, newParentId: string): boolean {
  const db = getDb();
  const result = db.prepare('UPDATE participants SET parentId = ? WHERE id = ?').run(newParentId, id);
  return result.changes > 0;
}

export function deleteParticipantCascade(id: string): string[] {
  const db = getDb();

  function collectDescendants(parentId: string): string[] {
    const children = db.prepare('SELECT id FROM participants WHERE parentId = ?').all(parentId) as { id: string }[];
    const ids: string[] = [];
    for (const child of children) {
      ids.push(...collectDescendants(child.id));
      ids.push(child.id);
    }
    return ids;
  }

  const allIds = [...collectDescendants(id), id];

  const del = db.transaction(() => {
    for (const delId of allIds) {
      db.prepare('DELETE FROM messages WHERE senderId = ?').run(delId);
      db.prepare('DELETE FROM room_members WHERE participantId = ?').run(delId);
      db.prepare('DELETE FROM participants WHERE id = ?').run(delId);
    }
  });
  del();
  return allIds;
}

// --- Rooms ---

export function insertRoom(r: DbRoom) {
  const db = getDb();
  const existing = db.prepare('SELECT id FROM rooms WHERE name = ?').get(r.name);
  if (existing) throw new Error('Room name already taken');
  db.prepare(
    'INSERT INTO rooms (id, name, isPrivate, passwordHash, adminId, federated, posX, posZ, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(r.id, r.name, r.isPrivate ? 1 : 0, r.passwordHash, r.adminId, r.federated ? 1 : 0, r.posX ?? null, r.posZ ?? null, r.createdAt);
  db.prepare('INSERT OR IGNORE INTO room_members (roomId, participantId) VALUES (?, ?)').run(r.id, r.adminId);
}

export function getRoom(id: string): DbRoom | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM rooms WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  return row ? toDbRoom(row) : null;
}

export function listAllRooms(): DbRoom[] {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM rooms ORDER BY createdAt ASC').all() as Record<string, unknown>[];
  return rows.map(toDbRoom);
}

export function setRoomFederated(roomId: string, federated: boolean): boolean {
  const db = getDb();
  const result = db.prepare('UPDATE rooms SET federated = ? WHERE id = ?').run(federated ? 1 : 0, roomId);
  return result.changes > 0;
}

export function updateRoomName(roomId: string, name: string): boolean {
  const db = getDb();
  const existing = db.prepare('SELECT id FROM rooms WHERE name = ? AND id != ?').get(name, roomId);
  if (existing) throw new Error('Room name already taken');
  const result = db.prepare('UPDATE rooms SET name = ? WHERE id = ?').run(name, roomId);
  return result.changes > 0;
}

export function updateRoomPosition(roomId: string, posX: number, posZ: number): boolean {
  const db = getDb();
  const result = db.prepare('UPDATE rooms SET posX = ?, posZ = ? WHERE id = ?').run(posX, posZ, roomId);
  return result.changes > 0;
}

export function getRoomPosition(roomId: string): { posX: number; posZ: number } | null {
  const db = getDb();
  const row = db.prepare('SELECT posX, posZ FROM rooms WHERE id = ? AND posX IS NOT NULL AND posZ IS NOT NULL').get(roomId) as { posX: number; posZ: number } | undefined;
  return row ?? null;
}

export function getAllRoomPositions(): Record<string, [number, number]> {
  const db = getDb();
  const rows = db.prepare('SELECT id, posX, posZ FROM rooms WHERE posX IS NOT NULL AND posZ IS NOT NULL').all() as { id: string; posX: number; posZ: number }[];
  const result: Record<string, [number, number]> = {};
  for (const row of rows) {
    result[row.id] = [row.posX, row.posZ];
  }
  return result;
}

// --- Room Members ---

export function addRoomMember(roomId: string, participantId: string, invitedBy?: string) {
  const db = getDb();
  db.prepare('INSERT OR IGNORE INTO room_members (roomId, participantId, invitedBy) VALUES (?, ?, ?)').run(roomId, participantId, invitedBy ?? null);
}

export function isRoomMember(roomId: string, participantId: string): boolean {
  const db = getDb();
  const row = db.prepare('SELECT 1 FROM room_members WHERE roomId = ? AND participantId = ?').get(roomId, participantId);
  return !!row;
}

export function getRoomMemberIds(roomId: string): string[] {
  const db = getDb();
  const rows = db.prepare('SELECT participantId FROM room_members WHERE roomId = ?').all(roomId) as { participantId: string }[];
  return rows.map(r => r.participantId);
}

export function getAllRoomMembers(): Record<string, string[]> {
  const db = getDb();
  const rows = db.prepare('SELECT roomId, participantId FROM room_members').all() as { roomId: string; participantId: string }[];
  const result: Record<string, string[]> = {};
  for (const row of rows) {
    if (!result[row.roomId]) result[row.roomId] = [];
    result[row.roomId].push(row.participantId);
  }
  return result;
}

// --- Messages ---

export function insertMessage(m: DbMessage) {
  const db = getDb();
  db.prepare(
    'INSERT INTO messages (id, roomId, senderId, senderName, content, isDm, recipientId, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(m.id, m.roomId, m.senderId, m.senderName, m.content, m.isDm ? 1 : 0, m.recipientId, m.createdAt);
}

export function getRoomMessages(roomId: string, limit = 50, before?: string, viewerId?: string): DbMessage[] {
  const db = getDb();
  let sql: string;
  let params: unknown[];

  if (viewerId) {
    if (before) {
      sql = 'SELECT * FROM messages WHERE roomId = ? AND createdAt < ? AND (isDm = 0 OR senderId = ? OR recipientId = ?) ORDER BY createdAt DESC LIMIT ?';
      params = [roomId, before, viewerId, viewerId, limit];
    } else {
      sql = 'SELECT * FROM messages WHERE roomId = ? AND (isDm = 0 OR senderId = ? OR recipientId = ?) ORDER BY createdAt DESC LIMIT ?';
      params = [roomId, viewerId, viewerId, limit];
    }
  } else {
    if (before) {
      sql = 'SELECT * FROM messages WHERE roomId = ? AND isDm = 0 AND createdAt < ? ORDER BY createdAt DESC LIMIT ?';
      params = [roomId, before, limit];
    } else {
      sql = 'SELECT * FROM messages WHERE roomId = ? AND isDm = 0 ORDER BY createdAt DESC LIMIT ?';
      params = [roomId, limit];
    }
  }

  const rows = db.prepare(sql).all(...params) as Record<string, unknown>[];
  return rows.map(toDbMessage).reverse();
}

// --- Federation Queue ---

export function enqueueMessage(targetMesh: string, payload: unknown): QueuedMessage {
  const db = getDb();
  const msg: QueuedMessage = {
    id: `fq_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    targetMesh,
    messagePayload: JSON.stringify(payload),
    status: 'pending',
    retryCount: 0,
    createdAt: new Date().toISOString(),
    lastAttempt: null,
  };
  db.prepare(
    'INSERT INTO federation_queue (id, targetMesh, messagePayload, status, retryCount, createdAt, lastAttempt) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(msg.id, msg.targetMesh, msg.messagePayload, msg.status, msg.retryCount, msg.createdAt, msg.lastAttempt);
  return msg;
}

export function getQueuedMessages(status: QueuedMessage['status']): QueuedMessage[] {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM federation_queue WHERE status = ?').all(status) as Record<string, unknown>[];
  return rows.map(toQueuedMessage);
}

export function updateQueueStatus(id: string, status: QueuedMessage['status'], retryCount?: number): boolean {
  const db = getDb();
  const now = new Date().toISOString();
  let result;
  if (retryCount !== undefined) {
    result = db.prepare('UPDATE federation_queue SET status = ?, retryCount = ?, lastAttempt = ? WHERE id = ?').run(status, retryCount, now, id);
  } else {
    result = db.prepare('UPDATE federation_queue SET status = ?, lastAttempt = ? WHERE id = ?').run(status, now, id);
  }
  return result.changes > 0;
}

export function resetFailedMessages(): number {
  const db = getDb();
  const result = db.prepare("UPDATE federation_queue SET status = 'pending', retryCount = 0 WHERE status = 'failed'").run();
  return result.changes;
}

export function abandonStaleMessages(): number {
  const db = getDb();
  const result = db.prepare("UPDATE federation_queue SET status = 'abandoned' WHERE status = 'failed' AND retryCount >= 5").run();
  return result.changes;
}

// --- Row converters ---

function toDbParticipant(row: Record<string, unknown>): DbParticipant {
  return {
    id: row.id as string,
    name: row.name as string,
    type: row.type as 'user' | 'agent',
    token: row.token as string,
    role: (row.role as string) ?? null,
    parentId: (row.parentId as string) ?? null,
    permission: (row.permission as string) ?? 'public',
    webhookUrl: (row.webhookUrl as string) ?? null,
    createdAt: row.createdAt as string,
  };
}

function toDbRoom(row: Record<string, unknown>): DbRoom {
  return {
    id: row.id as string,
    name: row.name as string,
    isPrivate: row.isPrivate === 1,
    passwordHash: (row.passwordHash as string) ?? null,
    adminId: row.adminId as string,
    federated: row.federated === 1,
    posX: (row.posX as number) ?? null,
    posZ: (row.posZ as number) ?? null,
    createdAt: row.createdAt as string,
  };
}

function toDbMessage(row: Record<string, unknown>): DbMessage {
  return {
    id: row.id as string,
    roomId: (row.roomId as string) ?? null,
    senderId: row.senderId as string,
    senderName: row.senderName as string,
    content: row.content as string,
    isDm: row.isDm === 1,
    recipientId: (row.recipientId as string) ?? null,
    createdAt: row.createdAt as string,
  };
}

function toQueuedMessage(row: Record<string, unknown>): QueuedMessage {
  return {
    id: row.id as string,
    targetMesh: row.targetMesh as string,
    messagePayload: row.messagePayload as string,
    status: row.status as QueuedMessage['status'],
    retryCount: row.retryCount as number,
    createdAt: row.createdAt as string,
    lastAttempt: (row.lastAttempt as string) ?? null,
  };
}
