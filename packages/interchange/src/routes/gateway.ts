import { Router } from 'express';
import { getFederationConfig, getOnlineMeshes, getRemoteParticipants, getGatewayHttpUrl } from '../lib/federation';

const router = Router();

// GET /api/gateway/status
router.get('/status', (req, res) => {
  res.json(getFederationConfig());
});

// GET /api/gateway/instances
router.get('/instances', async (req, res) => {
  try {
    const instances = await getOnlineMeshes();
    res.json(instances);
  } catch {
    res.status(500).json([]);
  }
});

// GET /api/gateway/participants
router.get('/participants', (req, res) => {
  res.json(getRemoteParticipants());
});

// POST /api/gateway/register
router.post('/register', async (req, res) => {
  const meshId = process.env.MESH_ID;
  const meshSecret = process.env.MESH_SECRET;

  if (!meshId || !meshSecret) {
    return res.status(400).json({ error: 'MESH_ID and MESH_SECRET not configured' });
  }

  const name = req.body?.name || meshId;
  const gatewayHttp = getGatewayHttpUrl();

  try {
    const response = await fetch(`${gatewayHttp}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ meshId, secret: meshSecret, name }),
    });
    const data = await response.json();
    res.status(response.status).json(data);
  } catch {
    res.status(502).json({ error: `Failed to reach gateway at ${gatewayHttp}` });
  }
});

export default router;
