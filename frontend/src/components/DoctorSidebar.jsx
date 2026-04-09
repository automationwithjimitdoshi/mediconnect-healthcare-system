'use client';
/**
 * src/components/DoctorSidebar.jsx
 *
 * Shared collapsible sidebar for ALL doctor pages.
 *
 *   import DoctorSidebar from '@/components/DoctorSidebar';
 *   <DoctorSidebar active="doctorChat" />
 *
 * Active IDs:
 *   doctorDashboard | doctorPatients | doctorAppts |
 *   doctorChat | doctorUpdates | doctorReports
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getToken, getUser, clearSession } from '@/lib/auth';

const API   = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';
const NAVY  = '#0c1a2e';
const BLUE  = '#1565c0';
const TEAL  = '#00796b';
const TEAL_P = '#e0f5f0';
const PURPLE = '#6b21a8';

const DOCTOR_NAV = [
  { id: 'doctorDashboard', label: 'Dashboard',     icon: '⊞', href: '/doctor' },
  { id: 'doctorPatients',  label: 'All Patients',  icon: '👥', href: '/doctor/patients' },
  { id: 'doctorAppts',     label: 'Appointments',  icon: '📅', href: '/doctor/appointments' },
  { id: 'doctorChat',      label: 'Patient Chat',  icon: '💬', href: '/doctor/chat',    badge: '_chat' },
  { id: 'doctorUpdates',   label: 'Updates',       icon: '🔔', href: '/doctor/updates', badge: '_alerts' },
  { id: 'doctorReports',   label: 'Report Review', icon: '🔬', href: '/doctor/reports', badge: 'PREMIUM' },
];

const DOCTOR_BOTTOM_NAV = [
  { id: 'doctorDashboard', label: 'Home',    icon: '⊞', href: '/doctor' },
  { id: 'doctorAppts',     label: 'Appts',   icon: '📅', href: '/doctor/appointments' },
  { id: 'doctorChat',      label: 'Chat',    icon: '💬', href: '/doctor/chat' },
  { id: 'doctorReports',   label: 'Reports', icon: '🔬', href: '/doctor/reports' },
  { id: 'doctorMore',      label: 'More',    icon: '☰',  href: null },
];

export default function DoctorSidebar({ active, onProfileClick }) {
  const router = useRouter();
  const [chatBadge,  setChatBadge]  = useState(0);
  const [alertBadge, setAlertBadge] = useState(0);
  const [doctorName, setDoctorName] = useState('');
  const [specialty,  setSpecialty]  = useState('');
  const [inits,      setInits]      = useState('DR');
  const [moreOpen,   setMoreOpen]   = useState(false);

  useEffect(() => {
    const tok = getToken('DOCTOR');
    if (!tok) return;
    const h = { Authorization: `Bearer ${tok}` };
    fetch(`${API}/chat/rooms?limit=100`, { headers: h }).then(r => r.ok ? r.json() : null)
      .then(d => {
        const total = (d?.data || []).reduce((s, r) => s + (r.unreadCount || 0), 0);
        setChatBadge(total);
      }).catch(() => {});
    fetch(`${API}/cdss/alerts`, { headers: h }).then(r => r.ok ? r.json() : null)
      .then(d => setAlertBadge((d?.data || d?.alerts || []).length))
      .catch(() => {});
  }, []);

  useEffect(() => {
    try {
      const u = getUser('DOCTOR');
      if (u?.doctor) {
        const n = `Dr. ${u.doctor.firstName || ''} ${u.doctor.lastName || ''}`.trim();
        setDoctorName(n);
        setSpecialty(u.doctor.specialty || 'Doctor');
        setInits(n.split(' ').filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase() || 'DR');
      } else {
        setDoctorName(u?.email || 'Doctor');
        setSpecialty('Doctor Portal');
        setInits('DR');
      }
    } catch {}
  }, []);

  function getBadge(item) {
    if (item.badge === '_chat')   return chatBadge;
    if (item.badge === '_alerts') return alertBadge;
    return item.badge;
  }

  function signOut() {
    clearSession('DOCTOR');
    window.location.href = '/login';
  }

  return (
    <>
      {/* ── Desktop / Tablet Sidebar ── */}
      <div className="mc-sidebar">

        {/* Logo */}
        <div style={{ padding: '16px 0 12px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
          <div style={{ width: 32, height: 32, background: 'linear-gradient(135deg,#1565c0,#0c1a2e)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="18" height="18" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="16" y="4" width="8" height="32" rx="3" fill="white" fillOpacity="0.95"/>
              <rect x="4" y="16" width="32" height="8" rx="3" fill="white" fillOpacity="0.95"/>
            </svg>
          </div>
          <div style={{ minWidth: 0 }}>
            <div className="mc-logo-text" style={{ fontSize: 13, fontWeight: 700, color: 'white' }}>NexMedicon AI</div>
            <div className="mc-logo-text" style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', fontFamily: 'monospace', letterSpacing: '0.1em' }}>DOCTOR PORTAL</div>
          </div>
        </div>

        {/* Avatar — clicks open profile */}
        <div
          onClick={() => onProfileClick?.()}
          title="View/Edit Profile"
          style={{ cursor: 'pointer', margin: '8px 6px 4px', background: 'rgba(255,255,255,0.06)', borderRadius: 9, padding: '7px 6px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
        >
          <div style={{ width: 28, height: 28, borderRadius: '50%', background: TEAL_P, color: TEAL, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{inits}</div>
          <div className="mc-user-info" style={{ flex: 1, minWidth: 0 }}>
            <div suppressHydrationWarning style={{ fontSize: 12, fontWeight: 500, color: 'white', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doctorName || 'Doctor'}</div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>{specialty}</div>
          </div>
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '4px 8px' }} />

        {/* Nav */}
        <div style={{ padding: '2px 4px', flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
          {DOCTOR_NAV.map(item => {
            const isA = active === item.id;
            const badgeVal = getBadge(item);
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
                  fontWeight: isA ? 600 : 400, transition: 'background 0.12s',
                }}
              >
                <span className="mc-nav-icon">{item.icon}</span>
                <span className="mc-nav-label" style={{ textAlign: 'left' }}>{item.label}</span>
                {item.badge != null && badgeVal !== 0 && (
                  <span className="mc-nav-label" style={{
                    background: item.badge === 'PREMIUM' ? PURPLE : '#ef4444',
                    color: item.badge === 'PREMIUM' ? '#e9d5ff' : 'white',
                    fontSize: item.badge === 'PREMIUM' ? 8 : 10,
                    fontWeight: 700, padding: item.badge === 'PREMIUM' ? '2px 5px' : '1px 5px',
                    borderRadius: 99, flexShrink: 0, flex: 'none',
                  }}>
                    {badgeVal}
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
        {DOCTOR_BOTTOM_NAV.map(item => {
          if (item.href === null) {
            return (
              <button key={item.id} className="mc-bottom-nav-btn" onClick={() => setMoreOpen(true)}>
                <span>{item.icon}</span><span>{item.label}</span>
              </button>
            );
          }
          const isA = active === item.id;
          return (
            <button key={item.id} className={`mc-bottom-nav-btn${isA ? ' active' : ''}`} onClick={() => router.push(item.href)} style={{ position: 'relative' }}>
              <span>{item.icon}</span><span>{item.label}</span>
              {item.id === 'doctorChat' && chatBadge > 0 && (
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
              {DOCTOR_NAV.map(item => {
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
