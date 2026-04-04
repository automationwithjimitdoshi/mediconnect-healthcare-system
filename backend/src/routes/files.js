// routes/files.js — FIXED
// Key fix: download endpoint now resolves files uploaded via chat.js
// (which store storageUrl/storageKey, not filePath)

const express = require('express');
const router  = express.Router();
const path    = require('path');
const fs      = require('fs');
const jwt     = require('jsonwebtoken');
const prisma  = require('../lib/prisma');
const { analyzeMedicalFile } = require('../services/aiService');

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

function getFileCategory(mimetype) {
  if (!mimetype) return 'DOCUMENT';
  if (mimetype.startsWith('image/')) return 'IMAGE';
  if (mimetype === 'application/pdf') return 'PDF';
  if (mimetype === 'application/dicom') return 'DICOM';
  return 'DOCUMENT';
}

function getFileUrl(filename, category) {
  const sub = { IMAGE: 'images', PDF: 'pdfs', DICOM: 'dicom' }[category] || 'documents';
  return '/uploads/' + sub + '/' + filename;
}

// Resolve the actual disk path for any file.
// files.js uploads have filePath (absolute path).
// chat.js uploads have storageUrl ('/uploads/pdfs/xxx.pdf') or storageKey ('xxx.pdf').
function resolveDiskPath(file) {
  // 1. Direct absolute path (files.js)
  if (file.filePath && fs.existsSync(file.filePath)) return file.filePath;

  // Find uploads directory
  const candidates = [
    path.join(__dirname, '..', '..', 'uploads'),
    path.join(__dirname, '..', 'uploads'),
    path.join(process.cwd(), 'uploads'),
  ];
  const UPLOAD_DIR = candidates.find(d => fs.existsSync(d));
  if (!UPLOAD_DIR) return null;

  // 2. storageUrl like '/uploads/pdfs/abc123.pdf'
  if (file.storageUrl) {
    const rel = file.storageUrl.replace(/^\/+/, '').replace(/^uploads\//, '');
    const p = path.join(UPLOAD_DIR, rel);
    if (fs.existsSync(p)) return p;
  }

  // 3. storageKey = just the filename
  if (file.storageKey) {
    for (const sub of ['pdfs', 'images', 'documents', 'dicom']) {
      const p = path.join(UPLOAD_DIR, sub, file.storageKey);
      if (fs.existsSync(p)) return p;
    }
  }

  // 4. fileUrl like '/uploads/pdfs/abc123.pdf'
  if (file.fileUrl) {
    const rel = file.fileUrl.replace(/^\/+/, '').replace(/^uploads\//, '');
    const p = path.join(UPLOAD_DIR, rel);
    if (fs.existsSync(p)) return p;
  }

  return null;
}

// ── POST /api/files/upload ────────────────────────────────────────────────────
router.post('/upload', requireAuth, function (req, res) {
  var multer;
  try { multer = require('multer'); }
  catch { return res.status(500).json({ success: false, message: 'npm install multer' }); }

  const candidates = [
    path.join(__dirname, '..', '..', 'uploads'),
    path.join(__dirname, '..', 'uploads'),
    path.join(process.cwd(), 'uploads'),
  ];
  const UPLOAD_DIR = candidates.find(d => fs.existsSync(d)) || candidates[0];
  ['images', 'pdfs', 'documents', 'dicom'].forEach(sub => {
    const dir = path.join(UPLOAD_DIR, sub);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  });

  const upload = multer({
    storage: multer.diskStorage({
      destination: (req, file, cb) => {
        const cat = getFileCategory(file.mimetype);
        const sub = { IMAGE: 'images', PDF: 'pdfs', DICOM: 'dicom' }[cat] || 'documents';
        cb(null, path.join(UPLOAD_DIR, sub));
      },
      filename: (req, file, cb) => {
        const crypto = require('crypto');
        cb(null, crypto.randomBytes(16).toString('hex') + path.extname(file.originalname));
      },
    }),
    limits: { fileSize: 50 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      const ok = ['image/jpeg','image/png','image/webp','application/pdf',
        'application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'text/plain','application/dicom'].includes(file.mimetype)
        || /\.(dcm|dicom)$/i.test(file.originalname);
      cb(ok ? null : new Error('File type not supported'), ok);
    },
  });

  upload.array('files', 10)(req, res, async (err) => {
    if (err) return res.status(400).json({ success: false, message: err.message });
    if (!req.files?.length) return res.status(400).json({ success: false, message: 'No files uploaded' });

    try {
      const uid = req.user.id || req.user.userId;
      let patient = null;
      if (req.user.role === 'PATIENT') {
        patient = await prisma.patient.findUnique({ where: { userId: uid }, select: { id: true } });
      }

      const results = await Promise.all(req.files.map(async file => {
        const category = getFileCategory(file.mimetype);
        const fileUrl  = getFileUrl(file.filename, category);
        // patientId is required — if doctor uploads, use req.body.patientId
        // if patient uploads, use their own patient record id
        if (!patient?.id && !req.body.patientId) {
          throw new Error('Patient record not found. Ensure you are logged in as a patient.');
        }

        const sub = { IMAGE: 'images', PDF: 'pdfs', DICOM: 'dicom' }[getFileCategory(file.mimetype)] || 'documents';
        const storageUrl = '/uploads/' + sub + '/' + file.filename;

        const medFile  = await prisma.medicalFile.create({
          data: {
            patientId:  patient?.id || req.body.patientId,
            uploadedBy: uid,
            fileName:   file.originalname,
            fileType:   file.mimetype,
            mimeType:   file.mimetype,
            fileSize:   file.size,
            storageKey: file.path,
            storageUrl,
            category:   category || null,
            isProcessed: false,
          },
        });
        setImmediate(async () => {
          try {
            const analysis = await analyzeMedicalFile(file.path, category, file.originalname);
            if (analysis) {
              await prisma.medicalFile.update({
                where: { id: medFile.id },
                data:  { aiAnalysis: analysis, urgencyLevel: analysis.urgencyLevel || 'LOW', isProcessed: true },
              });
            }
          } catch (e) { console.error('AI analysis error:', e.message); }
        });
        return medFile;
      }));

      return res.status(201).json({ success: true, data: results, count: results.length });
    } catch (err) {
      return res.status(500).json({ success: false, message: 'Upload failed', detail: err.message });
    }
  });
});

// ── GET /api/files/:fileId ────────────────────────────────────────────────────
// ── GET /api/files — list all files for the current patient ──────────────────
router.get('/', requireAuth, async (req, res) => {
  try {
    const uid = req.user.id || req.user.userId;

    if (req.user.role === 'PATIENT') {
      const patient = await prisma.patient.findUnique({ where: { userId: uid }, select: { id: true } });
      if (!patient) return res.status(404).json({ success: false, message: 'Patient not found' });

      const files = await prisma.medicalFile.findMany({
        where:   { patientId: patient.id },
        orderBy: { createdAt: 'desc' },
        take:    100,
      });
      return res.json({ success: true, data: files, total: files.length });
    }

    // Doctor: return files for a specific patient
    if (req.user.role === 'DOCTOR' && req.query.patientId) {
      const files = await prisma.medicalFile.findMany({
        where:   { patientId: req.query.patientId },
        orderBy: { createdAt: 'desc' },
        take:    100,
      });
      return res.json({ success: true, data: files, total: files.length });
    }

    return res.status(400).json({ success: false, message: 'Patient role required or patientId query param for doctors' });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to load files', detail: err.message });
  }
});

router.get('/:fileId', requireAuth, async (req, res) => {
  try {
    const file = await prisma.medicalFile.findUnique({ where: { id: req.params.fileId } });
    if (!file) return res.status(404).json({ success: false, message: 'File not found' });
    res.json({ success: true, data: file });
  } catch (e) { res.status(500).json({ success: false, message: 'Failed' }); }
});

// ── GET /api/files/:fileId/download ──────────────────────────────────────────
// FIXED: handles both filePath (files.js uploads) and storageUrl/storageKey (chat.js uploads)
router.get('/:fileId/download', requireAuth, async (req, res) => {
  try {
    const file = await prisma.medicalFile.findUnique({ where: { id: req.params.fileId } });
    if (!file) return res.status(404).json({ success: false, message: 'File not found' });

    // Patient access check
    if (req.user.role === 'PATIENT') {
      const uid = req.user.id || req.user.userId;
      const patient = await prisma.patient.findUnique({ where: { userId: uid }, select: { id: true } });
      if (!patient || file.patientId !== patient.id) {
        // Also allow if patient uploaded via chat (uploadedBy field)
        if (file.uploadedBy !== uid && file.uploadedById !== uid) {
          return res.status(403).json({ success: false, message: 'Access denied' });
        }
      }
    }

    const diskPath = resolveDiskPath(file);

    if (!diskPath) {
      // No file on disk — tell client where to find it via static URL
      const staticUrl = file.storageUrl || file.fileUrl;
      if (staticUrl) {
        // Redirect to static URL (works if Express serves /uploads as static)
        return res.redirect(staticUrl);
      }
      return res.status(404).json({
        success: false,
        message: 'File not found on disk. The uploads folder may be at a different path.',
        hint: `Expected storageUrl: ${file.storageUrl}, filePath: ${file.filePath}`,
      });
    }

    const mime = file.mimeType || file.fileType || 'application/octet-stream';
    const name = file.fileName || path.basename(diskPath);
    res.setHeader('Content-Disposition', `attachment; filename="${name.replace(/"/g, '')}"`);
    res.setHeader('Content-Type', mime);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.sendFile(diskPath, err => {
      if (err && !res.headersSent) {
        res.status(500).json({ success: false, message: 'Download failed' });
      }
    });
  } catch (e) {
    console.error('[GET /files/download]:', e.message);
    res.status(500).json({ success: false, message: 'Download failed' });
  }
});

// ── GET /api/files/:fileId/analysis (DOCTOR ONLY) ────────────────────────────
router.get('/:fileId/analysis', requireAuth, async (req, res) => {
  try {
    if (req.user.role === 'PATIENT')
      return res.status(403).json({ success: false, message: 'AI analysis is for doctors only' });
    const file = await prisma.medicalFile.findUnique({ where: { id: req.params.fileId } });
    if (!file) return res.status(404).json({ success: false, message: 'File not found' });
    if (file.aiAnalysis) {
      let parsed = file.aiAnalysis;
      if (typeof parsed === 'string') { try { parsed = JSON.parse(parsed); } catch {} }
      return res.json({ success: true, data: parsed, cached: true });
    }
    const analysisPath = resolveDiskPath(file) || file.storageKey || null;
    // storageKey is the full disk path, storageUrl is the web path
    if (!analysisPath) return res.status(422).json({ success: false, message: 'No file path for analysis' });
    const analysis = await analyzeMedicalFile(analysisPath, file.category, file.fileName);
    if (analysis) {
      await prisma.medicalFile.update({
        where: { id: file.id },
        data:  {
          aiAnalysis:   typeof analysis === 'string' ? analysis : JSON.stringify(analysis),
          urgencyLevel: analysis.urgencyLevel || 'LOW',
          isProcessed:  true,
        },
      });
    }
    res.json({ success: true, data: analysis, cached: false });
  } catch (e) {
    console.error('Analysis error:', e);
    res.status(500).json({ success: false, message: 'Analysis failed', retryable: true });
  }
});

// ── DELETE /api/files/:fileId ─────────────────────────────────────────────────
router.delete('/:fileId', requireAuth, async (req, res) => {
  try {
    const file = await prisma.medicalFile.findUnique({ where: { id: req.params.fileId } });
    if (!file) return res.status(404).json({ success: false, message: 'File not found' });
    const uid = req.user.id || req.user.userId;
    if (file.uploadedById !== uid && file.uploadedBy !== uid && req.user.role !== 'ADMIN')
      return res.status(403).json({ success: false, message: 'Access denied' });
    const diskPath = resolveDiskPath(file);
    if (diskPath) try { fs.unlinkSync(diskPath); } catch {}
    await prisma.medicalFile.delete({ where: { id: req.params.fileId } });
    res.json({ success: true, message: 'File deleted' });
  } catch (e) { res.status(500).json({ success: false, message: 'Delete failed' }); }
});

module.exports = router;