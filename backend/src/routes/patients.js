/**
 * patients.js — FINAL VERSION
 * Schema facts:
 *   Patient: id, userId, firstName, lastName, dateOfBirth, gender, phone,
 *            bloodType, address, photoUrl
 *   NO patientProfile sub-model (Patient IS the profile)
 *   NO chronicConditions string — use PatientCondition relation
 *   NO bloodGroup — field is bloodType on Patient
 *   Appointments: via Appointment model, NOT patientAppointments relation
 *   Doctor search: via prisma.doctor, NOT prisma.user with doctorProfile
 */

const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const authenticate = require('../middleware/auth');
const { searchMedicalHistory } = require('../services/aiService');

const prisma = new PrismaClient();

const authorize = (...roles) => (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  if (roles.flat().length && !roles.flat().includes(req.user.role))
    return res.status(403).json({ error: 'Forbidden' });
  next();
};

// Helper — get User.id from JWT regardless of field name
function getUserId(req) {
  const u = req.user || {};
  return u.id || u.userId || u.user_id || u.sub || u._id || null;
}

// ── GET /api/patients/search  (doctor only) ───────────────────────────────────
router.get('/search', authenticate, authorize('DOCTOR'), async (req, res) => {
  try {
    const { q, page = 1, limit = 10 } = req.query;
    if (!q || q.trim().length < 2)
      return res.status(400).json({ error: 'Search query must be at least 2 characters.' });

    // Get Doctor.id for this user
    const doctorRecord = await prisma.doctor.findUnique({ where: { userId: getUserId(req) } });
    if (!doctorRecord) return res.status(404).json({ error: 'Doctor profile not found.' });

    // Find Patient.ids who have appointments with this doctor
    const apptRows = await prisma.appointment.findMany({
      where:    { doctorId: doctorRecord.id },
      select:   { patientId: true },
      distinct: ['patientId'],
    });
    const patientIds = apptRows.map(r => r.patientId);

    const patients = await prisma.patient.findMany({
      where: {
        id: { in: patientIds },
        OR: [
          { firstName: { contains: q, mode: 'insensitive' } },
          { lastName:  { contains: q, mode: 'insensitive' } },
          { phone:     { contains: q, mode: 'insensitive' } },
        ],
      },
      include: {
        conditions: { where: { isActive: true }, select: { condition: true } },
        allergies:  { select: { allergen: true, severity: true } },
      },
      skip: (parseInt(page) - 1) * parseInt(limit),
      take: parseInt(limit),
    });

    return res.json({ success: true, data: patients, query: q });
  } catch (err) {
    console.error('[GET /patients/search] ERROR:', err.message);
    return res.status(500).json({ error: 'Search failed.', detail: err.message });
  }
});

// ── GET /api/patients  (doctor — all my patients) ─────────────────────────────
router.get('/', authenticate, authorize('DOCTOR'), async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;

    const doctorRecord = await prisma.doctor.findUnique({ where: { userId: getUserId(req) } });
    if (!doctorRecord) return res.json({ success: true, data: [], total: 0 });

    const apptRows = await prisma.appointment.findMany({
      where:    { doctorId: doctorRecord.id },
      select:   { patientId: true },
      distinct: ['patientId'],
    });
    const patientIds = apptRows.map(r => r.patientId);

    const patients = await prisma.patient.findMany({
      where:   { id: { in: patientIds } },
      include: {
        conditions: { where: { isActive: true }, select: { condition: true } },
        allergies:  { select: { allergen: true } },
        vitals:     { orderBy: { recordedAt: 'desc' }, take: 1 },
      },
      orderBy: { createdAt: 'desc' },
      skip:    (parseInt(page) - 1) * parseInt(limit),
      take:    parseInt(limit),
    });

    return res.json({ success: true, data: patients, total: patientIds.length });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch patients.', detail: err.message });
  }
});

// ── GET /api/patients/:id  (doctor — patient detail) ─────────────────────────
router.get('/:id', authenticate, authorize('DOCTOR'), async (req, res) => {
  try {
    const doctorRecord = await prisma.doctor.findUnique({ where: { userId: getUserId(req) } });
    if (!doctorRecord) return res.status(403).json({ error: 'Doctor profile not found.' });

    const hasAccess = await prisma.appointment.findFirst({
      where: { doctorId: doctorRecord.id, patientId: req.params.id },
    });
    if (!hasAccess) return res.status(403).json({ error: 'No relationship with this patient.' });

    const patient = await prisma.patient.findUnique({
      where:   { id: req.params.id },
      include: {
        conditions:  { where: { isActive: true } },
        allergies:   true,
        medications: { where: { isActive: true } },
        vitals:      { orderBy: { recordedAt: 'desc' }, take: 5 },
        files:       { orderBy: { createdAt: 'desc' }, take: 20 },
        timeline:    { orderBy: { occurredAt: 'desc' }, take: 10 },
      },
    });
    if (!patient) return res.status(404).json({ error: 'Patient not found.' });

    return res.json({ success: true, data: patient });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch patient.', detail: err.message });
  }
});

// ── GET /api/patients/:id/history ─────────────────────────────────────────────
router.get('/:id/history', authenticate, authorize('DOCTOR'), async (req, res) => {
  try {
    const doctorRecord = await prisma.doctor.findUnique({ where: { userId: getUserId(req) } });
    if (!doctorRecord) return res.status(403).json({ error: 'Doctor profile not found.' });

    const hasAccess = await prisma.appointment.findFirst({
      where: { doctorId: doctorRecord.id, patientId: req.params.id },
    });
    if (!hasAccess) return res.status(403).json({ error: 'Access denied.' });

    const [patient, appointments, files, chatRoom] = await Promise.all([
      prisma.patient.findUnique({
        where:   { id: req.params.id },
        include: { conditions: true, allergies: true, medications: true, vitals: { orderBy: { recordedAt: 'desc' }, take: 5 } },
      }),
      prisma.appointment.findMany({
        where:   { patientId: req.params.id, doctorId: doctorRecord.id },
        orderBy: { scheduledAt: 'desc' },
        include: { payment: { select: { status: true, amount: true } } },
      }),
      prisma.medicalFile.findMany({
        where:   { patientId: req.params.id },
        orderBy: { createdAt: 'desc' },
      }),
      // ChatRoom linked via appointment — find the most recent one
      prisma.chatRoom.findFirst({
        where: { appointment: { patientId: req.params.id, doctorId: doctorRecord.id } },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return res.json({
      success: true,
      data: { patient, appointments, files, chatRoomId: chatRoom?.id || null },
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch patient history.', detail: err.message });
  }
});

// ── GET /api/patients/:id/files ───────────────────────────────────────────────
router.get('/:id/files', authenticate, async (req, res) => {
  try {
    const userId = getUserId(req);
    const { category, page = 1, limit = 20 } = req.query;

    // Patients can see their own files; doctors must have appointment relationship
    if (req.user.role === 'PATIENT') {
      const patientRecord = await prisma.patient.findUnique({ where: { userId } });
      if (!patientRecord || patientRecord.id !== req.params.id)
        return res.status(403).json({ error: 'Access denied.' });
    } else if (req.user.role === 'DOCTOR') {
      const doctorRecord = await prisma.doctor.findUnique({ where: { userId } });
      if (!doctorRecord) return res.status(403).json({ error: 'Doctor profile not found.' });
      const hasAccess = await prisma.appointment.findFirst({
        where: { doctorId: doctorRecord.id, patientId: req.params.id },
      });
      if (!hasAccess) return res.status(403).json({ error: 'Access denied.' });
    }

    const where = { patientId: req.params.id };
    if (category) where.category = category;

    const files = await prisma.medicalFile.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip:    (parseInt(page) - 1) * parseInt(limit),
      take:    parseInt(limit),
    });

    return res.json({ success: true, data: files });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch files.', detail: err.message });
  }
});

// ── GET /api/patients/:id/search-history  (Medical Brain Search) ──────────────
router.get('/:id/search-history', authenticate, authorize('DOCTOR'), async (req, res) => {
  try {
    const { query } = req.query;
    if (!query) return res.status(400).json({ error: 'query param is required.' });

    const doctorRecord = await prisma.doctor.findUnique({ where: { userId: getUserId(req) } });
    if (!doctorRecord) return res.status(403).json({ error: 'Doctor profile not found.' });

    const hasAccess = await prisma.appointment.findFirst({
      where: { doctorId: doctorRecord.id, patientId: req.params.id },
    });
    if (!hasAccess) return res.status(403).json({ error: 'Access denied.' });

    const results = await searchMedicalHistory(query, req.params.id, prisma);
    return res.json({ success: true, data: results });
  } catch (err) {
    return res.status(500).json({ error: 'Search failed.', detail: err.message });
  }
});

// ── POST /api/patients/add  (doctor adds a new patient) ──────────────────────
router.post('/add', authenticate, authorize('DOCTOR'), async (req, res) => {
  try {
    const { email, firstName, lastName, phone, dateOfBirth, gender, bloodType } = req.body;
    if (!email || !firstName || !lastName)
      return res.status(400).json({ error: 'email, firstName, and lastName are required.' });

    // Check if User already exists
    let user = await prisma.user.findUnique({ where: { email } });

    if (user) {
      const existingPatient = await prisma.patient.findUnique({ where: { userId: user.id } });
      return res.json({
        success: true,
        message: 'Patient already registered.',
        data: existingPatient || { userId: user.id },
        alreadyExists: true,
      });
    }

    // Create new User + Patient
    const bcrypt = require('bcryptjs');
    const tempPassword = Math.random().toString(36).slice(-8);
    const passwordHash = await bcrypt.hash(tempPassword, 12);

    user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        role: 'PATIENT',
      },
    });

    const patient = await prisma.patient.create({
      data: {
        userId:      user.id,
        firstName:   firstName.trim(),
        lastName:    lastName.trim(),
        phone:       phone || '',
        gender:      gender || 'Other',
        dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : new Date('2000-01-01'),
        bloodType:   bloodType || null,
      },
    });

    return res.status(201).json({
      success: true,
      message: 'Patient account created.',
      data: patient,
      tempPassword, // In production: send via email/SMS
    });
  } catch (err) {
    console.error('[POST /patients/add] ERROR:', err.message);
    if (err.code === 'P2002') return res.status(409).json({ error: 'A patient with this email already exists.' });
    return res.status(500).json({ error: 'Failed to add patient.', detail: err.message });
  }
});

module.exports = router;
