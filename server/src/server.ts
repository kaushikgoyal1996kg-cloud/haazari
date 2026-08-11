import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { RoomManager } from './rooms/roomManager.js';
import { registerSocketHandlers } from './websocket/socketHandlers.js';
import { GAME_RULES } from './game/rules.js';

const PORT = Number(process.env.PORT ?? 3001);
const CORS_ORIGIN = process.env.CORS_ORIGIN ?? '*';

// Safety: TEST_MODE must never be on in a deployed server (Section 43).
if (GAME_RULES.TEST_MODE && process.env.NODE_ENV === 'production') {
  throw new Error('GAME_RULES.TEST_MODE must be false in production.');
}

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: CORS_ORIGIN, methods: ['GET', 'POST'] },
  // Slightly above Socket.IO's 1MB default to comfortably fit base64-encoded
  // voice notes (capped at ~700KB in socketHandlers.ts) plus room for
  // ordinary message overhead.
  maxHttpBufferSize: 2 * 1024 * 1024,
});

const rooms = new RoomManager();

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'haazari-server' });
});

registerSocketHandlers(io, rooms);

// Periodically clean up rooms nobody has reconnected to.
setInterval(() => rooms.sweepStaleRooms(), 60_000).unref();

httpServer.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Haazari server listening on :${PORT}`);
});
