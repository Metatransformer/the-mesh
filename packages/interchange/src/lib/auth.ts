import { nanoid } from 'nanoid';
import crypto from 'crypto';
import {
  insertParticipant, getParticipantByToken as dbGetByToken,
  getParticipantById as dbGetById, listAllParticipants,
  updateParticipantPermission, updateParticipantParent,
} from './db';
import type { Participant, ParticipantType } from './types';
import type { DbParticipant } from './db';

export function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex');
}

export function verifyPassword(password: string, hash: string): boolean {
  return hashPassword(password) === hash;
}

function toParticipant(row: DbParticipant, hideToken = false): Participant {
  return {
    id: row.id,
    name: row.name,
    type: row.type as ParticipantType,
    token: hideToken ? '' : row.token,
    role: row.role || undefined,
    parentId: row.parentId || undefined,
    permission: row.permission as Participant['permission'],
    webhookUrl: row.webhookUrl || undefined,
    online: false,
    createdAt: row.createdAt,
  };
}

export function registerParticipant(
  name: string, type: ParticipantType, role?: string, parentId?: string
): Participant {
  const id = nanoid(12);
  const token = nanoid(32);

  if (type === 'agent') {
    if (!parentId) throw new Error('Agents must have a parent');
    const parent = dbGetById(parentId);
    if (!parent) throw new Error('Parent not found');
  }

  const p: DbParticipant = {
    id, name, type, token,
    role: role || null,
    parentId: parentId || null,
    permission: type === 'agent' ? 'dm-only' : 'public',
    webhookUrl: null,
    createdAt: new Date().toISOString(),
  };

  insertParticipant(p);
  return toParticipant(p);
}

export function getParticipantByToken(token: string): Participant | null {
  const row = dbGetByToken(token);
  return row ? toParticipant(row) : null;
}

export function getParticipantById(id: string): Participant | null {
  const row = dbGetById(id);
  return row ? toParticipant(row) : null;
}

export function listParticipants(): Participant[] {
  return listAllParticipants().map(r => toParticipant(r, true));
}

export function updatePermission(id: string, permission: Participant['permission']): boolean {
  return updateParticipantPermission(id, permission);
}

export function reparentParticipant(id: string, newParentId: string): boolean {
  if (id === newParentId) throw new Error('Cannot reparent to self');

  const target = dbGetById(id);
  if (!target) throw new Error('Participant not found');
  if (target.type !== 'agent') throw new Error('Only agents can be reparented');

  const newParent = dbGetById(newParentId);
  if (!newParent) throw new Error('New parent not found');

  let current: string | null = newParentId;
  while (current) {
    if (current === id) throw new Error('Circular reference detected');
    const p = dbGetById(current);
    current = p?.parentId ?? null;
  }

  return updateParticipantParent(id, newParentId);
}
