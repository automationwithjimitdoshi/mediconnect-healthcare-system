'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';

const NAVY = '#0c1a2e', BLUE = '#1565c0', BLUE_P = '#e3f0ff', RED = '#c62828', RED_P = '#fdecea',
  AMBER = '#b45309', AMBER_P = '#fff3e0', GREEN = '#1b5e20', GREEN_P = '#e8f5e9',
  TEAL = '#00796b', TEAL_P = '#e0f5f0', BORDER = '#e2e8f0', SURFACE = '#f7f9fc', MUTED = '#8896a7';
const SEC = '#4a5568';
const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

const NAV = [
  { id: 'patientDashboard', label: 'Dashboard', icon: '⊞', href: '/patient' },
  { id: 'patientAppts', label: 'My Appointments', icon: '📅', href: '/patient/appointments' },
  { id: 'patientBook', label: 'Book Appointment', icon: '➕', href: '/patient/appointments/book' },
  { id: 'patientChat', label: 'Chat with Doctor', icon: '💬', href: '/patient/chat', badge: '_chat' },
  { id: 'patientFiles', label: 'My Files', icon: '📁', href: '/patient/files' },
  { id: 'patientReports', label: 'Report Analyzer', icon: '🔬', href: '/patient/reports', badge: 'FREE' },
];

function sTag(status) {
  const m = {
    CONFIRMED: { bg: GREEN_P, color: GREEN },
    SCHEDULED: { bg: BLUE_P, color: BLUE },
    RESCHEDULED: { bg: '#ede9fe', color: '#7c3aed' },
    CANCELLED: { bg: RED_P, color: RED },
    COMPLETED: { bg: GREEN_P, color: GREEN },
    NO_SHOW: { bg: AMBER_P, color: AMBER },
  };
  const s = m[status] || { bg: SURFACE, color: MUTED };
  return { display: 'inline-block', background: s.bg, color: s.color, fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20 };
}

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}
function fmtTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
}
function docInitials(doc) {
  if (!doc) return 'DR';
  return `${doc.firstName?.[0] || ''}${doc.lastName?.[0] || ''}`.toUpperCase() || 'DR';
}

// ── Bottom nav items (mobile) — subset of NAV for thumb reach ────────────────
const BOTTOM_NAV = [
  { id: 'patientDashboard', label: 'Home',      icon: '⊞', href: '/patient' },
  { id: 'patientAppts',     label: 'Appts',     icon: '📅', href: '/patient/appointments' },
  { id: 'patientChat',      label: 'Chat',      icon: '💬', href: '/patient/chat' },
  { id: 'patientReports',   label: 'Reports',   icon: '🔬', href: '/patient/reports' },
  { id: 'patientMore',      label: 'More',      icon: '☰',  href: null },  // opens menu
];

// ── Sidebar ───────────────────────────────────────────────────────────────────
function Sidebar({ active }) {
  const router = useRouter();
  const [chatBadge, setChatBadge] = useState(0);
  const [name, setName] = useState('Patient');
  const [inits, setInits] = useState('P');
  const [moreOpen, setMoreOpen] = useState(false); // mobile "More" drawer

  useEffect(() => {
    const tok = localStorage.getItem('mc_token') || '';
    if (!tok) return;
    fetch(`${API}/chat/rooms?limit=100`, { headers: { Authorization: `Bearer ${tok}` } })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        const total = (d?.data || []).reduce((sum, r) => sum + (r.unreadCount || 0), 0);
        setChatBadge(total);
      }).catch(() => {});
  }, []);

  useEffect(() => {
    try {
      const u = JSON.parse(localStorage.getItem('mc_user') || '{}');
      const n = u?.patient
        ? `${u.patient.firstName || ''} ${u.patient.lastName || ''}`.trim()
        : (u?.email || 'Patient');
      setName(n);
      setInits(n.split(' ').filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase() || 'P');
    } catch {}
  }, []);

  function signOut() {
    localStorage.removeItem('mc_token');
    localStorage.removeItem('mc_user');
    window.location.href = '/login';
  }

  return (
    <>
      {/* ── Desktop / Tablet Sidebar ── */}
      <div className="mc-sidebar">

        {/* Logo */}
        <div style={{ padding: '16px 0 12px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
          <div style={{ width: 32, height: 32, background: 'linear-gradient(135deg,#00796b,#1565c0)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="18" height="18" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="16" y="4" width="8" height="32" rx="3" fill="white" fillOpacity="0.95"/>
              <rect x="4" y="16" width="32" height="8" rx="3" fill="white" fillOpacity="0.95"/>
            </svg>
          </div>
          <div style={{ minWidth: 0 }}>
            <div className="mc-logo-text" style={{ fontSize: 13, fontWeight: 700, color: 'white' }}>NexMedicon AI</div>
            <div className="mc-logo-text" style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', fontFamily: 'monospace', letterSpacing: '0.1em' }}>PATIENT PORTAL</div>
          </div>
        </div>

        {/* Avatar */}
        <div style={{ margin: '10px 6px 6px', background: 'rgba(255,255,255,0.06)', borderRadius: 9, padding: '8px 6px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <div style={{ width: 30, height: 30, borderRadius: '50%', background: BLUE_P, color: BLUE, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{inits}</div>
          <div className="mc-user-info" style={{ flex: 1, minWidth: 0 }}>
            <div suppressHydrationWarning style={{ fontSize: 12, fontWeight: 500, color: 'white', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>Patient</div>
          </div>
        </div>

        {/* Section divider — always visible, no hide class */}
        <div style={{ padding: '10px 0 4px', fontSize: 9, color: 'rgba(255,255,255,0.25)', fontFamily: 'monospace', letterSpacing: '0.12em', textAlign: 'center', flexShrink: 0 }}>· · ·</div>

        {/* Nav items */}
        <div style={{ padding: '0 6px', flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
          {NAV.map(item => {
            const isA = active === item.id;
            return (
              <button
                className="mc-nav-btn"
                key={item.id}
                onClick={() => router.push(item.href)}
                style={{
                  margin: '2px 0', borderRadius: 8,
                  background: isA ? BLUE : 'transparent',
                  color: isA ? 'white' : 'rgba(255,255,255,0.6)',
                  fontSize: 13, fontFamily: 'DM Sans, sans-serif',
                  fontWeight: isA ? 600 : 400,
                }}
              >
                <span className="mc-nav-icon">{item.icon}</span>
                <span className="mc-nav-label" style={{ flex: 1, textAlign: 'left' }}>{item.label}</span>
                {item.badge != null && (item.badge === '_chat' ? chatBadge > 0 : item.badge !== 0) && (
                  <span className="mc-nav-label" style={{
                    background: item.badge === 'FREE' ? '#0e7490' : '#ef4444',
                    color: 'white', fontSize: item.badge === 'FREE' ? 9 : 10,
                    fontWeight: 700, padding: '2px 6px', borderRadius: 99, flexShrink: 0,
                  }}>
                    {item.badge === '_chat' ? chatBadge : item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Sign out — always visible at bottom */}
        <div style={{ padding: '10px 6px', borderTop: '1px solid rgba(255,255,255,0.08)', flexShrink: 0 }}>
          <button
            className="mc-nav-btn"
            onClick={signOut}
            style={{
              borderRadius: 8, background: 'rgba(255,255,255,0.04)',
              color: 'rgba(255,255,255,0.45)', fontSize: 12,
              fontFamily: 'DM Sans, sans-serif',
            }}
          >
            <span className="mc-nav-icon">🚪</span>
            <span className="mc-signout-text">Sign out</span>
          </button>
        </div>

      </div>

      {/* ── Mobile Bottom Navigation ── */}
      <nav className="mc-bottom-nav">
        {BOTTOM_NAV.map(item => {
          if (item.href === null) {
            // "More" button — opens drawer
            return (
              <button key={item.id} className="mc-bottom-nav-btn" onClick={() => setMoreOpen(true)}>
                <span>{item.icon}</span>
                <span>{item.label}</span>
              </button>
            );
          }
          const isA = active === item.id;
          return (
            <button
              key={item.id}
              className={`mc-bottom-nav-btn${isA ? ' active' : ''}`}
              onClick={() => router.push(item.href)}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
              {item.id === 'patientChat' && chatBadge > 0 && (
                <span style={{ position: 'absolute', top: 6, right: 'calc(50% - 18px)', background: '#ef4444', color: 'white', fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 99 }}>
                  {chatBadge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* ── Mobile "More" Drawer ── */}
      {moreOpen && (
        <div
          onClick={() => setMoreOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(12,26,46,0.6)', zIndex: 200, display: 'flex', alignItems: 'flex-end' }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ width: '100%', background: NAVY, borderRadius: '16px 16px 0 0', padding: '16px 0 32px', fontFamily: 'DM Sans, sans-serif' }}
          >
            <div style={{ width: 36, height: 4, background: 'rgba(255,255,255,0.2)', borderRadius: 99, margin: '0 auto 16px' }} />
            {/* All nav items */}
            {NAV.map(item => {
              const isA = active === item.id;
              return (
                <button key={item.id} onClick={() => { router.push(item.href); setMoreOpen(false); }}
                  style={{ display: 'flex', alignItems: 'center', gap: 14, width: '100%', padding: '13px 24px', background: 'none', border: 'none', color: isA ? 'white' : 'rgba(255,255,255,0.7)', fontSize: 15, fontWeight: isA ? 600 : 400, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>
                  <span style={{ fontSize: 20, width: 24, textAlign: 'center' }}>{item.icon}</span>
                  {item.label}
                </button>
              );
            })}
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', margin: '8px 0 0' }} />
            <button onClick={signOut}
              style={{ display: 'flex', alignItems: 'center', gap: 14, width: '100%', padding: '13px 24px', background: 'none', border: 'none', color: 'rgba(255,255,255,0.45)', fontSize: 15, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>
              <span style={{ fontSize: 20, width: 24, textAlign: 'center' }}>🚪</span>
              Sign out
            </button>
          </div>
        </div>
      )}
    </>
  );
}

// ── Appointment Card ──────────────────────────────────────────────────────────
function ApptCard({ appt, onBookAgain }) {
  const d = new Date(appt.scheduledAt);
  const docName = appt.doctor ? `Dr. ${appt.doctor.firstName} ${appt.doctor.lastName}` : 'Doctor';
  const isCancel = appt.status === 'CANCELLED' || appt.status === 'NO_SHOW';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 0', borderBottom: `1px solid ${BORDER}` }}>
      <div style={{ width: 48, textAlign: 'center', background: BLUE_P, borderRadius: 10, padding: '6px 4px', flexShrink: 0 }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: BLUE, lineHeight: 1 }}>{d.getDate()}</div>
        <div style={{ fontSize: 9, fontFamily: 'monospace', color: BLUE }}>{d.toLocaleString('default', { month: 'short' }).toUpperCase()}</div>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: NAVY, marginBottom: 2 }}>{docName}</div>
        <div style={{ fontSize: 11, color: MUTED }}>
          {appt.doctor?.specialty && `${appt.doctor.specialty} · `}{fmtTime(appt.scheduledAt)}
          {appt.type && ` · ${appt.type.replace('_', ' ')}`}
        </div>
        {appt.reason && <div style={{ fontSize: 11, color: MUTED, marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{appt.reason}</div>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <span style={sTag(appt.status)}>{appt.status}</span>
        {isCancel && onBookAgain && (
          <button onClick={() => onBookAgain(appt)} style={{ padding: '5px 10px', background: BLUE, color: 'white', border: 'none', borderRadius: 7, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
            Rebook
          </button>
        )}
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────


// ─────────────────────────────────────────────────────────────────────────────
// CARDIAC AI DIAGNOSTICS — ECG + ECHO
// Routes through backend proxy at /api/ai/cardiac-analyze to avoid CORS.
// Accepts: JPG, PNG, WebP, PDF (both ECG and Echo)
// ─────────────────────────────────────────────────────────────────────────────

const ECG_DIAGNOSES = [
  'Atrial Fibrillation',
  'Sinus Tachycardia',
  'Sinus Bradycardia',
  'Left Bundle Branch Block',
  'Right Bundle Branch Block',
  'First-Degree Atrioventricular Block',
];

const ECHO_TASKS = [
  'Left ventricular ejection fraction (LVEF)',
  'LV end-diastolic volume', 'LV end-systolic volume',
  'LV wall motion abnormality', 'LV hypertrophy',
  'Right ventricular function', 'RV enlargement',
  'Mitral valve regurgitation', 'Mitral valve stenosis',
  'Aortic valve regurgitation', 'Aortic valve stenosis',
  'Tricuspid valve regurgitation', 'Pericardial effusion',
  'Diastolic dysfunction grade', 'Left atrial enlargement',
  'Segmental wall motion abnormality',
];

// Sends file to backend proxy — backend calls Anthropic/OpenAI (avoids CORS)
async function runCardiacAnalysis(imageBase64, mimeType, mode) {
  const tok = localStorage.getItem('mc_token') || '';
  let r;
  try {
    r = await fetch(`${API}/ai/cardiac-analyze`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tok}`,
      },
      body: JSON.stringify({ imageBase64, mimeType, mode }),
    });
  } catch (networkErr) {
    // fetch() itself threw — backend not reachable or CORS
    throw new Error(
      'Cannot reach the NexMedicon backend. ' +
      'Make sure the backend server is running on port 5000 and ' +
      'ANTHROPIC_API_KEY is set in backend/.env'
    );
  }
  if (r.status === 401) throw new Error('Session expired — please sign in again.');
  if (r.status === 503) throw new Error('AI key not configured — add ANTHROPIC_API_KEY to backend/.env');
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    throw new Error(body.message || `Server error ${r.status}`);
  }
  const data = await r.json();
  if (!data.success) throw new Error(data.message || 'Analysis failed');
  return data.result;
}

// Normalise MIME type — browsers sometimes give 'image/jpg' instead of 'image/jpeg'
function normaliseMime(type) {
  if (!type) return 'image/jpeg';
  if (type === 'image/jpg') return 'image/jpeg';
  return type;
}

function ECGEchoTools({ isDoctor = false }) {
  const [mode, setMode] = React.useState('ecg');
  const [file, setFile] = React.useState(null);
  const [preview, setPreview] = React.useState(null);
  const [isPdf, setIsPdf] = React.useState(false);
  const [analyzing, setAnalyzing] = React.useState(false);
  const [result, setResult] = React.useState(null);
  const [error, setError] = React.useState('');
  const [dragOver, setDragOver] = React.useState(false);
  const fileRef = React.useRef(null);

  const C = {
    NAVY: '#0c1a2e', BLUE: '#1565c0', BLUE_P: '#e3f0ff',
    RED: '#c62828', RED_P: '#fdecea',
    AMBER: '#b45309', AMBER_P: '#fff3e0',
    GREEN: '#1b5e20', GREEN_P: '#e8f5e9',
    TEAL: '#00796b',
    BORDER: '#e2e8f0', SURF: '#f7f9fc', MUTED: '#8896a7', SEC: '#4a5568',
  };

  const modeConfig = {
    ecg: { icon: '🫀', label: '12-Lead ECG', color: C.RED, bg: C.RED_P, desc: 'Detects: AF, Sinus Tachycardia/Bradycardia, LBBB, RBBB, 1° AV Block' },
    echo: { icon: '🔊', label: 'Echocardiogram', color: C.TEAL, bg: '#e0f5f0', desc: 'PanEcho: 39 tasks — LVEF, valve disease, wall motion, diastolic function' },
  };
  const cfg = modeConfig[mode];

  // Accepted MIME types for both tools
  const ACCEPTED_TYPES = [
    'image/jpeg', 'image/jpg', 'image/png', 'image/webp',
    'application/pdf',
  ];
  const ACCEPTED_EXTS = '.jpg,.jpeg,.png,.webp,.pdf';

  function handleFile(f) {
    if (!f) return;
    const mime = normaliseMime(f.type);
    if (!ACCEPTED_TYPES.includes(mime)) {
      setError('Unsupported format. Please upload JPG, PNG, WebP, or PDF.');
      return;
    }
    if (f.size > 25 * 1024 * 1024) {
      setError('File too large — maximum 25 MB.');
      return;
    }
    setFile(f); setResult(null); setError('');
    const pdf = mime === 'application/pdf';
    setIsPdf(pdf);
    if (!pdf) {
      const reader = new FileReader();
      reader.onload = e => setPreview(e.target.result);
      reader.readAsDataURL(f);
    } else {
      setPreview(null); // PDF — show icon instead
    }
  }

  async function analyze() {
    if (!file || analyzing) return;
    setAnalyzing(true); setError(''); setResult(null);
    try {
      const base64 = await new Promise((res, rej) => {
        const reader = new FileReader();
        reader.onload = e => res(e.target.result.split(',')[1]);
        reader.onerror = () => rej(new Error('Could not read file'));
        reader.readAsDataURL(file);
      });
      const mime = normaliseMime(file.type);
      const res = await runCardiacAnalysis(base64, mime, mode);
      setResult(res);
    } catch (e) {
      setError(e.message || 'Analysis failed. Please try again.');
    }
    setAnalyzing(false);
  }

  function reset() {
    setFile(null); setPreview(null); setResult(null);
    setError(''); setIsPdf(false);
  }

  return (
    <div style={{ background: 'white', borderRadius: 14, border: `1px solid ${C.BORDER}`, overflow: 'hidden', marginBottom: 20 }}>

      {/* ── Header ── */}
      <div style={{ background: `linear-gradient(135deg,${C.NAVY} 0%,#1a2e4a 100%)`, padding: '16px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <span style={{ fontSize: 24 }}>🧠</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'white' }}>Cardiac AI Diagnostics</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>Powered by Claude AI · For clinical reference only</div>
          </div>
          <div style={{ background: 'rgba(255,255,255,0.12)', borderRadius: 8, padding: '3px 10px', fontSize: 10, color: 'rgba(255,255,255,0.7)', fontWeight: 700 }}>BETA</div>
        </div>
        {/* Mode tabs */}
        <div style={{ display: 'flex', gap: 8 }}>
          {[
            { id: 'ecg', label: '🫀 ECG Analysis', sub: '12-lead · 6 diagnoses' },
            { id: 'echo', label: '🔊 Echo Interpretation', sub: 'PanEcho · 39 tasks' },
          ].map(t => (
            <button key={t.id} onClick={() => { setMode(t.id); reset(); }}
              style={{
                flex: 1, padding: '9px 12px', borderRadius: 9, cursor: 'pointer', textAlign: 'left',
                border: `1.5px solid ${mode === t.id ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.15)'}`,
                background: mode === t.id ? 'rgba(255,255,255,0.15)' : 'transparent', color: 'white'
              }}>
              <div style={{ fontSize: 12.5, fontWeight: 700 }}>{t.label}</div>
              <div style={{ fontSize: 10, opacity: 0.55, marginTop: 1 }}>{t.sub}</div>
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding: 20 }}>

        {/* Instructions */}
        <div style={{ background: C.SURF, borderRadius: 10, padding: '10px 14px', marginBottom: 16, fontSize: 12.5, color: C.SEC, lineHeight: 1.7 }}>
          {mode === 'ecg' ? (
            <><strong>ECG Tool:</strong> Upload a scanned <strong>12-lead ECG</strong> as <strong>JPG, PNG or PDF</strong>. Detects:
              <strong style={{ color: C.RED }}> Atrial Fibrillation, Sinus Tachycardia, Sinus Bradycardia, Left Bundle Branch Block, Right Bundle Branch Block, First-Degree AV Block</strong>.
              Reports <em>"None of the model diagnoses"</em> if none found. Note: only for 12-lead ECGs.</>
          ) : (
            <><strong>PanEcho:</strong> Upload an <strong>echocardiogram image or PDF report</strong>. View-agnostic multi-task model performing <strong>39 reporting tasks</strong>: LVEF, wall motion, valve disease, diastolic function, RV function, pericardial assessment and more.</>
          )}
        </div>

        {!result ? (
          <>
            {/* Upload zone */}
            <div
              onClick={() => fileRef.current?.click()}
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={e => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]); }}
              style={{
                border: `2px dashed ${dragOver || file ? cfg.color : C.BORDER}`,
                borderRadius: 12, padding: file ? 16 : '28px 20px',
                textAlign: file ? 'left' : 'center', cursor: 'pointer',
                background: dragOver || file ? cfg.bg : C.SURF, transition: 'all 0.2s',
                marginBottom: 14
              }}>
              <input ref={fileRef} type="file" accept={ACCEPTED_EXTS} style={{ display: 'none' }}
                onChange={e => handleFile(e.target.files?.[0])} />
              {file ? (
                <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                  {/* Preview or PDF icon */}
                  {preview ? (
                    <img src={preview} alt="preview"
                      style={{
                        width: 80, height: 60, objectFit: 'cover', borderRadius: 8,
                        border: `1px solid ${C.BORDER}`, flexShrink: 0
                      }} />
                  ) : (
                    <div style={{
                      width: 80, height: 60, background: '#fff0f0', borderRadius: 8,
                      border: `1px solid ${C.BORDER}`, display: 'flex', flexDirection: 'column',
                      alignItems: 'center', justifyContent: 'center', flexShrink: 0
                    }}>
                      <span style={{ fontSize: 26 }}>📄</span>
                      <span style={{ fontSize: 9, color: C.RED, fontWeight: 700 }}>PDF</span>
                    </div>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 13.5, fontWeight: 600, color: C.NAVY,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                    }}>
                      {file.name}
                    </div>
                    <div style={{ fontSize: 11.5, color: C.MUTED, marginTop: 3 }}>
                      {(file.size / 1024 / 1024).toFixed(2)} MB · {isPdf ? 'PDF document' : 'Image file'}
                    </div>
                    <button onClick={e => { e.stopPropagation(); reset(); }}
                      style={{
                        fontSize: 11, color: C.RED, background: 'none', border: 'none',
                        cursor: 'pointer', padding: 0, marginTop: 4, fontFamily: 'DM Sans, sans-serif'
                      }}>
                      × Remove
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div style={{ fontSize: 36, marginBottom: 10 }}>{cfg.icon}</div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: C.NAVY, marginBottom: 4 }}>
                    {dragOver ? 'Drop file here' : `Upload ${cfg.label}`}
                  </div>
                  <div style={{ fontSize: 12, color: C.MUTED, marginBottom: 6 }}>
                    JPG · PNG · WebP · PDF &nbsp;·&nbsp; Max 25 MB
                  </div>
                  <div style={{ fontSize: 11, color: C.MUTED }}>Click to browse or drag &amp; drop</div>
                </>
              )}
            </div>

            {/* Error */}
            {error && (
              <div style={{
                background: C.RED_P, border: '1px solid #f5c6cb', borderRadius: 9,
                padding: '10px 14px', fontSize: 13, color: C.RED, marginBottom: 14, lineHeight: 1.6
              }}>
                <strong>⚠️ Error:</strong> {error}
              </div>
            )}

            {/* Analyze button */}
            <button onClick={analyze} disabled={!file || analyzing}
              style={{
                width: '100%', padding: 12, fontSize: 14, fontWeight: 700, border: 'none',
                borderRadius: 10, cursor: !file || analyzing ? 'not-allowed' : 'pointer',
                background: !file ? '#94a3b8' : analyzing ? '#64748b' : cfg.color,
                color: 'white', transition: 'background 0.2s'
              }}>
              {analyzing
                ? `⏳ Analysing ${cfg.label}… (10–30 seconds)`
                : file ? `🔍 Analyse ${cfg.label}` : `Upload a file to analyse`}
            </button>

            {analyzing && (
              <div style={{ textAlign: 'center', padding: '16px 0 4px', color: C.MUTED, fontSize: 12.5 }}>
                Claude AI is reading your {isPdf ? 'PDF' : 'image'} — please wait…
              </div>
            )}
          </>
        ) : (
          /* ── Results ── */
          <>
            {mode === 'ecg'
              ? <ECGResults result={result} C={C} />
              : <EchoResults result={result} C={C} />
            }
            <button onClick={reset}
              style={{
                width: '100%', padding: '10px', marginTop: 14, background: C.SURF, color: C.SEC,
                border: `1px solid ${C.BORDER}`, borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: 'pointer'
              }}>
              ← Analyse Another File
            </button>
            <div style={{
              marginTop: 10, padding: '8px 12px', background: C.AMBER_P, borderRadius: 8,
              fontSize: 11.5, color: C.AMBER, lineHeight: 1.6
            }}>
              ⚠️ <strong>Disclaimer:</strong> This AI output is for clinical reference only. Always confirm findings with a qualified cardiologist before making any clinical decisions.
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ECGResults({ result, C }) {
  const detected = Array.isArray(result.detected) ? result.detected : [];
  const hasIssues = detected.length > 0;
  const confColor = c => c === 'high' ? C.GREEN : c === 'medium' ? C.AMBER : C.MUTED;
  const confBg = c => c === 'high' ? C.GREEN_P : c === 'medium' ? C.AMBER_P : C.SURF;

  return (
    <div>
      {/* Urgent warning */}
      {result.warning && (
        <div style={{
          background: C.RED_P, border: '1.5px solid #f5c6cb', borderRadius: 10,
          padding: '12px 14px', marginBottom: 14, display: 'flex', gap: 10, alignItems: 'flex-start'
        }}>
          <span style={{ fontSize: 20, flexShrink: 0 }}>🚨</span>
          <div>
            <div style={{ fontWeight: 700, fontSize: 13.5, color: C.RED, marginBottom: 3 }}>Urgent Finding</div>
            <div style={{ fontSize: 13, color: C.RED }}>{result.warning}</div>
          </div>
        </div>
      )}

      {/* Main diagnosis panel */}
      <div style={{
        background: hasIssues ? C.RED_P : C.GREEN_P,
        border: `1.5px solid ${hasIssues ? '#f5c6cb' : '#a5d6a7'}`,
        borderRadius: 12, padding: '14px 18px', marginBottom: 14
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: hasIssues ? 12 : 0 }}>
          <span style={{ fontSize: 22 }}>{hasIssues ? '⚠️' : '✅'}</span>
          <div style={{ fontSize: 14, fontWeight: 700, color: hasIssues ? C.RED : C.GREEN }}>
            {hasIssues
              ? `${detected.length} Diagnosis${detected.length > 1 ? 'es' : ''} Detected`
              : 'None of the model diagnoses detected'}
          </div>
        </div>
        {hasIssues && detected.map(d => {
          const conf = result.confidence?.[d];
          return (
            <div key={d} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '8px 12px', background: 'white', borderRadius: 8,
              border: '1px solid #f5c6cb', marginBottom: 6
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: C.RED, flexShrink: 0 }} />
                <span style={{ fontSize: 13.5, fontWeight: 600, color: C.NAVY }}>{d}</span>
              </div>
              {conf && (
                <span style={{
                  fontSize: 11, fontWeight: 700, background: confBg(conf),
                  color: confColor(conf), padding: '2px 8px', borderRadius: 99
                }}>
                  {conf} confidence
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* ECG metrics */}
      {(result.rate || result.rhythm || result.axis) && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 14 }}>
          {[
            { label: 'Heart Rate', value: result.rate },
            { label: 'Rhythm', value: result.rhythm },
            { label: 'Axis', value: result.axis },
          ].filter(m => m.value).map(m => (
            <div key={m.label} style={{ background: C.SURF, borderRadius: 9, padding: '10px 12px', border: `1px solid ${C.BORDER}` }}>
              <div style={{ fontSize: 10.5, color: C.MUTED, marginBottom: 3 }}>{m.label}</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.NAVY }}>{m.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Clinical summary */}
      {result.findings && (
        <div style={{ background: C.SURF, borderRadius: 10, padding: '12px 14px', fontSize: 13, color: C.SEC, lineHeight: 1.75 }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: C.MUTED, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Clinical Summary</div>
          {Array.isArray(result.findings)
            ? (result.findings[0]?.title || result.findings[0]?.detail || '')
            : (typeof result.findings === 'string' ? result.findings : '')}
        </div>
      )}
    </div>
  );
}

function EchoResults({ result, C }) {
  const lvefNum = parseFloat(result.lvef);
  const lvefColor = isNaN(lvefNum) ? C.MUTED : lvefNum >= 55 ? C.GREEN : lvefNum >= 40 ? C.AMBER : C.RED;
  const lvefBg = isNaN(lvefNum) ? C.SURF : lvefNum >= 55 ? C.GREEN_P : lvefNum >= 40 ? C.AMBER_P : C.RED_P;

  return (
    <div>
      {/* LVEF hero */}
      {result.lvef && (
        <div style={{
          background: lvefBg, border: `1.5px solid ${lvefColor}40`,
          borderRadius: 12, padding: '14px 18px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 16
        }}>
          <div style={{ textAlign: 'center', flexShrink: 0 }}>
            <div style={{ fontSize: 34, fontWeight: 800, color: lvefColor, lineHeight: 1 }}>{result.lvef}</div>
            <div style={{ fontSize: 11, color: C.MUTED, marginTop: 2 }}>LVEF</div>
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.NAVY, marginBottom: 3 }}>
              LV Function: {result.lvFunction || '—'}
            </div>
            {result.rvFunction && (
              <div style={{ fontSize: 12.5, color: C.SEC }}>RV Function: {result.rvFunction}</div>
            )}
          </div>
        </div>
      )}

      {/* Valvular findings */}
      {result.valvularFindings && Object.keys(result.valvularFindings).length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: C.MUTED, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Valvular Assessment</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {Object.entries(result.valvularFindings).filter(([, v]) => v && v !== 'not assessed').map(([valve, finding]) => (
              <div key={valve} style={{ background: C.SURF, borderRadius: 9, padding: '9px 12px', border: `1px solid ${C.BORDER}` }}>
                <div style={{ fontSize: 10.5, color: C.MUTED, textTransform: 'capitalize', marginBottom: 3 }}>{valve} valve</div>
                <div style={{
                  fontSize: 12.5, fontWeight: 600,
                  color: finding.toLowerCase().includes('normal') ? C.GREEN
                    : finding.toLowerCase().includes('severe') ? C.RED : C.AMBER
                }}>
                  {finding}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Structural + other metrics */}
      {result.structuralFindings?.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: C.MUTED, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Structural Findings</div>
          {result.structuralFindings.map((f, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, fontSize: 13, color: C.SEC, padding: '5px 0', borderBottom: `1px solid ${C.BORDER}` }}>
              <span style={{ color: C.TEAL, flexShrink: 0 }}>•</span>{f}
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
        {[
          { label: 'Diastolic Function', value: result.diastolicFunction },
          { label: 'Wall Motion', value: result.wallMotion },
          { label: 'Pericardium', value: result.pericardium },
        ].filter(m => m.value).map(m => (
          <div key={m.label} style={{ background: C.SURF, borderRadius: 9, padding: '9px 12px', border: `1px solid ${C.BORDER}` }}>
            <div style={{ fontSize: 10.5, color: C.MUTED, marginBottom: 3 }}>{m.label}</div>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: C.NAVY }}>{m.value}</div>
          </div>
        ))}
      </div>

      {result.impression && (
        <div style={{ background: C.SURF, borderRadius: 10, padding: '12px 14px', marginBottom: 12, fontSize: 13, color: C.SEC, lineHeight: 1.75 }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: C.MUTED, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Echocardiographic Impression</div>
          {result.impression}
        </div>
      )}

      {result.recommendations?.length > 0 && (
        <div style={{ background: C.GREEN_P, borderRadius: 10, padding: '12px 14px', marginBottom: 12, border: `1px solid #a5d6a7` }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: C.GREEN, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Recommendations</div>
          {result.recommendations.map((rec, i) => (
            <div key={i} style={{ fontSize: 12.5, color: C.SEC, display: 'flex', gap: 8, padding: '3px 0' }}>
              <span style={{ color: C.GREEN, fontWeight: 700 }}>{i + 1}.</span>{rec}
            </div>
          ))}
        </div>
      )}

      {result.tasks_assessed?.length > 0 && (
        <div style={{ fontSize: 11.5, color: C.MUTED, lineHeight: 1.7, marginBottom: 6 }}>
          <strong>PanEcho tasks assessed:</strong> {result.tasks_assessed.join(', ')}
        </div>
      )}
      {result.limitations && (
        <div style={{ fontSize: 11.5, color: C.MUTED, fontStyle: 'italic' }}>
          ⚠️ Limitations: {result.limitations}
        </div>
      )}
    </div>
  );
}


export default function PatientDashboard() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [user, setUser] = useState(null);
  const [upcoming, setUpcoming] = useState([]);
  const [allAppts, setAllAppts] = useState([]);
  const [activeTab, setActiveTab] = useState('upcoming');
  const [loading, setLoading] = useState(true);

  const token = useCallback(() => localStorage.getItem('mc_token') || '', []);

  useEffect(() => {
    setMounted(true);
    const tok = localStorage.getItem('mc_token');
    const u = localStorage.getItem('mc_user');
    if (!tok) { window.location.href = '/login'; return; }
    if (u) { try { setUser(JSON.parse(u)); } catch { } }

    const headers = { Authorization: `Bearer ${tok}` };
    Promise.all([
      fetch(`${API}/appointments`, { headers }).then(r => r.json()).catch(() => ({})),
      fetch(`${API}/appointments/upcoming`, { headers }).then(r => r.json()).catch(() => ({})),
    ]).then(([allRes, upRes]) => {
      setAllAppts(allRes.data || allRes.appointments || []);
      setUpcoming(upRes.data || upRes.appointments || []);
    }).finally(() => setLoading(false));
  }, []);

  const [abha, setAbha] = useState(null);   // { abhaId, abhaLinked, fetchedAt }
  const [abhaInput, setAbhaInput] = useState('');
  const [abhaModal, setAbhaModal] = useState(false);
  const [abhaLoading, setAbhaLoading] = useState(false);
  const [abhaMsg, setAbhaMsg] = useState('');

  // Load ABHA status
  useEffect(() => {
    const tok = localStorage.getItem('mc_token');
    if (!tok) return;
    fetch(`${API}/auth/abha-status`, { headers: { Authorization: `Bearer ${tok}` } })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.success) setAbha(d); })
      .catch(() => { });
  }, []);

  async function saveAbha() {
    const clean = abhaInput.replace(/-/g, '').trim();
    if (!/^\d{14}$/.test(clean)) { setAbhaMsg('Enter a valid 14-digit ABHA number'); return; }
    setAbhaLoading(true); setAbhaMsg('');
    try {
      const tok = localStorage.getItem('mc_token');
      const r = await fetch(`${API}/auth/verify-abha`, {
        method: 'POST', headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ abhaNumber: clean }),
      });
      const d = await r.json();
      if (r.ok && d.success) {
        setAbha({ abhaLinked: true, abhaId: d.formatted });
        setAbhaModal(false); setAbhaInput('');
        setAbhaMsg('');
      } else { setAbhaMsg(d.message || 'Failed to save'); }
    } catch { setAbhaMsg('Network error'); }
    setAbhaLoading(false);
  }

  const patName = user?.patient?.firstName || user?.firstName || 'there';
  const greeting = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; };
  const stats = {
    upcoming: allAppts.filter(a => ['SCHEDULED', 'CONFIRMED', 'RESCHEDULED'].includes(a.status)).length,
    completed: allAppts.filter(a => a.status === 'COMPLETED').length,
    total: allAppts.length,
  };
  const displayAppts = activeTab === 'upcoming'
    ? allAppts.filter(a => ['SCHEDULED', 'CONFIRMED', 'RESCHEDULED'].includes(a.status))
    : allAppts.filter(a => ['COMPLETED', 'CANCELLED', 'NO_SHOW'].includes(a.status));

  if (!mounted) return (
    <div className="mc-app-shell" style={{ background: 'linear-gradient(90deg, #0c1a2e 60px, #f7f9fc 60px)' }}>
      <div style={{ width: 60, minWidth: 60, background: NAVY, flexShrink: 0 }} />
      <div style={{ flex: 1, background: SURFACE }} />
    </div>
  );

  return (
    <div className="mc-app-shell">
      <Sidebar active="patientDashboard" />

      <div className="mc-main">
        <div className="mc-content">

          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, flexWrap: 'wrap', gap: 10 }}>
            <div>
              <div style={{ fontSize: 22, fontWeight: 700, color: NAVY }}>{greeting()}, {patName} 👋</div>
              <div style={{ fontSize: 13, color: MUTED, marginTop: 3 }}>{new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</div>
            </div>
            <button onClick={() => router.push('/patient/appointments/book')}
              style={{ padding: '9px 18px', background: BLUE, color: 'white', border: 'none', borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              + Book Appointment
            </button>
          </div>

          {/* Stats */}
          <div className="mc-stats-grid" style={{ marginBottom: 24 }}>
            {[
              { label: 'Upcoming', value: loading ? '…' : stats.upcoming, icon: '📅', color: BLUE },
              { label: 'Completed', value: loading ? '…' : stats.completed, icon: '✅', color: GREEN },
              { label: 'Total Visits', value: loading ? '…' : stats.total, icon: '🏥', color: NAVY },
            ].map(s => (
              <div key={s.label} style={{ background: 'white', borderRadius: 14, padding: '16px 20px', border: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{ fontSize: 28 }}>{s.icon}</div>
                <div>
                  <div style={{ fontSize: 28, fontWeight: 700, color: s.color, lineHeight: 1 }}>{s.value}</div>
                  <div style={{ fontSize: 12, color: MUTED, marginTop: 3 }}>{s.label}</div>
                </div>
              </div>
            ))}
          </div>

          {/* ABHA Card */}
          <div style={{ background: 'white', borderRadius: 14, border: `1px solid ${BORDER}`, padding: '14px 18px', marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 42, height: 42, borderRadius: 10, background: abha?.abhaLinked ? '#dcfce7' : '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>
                🏥
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: MUTED, marginBottom: 2 }}>ABHA — Ayushman Bharat Health Account</div>
                {abha?.abhaLinked ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: GREEN, fontFamily: 'monospace', letterSpacing: '0.05em' }}>{abha.abhaId}</span>
                    <span style={{ fontSize: 11, background: GREEN_P, color: GREEN, padding: '2px 8px', borderRadius: 99, fontWeight: 700 }}>✓ Linked</span>
                  </div>
                ) : (
                  <div style={{ fontSize: 13, color: MUTED }}>No ABHA number linked. Add it so doctors can access your national health records.</div>
                )}
              </div>
            </div>
            <button onClick={() => { setAbhaInput(abha?.abhaId?.replace(/-/g, '') || ''); setAbhaMsg(''); setAbhaModal(true); }}
              style={{
                padding: '7px 14px', background: abha?.abhaLinked ? SURFACE : BLUE, color: abha?.abhaLinked ? NAVY : 'white',
                border: abha?.abhaLinked ? `1px solid ${BORDER}` : 'none', borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', flexShrink: 0
              }}>
              {abha?.abhaLinked ? '✏️ Update' : '+ Add ABHA'}
            </button>
          </div>

          {/* Report Analyzer banner */}
          <div style={{ background: 'linear-gradient(135deg,#0e7490 0%,#1565c0 100%)', borderRadius: 14, padding: '18px 22px', marginBottom: 24, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                <span style={{ fontSize: 22 }}>🔬</span>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'white' }}>Free Report Analyzer</div>
                <span style={{ background: 'rgba(255,255,255,0.2)', color: '#a5f3fc', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20 }}>FREE</span>
              </div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.85)', lineHeight: 1.6, maxWidth: 520 }}>
                Upload any lab report — CBC, Lipid Panel, Thyroid, Blood Sugar — and get instant plain-English results. See what's abnormal and know which doctor to see.
              </div>
            </div>
            <button onClick={() => router.push('/patient/reports')}
              style={{ padding: '10px 22px', background: 'white', color: '#0e7490', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}>
              Analyze a Report →
            </button>
          </div>

          {/* Appointments */}
          <div style={{ background: 'white', borderRadius: 14, border: `1px solid ${BORDER}`, overflow: 'hidden', marginBottom: 20 }}>
            <div style={{ padding: '14px 20px', borderBottom: `1px solid ${BORDER}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: NAVY }}>My Appointments</div>
              <div style={{ display: 'flex', gap: 8 }}>
                {['upcoming', 'history'].map(tab => (
                  <button key={tab} onClick={() => setActiveTab(tab)}
                    style={{ padding: '5px 12px', borderRadius: 7, border: `1px solid ${activeTab === tab ? BLUE : BORDER}`, background: activeTab === tab ? BLUE_P : 'white', color: activeTab === tab ? BLUE : MUTED, fontSize: 12, fontWeight: activeTab === tab ? 700 : 400, cursor: 'pointer' }}>
                    {tab === 'upcoming' ? 'Upcoming' : 'History'}
                  </button>
                ))}
                <button onClick={() => router.push('/patient/appointments')}
                  style={{ fontSize: 12, color: BLUE, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
                  View all →
                </button>
              </div>
            </div>
            <div style={{ padding: '0 20px' }}>
              {loading ? (
                <div style={{ padding: '28px 0', textAlign: 'center', color: MUTED }}>Loading…</div>
              ) : displayAppts.length === 0 ? (
                <div style={{ padding: '32px 0', textAlign: 'center' }}>
                  <div style={{ fontSize: 32, marginBottom: 10 }}>📅</div>
                  <div style={{ color: MUTED, fontSize: 13, marginBottom: 16 }}>
                    {activeTab === 'upcoming' ? 'No upcoming appointments' : 'No appointment history'}
                  </div>
                  {activeTab === 'upcoming' && (
                    <button onClick={() => router.push('/patient/appointments/book')}
                      style={{ padding: '9px 18px', background: BLUE, color: 'white', border: 'none', borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                      Book Now
                    </button>
                  )}
                </div>
              ) : (
                displayAppts.slice(0, 5).map(a => (
                  <ApptCard key={a.id} appt={a} onBookAgain={a2 => router.push(`/patient/appointments/book?doctorId=${a2.doctorId}`)} />
                ))
              )}
            </div>
          </div>

          {/* ── Cardiac AI Diagnostics ── */}
          <ECGEchoTools isDoctor={false} />


          {/* Quick actions */}
          <div style={{ background: 'white', borderRadius: 14, border: `1px solid ${BORDER}`, padding: '16px 20px' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: NAVY, marginBottom: 14 }}>Quick Actions</div>
            <div className="mc-actions-grid">
              {[
                { label: 'Book Appointment', icon: '📅', href: '/patient/appointments/book', color: BLUE },
                { label: 'Message Doctor', icon: '💬', href: '/patient/chat', color: '#0e7490' },
                { label: 'Upload Reports', icon: '📁', href: '/patient/files', color: '#6d28d9' },
                { label: 'Analyze a Report', icon: '🔬', href: '/patient/reports', color: BLUE, highlight: true },
              ].map(q => (
                <button key={q.href} onClick={() => router.push(q.href)}
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '14px 10px', border: q.highlight ? `2px solid ${q.color}30` : `1px solid ${BORDER}`, borderRadius: 12, background: q.highlight ? `${q.color}08` : 'white', cursor: 'pointer', fontSize: 12.5, fontWeight: 500, color: NAVY, transition: 'all 0.15s', position: 'relative' }}>
                  {q.highlight && <span style={{ position: 'absolute', top: -8, right: -8, background: '#0e7490', color: '#a5f3fc', fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 20 }}>FREE</span>}
                  <span style={{ fontSize: 22 }}>{q.icon}</span>
                  {q.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ABHA Number Modal */}
      {abhaModal && (
        <div onClick={e => { if (e.target === e.currentTarget) { setAbhaModal(false); setAbhaMsg(''); } }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(12,26,46,0.55)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: 'white', borderRadius: 16, padding: 28, maxWidth: 420, width: '100%', fontFamily: 'DM Sans, sans-serif' }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: NAVY, marginBottom: 6 }}>🏥 {abha?.abhaLinked ? 'Update' : 'Add'} ABHA Number</div>
            <div style={{ fontSize: 13, color: SEC, marginBottom: 18, lineHeight: 1.6 }}>
              Your Ayushman Bharat Health Account (ABHA) ID links your health records across hospitals in India. Doctors on NexMedicon AI can access your national health history with your consent.
            </div>

            {abhaMsg && (
              <div style={{ background: abhaMsg.includes('✓') || abhaMsg.includes('linked') ? GREEN_P : RED_P, border: `1px solid ${abhaMsg.includes('✓') || abhaMsg.includes('linked') ? '#a5d6a7' : '#f5c6cb'}`, borderRadius: 9, padding: '9px 13px', fontSize: 13, color: abhaMsg.includes('✓') || abhaMsg.includes('linked') ? GREEN : RED, marginBottom: 14 }}>
                {abhaMsg}
              </div>
            )}

            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: SEC, marginBottom: 5 }}>ABHA Number</label>
            <input
              type="text"
              value={abhaInput}
              onChange={e => { setAbhaInput(e.target.value); setAbhaMsg(''); }}
              placeholder="12-3456-7890-1234"
              maxLength={19}
              style={{
                width: '100%', padding: '10px 13px', border: `1.5px solid ${BORDER}`, borderRadius: 9,
                fontSize: 14, fontFamily: 'monospace', letterSpacing: '0.08em', outline: 'none',
                boxSizing: 'border-box', marginBottom: 6
              }}
            />
            <div style={{ fontSize: 11, color: MUTED, marginBottom: 18 }}>
              Enter your 14-digit ABHA ID. Format: XX-XXXX-XXXX-XXXX<br />
              Find it on your ABHA card or at <strong>healthid.ndhm.gov.in</strong>
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => { setAbhaModal(false); setAbhaMsg(''); }}
                style={{ flex: 1, padding: 11, background: SURFACE, color: SEC, border: `1px solid ${BORDER}`, borderRadius: 9, fontSize: 13.5, fontWeight: 600, cursor: 'pointer' }}>
                Cancel
              </button>
              <button onClick={saveAbha} disabled={abhaLoading || !abhaInput.trim()}
                style={{ flex: 1, padding: 11, background: (!abhaInput.trim() || abhaLoading) ? '#93c5fd' : BLUE, color: 'white', border: 'none', borderRadius: 9, fontSize: 13.5, fontWeight: 700, cursor: (!abhaInput.trim() || abhaLoading) ? 'not-allowed' : 'pointer' }}>
                {abhaLoading ? '⏳ Saving…' : '✓ Save ABHA'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}