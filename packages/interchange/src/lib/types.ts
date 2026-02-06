export type ParticipantType = 'user' | 'agent';
export type AgentPermission = 'public' | 'dm-only' | 'silent';

export interface Participant {
  id: string;
  name: string;
  type: ParticipantType;
  token: string;
  role?: string;
  parentId?: string;
  permission: AgentPermission;
  webhookUrl?: string;
  online: boolean;
  createdAt: string;
}

export interface Room {
  id: string;
  name: string;
  isPrivate: boolean;
  passwordHash?: string;
  adminId: string;
  federated: boolean;
  createdAt: string;
}

export type TrustLevel = 'owner' | 'local' | 'federated' | 'untrusted';

export interface Message {
  id: string;
  roomId: string;
  senderId: string;
  senderName: string;
  content: string;
  isDm: boolean;
  recipientId?: string;
  createdAt: string;
  trustLevel: TrustLevel;
  fromMesh?: string;
  fromMeshId?: string;
}

export interface RoomMember {
  roomId: string;
  participantId: string;
  joinedAt: string;
}

export type WsMessageType =
  | 'auth'
  | 'auth_ok'
  | 'auth_error'
  | 'join_room'
  | 'leave_room'
  | 'room_joined'
  | 'room_left'
  | 'message'
  | 'dm'
  | 'new_message'
  | 'participant_online'
  | 'participant_offline'
  | 'federate_room'
  | 'federation_status'
  | 'remote_participants'
  | 'room_members'
  | 'error';

export interface WsMessage {
  type: WsMessageType;
  [key: string]: unknown;
}
