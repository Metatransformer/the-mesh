/**
 * Seed NPC bots under a parent agent.
 *
 * Usage: PARENT_NAME=my-bot npx tsx scripts/seed-agent-npcs.ts
 *
 * Requires the dev server to be running on localhost:3001.
 * The parent agent must already exist in the database.
 */

const BASE = 'http://localhost:3001';
const PARENT_NAME = process.env.PARENT_NAME || '';

interface Participant {
  id: string;
  name: string;
  type: string;
  parentId?: string;
}

interface RegResponse {
  id: string;
  name: string;
  token: string;
  type: string;
}

async function api(path: string, method: string, body?: unknown, token?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(`${method} ${path} failed (${res.status}): ${JSON.stringify(data)}`);
  }
  return data;
}

async function main() {
  if (!PARENT_NAME) {
    console.error('Set PARENT_NAME env var to the name of the parent agent');
    process.exit(1);
  }

  console.log(`=== NPC Seeder (parent: ${PARENT_NAME}) ===\n`);

  // Step 1: Find parent
  const participants = await api('/api/participants', 'GET') as Participant[];
  const parent = participants.find(p => p.name === PARENT_NAME);
  if (!parent) {
    console.error(`Parent "${PARENT_NAME}" not found. Register the agent first.`);
    process.exit(1);
  }
  console.log(`Found parent: ${parent.id}`);

  // We need the parent's token to register agents under it.
  // Since we can't get it from the API, use direct DB access.
  const { getParticipantById } = await import('../packages/interchange/src/lib/db');
  const parentFull = getParticipantById(parent.id);
  if (!parentFull) {
    console.error('Could not load parent from DB');
    process.exit(1);
  }
  const parentToken = parentFull.token;
  console.log('Got parent token from DB\n');

  // Step 2: Register new agents under parent
  console.log('\nRegistering sub-agents...');
  const agents = [
    { name: 'Probe', role: 'Scout — explores rooms and reports activity', permission: 'public' },
    { name: 'Whisper', role: 'DM specialist — private communications only', permission: 'dm-only' },
    { name: 'Aegis', role: 'Security monitor — watches for threats', permission: 'public' },
  ];

  const registered: RegResponse[] = [];
  for (const agent of agents) {
    try {
      const result = await api('/api/auth/register', 'POST', {
        name: agent.name,
        type: 'agent',
        role: agent.role,
        parentId: parent.id,
      }) as RegResponse;
      console.log(`  Registered "${agent.name}" (${result.id})`);
      registered.push(result);

      // Set permission
      await api(`/api/participants/${result.id}/permissions`, 'PATCH', {
        permission: agent.permission,
      }, parentToken);
      console.log(`    Permission: ${agent.permission}`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('Name already taken')) {
        console.log(`  "${agent.name}" already exists, skipping`);
        const existing = participants.find(p => p.name === agent.name);
        if (existing) registered.push({ id: existing.id, name: existing.name, token: '', type: 'agent' });
      } else {
        console.error(`  Failed to register "${agent.name}": ${msg}`);
      }
    }
  }

  // Step 3: Join agents to rooms
  console.log('\nJoining agents to rooms...');
  const rooms = await api('/api/rooms', 'GET', undefined, parentToken) as { id: string; name: string }[];

  for (const agent of registered) {
    for (const room of rooms) {
      try {
        const joinToken = agent.token || parentToken;
        await api(`/api/rooms/${room.id}/join`, 'POST', {}, joinToken);
        console.log(`  ${agent.name} joined "${room.name}"`);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        if (!msg.includes('already')) {
          console.log(`  ${agent.name} join "${room.name}" failed: ${msg}`);
        }
      }
    }
  }

  console.log('\n=== NPC seeding complete! ===');
  console.log(`Agents under ${PARENT_NAME}:`);
  for (const agent of agents) {
    const reg = registered.find(r => r.name === agent.name);
    console.log(`  ${agent.name} (${reg?.id || '?'}) — ${agent.role} [${agent.permission}]`);
  }
}

main().catch((e) => {
  console.error('Seed failed:', e);
  process.exit(1);
});
