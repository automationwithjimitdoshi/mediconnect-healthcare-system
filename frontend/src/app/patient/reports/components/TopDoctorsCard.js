'use client';
/**
 * src/app/patient/reports/components/TopDoctorsCard.js
 *
 * APPROACH: Ask user to confirm/type their city. No GPS dependency.
 * GPS on laptops returns IP-based location (often wrong city).
 * City-name search in Google Places text query is the most reliable method.
 *
 * Flow:
 *  1. Show city input pre-filled with reverse-geocoded city (best guess)
 *  2. User confirms or types their actual city → click Search
 *  3. Backend searches "Nephrologist in Pune" → accurate results
 */

import { useState, useEffect, useRef } from 'react';

const API  = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

const NAVY  = '#0c1a2e', BLUE = '#1565c0', BLUE_P = '#e3f0ff',
      GREEN = '#1b5e20', GREEN_P = '#e8f5e9', AMBER = '#b45309',
      MUTED = '#8896a7', BORDER = '#e2e8f0', SEC = '#4a5568';

// Reverse-geocode via free Nominatim — best-effort, used only to pre-fill input
async function detectCity() {
  try {
    const pos = await Promise.race([
      new Promise((res, rej) =>
        navigator.geolocation.getCurrentPosition(res, rej, {
          timeout: 8000,
          maximumAge: 0,          // always fresh — never use cached position
          enableHighAccuracy: false,
        })
      ),
      new Promise((_, rej) => setTimeout(() => rej(), 8000)),
    ]);
    const { latitude: lat, longitude: lng } = pos.coords;
    const r = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=10`,
      { headers: { 'Accept-Language': 'en' } }
    );
    const d = await r.json();
    return (
      d.address?.city            ||
      d.address?.town            ||
      d.address?.district        ||
      d.address?.state_district  ||
      d.address?.state           ||
      ''
    );
  } catch {
    return '';
  }
}

export default function TopDoctorsCard({ specialty, token, onBook }) {
  const [phase,    setPhase]    = useState('input');   // 'input' | 'loading' | 'results' | 'error'
  const [city,     setCity]     = useState('');
  const [doctors,  setDoctors]  = useState([]);
  const [errMsg,   setErrMsg]   = useState('');
  const [detecting,setDetecting]= useState(true);      // true while auto-detecting city
  const inputRef = useRef(null);

  // On mount: try to detect city and pre-fill input
  useEffect(() => {
    if (!specialty) return;
    setDetecting(true);
    detectCity().then(detected => {
      if (detected) setCity(detected);
      setDetecting(false);
      // Auto-search only if city was detected confidently
      if (detected) search(detected);
    });
  }, [specialty]);

  async function search(cityOverride) {
    const cityToSearch = (cityOverride ?? city).trim();
    if (!cityToSearch) {
      inputRef.current?.focus();
      return;
    }

    setPhase('loading');
    setDoctors([]);
    setErrMsg('');

    try {
      const r = await fetch(`${API}/google-places/doctors`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ specialty, location: cityToSearch }),
      });

      const d = await r.json();

      if (!r.ok || !d.success) {
        setErrMsg(d.message || `Error ${r.status}`);
        setPhase('error');
        return;
      }

      if (!d.doctors?.length) {
        setErrMsg(`No doctors found for "${specialty}" in ${cityToSearch}. Try a nearby city.`);
        setPhase('error');
        return;
      }

      setDoctors(d.doctors);
      setPhase('results');

    } catch {
      setErrMsg('Could not reach the server. Check your connection.');
      setPhase('error');
    }
  }

  // ── Shared card wrapper ────────────────────────────────────────────────────
  const Wrap = ({ children }) => (
    <div style={{ background: 'linear-gradient(135deg, #1565c0 0%, #00796b 100%)', borderRadius: 14, padding: '14px 18px', marginTop: 12 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>🏥</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'white' }}>
            Top {specialty}s Near You
          </div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)', marginTop: 1 }}>⭐ Rated on Google</div>
        </div>
        <div style={{ fontSize: 11, background: 'rgba(255,255,255,0.15)', color: 'white', padding: '3px 10px', borderRadius: 99 }}>via Google</div>
      </div>
      <div style={{ background: 'rgba(255,255,255,0.97)', borderRadius: 10 }}>
        {children}
      </div>
    </div>
  );

  // ── City input (initial + after results for changing city) ─────────────────
  const CityInput = ({ compact }) => (
    <div style={{ padding: compact ? '10px 14px' : '16px 14px', borderTop: compact ? `1px solid ${BORDER}` : 'none' }}>
      {!compact && (
        <div style={{ fontSize: 12.5, color: SEC, marginBottom: 8, fontWeight: 600 }}>
          {detecting ? '📍 Detecting your city…' : '📍 Enter your city to find nearby specialists'}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          ref={inputRef}
          value={city}
          onChange={e => setCity(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && search()}
          placeholder={detecting ? 'Detecting…' : 'e.g. Pune, Delhi, Surat'}
          disabled={detecting}
          style={{ flex: 1, padding: '8px 11px', border: `1.5px solid ${BORDER}`, borderRadius: 8, fontSize: 13, outline: 'none', fontFamily: 'DM Sans, sans-serif', color: NAVY, background: detecting ? '#f8fafc' : 'white' }}
        />
        <button
          onClick={() => search()}
          disabled={detecting || !city.trim()}
          style={{ padding: '8px 16px', background: (!city.trim() || detecting) ? '#93c5fd' : BLUE, color: 'white', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: (!city.trim() || detecting) ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap' }}>
          {detecting ? '…' : '🔍 Search'}
        </button>
      </div>
      {!compact && !detecting && (
        <div style={{ fontSize: 11, color: MUTED, marginTop: 6 }}>
          💡 Type your actual city for accurate results — GPS on laptops may show wrong location
        </div>
      )}
    </div>
  );

  // ── Phase: input (before first search) ────────────────────────────────────
  if (phase === 'input') return (
    <Wrap>
      <CityInput compact={false} />
    </Wrap>
  );

  // ── Phase: loading ─────────────────────────────────────────────────────────
  if (phase === 'loading') return (
    <Wrap>
      <div style={{ padding: '20px', textAlign: 'center', color: MUTED, fontSize: 13 }}>
        <div style={{ fontSize: 20, marginBottom: 8 }}>⏳</div>
        <div>Searching for top {specialty}s in <strong>{city}</strong>…</div>
      </div>
    </Wrap>
  );

  // ── Phase: error ───────────────────────────────────────────────────────────
  if (phase === 'error') return (
    <Wrap>
      <div style={{ padding: '14px', borderBottom: `1px solid ${BORDER}` }}>
        <div style={{ fontSize: 12.5, color: AMBER, fontWeight: 600 }}>⚠️ {errMsg}</div>
      </div>
      <CityInput compact={true} />
    </Wrap>
  );

  // ── Phase: results ─────────────────────────────────────────────────────────
  if (phase === 'results') return (
    <Wrap>
      <div>
        {doctors.map((doc, i) => (
          <div key={doc.placeId || i} style={{ padding: '12px 14px', borderBottom: i < doctors.length - 1 ? `1px solid ${BORDER}` : 'none', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
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
        {/* Change city */}
        <CityInput compact={true} />
      </div>
    </Wrap>
  );

  return null;
}