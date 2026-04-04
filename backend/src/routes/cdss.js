/**
 * routes/cdss.js
 *
 * Clinical Decision Support System (CDSS) — 4 Features:
 *
 *   A. Delta-Check (Longitudinal velocity analysis)
 *      GET  /api/cdss/delta/:patientId
 *
 *   B. Red Flag Alerts (Persistent critical banners)
 *      GET  /api/cdss/alerts                 — doctor: all active alerts
 *      POST /api/cdss/alerts/acknowledge     — doctor: dismiss one alert
 *      POST /api/cdss/alerts/lab-critical    — internal: called after file analysis
 *
 *   C. ABDM/ABHA Integration
 *      POST /api/cdss/abha/fetch             — doctor: pull national health history
 *      GET  /api/cdss/abha/:patientId        — doctor: cached ABHA summary
 *
 *   D. DDx Engine (Differential Diagnosis)
 *      POST /api/cdss/ddx                    — doctor: run DDx for patient
 *
 * REGISTER IN server.js (one line):
 *   app.use('/api/cdss', require('./routes/cdss'));
 */

'use strict';

const express = require('express');
const router  = express.Router();
const jwt     = require('jsonwebtoken');
const fetch   = require('node-fetch').default || require('node-fetch');
const prisma  = require('../lib/prisma');

// ── Auth ──────────────────────────────────────────────────────────────────────
function requireAuth(req, res, next) {
  try {
    const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
    if (!token) return res.status(401).json({ success: false, message: 'No token' });
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ success: false, message: 'Invalid token' });
  }
}

function getUserId(req) {
  const u = req.user || {};
  return u.id || u.userId || u.user_id || u.sub || null;
}

async function getDoctorId(req) {
  if (req.user.role !== 'DOCTOR') return null;
  const doc = await prisma.doctor.findUnique({ where: { userId: getUserId(req) }, select: { id: true } });
  return doc?.id || null;
}

// ── AI helper ─────────────────────────────────────────────────────────────────
async function callAI(messages, maxTokens = 800) {
  const https = require('https');
  function httpsPost(hostname, path, headers, body) {
    return new Promise((resolve, reject) => {
      const b   = JSON.stringify(body);
      const req = https.request({
        hostname, path, method: 'POST',
        agent: new https.Agent({ rejectUnauthorized: false }),
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(b), ...headers },
        timeout: 20000,
      }, resp => {
        let d = '';
        resp.on('data', c => { d += c; });
        resp.on('end', () => { try { resolve({ status: resp.statusCode, body: JSON.parse(d) }); } catch { resolve({ status: resp.statusCode, body: {} }); } });
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
      req.write(b); req.end();
    });
  }

  // Try Gemini first (free)
  const geminiKey = process.env.GEMINI_API_KEY;
  if (geminiKey) {
    try {
      const userMsg = messages.find(m => m.role === 'user')?.content || '';
      const r = await httpsPost(
        'generativelanguage.googleapis.com',
        '/v1beta/models/gemini-2.0-flash-lite:generateContent?key=' + geminiKey,
        {},
        { contents: [{ parts: [{ text: userMsg }] }], generationConfig: { temperature: 0.2, maxOutputTokens: maxTokens } }
      );
      if (r.status === 200 && r.body?.candidates) {
        const text = r.body.candidates[0]?.content?.parts?.[0]?.text || '';
        if (text) return text.trim();
      }
    } catch (e) { console.warn('[callAI] Gemini:', e.message); }
  }

  // Try OpenAI
  if (process.env.OPENAI_API_KEY) {
    try {
      const r = await httpsPost(
        'api.openai.com', '/v1/chat/completions',
        { Authorization: 'Bearer ' + process.env.OPENAI_API_KEY },
        { model: 'gpt-4o', max_tokens: maxTokens, messages }
      );
      if (r.status === 200 && r.body?.choices) return r.body.choices[0]?.message?.content || null;
    } catch (e) { console.warn('[callAI] OpenAI:', e.message); }
  }

  // Try Anthropic
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const r = await httpsPost(
        'api.anthropic.com', '/v1/messages',
        { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
        { model: 'claude-sonnet-4-6', max_tokens: maxTokens, messages }
      );
      if (r.status === 200 && r.body?.content) return r.body.content[0]?.text || null;
    } catch (e) { console.warn('[callAI] Anthropic:', e.message); }
  }

  return null;
}
// Alias for backward compat
const callOpenAI = callAI;

function safeJSON(text, fallback) {
  try {
    return JSON.parse((text || '').replace(/^```json\s*/i,'').replace(/^```\s*/i,'').replace(/\s*```$/i,'').trim());
  } catch { return fallback; }
}

// ═════════════════════════════════════════════════════════════════════════════
//  A. DELTA-CHECK — Longitudinal velocity analysis
// ═════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/cdss/delta/:patientId
 *
 * For every lab parameter extracted from AI analyses:
 *  1. Collects all historical values (newest first)
 *  2. Computes % change vs 3-month-ago and 6-month-ago readings
 *  3. Flags "Rapid Velocity Change" if |Δ| ≥ 40% even if still in normal range
 *
 * Response:
 *  { success, data: { parameters: { [name]: { points, velocityAlert, pctChange6m, pctChange3m } } } }
 */
router.get('/delta/:patientId', requireAuth, async (req, res) => {
  try {
    const doctorId = await getDoctorId(req);
    if (!doctorId) return res.status(403).json({ success: false, message: 'Doctors only' });

    const { patientId } = req.params;

    // Load all analyzed files for this patient, oldest first
    const files = await prisma.medicalFile.findMany({
      where: {
        patientId,
        OR: [{ isAnalyzed: true }, { isProcessed: true }],
      },
      orderBy: { createdAt: 'asc' },
      select:  { id: true, fileName: true, createdAt: true, aiAnalysis: true },
    });

    if (!files.length) {
      return res.json({ success: true, data: { parameters: {}, alerts: [] } });
    }

    // Build timeline: paramName → [{ date, value, unit, status, fileName }]
    const paramMap = {};

    for (const f of files) {
      let ai = f.aiAnalysis;
      if (typeof ai === 'string') { try { ai = JSON.parse(ai); } catch { continue; } }
      if (!ai) continue;

      const allFindings = [
        ...(ai.abnormalValues || []).map(s => ({ raw: s, status: 'abnormal' })),
        ...(ai.keyFindings    || []).map(s => ({ raw: s, status: 'normal'   })),
      ];

      for (const { raw, status } of allFindings) {
        // Regex: "Parameter Name: 3.2 mmol/L" or "Creatinine — 1.4 mg/dL"
        const m = raw.match(/^([A-Za-z][^:—\d]{1,50})[:—\s]+\s*([\d.]+)\s*([a-zA-Z/%µμ]+)/);
        if (!m) continue;
        const name  = m[1].trim();
        const value = parseFloat(m[2]);
        const unit  = m[3];
        if (isNaN(value) || value <= 0) continue;

        if (!paramMap[name]) paramMap[name] = [];

        // Avoid duplicate date entries for same param
        const dateStr = new Date(f.createdAt).toDateString();
        if (!paramMap[name].some(p => new Date(p.date).toDateString() === dateStr)) {
          paramMap[name].push({ date: f.createdAt, value, unit, status, fileName: f.fileName });
        }
      }
    }

    const now       = Date.now();
    const MS3M      = 90  * 24 * 3600 * 1000;
    const MS6M      = 180 * 24 * 3600 * 1000;
    const VELOCITY_THRESHOLD = 40; // 40% change = rapid velocity

    const result    = {};
    const alerts    = [];

    for (const [name, points] of Object.entries(paramMap)) {
      if (points.length < 2) continue;

      const sorted = points.sort((a, b) => new Date(a.date) - new Date(b.date));
      const latest = sorted[sorted.length - 1];

      // Find values nearest to 3m and 6m ago
      const find = (msAgo) => {
        const target = now - msAgo;
        return sorted.reduce((best, p) => {
          const d = Math.abs(new Date(p.date).getTime() - target);
          return (!best || d < Math.abs(new Date(best.date).getTime() - target)) ? p : best;
        }, null);
      };

      const ref3m = find(MS3M);
      const ref6m = find(MS6M);

      const pct = (ref, curr) => {
        if (!ref || ref === curr || ref.value === 0) return null;
        return ((curr.value - ref.value) / ref.value) * 100;
      };

      const pctChange3m = pct(ref3m, latest);
      const pctChange6m = pct(ref6m, latest);

      const isAlert = (
        (pctChange3m !== null && Math.abs(pctChange3m) >= VELOCITY_THRESHOLD) ||
        (pctChange6m !== null && Math.abs(pctChange6m) >= VELOCITY_THRESHOLD)
      );

      result[name] = {
        points:          sorted,
        latestValue:     latest.value,
        latestUnit:      latest.unit,
        latestStatus:    latest.status,
        latestDate:      latest.date,
        pctChange3m:     pctChange3m !== null ? Math.round(pctChange3m) : null,
        pctChange6m:     pctChange6m !== null ? Math.round(pctChange6m) : null,
        velocityAlert:   isAlert,
        ref3mValue:      ref3m?.value || null,
        ref6mValue:      ref6m?.value || null,
      };

      if (isAlert) {
        const pct = pctChange3m ?? pctChange6m;
        alerts.push({
          parameter:  name,
          latestValue:`${latest.value} ${latest.unit}`,
          change:     `${pct > 0 ? '+' : ''}${Math.round(pct)}% vs ${pctChange3m !== null ? '3 months ago' : '6 months ago'}`,
          direction:  pct > 0 ? 'increasing' : 'decreasing',
          severity:   Math.abs(pct) >= 70 ? 'CRITICAL' : 'HIGH',
          message:    `Rapid velocity change in ${name}: ${pct > 0 ? '+' : ''}${Math.round(pct)}% — review for early disease progression.`,
        });
      }
    }

    return res.json({ success: true, data: { parameters: result, alerts } });
  } catch (err) {
    console.error('[CDSS Delta-Check]', err.message);
    return res.status(500).json({ success: false, message: 'Delta-check failed', detail: err.message });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
//  B. RED FLAG ALERTS — Persistent critical banner on doctor dashboard
// ═════════════════════════════════════════════════════════════════════════════

// Critical lab value thresholds (parameter regex → threshold checker)
const CRITICAL_LAB_RULES = [
  { param: /potassium|k\+/i,     check: v => v > 6.0,   msg: (v,u) => `Potassium critically elevated: ${v} ${u} (>6.0 mmol/L — life-threatening arrhythmia risk)` },
  { param: /potassium|k\+/i,     check: v => v < 2.5,   msg: (v,u) => `Potassium critically low: ${v} ${u} (<2.5 mmol/L — arrhythmia risk)` },
  { param: /sodium|na\+/i,       check: v => v > 155,   msg: (v,u) => `Severe hypernatraemia: ${v} ${u} — neurological emergency` },
  { param: /sodium|na\+/i,       check: v => v < 120,   msg: (v,u) => `Severe hyponatraemia: ${v} ${u} — seizure risk` },
  { param: /haemoglobin|hb|hemoglobin/i, check: v => v < 6.0, msg: (v,u) => `Critical anaemia: Hb ${v} ${u} — transfusion likely required` },
  { param: /platelet/i,          check: v => v < 20,    msg: (v,u) => `Critical thrombocytopenia: ${v}K — spontaneous bleeding risk` },
  { param: /glucose|blood sugar/i, check: v => v > 33.3, msg: (v,u) => `Critically high glucose: ${v} ${u} — possible HHS/DKA` },
  { param: /glucose|blood sugar/i, check: v => v < 2.5,  msg: (v,u) => `Critically low glucose: ${v} ${u} — severe hypoglycaemia` },
  { param: /creatinine/i,        check: v => v > 884,   msg: (v,u) => `Critical creatinine: ${v} ${u} — acute kidney injury, dialysis may be needed` },
  { param: /inr/i,               check: v => v > 5.0,   msg: (v,u) => `Critical INR: ${v} — severe bleeding risk, urgent reversal needed` },
  { param: /troponin/i,          check: v => v > 0.4,   msg: (v,u) => `Elevated troponin: ${v} ${u} — possible STEMI/NSTEMI, urgent cardiology review` },
];

// Red flag chat keywords — force-escalate
const RED_FLAG_KEYWORDS = [
  'crushing chest pain', 'chest pain radiating', 'heart attack', 'cardiac arrest',
  'sudden vision loss', 'cannot see', 'vision gone', 'went blind',
  'stroke', 'face drooping', 'arm weakness', 'slurred speech', 'worst headache',
  'cannot breathe', 'stopped breathing', 'blue lips', 'anaphylaxis', 'severe allergic',
  'unconscious', 'unresponsive', 'collapsed', 'seizure', 'convulsing',
  'potassium 6', 'k+ 6', 'k 7', 'haemoglobin 4', 'hb 4', 'sugar 450', 'sugar 500',
  'blood sugar 500', 'glucose 45', 'blood pressure 200', 'bp 220', 'bp 230',
  'blood in urine', 'blood in stool', 'vomiting blood', 'coughing blood',
  'paralysis', 'can not move', 'cannot feel', 'numbness in',
];

/**
 * Extract critical lab values from AI analysis text
 */
function extractCriticalLabAlerts(aiAnalysis, patientId, patientName, fileId, fileName) {
  const alerts = [];
  if (!aiAnalysis) return alerts;

  const findings = [
    ...(aiAnalysis.abnormalValues || []).map(s => ({ text: s, status: 'abnormal' })),
    ...(aiAnalysis.keyFindings    || []).map(s => ({ text: s, status: 'normal'   })),
  ];

  for (const { text } of findings) {
    const m = text.match(/^([A-Za-z][^:—\d]{1,40})[:—\s]+\s*([\d.]+)\s*([a-zA-Z/%µμ]+)/);
    if (!m) continue;
    const name  = m[1].trim();
    const value = parseFloat(m[2]);
    const unit  = m[3];
    if (isNaN(value)) continue;

    for (const rule of CRITICAL_LAB_RULES) {
      if (rule.param.test(name) && rule.check(value)) {
        alerts.push({
          type:        'LAB_CRITICAL',
          severity:    'CRITICAL',
          patientId,
          patientName,
          fileId,
          fileName,
          parameter:   name,
          value:       `${value} ${unit}`,
          message:     rule.msg(value, unit),
          triggeredAt: new Date().toISOString(),
        });
      }
    }
  }
  return alerts;
}

// In-memory alert store (replace with DB table in production)
// Shape: { id, type, severity, patientId, patientName, fileId, fileName,
//           parameter, value, message, triggeredAt, doctorId, acknowledged }
let _alerts = [];
let _alertId = 1;

/**
 * POST /api/cdss/alerts/lab-critical
 * Called internally by chat.js / files.js after AI file analysis completes.
 * Body: { patientId, patientName, fileId, fileName, aiAnalysis, doctorId }
 */
router.post('/alerts/lab-critical', requireAuth, (req, res) => {
  try {
    const { patientId, patientName, fileId, fileName, aiAnalysis, doctorId } = req.body;
    let ai = aiAnalysis;
    if (typeof ai === 'string') { try { ai = JSON.parse(ai); } catch { ai = null; } }

    const newAlerts = extractCriticalLabAlerts(ai, patientId, patientName, fileId, fileName);

    for (const a of newAlerts) {
      // Deduplicate: same param + patient within 24h
      const exists = _alerts.some(x =>
        x.patientId === patientId && x.parameter === a.parameter &&
        !x.acknowledged &&
        Date.now() - new Date(x.triggeredAt).getTime() < 24 * 3600 * 1000
      );
      if (!exists) {
        _alerts.push({ id: _alertId++, ...a, doctorId: doctorId || null, acknowledged: false });
      }
    }

    return res.json({ success: true, created: newAlerts.length });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/cdss/alerts/message-check
 * Called by chat.js when a patient sends a message.
 * Body: { patientId, patientName, message, doctorId }
 */
router.post('/alerts/message-check', requireAuth, (req, res) => {
  try {
    const { patientId, patientName, message, doctorId } = req.body;
    const lower = (message || '').toLowerCase();

    const hit = RED_FLAG_KEYWORDS.find(kw => lower.includes(kw));
    if (!hit) return res.json({ success: true, created: 0 });

    const exists = _alerts.some(x =>
      x.patientId === patientId && x.type === 'MESSAGE_RED_FLAG' &&
      !x.acknowledged &&
      Date.now() - new Date(x.triggeredAt).getTime() < 6 * 3600 * 1000
    );

    if (!exists) {
      _alerts.push({
        id:          _alertId++,
        type:        'MESSAGE_RED_FLAG',
        severity:    'CRITICAL',
        patientId,
        patientName,
        fileId:      null,
        fileName:    null,
        parameter:   'Chat Message',
        value:       hit,
        message:     `🚨 RED FLAG: Patient ${patientName} reported "${hit}" — immediate clinical attention required.`,
        triggeredAt: new Date().toISOString(),
        doctorId:    doctorId || null,
        acknowledged: false,
      });
    }

    return res.json({ success: true, created: 1, keyword: hit });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * GET /api/cdss/alerts
 * Doctor: fetch all active (unacknowledged) critical alerts for their patients.
 */
router.get('/alerts', requireAuth, async (req, res) => {
  try {
    const doctorId = await getDoctorId(req);
    if (!doctorId) return res.status(403).json({ success: false, message: 'Doctors only' });

    // Filter to this doctor's patients via chat rooms or appointments
    let patientIds = new Set();
    try {
      const appts = await prisma.appointment.findMany({ where: { doctorId }, select: { patientId: true } });
      appts.forEach(a => patientIds.add(a.patientId));
      const rooms = await prisma.chatRoom.findMany({ where: { appointment: { doctorId } }, select: { appointment: { select: { patientId: true } } } });
      rooms.forEach(r => r.appointment?.patientId && patientIds.add(r.appointment.patientId));
    } catch {}

    const active = _alerts.filter(a =>
      !a.acknowledged &&
      (patientIds.has(a.patientId) || a.doctorId === doctorId)
    ).sort((a, b) => new Date(b.triggeredAt) - new Date(a.triggeredAt));

    return res.json({ success: true, data: active, count: active.length });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/cdss/alerts/acknowledge
 * Body: { alertId }
 */
router.post('/alerts/acknowledge', requireAuth, (req, res) => {
  try {
    const { alertId } = req.body;
    const alert = _alerts.find(a => a.id === parseInt(alertId));
    if (!alert) return res.status(404).json({ success: false, message: 'Alert not found' });
    alert.acknowledged    = true;
    alert.acknowledgedAt  = new Date().toISOString();
    alert.acknowledgedBy  = getUserId(req);
    return res.json({ success: true, alertId });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
//  C. ABDM/ABHA INTEGRATION
// ═════════════════════════════════════════════════════════════════════════════

// In-memory ABHA cache (replace with DB field on Patient model in production)
// ABHA data persisted in AbhaRecord table (not in-memory cache)

/**
 * POST /api/cdss/abha/fetch
 * Doctor pulls a patient's national health history via their ABHA ID.
 * Body: { patientId, abhaId }
 *
 * ABDM Sandbox: https://sandbox.abdm.gov.in
 * For production: replace mockFetchABHARecords() with real ABDM API calls.
 */
router.post('/abha/fetch', requireAuth, async (req, res) => {
  try {
    const doctorId = await getDoctorId(req);
    if (!doctorId) return res.status(403).json({ success: false, message: 'Doctors only' });

    const { patientId, abhaId } = req.body;
    if (!patientId || !abhaId)
      return res.status(400).json({ success: false, message: 'patientId and abhaId required' });

    // Validate ABHA ID format: 14-digit or XX-XXXX-XXXX-XXXX
    const cleanAbha = abhaId.replace(/-/g, '').trim();
    if (!/^\d{14}$/.test(cleanAbha))
      return res.status(400).json({ success: false, message: 'Invalid ABHA ID format. Must be 14 digits (e.g., 12-3456-7890-1234)' });

    // Check cache (valid for 24 hours)
    const cached = null; // check Patient.policyNumber (ABHA: prefix)
    const patientRec = await prisma.patient.findUnique({ where: { id: patientId }, select: { policyNumber: true } });
    const storedAbha = patientRec?.policyNumber?.startsWith('ABHA:') ? patientRec.policyNumber.slice(5) : null;
    if (storedAbha === cleanAbha) {
      // Check if we have a recent summary in cache
      const cacheKey = 'abha_' + patientId;
      const cached2  = global._abhaCache ? global._abhaCache[cacheKey] : null;
      if (cached2 && Date.now() - cached2.fetchedAt < 24 * 3600 * 1000) {
        return res.json({ success: true, data: cached2, fromCache: true });
      }
    }

    // Try ABDM Sandbox API
    // In production: register at https://sandbox.abdm.gov.in/abdm-milestones/3
    // and replace this with actual OAuth2 flow + FHIR bundle fetch
    let records = null;
    let abhaFetchError = null;

    if (process.env.ABDM_CLIENT_ID && process.env.ABDM_CLIENT_SECRET) {
      try {
        records = await fetchFromABDMSandbox(cleanAbha);
      } catch (e) {
        abhaFetchError = e.message;
        console.error('[ABDM]', e.message);
      }
    }

    // Fall back to real patient data from our DB (not fake hardcoded data)
    let isMock = false;
    if (!records) {
      records = await buildRecordsFromDB(patientId);
      isMock = true;
    }

    // AI summarises the health history
    const summary = await summariseABHARecords(records, patientId);

    const result = {
      abhaId:    cleanAbha,
      records,
      summary,
      fetchedAt: Date.now(),
      isMock,
      source:    isMock ? 'MediConnect records' : 'ABDM national database',
    };

    // Save ABHA via policyNumber field (ABHA: prefix) + cache summary in memory
    await prisma.patient.update({
      where: { id: patientId },
      data:  { policyNumber: 'ABHA:' + cleanAbha },
    });
    global._abhaCache['abha_' + patientId] = { ...result, fetchedAt: Date.now() };

    return res.json({ success: true, data: result });
  } catch (err) {
    console.error('[CDSS ABHA fetch]', err.message);
    return res.status(500).json({ success: false, message: 'ABHA fetch failed', detail: err.message });
  }
});

/**
 * GET /api/cdss/abha/:patientId
 * Returns cached ABHA data if available.
 */
router.get('/abha/:patientId', requireAuth, async (req, res) => {
  const cached = null;
  try {
    const pat = await prisma.patient.findUnique({ where: { id: req.params.patientId }, select: { policyNumber: true } });
    const storedId = pat?.policyNumber?.startsWith('ABHA:') ? pat.policyNumber.slice(5) : null;
    if (!storedId) return res.json({ success: true, data: null });
    const cacheKey = 'abha_' + req.params.patientId;
    const cached3  = global._abhaCache ? global._abhaCache[cacheKey] : null;
    if (cached3) return res.json({ success: true, data: cached3, fromCache: true });
    return res.json({ success: true, data: { abhaId: storedId, summary: null, records: {}, isMock: true, fetchedAt: null } });
  } catch (e) { return res.json({ success: true, data: null }); }
});

// ABDM Sandbox API helper (real implementation)
async function fetchFromABDMSandbox(abhaId) {
  // Step 1: Get access token
  const tokenRes = await fetch('https://dev.abdm.gov.in/gateway/v0.5/sessions', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      clientId:     process.env.ABDM_CLIENT_ID,
      clientSecret: process.env.ABDM_CLIENT_SECRET,
    }),
  });
  if (!tokenRes.ok) throw new Error(`ABDM auth failed: ${tokenRes.status}`);
  const { accessToken } = await tokenRes.json();

  // Step 2: Fetch health records (FHIR bundle)
  const recordsRes = await fetch(`https://dev.abdm.gov.in/fhir/R4/Patient/${abhaId}/$everything`, {
    headers: { Authorization: `Bearer ${accessToken}`, 'X-CM-ID': 'sbx' },
  });
  if (!recordsRes.ok) throw new Error(`ABDM records fetch failed: ${recordsRes.status}`);
  return await recordsRes.json();
}

// Build health record structure from our own DB (real patient data)
// Used when ABDM national API is not configured
async function buildRecordsFromDB(patientId) {
  try {
    const patient = await prisma.patient.findUnique({
      where:   { id: patientId },
      include: {
        conditions:  { where: { isActive: true } },
        allergies:   true,
        medications: { where: { isActive: true } },
        vitals:      { orderBy: { recordedAt: 'desc' }, take: 5 },
        appointments: {
          where:   { status: { in: ['COMPLETED', 'CONFIRMED'] } },
          orderBy: { scheduledAt: 'desc' },
          take:    10,
          include: { doctor: { select: { firstName: true, lastName: true, specialty: true, hospital: true } } },
        },
        files: {
          where:   { isProcessed: true },
          orderBy: { createdAt: 'desc' },
          take:    5,
          select:  { fileName: true, category: true, createdAt: true, aiAnalysis: true, urgencyLevel: true },
        },
      },
    });

    if (!patient) return { encounters: [], medications: [], allergies: [], facilities: [], vaccinations: [] };

    // Build encounters from appointments
    const encounters = (patient.appointments || []).map(a => ({
      date:      a.scheduledAt ? new Date(a.scheduledAt).toISOString().split('T')[0] : 'Unknown',
      hospital:  a.doctor?.hospital || 'MediConnect Clinic',
      specialty: a.doctor?.specialty || 'General Practice',
      doctor:    a.doctor ? 'Dr. ' + a.doctor.firstName + ' ' + a.doctor.lastName : 'Unknown',
      diagnosis: a.reason || a.notes || 'Consultation',
      treatment: a.notes || '',
      labs:      '',
    }));

    // Build medications
    const medications = (patient.medications || []).map(m => ({
      name:      m.name,
      dose:      m.dosage || m.dose || '',
      frequency: m.frequency || '',
      since:     m.startDate ? new Date(m.startDate).toISOString().split('T')[0] : '',
    }));

    // Build allergies
    const allergies = (patient.allergies || []).map(a => ({
      allergen:  a.allergen,
      reaction:  a.reaction || '',
      severity:  a.severity || 'Unknown',
    }));

    // Conditions as diagnoses
    const conditionList = (patient.conditions || []).map(c => c.condition).filter(Boolean);

    // Facilities from appointments
    const facilities = [...new Set((patient.appointments || [])
      .map(a => a.doctor?.hospital).filter(Boolean))];

    // Recent lab files as additional context
    const labNotes = (patient.files || []).map(f => {
      let urgency = '';
      if (f.urgencyLevel === 'HIGH' || f.urgencyLevel === 'CRITICAL') urgency = ' [' + f.urgencyLevel + ']';
      return f.category + ': ' + f.fileName + urgency;
    }).join('; ');

    return {
      resourceType: 'PatientRecord',
      source:       'MediConnect',
      note:         'Records from MediConnect AI. Configure ABDM_CLIENT_ID in .env for national ABHA records.',
      patientName:  patient.firstName + ' ' + patient.lastName,
      conditions:   conditionList,
      encounters,
      medications,
      allergies,
      vaccinations: [],
      facilities:   facilities.length ? facilities : ['MediConnect Clinic'],
      recentFiles:  labNotes || 'None',
    };
  } catch (e) {
    console.error('[buildRecordsFromDB]', e.message);
    return { encounters: [], medications: [], allergies: [], facilities: [], vaccinations: [] };
  }
}

// Legacy mock function kept for reference only (not called anymore)
function generateMockABHARecords(abhaId, rawId) {
  const years = [2022, 2023, 2024];
  return {
    resourceType: 'Bundle',
    abhaId: rawId,
    note: '⚠ DEMO DATA — ABDM_CLIENT_ID not configured. Configure .env for real records.',
    encounters: [
      {
        date: '2024-08-14', hospital: 'Manipal Hospital, Bangalore',
        specialty: 'Cardiology', doctor: 'Dr. Ravi Shankar',
        diagnosis: 'Hypertension Stage 2 (I10)', treatment: 'Amlodipine 10mg OD prescribed',
        labs: 'ECG: Sinus rhythm, LVH changes. Echo: EF 55%',
      },
      {
        date: '2024-03-02', hospital: 'Apollo Hospital, Bangalore',
        specialty: 'Endocrinology', doctor: 'Dr. Meena Iyer',
        diagnosis: 'Type 2 Diabetes Mellitus (E11)', treatment: 'Metformin 1000mg BD + Glipizide 5mg',
        labs: 'HbA1c: 9.1%. Fasting glucose: 198 mg/dL. Renal function: normal.',
      },
      {
        date: '2023-11-18', hospital: 'Narayana Health City, Bangalore',
        specialty: 'Nephrology', doctor: 'Dr. Suresh Kumar',
        diagnosis: 'Microalbuminuria (early diabetic nephropathy)',
        treatment: 'Telmisartan 40mg added. Low protein diet counselling.',
        labs: 'Creatinine: 1.2 mg/dL. eGFR: 68 ml/min. Urine ACR: 42 mg/g.',
      },
      {
        date: '2023-05-30', hospital: 'Fortis Hospital, Bangalore',
        specialty: 'Ophthalmology', doctor: 'Dr. Priya Nair',
        diagnosis: 'Non-proliferative diabetic retinopathy (mild)',
        treatment: 'Annual fundus review recommended. Optimise glycaemic control.',
        labs: 'Fundoscopy: Microaneurysms bilateral. BCVA 6/9.',
      },
      {
        date: '2022-09-11', hospital: 'Government Medical College, Mysore',
        specialty: 'General Medicine', doctor: 'Dr. Arjun Rao',
        diagnosis: 'Dyslipidaemia. Fatty liver (Grade 1).',
        treatment: 'Atorvastatin 20mg. Lifestyle counselling.',
        labs: 'LDL: 178 mg/dL. HDL: 38 mg/dL. TG: 210 mg/dL. Liver USS: Grade 1 fatty infiltration.',
      },
    ],
    medications: [
      { name: 'Metformin', dose: '1000mg', frequency: 'BD', since: '2024-03-02' },
      { name: 'Amlodipine', dose: '10mg', frequency: 'OD', since: '2024-08-14' },
      { name: 'Telmisartan', dose: '40mg', frequency: 'OD', since: '2023-11-18' },
      { name: 'Atorvastatin', dose: '20mg', frequency: 'OD', since: '2022-09-11' },
      { name: 'Glipizide', dose: '5mg', frequency: 'OD', since: '2024-03-02' },
    ],
    allergies: [{ allergen: 'Sulfonamides', reaction: 'Rash', severity: 'Moderate' }],
    vaccinations: [
      { name: 'COVID-19 (Covishield)', date: '2021-06-10', dose: 'Both doses' },
      { name: 'Influenza', date: '2023-10-15', dose: 'Annual' },
    ],
    facilities: ['Manipal Hospital', 'Apollo Hospital', 'Narayana Health City', 'Fortis Hospital', 'Government MC Mysore'],
  };
}

// AI summary of ABHA national health history
async function summariseABHARecords(records, patientId) {
  if (!records?.encounters?.length) return null; // no summary needed when no encounters

  // If this is local DB data, build a rule-based summary without AI (saves API credits)
  if (records.source === 'MediConnect') {
    const condList = records.conditions?.length ? records.conditions.join(', ') : 'None recorded';
    const medList  = (records.medications || []).map(m => m.name + (m.dose ? ' ' + m.dose : '')).join(', ') || 'None';
    const allergyList = (records.allergies || []).map(a => a.allergen).join(', ') || 'None';
    const lastVisit = records.encounters?.[0];
    const lastVisitStr = lastVisit
      ? 'Last seen ' + lastVisit.date + ' at ' + lastVisit.hospital + ' (' + lastVisit.specialty + ')'
      : 'No previous appointments';
    return [
      'Patient has ' + records.encounters.length + ' appointment(s) on record in MediConnect.',
      lastVisitStr + '.',
      'Active conditions: ' + condList + '.',
      'Current medications: ' + medList + '.',
      'Allergies: ' + allergyList + '.',
      records.recentFiles ? 'Recent files: ' + records.recentFiles + '.' : '',
    ].filter(Boolean).join(' ');
  }


  const context = [
    `Hospitals visited: ${records.facilities?.join(', ') || 'Multiple'}`,
    `Encounters:\n${records.encounters.map(e => `  - ${e.date} at ${e.hospital} (${e.specialty}): ${e.diagnosis}. ${e.treatment}`).join('\n')}`,
    `Current medications: ${records.medications?.map(m => `${m.name} ${m.dose} ${m.frequency}`).join(', ') || 'None'}`,
    `Allergies: ${records.allergies?.map(a => `${a.allergen} (${a.severity})`).join(', ') || 'None'}`,
  ].join('\n\n');

  const prompt = `You are a senior clinical AI. A doctor has pulled this patient's national health record from ABDM/ABHA. Summarise it in 4 concise clinical sentences for the doctor:
1. Overall disease burden and chronology.
2. Key concerning trends or progressions.
3. Current medication load and any interactions to watch.
4. What the doctor should focus on today based on this history.

NATIONAL HEALTH RECORD:
${context}

Return ONLY the 4 sentences. No headings, no bullet points.`;

  const text = await callOpenAI([{ role: 'user', content: prompt }], 400);
  if (text) return text.trim();

  // Fallback summary
  const diagList = records.encounters.map(e => e.diagnosis).join('; ');
  const medList  = records.medications?.map(m => m.name).join(', ') || 'None';
  return `Patient has ${records.encounters.length} encounters across ${records.facilities?.length || 'multiple'} hospitals. Diagnoses include: ${diagList}. Current medications: ${medList}. Review full encounter timeline for treatment continuity.`;
}

// ═════════════════════════════════════════════════════════════════════════════
//  D. DIFFERENTIAL DIAGNOSIS (DDx) ENGINE
// ═════════════════════════════════════════════════════════════════════════════

// Rule-based DDx table (runs without API key)
// Pattern: { findings: [regex], symptoms: [regex], ddx: [{ condition, confidence, action }] }
const DDX_RULES = [
  {
    id: 'eosinophilia_skin',
    findings: [/eosinophil/i],
    symptoms: [/skin rash|urticaria|itch|pruritus|hives|wheeze|wheez/i],
    ddx: [
      { condition: 'Allergic Reaction (Atopy)', confidence: 'HIGH',   action: 'Order total IgE, skin prick test. Start antihistamine.' },
      { condition: 'Parasitic Infection (Helminth)', confidence: 'HIGH', action: 'Stool microscopy for ova and cysts. Consider albendazole.' },
      { condition: 'Drug Hypersensitivity',          confidence: 'MEDIUM', action: 'Review medication list. Patch test if indicated.' },
    ],
  },
  {
    id: 'chest_ecg',
    findings: [/troponin|st elevation|st depression|lbbb/i],
    symptoms: [/chest pain|chest tightness|jaw pain|arm pain|breathless|dyspnoea/i],
    ddx: [
      { condition: 'STEMI / NSTEMI',                confidence: 'HIGH',   action: 'Urgent cardiology. ECG, repeat troponin at 3h, aspirin 300mg.' },
      { condition: 'Unstable Angina',               confidence: 'HIGH',   action: 'Admit, continuous monitoring, dual antiplatelet, LMWH.' },
      { condition: 'Aortic Dissection',             confidence: 'MEDIUM', action: 'CT aortogram if BP differential >20mmHg between arms.' },
    ],
  },
  {
    id: 'anaemia_fatigue',
    findings: [/haemoglobin|hemoglobin|hb\b|mcv|iron/i],
    symptoms: [/fatigue|tired|weakness|pallor|dizziness|breathless|dyspnoea/i],
    ddx: [
      { condition: 'Iron Deficiency Anaemia',       confidence: 'HIGH',   action: 'Serum ferritin, iron studies. Oral iron + dietary advice.' },
      { condition: 'B12 / Folate Deficiency',       confidence: 'MEDIUM', action: 'Serum B12, folate, peripheral smear for macrocytes.' },
      { condition: 'Anaemia of Chronic Disease',    confidence: 'MEDIUM', action: 'CRP, ESR, renal function, TIBC. Treat underlying cause.' },
      { condition: 'Thalassaemia Trait',            confidence: 'LOW',    action: 'HPLC for haemoglobin fractionation if microcytic.' },
    ],
  },
  {
    id: 'ckd_diabetes',
    findings: [/creatinine|egfr|urea|microalbumin|urine acr/i],
    symptoms: [/diabetes|diabetic|blood sugar|glucose|thirst|polyuria|oedema/i],
    ddx: [
      { condition: 'Diabetic Nephropathy',          confidence: 'HIGH',   action: 'Urine ACR, eGFR trend. Start ACE/ARB if not on it. Endocrinology referral.' },
      { condition: 'CKD (Non-diabetic)',            confidence: 'MEDIUM', action: 'Renal ultrasound, ANCA, complement levels if suspected GN.' },
      { condition: 'Acute Kidney Injury',           confidence: 'MEDIUM', action: 'Review nephrotoxins, fluid balance. Urine output monitoring.' },
    ],
  },
  {
    id: 'thyroid',
    findings: [/tsh|t3|t4|thyroid/i],
    symptoms: [/weight gain|weight loss|fatigue|cold intolerance|heat intolerance|palpitation|anxiety|constipation|hair loss/i],
    ddx: [
      { condition: 'Hypothyroidism',                confidence: 'HIGH',   action: 'TSH, Free T4. Start levothyroxine if TSH >10 or symptomatic.' },
      { condition: 'Hyperthyroidism (Graves)',      confidence: 'HIGH',   action: 'TSH, Free T4, TRAb. Carbimazole or radioiodine.' },
      { condition: 'Subclinical Thyroid Disease',   confidence: 'MEDIUM', action: 'Repeat TFTs in 3 months. Treat if TSH <0.1 or >10.' },
    ],
  },
  {
    id: 'liver',
    findings: [/alt|ast|bilirubin|ggt|alkaline phosphatase|alp/i],
    symptoms: [/jaundice|yellow|nausea|vomiting|abdominal pain|alcohol|fatty|obesity/i],
    ddx: [
      { condition: 'Non-Alcoholic Fatty Liver (NAFLD)', confidence: 'HIGH', action: 'Liver ultrasound, FIB-4 score, lifestyle modification.' },
      { condition: 'Alcoholic Liver Disease',           confidence: 'HIGH', action: 'AST:ALT ratio, GGT, AUDIT questionnaire.' },
      { condition: 'Viral Hepatitis (B/C)',             confidence: 'MEDIUM', action: 'HBsAg, Anti-HCV, HCV RNA.' },
      { condition: 'Drug-Induced Liver Injury',         confidence: 'MEDIUM', action: 'Review hepatotoxic medications (statins, NSAIDs, antitubercular).' },
    ],
  },
  {
    id: 'hypertension_headache',
    findings: [/blood pressure|systolic|diastolic|bp\b/i],
    symptoms: [/headache|head pain|nausea|vision|dizzy|dizziness/i],
    ddx: [
      { condition: 'Hypertensive Urgency',          confidence: 'HIGH',   action: 'BP >180/120 without organ damage. Oral antihypertensives, recheck in 1h.' },
      { condition: 'Hypertensive Emergency',        confidence: 'HIGH',   action: 'BP >180/120 + end-organ damage. IV labetalol/nitroprusside. ICU.' },
      { condition: 'Secondary Hypertension',        confidence: 'MEDIUM', action: 'Renal artery Doppler, aldosterone:renin, 24h urine catecholamines.' },
    ],
  },
  {
    id: 'respiratory',
    findings: [/spo2|oxygen saturation|pco2|cxr|chest x.ray|d.dimer/i],
    symptoms: [/breathless|dyspnoea|cough|sputum|fever|pleuritic|haemoptysis/i],
    ddx: [
      { condition: 'Community-Acquired Pneumonia',  confidence: 'HIGH',   action: 'CURB-65 score. Amoxicillin ± clarithromycin. CXR.' },
      { condition: 'Pulmonary Embolism',            confidence: 'MEDIUM', action: 'D-dimer, Wells score. CTPA if score ≥2.' },
      { condition: 'COPD Exacerbation',             confidence: 'MEDIUM', action: 'Nebulised salbutamol, steroids, ABG. Consider antibiotics.' },
      { condition: 'COVID-19 / Viral Pneumonitis',  confidence: 'LOW',    action: 'SARS-CoV-2 PCR, HRCT chest if deteriorating.' },
    ],
  },
];

/**
 * POST /api/cdss/ddx
 * Differential Diagnosis engine.
 * Body: { patientId, reportSummary, chatMessages, patientContext }
 */
router.post('/ddx', requireAuth, async (req, res) => {
  try {
    const doctorId = await getDoctorId(req);
    if (!doctorId) return res.status(403).json({ success: false, message: 'Doctors only' });

    const { patientId, reportSummary, chatMessages = [], patientContext = {} } = req.body;

    // Combine all text context for matching
    const combinedText = [
      reportSummary || '',
      chatMessages.map(m => m.content || m.text || '').join(' '),
      (patientContext.conditions || []).map(c => c.condition || c).join(' '),
    ].join(' ').toLowerCase();

    // Step 1: Rule-based matching (instant, no API cost)
    const ruleMatches = [];
    for (const rule of DDX_RULES) {
      const findingHit  = rule.findings.some(rx => rx.test(combinedText));
      const symptomHit  = rule.symptoms.some(rx => rx.test(combinedText));
      if (findingHit && symptomHit) {
        ruleMatches.push({
          ruleId:     rule.id,
          conditions: rule.ddx,
          confidence: 'RULE_BASED',
        });
      }
    }

    // Step 2: AI-powered DDx (if API key available)
    let aiDdx = null;
    const hasKey = !!(process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY);

    if (hasKey && (reportSummary || chatMessages.length)) {
      const recentChats = chatMessages.slice(-10).map(m =>
        `${m.senderRole === 'PATIENT' ? 'Patient' : 'Doctor'}: ${m.content || m.text}`
      ).join('\n');

      const conditions = (patientContext.conditions || []).map(c => c.condition || c).join(', ') || 'Not specified';
      const medications = (patientContext.medications || []).map(m => m.name || m).join(', ') || 'None';

      const prompt = `You are an expert clinician acting as a senior resident. Based on the clinical evidence below, generate a differential diagnosis.

PATIENT CONTEXT:
  Known conditions: ${conditions}
  Medications: ${medications}

RECENT REPORT FINDINGS:
${reportSummary || 'No recent reports'}

RECENT CHAT (last 10 messages):
${recentChats || 'No chat history'}

TASK: Return ONLY a JSON array of 3-5 differential diagnoses in this exact format:
[
  {
    "condition": "Full condition name (ICD-10 code if applicable)",
    "confidence": "HIGH" | "MEDIUM" | "LOW",
    "reasoning": "One sentence explaining why this fits the evidence",
    "action": "Specific next step: test, referral, or treatment",
    "urgent": true | false
  }
]

Order by clinical probability (most likely first). Prefer conditions that explain ALL the evidence.`;

      const text = await callOpenAI([{ role: 'user', content: prompt }], 800);
      if (text) {
        const parsed = safeJSON(text, null);
        if (Array.isArray(parsed)) aiDdx = parsed;
      }
    }

    // Merge: AI DDx takes priority, rule-based fills gaps
    const finalDdx = aiDdx || ruleMatches.flatMap(r =>
      r.conditions.map(c => ({
        condition:  c.condition,
        confidence: c.confidence,
        reasoning:  'Pattern match: lab findings + reported symptoms',
        action:     c.action,
        urgent:     c.confidence === 'HIGH',
      }))
    );

    if (!finalDdx.length) {
      return res.json({
        success: true,
        data: {
          ddx:     [],
          message: 'Insufficient clinical data for differential diagnosis. Upload a lab report and ensure the patient has described their symptoms in chat.',
          source:  'none',
        },
      });
    }

    return res.json({
      success: true,
      data: {
        ddx:     finalDdx,
        source:  aiDdx ? 'ai' : 'rules',
        context: {
          reportSummaryProvided: !!reportSummary,
          chatMessagesCount:     chatMessages.length,
          ruleMatchesCount:      ruleMatches.length,
        },
      },
    });
  } catch (err) {
    console.error('[CDSS DDx]', err.message);
    return res.status(500).json({ success: false, message: 'DDx engine failed', detail: err.message });
  }
});

// ── DDx for a specific file (called after AI analysis) ────────────────────────
/**
 * GET /api/cdss/ddx/:patientId/latest
 * Auto-generates DDx from the patient's most recent analyzed file + chat.
 */
router.get('/ddx/:patientId/latest', requireAuth, async (req, res) => {
  try {
    const doctorId = await getDoctorId(req);
    if (!doctorId) return res.status(403).json({ success: false, message: 'Doctors only' });

    const { patientId } = req.params;

    // Get latest analyzed file
    const latestFile = await prisma.medicalFile.findFirst({
      where:   { patientId, OR: [{ isAnalyzed: true }, { isProcessed: true }] },
      orderBy: { createdAt: 'desc' },
    });

    // Get recent chat messages
    const chatRoom = await prisma.chatRoom.findFirst({
      where:   { appointment: { patientId } },
      include: { messages: { orderBy: { createdAt: 'desc' }, take: 20 } },
    });
    const messages = (chatRoom?.messages || []).reverse();

    // Get patient context
    const patient = await prisma.patient.findUnique({
      where:   { id: patientId },
      include: { conditions: { where: { isActive: true } }, medications: { where: { isActive: true } } },
    });

    let ai = latestFile?.aiAnalysis;
    if (typeof ai === 'string') { try { ai = JSON.parse(ai); } catch { ai = null; } }

    const reportSummary = ai
      ? [
          ai.briefSummary || '',
          (ai.keyFindings    || []).join('. '),
          (ai.abnormalValues || []).join('. '),
        ].filter(Boolean).join('\n')
      : '';

    // Delegate to the DDx route logic inline
    const combinedText = [
      reportSummary,
      messages.map(m => m.content || '').join(' '),
      (patient?.conditions || []).map(c => c.condition).join(' '),
    ].join(' ').toLowerCase();

    const ruleMatches = [];
    for (const rule of DDX_RULES) {
      if (rule.findings.some(rx => rx.test(combinedText)) && rule.symptoms.some(rx => rx.test(combinedText))) {
        ruleMatches.push(...rule.ddx.map(c => ({
          condition:  c.condition,
          confidence: c.confidence,
          reasoning:  'Pattern match from report findings + chat',
          action:     c.action,
          urgent:     c.confidence === 'HIGH',
        })));
      }
    }

    return res.json({
      success: true,
      data: {
        ddx:          ruleMatches,
        source:       'rules',
        patientId,
        latestFileId: latestFile?.id || null,
        fileName:     latestFile?.fileName || null,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;