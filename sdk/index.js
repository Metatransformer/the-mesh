"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MeshClient = void 0;
const ws_1 = __importDefault(require("ws"));
const events_1 = require("events");
const DEFAULT_SECURITY = {
    allowCommandsFrom: 'local',
    ownerIds: [],
    processFederated: true,
    federatedCanExecute: false,
};
class MeshClient extends events_1.EventEmitter {
    constructor(options) {
        super();
        this.ws = null;
        this._connected = false;
        this._destroyed = false;
        this._reconnectTimer = null;
        // --- Command handling ---
        this._commandPrefix = null;
        this._commandHandlers = new Map();
        this._botName = '';
        this.url = options.url || 'ws://localhost:3000/api/ws';
        this.token = options.token;
        this.autoReconnect = options.autoReconnect !== false;
        this.reconnectInterval = options.reconnectInterval || 5000;
        this._httpUrl = this.url.replace(/^ws/, 'http').replace(/\/api\/ws\/?$/, '');
        this._security = { ...DEFAULT_SECURITY, ...options.security };
    }
    get connected() {
        return this._connected;
    }
    get security() {
        return { ...this._security };
    }
    connect() {
        if (this.ws)
            return;
        this._destroyed = false;
        const ws = new ws_1.default(this.url);
        this.ws = ws;
        ws.on('open', () => {
            ws.send(JSON.stringify({ type: 'auth', token: this.token }));
        });
        ws.on('message', (data) => {
            let msg;
            try {
                msg = JSON.parse(data.toString());
            }
            catch {
                return;
            }
            if (msg.type === 'auth_ok') {
                this._connected = true;
                this._botName = msg.participant?.name || '';
                this.emit('connected', msg.participant);
            }
            else if (msg.type === 'auth_error') {
                this.emit('error', new Error(msg.message || 'Auth failed'));
                this.ws = null;
            }
            else if (msg.type === 'room_joined') {
                this.emit('room_joined', msg.roomId);
            }
            else if (msg.type === 'room_left') {
                this.emit('room_left', msg.roomId);
            }
            else if (msg.type === 'new_message') {
                const m = msg.message;
                const isFederated = !!(m.fromMesh || m.fromMeshId || m.trustLevel === 'federated');
                // If federated messages are disabled, skip entirely
                if (isFederated && !this._security.processFederated)
                    return;
                // Ensure trustLevel is set
                if (!m.trustLevel) {
                    m.trustLevel = isFederated ? 'federated' : 'local';
                }
                if (m.isDm) {
                    this.emit('dm', m);
                }
                else {
                    this.emit('message', m);
                }
            }
            else if (msg.type === 'error') {
                this.emit('error', new Error(msg.message));
            }
            else if (msg.type === 'participant_online') {
                this.emit('participant_online', msg);
            }
            else if (msg.type === 'participant_offline') {
                this.emit('participant_offline', msg);
            }
            else if (msg.type === 'federation_status') {
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
        ws.on('error', (err) => {
            this.emit('error', err);
        });
    }
    disconnect() {
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
    joinRoom(roomId, password) {
        this._send({ type: 'join_room', roomId, password });
    }
    leaveRoom(roomId) {
        this._send({ type: 'leave_room', roomId });
    }
    send(roomId, content) {
        this._send({ type: 'message', roomId, content });
    }
    sendDm(recipientId, content, roomId) {
        this._send({ type: 'dm', recipientId, content, roomId: roomId || null });
    }
    federateRoom(roomId, federated) {
        this._send({ type: 'federate_room', roomId, federated });
    }
    // --- REST convenience methods ---
    static async register(opts) {
        const baseUrl = (opts.url || 'ws://localhost:3000/api/ws')
            .replace(/^ws/, 'http')
            .replace(/\/api\/ws\/?$/, '');
        const res = await fetch(`${baseUrl}/api/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: opts.name, type: opts.type, role: opts.role, parentId: opts.parentId }),
        });
        const data = await res.json();
        if (!res.ok)
            throw new Error(data.error || 'Registration failed');
        return data;
    }
    async createRoom(name, isPrivate = false, password) {
        const res = await fetch(`${this._httpUrl}/api/rooms`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.token}` },
            body: JSON.stringify({ name, isPrivate, password }),
        });
        const data = await res.json();
        if (!res.ok)
            throw new Error(data.error || 'Failed to create room');
        return data;
    }
    async listRooms() {
        const res = await fetch(`${this._httpUrl}/api/rooms`);
        const data = await res.json();
        if (!res.ok)
            throw new Error(data.error || 'Failed to list rooms');
        return data;
    }
    async joinRoomByName(name) {
        const rooms = await this.listRooms();
        const room = rooms.find((r) => r.name === name);
        if (!room)
            return null;
        const res = await fetch(`${this._httpUrl}/api/rooms/${room.id}/join`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.token}` },
            body: '{}',
        });
        if (!res.ok)
            return null;
        this.joinRoom(room.id);
        return room.id;
    }
    async getMessages(roomId, limit = 50) {
        const res = await fetch(`${this._httpUrl}/api/rooms/${roomId}/messages?limit=${limit}`, {
            headers: { Authorization: `Bearer ${this.token}` },
        });
        const data = await res.json();
        if (!res.ok)
            throw new Error(data.error || 'Failed to get messages');
        return data;
    }
    enableCommands(prefix) {
        this._commandPrefix = prefix || null;
        this.on('message', (msg) => this._handleCommandMessage(msg));
    }
    onCommand(name, handler) {
        this._commandHandlers.set(name.toLowerCase(), handler);
    }
    async _handleCommandMessage(msg) {
        if (msg.senderName === this._botName)
            return;
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
        }
        else if (this._security.allowCommandsFrom === 'local') {
            if (isFederated)
                return; // Already handled above, but defense in depth
        }
        // 'all' allows everything (not recommended)
        let cmdText = null;
        const content = msg.content.trim();
        if (this._commandPrefix && content.startsWith(this._commandPrefix)) {
            cmdText = content.slice(this._commandPrefix.length);
        }
        else if (!this._commandPrefix && this._botName) {
            const mention = `@${this._botName} `;
            if (content.startsWith(mention)) {
                cmdText = content.slice(mention.length);
            }
        }
        if (!cmdText)
            return;
        const [cmd, ...args] = cmdText.trim().split(/\s+/);
        const handler = this._commandHandlers.get(cmd.toLowerCase());
        if (!handler)
            return;
        try {
            const result = await handler(args, msg, this);
            if (result) {
                this.send(msg.roomId, String(result));
            }
        }
        catch (e) {
            this.send(msg.roomId, `Error: ${e.message}`);
        }
    }
    // --- Private ---
    _send(msg) {
        if (this.ws && this.ws.readyState === ws_1.default.OPEN) {
            this.ws.send(JSON.stringify(msg));
        }
    }
}
exports.MeshClient = MeshClient;
exports.default = MeshClient;
