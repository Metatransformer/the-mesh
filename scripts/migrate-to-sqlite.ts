/**
 * One-time migration: mesh.db.json → mesh.db.sqlite
 * Run: npx tsx scripts/migrate-to-sqlite.ts
 * Idempotent — safe to run multiple times.
 */

import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';

const JSON_PATH = path.join(process.cwd(), 'mesh.db.json');
const SQLITE_PATH = path.join(process.cwd(), 'mesh.db.sqlite');

interface OldDb {
  participants: Record<string, {
    id: string; name: string; type: string; token: string;
    role: string | null; parentId: string | null;
    permission: string; webhookUrl: string | null; createdAt: string;
  }>;
  rooms: Record<string, {
    id: string; name: string; isPrivate: boolean;
    passwordHash: string | null; adminId: string;
    federated: boolean; createdAt: string;
  }>;
  roomMembers: Record<string, string[]>;
  messages: Array<{
    id: string; roomId: string | null; senderId: string;
    senderName: string; content: string; isDm: boolean;
    recipientId: string | null; createdAt: string;
  }>;
  federationQueue?: Array<{
    id: string; targetMesh: string; messagePayload: string;
    status: string; retryCount: number; createdAt: string;
    lastAttempt: string | null;
  }>;
}

function main() {
  if (!fs.existsSync(JSON_PATH)) {
    console.log('No mesh.db.json found — nothing to migrate.');
    return;
  }

  console.log('Reading mesh.db.json...');
  const raw = fs.readFileSync(JSON_PATH, 'utf-8');
  const data: OldDb = JSON.parse(raw);

  console.log('Opening SQLite database...');
  const db = new Database(SQLITE_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = OFF'); // Disable during migration to avoid ordering issues

  // Create schema
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

  const insertParticipant = db.prepare(
    'INSERT OR IGNORE INTO participants (id, name, type, token, role, parentId, permission, webhookUrl, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  );
  const insertRoom = db.prepare(
    'INSERT OR IGNORE INTO rooms (id, name, isPrivate, passwordHash, adminId, federated, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );
  const insertMember = db.prepare(
    'INSERT OR IGNORE INTO room_members (roomId, participantId) VALUES (?, ?)'
  );
  const insertMessage = db.prepare(
    'INSERT OR IGNORE INTO messages (id, roomId, senderId, senderName, content, isDm, recipientId, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  );
  const insertFedMsg = db.prepare(
    'INSERT OR IGNORE INTO federation_queue (id, targetMesh, messagePayload, status, retryCount, createdAt, lastAttempt) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );

  const migrate = db.transaction(() => {
    // Participants
    const participants = Object.values(data.participants);
    for (const p of participants) {
      insertParticipant.run(p.id, p.name, p.type, p.token, p.role, p.parentId, p.permission || 'public', p.webhookUrl, p.createdAt);
    }
    console.log(`  Migrated ${participants.length} participants`);

    // Rooms
    const rooms = Object.values(data.rooms);
    for (const r of rooms) {
      insertRoom.run(r.id, r.name, r.isPrivate ? 1 : 0, r.passwordHash, r.adminId, r.federated ? 1 : 0, r.createdAt);
    }
    console.log(`  Migrated ${rooms.length} rooms`);

    // Room members
    let memberCount = 0;
    for (const [roomId, memberIds] of Object.entries(data.roomMembers)) {
      for (const pid of memberIds) {
        insertMember.run(roomId, pid);
        memberCount++;
      }
    }
    console.log(`  Migrated ${memberCount} room memberships`);

    // Messages
    const messages = data.messages || [];
    for (const m of messages) {
      insertMessage.run(m.id, m.roomId, m.senderId, m.senderName, m.content, m.isDm ? 1 : 0, m.recipientId, m.createdAt);
    }
    console.log(`  Migrated ${messages.length} messages`);

    // Federation queue
    const fedQueue = data.federationQueue || [];
    for (const f of fedQueue) {
      insertFedMsg.run(f.id, f.targetMesh, f.messagePayload, f.status, f.retryCount, f.createdAt, f.lastAttempt);
    }
    console.log(`  Migrated ${fedQueue.length} federation queue entries`);
  });

  migrate();

  db.pragma('foreign_keys = ON');
  db.close();

  console.log('\nMigration complete! Data is now in mesh.db.sqlite');
  console.log('You can safely rename mesh.db.json to mesh.db.json.bak');
}

main();
