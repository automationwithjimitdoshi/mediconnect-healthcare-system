'use client';
/**
 * src/app/patient/appointments/page.js
 *
 * FIX: Removed broken imports:
 *   ✗ import AppLayout from '@/components/AppLayout'  → doesn't exist
 *   ✗ import { C, card, statusPill, btn } from '@/lib/styles' → crashes if styles.js missing
 *
 * Now fully self-contained with inline Sidebar (same pattern as all other pages).
 */

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';

const NAVY  ='#0c1a2e', BLUE  ='#1565c0', BLUE_P ='#e3f0ff', RED   ='#c62828', RED_P ='#fdecea',
      AMBER ='#b45309', AMBER_P='#fff3e0', GREEN ='#1b5e20', GREEN_P='#e8f5e9',
      TEAL  ='#00796b', TEAL_P ='#e0f5f0', BORDER='#e2e8f0', SURFACE='#f7f9fc', MUTED='#8896a7';
const API = process.env.NEXT_PUBLIC_API_URL || 'process.env.NEXT_PUBLIC_API_URL ? process.env.NEXT_PUBLIC_API_URL : (process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api")';

const NAV = [
  { id:'patientDashboard', label:'Dashboard',       icon:'⊞', href:'/patient'                   },
  { id:'patientAppts',     label:'My Appointments', icon:'📅', href:'/patient/appointments'      },
  { id:'patientBook',      label:'Book Appointment',icon:'➕', href:'/patient/appointments/book' },
  { id:'patientChat',      label:'Chat with Doctor',icon:'💬', href:'/patient/chat', badge:'_chat'     },
  { id:'patientFiles', label:'My Files', icon:'📁', href:'/patient/files' },
  { id:'patientReports',   label:'Report Analyzer', icon:'🔬', href:'/patient/reports',badge:'FREE'},
];

function sTag(status) {
  const m = {
    COMPLETED:   { bg:GREEN_P, color:GREEN  },
    CONFIRMED:   { bg:'#d1fae5', color:'#065f46' },
    CANCELLED:   { bg:RED_P,   color:RED    },
    NO_SHOW:     { bg:AMBER_P, color:AMBER  },
    SCHEDULED:   { bg:BLUE_P,  color:BLUE   },
    RESCHEDULED: { bg:'#ede9fe', color:'#7c3aed' },
  };
  const s = m[status] || { bg:SURFACE, color:MUTED };
  return { display:'inline-block', background:s.bg, color:s.color, fontSize:11, fontWeight:600, padding:'3px 10px', borderRadius:20 };
}

// ── Sidebar ───────────────────────────────────────────────────────────────────
function Sidebar({ active }) {
  const router = useRouter();
  const [chatBadge, setChatBadge] = useState(0);
  useEffect(() => {
    const tok = localStorage.getItem('mc_token') || '';
    if (!tok) return;
    fetch(`${API}/chat/rooms?limit=100`, {headers:{Authorization:`Bearer ${tok}`}})
      .then(r=>r.ok?r.json():null)
      .then(d => {
        const total = (d?.data||[]).reduce((sum,r) => sum + (r.unreadCount||0), 0);
        setChatBadge(total);
      }).catch(()=>{});
  }, []);
  const [name, setName]   = useState('Patient');
  const [inits, setInits] = useState('P');
  useEffect(() => {
    try {
      const u = JSON.parse(localStorage.getItem('mc_user') || '{}');
      const n = u?.patient
        ? `${u.patient.firstName||''} ${u.patient.lastName||''}`.trim()
        : (u?.email || 'Patient');
      setName(n);
      setInits(n.split(' ').filter(Boolean).map(w=>w[0]).join('').slice(0,2).toUpperCase() || 'P');
    } catch {}
  }, []);
  return (
    <div style={{ width:220, background:NAVY, display:'flex', flexDirection:'column', flexShrink:0 }}>
      <div style={{ padding:'20px 18px 14px', borderBottom:'1px solid rgba(255,255,255,0.08)' }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ width:32, height:32, background:BLUE, borderRadius:8, display:'flex', alignItems:'center', justifyContent:'center', position:'relative', flexShrink:0 }}>
            <div style={{ position:'absolute', width:14, height:3, background:'white', borderRadius:2 }} />
            <div style={{ position:'absolute', width:3, height:14, background:'white', borderRadius:2 }} />
          </div>
          <div>
            <div style={{ fontSize:13, fontWeight:600, color:'white' }}>MediConnect AI</div>
            <div style={{ fontSize:9, color:'rgba(255,255,255,0.3)', fontFamily:'monospace', letterSpacing:'0.1em' }}>PATIENT PORTAL</div>
          </div>
        </div>
      </div>
      <div style={{ margin:'10px 10px 6px', background:'rgba(255,255,255,0.06)', borderRadius:9, padding:'8px 10px', display:'flex', alignItems:'center', gap:8 }}>
        <div style={{ width:30, height:30, borderRadius:'50%', background:BLUE_P, color:BLUE, display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:700, flexShrink:0 }}>{inits}</div>
        <div style={{ flex:1, minWidth:0 }}>
          <div suppressHydrationWarning style={{ fontSize:12, fontWeight:500, color:'white', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{name}</div>
          <div style={{ fontSize:10, color:'rgba(255,255,255,0.4)' }}>Patient</div>
        </div>
      </div>
      <div style={{ padding:'10px 18px 4px', fontSize:9, color:'rgba(255,255,255,0.25)', fontFamily:'monospace', letterSpacing:'0.12em' }}>MY HEALTH</div>
      <div style={{ padding:'0 8px', flex:1 }}>
        {NAV.map(item => { const isA = active===item.id; return (
          <button key={item.id} onClick={() => router.push(item.href)}
            style={{ display:'flex', alignItems:'center', gap:10, width:'100%', padding:'9px 12px', margin:'2px 0', borderRadius:8, cursor:'pointer', border:'none', textAlign:'left', background:isA?BLUE:'transparent', color:isA?'white':'rgba(255,255,255,0.55)', fontSize:13, fontFamily:'DM Sans, sans-serif', fontWeight:isA?500:400 }}>
            <span style={{ fontSize:14 }}>{item.icon}</span>
            <span style={{ flex:1 }}>{item.label}</span>
            {(item.badge!=null && (item.badge==='_chat'?chatBadge:item.badge)!==0) && <span style={{ background:item.badge==='FREE'?'#0e7490':'#ef4444', color:'white', fontSize:item.badge==='FREE'?9:10, fontWeight:600, padding:item.badge==='FREE'?'2px 6px':'1px 5px', borderRadius:99 }}>{item.badge==='_chat'?chatBadge:item.badge}</span>}
          </button>
        ); })}
      </div>
      <div style={{ padding:'10px 12px', borderTop:'1px solid rgba(255,255,255,0.08)' }}>
        <button onClick={() => { localStorage.removeItem('mc_token'); localStorage.removeItem('mc_user'); router.push('/login'); }}
          style={{ width:'100%', padding:'7px 10px', background:'rgba(255,255,255,0.05)', border:'none', borderRadius:8, color:'rgba(255,255,255,0.4)', fontSize:12, cursor:'pointer', fontFamily:'DM Sans, sans-serif', textAlign:'left' }}>
          🚪 Sign out
        </button>
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function PatientAppointmentsPage() {
  const router = useRouter();
  const [mounted,  setMounted]  = useState(false);
  const [appts,    setAppts]    = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [filter,   setFilter]   = useState('UPCOMING');
  const [toast,    setToast]    = useState('');

  const token    = useCallback(() => localStorage.getItem('mc_token') || '', []);
  const showToast= msg => { setToast(msg); setTimeout(() => setToast(''), 3500); };

  useEffect(() => {
    setMounted(true);
    if (!localStorage.getItem('mc_token')) { router.push('/login'); return; }
    fetch(`${API}/appointments`, { headers: { Authorization: `Bearer ${token()}` } })
      .then(r => r.json())
      .then(d => setAppts(d.data || d.appointments || []))
      .catch(() => showToast('❌ Failed to load appointments'))
      .finally(() => setLoading(false));
  }, []);

  const todayStr = new Date().toDateString();

  const filtered = appts.filter(a => {
    if (filter === 'TODAY')     return new Date(a.scheduledAt).toDateString() === todayStr;
    if (filter === 'UPCOMING')  return ['SCHEDULED','CONFIRMED','RESCHEDULED'].includes(a.status);
    if (filter === 'COMPLETED') return a.status === 'COMPLETED';
    if (filter === 'CANCELLED') return a.status === 'CANCELLED' || a.status === 'NO_SHOW';
    return true;
  }).sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt));

  const counts = {
    ALL:       appts.length,
    TODAY:     appts.filter(a => new Date(a.scheduledAt).toDateString() === todayStr).length,
    UPCOMING:  appts.filter(a => ['SCHEDULED','CONFIRMED','RESCHEDULED'].includes(a.status)).length,
    COMPLETED: appts.filter(a => a.status === 'COMPLETED').length,
    CANCELLED: appts.filter(a => ['CANCELLED','NO_SHOW'].includes(a.status)).length,
  };

  if (!mounted) return null;

  return (
    <div style={{ display:'flex', height:'100vh', overflow:'hidden', fontFamily:'DM Sans, sans-serif' }}>
      <Sidebar active="patientAppts" />

      <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>
        <div style={{ flex:1, overflowY:'auto', padding:24, background:SURFACE }}>

          {/* Header */}
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:22, flexWrap:'wrap', gap:10 }}>
            <div>
              <div style={{ fontSize:20, fontWeight:700, color:NAVY }}>My Appointments</div>
              <div style={{ fontSize:13, color:MUTED, marginTop:2 }}>
                {counts.TODAY} today · {counts.UPCOMING} upcoming · {counts.COMPLETED} completed
              </div>
            </div>
            <button onClick={() => router.push('/patient/appointments/book')}
              style={{ padding:'9px 18px', background:BLUE, color:'white', border:'none', borderRadius:9, fontSize:13, fontWeight:600, cursor:'pointer' }}>
              + Book Appointment
            </button>
          </div>

          {/* Filter tabs */}
          <div style={{ display:'flex', gap:8, marginBottom:18, flexWrap:'wrap' }}>
            {[
              { key:'ALL',       label:'All'         },
              { key:'TODAY',     label:'📅 Today'    },
              { key:'UPCOMING',  label:'🔜 Upcoming' },
              { key:'COMPLETED', label:'✅ Completed' },
              { key:'CANCELLED', label:'❌ Cancelled' },
            ].map(f => (
              <button key={f.key} onClick={() => setFilter(f.key)}
                style={{ padding:'7px 16px', borderRadius:9, border:`1px solid ${filter===f.key?BLUE:BORDER}`, background:filter===f.key?BLUE_P:'white', color:filter===f.key?BLUE:MUTED, fontSize:12.5, fontWeight:filter===f.key?700:400, cursor:'pointer' }}>
                {f.label}
                <span style={{ marginLeft:5, fontSize:11, opacity:0.7 }}>({counts[f.key]})</span>
              </button>
            ))}
          </div>

          {/* Appointment list */}
          <div style={{ background:'white', borderRadius:14, border:`1px solid ${BORDER}`, overflow:'hidden' }}>
            {loading ? (
              <div style={{ padding:48, textAlign:'center', color:MUTED }}>Loading appointments…</div>
            ) : filtered.length === 0 ? (
              <div style={{ padding:48, textAlign:'center', color:MUTED }}>
                <div style={{ fontSize:32, marginBottom:12 }}>📅</div>
                <div style={{ fontSize:14, fontWeight:600, color:'#374151', marginBottom:10 }}>
                  No {filter==='ALL'?'':filter.toLowerCase()} appointments
                </div>
                {filter === 'UPCOMING' && (
                  <button onClick={() => router.push('/patient/appointments/book')}
                    style={{ padding:'9px 18px', background:BLUE, color:'white', border:'none', borderRadius:9, fontSize:13, fontWeight:600, cursor:'pointer' }}>
                    Book Now
                  </button>
                )}
              </div>
            ) : (
              filtered.map((a, i) => {
                const d       = new Date(a.scheduledAt);
                const isToday = d.toDateString() === todayStr;
                const docName = a.doctor ? `Dr. ${a.doctor.firstName} ${a.doctor.lastName}` : 'Doctor';
                const docInit = a.doctor ? `${a.doctor.firstName?.[0]||''}${a.doctor.lastName?.[0]||''}` : 'DR';

                return (
                  <div key={a.id} style={{ display:'flex', alignItems:'center', gap:14, padding:'14px 20px', borderBottom: i<filtered.length-1?`1px solid ${BORDER}`:'none', background:isToday?BLUE_P+'44':'white', transition:'background 0.15s' }}>

                    {/* Date badge */}
                    <div style={{ width:52, textAlign:'center', background:isToday?BLUE:BLUE_P, borderRadius:10, padding:'7px 4px', flexShrink:0 }}>
                      <div style={{ fontSize:20, fontWeight:700, color:isToday?'white':BLUE, lineHeight:1 }}>{d.getDate()}</div>
                      <div style={{ fontSize:9, fontFamily:'monospace', color:isToday?'rgba(255,255,255,0.8)':BLUE }}>{d.toLocaleString('default',{month:'short'}).toUpperCase()}</div>
                      {isToday && <div style={{ fontSize:8, fontWeight:700, color:'rgba(255,255,255,0.9)', marginTop:2 }}>TODAY</div>}
                    </div>

                    {/* Doctor info */}
                    <div style={{ width:32, height:32, borderRadius:'50%', background:TEAL_P, color:TEAL, display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:700, flexShrink:0 }}>
                      {docInit.toUpperCase()}
                    </div>

                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:13, fontWeight:600, color:NAVY, marginBottom:2 }}>{docName}</div>
                      <div style={{ fontSize:11, color:MUTED }}>
                        {a.doctor?.specialty && `${a.doctor.specialty} · `}
                        {d.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',hour12:true})}
                        {a.type && ` · ${a.type.replace('_',' ')}`}
                      </div>
                      {a.reason && <div style={{ fontSize:11, color:MUTED, marginTop:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{a.reason}</div>}
                    </div>

                    {/* Status + actions */}
                    <div style={{ display:'flex', alignItems:'center', gap:8, flexShrink:0 }}>
                      <span style={sTag(a.status)}>{a.status.replace('_',' ')}</span>
                      {['SCHEDULED','CONFIRMED'].includes(a.status) && (
                        <button onClick={() => router.push('/patient/chat')}
                          style={{ padding:'5px 10px', background:BLUE_P, color:BLUE, border:`1px solid ${BLUE}30`, borderRadius:7, fontSize:11, fontWeight:600, cursor:'pointer' }}>
                          💬 Chat
                        </button>
                      )}
                      {a.status === 'COMPLETED' && (
                        <button onClick={() => router.push(`/patient/appointments/book?doctorId=${a.doctorId||a.doctor?.id||''}`)}
                          style={{ padding:'5px 10px', background:GREEN_P, color:GREEN, border:`1px solid ${GREEN}30`, borderRadius:7, fontSize:11, fontWeight:600, cursor:'pointer' }}>
                          ↺ Rebook
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {toast && <div style={{ position:'fixed', bottom:24, right:24, background:NAVY, color:'white', padding:'12px 20px', borderRadius:12, fontSize:13, zIndex:9999, boxShadow:'0 4px 20px rgba(0,0,0,0.2)', maxWidth:360 }}>{toast}</div>}
    </div>
  );
}


