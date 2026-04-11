/**
 * backend/routes/googlePlaces.js
 *
 * SIMPLIFIED & RELIABLE:
 * Always uses city name in the text query — "Nephrologist in Pune".
 * This is what Google Places text search is designed for and gives
 * accurate city-specific results every time.
 * lat/lng are accepted but only used as a secondary locationBias hint.
 */

'use strict';

const express = require('express');
const https   = require('https');
const router  = express.Router();

const PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY;

function httpsPost(hostname, path, headers, body) {
  return new Promise((resolve, reject) => {
    const bodyStr = JSON.stringify(body);
    const req = https.request(
      {
        hostname, path, method: 'POST', timeout: 20000,
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(bodyStr), ...headers },
      },
      res => {
        let raw = '';
        res.on('data', c => { raw += c; });
        res.on('end', () => {
          try { resolve({ status: res.statusCode, data: JSON.parse(raw), raw }); }
          catch { resolve({ status: res.statusCode, data: null, raw }); }
        });
      }
    );
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Google Places timed out')); });
    req.write(bodyStr);
    req.end();
  });
}

function httpsGet(urlStr) {
  return new Promise((resolve, reject) => {
    const req = https.get(urlStr, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Photo timed out')); });
    req.setTimeout(10000);
  });
}

// ── GET /api/google-places/test ───────────────────────────────────────────────
router.get('/test', async (req, res) => {
  if (!PLACES_API_KEY) {
    return res.json({ ok: false, problem: 'GOOGLE_PLACES_API_KEY not set in Railway variables' });
  }
  try {
    const result = await httpsPost(
      'places.googleapis.com', '/v1/places:searchText',
      { 'X-Goog-Api-Key': PLACES_API_KEY, 'X-Goog-FieldMask': 'places.id,places.displayName' },
      { textQuery: 'Cardiologist in Mumbai', maxResultCount: 1 },
    );
    if (result.status === 200) {
      return res.json({ ok: true, message: 'API working!', sample: result.data?.places?.[0]?.displayName?.text || 'no results' });
    }
    let fix = 'See detail.';
    if (result.status === 403) fix = 'Enable "Places API (New)" in Google Cloud Console → APIs & Services → Library.';
    if (result.status === 401) fix = 'API key invalid. Re-copy from Google Cloud Console → Credentials.';
    if (result.status === 429) fix = 'Quota exceeded. Check Google Cloud billing.';
    return res.json({ ok: false, status: result.status, detail: result.raw, fix });
  } catch (err) {
    return res.json({ ok: false, problem: 'Network error', detail: err.message });
  }
});

// ── POST /api/google-places/doctors ──────────────────────────────────────────
router.post('/doctors', async (req, res) => {
  const { specialty, location } = req.body;

  if (!specialty) {
    return res.status(400).json({ success: false, message: 'specialty is required' });
  }
  if (!location) {
    return res.status(400).json({ success: false, message: 'location (city name) is required' });
  }
  if (!PLACES_API_KEY) {
    console.error('[GooglePlaces] GOOGLE_PLACES_API_KEY not set');
    return res.status(503).json({ success: false, message: 'Google Places API key not configured on server' });
  }

  // Always use city name in the text query — this is the most reliable approach.
  // "Nephrologist in Pune" returns Pune results every single time.
  const textQuery = `${specialty} in ${location}`;

  const requestBody = {
    textQuery,
    maxResultCount: 10,
    languageCode:   'en',
  };

  const fieldMask = [
    'places.id', 'places.displayName', 'places.formattedAddress',
    'places.rating', 'places.userRatingCount', 'places.googleMapsUri',
    'places.regularOpeningHours', 'places.internationalPhoneNumber', 'places.photos',
  ].join(',');

  try {
    console.log(`[GooglePlaces] query="${textQuery}"`);

    const result = await httpsPost(
      'places.googleapis.com', '/v1/places:searchText',
      { 'X-Goog-Api-Key': PLACES_API_KEY, 'X-Goog-FieldMask': fieldMask },
      requestBody,
    );

    if (result.status !== 200) {
      console.error(`[GooglePlaces] Google API ${result.status}:`, result.raw);
      let msg = 'Google Places API error';
      if (result.status === 403) msg = 'Places API (New) not enabled. Visit /api/google-places/test for steps.';
      if (result.status === 401) msg = 'Invalid Google API key.';
      if (result.status === 429) msg = 'Google API quota exceeded.';
      return res.status(502).json({ success: false, message: msg, googleStatus: result.status });
    }

    const places = result.data?.places || [];
    console.log(`[GooglePlaces] ${places.length} results for "${textQuery}"`);

    const sorted = places
      .filter(p => p.rating)
      .sort((a, b) => {
        const sa = (a.rating || 0) * Math.log10(Math.max(a.userRatingCount || 1, 10));
        const sb = (b.rating || 0) * Math.log10(Math.max(b.userRatingCount || 1, 10));
        return sb - sa;
      })
      .slice(0, 3);

    const doctors = sorted.map(p => ({
      placeId:       p.id,
      name:          p.displayName?.text             || 'Doctor',
      address:       p.formattedAddress              || '',
      rating:        p.rating                        || 0,
      reviewCount:   p.userRatingCount               || 0,
      googleMapsUrl: p.googleMapsUri                 || '',
      phone:         p.internationalPhoneNumber       || '',
      isOpen:        p.regularOpeningHours?.openNow  ?? null,
      photoRef:      p.photos?.[0]?.name             || null,
      specialty,
    }));

    return res.json({ success: true, doctors, query: textQuery });

  } catch (err) {
    console.error('[GooglePlaces] https error:', err.message);
    return res.status(500).json({ success: false, message: 'Network error contacting Google', detail: err.message });
  }
});

// ── GET /api/google-places/photo/:photoName ───────────────────────────────────
router.get('/photo/:photoName(*)', async (req, res) => {
  if (!PLACES_API_KEY) return res.status(503).send('Not configured');
  const maxWidth = parseInt(req.query.w) || 120;
  const url = `https://places.googleapis.com/v1/${req.params.photoName}/media?maxWidthPx=${maxWidth}&key=${PLACES_API_KEY}`;
  try {
    const r = await httpsGet(url);
    if (r.status < 200 || r.status >= 300) return res.status(r.status).send('Photo fetch failed');
    res.setHeader('Content-Type',  r.headers['content-type'] || 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(r.body);
  } catch (err) {
    res.status(500).send('Error: ' + err.message);
  }
});

module.exports = router;