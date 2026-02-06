'use client';

import { useState, useRef, useCallback, type RefObject } from 'react';

/** Prefix a path with serverUrl when set, otherwise use relative path (Next.js proxy) */
function apiUrl(serverUrlRef: RefObject<string>, path: string): string {
  const base = serverUrlRef.current;
  return base ? `${base}${path}` : path;
}

export interface ClientParticipant {
  id: string;
  name: string;
  type: 'user' | 'agent';
  online: boolean;
  permission: string;
  parentId?: string;
  role?: string;
  description?: string;
}

export interface ClientRoom {
  id: string;
  name: string;
  isPrivate: boolean;
  adminId: string;
  federated: boolean;
}

export interface ClientMessage {
  id: string;
  roomId: string;
  senderId: string;
  senderName: string;
  content: string;
  isDm: boolean;
  recipientId?: string;
  createdAt: string;
  fromMesh?: string;
  fromMeshId?: string;
}

export interface RemoteParticipant {
  id: string;
  name: string;
  type: string;
  meshId: string;
  meshName: string;
}

export interface FederationStatus {
  connected: boolean;
  gatewayUrl: string | null;
  meshId: string | null;
  meshName: string | null;
  configured: boolean;
}

export interface UseMeshState {
  rooms: ClientRoom[];
  participants: ClientParticipant[];
  remoteParticipants: RemoteParticipant[];
  messages: ClientMessage[];
  activeRoom: string | null;
  federationStatus: FederationStatus;
  roomMembers: Record<string, string[]>;
  roomPositions: Record<string, [number, number]>;
  setRooms: React.Dispatch<React.SetStateAction<ClientRoom[]>>;
  setParticipants: React.Dispatch<React.SetStateAction<ClientParticipant[]>>;
  setRemoteParticipants: React.Dispatch<React.SetStateAction<RemoteParticipant[]>>;
  setMessages: React.Dispatch<React.SetStateAction<ClientMessage[]>>;
  setActiveRoom: (roomId: string | null) => void;
  setFederationStatus: React.Dispatch<React.SetStateAction<FederationStatus>>;
  setRoomMembers: React.Dispatch<React.SetStateAction<Record<string, string[]>>>;
  activeRoomRef: React.RefObject<string | null>;
  fetchRooms: (token: string) => Promise<void>;
  fetchParticipants: () => Promise<void>;
  fetchMessages: (roomId: string, token: string) => Promise<void>;
  fetchRemoteParticipants: () => Promise<void>;
  fetchRoomMembers: (token: string) => Promise<void>;
  fetchRoomPositions: () => Promise<void>;
  checkFederationStatus: () => Promise<void>;
  clearAll: () => void;
}

const defaultFederationStatus: FederationStatus = {
  connected: false,
  gatewayUrl: null,
  meshId: null,
  meshName: null,
  configured: false,
};

export function useMeshState(serverUrlRef: RefObject<string>): UseMeshState {
  const [rooms, setRooms] = useState<ClientRoom[]>([]);
  const [participants, setParticipants] = useState<ClientParticipant[]>([]);
  const [remoteParticipants, setRemoteParticipants] = useState<RemoteParticipant[]>([]);
  const [messages, setMessages] = useState<ClientMessage[]>([]);
  const [activeRoom, _setActiveRoom] = useState<string | null>(null);
  const [federationStatus, setFederationStatus] = useState<FederationStatus>(defaultFederationStatus);
  const [roomMembers, setRoomMembers] = useState<Record<string, string[]>>({});
  const [roomPositions, setRoomPositions] = useState<Record<string, [number, number]>>({});
  const activeRoomRef = useRef<string | null>(null);

  const setActiveRoom = useCallback((roomId: string | null) => {
    _setActiveRoom(roomId);
    activeRoomRef.current = roomId;
  }, []);

  const fetchRooms = useCallback(async (token: string) => {
    const res = await fetch(apiUrl(serverUrlRef, '/api/rooms'), { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) setRooms(await res.json());
  }, [serverUrlRef]);

  const fetchParticipants = useCallback(async () => {
    const res = await fetch(apiUrl(serverUrlRef, '/api/participants'));
    if (res.ok) setParticipants(await res.json());
  }, [serverUrlRef]);

  const fetchMessages = useCallback(async (roomId: string, token: string) => {
    const res = await fetch(apiUrl(serverUrlRef, `/api/rooms/${roomId}/messages`), { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) setMessages(await res.json());
  }, [serverUrlRef]);

  const fetchRemoteParticipants = useCallback(async () => {
    try {
      const res = await fetch(apiUrl(serverUrlRef, '/api/gateway/participants'));
      if (res.ok) setRemoteParticipants(await res.json());
    } catch {}
  }, [serverUrlRef]);

  const fetchRoomMembers = useCallback(async (token: string) => {
    try {
      const res = await fetch(apiUrl(serverUrlRef, '/api/rooms/members'), { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setRoomMembers(await res.json());
    } catch {}
  }, [serverUrlRef]);

  const fetchRoomPositions = useCallback(async () => {
    try {
      const res = await fetch(apiUrl(serverUrlRef, '/api/rooms/positions'));
      if (res.ok) setRoomPositions(await res.json());
    } catch {}
  }, [serverUrlRef]);

  const checkFederationStatus = useCallback(async () => {
    try {
      const res = await fetch(apiUrl(serverUrlRef, '/api/gateway/status'));
      if (res.ok) setFederationStatus(await res.json());
    } catch {}
  }, [serverUrlRef]);

  const clearAll = useCallback(() => {
    setRooms([]);
    setParticipants([]);
    setRemoteParticipants([]);
    setMessages([]);
    setActiveRoom(null);
    setFederationStatus(defaultFederationStatus);
    setRoomMembers({});
    setRoomPositions({});
  }, [setActiveRoom]);

  return {
    rooms,
    participants,
    remoteParticipants,
    messages,
    activeRoom,
    federationStatus,
    roomMembers,
    roomPositions,
    setRooms,
    setParticipants,
    setRemoteParticipants,
    setMessages,
    setActiveRoom,
    setFederationStatus,
    setRoomMembers,
    activeRoomRef,
    fetchRooms,
    fetchParticipants,
    fetchMessages,
    fetchRemoteParticipants,
    fetchRoomMembers,
    fetchRoomPositions,
    checkFederationStatus,
    clearAll,
  };
}
