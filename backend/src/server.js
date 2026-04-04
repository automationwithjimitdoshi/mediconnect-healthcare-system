'use strict';
/**
 * server.js
 * Location: backend/src/server.js
 * Run from backend/ folder: node src/server.js  OR  nodemon src/server.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const express = require('express');
const cors    = require('cors');
const path    = require('path');
const http    = require('http');
const fs      = require('fs');

const app    = express();
const server = http.createServer(app);

// ── Socket.io ─────────────────────────────────────────────────────────────────
let io;
try {
  const { Server } = require('socket.io');
  io = new Server(server, {
    cors: { origin: ['http://localhost:3000', process.env.FRONTEND_URL].filter(Boolean), credentials: true },
  });
  app.set('io', io);
  io.on('connection', socket => {
    socket.on('join-room',  roomId => socket.join('room-'  + roomId));
    socket.on('leave-room', roomId => socket.leave('room-' + roomId));
  });
  console.log('✓ Socket.io ready');
} catch {
  console.warn('⚠  socket.io not installed (npm install socket.io)');
}

// ── Core middleware ───────────────────────────────────────────────────────────
app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:3001', process.env.FRONTEND_URL].filter(Boolean),
  credentials: true,
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// ── Static uploads ────────────────────────────────────────────────────────────
// backend/src/ → ../../ → mediconnect app/uploads/
const uploadsDir = [
  path.join(__dirname, '..', '..', 'uploads'),  // mediconnect app/uploads/ ← primary
  path.join(__dirname, '..', 'uploads'),          // backend/uploads/         ← fallback
  path.join(__dirname, 'uploads'),                // backend/src/uploads/     ← last resort
].find(d => fs.existsSync(d)) || path.join(__dirname, '..', '..', 'uploads');

['pdfs', 'images', 'documents', 'dicom'].forEach(sub =>
  fs.mkdirSync(path.join(uploadsDir, sub), { recursive: true })
);
app.use('/uploads', express.static(uploadsDir));
console.log('✓ Uploads:', uploadsDir);

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/auth',         require('./routes/auth'));
app.use('/api/doctors',      require('./routes/doctors'));
app.use('/api/patients',     require('./routes/patients'));
app.use('/api/appointments', require('./routes/appointments'));
app.use('/api/payments',     require('./routes/payments'));
app.use('/api/chat',         require('./routes/chat'));
app.use('/api/files',        require('./routes/files'));
app.use('/api/ai',           require('./routes/ai'));
app.use('/api/reports',      require('./routes/reports'));      // Report Analyzer
app.use('/api/cdss',         require('./routes/cdss'));         // CDSS features
app.use('/api/doctor-data',  require('./routes/doctor-data')); // Report Review patients
app.use('/api/abha',         require('./routes/abha'));

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

// ── 404 ───────────────────────────────────────────────────────────────────────
app.use((req, res) => res.status(404).json({ error: `Route not found: ${req.method} ${req.path}` }));

// ── Error handler ─────────────────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error('[Error]', err.message);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;

server.on('error', err => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n❌  Port ${PORT} is already in use.`);
    console.error(`    Fix: open a terminal and run:`);
    console.error(`         netstat -ano | findstr :${PORT}`);
    console.error(`    Then copy the PID (last number) and run:`);
    console.error(`         taskkill /PID <the_number> /F`);
    console.error(`    Then restart: nodemon src/server.js\n`);
  } else {
    console.error('Server error:', err.message);
  }
  process.exit(1);
});

server.listen(PORT, () => {
  console.log(`\n🚀  http://localhost:${PORT}`);
  console.log(`    Test: http://localhost:${PORT}/api/reports/test\n`);
});

module.exports = { app, server };