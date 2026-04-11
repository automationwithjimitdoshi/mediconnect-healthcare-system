/**
 * backend/routes/googlePlaces.js
 * ================================
 * Proxy endpoint for Google Places API (New) — Text Search.
 * Keeps your GOOGLE_PLACES_API_KEY secret on the backend.
 *
 * SETUP:
 *   1. Add GOOGLE_PLACES_API_KEY=your_key to your backend .env
 *   2. Enable "Places API (New)" in Google Cloud Console
 *   3. Register this route in your main server.js / app.js:
 *        const googlePlacesRoute = require('./routes/googlePlaces');
 *        app.use('/api/google-places', googlePlacesRoute);
 *
 * ENDPOINT:
 *   POST /api/google-places/doctors
 *   Body: { specialty: "Nephrologist", location: "Mumbai" }
 *   Returns: { success: true, doctors: [...] }
 */

const express = require('express');
const router  = express.Router();
const fetch   = (...args) => import('node-fetch').then(({ default: f }) => f(...args));

const PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY;

// Allowed frontend origins
const ALLOWED_ORIGINS = [
  'https://mediconnect-healthcare-system.vercel.app',
  'http://localhost:3000',
  'http://localhost:3001',
];

// ── CORS middleware — applies to every route in this router ──────────────────
router.use((req, res, next) => {
  const origin = req.headers.origin;
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    // Allow all origins in development or if no origin header (server-to-server)
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400'); // cache preflight 24h

  // Handle OPTIONS preflight immediately — do NOT pass to route handler
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  next();
});

/**
 * POST /api/google-places/doctors
 * Searches Google Places for top-rated doctors by specialty near a location.
 */
router.post('/doctors', async (req, res) => {
  const { specialty, location } = req.body;

  if (!specialty) {
    return res.status(400).json({ success: false, message: 'specialty is required' });
  }
  if (!PLACES_API_KEY) {
    return res.status(503).json({ success: false, message: 'Google Places API key not configured' });
  }

  // Build search query — "Nephrologist in Mumbai" or "Nephrologist doctor"
  const locationPart = location ? ` in ${location}` : ' doctor';
  const textQuery    = `${specialty}${locationPart}`;

  try {
    const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type':       'application/json',
        'X-Goog-Api-Key':     PLACES_API_KEY,
        // Request only the fields we need — avoids unnecessary billing
        'X-Goog-FieldMask':   [
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
        ].join(','),
      },
      body: JSON.stringify({
        textQuery,
        maxResultCount:   10,
        languageCode:     'en',
        minRating:        3.5,      // Only show 3.5★ and above
        // Bias toward India by default; pass locationBias from frontend for precision
        ...(req.body.lat && req.body.lng ? {
          locationBias: {
            circle: {
              center:    { latitude: req.body.lat, longitude: req.body.lng },
              radius:    10000, // 10km radius
            },
          },
        } : {}),
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('[Google Places] API error:', response.status, errText);
      return res.status(502).json({ success: false, message: 'Google Places API error', detail: errText });
    }

    const data   = await response.json();
    const places = data.places || [];

    // Sort by rating descending, then by review count (more reviews = more reliable)
    const sorted = places
      .filter(p => p.rating && p.userRatingCount > 0)
      .sort((a, b) => {
        // Weighted score: rating * log(reviewCount) — balances quality vs. quantity
        const scoreA = (a.rating || 0) * Math.log10(Math.max(a.userRatingCount || 1, 10));
        const scoreB = (b.rating || 0) * Math.log10(Math.max(b.userRatingCount || 1, 10));
        return scoreB - scoreA;
      })
      .slice(0, 3); // Top 3 only

    // Normalise response shape for the frontend
    const doctors = sorted.map(p => ({
      placeId:       p.id,
      name:          p.displayName?.text || 'Doctor',
      address:       p.formattedAddress || '',
      rating:        p.rating || 0,
      reviewCount:   p.userRatingCount || 0,
      googleMapsUrl: p.googleMapsUri || '',
      phone:         p.internationalPhoneNumber || '',
      isOpen:        p.regularOpeningHours?.openNow ?? null,
      photoRef:      p.photos?.[0]?.name || null,
      specialty,
    }));

    return res.json({ success: true, doctors, query: textQuery });

  } catch (err) {
    console.error('[Google Places] fetch error:', err.message);
    return res.status(500).json({ success: false, message: 'Internal error', detail: err.message });
  }
});

/**
 * GET /api/google-places/photo/:photoName
 * Proxies a Google Places photo so the API key stays hidden.
 * photoName looks like: "places/ChIJ.../photos/AXCi2Q..."
 */
router.get('/photo/:photoName(*)', async (req, res) => {
  if (!PLACES_API_KEY) return res.status(503).send('Not configured');

  const photoName = req.params.photoName;
  const maxWidth  = req.query.w || 120;

  try {
    const url = `https://places.googleapis.com/v1/${photoName}/media?maxWidthPx=${maxWidth}&key=${PLACES_API_KEY}`;
    const r   = await fetch(url);
    if (!r.ok) return res.status(r.status).send('Photo fetch failed');

    res.setHeader('Content-Type', r.headers.get('content-type') || 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400'); // cache 1 day
    r.body.pipe(res);
  } catch (err) {
    res.status(500).send('Error');
  }
});

module.exports = router;