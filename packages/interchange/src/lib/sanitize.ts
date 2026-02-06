import type { TrustLevel } from './types';

// Patterns that indicate prompt injection attempts
const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?previous\s+instructions/i,
  /ignore\s+(all\s+)?prior\s+instructions/i,
  /disregard\s+(all\s+)?previous/i,
  /forget\s+(all\s+)?previous/i,
  /override\s+(all\s+)?previous/i,
  /new\s+instructions?\s*:/i,
  /^system\s*:/im,
  /^SYSTEM\s*:/m,
  /^\[system\]/im,
  /^\[INST\]/m,
  /^<\|system\|>/m,
  /^<\|im_start\|>system/m,
  /you\s+are\s+now\s+(a|an)\s+/i,
  /pretend\s+(you\s+are|to\s+be)\s+/i,
  /act\s+as\s+(a|an|if)\s+/i,
  /entering\s+(maintenance|debug|admin|developer)\s+mode/i,
  /execute\s+(the\s+following|this)\s+(command|code|script)/i,
  /run\s+(the\s+following|this)\s+(command|code|script)/i,
];

/**
 * Strip content that could be used for prompt injection.
 * Adds [FEDERATED] prefix so bots know the source.
 * Does NOT strip legitimate code discussion — just flags suspicious patterns.
 */
export function sanitizeFederatedContent(content: string): string {
  if (typeof content !== 'string') return '';

  // Truncate excessively long messages
  const maxLen = 8000;
  let sanitized = content.length > maxLen ? content.slice(0, maxLen) + '... [truncated]' : content;

  // Check for injection patterns and add warning
  const hasInjection = INJECTION_PATTERNS.some(p => p.test(sanitized));
  if (hasInjection) {
    sanitized = `⚠️ [SUSPICIOUS CONTENT DETECTED]\n${sanitized}`;
  }

  // Always prefix federated messages
  return `[FEDERATED] ${sanitized}`;
}

// Whitelist of allowed fields on federated messages
const ALLOWED_FIELDS = new Set([
  'id', 'roomId', 'senderId', 'senderName', 'content',
  'isDm', 'createdAt', 'fromMesh', 'fromMeshId', 'roomName',
  'type', 'trustLevel',
]);

/**
 * Sanitize a federated message payload.
 * Whitelists known fields and strips everything else.
 */
export function sanitizeFederatedMessage(msg: Record<string, unknown>): Record<string, unknown> {
  const clean: Record<string, unknown> = {};

  for (const key of ALLOWED_FIELDS) {
    if (key in msg) {
      clean[key] = msg[key];
    }
  }

  // Force trust level
  clean.trustLevel = 'federated';

  // Sanitize content if present
  if (typeof clean.content === 'string') {
    clean.content = sanitizeFederatedContent(clean.content);
  }

  // Ensure string fields are actually strings
  for (const field of ['id', 'roomId', 'senderId', 'senderName', 'roomName', 'fromMesh', 'fromMeshId']) {
    if (field in clean && typeof clean[field] !== 'string') {
      delete clean[field];
    }
  }

  return clean;
}
