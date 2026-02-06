#!/usr/bin/env tsx
/**
 * Cascade-delete a user and all sub-agents by name.
 * Usage: npx tsx scripts/cleanup-user.ts <name>
 */
import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = path.join(process.cwd(), 'mesh.db.sqlite');

function main() {
  const name = process.argv[2];
  if (!name) {
    console.error('Usage: npx tsx scripts/cleanup-user.ts <name>');
    process.exit(1);
  }

  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = OFF'); // disable FK during cascade delete

  const target = db.prepare('SELECT id, name, type FROM participants WHERE name = ?').get(name) as
    | { id: string; name: string; type: string }
    | undefined;

  if (!target) {
    console.error(`Participant "${name}" not found.`);
    process.exit(1);
  }

  // Collect all descendants recursively
  function collectDescendants(parentId: string): { id: string; name: string }[] {
    const children = db.prepare('SELECT id, name FROM participants WHERE parentId = ?').all(parentId) as { id: string; name: string }[];
    const result: { id: string; name: string }[] = [];
    for (const child of children) {
      result.push(...collectDescendants(child.id));
      result.push(child);
    }
    return result;
  }

  const descendants = collectDescendants(target.id);
  const allToDelete = [...descendants, { id: target.id, name: target.name }];

  console.log(`Deleting ${allToDelete.length} participant(s):`);
  for (const p of allToDelete) {
    console.log(`  - ${p.name} (${p.id})`);
  }

  const del = db.transaction(() => {
    for (const p of allToDelete) {
      const msgs = db.prepare('DELETE FROM messages WHERE senderId = ?').run(p.id);
      const members = db.prepare('DELETE FROM room_members WHERE participantId = ?').run(p.id);
      db.prepare('DELETE FROM participants WHERE id = ?').run(p.id);
      if (msgs.changes || members.changes) {
        console.log(`    ${p.name}: ${msgs.changes} msgs, ${members.changes} memberships removed`);
      }
    }
  });

  del();
  console.log('Done.');
  db.close();
}

main();
