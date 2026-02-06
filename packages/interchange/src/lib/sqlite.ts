import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = path.join(process.cwd(), 'mesh.db.sqlite');

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!_db) {
    _db = new Database(DB_PATH);
    _db.pragma('journal_mode = WAL');
    _db.pragma('foreign_keys = ON');
    initSchema(_db);
  }
  return _db;
}

function initSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS participants (
      id TEXT PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('user','agent')),
      token TEXT UNIQUE NOT NULL,
      role TEXT,
      parentId TEXT REFERENCES participants(id),
      permission TEXT NOT NULL DEFAULT 'public',
      webhookUrl TEXT,
      createdAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS rooms (
      id TEXT PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      isPrivate INTEGER NOT NULL DEFAULT 0,
      passwordHash TEXT,
      adminId TEXT NOT NULL REFERENCES participants(id),
      federated INTEGER NOT NULL DEFAULT 0,
      posX REAL,
      posZ REAL,
      createdAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS room_members (
      roomId TEXT NOT NULL REFERENCES rooms(id),
      participantId TEXT NOT NULL REFERENCES participants(id),
      invitedBy TEXT REFERENCES participants(id),
      PRIMARY KEY (roomId, participantId)
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      roomId TEXT REFERENCES rooms(id),
      senderId TEXT NOT NULL,
      senderName TEXT NOT NULL,
      content TEXT NOT NULL,
      isDm INTEGER NOT NULL DEFAULT 0,
      recipientId TEXT,
      createdAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS federation_queue (
      id TEXT PRIMARY KEY,
      targetMesh TEXT NOT NULL,
      messagePayload TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      retryCount INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL,
      lastAttempt TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_messages_roomId ON messages(roomId);
    CREATE INDEX IF NOT EXISTS idx_messages_createdAt ON messages(createdAt);
    CREATE INDEX IF NOT EXISTS idx_room_members_participantId ON room_members(participantId);
    CREATE INDEX IF NOT EXISTS idx_federation_queue_status ON federation_queue(status);
  `);
}
