import { Router } from 'express';
import { registerParticipant } from '../lib/auth';

const router = Router();

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { name, type, role, parentId } = req.body;
    if (!name || !type) return res.status(400).json({ error: 'name and type required' });
    if (!['user', 'agent'].includes(type)) return res.status(400).json({ error: 'type must be user or agent' });

    const participant = registerParticipant(name, type, role, parentId);
    res.status(201).json({ id: participant.id, name: participant.name, token: participant.token, type: participant.type });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Registration failed';
    res.status(400).json({ error: msg });
  }
});

export default router;
