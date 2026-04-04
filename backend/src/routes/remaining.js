// routes/doctors.js
const express = require('express');
const router  = express.Router();
const { PrismaClient } = require('@prisma/client');
const auth    = require('../middleware/auth');
const prisma = require('../lib/prisma');

// GET /api/doctors — list all doctors
router.get('/', async (req, res) => {
  const doctors = await prisma.doctor.findMany({
    where: { isAvailable: true },
    include: { slots: { where: { isActive: true } } },
    orderBy: { specialty: 'asc' }
  });
  res.json({ doctors });
});

// GET /api/doctors/:id/slots — available slots for date
router.get('/:id/slots', async (req, res) => {
  const { date } = req.query;
  const doctor = await prisma.doctor.findUnique({
    where: { id: req.params.id },
    include: { slots: { where: { isActive: true } } }
  });
  if (!doctor) return res.status(404).json({ error: 'Doctor not found' });

  const dayOfWeek = new Date(date + 'T00:00:00').getDay();
  const allSlots = doctor.slots.filter(s => s.dayOfWeek === dayOfWeek).map(s => s.startTime);

  // Remove booked slots
  const booked = await prisma.appointment.findMany({
    where: { doctorId: req.params.id, scheduledAt: { gte: new Date(date + 'T00:00:00'), lte: new Date(date + 'T23:59:59') }, status: { notIn: ['CANCELLED'] } }
  });
  const bookedTimes = booked.map(a => new Date(a.scheduledAt).toTimeString().slice(0,5));
  const available = allSlots.filter(s => !bookedTimes.includes(s));

  res.json({ available, booked: bookedTimes });
});

module.exports = router;

// ─────────────────────────────────────────────────────────────

// routes/patients.js — Doctor-facing patient routes
const express2 = require('express');
const router2  = express2.Router();
const { PrismaClient: PC2 } = require('@prisma/client');
const auth2    = require('../middleware/auth');
const prisma2  = new PC2();

// GET /api/patients — doctor sees all their patients
router2.get('/', auth2, async (req, res) => {
  try {
    const { search, urgency, page = 1, limit = 20 } = req.query;
    const doctor = await prisma2.doctor.findUnique({ where: { userId: req.user.userId } });
    if (!doctor) return res.status(403).json({ error: 'Doctor access required' });

    const patientIds = await prisma2.appointment.findMany({
      where: { doctorId: doctor.id },
      select: { patientId: true },
      distinct: ['patientId']
    });
    const ids = patientIds.map(p => p.patientId);

    const where = { id: { in: ids } };
    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName:  { contains: search, mode: 'insensitive' } },
        { phone:     { contains: search } }
      ];
    }

    const [patients, total] = await Promise.all([
      prisma2.patient.findMany({
        where, skip: (parseInt(page)-1)*parseInt(limit), take: parseInt(limit),
        include: { conditions: true, allergies: true, medications: { where: { isActive: true } }, vitals: { take: 1, orderBy: { recordedAt: 'desc' } } },
        orderBy: { lastName: 'asc' }
      }),
      prisma2.patient.count({ where })
    ]);

    res.json({ patients, pagination: { page: parseInt(page), limit: parseInt(limit), total } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/patients/:id — full patient detail
router2.get('/:id', auth2, async (req, res) => {
  try {
    const patient = await prisma2.patient.findUnique({
      where: { id: req.params.id },
      include: {
        conditions: true, allergies: true,
        medications: { where: { isActive: true } },
        vitals: { orderBy: { recordedAt: 'desc' }, take: 10 },
        files:  { orderBy: { createdAt: 'desc' }, take: 30 },
        timeline: { orderBy: { occurredAt: 'desc' }, take: 20 },
        appointments: { include: { doctor: { select: { firstName:true, lastName:true, specialty:true } } }, orderBy: { scheduledAt: 'desc' }, take: 10 }
      }
    });
    if (!patient) return res.status(404).json({ error: 'Patient not found' });
    res.json({ patient });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/patients/:id/timeline
router2.get('/:id/timeline', auth2, async (req, res) => {
  const timeline = await prisma2.clinicalTimeline.findMany({
    where: { patientId: req.params.id },
    orderBy: { occurredAt: 'desc' },
    take: 50
  });
  res.json({ timeline });
});

module.exports = router2;

// ─────────────────────────────────────────────────────────────

// routes/ai.js — AI endpoints
const express3 = require('express');
const router3  = express3.Router();
const { PrismaClient: PC3 } = require('@prisma/client');
const auth3    = require('../middleware/auth');
const { generateAISummary, askMedicalBrain } = require('../services/aiService');
const prisma3  = new PC3();

// GET /api/ai/summary/:patientId
router3.get('/summary/:patientId', auth3, async (req, res) => {
  try {
    const patient = await prisma3.patient.findUnique({
      where: { id: req.params.patientId },
      include: { conditions: true, medications: true, allergies: true, vitals: { take: 1, orderBy: { recordedAt: 'desc' } } }
    });
    if (!patient) return res.status(404).json({ error: 'Patient not found' });

    const summary = await generateAISummary({ patient, reason: 'General review' });

    // Cache
    await prisma3.aISummary.create({
      data: { patientId: patient.id, generatedBy: 'claude-sonnet-4-20250514', summary, urgency: 'LOW', tags: [] }
    }).catch(() => {});

    res.json({ summary });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/ai/ask — Medical Brain Q&A
router3.post('/ask', auth3, async (req, res) => {
  try {
    const { question, patientId } = req.body;
    const patient = await prisma3.patient.findUnique({
      where: { id: patientId },
      include: { conditions: true, medications: true, vitals: { take: 1, orderBy: { recordedAt: 'desc' } }, files: { take: 5 } }
    });
    const answer = await askMedicalBrain({ question, patientContext: patient });
    res.json({ answer });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router3;
