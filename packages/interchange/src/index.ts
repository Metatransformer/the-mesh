import path from 'path';
import dotenv from 'dotenv';

// Load .env.local from project root (cwd when run via pnpm from monorepo root)
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

import express from 'express';
import cors from 'cors';
import http from 'http';
import { handleUpgrade } from './lib/ws-server';
import { connectToGateway } from './lib/federation';

import authRouter from './routes/auth';
import participantsRouter from './routes/participants';
import roomsRouter from './routes/rooms';
import gatewayRouter from './routes/gateway';
import webhooksRouter from './routes/webhooks';

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Mount routes
app.use('/api/auth', authRouter);
app.use('/api/participants', participantsRouter);
app.use('/api/rooms', roomsRouter);
app.use('/api/gateway', gatewayRouter);
app.use('/api/webhooks', webhooksRouter);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'interchange' });
});

// Create HTTP server
const server = http.createServer(app);

// WebSocket upgrade handler
server.on('upgrade', (req, socket, head) => {
  const { pathname } = new URL(req.url || '/', `http://${req.headers.host}`);
  if (pathname === '/api/ws') {
    handleUpgrade(req, socket as import('net').Socket, head);
  } else {
    socket.destroy();
  }
});

// Connect to federation gateway if configured
if (process.env.MESH_ID) {
  connectToGateway();
}

// Start listening
const port = parseInt(process.env.INTERCHANGE_PORT || process.env.PORT || '3001', 10);
server.listen(port, () => {
  console.log(`[Interchange] Listening on port ${port}`);
  console.log(`[Interchange] API: http://localhost:${port}/api`);
  console.log(`[Interchange] WebSocket: ws://localhost:${port}/api/ws`);
});
