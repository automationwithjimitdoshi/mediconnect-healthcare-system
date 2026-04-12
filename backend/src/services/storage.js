/**
 * backend/src/services/storage.js
 *
 * Supabase Storage — persists files across Railway redeploys.
 * You already have Supabase for your database. This uses the same project.
 *
 * SETUP (2 minutes):
 *  1. Go to supabase.com → your project → Storage → Create bucket
 *     Name: "mediconnect"  |  Public: YES (toggle on)
 *  2. Add ONE variable to Railway:
 *       SUPABASE_URL        = https://xxxx.supabase.co   (already in your project settings)
 *       SUPABASE_SERVICE_KEY = your service_role key     (Settings → API → service_role)
 *
 * Files uploaded here get a permanent public URL that never expires.
 * No redeploy will ever delete them.
 */

'use strict';

const path = require('path');
const fs   = require('fs');
const crypto = require('crypto');

const SUPABASE_URL        = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const BUCKET              = process.env.SUPABASE_BUCKET || 'mediconnect';

// Is Supabase storage configured?
const IS_SUPABASE = !!(SUPABASE_URL && SUPABASE_SERVICE_KEY);

/**
 * uploadFile(buffer, { originalName, mimeType, category })
 * Returns { storageKey, storageUrl }
 * storageUrl is a permanent public URL (Supabase) or local /uploads path (dev)
 */
async function uploadFile(buffer, { originalName, mimeType, category }) {
  const ext      = path.extname(originalName || '').toLowerCase() || '.bin';
  const sub      = category === 'IMAGE' ? 'images' : category === 'PDF' ? 'pdfs' : 'documents';
  const fileName = crypto.randomBytes(16).toString('hex') + ext;
  const fileKey  = `${sub}/${fileName}`;

  if (IS_SUPABASE) {
    // Upload to Supabase Storage via REST API — no SDK needed
    const uploadUrl = `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${fileKey}`;
    const r = await fetch(uploadUrl, {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type':  mimeType || 'application/octet-stream',
        'x-upsert':      'true',
      },
      body: buffer,
    });

    if (!r.ok) {
      const err = await r.text();
      throw new Error(`Supabase upload failed: ${r.status} ${err}`);
    }

    // Public URL — permanent, works forever
    const storageUrl = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${fileKey}`;
    console.log('[storage] Uploaded to Supabase:', storageUrl);
    return { storageKey: fileKey, storageUrl };
  }

  // ── Local dev fallback ────────────────────────────────────────────────────
  const uploadsDir = path.join(__dirname, '..', '..', 'uploads', sub);
  fs.mkdirSync(uploadsDir, { recursive: true });
  const diskPath = path.join(uploadsDir, fileName);
  fs.writeFileSync(diskPath, buffer);
  console.log('[storage] Saved locally:', diskPath);
  return {
    storageKey: diskPath,
    storageUrl: `/uploads/${sub}/${fileName}`,
  };
}

/**
 * getPublicUrl(storageKey)
 * Returns the permanent public URL for a file.
 * storageKey is either a Supabase path (sub/file.pdf) or a local absolute path.
 */
function getPublicUrl(storageKey, storageUrl) {
  // If storageUrl is already a full Supabase URL, return it directly
  if (storageUrl && storageUrl.startsWith('http')) return storageUrl;

  // If Supabase and storageKey looks like a Supabase path (not absolute disk path)
  if (IS_SUPABASE && storageKey && !storageKey.startsWith('/') && !storageKey.match(/^[A-Za-z]:\\/)) {
    return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${storageKey}`;
  }

  // Local: return the relative URL
  return storageUrl || null;
}

/**
 * deleteFile(storageKey)
 */
async function deleteFile(storageKey) {
  if (!storageKey) return;

  if (IS_SUPABASE && !storageKey.startsWith('/') && !storageKey.match(/^[A-Za-z]:\\/)) {
    const url = `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${storageKey}`;
    await fetch(url, {
      method:  'DELETE',
      headers: { 'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}` },
    });
    return;
  }

  // Local
  try { if (fs.existsSync(storageKey)) fs.unlinkSync(storageKey); } catch {}
}

module.exports = { uploadFile, getPublicUrl, deleteFile, IS_SUPABASE };
