'use client';
/**
 * src/components/AppLayout.jsx
 *
 * FIX: Removed `import { C } from '@/lib/styles'` — that file may not exist.
 * All colour values are now inlined directly. Zero external dependencies.
 *
 * Used by:
 *   src/app/doctor/appointments/page.js   (role="doctor")
 *   src/app/patient/files/page.js         (role="patient")
 *   src/app/patient/reports/page.js       (role="patient")
 */
import { useRouter, usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

// ── Design tokens (inlined — no @/lib/styles dependency) ─────────────────────
export const C = {
  navy:      '#0c1a2e',
  blue:      '#1565c0',
  bluePale:  '#e3f0ff',
  red:       '#c62828',
  redPale:   '#fdecea',
  amber:     '#b45309',
  amberPale: '#fff3e0',
  green:     '#1b5e20',
  greenPale: '#e8f5e9',
  teal:      '#00796b',
  tealPale:  '#e0f5f0',
  border:    '#e2e8f0',
  surface:   '#f7f9fc',
  textMuted: '#8896a7',
  textSec:   '#4a5568',
};

// Also export card, statusPill, btn so pages that import them from AppLayout work too
export const card = {
  background: 'white', borderRadius: 14, padding: '18px 20px',
  border: `1px solid ${C.border}`, boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
};

export function statusPill(status) {
  const m = {
    CONFIRMED:   { bg: C.greenPale, color: C.green  },
    SCHEDULED:   { bg: C.bluePale,  color: C.blue   },
    RESCHEDULED: { bg: '#ede9fe',   color: '#7c3aed' },
    CANCELLED:   { bg: C.redPale,   color: C.red    },
    COMPLETED:   { bg: C.greenPale, color: C.green  },
    NO_SHOW:     { bg: C.amberPale, color: C.amber  },
  };
  const s = m[status] || { bg: C.surface, color: C.textMuted };
  return { display:'inline-block', background:s.bg, color:s.color, fontSize:11, fontWeight:600, padding:'3px 10px', borderRadius:20 };
}

export const btn = {
  primary:   { padding:'9px 18px', background:C.blue, color:'white', border:'none', borderRadius:9, fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'DM Sans, sans-serif' },
  secondary: { padding:'9px 18px', background:'white', color:C.blue, border:`1px solid ${C.border}`, borderRadius:9, fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'DM Sans, sans-serif' },
  danger:    { padding:'9px 18px', background:C.red,  color:'white', border:'none', borderRadius:9, fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'DM Sans, sans-serif' },
};

const PATIENT_NAV = [
  { href:'/patient',                   icon:'⊞', label:'Dashboard'         },
  { href:'/patient/appointments',      icon:'📅', label:'My Appointments'   },
  { href:'/patient/appointments/book', icon:'➕', label:'Book Appointment'  },
  { href:'/patient/chat',              icon:'💬', label:'Chat with Doctor', badge:1     },
  { href:'/patient/reports',           icon:'🔬', label:'Report Analyzer',  badge:'FREE'},
];

const DOCTOR_NAV = [
  { href:'/doctor',              icon:'⊞', label:'Dashboard'     },
  { href:'/doctor/patients',     icon:'👥', label:'All Patients'  },
  { href:'/doctor/appointments', icon:'📅', label:'Appointments'  },
  { href:'/doctor/chat',         icon:'💬', label:'Patient Chat', badge:3       },
  { href:'/doctor/updates',      icon:'🔔', label:'Updates',      badge:2       },
  { href:'/doctor/reports',      icon:'🔬', label:'Report Review',badge:'PREMIUM'},
];

export default function AppLayout({ children, role }) {
  const router   = useRouter();
  const pathname = usePathname();

  const [mounted, setMounted] = useState(false);
  const [user,    setUser]    = useState(null);

  useEffect(() => {
    setMounted(true);
    const u = localStorage.getItem('mc_user');
    if (!u) { router.push('/login'); return; }
    try {
      const parsed = JSON.parse(u);
      if (role === 'doctor'  && parsed.role !== 'DOCTOR')  { router.push('/patient'); return; }
      if (role === 'patient' && parsed.role !== 'PATIENT')  { router.push('/doctor');  return; }
      setUser(parsed);
    } catch { router.push('/login'); }
  }, []);

  function logout() {
    localStorage.removeItem('mc_token');
    localStorage.removeItem('mc_user');
    router.push('/login');
  }

  if (!mounted || !user) {
    return (
      <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:C.surface }}>
        <div style={{ textAlign:'center' }}>
          <div style={{ width:32, height:32, border:`3px solid ${C.border}`, borderTopColor:C.blue, borderRadius:'50%', margin:'0 auto 12px', animation:'appSpin 1s linear infinite' }} />
          <div style={{ color:C.textMuted, fontSize:13 }}>Loading…</div>
        </div>
        <style>{`@keyframes appSpin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  const nav = role === 'doctor' ? DOCTOR_NAV : PATIENT_NAV;

  const pname = role === 'doctor'
    ? `Dr. ${user.doctor?.firstName || ''} ${user.doctor?.lastName || ''}`.trim() || user.email || 'Doctor'
    : `${user.patient?.firstName || ''} ${user.patient?.lastName || ''}`.trim() || user.email || 'Patient';

  const initials     = pname.split(' ').filter(Boolean).map(w=>w[0]).join('').slice(0,2).toUpperCase() || (role==='doctor'?'DR':'PT');
  const avatarBg     = role === 'doctor' ? C.tealPale : C.bluePale;
  const avatarColor  = role === 'doctor' ? C.teal     : C.blue;

  return (
    <div style={{ display:'flex', height:'100vh', overflow:'hidden', fontFamily:'DM Sans, sans-serif' }}>

      {/* Sidebar */}
      <div style={{ width:220, minWidth:220, background:C.navy, display:'flex', flexDirection:'column', overflow:'hidden', flexShrink:0 }}>

        {/* Logo */}
        <div style={{ padding:'20px 18px 14px', borderBottom:'1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <div style={{ width:32, height:32, background:C.blue, borderRadius:8, display:'flex', alignItems:'center', justifyContent:'center', position:'relative', flexShrink:0 }}>
              <div style={{ position:'absolute', width:14, height:3, background:'white', borderRadius:2 }} />
              <div style={{ position:'absolute', width:3, height:14, background:'white', borderRadius:2 }} />
            </div>
            <div>
              <div style={{ fontSize:13, fontWeight:600, color:'white' }}>MediConnect AI</div>
              <div style={{ fontSize:9, color:'rgba(255,255,255,0.3)', fontFamily:'monospace', letterSpacing:'0.1em' }}>
                {role === 'doctor' ? 'DOCTOR PORTAL' : 'PATIENT PORTAL'}
              </div>
            </div>
          </div>
        </div>

        {/* User pill */}
        <div style={{ margin:'10px 10px 6px', background:'rgba(255,255,255,0.06)', borderRadius:9, padding:'8px 10px', display:'flex', alignItems:'center', gap:8, border:'1px solid rgba(255,255,255,0.07)' }}>
          <div style={{ width:30, height:30, borderRadius:'50%', background:avatarBg, color:avatarColor, display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:700, flexShrink:0 }}>
            {initials}
          </div>
          <div style={{ flex:1, minWidth:0 }}>
            <div suppressHydrationWarning style={{ fontSize:12, fontWeight:500, color:'white', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{pname}</div>
            <div style={{ fontSize:10, color:'rgba(255,255,255,0.4)' }}>
              {role === 'doctor' ? (user.doctor?.specialty || 'Doctor') : 'Patient'}
            </div>
          </div>
        </div>

        {/* Section label */}
        <div style={{ padding:'10px 18px 4px', fontSize:9, color:'rgba(255,255,255,0.25)', fontFamily:'monospace', letterSpacing:'0.12em' }}>
          {role === 'doctor' ? 'CLINICAL' : 'MY HEALTH'}
        </div>

        {/* Nav items */}
        <div style={{ padding:'0 8px', flex:1, overflowY:'auto' }}>
          {nav.map(item => {
            const active = pathname === item.href ||
              (item.href !== '/patient' && item.href !== '/doctor' && pathname?.startsWith(item.href));
            return (
              <button key={item.href} onClick={() => router.push(item.href)}
                style={{ display:'flex', alignItems:'center', gap:10, width:'100%', padding:'9px 12px', margin:'2px 0', borderRadius:8, cursor:'pointer', border:'none', textAlign:'left', background:active?C.blue:'transparent', color:active?'white':'rgba(255,255,255,0.55)', fontSize:13, fontFamily:'DM Sans, sans-serif', fontWeight:active?500:400, transition:'background 0.12s' }}>
                <span style={{ fontSize:14 }}>{item.icon}</span>
                <span style={{ flex:1 }}>{item.label}</span>
                {item.badge != null && (
                  <span style={{
                    background:   item.badge==='PREMIUM'?'#6b21a8':item.badge==='FREE'?'#0e7490':'#ef4444',
                    color:        item.badge==='PREMIUM'?'#e9d5ff':item.badge==='FREE'?'#a5f3fc':'white',
                    fontSize:     item.badge==='PREMIUM'?8:10,
                    fontWeight:   600,
                    padding:      item.badge==='PREMIUM'?'2px 5px':item.badge==='FREE'?'2px 6px':'1px 5px',
                    borderRadius: 99,
                  }}>
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Sign out */}
        <div style={{ padding:'10px 12px', borderTop:'1px solid rgba(255,255,255,0.08)' }}>
          <button onClick={logout}
            style={{ display:'flex', alignItems:'center', gap:8, width:'100%', padding:'7px 10px', borderRadius:8, cursor:'pointer', border:'none', background:'rgba(255,255,255,0.05)', color:'rgba(255,255,255,0.4)', fontSize:12, fontFamily:'DM Sans, sans-serif' }}>
            🚪 Sign out
          </button>
        </div>
      </div>

      {/* Main content */}
      <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden', minWidth:0 }}>
        {children}
      </div>
    </div>
  );
}