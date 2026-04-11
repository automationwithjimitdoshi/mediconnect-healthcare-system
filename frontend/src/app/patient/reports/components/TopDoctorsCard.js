'use client';
/**
 * src/app/patient/reports/components/TopDoctorsCard.js
 *
 * FIX: When GPS coords are available, do NOT send city name in the query.
 *      Previously "location: Mumbai" was always sent, making Google search
 *      "Nephrologist in Mumbai" even when the user was in Delhi/Pune/etc.
 *      Now: coords available → send only lat/lng, omit location string.
 *           coords unavailable → send city name as fallback.
 */

import { useState, useEffect } from 'react';

const API          = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';
const DEFAULT_CITY = 'India'; // Generic fallback — only used when both GPS and city are unavailable

const NAVY   = '#0c1a2e', BLUE = '#1565c0', BLUE_P = '#e3f0ff',
      GREEN  = '#1b5e20', GREEN_P = '#e8f5e9', AMBER = '#b45309',
      MUTED  = '#8896a7', BORDER = '#e2e8f0', SEC = '#4a5568';

// Reverse-geocode coords → city name using free Nominatim (no key needed)
async function getCityFromCoords(lat, lng) {
  try {
    const r = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=10`,
      { headers: { 'Accept-Language': 'en' } }
    );
    const d = await r.json();
    return (
      d.address?.city       ||
      d.address?.town       ||
      d.address?.district   ||
      d.address?.state_district ||
      d.address?.state      ||
      null
    );
  } catch {
    return null;
  }
}

export default function TopDoctorsCard({ specialty, token, onBook }) {
  const [doctors,       setDoctors]      = useState([]);
  const [loading,       setLoading]      = useState(true);
  const [error,         setError]        = useState('');
  const [city,          setCity]         = useState('');
  const [detectedCity,  setDetectedCity] = useState(''); // shown in header

  useEffect(() => {
    if (specialty) fetchDoctors(specialty);
  }, [specialty]);

  async function fetchDoctors(spec, manualCity) {
    setLoading(true);
    setError('');
    setDoctors([]);

    // ── Step 1: Try GPS ────────────────────────────────────────────────────
    let lat, lng, resolvedCity;

    try {
      const pos = await Promise.race([
        new Promise((res, rej) =>
          navigator.geolocation.getCurrentPosition(res, rej, { timeout: 6000, maximumAge: 60000 })
        ),
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 7000)),
      ]);
      lat = pos.coords.latitude;
      lng = pos.coords.longitude;

      // Reverse-geocode to get a human-readable city for the UI header
      resolvedCity = await getCityFromCoords(lat, lng);
      if (resolvedCity) setDetectedCity(resolvedCity);

    } catch {
      // GPS unavailable — fall through to city-name search
    }

    // ── Step 2: Build request body ─────────────────────────────────────────
    // KEY FIX: if GPS succeeded, send ONLY coords — no "location" string.
    //          The backend will build "Nephrologist doctor" (no city) so the
    //          locationBias circle drives results, not a hardcoded city name.
    // If GPS failed, send city name so Google knows where to search.
    const cityToUse = manualCity || city || DEFAULT_CITY;

    const body = { specialty: spec };

    if (lat && lng) {
      // GPS available — coords do the location work
      body.lat = lat;
      body.lng = lng;
      // No "location" field → backend query becomes "Nephrologist doctor" biased to coords
    } else {
      // GPS unavailable — use city name
      body.location = cityToUse;
      setDetectedCity(cityToUse);
    }

    // ── Step 3: Call backend ───────────────────────────────────────────────
    try {
      const r = await fetch(`${API}/google-places/doctors`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify(body),
      });

      const d = await r.json();

      if (!r.ok || !d.success) {
        setError(d.message || `Server error ${r.status}`);
        return;
      }

      setDoctors(d.doctors || []);
      if ((d.doctors || []).length === 0) {
        setError(`No doctors found for "${spec}" near your location.`);
      }
    } catch {
      setError('Network error — could not reach the server.');
    } finally {
      setLoading(false);
    }
  }

  // ── Shared header ──────────────────────────────────────────────────────────
  const Header = () => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>🏥</div>
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'white' }}>
          Top {specialty}s {detectedCity ? `near ${detectedCity}` : 'Near You'}
        </div>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)', marginTop: 1 }}>⭐ Rated on Google</div>
      </div>
      <div style={{ marginLeft: 'auto', fontSize: 11, background: 'rgba(255,255,255,0.15)', color: 'white', padding: '3px 10px', borderRadius: 99 }}>via Google</div>
    </div>
  );

  const cardWrap = (children) => (
    <div style={{ background: 'linear-gradient(135deg, #1565c0 0%, #00796b 100%)', borderRadius: 14, padding: '14px 18px', marginTop: 12 }}>
      <Header />
      <div style={{ marginTop: 12 }}>{children}</div>
    </div>
  );

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) return cardWrap(
    <div style={{ background: 'rgba(255,255,255,0.95)', borderRadius: 10, padding: '20px', textAlign: 'center', color: MUTED, fontSize: 13 }}>
      <div style={{ fontSize: 20, marginBottom: 6 }}>⏳</div>
      <div>Finding top-rated doctors near you…</div>
      <div style={{ fontSize: 11, marginTop: 4 }}>Getting your location…</div>
    </div>
  );

  // ── Error ──────────────────────────────────────────────────────────────────
  if (error) return cardWrap(
    <div style={{ background: 'rgba(255,255,255,0.95)', borderRadius: 10, padding: '14px 16px' }}>
      <div style={{ fontSize: 12.5, color: AMBER, marginBottom: 10 }}>⚠️ {error}</div>
      <div style={{ fontSize: 12, color: MUTED, marginBottom: 10 }}>
        Enter your city to search manually:
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          value={city}
          onChange={e => setCity(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && fetchDoctors(specialty, city)}
          placeholder="e.g. Pune, Delhi, Ahmedabad"
          style={{ flex: 1, padding: '7px 10px', border: `1.5px solid ${BORDER}`, borderRadius: 8, fontSize: 13, outline: 'none', fontFamily: 'DM Sans, sans-serif' }}
        />
        <button
          onClick={() => fetchDoctors(specialty, city)}
          style={{ padding: '7px 14px', background: BLUE, color: 'white', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
          Search
        </button>
      </div>
    </div>
  );

  // ── No results ─────────────────────────────────────────────────────────────
  if (doctors.length === 0) return null;

  // ── Results ────────────────────────────────────────────────────────────────
  return cardWrap(
    <div style={{ background: 'rgba(255,255,255,0.95)', borderRadius: 10, overflow: 'hidden' }}>
      {doctors.map((doc, i) => (
        <div key={doc.placeId || i} style={{
          padding: '12px 14px',
          borderBottom: i < doctors.length - 1 ? `1px solid ${BORDER}` : 'none',
          display: 'flex', gap: 12, alignItems: 'flex-start',
        }}>
          <div style={{ width: 42, height: 42, borderRadius: 10, background: BLUE_P, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>
            👨‍⚕️
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: NAVY, marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {doc.name}
            </div>
            {doc.address && (
              <div style={{ fontSize: 11.5, color: SEC, marginBottom: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                📍 {doc.address}
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              {doc.rating > 0 && (
                <span style={{ fontSize: 12, fontWeight: 700, color: AMBER }}>
                  ⭐ {doc.rating.toFixed(1)}
                  <span style={{ fontSize: 11, fontWeight: 400, color: MUTED }}> ({doc.reviewCount?.toLocaleString()})</span>
                </span>
              )}
              {doc.isOpen === true  && <span style={{ fontSize: 10, fontWeight: 700, background: GREEN_P, color: GREEN, padding: '2px 7px', borderRadius: 99 }}>Open now</span>}
              {doc.isOpen === false && <span style={{ fontSize: 10, fontWeight: 700, background: '#fdecea', color: '#c62828', padding: '2px 7px', borderRadius: 99 }}>Closed</span>}
            </div>
            {doc.phone && <div style={{ fontSize: 11.5, color: MUTED, marginTop: 3 }}>📞 {doc.phone}</div>}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
            {doc.googleMapsUrl && (
              <a href={doc.googleMapsUrl} target="_blank" rel="noopener noreferrer"
                style={{ fontSize: 11, color: BLUE, fontWeight: 600, background: BLUE_P, padding: '4px 10px', borderRadius: 6, textDecoration: 'none', textAlign: 'center' }}>
                📍 Maps
              </a>
            )}
            {onBook && (
              <button onClick={() => onBook(doc)}
                style={{ fontSize: 11, color: 'white', fontWeight: 600, background: BLUE, padding: '4px 10px', borderRadius: 6, border: 'none', cursor: 'pointer' }}>
                📅 Book
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}