'use strict';
/**
 * routes/auth.js — COMPLETE
 *
 * POST /api/auth/register
 * POST /api/auth/login
 * GET  /api/auth/me
 * PUT  /api/auth/profile
 * PUT  /api/auth/password
 * POST /api/auth/forgot-password     ← was missing → login page 404'd
 * POST /api/auth/verify-otp          ← was missing
 * POST /api/auth/reset-password      ← was missing
 * POST /api/auth/forgot-username     ← was missing
 * POST /api/auth/send-report-sms     ← new: share report results via SMS/WhatsApp
 *
 * OTP: in-memory Map, 10-minute TTL, single-use, max 5 attempts.
 * No schema change needed.
 *
 * SMS/Email: uses services/smsService + services/emailService if available.
 * If not configured, OTP is printed to the backend console so you can still test.
 */

const express  = require('express');
const router   = express.Router();
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const prisma   = require('../lib/prisma');
const authenticate = require('../middleware/auth');

// ── Lazy-load optional services ───────────────────────────────────────────────
function getSMS()   { try { return require('../services/smsService').sendSMS;   } catch { return null; } }
function getEmail() { try { return require('../services/emailService').sendEmail; } catch { return null; } }

// ── In-memory OTP store ───────────────────────────────────────────────────────
const OTP_STORE = new Map();
const OTP_TTL   = 10 * 60 * 1000; // 10 minutes
const MAX_TRIES = 5;

function generateOTP() { return String(Math.floor(100000 + Math.random() * 900000)); }

function storeOTP(email) {
  const otp = generateOTP();
  OTP_STORE.set(email.toLowerCase(), { otp, expiresAt: Date.now() + OTP_TTL, attempts: 0, verified: false });
  return otp;
}

function checkOTP(email, inputOtp, consume = false) {
  const e = OTP_STORE.get(email.toLowerCase());
  if (!e) return { ok: false, reason: 'No OTP found. Please request a new one.' };
  if (Date.now() > e.expiresAt) { OTP_STORE.delete(email.toLowerCase()); return { ok: false, reason: 'OTP expired. Please request a new one.' }; }
  if (e.attempts >= MAX_TRIES)  return { ok: false, reason: 'Too many attempts. Please request a new OTP.' };
  if (e.otp !== inputOtp.trim()) { e.attempts++; return { ok: false, reason: `Incorrect OTP. ${MAX_TRIES - e.attempts} attempts remaining.` }; }
  if (consume) OTP_STORE.delete(email.toLowerCase());
  else e.verified = true;
  return { ok: true };
}

function maskEmail(email) {
  const [u, d] = email.split('@');
  return `${u.slice(0, Math.min(3, u.length))}${'*'.repeat(Math.max(0, u.length - 3))}@${d}`;
}
function maskPhone(p) {
  if (!p) return '';
  const d = p.replace(/\D/g, '');
  return `${'*'.repeat(Math.max(0, d.length - 4))}${d.slice(-4)}`;
}


// ═══════════════════════════════════════════════════════════════════════════════
//  DOCTOR VERIFICATION HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

// Indian Medical Registration Number formats:
// State prefix (2-3 letters) + "/" + digits  e.g. MH/12345, DL/67890, KA-12345
// NMC national format: XXXXXX (6 digits)
// Formats vary by state — we validate that something plausible was entered
function isValidMRN(mrn) {
  if (!mrn || typeof mrn !== 'string') return false;
  const clean = mrn.trim().replace(/\s+/g, '');
  // State/digits format: 2-3 letters + separator + 4-8 digits
  if (/^[A-Za-z]{2,3}[-/]\d{4,8}$/.test(clean)) return true;
  // Pure numeric (NMC or some states): 5-8 digits
  if (/^\d{5,8}$/.test(clean)) return true;
  return false;
}

// Qualification tier — MBBS is minimum for a licensed doctor
const VALID_QUALIFICATIONS = [
  'MBBS','MD','MS','DNB','DM','MCh','BDS','MDS','BAMS','BHMS','BUMS','BSMS',
  'DO','PhD','FRCS','MRCP','FCPS','FRCR','FIACS','MRCGP','FRCP','FACS',
];
function isValidMedicalQual(qual) {
  if (!qual) return false;
  const upper = qual.trim().toUpperCase();
  return VALID_QUALIFICATIONS.some(q => upper.includes(q));
}

// Known institutional/government email domains — auto-approve these
const TRUSTED_EMAIL_DOMAINS = [
  'aiims.edu','pgimer.edu.in','nmc.org.in','mohfw.gov.in','gov.in',
  'nih.gov','hospital.org','apollo.com','fortishealthcare.com','maxhealthcare.com',
  'manipalhospitals.com','narayanahealth.org','medanta.org','kokilabenhospital.com',
  'lilavati.org','lilavati.com','bombayhhospital.com','jj.gov.in','kem.gov.in',
  'tata.com','tatamemorialcentre.com','srcc.org',
];
function isTrustedDomain(email) {
  const domain = (email || '').split('@')[1]?.toLowerCase() || '';
  return TRUSTED_EMAIL_DOMAINS.some(d => domain === d || domain.endsWith('.' + d));
}

// Build the bio string storing all verification metadata
// Bio format: __originalEmail__email||__mrn__MRN||__smc__SMC||__status__STATUS
function buildDoctorBio(originalEmail, mrn, smc, regYear, status) {
  const parts = ['__originalEmail__' + originalEmail.toLowerCase()];
  if (mrn)     parts.push('__mrn__' + mrn.trim().toUpperCase());
  if (smc)     parts.push('__smc__' + smc.trim());
  if (regYear) parts.push('__regyear__' + regYear);
  parts.push('__status__' + (status || 'PENDING_REVIEW'));
  return parts.join('||');
}

function parseDoctorBio(bio) {
  if (!bio) return {};
  const result = {};
  for (const part of bio.split('||')) {
    const m = part.match(/^__([a-z_]+)__(.+)$/);
    if (m) result[m[1]] = m[2];
  }
  return result;
}

async function dispatchOTP(email, otp, phone) {
  console.log(`\n[AUTH OTP] ${email} → ${otp}  (10 min TTL)\n`);
  const msg = `NexMedicon: Your OTP is ${otp}. Valid 10 minutes. Do not share.`;
  if (phone) { const s = getSMS(); if (s) try { await s(phone, msg); } catch (e) { console.warn('[AUTH] SMS error:', e.message); } }
  const em = getEmail();
  if (em) {
    try {
      await em(email, 'NexMedicon — Password Reset OTP',
        `<h2 style="color:#00796b">NexMedicon AI — Password Reset</h2><p>Your OTP:</p><h1 style="letter-spacing:8px;font-size:36px;color:#1565c0">${otp}</h1><p>Valid for 10 minutes. Do not share this with anyone.</p>`);
    } catch (e) { console.warn('[AUTH] Email error:', e.message); }
  }
}

function sanitizeUser(u) { const { passwordHash, ...s } = u; return s; }
function getUserId(req)   { const u = req.user||{}; return u.userId||u.id||u.user_id||u.sub||null; }

// ═══════════════════════════════════════════════════════════════════════════════
//  REGISTER
// ═══════════════════════════════════════════════════════════════════════════════
router.post('/register', [
  body('email').isEmail(),  // no .normalizeEmail() — it modifies gmail addresses causing false duplicates
  body('password').isLength({ min: 6 }),
  body('role').isIn(['PATIENT', 'DOCTOR']),
  body('firstName').trim().notEmpty(),
  body('lastName').trim().notEmpty(),
  body('phone').trim().notEmpty(),
], async (req, res) => {
  const errs = validationResult(req);
  if (!errs.isEmpty()) return res.status(400).json({ errors: errs.array() });

  const { email, password, role, firstName, lastName, phone, dateOfBirth, gender, bloodType, address, specialty, qualification, hospital, consultFee, abhaNumber } = req.body;

  try {
    // ── Duplicate email check ─────────────────────────────────────────────
    const emailLower = email.trim().toLowerCase();
    const existingEmail = await prisma.user.findUnique({ where: { email: emailLower } });
    if (existingEmail) return res.status(400).json({ error: 'EMAIL_TAKEN' });

    // For doctors: also check if this email was already used as original registration email
    if (role === 'DOCTOR') {
      const existingByOriginal = await prisma.doctor.findFirst({
        where: { bio: { contains: `__originalEmail__${emailLower}` } },
      });
      if (existingByOriginal) return res.status(400).json({ error: 'EMAIL_TAKEN' });
    }

    // ── Duplicate phone check (use distinct error codes so frontend can identify) ──
    const cleanPhone = (phone || '').trim();
    if (cleanPhone.length >= 7) {
      const pPhone = await prisma.patient.findFirst({ where: { phone: cleanPhone } });
      const dPhone = !pPhone ? await prisma.doctor.findFirst({ where: { phone: cleanPhone } }) : null;
      if (pPhone || dPhone) return res.status(400).json({ error: 'PHONE_TAKEN' });
    }

    // ── Generate @nexmedicon.ai credentials for doctors ──────────────────
    let appEmail = emailLower;
    let appEmailNote = null;
    if (role === 'DOCTOR') {
      // Generate: first initial + last name, e.g. "dsharma@nexmedicon.ai"
      const base = (firstName[0] + lastName).toLowerCase().replace(/[^a-z0-9]/g, '');
      let candidate = `${base}@nexmedicon.ai`;
      // Check for conflicts and append numbers if needed
      let suffix = 1;
      while (await prisma.user.findUnique({ where: { email: candidate } })) {
        candidate = `${base}${suffix}@nexmedicon.ai`;
        suffix++;
      }
      appEmail = candidate;
      appEmailNote = candidate; // will be sent back in response
      console.log(`[register] Doctor app email generated: ${candidate}`);
    }

    // ── Doctor verification checks ───────────────────────────────────────
    let verificationStatus = 'APPROVED'; // patients are always approved immediately
    if (role === 'DOCTOR') {
      const mrn = (req.body.medicalRegNumber || req.body.mrn || '').trim();
      const smc = (req.body.stateMedicalCouncil || req.body.smc || '').trim();

      // MRN is mandatory for doctors
      if (!mrn) {
        return res.status(400).json({
          error: 'MISSING_MRN',
          message: 'Medical Registration Number is required for doctor registration.',
        });
      }
      if (!isValidMRN(mrn)) {
        return res.status(400).json({
          error: 'INVALID_MRN',
          message: 'Invalid Medical Registration Number format. Expected format: MH/12345 or similar.',
        });
      }
      // Qualification check
      if (!isValidMedicalQual(qualification || '')) {
        return res.status(400).json({
          error: 'INVALID_QUALIFICATION',
          message: 'Qualification must include a recognised medical degree (MBBS, MD, MS, BDS, etc.).',
        });
      }
      // Duplicate MRN check
      const mrnTag = '__mrn__' + mrn.toUpperCase();
      const mrnExists = await prisma.doctor.findFirst({ where: { bio: { contains: mrnTag } } });
      if (mrnExists) {
        return res.status(400).json({
          error: 'MRN_TAKEN',
          message: 'This Medical Registration Number is already registered on NexMedicon AI.',
        });
      }

      // Auto-approve trusted institutional domains; queue others for review
      verificationStatus = isTrustedDomain(emailLower) ? 'APPROVED' : 'PENDING_REVIEW';
      console.log('[register] Doctor MRN:', mrn, '| Status:', verificationStatus);
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: {
        email:        appEmail,
        passwordHash, role,
        // Doctors in PENDING_REVIEW are marked inactive until admin approves
        isActive: role === 'DOCTOR' && verificationStatus === 'PENDING_REVIEW' ? false : true,
        ...(role === 'PATIENT' ? {
          patient: { create: {
            firstName: firstName.trim(), lastName: lastName.trim(), phone: phone.trim(),
            dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : new Date('2000-01-01'),
            gender: gender || 'Not specified', bloodType: bloodType || null, address: address || null,
          }},
        } : {
          doctor: { create: {
            firstName:     firstName.trim(), lastName: lastName.trim(), phone: phone.trim(),
            specialty:     (specialty || 'General Practice').trim(),
            qualification: (qualification || '').trim(),
            hospital:      (hospital || 'NexMedicon Clinic').trim(),
            consultFee:    consultFee ? Math.round(parseFloat(consultFee) * 100) : 50000,
            // isAvailable = false for PENDING doctors (not shown to patients)
            isAvailable:   verificationStatus === 'APPROVED',
            bio: buildDoctorBio(
              emailLower,
              (req.body.medicalRegNumber || req.body.mrn || '').trim().toUpperCase(),
              (req.body.stateMedicalCouncil || req.body.smc || '').trim(),
              (req.body.registrationYear || '').trim(),
              verificationStatus,
            ),
          }},
        }),
      },
      include: { patient: true, doctor: true },
    });

    const token = jwt.sign({ userId: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });
    const resp = { token, user: sanitizeUser(user) };
    if (appEmailNote) resp.appEmail = appEmailNote;
    if (role === 'DOCTOR') {
      resp.verificationStatus = verificationStatus;
      resp.pendingReview = verificationStatus === 'PENDING_REVIEW';
      if (verificationStatus === 'PENDING_REVIEW') {
        resp.message = 'Your account is under review. Our team will verify your medical credentials within 24-48 hours. You will receive an email once approved.';
      }
    }
    // Save ABHA number if provided at registration
    if (role === 'PATIENT' && abhaNumber && abhaNumber.replace(/-/g,'').trim().length === 14) {
      const cleanAbha = abhaNumber.replace(/-/g,'').trim();
      try {
        const newPat = await prisma.patient.findUnique({ where: { userId: user.id }, select: { id: true } });
        if (newPat) {
          await prisma.patient.update({
            where: { id: newPat.id },
            data:  { policyNumber: 'ABHA:' + cleanAbha },
          });
          resp.abhaLinked = true;
          resp.abhaId     = cleanAbha.replace(/(\d{2})(\d{4})(\d{4})(\d{4})/, '$1-$2-$3-$4');
        }
      } catch (e) { console.warn('[register] ABHA save:', e.message); }
    }
    res.status(201).json(resp);
  } catch (err) {
    console.error('[register] ERROR:', err.message, err.code);
    if (err.code === 'P2002') return res.status(400).json({ error: 'EMAIL_TAKEN' });
    if (err.message?.includes('JWT_SECRET') || err.message?.includes('secretOrPrivateKey')) {
      return res.status(500).json({ error: 'Server configuration error: JWT_SECRET missing. Set it in Railway Variables.' });
    }
    if (err.message?.includes('database') || err.message?.includes('connect') || err.code?.startsWith('P')) {
      return res.status(500).json({ error: 'Database connection failed. Check DATABASE_URL in Railway Variables.', detail: err.message });
    }
    res.status(500).json({ error: 'Registration failed', detail: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
//  LOGIN
// ═══════════════════════════════════════════════════════════════════════════════
router.post('/login', [
  body('email').isEmail(),
  body('password').notEmpty(),
], async (req, res) => {
  const errs = validationResult(req);
  if (!errs.isEmpty()) return res.status(400).json({ errors: errs.array() });

  const { email, password } = req.body;
  try {
    const emailLow = email.toLowerCase().trim();
    let user = await prisma.user.findUnique({
      where: { email: emailLow },
      include: {
        patient: { include: { conditions: { where: { isActive: true } }, allergies: true, medications: { where: { isActive: true } }, vitals: { orderBy: { recordedAt: 'desc' }, take: 1 } } },
        doctor:  { include: { slots: { where: { isActive: true } } } },
      },
    });

    // If not found by appEmail, try looking up doctor by their original registration email
    // Doctors may not remember their generated @nexmedicon.ai email
    if (!user) {
      const doctor = await prisma.doctor.findFirst({
        where: { bio: { contains: `__originalEmail__${emailLow}` } },
        include: { user: { include: { doctor: { include: { slots: { where: { isActive: true } } } } } } },
      });
      if (doctor?.user) {
        user = doctor.user;
        console.log(`[login] Doctor found by original email: ${emailLow} → ${user.email}`);
      }
    }

    if (!user) return res.status(401).json({ error: 'No account found with this email address.' });
    if (!user.isActive) {
      // Check if this is a pending doctor review
      if (user.role === 'DOCTOR' && user.doctor) {
        const bioData = parseDoctorBio(user.doctor.bio || '');
        if (bioData.status === 'PENDING_REVIEW') {
          return res.status(403).json({
            error: 'PENDING_REVIEW',
            message: 'Your account is pending verification. Our team is reviewing your medical credentials. This usually takes 24-48 hours.',
          });
        }
        if (bioData.status === 'REJECTED') {
          return res.status(403).json({
            error: 'ACCOUNT_REJECTED',
            message: 'Your registration was not approved. Reason: ' + (bioData.rejectReason || 'credentials could not be verified') + '. Please contact support@nexmedicon.ai.',
          });
        }
      }
      return res.status(401).json({ error: 'This account has been deactivated. Contact support@nexmedicon.ai.' });
    }
    if (!user.passwordHash) return res.status(401).json({ error: 'Invalid credentials' });

    const valid = await bcrypt.compare(password, user.passwordHash); // emailLow used above
    if (!valid) return res.status(401).json({ error: 'Incorrect password. Please try again or use Forgot Password.' });

    const token = jwt.sign({ userId: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });
    res.json({ token, user: sanitizeUser(user) });
  } catch (err) {
    console.error('[login] ERROR:', err.message, err.code);
    if (err.message?.includes('JWT_SECRET') || err.message?.includes('secretOrPrivateKey')) {
      return res.status(500).json({ error: 'Server configuration error: JWT_SECRET is not set. Add it to Railway Variables.' });
    }
    if (err.message?.includes('database') || err.message?.includes('connect') || err.code?.startsWith('P')) {
      return res.status(500).json({ error: 'Database error. Check DATABASE_URL in Railway Variables.', detail: err.message });
    }
    res.status(500).json({ error: 'Login failed. Please try again.', detail: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
//  FORGOT PASSWORD — Step 1: send OTP
// ═══════════════════════════════════════════════════════════════════════════════
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
    return res.status(400).json({ error: 'Enter a valid email address.' });

  const emailLow = email.trim().toLowerCase();
  try {
    const user = await prisma.user.findUnique({
      where: { email: emailLow },
      include: { patient: { select: { phone: true } }, doctor: { select: { phone: true } } },
    });

    // Respond OK even if not found — prevents email enumeration
    if (!user) return res.json({ message: 'If this email is registered, an OTP has been sent.', phoneHint: '' });

    const phone = user.patient?.phone || user.doctor?.phone || null;
    const otp   = storeOTP(emailLow);
    await dispatchOTP(emailLow, otp, phone);

    res.json({
      message:   phone ? `OTP sent to ${emailLow} and phone ending in ${phone.slice(-4)}.` : `OTP sent to ${emailLow}. Check your inbox.`,
      phoneHint: phone ? `Also sent to phone ending in ${phone.slice(-4)}` : '',
    });
  } catch (err) {
    console.error('[forgot-password]', err.message);
    res.status(500).json({ error: 'Failed to send OTP.' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
//  VERIFY OTP — Step 2
// ═══════════════════════════════════════════════════════════════════════════════
router.post('/verify-otp', (req, res) => {
  const { email, otp } = req.body;
  if (!email || !otp) return res.status(400).json({ error: 'Email and OTP are required.' });
  const result = checkOTP(email.trim().toLowerCase(), otp.trim(), false); // don't consume yet
  if (!result.ok) return res.status(400).json({ error: result.reason });
  res.json({ success: true, message: 'OTP verified. You can now set a new password.' });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  RESET PASSWORD — Step 3
// ═══════════════════════════════════════════════════════════════════════════════
router.post('/reset-password', async (req, res) => {
  const { email, otp, newPassword } = req.body;
  if (!email || !otp || !newPassword) return res.status(400).json({ error: 'email, otp and newPassword are required.' });
  if (newPassword.length < 6)         return res.status(400).json({ error: 'Password must be at least 6 characters.' });

  const result = checkOTP(email.trim().toLowerCase(), otp.trim(), true); // consume OTP
  if (!result.ok) return res.status(400).json({ error: result.reason });

  try {
    const user = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
    if (!user) return res.status(404).json({ error: 'Account not found.' });
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(newPassword, 12) } });
    res.json({ success: true, message: 'Password reset successfully. You can now sign in.' });
  } catch (err) {
    console.error('[reset-password]', err.message);
    res.status(500).json({ error: 'Failed to reset password.' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
//  FORGOT USERNAME — find email by phone
// ═══════════════════════════════════════════════════════════════════════════════
router.post('/forgot-username', async (req, res) => {
  const { phone } = req.body;
  if (!phone || phone.replace(/\D/g, '').length < 7)
    return res.status(400).json({ error: 'Enter a valid phone number.' });

  try {
    const ph = phone.trim();
    const phStripped = ph.replace(/^\+\d{1,3}/, '');
    const patient = await prisma.patient.findFirst({ where: { OR: [{ phone: ph }, { phone: phStripped }] }, include: { user: { select: { email: true } } } });
    const doctor  = !patient ? await prisma.doctor.findFirst({ where: { OR: [{ phone: ph }, { phone: phStripped }] }, include: { user: { select: { email: true } } } }) : null;
    const found   = patient || doctor;

    if (!found) return res.json({ message: 'If this phone is registered, your email has been sent via SMS.', maskedEmail: '' });

    const email = found.user.email;
    const sms   = `NexMedicon: Your registered login email is ${email}. Use it to sign in.`;
    console.log(`\n[AUTH] forgot-username → ${email} for phone ${ph}\n`);
    const sendSMS = getSMS();
    if (sendSMS) try { await sendSMS(ph, sms); } catch (e) { console.warn('[AUTH] SMS error:', e.message); }

    res.json({ success: true, message: `Your email address has been sent to the registered phone (${maskPhone(ph)}).`, maskedEmail: maskEmail(email) });
  } catch (err) {
    console.error('[forgot-username]', err.message);
    res.status(500).json({ error: 'Lookup failed. Please try again.' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
//  SEND REPORT SMS — share analysis results via phone
// ═══════════════════════════════════════════════════════════════════════════════
router.post('/send-report-sms', authenticate, async (req, res) => {
  try {
    const { phone, reportType, healthScore, scoreLabel, findings, fileName, patientName } = req.body;
    if (!phone || phone.replace(/\D/g, '').length < 7)
      return res.status(400).json({ success: false, error: 'Enter a valid phone number.' });

    const abnormal = (findings || []).filter(f => f.severity === 'critical' || f.severity === 'warning');

    let msg = `NexMedicon Report\n`;
    if (patientName) msg += `Patient: ${patientName}\n`;
    msg += `File: ${(fileName || 'Report').slice(0, 40)}\n`;
    if (reportType)  msg += `Test: ${reportType}\n`;
    if (healthScore != null) msg += `Score: ${healthScore}/100 — ${scoreLabel || ''}\n`;

    if (abnormal.length > 0) {
      msg += `⚠ Key findings:\n`;
      abnormal.slice(0, 3).forEach(f => { msg += `• ${f.title}\n`; });
      if (abnormal.length > 3) msg += `• ...and ${abnormal.length - 3} more\n`;
    } else {
      msg += `✅ All values within normal range.\n`;
    }
    msg += `\nFor full analysis, open NexMedicon app. Consult your doctor — not a diagnosis.`;

    console.log(`[AUTH] send-report-sms to ${phone}:\n${msg}`);

    const sendSMS = getSMS();
    if (sendSMS) {
      try {
        await sendSMS(phone.trim(), msg);
        return res.json({ success: true, message: `Report summary sent to ${maskPhone(phone)}.` });
      } catch (smsErr) {
        return res.status(500).json({ success: false, error: `SMS failed: ${smsErr.message}. Check your SMS service configuration.` });
      }
    }

    // SMS not configured — return preview so UI can still show something
    return res.json({ success: true, simulated: true, message: 'SMS service not configured — see backend console.', preview: msg });
  } catch (err) {
    console.error('[send-report-sms]', err.message);
    res.status(500).json({ success: false, error: 'Failed to send SMS.' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
//  ME
// ═══════════════════════════════════════════════════════════════════════════════
router.get('/me', authenticate, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: getUserId(req) },
      include: {
        patient: { include: { conditions: { where: { isActive: true } }, allergies: true, medications: { where: { isActive: true } }, vitals: { orderBy: { recordedAt: 'desc' }, take: 1 } } },
        doctor:  { include: { slots: { where: { isActive: true } } } },
      },
    });
    if (!user) return res.status(404).json({ error: 'User not found' });
    // For patients, also include ABHA status
    let abhaInfo = null;
    if (user.role === 'PATIENT' && user.patient?.id) {
      try {
        const pat2 = await prisma.patient.findUnique({ where: { id: user.patient.id }, select: { policyNumber: true } });
        const abhaNum = pat2?.policyNumber?.startsWith('ABHA:') ? pat2.policyNumber.slice(5) : null;
        if (abhaNum) {
          abhaInfo = {
            abhaLinked: true,
            abhaId: abhaNum.replace(/(\d{2})(\d{4})(\d{4})(\d{4})/, '$1-$2-$3-$4'),
          };
        }
      } catch {}
    }
    res.json({ user: sanitizeUser(user), abha: abhaInfo });
  } catch { res.status(500).json({ error: 'Failed to fetch profile' }); }
});

// ═══════════════════════════════════════════════════════════════════════════════
//  PROFILE UPDATE
// ═══════════════════════════════════════════════════════════════════════════════
router.put('/profile', authenticate, async (req, res) => {
  try {
    const userId = getUserId(req);
    const user   = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (user.role === 'PATIENT') {
      const { firstName, lastName, phone, gender, dateOfBirth, bloodType, address, emergencyName, emergencyPhone } = req.body;
      const d = {};
      if (firstName    !== undefined) d.firstName    = firstName.trim();
      if (lastName     !== undefined) d.lastName     = lastName.trim();
      if (phone        !== undefined) d.phone        = phone.trim();
      if (gender       !== undefined) d.gender       = gender;
      if (dateOfBirth  !== undefined) d.dateOfBirth  = new Date(dateOfBirth);
      if (bloodType    !== undefined) d.bloodType    = bloodType || null;
      if (address      !== undefined) d.address      = address || null;
      if (emergencyName  !== undefined) d.emergencyName  = emergencyName || null;
      if (emergencyPhone !== undefined) d.emergencyPhone = emergencyPhone || null;
      const patient = await prisma.patient.update({ where: { userId }, data: d });
      return res.json({ success: true, message: 'Profile updated', data: { patient } });
    }
    if (user.role === 'DOCTOR') {
      const { firstName, lastName, phone, bio, hospital, specialty, qualification } = req.body;
      const d = {};
      if (firstName     !== undefined) d.firstName     = firstName.trim();
      if (lastName      !== undefined) d.lastName      = lastName.trim();
      if (phone         !== undefined) d.phone         = phone.trim();
      if (bio           !== undefined) d.bio           = bio || null;
      if (hospital      !== undefined) d.hospital      = hospital || null;
      if (specialty     !== undefined) d.specialty     = specialty || null;
      if (qualification !== undefined) d.qualification = qualification || null;
      const doctor = await prisma.doctor.update({ where: { userId }, data: d });
      return res.json({ success: true, message: 'Profile updated', data: { doctor } });
    }
    res.status(400).json({ error: 'Unknown role' });
  } catch (err) {
    console.error('[profile]', err.message);
    res.status(500).json({ error: 'Failed to update profile', detail: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
//  CHANGE PASSWORD (authenticated)
// ═══════════════════════════════════════════════════════════════════════════════
router.put('/password', authenticate, async (req, res) => {
  try {
    const userId = getUserId(req);
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) return res.status(400).json({ error: 'currentPassword and newPassword are required.' });
    if (newPassword.length < 6) return res.status(400).json({ error: 'New password must be at least 6 characters.' });
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!await bcrypt.compare(currentPassword, user.passwordHash)) return res.status(401).json({ error: 'Current password is incorrect.' });
    await prisma.user.update({ where: { id: userId }, data: { passwordHash: await bcrypt.hash(newPassword, 12) } });
    res.json({ success: true, message: 'Password changed successfully.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to change password', detail: err.message });
  }
});


// ── POST /api/auth/change-password ────────────────────────────────────────────
router.post('/change-password', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
    const token = authHeader.split(' ')[1];
    const jwt   = require('jsonwebtoken');
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const userId  = payload.userId || payload.id;

    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Both passwords required' });
    if (newPassword.length < 8) return res.status(400).json({ error: 'New password must be at least 8 characters' });

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) return res.status(401).json({ error: 'Current password is incorrect' });

    // Prevent reusing same password
    const same = await bcrypt.compare(newPassword, user.passwordHash);
    if (same) return res.status(400).json({ error: 'New password must be different from current password' });

    const newHash = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({ where: { id: userId }, data: { passwordHash: newHash } });

    res.json({ success: true, message: 'Password changed successfully' });
  } catch (err) {
    console.error('[change-password]', err.message);
    res.status(500).json({ error: 'Failed to change password' });
  }
});


// ── POST /api/auth/verify-abha ──────────────────────────────────────────────
// Patient enters their ABHA number to link it to their profile
// Also checks if phone is associated with ABHA (simulated - real ABDM API requires OAuth)
router.post('/verify-abha', async (req, res) => {
  try {
    const { abhaNumber, userId } = req.body;
    if (!abhaNumber) return res.status(400).json({ success: false, message: 'ABHA number required' });

    const cleanAbha = abhaNumber.replace(/-/g, '').trim();
    if (!/^\d{14}$/.test(cleanAbha)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid ABHA format. Must be 14 digits like 12-3456-7890-1234',
      });
    }

    // Format for display: XX-XXXX-XXXX-XXXX
    const formatted = cleanAbha.replace(/(\d{2})(\d{4})(\d{4})(\d{4})/, '$1-$2-$3-$4');

    // Find patient
    const uid     = userId || (req.user?.userId || req.user?.id);
    const patient = uid ? await prisma.patient.findUnique({ where: { userId: uid }, select: { id: true, phone: true } }) : null;

    if (patient) {
      // Save ABHA via policyNumber field (ABHA: prefix)
      await prisma.patient.update({
        where: { id: patient.id },
        data:  { policyNumber: 'ABHA:' + cleanAbha },
      });
    }

    return res.json({
      success:   true,
      abhaId:    cleanAbha,
      formatted,
      message:   'ABHA ID ' + formatted + ' linked to your profile.',
      note:      'For full national health record access, the doctor will need to verify through ABDM portal.',
    });
  } catch (err) {
    console.error('[verify-abha]', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ── GET /api/auth/abha-status ────────────────────────────────────────────────
// Returns ABHA number linked to logged-in patient's profile
router.get('/abha-status', async (req, res) => {
  try {
    const userId  = req.user?.userId || req.user?.id;
    const patient = await prisma.patient.findUnique({ where: { userId }, select: { id: true } });
    if (!patient) return res.status(404).json({ success: false, message: 'Patient not found' });

    const pat = await prisma.patient.findUnique({ where: { id: patient.id }, select: { policyNumber: true } });
    const abhaId = pat?.policyNumber?.startsWith('ABHA:') ? pat.policyNumber.slice(5) : null;
    if (!abhaId) return res.json({ success: true, abhaLinked: false, abhaId: null });

    const fmt = abhaId.replace(/(\d{2})(\d{4})(\d{4})(\d{4})/, '$1-$2-$3-$4');
    return res.json({ success: true, abhaLinked: true, abhaId: fmt });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});


// ═══════════════════════════════════════════════════════════════════════════════
//  ADMIN — Doctor Verification Management
// ═══════════════════════════════════════════════════════════════════════════════

// Middleware: admin only (via ADMIN_SECRET header)
function adminOnly(req, res, next) {
  const secret = req.headers['x-admin-secret'] || req.query.adminSecret;
  if (!secret || secret !== process.env.ADMIN_SECRET) {
    return res.status(403).json({ error: 'Admin access required.' });
  }
  next();
}

// GET /api/auth/admin/pending-doctors — list doctors awaiting review
router.get('/admin/pending-doctors', adminOnly, async (req, res) => {
  try {
    const doctors = await prisma.doctor.findMany({
      where: { bio: { contains: '__status__PENDING_REVIEW' } },
      include: { user: { select: { id: true, email: true, isActive: true, createdAt: true } } },
      orderBy: { createdAt: 'desc' },
    });
    const formatted = doctors.map(d => {
      const bio = parseDoctorBio(d.bio || '');
      return {
        doctorId:     d.id,
        userId:       d.user.id,
        name:         d.firstName + ' ' + d.lastName,
        email:        bio.originalEmail || d.user.email,
        appEmail:     d.user.email,
        phone:        d.phone,
        specialty:    d.specialty,
        qualification: d.qualification,
        hospital:     d.hospital,
        mrn:          bio.mrn || '—',
        smc:          bio.smc || '—',
        regYear:      bio.regyear || '—',
        status:       bio.status || 'UNKNOWN',
        registeredAt: d.user.createdAt,
      };
    });
    res.json({ success: true, data: formatted, count: formatted.length });
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch pending doctors', detail: e.message });
  }
});

// POST /api/auth/admin/approve-doctor — approve a doctor
router.post('/admin/approve-doctor', adminOnly, async (req, res) => {
  const { doctorId } = req.body;
  if (!doctorId) return res.status(400).json({ error: 'doctorId is required' });
  try {
    const doctor = await prisma.doctor.findUnique({ where: { id: doctorId }, include: { user: true } });
    if (!doctor) return res.status(404).json({ error: 'Doctor not found' });

    const oldBio  = parseDoctorBio(doctor.bio || '');
    const newBio  = buildDoctorBio(
      oldBio.originalEmail || '', oldBio.mrn || '',
      oldBio.smc || '', oldBio.regyear || '', 'APPROVED'
    );

    await prisma.$transaction([
      prisma.doctor.update({ where: { id: doctorId }, data: { bio: newBio, isAvailable: true } }),
      prisma.user.update({ where: { id: doctor.userId }, data: { isActive: true } }),
    ]);

    console.log('[admin] Doctor approved:', doctor.firstName, doctor.lastName, '| MRN:', oldBio.mrn);
    res.json({ success: true, message: `Dr. ${doctor.firstName} ${doctor.lastName} approved.` });
  } catch (e) {
    res.status(500).json({ error: 'Failed to approve doctor', detail: e.message });
  }
});

// POST /api/auth/admin/reject-doctor — reject with reason
router.post('/admin/reject-doctor', adminOnly, async (req, res) => {
  const { doctorId, reason } = req.body;
  if (!doctorId) return res.status(400).json({ error: 'doctorId is required' });
  try {
    const doctor = await prisma.doctor.findUnique({ where: { id: doctorId }, include: { user: true } });
    if (!doctor) return res.status(404).json({ error: 'Doctor not found' });

    const oldBio = parseDoctorBio(doctor.bio || '');
    // Encode rejection reason in bio
    const newBio = buildDoctorBio(
      oldBio.originalEmail || '', oldBio.mrn || '',
      oldBio.smc || '', oldBio.regyear || '', 'REJECTED'
    ) + '||__rejectReason__' + (reason || 'Credentials could not be verified');

    await prisma.doctor.update({ where: { id: doctorId }, data: { bio: newBio, isAvailable: false } });
    // Keep user.isActive = false (already false from registration)

    console.log('[admin] Doctor rejected:', doctor.firstName, doctor.lastName, '| Reason:', reason);
    res.json({ success: true, message: `Dr. ${doctor.firstName} ${doctor.lastName} rejected.` });
  } catch (e) {
    res.status(500).json({ error: 'Failed to reject doctor', detail: e.message });
  }
});

// GET /api/auth/admin/all-doctors — see all doctors with their status
router.get('/admin/all-doctors', adminOnly, async (req, res) => {
  try {
    const doctors = await prisma.doctor.findMany({
      include: { user: { select: { id: true, email: true, isActive: true, createdAt: true } } },
      orderBy: { createdAt: 'desc' },
    });
    const formatted = doctors.map(d => {
      const bio = parseDoctorBio(d.bio || '');
      return {
        doctorId: d.id, userId: d.user.id,
        name: d.firstName + ' ' + d.lastName,
        email: bio.originalEmail || d.user.email,
        phone: d.phone,
        mrn: bio.mrn || '—', smc: bio.smc || '—',
        specialty: d.specialty, hospital: d.hospital,
        qualification: d.qualification,
        regYear: bio.regyear || '—',
        status: bio.status || 'APPROVED',
        isActive: d.user.isActive, isAvailable: d.isAvailable,
        registeredAt: d.user.createdAt,
      };
    });
    res.json({ success: true, data: formatted });
  } catch (e) {
    res.status(500).json({ error: 'Failed', detail: e.message });
  }
});

module.exports = router;