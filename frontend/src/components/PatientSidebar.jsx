'use client';
/**
 * src/components/PatientSidebar.jsx
 *
 * Shared collapsible sidebar for ALL patient pages.
 * Import this in any page that needs the patient nav:
 *
 *   import PatientSidebar from '@/components/PatientSidebar';
 *   // then in JSX:
 *   <PatientSidebar active="patientChat" />
 *
 * Active IDs:
 *   patientDashboard | patientAppts | patientBook |
 *   patientChat | patientFiles | patientReports
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getToken, getUser, clearSession } from '@/lib/auth';

const API  = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';
const NAVY = '#0c1a2e';
const BLUE = '#1565c0';
const BLUE_P = '#e3f0ff';

const NAV = [
  { id: 'patientDashboard', label: 'Dashboard',        icon: '⊞', href: '/patient' },
  { id: 'patientAppts',     label: 'My Appointments',  icon: '📅', href: '/patient/appointments' },
  { id: 'patientBook',      label: 'Book Appointment', icon: '➕', href: '/patient/appointments/book' },
  { id: 'patientChat',      label: 'Chat with Doctor', icon: '💬', href: '/patient/chat',    badge: '_chat' },
  { id: 'patientFiles',     label: 'My Files',         icon: '📁', href: '/patient/files' },
  { id: 'patientReports',   label: 'Report Analyzer',  icon: '🔬', href: '/patient/reports', badge: 'FREE' },
];

const BOTTOM_NAV = [
  { id: 'patientDashboard', label: 'Home',    icon: '⊞', href: '/patient' },
  { id: 'patientAppts',     label: 'Appts',   icon: '📅', href: '/patient/appointments' },
  { id: 'patientChat',      label: 'Chat',    icon: '💬', href: '/patient/chat' },
  { id: 'patientReports',   label: 'Reports', icon: '🔬', href: '/patient/reports' },
  { id: 'patientMore',      label: 'More',    icon: '☰',  href: null },
];

export default function PatientSidebar({ active }) {
  const router = useRouter();
  const [chatBadge, setChatBadge] = useState(0);
  const [name,      setName]      = useState('Patient');
  const [inits,     setInits]     = useState('P');
  const [moreOpen,  setMoreOpen]  = useState(false);

  useEffect(() => {
    const tok = getToken('PATIENT');
    if (!tok) return;
    fetch(`${API}/chat/rooms?limit=100`, { headers: { Authorization: `Bearer ${tok}` } })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        const total = (d?.data || []).reduce((s, r) => s + (r.unreadCount || 0), 0);
        setChatBadge(total);
      }).catch(() => {});
  }, []);

  useEffect(() => {
    try {
      const u = getUser('PATIENT');
      const n = u?.patient
        ? `${u.patient.firstName || ''} ${u.patient.lastName || ''}`.trim()
        : (u?.email || 'Patient');
      setName(n || 'Patient');
      setInits(n.split(' ').filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase() || 'P');
    } catch {}
  }, []);

  function signOut() {
    clearSession('PATIENT');
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
        <div style={{ margin: '8px 6px 4px', background: 'rgba(255,255,255,0.06)', borderRadius: 9, padding: '7px 6px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <div style={{ width: 28, height: 28, borderRadius: '50%', background: BLUE_P, color: BLUE, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{inits}</div>
          <div className="mc-user-info" style={{ flex: 1, minWidth: 0 }}>
            <div suppressHydrationWarning style={{ fontSize: 12, fontWeight: 500, color: 'white', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>Patient</div>
          </div>
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '4px 8px' }} />

        {/* Nav */}
        <div style={{ padding: '2px 4px', flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
          {NAV.map(item => {
            const isA = active === item.id;
            return (
              <button
                key={item.id}
                className="mc-nav-btn"
                onClick={() => router.push(item.href)}
                style={{
                  margin: '1px 0', borderRadius: 8,
                  background: isA ? BLUE : 'transparent',
                  color: isA ? 'white' : 'rgba(255,255,255,0.65)',
                  fontSize: 13, fontFamily: 'DM Sans, sans-serif',
                  fontWeight: isA ? 600 : 400,
                }}
              >
                <span className="mc-nav-icon">{item.icon}</span>
                <span className="mc-nav-label" style={{ textAlign: 'left' }}>{item.label}</span>
                {item.badge != null && (item.badge === '_chat' ? chatBadge > 0 : item.badge !== 0) && (
                  <span className="mc-nav-label" style={{
                    background: item.badge === 'FREE' ? '#0e7490' : '#ef4444',
                    color: 'white', fontSize: item.badge === 'FREE' ? 9 : 10,
                    fontWeight: 700, padding: '2px 6px', borderRadius: 99,
                    flexShrink: 0, flex: 'none',
                  }}>
                    {item.badge === '_chat' ? chatBadge : item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Sign out */}
        <div style={{ padding: '8px 6px 10px', borderTop: '1px solid rgba(255,255,255,0.08)', flexShrink: 0, background: NAVY }}>
          <button
            className="mc-nav-btn"
            onClick={signOut}
            style={{ borderRadius: 8, background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.5)', fontSize: 12, fontFamily: 'DM Sans, sans-serif' }}
          >
            <span className="mc-nav-icon">🚪</span>
            <span className="mc-signout-text">Sign out</span>
          </button>
        </div>
      </div>

      {/* ── Mobile Bottom Nav ── */}
      <nav className="mc-bottom-nav">
        {BOTTOM_NAV.map(item => {
          if (item.href === null) {
            return (
              <button key={item.id} className="mc-bottom-nav-btn" onClick={() => setMoreOpen(true)}>
                <span>{item.icon}</span><span>{item.label}</span>
              </button>
            );
          }
          const isA = active === item.id;
          return (
            <button
              key={item.id}
              className={`mc-bottom-nav-btn${isA ? ' active' : ''}`}
              onClick={() => router.push(item.href)}
              style={{ position: 'relative' }}
            >
              <span>{item.icon}</span><span>{item.label}</span>
              {item.id === 'patientChat' && chatBadge > 0 && (
                <span style={{ position: 'absolute', top: 6, right: 'calc(50% - 18px)', background: '#ef4444', color: 'white', fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 99 }}>{chatBadge}</span>
              )}
            </button>
          );
        })}
      </nav>

      {/* ── More Drawer ── */}
      {moreOpen && (
        <div onClick={() => setMoreOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(12,26,46,0.6)', zIndex: 200, display: 'flex', alignItems: 'flex-end' }}>
          <div onClick={e => e.stopPropagation()} style={{ width: '100%', background: NAVY, borderRadius: '16px 16px 0 0', paddingTop: 16, paddingBottom: 'env(safe-area-inset-bottom, 16px)', fontFamily: 'DM Sans, sans-serif', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ width: 36, height: 4, background: 'rgba(255,255,255,0.2)', borderRadius: 99, margin: '0 auto 12px' }} />
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {NAV.map(item => {
                const isA = active === item.id;
                return (
                  <button key={item.id} onClick={() => { router.push(item.href); setMoreOpen(false); }}
                    style={{ display: 'flex', alignItems: 'center', gap: 14, width: '100%', padding: '13px 24px', background: 'none', border: 'none', color: isA ? 'white' : 'rgba(255,255,255,0.7)', fontSize: 15, fontWeight: isA ? 600 : 400, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>
                    <span style={{ fontSize: 22, width: 28, textAlign: 'center' }}>{item.icon}</span>
                    {item.label}
                  </button>
                );
              })}
            </div>
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', flexShrink: 0 }}>
              <button onClick={signOut} style={{ display: 'flex', alignItems: 'center', gap: 14, width: '100%', padding: '14px 24px', background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)', fontSize: 15, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>
                <span style={{ fontSize: 22, width: 28, textAlign: 'center' }}>🚪</span>
                Sign out
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
