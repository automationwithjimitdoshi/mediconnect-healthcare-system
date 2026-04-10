'use client';
/**
 * src/app/patient/reports/components/TopDoctorsCard.js
 *
 * Shows top 3 Google-rated doctors for a given specialty near the patient's location.
 * Uses the backend proxy at POST /api/google-places/doctors (keeps API key secret).
 *
 * Usage:
 *   import TopDoctorsCard from './components/TopDoctorsCard';
 *   <TopDoctorsCard
 *     specialty="Nephrologist"
 *     token={getToken('PATIENT')}
 *     onBook={(doc) => router.push(`/patient/appointments/book?doctorId=${doc.id}`)}
 *   />
 */

import { useState, useEffect, useRef } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

const NAVY   = '#0c1a2e';
const BLUE   = '#1565c0';
const BLUE_P = '#e3f0ff';
const GREEN  = '#1b5e20';
const GREEN_P= '#e8f5e9';
const AMBER  = '#b45309';
const RED    = '#c62828';
const TEAL   = '#00796b';
const TEAL_P = '#e0f5f0';
const BORDER = '#e2e8f0';
const SURFACE= '#f7f9fc';
const MUTED  = '#8896a7';
const SEC    = '#4a5568';

// Render filled + half + empty stars from a 0–5 rating
function StarRow({ rating, count }) {
  const full  = Math.floor(rating);
  const half  = rating - full >= 0.5 ? 1 : 0;
  const empty = 5 - full - half;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
      {[...Array(full)].map((_,i)  => <span key={'f'+i} style={{ color: '#f59e0b', fontSize: 13 }}>★</span>)}
      {half === 1 &&                    <span style={{ color: '#f59e0b', fontSize: 13 }}>⯨</span>}
      {[...Array(empty)].map((_,i) => <span key={'e'+i} style={{ color: '#d1d5db', fontSize: 13 }}>★</span>)}
      <span style={{ fontSize: 11.5, color: MUTED, marginLeft: 4 }}>
        {rating.toFixed(1)} <span style={{ color: '#d1d5db' }}>·</span> {count.toLocaleString()} reviews
      </span>
    </div>
  );
}

// Rank medal colours: gold / silver / bronze
const MEDAL_COLOR = ['#f59e0b', '#94a3b8', '#b45309'];
const MEDAL_BG    = ['#fffbeb', '#f8fafc', '#fff7ed'];
const MEDAL_BORDER= ['#fde68a', '#e2e8f0', '#fed7aa'];
const MEDAL_LABEL = ['#1', '#2', '#3'];

export default function TopDoctorsCard({ specialty, token, onBook }) {
  const [doctors,  setDoctors]  = useState([]);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');
  const [location, setLocation] = useState(null); // { lat, lng, city }
  const [city,     setCity]     = useState('');
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (!specialty || fetchedRef.current) return;
    fetchedRef.current = true;
    // Try to get user's geolocation for accurate local results
    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        pos => {
          const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          setLocation(coords);
          reverseGeocode(coords).then(c => { setCity(c); fetchDoctors(specialty, coords, c); });
        },
        () => {
          // Permission denied or unavailable — search without coords
          fetchDoctors(specialty, null, '');
        },
        { timeout: 5000 }
      );
    } else {
      fetchDoctors(specialty, null, '');
    }
  }, [specialty]);

  async function reverseGeocode({ lat, lng }) {
    try {
      const r = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`,
        { headers: { 'Accept-Language': 'en' } }
      );
      if (!r.ok) return '';
      const d = await r.json();
      return d.address?.city || d.address?.town || d.address?.state_district || d.address?.state || '';
    } catch { return ''; }
  }

  async function fetchDoctors(spec, coords, cityName) {
    setLoading(true);
    setError('');
    try {
      const body = {
        specialty: spec,
        location:  cityName || undefined,
        ...(coords ? { lat: coords.lat, lng: coords.lng } : {}),
      };

      const r = await fetch(`${API}/google-places/doctors`, {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
      });

      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();

      if (!d.success || !d.doctors?.length) {
        setError('No Google-rated doctors found nearby. Try booking directly.');
        setDoctors([]);
      } else {
        setDoctors(d.doctors.slice(0, 3));
      }
    } catch (e) {
      setError('Could not load Google ratings right now.');
      setDoctors([]);
    }
    setLoading(false);
  }

  if (!specialty) return null;

  return (
    <div style={{
      marginTop: 14,
      borderRadius: 14,
      overflow: 'hidden',
      border: `1px solid ${TEAL}25`,
      background: 'linear-gradient(160deg, #f0fdf9 0%, #eff6ff 100%)',
    }}>

      {/* Header */}
      <div style={{
        padding: '11px 16px',
        background: `linear-gradient(90deg, ${TEAL} 0%, ${BLUE} 100%)`,
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <div style={{
          width: 32, height: 32, borderRadius: 8, flexShrink: 0,
          background: 'rgba(255,255,255,0.2)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18,
        }}>🏥</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'white' }}>
            Top {specialty}s Near You
          </div>
          <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.7)', display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 12 }}>⭐</span>
            Rated on Google
            {city ? ` · ${city}` : ''}
          </div>
        </div>
        {/* Google logo attribution */}
        <div style={{
          fontSize: 9, background: 'rgba(255,255,255,0.18)',
          color: 'rgba(255,255,255,0.9)', padding: '3px 8px',
          borderRadius: 99, fontWeight: 700, letterSpacing: '0.05em', flexShrink: 0,
        }}>
          via Google
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: '12px 14px' }}>

        {loading && (
          <div style={{ padding: '14px 0', textAlign: 'center' }}>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginBottom: 8 }}>
              {[0, 0.15, 0.3].map((d, i) => (
                <div key={i} style={{
                  width: 8, height: 8, borderRadius: '50%', background: TEAL,
                  animation: `googlePulse 1s infinite ${d}s`,
                }} />
              ))}
            </div>
            <div style={{ fontSize: 12, color: MUTED }}>Searching Google for top-rated {specialty}s…</div>
            <style>{`@keyframes googlePulse{0%,100%{opacity:0.3;transform:scale(0.8)}50%{opacity:1;transform:scale(1.1)}}`}</style>
          </div>
        )}

        {!loading && error && (
          <div style={{ padding: '10px 12px', fontSize: 12.5, color: MUTED, textAlign: 'center', background: 'white', borderRadius: 10, border: `1px solid ${BORDER}` }}>
            ⚠️ {error}
          </div>
        )}

        {!loading && !error && doctors.map((doc, i) => (
          <div key={doc.placeId || i} style={{
            display: 'flex', alignItems: 'flex-start', gap: 12,
            padding: '11px 13px',
            marginBottom: i < doctors.length - 1 ? 8 : 0,
            background: MEDAL_BG[i],
            borderRadius: 12,
            border: `1px solid ${MEDAL_BORDER[i]}`,
            position: 'relative',
          }}>

            {/* Rank medal */}
            <div style={{
              position: 'absolute', top: -7, left: 12,
              width: 20, height: 20, borderRadius: '50%',
              background: MEDAL_COLOR[i],
              color: 'white', fontSize: 10, fontWeight: 800,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 2px 6px rgba(0,0,0,0.18)',
              letterSpacing: '-0.5px',
            }}>
              {MEDAL_LABEL[i]}
            </div>

            {/* Photo or initials */}
            {doc.photoRef ? (
              <img
                src={`${API}/google-places/photo/${doc.photoRef}?w=80`}
                alt={doc.name}
                style={{
                  width: 46, height: 46, borderRadius: 10, objectFit: 'cover',
                  flexShrink: 0, marginTop: 2,
                  border: `1.5px solid ${MEDAL_BORDER[i]}`,
                }}
                onError={e => { e.target.style.display = 'none'; }}
              />
            ) : (
              <div style={{
                width: 46, height: 46, borderRadius: 10, flexShrink: 0, marginTop: 2,
                background: TEAL_P, color: TEAL,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 20, fontWeight: 700,
                border: `1.5px solid ${TEAL}20`,
              }}>
                🩺
              </div>
            )}

            {/* Info */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: NAVY, marginBottom: 2 }}>
                {doc.name}
              </div>

              {/* Stars */}
              {doc.rating > 0 && (
                <div style={{ marginBottom: 4 }}>
                  <StarRow rating={doc.rating} count={doc.reviewCount} />
                </div>
              )}

              {/* Address */}
              {doc.address && (
                <div style={{
                  fontSize: 11, color: MUTED, lineHeight: 1.4,
                  overflow: 'hidden', textOverflow: 'ellipsis',
                  display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                  marginBottom: 4,
                }}>
                  📍 {doc.address}
                </div>
              )}

              {/* Open now badge */}
              {doc.isOpen !== null && (
                <span style={{
                  fontSize: 10, fontWeight: 700,
                  color: doc.isOpen ? GREEN : RED,
                  background: doc.isOpen ? GREEN_P : '#fdecea',
                  padding: '2px 7px', borderRadius: 99,
                  display: 'inline-block',
                }}>
                  {doc.isOpen ? '● Open Now' : '● Closed'}
                </span>
              )}
            </div>

            {/* Action buttons */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
              {/* View on Google Maps */}
              {doc.googleMapsUrl && (
                <a
                  href={doc.googleMapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    padding: '5px 11px', background: 'white',
                    color: BLUE, border: `1px solid ${BLUE}30`,
                    borderRadius: 7, fontSize: 11, fontWeight: 600,
                    textDecoration: 'none', textAlign: 'center',
                    display: 'block',
                  }}
                >
                  📍 Maps
                </a>
              )}
              {/* Book via app */}
              <button
                onClick={() => onBook && onBook(doc)}
                style={{
                  padding: '5px 11px', background: BLUE, color: 'white',
                  border: 'none', borderRadius: 7, fontSize: 11,
                  fontWeight: 700, cursor: 'pointer',
                }}
              >
                Book →
              </button>
            </div>
          </div>
        ))}

        {/* Google attribution (required by Google's ToS) */}
        {!loading && doctors.length > 0 && (
          <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 5 }}>
            <span style={{ fontSize: 10, color: MUTED }}>Ratings from</span>
            <img
              src="https://www.google.com/images/branding/googlelogo/1x/googlelogo_color_74x24dp.png"
              alt="Google"
              style={{ height: 14, opacity: 0.7 }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
