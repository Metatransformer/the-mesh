import WebSocket from 'ws';
import { EventEmitter } from 'events';

export interface MeshClientOptions {
  url?: string;
  token: string;
  autoReconnect?: boolean;
  reconnectInterval?: number;
  security?: Partial<SecurityPolicy>;
}

export interface SecurityPolicy {
  /** Who can trigger command handlers */
  allowCommandsFrom: 'all' | 'local' | 'owner-only';
  /** List of owner participant IDs */
  ownerIds: string[];
  /** Whether to process federated messages at all */
  processFederated: boolean;
  /** Whether command handlers can be triggered by federated messages. DEFAULT: false */
  federatedCanExecute: boolean;
}

const DEFAULT_SECURITY: SecurityPolicy = {
  allowCommandsFrom: 'local',
  ownerIds: [],
  processFederated: true,
  federatedCanExecute: false,
};

export interface MeshMessage {
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
  trustLevel?: 'owner' | 'local' | 'federated' | 'untrusted';
}

export class MeshClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private url: string;
  private token: string;
  private autoReconnect: boolean;
  private reconnectInterval: number;
  private _connected = false;
  private _destroyed = false;
  private _reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private _httpUrl: string;
  private _security: SecurityPolicy;
  private _roomMembers: Record<string, string[]> = {};

  constructor(options: MeshClientOptions) {
    super();
    this.url = options.url || 'ws://localhost:3000/api/ws';
    this.token = options.token;
    this.autoReconnect = options.autoReconnect !== false;
    this.reconnectInterval = options.reconnectInterval || 5000;
    this._httpUrl = this.url.replace(/^ws/, 'http').replace(/\/api\/ws\/?$/, '');
    this._security = { ...DEFAULT_SECURITY, ...options.security };
  }

  get connected(): boolean {
    return this._connected;
  }

  get security(): SecurityPolicy {
    return { ...this._security };
  }

  get roomMembers(): Record<string, string[]> {
    return { ...this._roomMembers };
  }

  connect(): void {
    if (this.ws) return;
    this._destroyed = false;

    const ws = new WebSocket(this.url);
    this.ws = ws;

    ws.on('open', () => {
      ws.send(JSON.stringify({ type: 'auth', token: this.token }));
    });

    ws.on('message', (data: WebSocket.Data) => {
      let msg: any;
      try { msg = JSON.parse(data.toString()); } catch { return; }

      if (msg.type === 'auth_ok') {
        this._connected = true;
        this._botName = msg.participant?.name || '';
        this.emit('connected', msg.participant);
      } else if (msg.type === 'auth_error') {
        this.emit('error', new Error(msg.message || 'Auth failed'));
        this.ws = null;
      } else if (msg.type === 'room_joined') {
        this.emit('room_joined', msg.roomId);
      } else if (msg.type === 'room_left') {
        this.emit('room_left', msg.roomId);
      } else if (msg.type === 'room_members') {
        this._roomMembers = msg.roomMembers || {};
        this.emit('room_members', this._roomMembers);
      } else if (msg.type === 'new_message') {
        const m: MeshMessage = msg.message;
        const isFederated = !!(m.fromMesh || m.fromMeshId || m.trustLevel === 'federated');

        // If federated messages are disabled, skip entirely
        if (isFederated && !this._security.processFederated) return;

        // Ensure trustLevel is set
        if (!m.trustLevel) {
          m.trustLevel = isFederated ? 'federated' : 'local';
        }

        if (m.isDm) {
          this.emit('dm', m);
        } else {
          this.emit('message', m);
        }
      } else if (msg.type === 'error') {
        this.emit('error', new Error(msg.message));
      } else if (msg.type === 'participant_online') {
        this.emit('participant_online', msg);
      } else if (msg.type === 'participant_offline') {
        this.emit('participant_offline', msg);
      } else if (msg.type === 'federation_status') {
        this.emit('federation_status', msg);
      }
    });

    ws.on('close', () => {
      this._connected = false;
      this.ws = null;
      this.emit('disconnected');
      if (this.autoReconnect && !this._destroyed) {
        this._reconnectTimer = setTimeout(() => this.connect(), this.reconnectInterval);
      }
    });

    ws.on('error', (err: Error) => {
      this.emit('error', err);
    });
  }

  disconnect(): void {
    this._destroyed = true;
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  joinRoom(roomId: string, password?: string): void {
    this._send({ type: 'join_room', roomId, password });
  }

  leaveRoom(roomId: string): void {
    this._send({ type: 'leave_room', roomId });
  }

  send(roomId: string, content: string): void {
    this._send({ type: 'message', roomId, content });
  }

  sendDm(recipientId: string, content: string, roomId?: string): void {
    this._send({ type: 'dm', recipientId, content, roomId: roomId || null });
  }

  federateRoom(roomId: string, federated: boolean): void {
    this._send({ type: 'federate_room', roomId, federated });
  }

  // --- REST convenience methods ---

  static async register(opts: {
    url?: string;
    name: string;
    type: 'user' | 'agent';
    role?: string;
    parentId?: string;
  }): Promise<{ id: string; name: string; token: string; type: string }> {
    const baseUrl = (opts.url || 'ws://localhost:3000/api/ws')
      .replace(/^ws/, 'http')
      .replace(/\/api\/ws\/?$/, '');
    const res = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: opts.name, type: opts.type, role: opts.role, parentId: opts.parentId }),
    });
    const data: any = await res.json();
    if (!res.ok) throw new Error(data.error || 'Registration failed');
    return data;
  }

  async createRoom(name: string, isPrivate = false, password?: string): Promise<{ id: string; name: string }> {
    const res = await fetch(`${this._httpUrl}/api/rooms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.token}` },
      body: JSON.stringify({ name, isPrivate, password }),
    });
    const data: any = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to create room');
    return data;
  }

  async listRooms(): Promise<Array<{ id: string; name: string; isPrivate: boolean; federated: boolean }>> {
    const res = await fetch(`${this._httpUrl}/api/rooms`);
    const data: any = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to list rooms');
    return data;
  }

  async joinRoomByName(name: string): Promise<string | null> {
    const rooms = await this.listRooms();
    const room = rooms.find((r) => r.name === name);
    if (!room) return null;
    const res = await fetch(`${this._httpUrl}/api/rooms/${room.id}/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.token}` },
      body: '{}',
    });
    if (!res.ok) return null;
    this.joinRoom(room.id);
    return room.id;
  }

  async getMessages(roomId: string, limit = 50): Promise<MeshMessage[]> {
    const res = await fetch(`${this._httpUrl}/api/rooms/${roomId}/messages?limit=${limit}`, {
      headers: { Authorization: `Bearer ${this.token}` },
    });
    const data: any = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to get messages');
    return data;
  }

  async getRoomMembers(): Promise<Record<string, string[]>> {
    const res = await fetch(`${this._httpUrl}/api/rooms/members`, {
      headers: { Authorization: `Bearer ${this.token}` },
    });
    const data: any = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to get room members');
    this._roomMembers = data;
    return data;
  }

  async getParticipants(): Promise<Array<{ id: string; name: string; type: string; online: boolean; permission: string; role?: string }>> {
    const res = await fetch(`${this._httpUrl}/api/participants`, {
      headers: { Authorization: `Bearer ${this.token}` },
    });
    const data: any = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to get participants');
    return data;
  }

  // --- Command handling ---

  private _commandPrefix: string | null = null;
  private _commandHandlers: Map<string, (args: string[], msg: MeshMessage, client: MeshClient) => string | void | Promise<string | void>> = new Map();
  private _botName: string = '';

  enableCommands(prefix?: string): void {
    this._commandPrefix = prefix || null;
    this.on('message', (msg: MeshMessage) => this._handleCommandMessage(msg));
  }

  onCommand(name: string, handler: (args: string[], msg: MeshMessage, client: MeshClient) => string | void | Promise<string | void>): void {
    this._commandHandlers.set(name.toLowerCase(), handler);
  }

  private async _handleCommandMessage(msg: MeshMessage): Promise<void> {
    if (msg.senderName === this._botName) return;

    // --- SECURITY: Check trust level before executing commands ---
    const isFederated = msg.trustLevel === 'federated' || !!(msg.fromMesh || msg.fromMeshId);

    // Block federated command execution unless explicitly allowed
    if (isFederated && !this._security.federatedCanExecute) {
      // Silently ignore commands from federated messages
      return;
    }

    // Check allowCommandsFrom policy
    if (this._security.allowCommandsFrom === 'owner-only') {
      if (!this._security.ownerIds.includes(msg.senderId)) {
        return; // Only owners can execute commands
      }
    } else if (this._security.allowCommandsFrom === 'local') {
      if (isFederated) return; // Already handled above, but defense in depth
    }
    // 'all' allows everything (not recommended)

    let cmdText: string | null = null;
    const content = msg.content.trim();

    if (this._commandPrefix && content.startsWith(this._commandPrefix)) {
      cmdText = content.slice(this._commandPrefix.length);
    } else if (!this._commandPrefix && this._botName) {
      const mention = `@${this._botName} `;
      if (content.startsWith(mention)) {
        cmdText = content.slice(mention.length);
      }
    }

    if (!cmdText) return;

    const [cmd, ...args] = cmdText.trim().split(/\s+/);
    const handler = this._commandHandlers.get(cmd.toLowerCase());
    if (!handler) return;

    try {
      const result = await handler(args, msg, this);
      if (result) {
        this.send(msg.roomId, String(result));
      }
    } catch (e: any) {
      this.send(msg.roomId, `Error: ${e.message}`);
    }
  }

  // --- Private ---

  private _send(msg: Record<string, unknown>): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }
}

export default MeshClient;
