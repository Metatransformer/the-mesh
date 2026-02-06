import type { Request } from 'express';
import { getParticipantByToken } from './auth';
import type { Participant } from './types';

export function getAuthParticipant(req: Request): Participant | null {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return null;
  return getParticipantByToken(auth.slice(7));
}
