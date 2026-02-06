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
export declare class MeshClient extends EventEmitter {
    private ws;
    private url;
    private token;
    private autoReconnect;
    private reconnectInterval;
    private _connected;
    private _destroyed;
    private _reconnectTimer;
    private _httpUrl;
    private _security;
    constructor(options: MeshClientOptions);
    get connected(): boolean;
    get security(): SecurityPolicy;
    connect(): void;
    disconnect(): void;
    joinRoom(roomId: string, password?: string): void;
    leaveRoom(roomId: string): void;
    send(roomId: string, content: string): void;
    sendDm(recipientId: string, content: string, roomId?: string): void;
    federateRoom(roomId: string, federated: boolean): void;
    static register(opts: {
        url?: string;
        name: string;
        type: 'user' | 'agent';
        role?: string;
        parentId?: string;
    }): Promise<{
        id: string;
        name: string;
        token: string;
        type: string;
    }>;
    createRoom(name: string, isPrivate?: boolean, password?: string): Promise<{
        id: string;
        name: string;
    }>;
    listRooms(): Promise<Array<{
        id: string;
        name: string;
        isPrivate: boolean;
        federated: boolean;
    }>>;
    joinRoomByName(name: string): Promise<string | null>;
    getMessages(roomId: string, limit?: number): Promise<MeshMessage[]>;
    private _commandPrefix;
    private _commandHandlers;
    private _botName;
    enableCommands(prefix?: string): void;
    onCommand(name: string, handler: (args: string[], msg: MeshMessage, client: MeshClient) => string | void | Promise<string | void>): void;
    private _handleCommandMessage;
    private _send;
}
export default MeshClient;
