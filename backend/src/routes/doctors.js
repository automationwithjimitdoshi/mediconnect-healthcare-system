/**
 * doctors.js — FINAL VERSION
 * Schema facts:
 *   Doctor model fields: id, userId, firstName, lastName, specialty,
 *     qualification, hospital, phone, consultFee(Int paise), bio,
 *     isAvailable(Boolean), photoUrl, createdAt, updatedAt
 *   DoctorSlot: id, doctorId, dayOfWeek(0-6), startTime, endTime, isActive
 *   NO doctorProfile, NO specialization, NO clinicName, NO rating, NO isVerified
 */

const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const authenticate = require('../middleware/auth');

const prisma = new PrismaClient();

const authorize = (...roles) => (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  if (roles.flat().length && !roles.flat().includes(req.user.role))
    return res.status(403).json({ error: 'Forbidden' });
  next();
};

// Helper — safe fee display (paise → rupees string)
function toRupees(paise) {
  return Math.round((paise || 0) / 100);
}

// ── GET /api/doctors ──────────────────────────────────────────────────────────
// Public — list all available doctors with optional search/filter
router.get('/', async (req, res) => {
  try {
    const { search, specialty, page = 1, limit = 12 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const where = { isAvailable: true };

    if (search) {
      where.OR = [
        { firstName:   { contains: search, mode: 'insensitive' } },
        { lastName:    { contains: search, mode: 'insensitive' } },
        { specialty:   { contains: search, mode: 'insensitive' } },
        { hospital:    { contains: search, mode: 'insensitive' } },
      ];
    }
    if (specialty) {
      where.specialty = { contains: specialty, mode: 'insensitive' };
    }

    const [doctors, total] = await Promise.all([
      prisma.doctor.findMany({
        where,
        select: {
          id:            true,
          firstName:     true,
          lastName:      true,
          specialty:     true,
          qualification: true,
          hospital:      true,
          phone:         true,
          consultFee:    true,   // paise — convert to rupees for display
          bio:           true,
          photoUrl:      true,
          isAvailable:   true,
          createdAt:     true,
          slots: {
            where: { isActive: true },
            select: { dayOfWeek: true, startTime: true, endTime: true },
          },
        },
        orderBy: { firstName: 'asc' },
        skip,
        take: parseInt(limit),
      }),
      prisma.doctor.count({ where }),
    ]);

    // Deduplicate at backend — same firstName+lastName+specialty = same person
    // Keeps the record with most complete data
    const dedupMap = new Map();
    for (const d of doctors) {
      const key = (d.firstName||'').toLowerCase().trim() + '_' +
                  (d.lastName ||'').toLowerCase().trim() + '_' +
                  (d.specialty||'').toLowerCase().trim();
      if (!dedupMap.has(key)) {
        dedupMap.set(key, d);
      } else {
        const existing = dedupMap.get(key);
        const score = r => (r.bio ? r.bio.length : 0) + (r.photoUrl ? 50 : 0) + (r.phone ? 10 : 0) + (r.hospital ? r.hospital.length : 0);
        if (score(d) > score(existing)) dedupMap.set(key, d);
      }
    }
    const deduped = [...dedupMap.values()];

    // Add consultFeeRupees convenience field
    const formatted = deduped.map(d => ({
      ...d,
      consultFeeRupees: toRupees(d.consultFee),
    }));

    return res.json({
      success: true,
      data: formatted,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: deduped.length,
        pages: Math.ceil(deduped.length / parseInt(limit)),
      },
    });
  } catch (err) {
    console.error('[GET /doctors] ERROR:', err.message);
    return res.status(500).json({ error: 'Failed to fetch doctors.', detail: err.message });
  }
});

// ── GET /api/doctors/specializations ─────────────────────────────────────────
// Public — unique list of all specialty values
router.get('/specializations', async (req, res) => {
  try {
    const docs = await prisma.doctor.findMany({
      where:    { isAvailable: true },
      select:   { specialty: true },
      distinct: ['specialty'],
      orderBy:  { specialty: 'asc' },
    });
    return res.json({
      success: true,
      data: docs.map(d => d.specialty).filter(Boolean),
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch specializations.', detail: err.message });
  }
});

// ── GET /api/doctors/:id ──────────────────────────────────────────────────────
// Public — single doctor detail
router.get('/:id', async (req, res) => {
  try {
    // Accept both Doctor.id and User.id
    let doctor = await prisma.doctor.findUnique({ where: { id: req.params.id } });
    if (!doctor) {
      doctor = await prisma.doctor.findUnique({ where: { userId: req.params.id } });
    }
    if (!doctor) return res.status(404).json({ error: 'Doctor not found' });

    const completedCount = await prisma.appointment.count({
      where: { doctorId: doctor.id, status: 'COMPLETED' },
    });

    return res.json({
      success: true,
      data: {
        ...doctor,
        consultFeeRupees:       toRupees(doctor.consultFee),
        completedAppointments:  completedCount,
      },
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch doctor.', detail: err.message });
  }
});

// ── GET /api/doctors/:id/slots ────────────────────────────────────────────────
// Public — available time slots for a given date
router.get('/:id/slots', async (req, res) => {
  try {
    const { date } = req.query;
    if (!date) return res.status(400).json({ error: 'date query param required (YYYY-MM-DD)' });

    const targetDate = new Date(date);
    if (isNaN(targetDate.getTime())) return res.status(400).json({ error: 'Invalid date format' });

    // dayOfWeek: 0=Sun … 6=Sat
    const dayOfWeek = targetDate.getDay();

    // Accept Doctor.id or User.id
    let doctor = await prisma.doctor.findUnique({ where: { id: req.params.id } });
    if (!doctor) doctor = await prisma.doctor.findUnique({ where: { userId: req.params.id } });
    if (!doctor) return res.status(404).json({ error: 'Doctor not found' });

    // Fetch active slots for this day of week
    const daySlots = await prisma.doctorSlot.findMany({
      where:   { doctorId: doctor.id, dayOfWeek, isActive: true },
      orderBy: { startTime: 'asc' },
    });

    if (daySlots.length === 0) {
      return res.json({ success: true, data: [], message: 'Doctor has no slots on this day.' });
    }

    // Find already-booked appointments on this date
    const dayStart = new Date(targetDate); dayStart.setHours(0, 0, 0, 0);
    const dayEnd   = new Date(targetDate); dayEnd.setHours(23, 59, 59, 999);

    const booked = await prisma.appointment.findMany({
      where: {
        doctorId:    doctor.id,
        scheduledAt: { gte: dayStart, lte: dayEnd },
        status:      { notIn: ['CANCELLED'] },
      },
      select: { scheduledAt: true },
    });

    // Build set of booked HH:MM strings
    const bookedTimes = new Set(
      booked.map(b => b.scheduledAt.toTimeString().slice(0, 5))
    );

    const now = new Date();

    // Map slots to available/unavailable
    const slots = daySlots.map(slot => {
      const [h, m] = slot.startTime.split(':').map(Number);
      const slotDateTime = new Date(targetDate);
      slotDateTime.setHours(h, m, 0, 0);

      return {
        time:      slot.startTime,                // "09:00"
        endTime:   slot.endTime,                  // "09:30"
        display:   slotDateTime.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }),
        available: !bookedTimes.has(slot.startTime) && slotDateTime > now,
        isoTime:   slotDateTime.toISOString(),
      };
    });

    return res.json({ success: true, data: slots });
  } catch (err) {
    console.error('[GET /doctors/:id/slots] ERROR:', err.message);
    return res.status(500).json({ error: 'Failed to fetch slots.', detail: err.message });
  }
});

// ── GET /api/doctors/:id/reviews ──────────────────────────────────────────────
// Public — completed appointments with notes as reviews
router.get('/:id/reviews', async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    let doctor = await prisma.doctor.findUnique({ where: { id: req.params.id } });
    if (!doctor) doctor = await prisma.doctor.findUnique({ where: { userId: req.params.id } });
    if (!doctor) return res.status(404).json({ error: 'Doctor not found' });

    const [reviews, total] = await Promise.all([
      prisma.appointment.findMany({
        where: { doctorId: doctor.id, status: 'COMPLETED', notes: { not: null } },
        select: {
          id:          true,
          notes:       true,
          scheduledAt: true,
          patient:     { select: { firstName: true, lastName: true } },
        },
        orderBy: { scheduledAt: 'desc' },
        skip,
        take: parseInt(limit),
      }),
      prisma.appointment.count({
        where: { doctorId: doctor.id, status: 'COMPLETED', notes: { not: null } },
      }),
    ]);

    return res.json({
      success: true,
      data: reviews,
      pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / parseInt(limit)) },
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch reviews.', detail: err.message });
  }
});

// ── PUT /api/doctors/profile/availability ─────────────────────────────────────
// Doctor — update their own availability and slots
router.put('/profile/availability', authenticate, authorize('DOCTOR'), async (req, res) => {
  try {
    const userId = req.user.id || req.user.userId || req.user.sub;
    const doctor = await prisma.doctor.findUnique({ where: { userId } });
    if (!doctor) return res.status(404).json({ error: 'Doctor profile not found' });

    const { isAvailable, slots } = req.body;
    const updateData = {};
    if (typeof isAvailable === 'boolean') updateData.isAvailable = isAvailable;

    // Update doctor availability flag
    const updated = await prisma.doctor.update({
      where: { id: doctor.id },
      data:  updateData,
    });

    // Replace slots if provided
    if (Array.isArray(slots)) {
      // Delete existing slots and recreate
      await prisma.doctorSlot.deleteMany({ where: { doctorId: doctor.id } });
      if (slots.length > 0) {
        await prisma.doctorSlot.createMany({
          data: slots.map(s => ({
            doctorId:  doctor.id,
            dayOfWeek: s.dayOfWeek,
            startTime: s.startTime,
            endTime:   s.endTime,
            isActive:  true,
          })),
        });
      }
    }

    return res.json({ success: true, message: 'Availability updated.', data: updated });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to update availability.', detail: err.message });
  }
});

module.exports = router;