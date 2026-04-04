/**
 * appointments.js — FINAL VERSION
 * Matches schema exactly:
 *   - User.id ≠ Patient.id ≠ Doctor.id (separate tables)
 *   - Appointment.status enum: SCHEDULED | CONFIRMED | RESCHEDULED | CANCELLED | COMPLETED | NO_SHOW
 *   - Appointment.type enum: IN_PERSON | VIDEO_CALL
 *   - Payment is a separate model (not fields on Appointment)
 *   - ChatRoom linked by appointmentId (not patientId+doctorId)
 *   - No Notification model in schema
 *   - consultFee stored in paise (Int)
 */

const express = require('express');
const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');
const authenticate = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

// ─── Role guard ───────────────────────────────────────────────────────────────
const authorize = (...roles) => (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  if (roles.flat().length && !roles.flat().includes(req.user.role))
    return res.status(403).json({ error: 'Forbidden' });
  next();
};

// ─── Razorpay ─────────────────────────────────────────────────────────────────
async function createOrder(amountPaise) {
  const keyId  = process.env.RAZORPAY_KEY_ID;
  const secret = process.env.RAZORPAY_KEY_SECRET;
  // No keys → dev/mock mode
  if (!keyId || !secret) {
    console.log('[Razorpay] No keys set — using mock order');
    return { id: 'order_mock_' + Date.now(), amount: amountPaise, currency: 'INR', mock: true };
  }
  try {
    const Razorpay = require('razorpay');
    const order = await new Razorpay({ key_id: keyId, key_secret: secret })
      .orders.create({ amount: amountPaise, currency: 'INR', receipt: 'rcpt_' + Date.now() });
    return order;
  } catch (rzpErr) {
    // Razorpay SDK throws plain objects, not Error instances — normalise them
    const msg = (rzpErr && rzpErr.error && rzpErr.error.description)
      || (rzpErr && rzpErr.message)
      || JSON.stringify(rzpErr);
    console.error('[Razorpay] createOrder failed:', msg, '— falling back to mock order');
    // Fall back to mock so the appointment can still be created
    return { id: 'order_mock_' + Date.now(), amount: amountPaise, currency: 'INR', mock: true };
  }
}

function verifySignature(orderId, paymentId, signature) {
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!secret || !orderId || orderId.startsWith('order_mock_')) return true; // dev bypass
  const expected = crypto.createHmac('sha256', secret)
    .update(orderId + '|' + paymentId).digest('hex');
  return expected === signature;
}

async function issueRefund(razorpayPaymentId, amountPaise) {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !secret || razorpayPaymentId.startsWith('mock_'))
    return { id: 'rfnd_mock_' + Date.now() };
  const Razorpay = require('razorpay');
  return new Razorpay({ key_id: keyId, key_secret: secret })
    .payments.refund(razorpayPaymentId, { amount: amountPaise });
}

// ─── Socket emit helper (never crashes the main flow) ────────────────────────
function emit(req, room, event, data) {
  try { const io = req.app.get('io'); if (io) io.to(room).emit(event, data); } catch (_) {}
}

// ─── Extract User.id safely from JWT (handles any field name) ─────────────────
function getUserId(req) {
  const u = req.user || {};
  const id = u.userId || u.id || u.user_id || u.sub || u._id || null; // JWT signs { userId }
  if (!id) {
    console.error('[AUTH] req.user fields:', Object.keys(u));
    console.error('[AUTH] req.user value:', JSON.stringify(u));
    throw new Error('Cannot extract user ID from JWT. See backend console for req.user structure.');
  }
  return id;
}

// ─── Lookup helpers — resolve User.id -> Patient/Doctor record ────────────────
async function getPatientByUserId(userId) {
  return prisma.patient.findUnique({ where: { userId } });
}
async function getDocRecord(idFromFrontend) {
  let doc = null;
  try { doc = await prisma.doctor.findUnique({ where: { id: idFromFrontend } }); } catch (_) {}
  if (!doc) {
    try { doc = await prisma.doctor.findUnique({ where: { userId: idFromFrontend } }); } catch (_) {}
  }
  return doc;
}

// ═════════════════════════════════════════════════════════════════════════════
// POST /api/appointments  — create appointment + Razorpay order
// ═════════════════════════════════════════════════════════════════════════════
router.post('/', authenticate, authorize('PATIENT'), async (req, res) => {
  try {
    // ── 1. Parse body (accept multiple field name variants) ──────────────────
    const doctorIdInput = req.body.doctorId;
    const rawDate       = req.body.scheduledAt || req.body.appointmentDate;
    const reason        = req.body.reason || req.body.notes || null;
    // Map any frontend type value → valid schema enum
    const rawType = (req.body.type || '').toUpperCase();
    const apptType = rawType === 'VIDEO_CALL' || rawType === 'VIDEO' ? 'VIDEO_CALL' : 'IN_PERSON';

    // ── 2. Validate inputs ───────────────────────────────────────────────────
    if (!doctorIdInput) {
      return res.status(400).json({ error: 'doctorId is required' });
    }
    if (!rawDate) {
      return res.status(400).json({ error: 'scheduledAt (date & time) is required' });
    }
    const scheduledAt = new Date(rawDate);
    if (isNaN(scheduledAt.getTime())) {
      return res.status(400).json({ error: 'Invalid date format for scheduledAt' });
    }
    // Allow 10-minute grace period to handle timezone/clock drift
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000);
    if (scheduledAt < tenMinAgo) {
      return res.status(400).json({
        error: 'Selected time is in the past. Please pick a future date and time.',
        scheduledAt: scheduledAt.toISOString(),
        serverNow:   new Date().toISOString(),
        hint: 'If you see this for a future date, your device clock may be out of sync.',
      });
    }

    // ── 3. Resolve Patient record (User.id → Patient.id) ────────────────────
    const patient = await getPatientByUserId(getUserId(req));
    if (!patient) {
      return res.status(404).json({
        error: 'Patient profile not found for your account.',
        fix:   'Your user account exists but has no Patient profile. This usually means registration did not complete fully. Please log out, re-register, or contact support.',
      });
    }

    // ── 4. Resolve Doctor record (accepts Doctor.id or User.id) ─────────────
    console.log('[BOOKING] doctorIdInput received from frontend:', doctorIdInput);
    console.log('[BOOKING] Looking up doctor...');

    const doctor = await getDocRecord(doctorIdInput);

    if (!doctor) {
      // Log ALL doctors in DB so you can see what IDs actually exist
      const allDoctors = await prisma.doctor.findMany({ select: { id: true, userId: true, firstName: true, lastName: true } });
      console.error('[BOOKING] Doctor NOT found. ID sent:', doctorIdInput);
      console.error('[BOOKING] All doctors in DB:', JSON.stringify(allDoctors, null, 2));

      return res.status(404).json({
        error: 'Doctor not found.',
        doctorIdReceived: doctorIdInput,
        doctorsInDB: allDoctors.map(d => ({ id: d.id, userId: d.userId, name: d.firstName + ' ' + d.lastName })),
        fix: allDoctors.length === 0
          ? 'NO DOCTORS IN DATABASE. Run: node prisma/seed.js  to add test data.'
          : 'Doctor ID mismatch. The frontend sent an ID that does not match any Doctor.id or Doctor.userId in the database.',
      });
    }
    console.log('[BOOKING] Doctor found:', doctor.firstName, doctor.lastName, '| Doctor.id:', doctor.id);

    // ── 5. Slot conflict check (±30 min window) ──────────────────────────────
    const winStart = new Date(scheduledAt.getTime() - 30 * 60 * 1000);
    const winEnd   = new Date(scheduledAt.getTime() + 30 * 60 * 1000);
    const conflict = await prisma.appointment.findFirst({
      where: {
        doctorId:    doctor.id,
        scheduledAt: { gte: winStart, lte: winEnd },
        status:      { notIn: ['CANCELLED'] },
      },
    });
    if (conflict) {
      return res.status(409).json({ error: 'This time slot is already booked. Please choose a different time.' });
    }

    // ── 6. Create Razorpay order ─────────────────────────────────────────────
    // consultFee is stored in paise in schema (Int). Send paise to Razorpay.
    const amountPaise = doctor.consultFee || 50000; // default ₹500
    const order = await createOrder(amountPaise);

    // ── 7. Create Appointment (ONLY fields that exist in schema) ─────────────
    const appointment = await prisma.appointment.create({
      data: {
        patientId:   patient.id,      // Patient.id — NOT User.id
        doctorId:    doctor.id,       // Doctor.id  — NOT User.id
        scheduledAt: scheduledAt,
        type:        apptType,        // IN_PERSON | VIDEO_CALL
        status:      'SCHEDULED',     // First valid enum value (not PENDING)
        reason:      reason,          // reason field exists on Appointment
        // duration, urgency, aiSummary etc. use schema defaults
      },
      include: {
        patient: { select: { id: true, firstName: true, lastName: true, phone: true } },
        doctor:  { select: { id: true, firstName: true, lastName: true, specialty: true, hospital: true, consultFee: true } },
      },
    });

    // ── 8. Create Payment record (separate model — NOT fields on Appointment) ─
    await prisma.payment.create({
      data: {
        appointmentId:   appointment.id,
        patientId:       patient.id,
        amount:          amountPaise,
        currency:        'INR',
        status:          'PENDING',
        razorpayOrderId: order.id,
      },
    });

    // ── 9. Create ChatRoom immediately so patient can message doctor right away
    //    (also created on payment verify — upsert handles duplicates)
    try {
      await prisma.chatRoom.upsert({
        where:  { appointmentId: appointment.id },
        update: {},
        create: { appointmentId: appointment.id },
      });
    } catch (e) {
      console.warn('[BOOKING] ChatRoom create warning (non-fatal):', e.message);
    }

    // ── 10. Notify doctor via socket (non-blocking, non-fatal) ───────────────
    emit(req, 'user-' + doctor.userId, 'new-appointment', {
      appointmentId: appointment.id,
      patient: patient.firstName + ' ' + patient.lastName,
      time: scheduledAt.toLocaleString('en-IN'),
    });

    // ── 10. Respond ──────────────────────────────────────────────────────────
    // Flatten response so frontend can read d.appointment and d.order directly
    return res.status(201).json({
      success:     true,
      message:     'Appointment created. Complete payment to confirm.',
      appointment: appointment,
      appointmentId: appointment.id,
      order: {
        id:       order.id,
        amount:   order.amount,   // paise
        currency: 'INR',
        keyId:    process.env.RAZORPAY_KEY_ID || '',
        mock:     order.mock || false,
      },
      // Also nest under data for backward compat
      data: {
        appointment,
        razorpayOrder: {
          id:       order.id,
          amount:   order.amount,
          currency: 'INR',
          keyId:    process.env.RAZORPAY_KEY_ID || '',
        },
      },
    });

  } catch (err) {
    console.error('\n[APPOINTMENTS POST] ERROR:', err.message);
    if (err.meta)  console.error('[APPOINTMENTS POST] Meta:', JSON.stringify(err.meta));
    console.error('[APPOINTMENTS POST] Code:', err.code);

    if (err.code === 'P2002') {
      return res.status(409).json({ error: 'This slot was just taken. Please choose another time.' });
    }
    if (err.code === 'P2003') {
      return res.status(400).json({ error: 'Invalid patient or doctor reference.', detail: err.meta });
    }
    return res.status(500).json({
      error: 'Failed to create appointment.',
      detail: err.message,       // shown in browser network tab — tells you exactly what failed
      code: err.code || null,
    });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// POST /api/appointments/payment/verify
// ═════════════════════════════════════════════════════════════════════════════
router.post('/payment/verify', authenticate, async (req, res) => {
  try {
    const appointmentId = req.body.appointmentId;
    const orderId    = req.body.razorpay_order_id   || req.body.razorpayOrderId;
    const paymentId  = req.body.razorpay_payment_id || req.body.razorpayPaymentId;
    const signature  = req.body.razorpay_signature  || req.body.razorpaySignature;

    if (!appointmentId) return res.status(400).json({ error: 'appointmentId is required' });

    if (!verifySignature(orderId, paymentId, signature)) {
      return res.status(400).json({ error: 'Invalid payment signature. Payment not verified.' });
    }

    // Update appointment to CONFIRMED
    const appointment = await prisma.appointment.update({
      where: { id: appointmentId },
      data:  { status: 'CONFIRMED' },
      include: {
        patient: { select: { id: true, firstName: true, lastName: true, userId: true } },
        doctor:  { select: { id: true, firstName: true, lastName: true, userId: true } },
      },
    });

    // Update Payment record
    await prisma.payment.update({
      where: { appointmentId },
      data: {
        status:             'PAID',
        razorpayPaymentId:  paymentId || ('mock_' + Date.now()),
        razorpaySignature:  signature || null,
        paidAt:             new Date(),
      },
    });

    // Create ChatRoom linked to this appointment (unique by appointmentId)
    await prisma.chatRoom.upsert({
      where:  { appointmentId },
      update: {},
      create: { appointmentId },
    });

    // Notify via socket
    emit(req, 'user-' + appointment.doctor.userId,  'appointment-confirmed', { appointmentId });
    emit(req, 'user-' + appointment.patient.userId, 'appointment-confirmed', { appointmentId });

    return res.json({
      success: true,
      message: 'Payment verified. Appointment confirmed!',
      data: appointment,
    });

  } catch (err) {
    console.error('[PAYMENT VERIFY] ERROR:', err.message);
    return res.status(500).json({ error: 'Payment verification failed.', detail: err.message });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// GET /api/appointments  — list with pagination
// ═════════════════════════════════════════════════════════════════════════════
router.get('/', authenticate, async (req, res) => {
  try {
    const { status, page = 1, limit = 200 } = req.query;
    const where = {};

    if (req.user.role === 'PATIENT') {
      const p = await getPatientByUserId(getUserId(req));
      if (!p) return res.json({ success: true, data: [], pagination: { total: 0, page: 1, pages: 0 } });
      where.patientId = p.id;
    } else if (req.user.role === 'DOCTOR') {
      const d = await prisma.doctor.findUnique({ where: { userId: getUserId(req) } });
      if (!d) return res.json({ success: true, data: [], pagination: { total: 0, page: 1, pages: 0 } });
      where.doctorId = d.id;
    }

    if (status) where.status = status;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [appointments, total] = await Promise.all([
      prisma.appointment.findMany({
        where,
        include: {
          patient:  { select: { id: true, firstName: true, lastName: true, phone: true } },
          doctor:   { select: { id: true, firstName: true, lastName: true, specialty: true, hospital: true, consultFee: true } },
          payment:  { select: { status: true, amount: true, paidAt: true } },
          chatRoom: { select: { id: true } }, // needed for Complete modal auto-fill
        },
        orderBy: { scheduledAt: 'desc' },
        skip,
        take: parseInt(limit),
      }),
      prisma.appointment.count({ where }),
    ]);

    return res.json({
      success: true,
      data: appointments,
      appointments,          // alias — frontend reads d.appointments
      pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / parseInt(limit)) },
    });
  } catch (err) {
    console.error('[GET /appointments] ERROR:', err.message);
    return res.status(500).json({ error: 'Failed to fetch appointments.', detail: err.message });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// GET /api/appointments/upcoming
// ═════════════════════════════════════════════════════════════════════════════
router.get('/upcoming', authenticate, async (req, res) => {
  try {
    const where = {
      scheduledAt: { gte: new Date() },
      status: { in: ['SCHEDULED', 'CONFIRMED', 'RESCHEDULED'] },
    };

    if (req.user.role === 'PATIENT') {
      const p = await getPatientByUserId(getUserId(req));
      if (!p) return res.json({ success: true, data: [] });
      where.patientId = p.id;
    } else {
      const d = await prisma.doctor.findUnique({ where: { userId: getUserId(req) } });
      if (!d) return res.json({ success: true, data: [] });
      where.doctorId = d.id;
    }

    const appointments = await prisma.appointment.findMany({
      where,
      include: {
        patient: { select: { id: true, firstName: true, lastName: true, phone: true } },
        doctor:  { select: { id: true, firstName: true, lastName: true, specialty: true } },
        payment: { select: { status: true, amount: true } },
      },
      orderBy: { scheduledAt: 'asc' },
      take: 5,
    });

    return res.json({ success: true, data: appointments, appointments });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch upcoming appointments.', detail: err.message });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// GET /api/appointments/stats  (doctor only)
// ═════════════════════════════════════════════════════════════════════════════
router.get('/stats', authenticate, authorize('DOCTOR'), async (req, res) => {
  try {
    const doc = await prisma.doctor.findUnique({ where: { userId: getUserId(req) } });
    if (!doc) return res.json({ success: true, data: { total: 0, today: 0, upcoming: 0, completed: 0, revenue: 0 } });

    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const todayEnd   = new Date(); todayEnd.setHours(23, 59, 59, 999);

    const [total, today, upcoming, completed, revenue] = await Promise.all([
      prisma.appointment.count({ where: { doctorId: doc.id } }),
      prisma.appointment.count({ where: { doctorId: doc.id, scheduledAt: { gte: todayStart, lte: todayEnd } } }),
      prisma.appointment.count({ where: { doctorId: doc.id, scheduledAt: { gt: new Date() }, status: { in: ['SCHEDULED', 'CONFIRMED'] } } }),
      prisma.appointment.count({ where: { doctorId: doc.id, status: 'COMPLETED' } }),
      prisma.payment.aggregate({ where: { appointment: { doctorId: doc.id }, status: 'PAID' }, _sum: { amount: true } }),
    ]);

    return res.json({
      success: true,
      data: {
        total, today, upcoming, completed,
        revenue: Math.round((revenue._sum.amount || 0) / 100), // paise → rupees
      },
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch stats.', detail: err.message });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// GET /api/appointments/:id
// ═════════════════════════════════════════════════════════════════════════════
router.get('/:id', authenticate, async (req, res) => {
  try {
    const appt = await prisma.appointment.findUnique({
      where: { id: req.params.id },
      include: {
        patient:  true,
        doctor:   true,
        payment:  true,
        chatRoom: true,
      },
    });
    if (!appt) return res.status(404).json({ error: 'Appointment not found' });

    // Access control
    const [pt, dr] = await Promise.all([
      prisma.patient.findUnique({ where: { id: appt.patientId }, select: { userId: true } }),
      prisma.doctor.findUnique({  where: { id: appt.doctorId  }, select: { userId: true } }),
    ]);
    if (pt?.userId !== getUserId(req) && dr?.userId !== getUserId(req)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    return res.json({ success: true, data: appt });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch appointment.', detail: err.message });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// GET /api/appointments/:id/ai-summary  (doctor only)
// ═════════════════════════════════════════════════════════════════════════════
router.get('/:id/ai-summary', authenticate, authorize('DOCTOR'), async (req, res) => {
  try {
    const { generatePreAppointmentSummary } = require('../services/aiService');

    const appt = await prisma.appointment.findUnique({
      where: { id: req.params.id },
      include: {
        patient: {
          include: {
            conditions:  { where: { isActive: true } },
            allergies:   true,
            medications: { where: { isActive: true } },
            vitals:      { orderBy: { recordedAt: 'desc' }, take: 1 },
            files:       { orderBy: { createdAt: 'desc' }, take: 5 },
          },
        },
      },
    });

    if (!appt) return res.status(404).json({ error: 'Appointment not found' });

    const doc = await prisma.doctor.findUnique({ where: { userId: getUserId(req) }, select: { id: true } });
    if (!doc || appt.doctorId !== doc.id) return res.status(403).json({ error: 'Access denied' });

    if (appt.aiSummary) return res.json({ success: true, data: appt.aiSummary, cached: true });

    const summary = await generatePreAppointmentSummary(appt.patient, appt, appt.patient?.files || []);
    await prisma.appointment.update({ where: { id: req.params.id }, data: { aiSummary: typeof summary === 'string' ? summary : JSON.stringify(summary) } });

    return res.json({ success: true, data: summary, cached: false });
  } catch (err) {
    console.error('[AI SUMMARY] ERROR:', err.message);
    return res.status(500).json({ error: 'Failed to generate AI summary.', detail: err.message });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// PUT /api/appointments/:id/reschedule
// ═════════════════════════════════════════════════════════════════════════════
router.put('/:id/reschedule', authenticate, async (req, res) => {
  try {
    const rawDate = req.body.scheduledAt || req.body.appointmentDate;
    if (!rawDate) return res.status(400).json({ error: 'New scheduledAt is required' });

    const newTime = new Date(rawDate);
    if (isNaN(newTime.getTime())) return res.status(400).json({ error: 'Invalid date format' });
    if (newTime < new Date())     return res.status(400).json({ error: 'Cannot reschedule to a past time' });

    const appt = await prisma.appointment.findUnique({ where: { id: req.params.id } });
    if (!appt) return res.status(404).json({ error: 'Appointment not found' });
    if (['CANCELLED', 'COMPLETED', 'NO_SHOW'].includes(appt.status)) {
      return res.status(400).json({ error: `Cannot reschedule a ${appt.status} appointment` });
    }

    const updated = await prisma.appointment.update({
      where: { id: req.params.id },
      data: {
        scheduledAt:     newTime,
        status:          'RESCHEDULED',
        rescheduledFrom: appt.scheduledAt,
        aiSummary:       null,
      },
    });

    return res.json({ success: true, message: 'Appointment rescheduled.', data: updated });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to reschedule.', detail: err.message });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// PUT /api/appointments/:id/cancel
// ═════════════════════════════════════════════════════════════════════════════
router.put('/:id/cancel', authenticate, async (req, res) => {
  try {
    const appt = await prisma.appointment.findUnique({
      where:   { id: req.params.id },
      include: { payment: true },
    });
    if (!appt) return res.status(404).json({ error: 'Appointment not found' });
    if (['CANCELLED', 'COMPLETED'].includes(appt.status)) {
      return res.status(400).json({ error: `Appointment is already ${appt.status}` });
    }

    // Process refund if paid
    let refundId = null;
    if (appt.payment?.status === 'PAID' && appt.payment?.razorpayPaymentId) {
      try {
        const refund = await issueRefund(appt.payment.razorpayPaymentId, appt.payment.amount);
        refundId = refund.id;
        await prisma.payment.update({
          where: { appointmentId: appt.id },
          data:  { status: 'REFUNDED', refundId },
        });
      } catch (e) {
        console.error('[CANCEL] Refund failed (non-fatal):', e.message);
      }
    }

    const updated = await prisma.appointment.update({
      where: { id: req.params.id },
      data:  { status: 'CANCELLED', cancelReason: req.body.reason || null },
    });

    return res.json({
      success: true,
      message: 'Appointment cancelled.',
      data: updated,
      refund: { processed: !!refundId, refundId },
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to cancel.', detail: err.message });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// PUT /api/appointments/:id/complete  (doctor only)
// ═════════════════════════════════════════════════════════════════════════════
router.put('/:id/complete', authenticate, authorize('DOCTOR'), async (req, res) => {
  try {
    const appt = await prisma.appointment.findUnique({ where: { id: req.params.id } });
    if (!appt) return res.status(404).json({ error: 'Appointment not found' });
    if (appt.status === 'CANCELLED') return res.status(400).json({ error: 'Cannot complete a cancelled appointment' });

    const updateData = { status: 'COMPLETED' };
    // Only set fields that exist in schema
    if (req.body.notes)  updateData.notes  = req.body.notes;
    if (req.body.reason) updateData.reason = req.body.reason;

    const updated = await prisma.appointment.update({ where: { id: req.params.id }, data: updateData });
    return res.json({ success: true, message: 'Appointment completed.', data: updated });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to complete appointment.', detail: err.message });
  }
});


// ── GET /api/appointments/critical-alerts  (Feature B — Red Flag AI) ──────────
router.get('/critical-alerts', authenticate, authorize('DOCTOR'), async (req, res) => {
  try {
    const doc = await prisma.doctor.findUnique({ where: { userId: getUserId(req) } });
    if (!doc) return res.json({ success: true, data: [] });

    const urgentMessages = await prisma.message.findMany({
      where: {
        isUrgent: true,
        isRead:   false,
        chatRoom: { appointment: { doctorId: doc.id } },
      },
      include: {
        chatRoom: {
          include: {
            appointment: {
              include: { patient: { select: { firstName: true, lastName: true } } },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    const alerts = urgentMessages.map(m => ({
      messageId:  m.id,
      chatRoomId: m.chatRoomId,
      patient:    m.chatRoom?.appointment?.patient,
      content:    m.content,
      redFlags:   m.aiExtract ? (() => { try { return JSON.parse(m.aiExtract)?.redFlags || []; } catch(_) { return []; } })() : [],
      createdAt:  m.createdAt,
    }));

    res.json({ success: true, data: alerts });
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch alerts', detail: e.message });
  }
});



// ═════════════════════════════════════════════════════════════════════════════
// PUT /api/appointments/:id/confirm  (doctor only)
// Doctor accepts/confirms a SCHEDULED appointment
// ═════════════════════════════════════════════════════════════════════════════
router.put('/:id/confirm', authenticate, authorize('DOCTOR'), async (req, res) => {
  try {
    const { id } = req.params;
    const userId  = getUserId(req);

    const appt = await prisma.appointment.findUnique({
      where:   { id },
      include: {
        doctor:  { select: { userId: true, firstName: true, lastName: true } },
        patient: { select: { userId: true, firstName: true, lastName: true } },
      },
    });

    if (!appt) return res.status(404).json({ error: 'Appointment not found' });

    // Only the assigned doctor can confirm
    if (appt.doctor.userId !== userId) {
      return res.status(403).json({ error: 'Only the assigned doctor can confirm this appointment' });
    }

    if (appt.status === 'CONFIRMED') {
      return res.status(400).json({ error: 'Appointment is already confirmed' });
    }
    if (['CANCELLED', 'COMPLETED'].includes(appt.status)) {
      return res.status(400).json({ error: `Cannot confirm a ${appt.status.toLowerCase()} appointment` });
    }

    const updated = await prisma.appointment.update({
      where: { id },
      data:  { status: 'CONFIRMED' },
    });

    // Ensure chat room exists so patient can message immediately
    await prisma.chatRoom.upsert({
      where:  { appointmentId: id },
      update: {},
      create: { appointmentId: id },
    });

    // Notify patient via socket
    try {
      emit(req, 'user-' + appt.patient.userId, 'appointment-confirmed', {
        appointmentId: id,
        doctorName:    `Dr. ${appt.doctor.firstName} ${appt.doctor.lastName}`,
      });
    } catch (e) { console.warn('[confirm] socket emit failed:', e.message); }

    return res.json({ success: true, message: 'Appointment confirmed.', data: updated });
  } catch (err) {
    console.error('[confirm]', err.message);
    return res.status(500).json({ error: 'Failed to confirm appointment.', detail: err.message });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// PUT /api/appointments/:id/no-show  (doctor only)
// ═════════════════════════════════════════════════════════════════════════════
router.put('/:id/no-show', authenticate, authorize('DOCTOR'), async (req, res) => {
  try {
    const { id } = req.params;
    const appt = await prisma.appointment.findUnique({ where: { id } });
    if (!appt) return res.status(404).json({ error: 'Appointment not found' });

    const updated = await prisma.appointment.update({
      where: { id },
      data:  { status: 'CANCELLED', cancelReason: 'Patient did not attend (no-show)', notes: req.body.notes || null },
    });
    return res.json({ success: true, message: 'Appointment marked as no-show.', data: updated });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to update appointment.', detail: err.message });
  }
});

// ── POST /api/appointments/:id/ensure-chat — create chat room if missing ──────
// Called by frontend when patient tries to chat but no room exists
router.post('/:id/ensure-chat', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = getUserId(req);

    const appt = await prisma.appointment.findUnique({
      where: { id },
      include: {
        patient: { select: { userId: true } },
        doctor:  { select: { userId: true } },
      },
    });

    if (!appt) return res.status(404).json({ success: false, message: 'Appointment not found' });

    // Only allow patient or doctor on this appointment
    const isPatient = appt.patient?.userId === userId;
    const isDoctor  = appt.doctor?.userId  === userId;
    if (!isPatient && !isDoctor) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const room = await prisma.chatRoom.upsert({
      where:  { appointmentId: id },
      update: {},
      create: { appointmentId: id },
    });

    return res.json({ success: true, roomId: room.id });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});


// ── POST /api/appointments/:id/extract-sections ────────────────────────────────
// AI extracts Follow-up / Prescription / Notes / Others from a clinical note
router.post('/:id/extract-sections', authenticate, authorize('DOCTOR'), async (req, res) => {
  try {
    const { rawNote } = req.body;
    if (!rawNote) return res.status(400).json({ error: 'rawNote is required' });
    const { extractConsultationSections } = require('../services/aiService');
    const sections = await extractConsultationSections(rawNote);
    return res.json({ success: true, sections });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ── PUT /api/appointments/:id/complete-structured ─────────────────────────────
// Complete appointment with structured 4-section note
router.put('/:id/complete-structured', authenticate, authorize('DOCTOR'), async (req, res) => {
  try {
    const { id } = req.params;
    const { followUp, prescription, notes, others, summary } = req.body;

    const appt = await prisma.appointment.findUnique({
      where:   { id },
      include: { patient: { select: { id: true, firstName: true, lastName: true } } },
    });
    if (!appt) return res.status(404).json({ error: 'Appointment not found' });
    if (appt.status === 'CANCELLED') return res.status(400).json({ error: 'Cannot complete a cancelled appointment' });

    // Store all sections as structured JSON in notes field
    const structuredNote = JSON.stringify({ followUp, prescription, notes, others, summary });

    const updated = await prisma.appointment.update({
      where: { id },
      data:  { status: 'COMPLETED', notes: structuredNote, aiSummary: summary || null },
    });

    // Add to ClinicalTimeline for patient history
    await prisma.clinicalTimeline.create({
      data: {
        patientId:   appt.patient.id,
        title:       'Consultation completed',
        description: summary || notes || 'Appointment completed',
        category:    'visit',
        occurredAt:  new Date(),
        metadata:    { followUp, prescription, notes, others, appointmentId: id },
      },
    });

    return res.json({ success: true, message: 'Appointment completed with structured notes.', data: updated });
  } catch (err) {
    console.error('[complete-structured]', err.message);
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;