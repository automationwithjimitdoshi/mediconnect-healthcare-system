/**
 * backend/routes/googlePlaces.js
 * ================================
 * Proxy endpoint for Google Places API (New) — Text Search.
 * Keeps your GOOGLE_PLACES_API_KEY secret on the backend.
 *
 * FIX: Replaced node-fetch (ESM-only, breaks on Railway) with Node's
 * built-in https module — zero extra dependencies, always works.
 *
 * SETUP:
 *   1. Add GOOGLE_PLACES_API_KEY=your_key to Railway environment variables
 *   2. Enable "Places API (New)" in Google Cloud Console
 *   3. Route is registered in server.js: app.use('/api/google-places', ...)
 *
 * ENDPOINTS:
 *   POST /api/google-places/doctors
 *   Body: { specialty: "Nephrologist", location: "Mumbai", lat?, lng? }
 *   Returns: { success: true, doctors: [...] }
 *
 *   GET /api/google-places/photo/:photoName
 *   Proxies Google Places photo (keeps API key hidden from browser)
 */

'use strict';

const express = require('express');
const https   = require('https'); // ✅ built-in — no npm install needed
const router  = express.Router();

const PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY;

// ── Helper: HTTPS POST using Node built-in ────────────────────────────────────
// Replaces node-fetch. Returns { ok, status, data } where data is parsed JSON.
function httpsPost(hostname, path, headers, body) {
  return new Promise((resolve, reject) => {
    const bodyStr = JSON.stringify(body);
    const options = {
      hostname,
      path,
      method:  'POST',
      headers: {
        'Content-Type':   'application/json',
        'Content-Length': Buffer.byteLength(bodyStr),
        ...headers,
      },
      timeout: 15000,
    };

    const req = https.request(options, res => {
      let raw = '';
      res.on('data', chunk => { raw += chunk; });
      res.on('end', () => {
        try {
          resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, data: JSON.parse(raw), raw });
        } catch {
          resolve({ ok: false, status: res.statusCode, data: null, raw });
        }
      });
    });

    req.on('error',   err => reject(err));
    req.on('timeout', ()  => { req.destroy(); reject(new Error('Google Places request timed out')); });
    req.write(bodyStr);
    req.end();
  });
}

// ── Helper: HTTPS GET using Node built-in (for photo proxy) ──────────────────
function httpsGet(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({
        ok:          res.statusCode >= 200 && res.statusCode < 300,
        status:      res.statusCode,
        headers:     res.headers,
        body:        Buffer.concat(chunks),
      }));
    });
    req.on('error',   err => reject(err));
    req.on('timeout', ()  => { req.destroy(); reject(new Error('Photo fetch timed out')); });
    req.setTimeout(10000);
  });
}

// ── POST /api/google-places/doctors ──────────────────────────────────────────
router.post('/doctors', async (req, res) => {
  const { specialty, location, lat, lng } = req.body;

  if (!specialty) {
    return res.status(400).json({ success: false, message: 'specialty is required' });
  }
  if (!PLACES_API_KEY) {
    console.error('[Google Places] GOOGLE_PLACES_API_KEY is not set in Railway variables');
    return res.status(503).json({ success: false, message: 'Google Places API key not configured on server' });
  }

  const locationPart = location ? ` in ${location}` : ' doctor';
  const textQuery    = `${specialty}${locationPart}`;

  const requestBody = {
    textQuery,
    maxResultCount: 10,
    languageCode:   'en',
    minRating:      3.5,
    ...(lat && lng ? {
      locationBias: {
        circle: {
          center: { latitude: parseFloat(lat), longitude: parseFloat(lng) },
          radius: 10000, // 10 km
        },
      },
    } : {}),
  };

  const fieldMask = [
    'places.id',
    'places.displayName',
    'places.formattedAddress',
    'places.rating',
    'places.userRatingCount',
    'places.googleMapsUri',
    'places.regularOpeningHours',
    'places.internationalPhoneNumber',
    'places.photos',
    'places.types',
  ].join(',');

  try {
    console.log(`[Google Places] Searching: "${textQuery}"`);

    const result = await httpsPost(
      'places.googleapis.com',
      '/v1/places:searchText',
      {
        'X-Goog-Api-Key':   PLACES_API_KEY,
        'X-Goog-FieldMask': fieldMask,
      },
      requestBody,
    );

    if (!result.ok) {
      console.error('[Google Places] API error:', result.status, result.raw);
      return res.status(502).json({
        success: false,
        message: 'Google Places API error',
        status:  result.status,
        detail:  result.raw,
      });
    }

    const places = result.data?.places || [];
    console.log(`[Google Places] Got ${places.length} results for "${textQuery}"`);

    // Weighted sort: rating × log10(reviewCount) — balances quality vs quantity
    const sorted = places
      .filter(p => p.rating && p.userRatingCount > 0)
      .sort((a, b) => {
        const scoreA = (a.rating || 0) * Math.log10(Math.max(a.userRatingCount || 1, 10));
        const scoreB = (b.rating || 0) * Math.log10(Math.max(b.userRatingCount || 1, 10));
        return scoreB - scoreA;
      })
      .slice(0, 3);

    const doctors = sorted.map(p => ({
      placeId:       p.id,
      name:          p.displayName?.text || 'Doctor',
      address:       p.formattedAddress  || '',
      rating:        p.rating            || 0,
      reviewCount:   p.userRatingCount   || 0,
      googleMapsUrl: p.googleMapsUri     || '',
      phone:         p.internationalPhoneNumber          || '',
      isOpen:        p.regularOpeningHours?.openNow      ?? null,
      photoRef:      p.photos?.[0]?.name                 || null,
      specialty,
    }));

    return res.json({ success: true, doctors, query: textQuery });

  } catch (err) {
    console.error('[Google Places] https error:', err.message);
    return res.status(500).json({ success: false, message: 'Internal error contacting Google Places', detail: err.message });
  }
});

// ── GET /api/google-places/photo/:photoName ───────────────────────────────────
// Proxies Google Places photos so the API key is never exposed to the browser.
// photoName format: "places/ChIJ.../photos/AXCi2Q..."
router.get('/photo/:photoName(*)', async (req, res) => {
  if (!PLACES_API_KEY) return res.status(503).send('Not configured');

  const photoName = req.params.photoName;
  const maxWidth  = parseInt(req.query.w) || 120;
  const url = `https://places.googleapis.com/v1/${photoName}/media?maxWidthPx=${maxWidth}&key=${PLACES_API_KEY}`;

  try {
    const r = await httpsGet(url);
    if (!r.ok) return res.status(r.status).send('Photo fetch failed');

    res.setHeader('Content-Type',  r.headers['content-type'] || 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(r.body);
  } catch (err) {
    console.error('[Google Places] photo error:', err.message);
    res.status(500).send('Error fetching photo');
  }
});

module.exports = router;