'use client';
/**
 * src/app/patient/reports/components/TopDoctorsCard.js
 *
 * FIXES in this version:
 *  - Does NOT require geolocation — works with location OFF on laptop
 *  - Sends "Mumbai" as default city (change DEFAULT_CITY to your city)
 *  - Shows exact error from server instead of generic "Could not load"
 *  - Has a "Retry" button
 *  - Shows /api/google-places/test link when API key issue detected
 */

import { useState, useEffect } from 'react';

const API          = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';
const DEFAULT_CITY = 'Mumbai'; // Change to your city — used when location is off

const NAVY    = '#0c1a2e';
const BLUE    = '#1565c0';
const BLUE_P  = '#e3f0ff';
const GREEN   = '#1b5e20';
const GREEN_P = '#e8f5e9';
const AMBER   = '#b45309';
const MUTED   = '#8896a7';
const BORDER  = '#e2e8f0';
const SEC     = '#4a5568';

export default function TopDoctorsCard({ specialty, token, onBook }) {
  const [doctors,  setDoctors]  = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState('');
  const [city,     setCity]     = useState(DEFAULT_CITY);

  useEffect(() => {
    if (specialty) fetchDoctors(specialty);
  }, [specialty]);

  async function fetchDoctors(spec, overrideCity) {
    setLoading(true);
    setError('');
    setDoctors([]);

    const locationToUse = overrideCity || city || DEFAULT_CITY;

    // Try to get coordinates for better results — but DON'T block if unavailable
    let lat, lng;
    try {
      const pos = await Promise.race([
        new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej)),
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 3000)),
      ]);
      lat = pos.coords.latitude;
      lng = pos.coords.longitude;
    } catch {
      // Location unavailable or denied — proceed without coords, use city name
    }

    try {
      const r = await fetch(`${API}/google-places/doctors`, {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          specialty: spec,
          location:  locationToUse,
          ...(lat && lng ? { lat, lng } : {}),
        }),
      });

      const d = await r.json();

      if (!r.ok || !d.success) {
        setError(d.message || `Server error ${r.status}`);
        return;
      }

      setDoctors(d.doctors || []);
      if ((d.doctors || []).length === 0) {
        setError(`No rated doctors found for "${spec}" in ${locationToUse}.`);
      }
    } catch (err) {
      setError('Network error — could not reach the server.');
    } finally {
      setLoading(false);
    }
  }

  // ── Loading ──
  if (loading) return (
    <div style={{ background: 'linear-gradient(135deg, #1565c0 0%, #00796b 100%)', borderRadius: 14, padding: '14px 18px', marginTop: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>🏥</div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'white' }}>Top {specialty}s Near You</div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)', marginTop: 1 }}>⭐ Rated on Google</div>
        </div>
        <div style={{ marginLeft: 'auto', fontSize: 11, background: 'rgba(255,255,255,0.15)', color: 'white', padding: '3px 10px', borderRadius: 99 }}>via Google</div>
      </div>
      <div style={{ marginTop: 12, background: 'rgba(255,255,255,0.95)', borderRadius: 10, padding: '20px', textAlign: 'center', color: MUTED, fontSize: 13 }}>
        <div style={{ animation: 'spin 1s linear infinite', display: 'inline-block', fontSize: 20, marginBottom: 6 }}>⏳</div>
        <div>Finding top-rated doctors…</div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); }}`}</style>
      </div>
    </div>
  );

  // ── Error ──
  if (error) return (
    <div style={{ background: 'linear-gradient(135deg, #1565c0 0%, #00796b 100%)', borderRadius: 14, padding: '14px 18px', marginTop: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>🏥</div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'white' }}>Top {specialty}s Near You</div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)', marginTop: 1 }}>⭐ Rated on Google</div>
        </div>
        <div style={{ marginLeft: 'auto', fontSize: 11, background: 'rgba(255,255,255,0.15)', color: 'white', padding: '3px 10px', borderRadius: 99 }}>via Google</div>
      </div>
      <div style={{ marginTop: 12, background: 'rgba(255,255,255,0.95)', borderRadius: 10, padding: '14px 16px' }}>
        <div style={{ fontSize: 12.5, color: AMBER, marginBottom: 10 }}>⚠️ {error}</div>

        {/* City override input */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <input
            value={city}
            onChange={e => setCity(e.target.value)}
            placeholder="Enter city (e.g. Mumbai)"
            style={{ flex: 1, padding: '7px 10px', border: `1.5px solid ${BORDER}`, borderRadius: 8, fontSize: 13, outline: 'none', fontFamily: 'DM Sans, sans-serif' }}
          />
          <button
            onClick={() => fetchDoctors(specialty, city)}
            style={{ padding: '7px 14px', background: BLUE, color: 'white', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
            Retry
          </button>
        </div>

        {/* Show test link if it looks like an API key / config issue */}
        {(error.includes('not enabled') || error.includes('key') || error.includes('configured') || error.includes('503') || error.includes('502')) && (
          <div style={{ fontSize: 11.5, color: MUTED, marginTop: 4 }}>
            🔧 Admin: visit{' '}
            <a
              href={`${API.replace('/api', '')}/api/google-places/test`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: BLUE }}>
              /api/google-places/test
            </a>
            {' '}for diagnosis steps.
          </div>
        )}
      </div>
    </div>
  );

  // ── No results ──
  if (doctors.length === 0) return null;

  // ── Results ──
  return (
    <div style={{ background: 'linear-gradient(135deg, #1565c0 0%, #00796b 100%)', borderRadius: 14, padding: '14px 18px', marginTop: 12 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>🏥</div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'white' }}>Top {specialty}s Near You</div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)', marginTop: 1 }}>⭐ Rated on Google</div>
        </div>
        <div style={{ marginLeft: 'auto', fontSize: 11, background: 'rgba(255,255,255,0.15)', color: 'white', padding: '3px 10px', borderRadius: 99 }}>via Google</div>
      </div>

      {/* Doctor cards */}
      <div style={{ background: 'rgba(255,255,255,0.95)', borderRadius: 10, overflow: 'hidden' }}>
        {doctors.map((doc, i) => (
          <div key={doc.placeId || i} style={{
            padding: '12px 14px',
            borderBottom: i < doctors.length - 1 ? `1px solid ${BORDER}` : 'none',
            display: 'flex', gap: 12, alignItems: 'flex-start',
          }}>
            {/* Avatar */}
            <div style={{ width: 42, height: 42, borderRadius: 10, background: BLUE_P, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>
              👨‍⚕️
            </div>

            {/* Info */}
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
                {/* Rating */}
                {doc.rating > 0 && (
                  <span style={{ fontSize: 12, fontWeight: 700, color: AMBER }}>
                    ⭐ {doc.rating.toFixed(1)}
                    <span style={{ fontSize: 11, fontWeight: 400, color: MUTED }}> ({doc.reviewCount?.toLocaleString()})</span>
                  </span>
                )}
                {/* Open now badge */}
                {doc.isOpen === true  && <span style={{ fontSize: 10, fontWeight: 700, background: GREEN_P, color: GREEN, padding: '2px 7px', borderRadius: 99 }}>Open now</span>}
                {doc.isOpen === false && <span style={{ fontSize: 10, fontWeight: 700, background: '#fdecea', color: '#c62828', padding: '2px 7px', borderRadius: 99 }}>Closed</span>}
              </div>
              {doc.phone && (
                <div style={{ fontSize: 11.5, color: MUTED, marginTop: 3 }}>📞 {doc.phone}</div>
              )}
            </div>

            {/* Actions */}
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
    </div>
  );
}