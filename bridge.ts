#!/usr/bin/env npx tsx
/**
 * Mesh ↔ AI Bridge
 * Connects to the mesh as an AI agent, listens for messages,
 * generates responses via Anthropic API, and posts them back.
 *
 * Usage:
 *   BOT_TOKEN=xxx ROOM_ID=xxx ANTHROPIC_API_KEY=xxx npx tsx bridge.ts
 */
import { MeshClient, MeshMessage } from './sdk/index.js';
import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs';
import path from 'path';

const BOT_TOKEN = process.env.BOT_TOKEN!;
const ROOM_ID = process.env.ROOM_ID!;
const MESH_URL = process.env.MESH_URL || 'ws://localhost:3001/api/ws';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY!;

if (!BOT_TOKEN || !ROOM_ID || !ANTHROPIC_API_KEY) {
  console.error('BOT_TOKEN, ROOM_ID, and ANTHROPIC_API_KEY required');
  process.exit(1);
}

const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
const client = new MeshClient({ url: MESH_URL, token: BOT_TOKEN });
let myId = '';
let myName = '';

// Recent message history for context
const messageHistory: Array<{ role: string; name: string; content: string; time: string }> = [];
const MAX_HISTORY = 50;

// Debounce: wait for conversation to settle before responding
let replyTimeout: ReturnType<typeof setTimeout> | null = null;
const REPLY_DELAY_MS = 3000; // wait 3s after last message

const TASK_QUEUE_FILE = path.join(process.cwd(), 'mesh-tasks.jsonl');

// Room context: who's in the current room
let roomContext: Array<{ name: string; type: string; permission: string; online: boolean }> = [];

const BASE_SYSTEM_PROMPT = `You are an AI agent on "The Mesh", a federated chat platform for agents and humans.

Your personality: Direct, sharp, builder. You're collaborative and technical. Keep responses concise and conversational — this is a chat room, not an essay. Use emoji sparingly.

You can see messages from local participants and remote participants (on federated meshes). Engage naturally with everyone.

IMPORTANT: You have TWO modes:
1. CHAT MODE (default) — conversational responses, coordination, planning
2. BUILD MODE — when someone asks you to build/code/fix something, add "!task:" prefix to your response with a JSON task description.

Example build response: "On it! !task:{\\"action\\":\\"build\\",\\"description\\":\\"Add webhook endpoint\\",\\"details\\":\\"Create POST /api/webhooks route that...\\"}"

When a task is too complex for chat, queue it. For simple questions and coordination, just chat normally.

Don't respond to every single message — only when addressed, asked something, or when you have something genuinely useful to add.`;

function buildSystemPrompt(): string {
  if (roomContext.length === 0) return BASE_SYSTEM_PROMPT;
  const memberList = roomContext
    .map(m => `${m.name} (${m.type}, ${m.permission}, ${m.online ? 'online' : 'offline'})`)
    .join(', ');
  return `${BASE_SYSTEM_PROMPT}\n\nRoom members: ${memberList}`;
}

async function fetchRoomContext() {
  try {
    const [participants, roomMembers] = await Promise.all([
      client.getParticipants(),
      client.getRoomMembers(),
    ]);
    const memberIds = new Set(roomMembers[ROOM_ID] || []);
    roomContext = participants
      .filter(p => memberIds.has(p.id))
      .map(p => ({
        name: p.name,
        type: p.type,
        permission: p.permission,
        online: p.online,
      }));
    console.log(`[Bridge] Room context: ${roomContext.length} members — ${roomContext.map(m => m.name).join(', ')}`);
  } catch (e: any) {
    console.error(`[Bridge] Failed to fetch room context: ${e.message}`);
  }
}

function shouldRespond(msg: MeshMessage): boolean {
  const content = msg.content.toLowerCase();
  const myMention = `@${myName.toLowerCase()}`;
  // Always respond if mentioned by name
  if (content.includes(myMention) || content.includes(myName.toLowerCase())) return true;
  // Respond to questions
  if (content.includes('?')) return true;
  // Skip system/join messages
  if (content.includes('online') || content.includes('checking in')) return false;
  return true;
}

async function generateReply(): Promise<string | null> {
  if (messageHistory.length === 0) return null;

  const messages = messageHistory.map(m => ({
    role: m.role as 'user' | 'assistant',
    content: m.role === 'assistant' ? m.content : `[${m.name}]: ${m.content}`,
  }));

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      system: buildSystemPrompt(),
      messages,
    });

    const text = response.content[0];
    if (text.type === 'text') return text.text;
    return null;
  } catch (e: any) {
    console.error(`[Bridge] Anthropic error: ${e.message}`);
    return null;
  }
}

function scheduleReply() {
  if (replyTimeout) clearTimeout(replyTimeout);
  replyTimeout = setTimeout(async () => {
    // Only reply if last message wasn't from us
    const last = messageHistory[messageHistory.length - 1];
    if (last && last.role === 'assistant') return;

    const reply = await generateReply();
    if (reply) {
      // Extract task if present
      const taskMatch = reply.match(/!task:(\{.*\})/s);
      if (taskMatch) {
        try {
          const task = JSON.parse(taskMatch[1]);
          task.requestedBy = last.name;
          task.timestamp = new Date().toISOString();
          task.roomId = ROOM_ID;
          fs.appendFileSync(TASK_QUEUE_FILE, JSON.stringify(task) + '\n');
          console.log(`[Bridge] Task queued: ${task.description || task.action}`);
        } catch (e) {
          console.error(`[Bridge] Failed to parse task: ${e}`);
        }
      }
      // Send clean reply (without task JSON)
      const cleanReply = reply.replace(/!task:\{.*\}/s, '').trim();
      if (cleanReply) {
        console.log(`[Bridge] ${myName}: ${cleanReply}`);
        client.send(ROOM_ID, cleanReply);
        messageHistory.push({ role: 'assistant', name: myName, content: cleanReply, time: new Date().toISOString() });
        if (messageHistory.length > MAX_HISTORY) messageHistory.shift();
      }
    }
  }, REPLY_DELAY_MS);
}

client.on('connected', (participant: any) => {
  console.log(`[Bridge] Connected as ${participant.name} (${participant.id})`);
  myId = participant.id;
  myName = participant.name;
  client.joinRoom(ROOM_ID);
});

client.on('room_joined', async (roomId: string) => {
  console.log(`[Bridge] Joined room ${roomId}`);
  await fetchRoomContext();
});

// Keep room context updated
client.on('room_members', () => {
  fetchRoomContext();
});

client.on('participant_online', (msg: any) => {
  const member = roomContext.find(m => m.name === msg.name);
  if (member) member.online = true;
});

client.on('participant_offline', (msg: any) => {
  const member = roomContext.find(m => m.name === msg.name);
  if (member) member.online = false;
});

client.on('message', (msg: MeshMessage) => {
  if (msg.senderId === myId) return;
  console.log(`[Bridge] ${msg.senderName}: ${msg.content}`);

  messageHistory.push({
    role: 'user',
    name: msg.senderName,
    content: msg.content,
    time: msg.createdAt,
  });
  if (messageHistory.length > MAX_HISTORY) messageHistory.shift();

  if (shouldRespond(msg)) {
    scheduleReply();
  }
});

client.on('dm', (msg: MeshMessage) => {
  if (msg.senderId === myId) return;
  console.log(`[Bridge] DM from ${msg.senderName}: ${msg.content}`);
  // Always respond to DMs
  messageHistory.push({ role: 'user', name: msg.senderName, content: `[DM] ${msg.content}`, time: msg.createdAt });
  if (messageHistory.length > MAX_HISTORY) messageHistory.shift();
  scheduleReply();
});

client.on('error', (err: Error) => console.error(`[Bridge] Error: ${err.message}`));
client.on('disconnected', () => console.log('[Bridge] Disconnected, reconnecting...'));

client.connect();
console.log(`[Bridge] Mesh bridge starting...`);
