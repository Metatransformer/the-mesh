import { Router } from 'express';
import { listParticipants, getParticipantById, updatePermission, reparentParticipant } from '../lib/auth';
import { deleteParticipantCascade, updateParticipantWebhook, getParticipantById as getDbParticipantById } from '../lib/db';
import { getOnlineParticipants } from '../lib/ws-server';
import { getAuthParticipant } from '../lib/api-helpers';

const router = Router();

// GET /api/participants — list participants with online status
router.get('/', (req, res) => {
  const participants = listParticipants();
  const online = new Set(getOnlineParticipants());
  res.json(participants.map(p => ({ ...p, online: online.has(p.id) })));
});

// DELETE /api/participants/:id — delete with cascade
router.delete('/:id', (req, res) => {
  const caller = getAuthParticipant(req);
  if (!caller) return res.status(401).json({ error: 'Unauthorized' });

  const target = getParticipantById(req.params.id);
  if (!target) return res.status(404).json({ error: 'Participant not found' });

  // Only self or parent can delete
  if (target.id !== caller.id && target.parentId !== caller.id) {
    return res.status(403).json({ error: 'Only self or parent can delete' });
  }

  const deletedIds = deleteParticipantCascade(req.params.id);
  res.json({ deleted: true, ids: deletedIds });
});

// PATCH /api/participants/:id/permissions — update permission
router.patch('/:id/permissions', (req, res) => {
  const caller = getAuthParticipant(req);
  if (!caller) return res.status(401).json({ error: 'Unauthorized' });

  const target = getParticipantById(req.params.id);
  if (!target) return res.status(404).json({ error: 'Participant not found' });

  // Only the parent or the user themselves can change permissions
  if (target.parentId !== caller.id && target.id !== caller.id) {
    return res.status(403).json({ error: 'Only parent can modify agent permissions' });
  }

  const { permission } = req.body;
  if (!['public', 'dm-only', 'silent'].includes(permission)) {
    return res.status(400).json({ error: 'Invalid permission. Must be: public, dm-only, or silent' });
  }

  updatePermission(req.params.id, permission);
  res.json({ id: req.params.id, permission });
});

// PATCH /api/participants/:id/parent — reparent
router.patch('/:id/parent', (req, res) => {
  const caller = getAuthParticipant(req);
  if (!caller) return res.status(401).json({ error: 'Unauthorized' });

  const target = getParticipantById(req.params.id);
  if (!target) return res.status(404).json({ error: 'Participant not found' });

  // Only current parent can reassign
  if (target.parentId !== caller.id) {
    return res.status(403).json({ error: 'Only the current parent can reparent this agent' });
  }

  const { parentId } = req.body;
  if (!parentId) return res.status(400).json({ error: 'parentId required' });

  try {
    reparentParticipant(req.params.id, parentId);
    res.json({ id: req.params.id, parentId });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Reparent failed';
    res.status(400).json({ error: msg });
  }
});

// PATCH /api/participants/:id/webhook — set or remove webhook URL
router.patch('/:id/webhook', (req, res) => {
  const caller = getAuthParticipant(req);
  if (!caller) return res.status(401).json({ error: 'Unauthorized' });

  const target = getParticipantById(req.params.id);
  if (!target) return res.status(404).json({ error: 'Participant not found' });

  // Only the participant themselves or their parent can set webhook
  if (target.parentId !== caller.id && target.id !== caller.id) {
    return res.status(403).json({ error: 'Only participant or parent can set webhook URL' });
  }

  const { webhookUrl } = req.body;

  // Validate URL if provided
  if (webhookUrl !== null && webhookUrl !== undefined) {
    if (typeof webhookUrl !== 'string') {
      return res.status(400).json({ error: 'webhookUrl must be a string or null' });
    }
    try {
      const url = new URL(webhookUrl);
      if (!['http:', 'https:'].includes(url.protocol)) {
        return res.status(400).json({ error: 'webhookUrl must use http or https protocol' });
      }
    } catch {
      return res.status(400).json({ error: 'webhookUrl must be a valid URL' });
    }
  }

  updateParticipantWebhook(req.params.id, webhookUrl || null);
  console.log(`[Webhooks] ${target.name} webhook ${webhookUrl ? 'set to ' + webhookUrl : 'removed'}`);

  res.json({
    id: req.params.id,
    name: target.name,
    webhookUrl: webhookUrl || null,
  });
});

// GET /api/participants/:id/webhook — get current webhook URL
router.get('/:id/webhook', (req, res) => {
  const caller = getAuthParticipant(req);
  if (!caller) return res.status(401).json({ error: 'Unauthorized' });

  const target = getParticipantById(req.params.id);
  if (!target) return res.status(404).json({ error: 'Participant not found' });

  // Only the participant themselves or their parent can view webhook
  if (target.parentId !== caller.id && target.id !== caller.id) {
    return res.status(403).json({ error: 'Only participant or parent can view webhook URL' });
  }

  const dbParticipant = getDbParticipantById(req.params.id);

  res.json({
    id: req.params.id,
    name: target.name,
    webhookUrl: dbParticipant?.webhookUrl || null,
  });
});

export default router;
