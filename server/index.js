/**
 * P2P Web Share — Signaling Server
 *
 * This server's ONLY job is to relay WebRTC handshake messages (offers, answers,
 * ICE candidates) between two peers in the same room. It NEVER sees, reads,
 * stores, or processes any file data — not even a single byte.
 *
 * Flow:
 *   1. Sender calls create-room  → server creates room, sender waits
 *   2. Receiver calls join-room  → server notifies sender via peer-joined
 *   3. Sender sends offer        → server relays to receiver
 *   4. Receiver sends answer     → server relays to sender
 *   5. Both exchange ICE candidates via server
 *   6. WebRTC P2P connection established — server is done
 */

const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();

// ─── CORS ───────────────────────────────────────────────────────────────────
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:3000';

app.use(cors({ origin: CLIENT_URL, methods: ['GET', 'POST'] }));
app.use(express.json());

// ─── Health check ────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    service: 'P2P Web Share Signaling Server',
    rooms: rooms.size,
    timestamp: new Date().toISOString(),
  });
});

// ─── HTTP + Socket.io ────────────────────────────────────────────────────────
const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: CLIENT_URL,
    methods: ['GET', 'POST'],
  },
  // Allow larger payloads for SDP (rarely needed but safe)
  maxHttpBufferSize: 1e6,
});

// ─── In-memory room store ────────────────────────────────────────────────────
// roomId → { sockets: Set<socketId>, createdAt: Date }
const rooms = new Map();

const MAX_PEERS_PER_ROOM = 2;

// ─── Helpers ─────────────────────────────────────────────────────────────────
function getRoomPeer(roomId, excludeSocketId) {
  const room = rooms.get(roomId);
  if (!room) return null;
  for (const id of room.sockets) {
    if (id !== excludeSocketId) return id;
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

// ─── Socket.io events ────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`[connect] ${socket.id}`);

  // ── CREATE ROOM ─────────────────────────────────────────────────────────
  // Sender generates a roomId client-side and registers it here.
  socket.on('create-room', (roomId) => {
    if (!roomId || typeof roomId !== 'string') {
      socket.emit('error', { message: 'Invalid room ID.' });
      return;
    }
    if (rooms.has(roomId)) {
      socket.emit('error', { message: 'Room ID already exists. Please try again.' });
      return;
    }

    rooms.set(roomId, { sockets: new Set([socket.id]), createdAt: new Date() });
    socket.join(roomId);
    socket.data.roomId = roomId;
    socket.data.role = 'sender';

    socket.emit('room-created', { roomId });
    console.log(`[room] Created ${roomId} by ${socket.id}`);
  });

  // ── JOIN ROOM ───────────────────────────────────────────────────────────
  // Receiver opens share link → extracts roomId → joins here.
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

    if (room.sockets.size >= MAX_PEERS_PER_ROOM) {
      socket.emit('error', { message: 'Room is full. Only two peers are allowed.' });
      return;
    }

    room.sockets.add(socket.id);
    socket.join(roomId);
    socket.data.roomId = roomId;
    socket.data.role = 'receiver';

    // Tell the sender someone joined
    const senderId = getRoomPeer(roomId, socket.id);
    if (senderId) {
      io.to(senderId).emit('peer-joined', { peerId: socket.id });
    }

    socket.emit('room-joined', { roomId });
    console.log(`[room] ${socket.id} joined ${roomId}`);
  });

  // ── WebRTC SIGNALING RELAY ───────────────────────────────────────────────
  // These three events are pure relay — server reads nothing, just forwards.

  socket.on('offer', ({ roomId, offer }) => {
    const peer = getRoomPeer(roomId, socket.id);
    if (peer) {
      io.to(peer).emit('offer', { offer, from: socket.id });
    }
  });

  socket.on('answer', ({ roomId, answer }) => {
    const peer = getRoomPeer(roomId, socket.id);
    if (peer) {
      io.to(peer).emit('answer', { answer, from: socket.id });
    }
  });

  socket.on('ice-candidate', ({ roomId, candidate }) => {
    const peer = getRoomPeer(roomId, socket.id);
    if (peer) {
      io.to(peer).emit('ice-candidate', { candidate, from: socket.id });
    }
  });

  // ── DISCONNECT ───────────────────────────────────────────────────────────
  socket.on('disconnecting', () => {
    const roomId = socket.data.roomId;
    if (!roomId) return;

    // Notify the remaining peer
    const peer = getRoomPeer(roomId, socket.id);
    if (peer) {
      io.to(peer).emit('peer-disconnected', {
        message: 'The other peer has disconnected.',
      });
    }

    cleanupRoom(roomId, socket.id);
    console.log(`[disconnect] ${socket.id} left room ${roomId}`);
  });

  socket.on('disconnect', () => {
    console.log(`[disconnect] ${socket.id}`);
  });
});

// ─── Stale room cleanup (every 30 minutes) ───────────────────────────────────
setInterval(() => {
  const cutoff = Date.now() - 30 * 60 * 1000;
  for (const [roomId, room] of rooms.entries()) {
    if (room.createdAt.getTime() < cutoff) {
      rooms.delete(roomId);
      console.log(`[cleanup] Removed stale room ${roomId}`);
    }
  }
}, 5 * 60 * 1000);

// ─── Start ───────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 4000;
httpServer.listen(PORT, () => {
  console.log(`Signaling server running on port ${PORT}`);
  console.log(`Accepting connections from: ${CLIENT_URL}`);
});
