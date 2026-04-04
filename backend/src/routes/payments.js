// routes/payments.js — Razorpay UPI Integration
const express  = require('express');
const router   = express.Router();
const Razorpay = require('razorpay');
const crypto   = require('crypto');
const { PrismaClient } = require('@prisma/client');
const auth     = require('../middleware/auth');
const { sendSMS }   = require('../services/smsService');
const { sendEmail } = require('../services/emailService');
const prisma = require('../lib/prisma');

const razorpay = new Razorpay({
  key_id:     process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

// ── POST /api/payments/create-order ─────────────────
// Creates Razorpay order for appointment payment
router.post('/create-order', auth, async (req, res) => {
  try {
    const { appointmentId } = req.body;

    const appointment = await prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: {
        patient: { select: { firstName:true, lastName:true, phone:true } },
        doctor:  { select: { firstName:true, lastName:true, specialty:true, consultFee:true } },
        payment: true
      }
    });

    if (!appointment) return res.status(404).json({ error: 'Appointment not found' });
    if (appointment.payment?.status === 'PAID')
      return res.status(400).json({ error: 'Appointment already paid' });

    const amount = appointment.doctor.consultFee || 50000; // paise

    const order = await razorpay.orders.create({
      amount,
      currency: 'INR',
      receipt: `appt_${appointmentId.slice(0,16)}`,
      notes: {
        appointmentId,
        patientName: `${appointment.patient.firstName} ${appointment.patient.lastName}`,
        doctorName:  `${appointment.doctor.firstName} ${appointment.doctor.lastName}`,
        specialty:    appointment.doctor.specialty
      }
    });

    // Upsert payment record
    const payment = await prisma.payment.upsert({
      where: { appointmentId },
      update: { razorpayOrderId: order.id, status: 'PENDING' },
      create: {
        appointmentId,
        patientId: appointment.patientId,
        amount,
        currency: 'INR',
        razorpayOrderId: order.id,
        status: 'PENDING'
      }
    });

    res.json({
      orderId:   order.id,
      amount:    order.amount,
      currency:  order.currency,
      keyId:     process.env.RAZORPAY_KEY_ID,
      prefill: {
        name:    `${appointment.patient.firstName} ${appointment.patient.lastName}`,
        contact: appointment.patient.phone
      },
      notes: order.notes
    });
  } catch (err) {
    console.error('Create order error:', err);
    res.status(500).json({ error: 'Failed to create payment order' });
  }
});

// ── POST /api/payments/verify ─────────────────────────
// Verifies Razorpay signature and marks payment as done
router.post('/verify', auth, async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, appointmentId } = req.body;

    // Signature verification
    const generated = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    if (generated !== razorpay_signature)
      return res.status(400).json({ error: 'Payment verification failed — signature mismatch' });

    // Fetch payment details from Razorpay
    const rzpPayment = await razorpay.payments.fetch(razorpay_payment_id);

    // Update database
    const payment = await prisma.payment.update({
      where: { razorpayOrderId: razorpay_order_id },
      data: {
        razorpayPaymentId: razorpay_payment_id,
        razorpaySignature: razorpay_signature,
        status: 'PAID',
        paidAt: new Date()
      },
      include: {
        patient:     { select: { firstName:true, lastName:true, phone:true } },
        appointment: { include: { doctor: { select: { firstName:true, lastName:true, specialty:true } } } }
      }
    });

    // Confirm appointment
    await prisma.appointment.update({
      where: { id: appointmentId },
      data:  { status: 'CONFIRMED' }
    });

    // Timeline
    await prisma.clinicalTimeline.create({
      data: {
        patientId: payment.patientId,
        title: 'Payment Confirmed',
        description: `₹${payment.amount / 100} paid for appointment with ${payment.appointment.doctor.firstName} ${payment.appointment.doctor.lastName}`,
        category: 'payment'
      }
    });

    // Notify
    const apptDate = new Date(payment.appointment.scheduledAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' });
    await Promise.allSettled([
      sendSMS(payment.patient.phone,
        `💳 MediConnect: Payment of ₹${payment.amount/100} confirmed! Appointment with ${payment.appointment.doctor.firstName} ${payment.appointment.doctor.lastName} on ${apptDate}. Txn: ${razorpay_payment_id.slice(-8)}`
      )
    ]);

    const io = req.app.get('io');
    io.to(`patient-${payment.patientId}`).emit('payment-confirmed', { payment });

    res.json({ success: true, payment, transactionId: razorpay_payment_id });
  } catch (err) {
    console.error('Verify payment error:', err);
    res.status(500).json({ error: 'Payment verification failed' });
  }
});

// ── POST /api/payments/refund ─────────────────────────
router.post('/refund', auth, async (req, res) => {
  try {
    const { appointmentId, reason } = req.body;

    const payment = await prisma.payment.findUnique({
      where: { appointmentId },
      include: { patient: true, appointment: { include: { doctor: true } } }
    });

    if (!payment || payment.status !== 'PAID')
      return res.status(400).json({ error: 'No paid payment found for this appointment' });

    const refund = await razorpay.payments.refund(payment.razorpayPaymentId, {
      amount: payment.amount,
      notes: { reason: reason || 'Appointment cancelled', appointmentId }
    });

    await prisma.payment.update({
      where: { id: payment.id },
      data: { status: 'REFUNDED', refundId: refund.id }
    });

    await sendSMS(payment.patient.phone,
      `💰 MediConnect: Refund of ₹${payment.amount/100} initiated. Will reflect in 3-5 business days. Ref: ${refund.id.slice(-8)}`
    );

    res.json({ success: true, refundId: refund.id, amount: payment.amount });
  } catch (err) {
    console.error('Refund error:', err);
    res.status(500).json({ error: 'Refund failed' });
  }
});

// ── GET /api/payments/history ─────────────────────────
router.get('/history', auth, async (req, res) => {
  try {
    const patient = await prisma.patient.findUnique({ where: { userId: req.user.userId } });
    const payments = await prisma.payment.findMany({
      where: { patientId: patient?.id },
      include: { appointment: { include: { doctor: { select: { firstName:true, lastName:true, specialty:true } } } } },
      orderBy: { createdAt: 'desc' }
    });
    res.json({ payments });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch payment history' });
  }
});

module.exports = router;
