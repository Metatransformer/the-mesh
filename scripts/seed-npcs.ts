/**
 * Seed test NPCs into The Mesh
 *
 * Usage: npx tsx scripts/seed-npcs.ts [parentToken]
 *
 * If parentToken is not provided, a new user "Nick" will be created to serve as parent.
 * Requires the dev server to be running on localhost:3000.
 */

const BASE = 'http://localhost:3000';

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

async function ensureRoom(name: string, token: string): Promise<string> {
  // List rooms and find by name
  const rooms = await api('/api/rooms', 'GET', undefined, token) as { id: string; name: string }[];
  const existing = rooms.find(r => r.name === name);
  if (existing) {
    console.log(`  Room "${name}" already exists (${existing.id})`);
    return existing.id;
  }

  const room = await api('/api/rooms', 'POST', { name, isPrivate: false }, token) as { id: string };
  console.log(`  Created room "${name}" (${room.id})`);
  return room.id;
}

async function registerAgent(
  name: string,
  parentId: string,
  role: string,
  parentToken: string,
): Promise<RegResponse> {
  try {
    const agent = await api('/api/auth/register', 'POST', {
      name,
      type: 'agent',
      role,
      parentId,
    }) as RegResponse;
    console.log(`  Registered agent "${name}" (${agent.id})`);
    return agent;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('Name already taken')) {
      console.log(`  Agent "${name}" already exists, skipping`);
      // Need to find existing agent to get its ID and token
      const participants = await api('/api/participants', 'GET') as { id: string; name: string }[];
      const existing = participants.find(p => p.name === name);
      if (!existing) throw new Error(`Agent "${name}" exists but not found in participants`);
      return { id: existing.id, name: existing.name, token: '', type: 'agent' };
    }
    throw e;
  }
}

async function main() {
  const parentToken = process.argv[2];

  console.log('=== The Mesh NPC Seeder ===\n');

  // Step 1: Get or create parent user
  let parentId: string;
  let token: string;

  if (parentToken) {
    token = parentToken;
    // Validate token by listing rooms (authenticated)
    try {
      await api('/api/rooms', 'GET', undefined, token);
    } catch {
      console.error('Invalid parent token. Please provide a valid token.');
      process.exit(1);
    }
    // Get participant info from participants list - we need parentId
    // Register a throwaway to test, or just use the participants endpoint
    const participants = await api('/api/participants', 'GET') as { id: string; name: string }[];
    // We can't know which one we are from the list alone, so let's connect via WS briefly
    // Instead, just use the first user as parent for simplicity
    console.log('Using provided token for parent user');
    // We'll get the ID by registering a dummy - actually let's just read from the DB
    // Simpler: register with the token as auth and read /api/rooms/members
    const members = await api('/api/rooms/members', 'GET', undefined, token) as Record<string, string[]>;
    const allIds = new Set(Object.values(members).flat());
    // Match against participants
    const userParticipants = participants.filter(p => allIds.has(p.id));
    parentId = userParticipants[0]?.id || participants[0]?.id;
    console.log(`Parent ID: ${parentId}`);
  } else {
    console.log('No token provided. Creating parent user "SeedAdmin"...');
    try {
      const user = await api('/api/auth/register', 'POST', {
        name: 'SeedAdmin',
        type: 'user',
      }) as RegResponse;
      parentId = user.id;
      token = user.token;
      console.log(`  Created user "SeedAdmin" (${parentId}), token: ${token}`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('Name already taken')) {
        console.error('SeedAdmin already exists. Please provide its token as argument.');
        process.exit(1);
      }
      throw e;
    }
  }

  // Step 2: Ensure rooms exist
  console.log('\nCreating rooms...');
  const generalId = await ensureRoom('general', token);
  const securityId = await ensureRoom('security', token);
  const loungeId = await ensureRoom('lounge', token);

  // Step 3: Register agents
  console.log('\nRegistering agents...');
  const sentinel = await registerAgent('Sentinel', parentId, 'Security monitor — watches all channels', token);
  const echo = await registerAgent('Echo', parentId, 'Echo bot — repeats what it hears', token);
  const shadow = await registerAgent('Shadow', parentId, 'Shadow agent — DMs only', token);
  const mute = await registerAgent('Mute', parentId, 'Silent observer — no messages', token);

  // Step 4: Set permissions
  console.log('\nSetting permissions...');
  const permUpdates = [
    { id: sentinel.id, permission: 'public' },
    { id: echo.id, permission: 'public' },
    { id: shadow.id, permission: 'dm-only' },
    { id: mute.id, permission: 'silent' },
  ];

  for (const { id, permission } of permUpdates) {
    try {
      await api(`/api/participants/${id}/permissions`, 'PATCH', { permission }, token);
      console.log(`  Set ${id} → ${permission}`);
    } catch (e: unknown) {
      console.log(`  Permission update for ${id} failed (may need parent token): ${e instanceof Error ? e.message : e}`);
    }
  }

  // Step 5: Join rooms
  console.log('\nJoining agents to rooms...');
  const roomJoins = [
    // Sentinel: general + security
    { agentToken: sentinel.token, agentId: sentinel.id, rooms: [generalId, securityId] },
    // Echo: general only
    { agentToken: echo.token, agentId: echo.id, rooms: [generalId] },
    // Shadow: general only
    { agentToken: shadow.token, agentId: shadow.id, rooms: [generalId] },
    // Mute: general only
    { agentToken: mute.token, agentId: mute.id, rooms: [generalId] },
  ];

  for (const { agentToken, agentId, rooms } of roomJoins) {
    for (const roomId of rooms) {
      try {
        // Use the agent's own token to join, or fall back to parent token
        const joinToken = agentToken || token;
        await api(`/api/rooms/${roomId}/join`, 'POST', {}, joinToken);
        console.log(`  ${agentId} joined room ${roomId}`);
      } catch (e: unknown) {
        console.log(`  Join failed for ${agentId} → ${roomId}: ${e instanceof Error ? e.message : e}`);
      }
    }
  }

  // Also join parent to lounge and security
  console.log('\nJoining parent to all rooms...');
  for (const roomId of [generalId, securityId, loungeId]) {
    try {
      await api(`/api/rooms/${roomId}/join`, 'POST', {}, token);
      console.log(`  Parent joined ${roomId}`);
    } catch (e: unknown) {
      console.log(`  Parent join ${roomId}: ${e instanceof Error ? e.message : e}`);
    }
  }

  console.log('\n=== Seeding complete! ===');
  console.log('Agents: Sentinel (public, general+security), Echo (public, general), Shadow (dm-only, general), Mute (silent, general)');
  console.log('Rooms: general, security, lounge');
}

main().catch((e) => {
  console.error('Seed failed:', e);
  process.exit(1);
});
