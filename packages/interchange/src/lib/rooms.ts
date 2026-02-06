import { nanoid } from 'nanoid';
import { hashPassword, verifyPassword } from './auth';
import {
  insertRoom, getRoom as dbGetRoom, listAllRooms,
  addRoomMember, isRoomMember as dbIsRoomMember,
  getRoomMemberIds, insertMessage, getRoomMessages as dbGetRoomMessages,
  setRoomFederated as dbSetRoomFederated,
} from './db';
import type { Room, Message, TrustLevel } from './types';
import type { DbMessage } from './db';

export function createRoom(name: string, adminId: string, isPrivate: boolean, password?: string, federated: boolean = false, posX?: number, posZ?: number): Room {
  const id = nanoid(12);
  const passwordHash = password ? hashPassword(password) : null;
  insertRoom({ id, name, isPrivate, passwordHash, adminId, federated, posX: posX ?? null, posZ: posZ ?? null, createdAt: new Date().toISOString() });
  return { id, name, isPrivate, adminId, federated, createdAt: new Date().toISOString() };
}

export function listRooms(): Room[] {
  return listAllRooms().map(r => ({
    id: r.id, name: r.name, isPrivate: r.isPrivate, adminId: r.adminId, federated: r.federated ?? false, createdAt: r.createdAt,
  }));
}

export function findRoomByName(name: string): Room | null {
  const rooms = listRooms();
  return rooms.find(r => r.name === name) || null;
}

export function getRoom(id: string): Room | null {
  const r = dbGetRoom(id);
  if (!r) return null;
  return { id: r.id, name: r.name, isPrivate: r.isPrivate, adminId: r.adminId, federated: r.federated ?? false, createdAt: r.createdAt };
}

export function joinRoom(roomId: string, participantId: string, password?: string): boolean {
  const room = dbGetRoom(roomId);
  if (!room) return false;
  if (room.isPrivate && room.passwordHash) {
    if (!password || !verifyPassword(password, room.passwordHash)) return false;
  }
  addRoomMember(roomId, participantId);
  return true;
}

export function isRoomMember(roomId: string, participantId: string): boolean {
  return dbIsRoomMember(roomId, participantId);
}

export function getRoomMembers(roomId: string): string[] {
  return getRoomMemberIds(roomId);
}

export function saveMessage(roomId: string | null, senderId: string, senderName: string, content: string, isDm: boolean, recipientId?: string, trustLevel: TrustLevel = 'local'): Message {
  const id = nanoid(16);
  const msg: DbMessage = {
    id, roomId, senderId, senderName, content, isDm,
    recipientId: recipientId || null,
    createdAt: new Date().toISOString(),
  };
  insertMessage(msg);
  return { id, roomId: roomId || '', senderId, senderName, content, isDm, recipientId, createdAt: msg.createdAt, trustLevel };
}

export function setFederated(roomId: string, federated: boolean): boolean {
  return dbSetRoomFederated(roomId, federated);
}

export function getRoomMessages(roomId: string, limit?: number, before?: string, viewerId?: string) {
  return dbGetRoomMessages(roomId, limit, before, viewerId);
}
