/**
 * P2P Web Share
 */
const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const app = express();

// ── CORS ──────────────────────────────────────────────────────────────────────
const rawOrigin = process.env.CLIENT_URL || 'http://localhost:3000';
const ALLOWED_ORIGINS = [rawOrigin, rawOrigin.replace(/\/$/, '')];

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    const clean = origin.replace(/\/$/, '');
    if (ALLOWED_ORIGINS.some(o => o.replace(/\/$/, '') === clean)) {
      return callback(null, true);
    }
    callback(new Error(`CORS: origin ${origin} not allowed`));
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  credentials: true,
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(express.json());

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'P2P Web Share Signaling Server',
    activeRooms: rooms.size,
    timestamp: new Date().toISOString(),
  });
});

// ── HTTP + Socket.io ──────────────────────────────────────────────────────────
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: corsOptions,
  maxHttpBufferSize: 1e6,
  transports: ['websocket', 'polling'],
});

// ── In-memory room store ──────────────────────────────────────────────────────
const rooms = new Map();
const MAX_PEERS = 2;

function getRoomPeer(roomId, excludeId) {
  const room = rooms.get(roomId);
  if (!room) return null;
  for (const id of room.sockets) {
    if (id !== excludeId) return id;
  }
  return null;
}

function cleanupRoom(roomId, socketId) {
  const room = rooms.get(roomId);
  if (!room) return;
  room.sockets.delete(socketId);
  if (room.sockets.size === 0) {
    rooms.delete(roomId);
    console.log(`[room] Deleted empty room ${roomId}`);
  }
}

// ── Socket events ─────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`[connect] ${socket.id}`);

  socket.on('create-room', (roomId) => {
    if (!roomId || typeof roomId !== 'string' || roomId.length > 64) {
      socket.emit('error', { message: 'Invalid room ID.' });
      return;
    }
    if (rooms.has(roomId)) {
      socket.emit('error', { message: 'Room already exists. Please refresh and try again.' });
      return;
    }
    rooms.set(roomId, { sockets: new Set([socket.id]), createdAt: new Date() });
    socket.join(roomId);
    socket.data.roomId = roomId;
    socket.data.role = 'sender';
    socket.emit('room-created', { roomId });
    console.log(`[room] Created ${roomId}`);
  });

  socket.on('join-room', (roomId) => {
    if (!roomId || typeof roomId !== 'string') {
      socket.emit('error', { message: 'Invalid room ID.' });
      return;
    }
    const room = rooms.get(roomId);
    if (!room) {
      socket.emit('error', { message: 'Room not found. The link may have expired.' });
      return;
    }
    if (room.sockets.size >= MAX_PEERS) {
      socket.emit('error', { message: 'Room is full. Only two peers allowed.' });
      return;
    }
    room.sockets.add(socket.id);
    socket.join(roomId);
    socket.data.roomId = roomId;
    socket.data.role = 'receiver';
    
    const senderId = getRoomPeer(roomId, socket.id);
    if (senderId) io.to(senderId).emit('peer-joined', { peerId: socket.id });
    socket.emit('room-joined', { roomId });
    console.log(`[room] ${socket.id} joined ${roomId}`);
  });

  socket.on('offer', ({ roomId, offer }) => {
    const peer = getRoomPeer(roomId, socket.id);
    if (peer) io.to(peer).emit('offer', { offer, from: socket.id });
  });

  socket.on('answer', ({ roomId, answer }) => {
    const peer = getRoomPeer(roomId, socket.id);
    if (peer) io.to(peer).emit('answer', { answer, from: socket.id });
  });

  socket.on('ice-candidate', ({ roomId, candidate }) => {
    const peer = getRoomPeer(roomId, socket.id);
    if (peer) io.to(peer).emit('ice-candidate', { candidate, from: socket.id });
  });

  socket.on('disconnecting', () => {
    const roomId = socket.data.roomId;
    if (!roomId) return;
    const peer = getRoomPeer(roomId, socket.id);
    if (peer) io.to(peer).emit('peer-disconnected', { message: 'The other peer has disconnected.' });
    cleanupRoom(roomId, socket.id);
    console.log(`[disconnect] ${socket.id} left room ${roomId}`);
  });

  socket.on('disconnect', () => console.log(`[disconnect] ${socket.id}`));
});

// ── Stale room cleanup every 5 minutes ────────────────────────────────────────
setInterval(() => {
  const cutoff = Date.now() - 30 * 60 * 1000;
  for (const [roomId, room] of rooms.entries()) {
    if (room.createdAt.getTime() < cutoff) {
      rooms.delete(roomId);
      console.log(`[cleanup] Stale room ${roomId} removed`);
    }
  }
}, 5 * 60 * 1000);

const PORT = process.env.PORT || 4000;
httpServer.listen(PORT, () => {
  console.log(`Signaling server on port ${PORT}`);
  console.log(`Allowing origins: ${ALLOWED_ORIGINS.join(', ')}`);
});