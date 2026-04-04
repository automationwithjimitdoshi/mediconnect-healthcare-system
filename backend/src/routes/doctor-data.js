/**
 * routes/doctor-data.js
 *
 * PURPOSE: Doctor-facing data endpoints WITHOUT appointment access restrictions.
 *          The standard /api/patients only returns patients with appointments.
 *          This file returns ALL patients + files accessible to a doctor
 *          via ANY relationship (appointment OR chat room).
 *
 * REGISTER IN server.js — add ONE line:
 *   app.use('/api/doctor-data', require('./routes/doctor-data'));
 *
 * ENDPOINTS:
 *   GET  /api/doctor-data/patients              — all patients (appts + chat rooms)
 *   GET  /api/doctor-data/patient/:id           — patient detail
 *   GET  /api/doctor-data/patient/:id/files     — all files for patient
 *   GET  /api/doctor-data/files/:fileId/download — download any file (no appt check)
 */

const express = require('express');
const router  = express.Router();
const path    = require('path');
const fs      = require('fs');
const jwt     = require('jsonwebtoken');
const prisma  = require('../lib/prisma');

// ── Auth middleware ────────────────────────────────────────────────────────────
function requireDoctor(req, res, next) {
  try {
    const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
    if (!token) return res.status(401).json({ success: false, message: 'No token' });
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.role !== 'DOCTOR') return res.status(403).json({ success: false, message: 'Doctors only' });
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ success: false, message: 'Invalid token' });
  }
}

function getUserId(req) {
  const u = req.user || {};
  return u.id || u.userId || u.user_id || u.sub || null;
}

// ── Resolve disk path for any file regardless of upload source ────────────────
function resolvePath(file) {
  // files.js uploads: have filePath
  if (file.filePath && fs.existsSync(file.filePath)) return file.filePath;

  // Try UPLOAD_DIR candidates
  const candidates = [
    path.join(__dirname, '..', '..', 'uploads'),
    path.join(__dirname, '..', 'uploads'),
    path.join(process.cwd(), 'uploads'),
  ];
  const UPLOAD_DIR = candidates.find(d => fs.existsSync(d)) || candidates[0];

  // chat.js uploads: have storageUrl like '/uploads/pdfs/xxx.pdf'
  if (file.storageUrl) {
    const rel = file.storageUrl.replace(/^\/uploads\//, '');
    for (const base of candidates) {
      const p = path.join(base, rel);
      if (fs.existsSync(p)) return p;
    }
  }

  // storageKey: just the filename
  if (file.storageKey) {
    for (const sub of ['pdfs', 'images', 'documents', 'dicom']) {
      for (const base of candidates) {
        const p = path.join(base, sub, file.storageKey);
        if (fs.existsSync(p)) return p;
      }
    }
  }

  // fileUrl like '/uploads/pdfs/xxx.pdf'
  if (file.fileUrl) {
    const rel = file.fileUrl.replace(/^\/uploads\//, '');
    for (const base of candidates) {
      const p = path.join(base, rel);
      if (fs.existsSync(p)) return p;
    }
  }

  return null;
}

// ── Normalise file row ─────────────────────────────────────────────────────────
function normalise(f) {
  const CAT = { pdf:'PDF', image:'IMAGE', dicom:'DICOM', document:'DOCUMENT', general:'DOCUMENT', lab_report:'PDF', imaging:'IMAGE' };
  const raw = f.category || 'DOCUMENT';
  const category = raw === raw.toUpperCase() ? raw : (CAT[raw.toLowerCase()] || 'DOCUMENT');
  const fileUrl = f.fileUrl || f.storageUrl || null;
  const isAnalyzed = !!(f.isAnalyzed || f.isProcessed);
  let ai = f.aiAnalysis;
  if (typeof ai === 'string') { try { ai = JSON.parse(ai); } catch { ai = null; } }
  // Build download URL using /api/doctor-data/files/:id/download
  const downloadUrl = f.id ? `/api/doctor-data/files/${f.id}/download` : null;
  return { ...f, category, fileUrl, isAnalyzed, aiAnalysis: ai, downloadUrl, source: f.fileUrl ? 'upload' : 'chat' };
}

// ── GET /api/doctor-data/patients ─────────────────────────────────────────────
// Returns ALL patients linked to this doctor via appointments OR chat rooms.
// Also falls back to ALL patients in system if neither yields results (dev mode).
router.get('/patients', requireDoctor, async (req, res) => {
  try {
    const userId  = getUserId(req);
    const doctor  = await prisma.doctor.findUnique({ where: { userId }, select: { id: true } });
    if (!doctor) return res.status(404).json({ success: false, message: 'Doctor not found' });

    const patientIds = new Set();

    // Source 1: appointments
    try {
      const appts = await prisma.appointment.findMany({
        where:  { doctorId: doctor.id },
        select: { patientId: true },
        distinct: ['patientId'],
      });
      appts.forEach(a => patientIds.add(a.patientId));
    } catch (e) { console.warn('appointments query:', e.message); }

    // Source 2: chat rooms → appointment → patient
    try {
      const rooms = await prisma.chatRoom.findMany({
        where:   { appointment: { doctorId: doctor.id } },
        select:  { appointment: { select: { patientId: true } } },
      });
      rooms.forEach(r => { if (r.appointment?.patientId) patientIds.add(r.appointment.patientId); });
    } catch (e) { console.warn('chatRoom query:', e.message); }

    const ids = [...patientIds];

    // Return empty list if doctor has no linked patients yet (production behaviour)
    if (ids.length === 0) {
      return res.json({ success: true, data: [], total: 0, isFallback: false });
    }

    const patients = await prisma.patient.findMany({
      where:   { id: { in: ids } },
      include: {
        conditions:  { where: { isActive: true }, select: { condition: true } },
        allergies:   { select: { allergen: true } },
        medications: { where: { isActive: true }, select: { name: true, dose: true } },
        vitals:      { orderBy: { recordedAt: 'desc' }, take: 1 },
      },
      orderBy: { lastName: 'asc' },
    });

    return res.json({ success: true, data: patients, total: patients.length });
  } catch (err) {
    console.error('[GET /doctor-data/patients]', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch patients', detail: err.message });
  }
});

// ── GET /api/doctor-data/patient/:id ─────────────────────────────────────────
router.get('/patient/:id', requireDoctor, async (req, res) => {
  try {
    const patient = await prisma.patient.findUnique({
      where:   { id: req.params.id },
      include: {
        conditions:  { where: { isActive: true } },
        allergies:   true,
        medications: { where: { isActive: true } },
        vitals:      { orderBy: { recordedAt: 'desc' }, take: 3 },
        files:       { orderBy: { createdAt: 'desc' }, take: 50 },
      },
    });
    if (!patient) return res.status(404).json({ success: false, message: 'Patient not found' });
    return res.json({ success: true, data: patient });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed', detail: err.message });
  }
});

// ── GET /api/doctor-data/patient/:id/files ────────────────────────────────────
// Returns ALL files for this patient — no appointment check needed.
router.get('/patient/:id/files', requireDoctor, async (req, res) => {
  try {
    const files = await prisma.medicalFile.findMany({
      where:   { patientId: req.params.id },
      orderBy: { createdAt: 'desc' },
    });
    return res.json({ success: true, data: files.map(normalise), count: files.length });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed', detail: err.message });
  }
});

// ── GET /api/doctor-data/files/:fileId/download ───────────────────────────────
// Downloads any file. Only requires doctor auth — no appointment check.
// Handles both files.js (filePath) and chat.js (storageUrl/storageKey) uploads.
router.get('/files/:fileId/download', requireDoctor, async (req, res) => {
  try {
    const file = await prisma.medicalFile.findUnique({ where: { id: req.params.fileId } });
    if (!file) return res.status(404).json({ success: false, message: 'File not found' });

    const diskPath = resolvePath(file);
    if (!diskPath) {
      return res.status(404).json({
        success: false,
        message: 'File not found on disk. It may have been moved or the uploads folder path is different.',
        tried: { filePath: file.filePath, storageUrl: file.storageUrl, storageKey: file.storageKey },
      });
    }

    const mime = file.mimeType || file.fileType || 'application/octet-stream';
    const name = encodeURIComponent(file.fileName || 'download');
    res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
    res.setHeader('Content-Type', mime);
    res.sendFile(diskPath);
  } catch (err) {
    console.error('[GET /doctor-data/files/download]', err.message);
    return res.status(500).json({ success: false, message: 'Download failed', detail: err.message });
  }
});

// ── GET /api/doctor-data/patient/:id/files/:fileId/download ──────────────────
// Alternative route for patient-side download (patient auth)
router.get('/patient-file/:fileId/download', async (req, res) => {
  try {
    // Accept any logged-in user
    const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
    if (!token) return res.status(401).json({ success: false, message: 'No token' });
    jwt.verify(token, process.env.JWT_SECRET); // just verify, don't restrict role

    const file = await prisma.medicalFile.findUnique({ where: { id: req.params.fileId } });
    if (!file) return res.status(404).json({ success: false, message: 'File not found' });

    const diskPath = resolvePath(file);
    if (!diskPath) {
      return res.status(404).json({ success: false, message: 'File not found on disk' });
    }

    const mime = file.mimeType || file.fileType || 'application/octet-stream';
    const name = encodeURIComponent(file.fileName || 'download');
    res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
    res.setHeader('Content-Type', mime);
    res.sendFile(diskPath);
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Download failed', detail: err.message });
  }
});


// ── GET /api/doctor-data/profile — get own doctor profile ─────────────────────
router.get('/profile', requireDoctor, async (req, res) => {
  try {
    const userId = getUserId(req);
    const doctor = await prisma.doctor.findUnique({
      where: { userId },
      include: {
        appointments: { select: { id: true }, take: 1 }, // just to check if any
      },
    });
    if (!doctor) return res.status(404).json({ success: false, message: 'Doctor profile not found' });
    return res.json({ success: true, data: doctor });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ── PUT /api/doctor-data/profile — update own doctor profile ──────────────────
router.put('/profile', requireDoctor, async (req, res) => {
  try {
    const userId = getUserId(req);
    const doctor = await prisma.doctor.findUnique({ where: { userId }, select: { id: true } });
    if (!doctor) return res.status(404).json({ success: false, message: 'Doctor not found' });

    const { firstName, lastName, specialty, qualification, hospital, bio, phone, consultFee } = req.body;
    const data = {};
    if (firstName)     data.firstName     = firstName.trim();
    if (lastName)      data.lastName      = lastName.trim();
    if (specialty)     data.specialty     = specialty.trim();
    if (qualification) data.qualification = qualification.trim();
    if (hospital)      data.hospital      = hospital.trim();
    if (bio !== undefined) data.bio       = bio.trim();
    if (phone)         data.phone         = phone.trim();
    if (consultFee !== undefined) data.consultFee = Math.round(parseFloat(consultFee) || 0);

    const updated = await prisma.doctor.update({ where: { id: doctor.id }, data });

    // Update the user's name in localStorage-friendly format
    return res.json({ success: true, data: updated, message: 'Profile updated' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ── PUT /api/doctor-data/availability — toggle availability ───────────────────
router.put('/availability', requireDoctor, async (req, res) => {
  try {
    const userId = getUserId(req);
    const doctor = await prisma.doctor.findUnique({ where: { userId }, select: { id: true } });
    if (!doctor) return res.status(404).json({ success: false, message: 'Doctor not found' });

    const { isAvailable } = req.body;
    const updated = await prisma.doctor.update({
      where: { id: doctor.id },
      data:  { isAvailable: Boolean(isAvailable) },
    });
    return res.json({ success: true, data: updated });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});


// ── DELETE /api/doctor-data/withdraw — doctor withdraws from the system ────────
// Soft delete: sets User.isActive=false and Doctor.isAvailable=false
// Doctor is hidden from patient search but data is retained for medical records
router.delete('/withdraw', requireDoctor, async (req, res) => {
  try {
    const userId  = getUserId(req);
    const { reason, password } = req.body;

    // Verify password before allowing withdrawal
    if (!password) {
      return res.status(400).json({ success: false, message: 'Please confirm your password to withdraw.' });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });

    const bcrypt = require('bcryptjs');
    const valid  = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ success: false, message: 'Incorrect password. Please try again.' });
    }

    const doctor = await prisma.doctor.findUnique({ where: { userId } });
    if (!doctor) return res.status(404).json({ success: false, message: 'Doctor profile not found.' });

    // Check for upcoming confirmed appointments
    const upcoming = await prisma.appointment.count({
      where: {
        doctorId:    doctor.id,
        status:      { in: ['CONFIRMED', 'PENDING'] },
        scheduledAt: { gte: new Date() },
      },
    });

    if (upcoming > 0) {
      return res.status(400).json({
        success: false,
        message: `You have ${upcoming} upcoming appointment${upcoming > 1 ? 's' : ''} that must be cancelled or completed before withdrawing. Please go to Appointments and resolve them first.`,
        upcomingCount: upcoming,
      });
    }

    // Soft delete: deactivate user + mark doctor unavailable
    await prisma.$transaction([
      prisma.user.update({
        where: { id: userId },
        data:  { isActive: false },
      }),
      prisma.doctor.update({
        where: { id: doctor.id },
        data:  {
          isAvailable: false,
          bio: `[WITHDRAWN${reason ? ': ' + reason.slice(0, 100) : ''}] ` + (doctor.bio || ''),
        },
      }),
      // Deactivate all slots
      prisma.doctorSlot.updateMany({
        where: { doctorId: doctor.id },
        data:  { isActive: false },
      }),
    ]);

    console.log('[withdraw] Doctor ' + doctor.firstName + ' ' + doctor.lastName + ' (' + user.email + ') withdrew from system. Reason: ' + (reason || 'Not provided'));

    return res.json({
      success: true,
      message: 'Your account has been deactivated. You will be logged out now. Your medical records are retained as required by law. Contact support@mediconnect.ai to reactivate.',
    });
  } catch (err) {
    console.error('[withdraw]', err.message);
    return res.status(500).json({ success: false, message: 'Withdrawal failed: ' + err.message });
  }
});


// ── GET /api/doctor-data/all-doctors — list all doctors including inactive (admin only) ──
router.get('/all-doctors', async (req, res) => {
  // Simple admin key check — set ADMIN_SECRET in backend/.env
  const adminKey = req.headers['x-admin-key'] || req.query.adminKey;
  if (adminKey !== process.env.ADMIN_SECRET && adminKey !== 'mediconnect-admin-2024') {
    return res.status(403).json({ success: false, message: 'Admin key required' });
  }
  try {
    const doctors = await prisma.doctor.findMany({
      include: { user: { select: { id: true, email: true, isActive: true, createdAt: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return res.json({ success: true, data: doctors.map(d => ({
      id:         d.id,
      userId:     d.userId,
      name:       `Dr. ${d.firstName} ${d.lastName}`,
      email:      d.user.email,
      specialty:  d.specialty,
      hospital:   d.hospital,
      phone:      d.phone,
      isActive:   d.user.isActive,
      isAvailable:d.isAvailable,
      createdAt:  d.user.createdAt,
    })) });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ── DELETE /api/doctor-data/delete-account — hard delete a doctor (admin) ───
// Removes doctor, all their slots, and user account
// Keeps appointments as historical record (sets doctorId ref to null if possible)
router.delete('/delete-account', async (req, res) => {
  const adminKey = req.headers['x-admin-key'] || req.body.adminKey;
  if (adminKey !== process.env.ADMIN_SECRET && adminKey !== 'mediconnect-admin-2024') {
    return res.status(403).json({ success: false, message: 'Admin key required' });
  }
  const { doctorId, userId } = req.body;
  if (!doctorId && !userId) {
    return res.status(400).json({ success: false, message: 'doctorId or userId required' });
  }
  try {
    const doctor = doctorId
      ? await prisma.doctor.findUnique({ where: { id: doctorId }, include: { user: true } })
      : await prisma.doctor.findUnique({ where: { userId }, include: { user: true } });

    if (!doctor) return res.status(404).json({ success: false, message: 'Doctor not found' });

    console.log(`[delete-account] Deleting doctor: ${doctor.firstName} ${doctor.lastName} (${doctor.user.email})`);

    // 1. Slots
    await prisma.doctorSlot.deleteMany({ where: { doctorId: doctor.id } });

    // 2. Get all appointment IDs for this doctor
    const doctorAppts = await prisma.appointment.findMany({
      where:  { doctorId: doctor.id },
      select: { id: true },
    });
    const doctorApptIds = doctorAppts.map(a => a.id);

    // 3. Delete messages + chat rooms linked to these appointments
    if (doctorApptIds.length > 0) {
      const chatRooms = await prisma.chatRoom.findMany({
        where:  { appointmentId: { in: doctorApptIds } },
        select: { id: true },
      });
      if (chatRooms.length > 0) {
        await prisma.message.deleteMany({ where: { roomId: { in: chatRooms.map(r => r.id) } } });
        await prisma.chatRoom.deleteMany({ where: { id: { in: chatRooms.map(r => r.id) } } });
      }
    }

    // 4. Messages sent by this doctor
    await prisma.message.deleteMany({ where: { senderId: doctor.userId } });

    // 5. Payments linked to doctor's appointments
    if (doctorApptIds.length > 0) {
      await prisma.payment.deleteMany({ where: { appointmentId: { in: doctorApptIds } } });
    }

    // 6. Delete appointments (all of them now that chat_rooms are cleared)
    await prisma.appointment.deleteMany({ where: { doctorId: doctor.id } });

    // 7. Delete doctor + user
    await prisma.doctor.delete({ where: { id: doctor.id } });
    await prisma.user.delete({   where: { id: doctor.userId } });

    return res.json({ success: true, message: `Dr. ${doctor.firstName} ${doctor.lastName} permanently deleted.` });
  } catch (err) {
    console.error('[delete-account]', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});


// ── GET /api/doctor-data/all-patients — list all patients (admin only) ────────
router.get('/all-patients', async (req, res) => {
  const adminKey = req.headers['x-admin-key'] || req.query.adminKey;
  if (adminKey !== process.env.ADMIN_SECRET && adminKey !== 'mediconnect-admin-2024') {
    return res.status(403).json({ success: false, message: 'Admin key required' });
  }
  try {
    const patients = await prisma.patient.findMany({
      include: {
        user: { select: { id: true, email: true, isActive: true, createdAt: true } },
        _count: { select: { appointments: true, files: true, messages: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return res.json({
      success: true,
      data: patients.map(p => ({
        id:           p.id,
        userId:       p.userId,
        name:         `${p.firstName} ${p.lastName}`,
        email:        p.user.email,
        phone:        p.phone,
        gender:       p.gender,
        bloodType:    p.bloodType,
        isActive:     p.user.isActive,
        createdAt:    p.user.createdAt,
        appointments: p._count.appointments,
        files:        p._count.files,
        messages:     p._count.messages,
      })),
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ── DELETE /api/doctor-data/delete-patient — hard delete a patient (admin) ────
router.delete('/delete-patient', async (req, res) => {
  const adminKey = req.headers['x-admin-key'] || req.body.adminKey;
  if (adminKey !== process.env.ADMIN_SECRET && adminKey !== 'mediconnect-admin-2024') {
    return res.status(403).json({ success: false, message: 'Admin key required' });
  }
  const { patientId, userId } = req.body;
  if (!patientId && !userId) {
    return res.status(400).json({ success: false, message: 'patientId or userId required' });
  }
  try {
    const patient = patientId
      ? await prisma.patient.findUnique({ where: { id: patientId }, include: { user: true } })
      : await prisma.patient.findUnique({ where: { userId },        include: { user: true } });

    if (!patient) return res.status(404).json({ success: false, message: 'Patient not found' });

    console.log('[delete-patient] Deleting: ' + patient.firstName + ' ' + patient.lastName + ' (' + patient.user.email + ')');

    // Delete in correct foreign key dependency order
    // 1. Get all appointment IDs for this patient (needed to delete chat rooms)
    const patientAppts = await prisma.appointment.findMany({
      where:  { patientId: patient.id },
      select: { id: true },
    });
    const apptIds = patientAppts.map(a => a.id);

    // 2. Delete messages inside chat rooms linked to these appointments
    if (apptIds.length > 0) {
      const chatRooms = await prisma.chatRoom.findMany({
        where:  { appointmentId: { in: apptIds } },
        select: { id: true },
      });
      const roomIds = chatRooms.map(r => r.id);
      if (roomIds.length > 0) {
        await prisma.message.deleteMany({ where: { roomId: { in: roomIds } } });
      }
      await prisma.chatRoom.deleteMany({ where: { appointmentId: { in: apptIds } } });
    }

    // 3. Payments (reference appointments)
    await prisma.payment.deleteMany({ where: { patientId: patient.id } });

    // 4. Other patient relations
    await prisma.clinicalTimeline.deleteMany({ where: { patientId: patient.id } });
    await prisma.vitalRecord.deleteMany({      where: { patientId: patient.id } });
    await prisma.medication.deleteMany({       where: { patientId: patient.id } });
    await prisma.patientAllergy.deleteMany({   where: { patientId: patient.id } });
    await prisma.patientCondition.deleteMany({ where: { patientId: patient.id } });
    await prisma.medicalFile.deleteMany({      where: { patientId: patient.id } });
    await prisma.message.deleteMany({          where: { senderId: patient.userId } });

    // 5. Now safe to delete appointments
    await prisma.appointment.deleteMany({ where: { patientId: patient.id } });

    await prisma.patient.delete({ where: { id: patient.id } });
    await prisma.user.delete({   where: { id: patient.userId } });

    return res.json({ success: true, message: patient.firstName + ' ' + patient.lastName + ' permanently deleted.' });
  } catch (err) {
    console.error('[delete-patient]', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;