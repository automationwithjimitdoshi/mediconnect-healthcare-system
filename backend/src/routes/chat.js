/**
 * chat.js — WITH RED FLAG AI + DDx API
 * Every incoming patient message is scanned for critical keywords.
 * POST /rooms/:roomId/ddx — triggers full differential diagnosis.
 */
const express = require('express');
const router  = express.Router();
const { PrismaClient } = require('@prisma/client');
const path    = require('path');
const fs      = require('fs');
const crypto  = require('crypto');
const authenticate = require('../middleware/auth');
const {
  analyzeMessageUrgency,
  analyzeMedicalFile,
  checkCriticalRedFlags,
  generateDifferentialDiagnosis,
} = require('../services/aiService');

const prisma = new PrismaClient();

function getUserId(req) {
  const u = req.user || {};
  return u.userId || u.id || u.user_id || u.sub || null;
}

// ── Inline multer ─────────────────────────────────────────────────────────────
function getUpload() {
  const multer = require('multer');
  const UPLOAD_DIR = path.join(__dirname, '..', '..', 'uploads');
  ['images', 'pdfs', 'documents', 'dicom'].forEach(sub => {
    const d = path.join(UPLOAD_DIR, sub);
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  });
  return multer({
    storage: multer.diskStorage({
      destination: (req, file, cb) => {
        const m = file.mimetype; let sub = 'documents';
        if (m.startsWith('image/')) sub = 'images';
        else if (m === 'application/pdf') sub = 'pdfs';
        else if (m === 'application/dicom' || /\.dcm$/i.test(file.originalname)) sub = 'dicom';
        cb(null, path.join(UPLOAD_DIR, sub));
      },
      filename: (req, file, cb) => cb(null, crypto.randomBytes(16).toString('hex') + path.extname(file.originalname)),
    }),
    limits: { fileSize: 50 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      const ok = ['image/jpeg','image/png','image/webp','image/gif','application/pdf',
        'application/msword','text/plain','application/dicom',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
        .includes(file.mimetype) || /\.(dcm|dicom)$/i.test(file.originalname);
      cb(ok ? null : new Error('File type not allowed'), ok);
    },
  });
}

// ── Access guard ──────────────────────────────────────────────────────────────
async function canAccessRoom(roomId, userId) {
  const room = await prisma.chatRoom.findUnique({
    where:   { id: roomId },
    include: { appointment: { select: { patientId: true, doctorId: true, status: true } } },
  });
  if (!room) return { ok: false, room: null };
  const patient = await prisma.patient.findUnique({ where: { userId }, select: { id: true } }).catch(() => null);
  const doctor  = await prisma.doctor.findUnique({  where: { userId }, select: { id: true } }).catch(() => null);
  const isPatient = patient && room.appointment?.patientId === patient.id;
  const isDoctor  = doctor  && room.appointment?.doctorId  === doctor.id;
  // Patients can only chat once appointment is CONFIRMED (doctor accepted)
  // Doctors can always access to see messages
  const apptStatus = room.appointment?.status;
  // Block patients if appointment was cancelled or no-show — message sending disallowed
  const patientCanChat = isPatient
    && !['CANCELLED','NO_SHOW'].includes(apptStatus)
    && ['CONFIRMED','COMPLETED','RESCHEDULED'].includes(apptStatus);
  return { ok: patientCanChat || isDoctor, room };
}

// ── GET /api/chat/rooms ───────────────────────────────────────────────────────
router.get('/rooms', authenticate, async (req, res) => {
  try {
    const userId = getUserId(req);
    const { page = 1, limit = 20 } = req.query;
    let roomWhere = {};
    if (req.user.role === 'PATIENT') {
      const p = await prisma.patient.findUnique({ where: { userId }, select: { id: true } });
      // Only show rooms where appointment is in an active state — NEVER show CANCELLED/NO_SHOW
      // This prevents patient from seeing or messaging doctors whose appt was cancelled
      if (p) roomWhere = {
        appointment: {
          patientId: p.id,
          status: { in: ['SCHEDULED','CONFIRMED','RESCHEDULED','COMPLETED'] },
        },
      };
    } else if (req.user.role === 'DOCTOR') {
      const d = await prisma.doctor.findUnique({ where: { userId }, select: { id: true } });
      if (d) roomWhere = { appointment: { doctorId: d.id } };
    }

    const [rooms, total] = await Promise.all([
      prisma.chatRoom.findMany({
        where: roomWhere,
        include: {
          appointment: {
            select: {
              id: true, scheduledAt: true, status: true,
              patient: { select: { id: true, firstName: true, lastName: true, photoUrl: true } },
              doctor:  { select: { id: true, firstName: true, lastName: true, photoUrl: true, specialty: true } },
            },
          },
          messages: {
            orderBy: { createdAt: 'desc' }, take: 1,
            select: { id: true, content: true, createdAt: true, senderId: true, isRead: true, type: true, isUrgent: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (parseInt(page) - 1) * parseInt(limit),
        take: parseInt(limit),
      }),
      prisma.chatRoom.count({ where: roomWhere }),
    ]);

    const formatted = rooms.map(r => ({
      id: r.id, appointment: r.appointment,
      patient: r.appointment?.patient,
      doctor:  r.appointment?.doctor,
      lastMessage: r.messages[0] || null,
      unreadCount: 0,
    }));

    res.json({ success: true, data: formatted, pagination: { page: parseInt(page), total, pages: Math.ceil(total / parseInt(limit)) } });
  } catch (e) { res.status(500).json({ success: false, message: 'Failed to fetch rooms', detail: e.message }); }
});

// ── GET /api/chat/rooms/:roomId ───────────────────────────────────────────────
router.get('/rooms/:roomId', authenticate, async (req, res) => {
  try {
    const { ok, room } = await canAccessRoom(req.params.roomId, getUserId(req));
    if (!room) return res.status(404).json({ success: false, message: 'Room not found' });
    if (!ok)   return res.status(403).json({ success: false, message: 'Access denied' });

    const full = await prisma.chatRoom.findUnique({
      where: { id: req.params.roomId },
      include: {
        appointment: {
          include: {
            patient: { include: { conditions: true, allergies: true, medications: { where: { isActive: true } } } },
            doctor:  true,
          },
        },
      },
    });
    res.json({ success: true, data: full });
  } catch (e) { res.status(500).json({ success: false, message: 'Failed to fetch room', detail: e.message }); }
});

// ── GET /api/chat/rooms/:roomId/messages ──────────────────────────────────────
router.get('/rooms/:roomId/messages', authenticate, async (req, res) => {
  try {
    const userId = getUserId(req);
    const { ok } = await canAccessRoom(req.params.roomId, userId);
    if (!ok) return res.status(403).json({ success: false, message: 'Access denied' });

    const { page = 1, limit = 50 } = req.query;
    const [messages, total] = await Promise.all([
      prisma.message.findMany({
        where:   { chatRoomId: req.params.roomId },
        include: { file: true },
        orderBy: { createdAt: 'desc' },
        skip:    (parseInt(page) - 1) * parseInt(limit),
        take:    parseInt(limit),
      }),
      prisma.message.count({ where: { chatRoomId: req.params.roomId } }),
    ]);

    // Mark unread as read
    await prisma.message.updateMany({
      where: { chatRoomId: req.params.roomId, senderId: { not: userId }, isRead: false },
      data:  { isRead: true },
    }).catch(() => {});

    res.json({ success: true, data: messages.reverse(), pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / parseInt(limit)) } });
  } catch (e) { res.status(500).json({ success: false, message: 'Failed to fetch messages', detail: e.message }); }
});

// ── POST /api/chat/rooms/:roomId/messages ─────────────────────────────────────
router.post('/rooms/:roomId/messages', authenticate, async (req, res) => {
  try {
    const userId = getUserId(req);
    const { content, type = 'TEXT' } = req.body;
    if (!content && type === 'TEXT') return res.status(400).json({ success: false, message: 'Content required' });

    const { ok, room } = await canAccessRoom(req.params.roomId, userId);
    if (!room) return res.status(404).json({ success: false, message: 'Room not found' });
    if (!ok)   return res.status(403).json({ success: false, message: 'Access denied' });

    // ── Feature B: Red Flag scan on patient messages ──────────────────────
    let isUrgent = false, aiExtract = null;

    if (req.user.role === 'PATIENT' && content) {
      // Standard urgency check
      try {
        const urgency = await analyzeMessageUrgency(content);
        isUrgent  = urgency.isUrgent || false;
        aiExtract = isUrgent ? JSON.stringify({ urgency }) : null;
      } catch (_) {}

      // Critical red flag check (more thorough)
      try {
        const redFlags = await checkCriticalRedFlags(content, null);
        if (redFlags.length > 0) {
          isUrgent  = true;
          aiExtract = JSON.stringify({ redFlags });
          // Emit force-escalation to doctor
          const io = req.app.get('io');
          if (io) {
            io.to('room-' + req.params.roomId).emit('critical-alert', {
              patientId:  room.appointment?.patientId,
              redFlags,
              timestamp:  new Date().toISOString(),
              requiresAck: true,
            });
          }
          console.log('[Red-Flag] Critical keywords in chat room:', req.params.roomId, redFlags.map(f => f.trigger));
        }
      } catch (_) {}
    }

    // Resolve sender IDs
    let patientId = null, doctorId = null;
    if (req.user.role === 'PATIENT') {
      const p = await prisma.patient.findUnique({ where: { userId }, select: { id: true } });
      patientId = p?.id || null;
    } else if (req.user.role === 'DOCTOR') {
      const d = await prisma.doctor.findUnique({ where: { userId }, select: { id: true } });
      doctorId = d?.id || null;
    }

    const message = await prisma.message.create({
      data: { chatRoomId: req.params.roomId, senderId: userId, senderRole: req.user.role, patientId, doctorId, type: 'TEXT', content, isUrgent, aiExtract },
      include: { file: true },
    });

    // Broadcast
    const io = req.app.get('io');
    if (io) io.to('room-' + req.params.roomId).emit('new-message', message);

    res.status(201).json({ success: true, data: message });
  } catch (e) {
    console.error('[POST messages] Error:', e.message);
    res.status(500).json({ success: false, message: 'Failed to send message', detail: e.message });
  }
});

// ── POST /api/chat/rooms/:roomId/messages/file ────────────────────────────────
router.post('/rooms/:roomId/messages/file', authenticate, function (req, res) {
  const userId = getUserId(req);
  let upload;
  try { upload = getUpload(); }
  catch (e) { return res.status(500).json({ success: false, message: 'multer not installed' }); }

  upload.array('files', 5)(req, res, async function (err) {
    if (err) return res.status(400).json({ success: false, message: err.message });
    try {
      if (!req.files || req.files.length === 0)
        return res.status(400).json({ success: false, message: 'No files uploaded' });

      const { ok, room } = await canAccessRoom(req.params.roomId, userId);
      if (!ok) return res.status(403).json({ success: false, message: 'Access denied' });

      const patientId = room.appointment?.patientId;
      let senderPatientId = null, senderDoctorId = null;
      if (req.user.role === 'PATIENT') {
        const p = await prisma.patient.findUnique({ where: { userId }, select: { id: true } });
        senderPatientId = p?.id || null;
      } else {
        const d = await prisma.doctor.findUnique({ where: { userId }, select: { id: true } });
        senderDoctorId = d?.id || null;
      }

      const messages = await Promise.all(req.files.map(async file => {
        const ext = path.extname(file.originalname).toLowerCase();
        let category = 'general';
        if (['.pdf'].includes(ext)) category = 'pdf';
        else if (['.jpg','.jpeg','.png','.webp'].includes(ext)) category = 'image';
        else if (['.dcm','.dicom'].includes(ext)) category = 'dicom';

        const medFile = await prisma.medicalFile.create({
          data: {
            patientId:  patientId || senderPatientId || '',
            uploadedBy: userId,
            fileName:   file.originalname,
            fileType:   ext.replace('.', ''),
            mimeType:   file.mimetype,
            fileSize:   file.size,
            storageUrl: '/uploads/' + (category === 'image' ? 'images' : category === 'pdf' ? 'pdfs' : 'documents') + '/' + file.filename,
            storageKey: file.filename,
            category,
          },
        });

        const msg = await prisma.message.create({
          data: {
            chatRoomId: req.params.roomId,
            senderId:   userId,
            senderRole: req.user.role,
            patientId:  senderPatientId,
            doctorId:   senderDoctorId,
            type:       'FILE',
            content:    req.body.caption || null,
            fileId:     medFile.id,
          },
          include: { file: true },
        });

        // Background: AI analysis + delta-check + red flag
        setImmediate(async () => {
          try {
            const { analyzeMedicalFile: amf, checkCriticalRedFlags: crf } = require('../services/aiService');
            const analysis = await amf(file.path, category, file.originalname);
            if (!analysis) return;

            await prisma.medicalFile.update({
              where: { id: medFile.id },
              data: { aiAnalysis: JSON.stringify(analysis), urgencyLevel: analysis.urgencyLevel || 'LOW', isProcessed: true },
            });

            // Red flag check on lab values
            try {
              const redFlags = await crf(null, analysis);
              if (redFlags && redFlags.length > 0) {
                const io = req.app.get('io');
                if (io) io.to('room-' + req.params.roomId).emit('critical-alert', { fileId: medFile.id, patientId, redFlags, timestamp: new Date().toISOString() });
              }
            } catch (rfErr) {
              console.warn('[File AI Pipeline] red flag check failed:', rfErr.message);
            }
          } catch (e) { console.error('[File AI Pipeline]', e.message); }
        });

        return msg;
      }));

      const io = req.app.get('io');
      if (io) messages.forEach(m => io.to('room-' + req.params.roomId).emit('new-message', m));

      res.status(201).json({ success: true, data: messages });
    } catch (e) { res.status(500).json({ success: false, message: 'File send failed', detail: e.message }); }
  });
});

// ── POST /api/chat/rooms/:roomId/ddx  (DDx Engine — Feature D) ───────────────
router.post('/rooms/:roomId/ddx', authenticate, async (req, res) => {
  try {
    const userId = getUserId(req);
    if (req.user.role !== 'DOCTOR')
      return res.status(403).json({ success: false, message: 'DDx is available to doctors only' });

    const { ok, room } = await canAccessRoom(req.params.roomId, userId);
    if (!ok) return res.status(403).json({ success: false, message: 'Access denied' });

    const patientId = room.appointment?.patientId;

    const [messages, files, patient] = await Promise.all([
      prisma.message.findMany({
        where: { chatRoomId: req.params.roomId },
        orderBy: { createdAt: 'desc' },
        take: 30,
      }),
      prisma.medicalFile.findMany({
        where: { patientId, isProcessed: true },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
      prisma.patient.findUnique({
        where: { id: patientId },
        include: { conditions: { where: { isActive: true } }, allergies: true, medications: { where: { isActive: true } } },
      }),
    ]);

    const ddx = await generateDifferentialDiagnosis(messages.reverse(), files, patient);
    if (!ddx) return res.status(500).json({ success: false, message: 'DDx generation failed — no AI response' });

    res.json({ success: true, data: ddx });
  } catch (e) {
    console.error('[DDx] Error:', e.message);
    res.status(500).json({ success: false, message: 'DDx failed', detail: e.message });
  }
});

// ── GET /api/chat/rooms/:roomId/files ─────────────────────────────────────────
router.get('/rooms/:roomId/files', authenticate, async (req, res) => {
  try {
    const { ok } = await canAccessRoom(req.params.roomId, getUserId(req));
    if (!ok) return res.status(403).json({ success: false, message: 'Access denied' });
    const messages = await prisma.message.findMany({
      where: { chatRoomId: req.params.roomId, type: 'FILE', fileId: { not: null } },
      include: { file: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ success: true, data: messages.map(m => m.file).filter(Boolean) });
  } catch (e) { res.status(500).json({ success: false, message: 'Failed', detail: e.message }); }
});

// ── PUT /api/chat/rooms/:roomId/messages/:messageId/read ──────────────────────
router.put('/rooms/:roomId/messages/:messageId/read', authenticate, async (req, res) => {
  try {
    const userId = getUserId(req);
    await prisma.message.updateMany({
      where: { id: req.params.messageId, chatRoomId: req.params.roomId, senderId: { not: userId } },
      data:  { isRead: true },
    });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, message: 'Failed', detail: e.message }); }
});


// ── POST /api/chat/rooms/:roomId/summarize-note ───────────────────────────────
// Doctor speaks/types a clinical note → AI converts to bullet-point summary
// The summary is then sent as a special CLINICAL_NOTE message in the chat
router.post('/rooms/:roomId/summarize-note', authenticate, async (req, res) => {
  try {
    const { roomId } = req.params;
    const { rawText, sendToChat = true, inputLang = 'en' } = req.body;
    // Sanitize outputLang — only accept valid values
    const outputLang = ['en', 'hi', 'gu'].includes(req.body.outputLang) ? req.body.outputLang : 'en';

    if (!rawText || rawText.trim().length < 3) {
      return res.status(400).json({ success: false, message: 'No text provided to summarize' });
    }

    // Only doctors can create clinical notes
    if (req.user.role !== 'DOCTOR') {
      return res.status(403).json({ success: false, message: 'Only doctors can create clinical notes' });
    }

    if (!await canAccessRoom(roomId, getUserId(req))) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const { summarizeClinicalNote } = require('../services/aiService');
    // inputLang is now auto-detected inside summarizeClinicalNote from rawText script
    // Only outputLang (summary language selection) is respected
    const summary = await summarizeClinicalNote(rawText, { outputLang });

    // sections come from AI call; if missing/empty, use rule-based bucket split
    let sections = summary.sections || {};
    const hasSections = sections.notes || sections.prescription || sections.followUp || sections.others;
    if (!hasSections) {
      // Rule-based split: same bucketLines logic as aiService
      const RX_MED = /tab\.?|cap\.?|syr\.?|syp\.?|inj\.?|\d+\s*mg|\d+\s*ml|\bbd\b|\btds\b|\bod\b|\bqid\b|once daily|twice daily|medicine|tablet|capsule|syrup|dose|dava|goli|subah|shaam|dawa/i;
      const RX_FU  = /follow.?up|review|revisit|repeat|return|next visit|refer|after \d+|hapta|pachhi|phir|dobara|agle|hafte/i;
      const RX_OTH = /diet|exercise|rest|avoid|water|walk|sleep|pani|khana|aram|kasrat/i;
      const lines  = rawText.split(/[\n।॥]+/).map(l => l.trim()).filter(l => l.length > 2);
      const bkts   = { prescription: [], followUp: [], others: [], notes: [] };
      for (const line of lines) {
        if      (RX_MED.test(line)) bkts.prescription.push(line);
        else if (RX_FU.test(line))  bkts.followUp.push(line);
        else if (RX_OTH.test(line)) bkts.others.push(line);
        else                        bkts.notes.push(line);
      }
      sections = {
        notes:        bkts.notes.join('\n'),
        prescription: bkts.prescription.join('\n'),
        followUp:     bkts.followUp.join('\n'),
        others:       bkts.others.join('\n'),
      };
    }

    // Build display text — structured JSON encoded in content for later parsing
    // Format: first line is CLINICAL_NOTE_DATA:{json} then blank line then human-readable bullets
    const structuredData = {
      bullets:      summary.bullets      || [],
      category:     summary.category     || 'general',
      urgency:      summary.urgency      || 'routine',
      tags:         summary.tags         || [],
      aiGenerated:  summary.aiGenerated  || false,
      outputLang,
      sections, // {followUp, prescription, notes, others}
    };
    const NL = '\n';
    const urgLine = (summary.urgency === 'urgent' || summary.urgency === 'critical')
      ? (NL + (summary.urgency === 'critical' ? '🚨 CRITICAL — Immediate action required' : '⚠️ Urgent follow-up needed'))
      : '';

    // Build human-readable section breakdown — labels respect outputLang
    const sectionLabel = {
      prescription: { en: '💊 Prescription', hi: '💊 दवाइयाँ', gu: '💊 દવાઓ' },
      followUp:     { en: '📅 Follow-up',    hi: '📅 फॉलो-अप', gu: '📅 ફૉલો-અપ' },
      notes:        { en: '📝 Notes',        hi: '📝 नोट्स',   gu: '📝 નોంધ' },
      others:       { en: '💡 Other',        hi: '💡 अन्य',    gu: '💡 અન્ય' },
    };
    const lbl = (key) => (sectionLabel[key][outputLang] || sectionLabel[key].en);

    const sectionLines = [];
    if (sections.notes?.trim())        sectionLines.push(lbl('notes') + ':\n   ' + sections.notes.trim().split('\n').join('\n   '));
    if (sections.prescription?.trim()) sectionLines.push(lbl('prescription') + ':\n   ' + sections.prescription.trim().split('\n').join('\n   '));
    if (sections.followUp?.trim())     sectionLines.push(lbl('followUp') + ':\n   ' + sections.followUp.trim().split('\n').join('\n   '));
    if (sections.others?.trim())       sectionLines.push(lbl('others') + ':\n   ' + sections.others.trim().split('\n').join('\n   '));

    // Use section breakdown if available, else fall back to translated bullets
    const humanText = sectionLines.length
      ? sectionLines.join(NL) + urgLine
      : (summary.bullets || []).join(NL) + urgLine;
    // Encode structured data + human-readable in one content field
    const content = 'CLINICAL_NOTE_DATA:' + JSON.stringify(structuredData) + NL + '---' + NL + humanText;

    // Optionally send as a message in chat
    let message = null;
    if (sendToChat) {
      message = await prisma.message.create({
        data: {
          chatRoomId: roomId,
          senderId:   getUserId(req),
          senderRole: 'DOCTOR',
          content,
          type:       'AI_SUMMARY',
        },
      });
    }

    return res.json({ success: true, summary: { ...summary, sections }, message, bulletText: humanText, sections });
  } catch (err) {
    console.error('[summarize-note]', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ── GET /api/chat/rooms/:roomId/clinical-notes ─────────────────────────────────
// Retrieve all clinical notes for a patient's chat room (for future reference)
router.get('/rooms/:roomId/clinical-notes', authenticate, async (req, res) => {
  try {
    const { roomId } = req.params;
    if (!await canAccessRoom(roomId, getUserId(req))) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const notes = await prisma.message.findMany({
      where:   { chatRoomId: roomId, type: 'AI_SUMMARY' },
      orderBy: { createdAt: 'desc' },
      take:    50,
    });

    return res.json({
      success: true,
      data: notes.map(n => {
        // Parse structured data from content field
        let structured = {};
        let humanText  = n.content || '';
        try {
          if (n.content && n.content.startsWith('CLINICAL_NOTE_DATA:')) {
            const firstLine = n.content.split('\n')[0];
            const jsonStr   = firstLine.replace('CLINICAL_NOTE_DATA:', '');
            structured = JSON.parse(jsonStr);
            // Human-readable part is after ---
            const sepIdx = n.content.indexOf('\n---\n');
            humanText = sepIdx >= 0 ? n.content.slice(sepIdx + 5) : humanText;
          }
        } catch {}
        return {
          id:          n.id,
          content:     humanText,
          createdAt:   n.createdAt,
          bullets:     structured.bullets     || humanText.split('\n').filter(l => l.trim()),
          category:    structured.category    || 'general',
          urgency:     structured.urgency     || 'routine',
          tags:        structured.tags        || [],
          aiGenerated: structured.aiGenerated || false,
          sections:    structured.sections    || {},
          outputLang:  structured.outputLang  || 'en',
        };
      }),
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});


// ── DELETE /api/chat/rooms/:roomId/messages/:messageId ────────────────────────
// Soft delete: marks message content as deleted (schema has no isDeleted field)
router.delete('/rooms/:roomId/messages/:messageId', authenticate, async (req, res) => {
  try {
    const { roomId, messageId } = req.params;
    const userId = getUserId(req);

    const msg = await prisma.message.findUnique({ where: { id: messageId } });
    if (!msg) return res.status(404).json({ success: false, message: 'Message not found' });
    if (msg.chatRoomId !== roomId) return res.status(400).json({ success: false, message: 'Message not in this room' });

    // Only the sender can delete their own message
    if (msg.senderId !== userId) {
      return res.status(403).json({ success: false, message: 'You can only delete your own messages' });
    }

    // Soft delete — overwrite content (schema has no isDeleted field)
    await prisma.message.update({
      where: { id: messageId },
      data:  { content: '[Message deleted]', fileId: null },
    });

    // Notify room via socket
    const io = req.app.get('io');
    if (io) io.to('room-' + roomId).emit('message-deleted', { messageId });

    return res.json({ success: true, message: 'Message deleted' });
  } catch (err) {
    console.error('[delete-message]', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;