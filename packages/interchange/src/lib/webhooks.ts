/**
 * Webhook notification system for the mesh.
 * POSTs to participant webhookUrls when they're @mentioned.
 */

import { getParticipantsWithWebhook, getParticipantByName, type DbParticipant } from './db';
import type { Message } from './types';

interface WebhookPayload {
  type: 'mention';
  message: Message;
  mentionedParticipantId: string;
  mentionedParticipantName: string;
  roomId: string;
  roomName?: string;
  timestamp: string;
}

interface WebhookResult {
  participantId: string;
  participantName: string;
  webhookUrl: string;
  success: boolean;
  statusCode?: number;
  error?: string;
}

/**
 * Extract @mentions from message content.
 * Matches @username patterns (alphanumeric, dash, underscore).
 */
export function extractMentions(content: string): string[] {
  const mentionRegex = /@([\w-]+)/g;
  const mentions: string[] = [];
  let match;
  while ((match = mentionRegex.exec(content)) !== null) {
    mentions.push(match[1]); // Just the name without @
  }
  return [...new Set(mentions)]; // Deduplicate
}

/**
 * Find participants who are mentioned and have webhookUrls configured.
 */
export function findMentionedParticipantsWithWebhooks(content: string): DbParticipant[] {
  const mentions = extractMentions(content);
  if (mentions.length === 0) return [];

  const participantsWithWebhooks = getParticipantsWithWebhook();

  return participantsWithWebhooks.filter(p =>
    mentions.some(mention =>
      mention.toLowerCase() === p.name.toLowerCase()
    )
  );
}

/**
 * Send webhook notification to a participant.
 */
async function sendWebhook(
  participant: DbParticipant,
  message: Message,
  roomName?: string
): Promise<WebhookResult> {
  const result: WebhookResult = {
    participantId: participant.id,
    participantName: participant.name,
    webhookUrl: participant.webhookUrl!,
    success: false,
  };

  const payload: WebhookPayload = {
    type: 'mention',
    message,
    mentionedParticipantId: participant.id,
    mentionedParticipantName: participant.name,
    roomId: message.roomId,
    roomName,
    timestamp: new Date().toISOString(),
  };

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

    const response = await fetch(participant.webhookUrl!, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Mesh-Event': 'mention',
        'X-Mesh-Participant-Id': participant.id,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    result.statusCode = response.status;
    result.success = response.ok;

    if (!response.ok) {
      result.error = `HTTP ${response.status}`;
    }
  } catch (err: any) {
    result.error = err.name === 'AbortError' ? 'Timeout' : err.message;
  }

  return result;
}

/**
 * Process a message and send webhooks to all mentioned participants.
 * Called after a message is saved to the room.
 */
export async function notifyMentionedParticipants(
  message: Message,
  roomName?: string
): Promise<WebhookResult[]> {
  const mentionedParticipants = findMentionedParticipantsWithWebhooks(message.content);

  if (mentionedParticipants.length === 0) {
    return [];
  }

  console.log(`[Webhooks] Found ${mentionedParticipants.length} mentioned participants with webhooks`);

  // Send webhooks in parallel
  const results = await Promise.all(
    mentionedParticipants.map(p => sendWebhook(p, message, roomName))
  );

  // Log results
  for (const result of results) {
    if (result.success) {
      console.log(`[Webhooks] Notified ${result.participantName} at ${result.webhookUrl}`);
    } else {
      console.log(`[Webhooks] Failed to notify ${result.participantName}: ${result.error}`);
    }
  }

  return results;
}
