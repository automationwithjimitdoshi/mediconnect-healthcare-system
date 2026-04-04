// services/socketService.js — Real-time Socket.io Handlers
const jwt    = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

function setupSocketHandlers(io) {

  // ── Auth Middleware ─────────────────────────────────
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (!token) return next(new Error('Authentication required'));
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.user = decoded;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', async (socket) => {
    const { userId, role } = socket.user;
    console.log(`Socket connected: ${userId} (${role})`);

    // ── Join personal rooms ────────────────────────────
    socket.join(`user-${userId}`);

    if (role === 'DOCTOR') {
      const doctor = await prisma.doctor.findUnique({ where: { userId } });
      if (doctor) {
        socket.join(`doctor-${doctor.id}`);
        socket.doctorId = doctor.id;
        // Update online status
        io.emit('doctor-online', { doctorId: doctor.id, online: true });
      }
    } else if (role === 'PATIENT') {
      const patient = await prisma.patient.findUnique({ where: { userId } });
      if (patient) {
        socket.join(`patient-${patient.id}`);
        socket.patientId = patient.id;
        io.emit('patient-online', { patientId: patient.id, online: true });
      }
    }

    // ── Join chat room ─────────────────────────────────
    socket.on('join-room', ({ roomId }) => {
      socket.join(`room-${roomId}`);
      console.log(`${userId} joined room-${roomId}`);
    });

    socket.on('leave-room', ({ roomId }) => {
      socket.leave(`room-${roomId}`);
    });

    // ── Typing indicator ──────────────────────────────
    socket.on('typing', ({ roomId, isTyping }) => {
      socket.to(`room-${roomId}`).emit('user-typing', {
        userId, role, isTyping
      });
    });

    // ── Read receipt ──────────────────────────────────
    socket.on('mark-read', async ({ roomId, messageIds }) => {
      try {
        await prisma.message.updateMany({
          where: { id: { in: messageIds }, chatRoomId: roomId },
          data:  { isRead: true }
        });
        socket.to(`room-${roomId}`).emit('messages-read', { messageIds, readBy: userId });
      } catch (e) { console.error('Mark read error:', e); }
    });

    // ── Heartbeat / presence ──────────────────────────
    socket.on('heartbeat', () => {
      socket.emit('heartbeat-ack', { timestamp: Date.now() });
    });

    // ── Disconnect ────────────────────────────────────
    socket.on('disconnect', () => {
      console.log(`Socket disconnected: ${userId}`);
      if (role === 'DOCTOR' && socket.doctorId)
        io.emit('doctor-online', { doctorId: socket.doctorId, online: false });
      if (role === 'PATIENT' && socket.patientId)
        io.emit('patient-online', { patientId: socket.patientId, online: false });
    });
  });
}

module.exports = { setupSocketHandlers };
