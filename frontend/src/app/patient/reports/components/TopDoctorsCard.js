'use client';

import { useState, useEffect, useRef } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

const NAVY  = '#0c1a2e', BLUE = '#1565c0', BLUE_P = '#e3f0ff',
      GREEN = '#1b5e20', GREEN_P = '#e8f5e9', AMBER = '#b45309',
      MUTED = '#8896a7', BORDER = '#e2e8f0', SEC = '#4a5568',
      RED_P = '#fdecea', RED = '#c62828';

const CITY_KEY = 'mc_last_city';
function savedCity() { try { return localStorage.getItem(CITY_KEY) || ''; } catch { return ''; } }
function saveCity(c) { try { localStorage.setItem(CITY_KEY, c); } catch {} }

// ── Defined OUTSIDE the component so React never remounts them on re-render ──
function Wrap({ specialty, children }) {
  return (
    <div style={{ background: 'linear-gradient(135deg,#1565c0 0%,#00796b 100%)', borderRadius: 14, padding: '14px 18px', marginTop: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>🏥</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'white' }}>Top {specialty}s Near You</div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)' }}>⭐ Rated on Google</div>
        </div>
        <span style={{ fontSize: 11, background: 'rgba(255,255,255,0.15)', color: 'white', padding: '3px 10px', borderRadius: 99 }}>via Google</span>
      </div>
      <div style={{ background: 'rgba(255,255,255,0.97)', borderRadius: 10 }}>{children}</div>
    </div>
  );
}

function SearchBar({ city, setCity, onSearch, loading, borderTop, inputRef }) {
  return (
    <div style={{ padding: '12px 14px', borderTop: borderTop ? `1px solid ${BORDER}` : 'none' }}>
      {!borderTop && (
        <div style={{ fontSize: 12.5, color: SEC, marginBottom: 8, fontWeight: 600 }}>
          📍 Enter your city to find nearby specialists
        </div>
      )}
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          ref={inputRef}
          value={city}
          onChange={e => setCity(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && onSearch()}
          placeholder="City name — e.g. Pune, Surat, Delhi"
          style={{ flex: 1, padding: '8px 11px', border: `1.5px solid ${BORDER}`, borderRadius: 8, fontSize: 13, outline: 'none', fontFamily: 'DM Sans, sans-serif', color: NAVY }}
        />
        <button
          onClick={onSearch}
          disabled={loading || !city.trim()}
          style={{ padding: '8px 16px', background: (loading || !city.trim()) ? '#93c5fd' : BLUE, color: 'white', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: (loading || !city.trim()) ? 'not-allowed' : 'pointer' }}>
          {loading ? '…' : '🔍 Search'}
        </button>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function TopDoctorsCard({ specialty, token, onBook }) {
  const [city,     setCity]     = useState('');
  const [doctors,  setDoctors]  = useState([]);
  const [loading,  setLoading]  = useState(false);
  const [searched, setSearched] = useState(false);
  const [error,    setError]    = useState('');
  const inputRef  = useRef(null);
  const didInit   = useRef(false);

  useEffect(() => {
    if (didInit.current || !specialty) return;
    didInit.current = true;
    const last = savedCity();
    if (last) {
      setCity(last);
      setTimeout(() => doSearch(last), 50);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function doSearch(cityOverride) {
    const c = (typeof cityOverride === 'string' ? cityOverride : city).trim();
    if (!c) { inputRef.current?.focus(); return; }
    setLoading(true);
    setError('');
    setDoctors([]);
    setSearched(true);
    saveCity(c);
    try {
      const r = await fetch(`${API}/google-places/doctors`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ specialty, location: c }),
      });
      const d = await r.json();
      if (!r.ok || !d.success) {
        setError(d.message || `Server error ${r.status}`);
      } else if (!d.doctors?.length) {
        setError(`No doctors found for "${specialty}" in ${c}. Try a nearby city.`);
      } else {
        setDoctors(d.doctors);
      }
    } catch {
      setError('Could not reach the server.');
    } finally {
      setLoading(false);
    }
  }

  const searchBarProps = { city, setCity, onSearch: doSearch, loading, inputRef };

  if (!searched && !loading) return (
    <Wrap specialty={specialty}>
      <SearchBar {...searchBarProps} borderTop={false} />
    </Wrap>
  );

  if (loading) return (
    <Wrap specialty={specialty}>
      <div style={{ padding: '20px', textAlign: 'center', color: MUTED, fontSize: 13 }}>
        <div style={{ fontSize: 20, marginBottom: 8 }}>⏳</div>
        Searching for top {specialty}s in <strong>{city}</strong>…
      </div>
    </Wrap>
  );

  if (error) return (
    <Wrap specialty={specialty}>
      <div style={{ padding: '14px', fontSize: 12.5, color: AMBER }}>⚠️ {error}</div>
      <SearchBar {...searchBarProps} borderTop={true} />
    </Wrap>
  );

  return (
    <Wrap specialty={specialty}>
      <div>
        {doctors.map((doc, i) => (
          <div key={doc.placeId || i} style={{ padding: '12px 14px', borderBottom: i < doctors.length - 1 ? `1px solid ${BORDER}` : 'none', display: 'flex', gap: 12 }}>
            <div style={{ width: 42, height: 42, borderRadius: 10, background: BLUE_P, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>
              👨‍⚕️
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: NAVY, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {doc.name}
              </div>
              {doc.address && (
                <div style={{ fontSize: 11.5, color: SEC, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 3 }}>
                  📍 {doc.address}
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                {doc.rating > 0 && (
                  <span style={{ fontSize: 12, fontWeight: 700, color: AMBER }}>
                    ⭐ {doc.rating.toFixed(1)}
                    <span style={{ fontSize: 11, fontWeight: 400, color: MUTED }}> ({doc.reviewCount?.toLocaleString()})</span>
                  </span>
                )}
                {doc.isOpen === true  && <span style={{ fontSize: 10, fontWeight: 700, background: GREEN_P, color: GREEN, padding: '2px 7px', borderRadius: 99 }}>Open now</span>}
                {doc.isOpen === false && <span style={{ fontSize: 10, fontWeight: 700, background: RED_P,   color: RED,   padding: '2px 7px', borderRadius: 99 }}>Closed</span>}
              </div>
              {doc.phone && <div style={{ fontSize: 11.5, color: MUTED, marginTop: 2 }}>📞 {doc.phone}</div>}
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
        <SearchBar {...searchBarProps} borderTop={true} />
      </div>
    </Wrap>
  );
}