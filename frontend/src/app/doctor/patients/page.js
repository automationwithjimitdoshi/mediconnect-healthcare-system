'use client';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
/**
 * src/app/doctor/patients/page.js
 * 
 * Shows only THIS doctor's patients (linked via appointments).
 * Returns empty state when no appointments exist — no static/demo data.
 * 
 * Data source: GET /api/doctor-data/patients
 * Patient detail: GET /api/doctor-data/patient/:id  
 */

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import DoctorSidebar from '@/components/DoctorSidebar';
import { getToken, getUser, clearSession } from '@/lib/auth';

const NAVY='#0c1a2e',BLUE='#1565c0',BLUE_P='#e3f0ff',RED='#c62828',RED_P='#fdecea',
      AMBER='#b45309',AMBER_P='#fff3e0',GREEN='#1b5e20',GREEN_P='#e8f5e9',
      TEAL='#00796b',TEAL_P='#e0f5f0',PURPLE='#6b21a8',
      BORDER='#e2e8f0',SURFACE='#f7f9fc',MUTED='#8896a7',SEC='#4a5568';
const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

const NAV = [
  { id:'doctorDashboard', label:'Dashboard',    icon:'⊞', href:'/doctor'              },
  { id:'doctorPatients',  label:'All Patients', icon:'👥', href:'/doctor/patients'     },
  { id:'doctorAppts',     label:'Appointments', icon:'📅', href:'/doctor/appointments' },
  { id:'doctorChat',      label:'Patient Chat', icon:'💬', href:'/doctor/chat',    badge:'_chat'   },
  { id:'doctorUpdates',   label:'Updates',      icon:'🔔', href:'/doctor/updates', badge:'_alerts' },
  { id:'doctorReports',   label:'Report Review',icon:'🔬', href:'/doctor/reports', badge:'PREMIUM' },
];

const URG_STYLE = {
  CRITICAL: { bg:RED_P,   color:RED,   border:'#f5c6cb',  bar:'#dc2626' },
  HIGH:     { bg:AMBER_P, color:AMBER, border:'#fde68a',  bar:'#f59e0b' },
  MEDIUM:   { bg:BLUE_P,  color:BLUE,  border:'#bfdbfe',  bar:'#3b82f6' },
  LOW:      { bg:GREEN_P, color:GREEN, border:'#bbf7d0',  bar:'#22c55e' },
};

const getAge  = dob => { if(!dob)return'—'; const d=new Date(dob),t=new Date(); let a=t.getFullYear()-d.getFullYear(); if(t.getMonth()<d.getMonth()||(t.getMonth()===d.getMonth()&&t.getDate()<d.getDate()))a--; return a; };
const fmtDate = iso => iso ? new Date(iso).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'}) : '—';

// ── Urgency badge ──────────────────────────────────────────────────────────────
function UrgBadge({ level }) {
  const s = URG_STYLE[level] || URG_STYLE.LOW;
  return (
    <span style={{fontSize:11,fontWeight:700,padding:'2px 8px',borderRadius:99,background:s.bg,color:s.color,border:`1px solid ${s.border}`}}>
      {level||'LOW'}
    </span>
  );
}

// ── Vitals display ─────────────────────────────────────────────────────────────
function VitalChip({ label, value }) {
  if (!value) return null;
  return (
    <div style={{fontSize:11.5,color:SEC}}>
      <span style={{color:MUTED,marginRight:3}}>{label}:</span>
      <strong style={{color:NAVY}}>{value}</strong>
    </div>
  );
}

// ── Patient card ───────────────────────────────────────────────────────────────
function PatientCard({ patient, onChat, onDetails, unread }) {
  const urg   = patient.urgencyLevel || 'LOW';
  const style = URG_STYLE[urg] || URG_STYLE.LOW;
  const name  = `${patient.firstName||''} ${patient.lastName||''}`.trim();
  const inits = `${patient.firstName?.[0]||''}${patient.lastName?.[0]||''}`.toUpperCase()||'?';
  const age   = getAge(patient.dateOfBirth);
  const vital = patient.vitals?.[0];
  const conds = (patient.conditions||[]).map(c=>c.condition||c).filter(Boolean);

  return (
    <div style={{background:'white',borderRadius:14,border:`1px solid ${BORDER}`,overflow:'hidden',display:'flex',marginBottom:10}}>
      {/* Urgency bar */}
      <div style={{width:5,background:style.bar,flexShrink:0}}/>

      <div style={{flex:1,padding:'14px 18px',display:'flex',gap:16,alignItems:'center'}}>
        {/* Avatar + unread */}
        <div style={{position:'relative',flexShrink:0}}>
          <div style={{width:46,height:46,borderRadius:'50%',background:style.bg,color:style.color,display:'flex',alignItems:'center',justifyContent:'center',fontSize:14,fontWeight:700}}>
            {inits}
          </div>
          {unread>0&&<div style={{position:'absolute',top:-4,right:-4,width:18,height:18,borderRadius:'50%',background:RED,color:'white',fontSize:9,fontWeight:700,display:'flex',alignItems:'center',justifyContent:'center',border:'2px solid white'}}>{unread}</div>}
        </div>

        {/* Main info */}
        <div style={{flex:1,minWidth:0}}>
          <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:4,flexWrap:'wrap'}}>
            <span style={{fontSize:15,fontWeight:700,color:NAVY}}>{name}</span>
            <UrgBadge level={urg}/>
            {unread>0&&<span style={{fontSize:11,color:RED,fontWeight:600}}>● {unread} new</span>}
          </div>
          <div style={{fontSize:12.5,color:MUTED,marginBottom:5}}>
            {age!=='—'?`${age}y · `:''}{patient.gender||''}{patient.bloodType?` · ${patient.bloodType}`:''}{patient.phone?` · ${patient.phone}`:''}
          </div>
          {conds.length>0&&(
            <div style={{fontSize:12,color:SEC,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
              {conds.slice(0,3).join(' · ')}
            </div>
          )}
        </div>

        {/* Vitals */}
        {vital&&(
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'3px 16px',flexShrink:0}}>
            <VitalChip label="BP"   value={vital.bp}/>
            <VitalChip label="HR"   value={vital.pulse?`${vital.pulse} bpm`:null}/>
            <VitalChip label="Sp02" value={vital.oxygenSat?`${vital.oxygenSat}%`:null}/>
            <VitalChip label="Temp" value={vital.temperature?`${vital.temperature}°C`:null}/>
          </div>
        )}

        {/* Actions */}
        <div style={{display:'flex',gap:8,flexShrink:0}}>
          <button onClick={()=>onDetails(patient)}
            style={{padding:'7px 16px',background:SURFACE,color:SEC,border:`1px solid ${BORDER}`,borderRadius:9,fontSize:12.5,fontWeight:600,cursor:'pointer'}}>
            Details
          </button>
          <button onClick={()=>onChat(patient)}
            style={{padding:'7px 16px',background:BLUE,color:'white',border:'none',borderRadius:9,fontSize:12.5,fontWeight:600,cursor:'pointer',display:'flex',alignItems:'center',gap:5}}>
            💬 Chat
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Patient detail panel ───────────────────────────────────────────────────────
function PatientDetail({ patient, onClose, token, router }) {
  const name  = `${patient.firstName||''} ${patient.lastName||''}`.trim();
  const age   = getAge(patient.dateOfBirth);
  const vital = patient.vitals?.[0];
  const conds = (patient.conditions||[]).map(c=>c.condition||c).filter(Boolean);
  const meds  = (patient.medications||[]).map(m=>`${m.name}${m.dose?` ${m.dose}`:''}`);
  const allgs = (patient.allergies||[]).map(a=>a.allergen||a);

  return (
    <div onClick={e=>{if(e.target===e.currentTarget)onClose();}}
      style={{position:'fixed',inset:0,background:'rgba(12,26,46,0.55)',zIndex:200,display:'flex',alignItems:'center',justifyContent:'flex-end'}}>
      <div style={{width:420,height:'100vh',background:'white',overflowY:'auto',boxShadow:'-4px 0 32px rgba(0,0,0,0.2)',display:'flex',flexDirection:'column',fontFamily:'DM Sans, sans-serif'}}>
        {/* Header */}
        <div style={{background:NAVY,padding:'20px 20px 16px',flexShrink:0}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14}}>
            <div style={{fontSize:10,color:'rgba(255,255,255,0.4)',fontFamily:'monospace',letterSpacing:'0.1em'}}>PATIENT DETAILS</div>
            <button onClick={onClose} style={{background:'rgba(255,255,255,0.1)',border:'none',color:'white',width:28,height:28,borderRadius:'50%',cursor:'pointer',fontSize:16}}>×</button>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:14}}>
            <div style={{width:52,height:52,borderRadius:'50%',background:BLUE_P,color:BLUE,display:'flex',alignItems:'center',justifyContent:'center',fontSize:18,fontWeight:700}}>
              {`${patient.firstName?.[0]||''}${patient.lastName?.[0]||''}`.toUpperCase()||'?'}
            </div>
            <div>
              <div style={{fontSize:17,fontWeight:700,color:'white',marginBottom:2}}>{name}</div>
              <div style={{fontSize:12,color:'rgba(255,255,255,0.6)'}}>
                {age!=='—'?`${age} yrs · `:''}{patient.gender||''}{patient.bloodType?` · ${patient.bloodType}`:''}
              </div>
              {patient.phone&&<div style={{fontSize:11,color:'rgba(255,255,255,0.5)',marginTop:2}}>📱 {patient.phone}</div>}
            </div>
          </div>
        </div>

        {/* Content */}
        <div style={{flex:1,overflowY:'auto',padding:20,display:'flex',flexDirection:'column',gap:16}}>

          {/* Action buttons */}
          <div style={{display:'flex',gap:10}}>
            <button onClick={()=>{onClose();router.push(`/doctor/chat?patientId=${patient.id}`);}}
              style={{flex:1,padding:'10px',background:BLUE,color:'white',border:'none',borderRadius:10,fontSize:13,fontWeight:700,cursor:'pointer'}}>
              💬 Open Chat
            </button>
            <button onClick={()=>{onClose();router.push(`/doctor/reports?patientId=${patient.id}`);}}
              style={{flex:1,padding:'10px',background:PURPLE,color:'white',border:'none',borderRadius:10,fontSize:13,fontWeight:700,cursor:'pointer'}}>
              🔬 Reports
            </button>
          </div>

          {/* Latest vitals */}
          {vital&&(
            <div>
              <div style={{fontSize:11.5,fontWeight:700,color:MUTED,textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:8}}>Latest Vitals · {fmtDate(vital.recordedAt)}</div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
                {[
                  {label:'Blood Pressure', value:vital.bp,          unit:'mmHg'},
                  {label:'Heart Rate',     value:vital.pulse?`${vital.pulse}`:null, unit:'bpm'},
                  {label:'SpO₂',           value:vital.oxygenSat?`${vital.oxygenSat}`:null, unit:'%'},
                  {label:'Temperature',    value:vital.temperature?`${vital.temperature}`:null, unit:'°C'},
                  {label:'Weight',         value:vital.weight?`${vital.weight}`:null, unit:'kg'},
                  {label:'Height',         value:vital.height?`${vital.height}`:null, unit:'cm'},
                ].filter(v=>v.value).map(v=>(
                  <div key={v.label} style={{background:SURFACE,borderRadius:9,padding:'10px 12px',border:`1px solid ${BORDER}`}}>
                    <div style={{fontSize:11,color:MUTED,marginBottom:3}}>{v.label}</div>
                    <div style={{fontSize:16,fontWeight:700,color:NAVY}}>{v.value} <span style={{fontSize:11,fontWeight:400,color:MUTED}}>{v.unit}</span></div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Conditions */}
          {conds.length>0&&(
            <div>
              <div style={{fontSize:11.5,fontWeight:700,color:MUTED,textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:8}}>Conditions</div>
              <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
                {conds.map(c=><span key={c} style={{fontSize:12,background:AMBER_P,color:AMBER,padding:'3px 10px',borderRadius:99,border:'1px solid #fde68a'}}>{c}</span>)}
              </div>
            </div>
          )}

          {/* Medications */}
          {meds.length>0&&(
            <div>
              <div style={{fontSize:11.5,fontWeight:700,color:MUTED,textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:8}}>Active Medications</div>
              <div style={{display:'flex',flexDirection:'column',gap:5}}>
                {meds.map((m,i)=><div key={i} style={{fontSize:12.5,color:SEC,padding:'6px 10px',background:BLUE_P,borderRadius:7}}>💊 {m}</div>)}
              </div>
            </div>
          )}

          {/* Allergies */}
          {allgs.length>0&&(
            <div>
              <div style={{fontSize:11.5,fontWeight:700,color:MUTED,textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:8}}>Allergies</div>
              <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
                {allgs.map(a=><span key={a} style={{fontSize:12,background:RED_P,color:RED,padding:'3px 10px',borderRadius:99,border:'1px solid #f5c6cb'}}>⚠️ {a}</span>)}
              </div>
            </div>
          )}

          {/* Date of birth / member since */}
          <div style={{background:SURFACE,borderRadius:10,padding:'12px 14px',border:`1px solid ${BORDER}`}}>
            {patient.dateOfBirth&&<div style={{fontSize:12.5,color:SEC,marginBottom:4}}>🎂 DOB: {fmtDate(patient.dateOfBirth)}</div>}
            {patient.address&&<div style={{fontSize:12.5,color:SEC,marginBottom:4}}>📍 {patient.address}</div>}
            <div style={{fontSize:12,color:MUTED}}>🗓 Patient since: {fmtDate(patient.createdAt)}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function DoctorPatientsPage() {
  const router = useRouter();
  const [mounted,   setMounted]   = useState(false);
  const [patients,  setPatients]  = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [search,    setSearch]    = useState('');
  const [urgFilter, setUrgFilter] = useState('ALL');
  const [selPat,    setSelPat]    = useState(null);
  const [unreadMap, setUnreadMap] = useState({});

  const token = useCallback(()=>localStorage.getItem('mc_token')||'', []);

  useEffect(() => {
    setMounted(true);
    const u = localStorage.getItem('mc_user');
    if (!u) { router.push('/login'); return; }
    if (JSON.parse(u).role !== 'DOCTOR') { router.push('/'); return; }
    fetchAll();
  }, []);

  async function fetchAll() {
    setLoading(true);
    const tok = token();
    const h   = { Authorization: `Bearer ${tok}` };

    // Load patients + unread counts in parallel
    const [patsRes, roomsRes] = await Promise.allSettled([
      fetch(`${API}/doctor-data/patients`, { headers: h }).then(r=>r.ok?r.json():null),
      fetch(`${API}/chat/rooms?limit=100`,  { headers: h }).then(r=>r.ok?r.json():null),
    ]);

    const pats  = patsRes.value?.data  || [];
    const rooms = roomsRes.value?.data || [];

    // Build unread map: patientId → unread count
    const unread = {};
    for (const room of rooms) {
      const p = room.patient || room.appointment?.patient;
      if (p?.id && (room.unreadCount||0) > 0) unread[p.id] = (unread[p.id]||0) + room.unreadCount;
    }
    setUnreadMap(unread);

    // Sort: unread first, then by urgency (CRITICAL > HIGH > MEDIUM > LOW)
    const urgOrder = { CRITICAL:0, HIGH:1, MEDIUM:2, LOW:3 };
    pats.sort((a, b) => {
      const aUnread = unread[a.id] || 0;
      const bUnread = unread[b.id] || 0;
      if (aUnread > 0 && bUnread === 0) return -1;
      if (bUnread > 0 && aUnread === 0) return 1;
      const aUrg = urgOrder[a.urgencyLevel] ?? 3;
      const bUrg = urgOrder[b.urgencyLevel] ?? 3;
      if (aUrg !== bUrg) return aUrg - bUrg;
      return (a.firstName||'').localeCompare(b.firstName||'');
    });

    setPatients(pats);
    setLoading(false);
  }

  // Filter
  const filtered = patients.filter(p => {
    const name  = `${p.firstName||''} ${p.lastName||''}`.toLowerCase();
    const phone = (p.phone||'').toLowerCase();
    const conds = (p.conditions||[]).map(c=>(c.condition||c).toLowerCase()).join(' ');
    const matchSearch = !search || name.includes(search.toLowerCase()) ||
                        phone.includes(search.toLowerCase()) || conds.includes(search.toLowerCase());
    const matchUrg = urgFilter === 'ALL' || (p.urgencyLevel||'LOW') === urgFilter;
    return matchSearch && matchUrg;
  });

  const urgCounts = {
    CRITICAL: patients.filter(p=>p.urgencyLevel==='CRITICAL').length,
    HIGH:     patients.filter(p=>p.urgencyLevel==='HIGH').length,
    MEDIUM:   patients.filter(p=>p.urgencyLevel==='MEDIUM').length,
    LOW:      patients.filter(p=>!p.urgencyLevel||p.urgencyLevel==='LOW').length,
  };

  
  if(!mounted) return <div style={{display:'flex',height:'100vh',background:'#f7f9fc'}}/>;
  return (
    <div style={{display:'flex',height:'100vh',overflow:'hidden',fontFamily:'DM Sans, sans-serif'}}>
      <DoctorSidebar active="doctorPatients"/>

      <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden',background:SURFACE}}>
        {/* Header */}
        <div style={{background:'white',borderBottom:`1px solid ${BORDER}`,padding:'16px 28px',display:'flex',alignItems:'center',justifyContent:'space-between',flexShrink:0}}>
          <div>
            <div style={{fontSize:19,fontWeight:700,color:NAVY}}>All Patients</div>
            <div style={{fontSize:13,color:MUTED,marginTop:2}}>
              {loading ? 'Loading…' : `${patients.length} patient${patients.length!==1?'s':''} in your panel`}
            </div>
          </div>
          <button onClick={()=>router.push('/doctor')}
            style={{padding:'8px 16px',background:SURFACE,color:SEC,border:`1px solid ${BORDER}`,borderRadius:9,fontSize:13,fontWeight:600,cursor:'pointer'}}>
            ← Dashboard
          </button>
        </div>

        {/* Search + filters */}
        <div style={{background:'white',borderBottom:`1px solid ${BORDER}`,padding:'12px 28px',display:'flex',gap:12,alignItems:'center',flexShrink:0,flexWrap:'wrap'}}>
          <div style={{flex:1,minWidth:240,display:'flex',alignItems:'center',gap:10,background:SURFACE,borderRadius:10,padding:'8px 14px',border:`1px solid ${BORDER}`}}>
            <span style={{color:MUTED}}>🔍</span>
            <input value={search} onChange={e=>setSearch(e.target.value)}
              placeholder="Search by name, condition, or phone…"
              style={{flex:1,border:'none',background:'transparent',fontSize:13,outline:'none',fontFamily:'DM Sans, sans-serif',color:NAVY}}/>
            {search&&<button onClick={()=>setSearch('')} style={{background:'none',border:'none',cursor:'pointer',color:MUTED,fontSize:14}}>×</button>}
          </div>
          <div style={{display:'flex',gap:6}}>
            {['ALL','CRITICAL','HIGH','MEDIUM','LOW'].map(u=>{
              const s   = URG_STYLE[u];
              const cnt = u==='ALL'?patients.length:urgCounts[u]||0;
              const isA = urgFilter===u;
              return(
                <button key={u} onClick={()=>setUrgFilter(u)}
                  style={{padding:'7px 14px',borderRadius:8,border:`1px solid ${isA?(s?.border||BLUE):BORDER}`,
                    background:isA?(s?.bg||BLUE_P):'white',color:isA?(s?.color||BLUE):MUTED,
                    fontSize:12.5,fontWeight:isA?700:400,cursor:'pointer',display:'flex',alignItems:'center',gap:5}}>
                  {u}
                  {cnt>0&&<span style={{fontSize:10,opacity:0.7}}>({cnt})</span>}
                </button>
              );
            })}
          </div>
        </div>

        {/* Patient list */}
        <div style={{flex:1,overflowY:'auto',padding:'20px 28px'}}>
          {loading&&(
            <div style={{textAlign:'center',padding:64,color:MUTED}}>
              <div style={{fontSize:36,marginBottom:12}}>⏳</div>
              <div style={{fontSize:14}}>Loading your patients…</div>
            </div>
          )}

          {!loading&&patients.length===0&&(
            <div style={{textAlign:'center',padding:64,background:'white',borderRadius:16,border:`1px solid ${BORDER}`}}>
              <div style={{fontSize:52,marginBottom:16}}>👥</div>
              <div style={{fontSize:18,fontWeight:700,color:NAVY,marginBottom:8}}>No patients yet</div>
              <div style={{fontSize:14,color:MUTED,maxWidth:380,margin:'0 auto 24px',lineHeight:1.7}}>
                Patients appear here after they book an appointment with you and you confirm it. Once confirmed, you can view their history, vitals, and reports here.
              </div>
              <button onClick={()=>router.push('/doctor/appointments')}
                style={{padding:'11px 28px',background:BLUE,color:'white',border:'none',borderRadius:10,fontSize:14,fontWeight:700,cursor:'pointer'}}>
                📅 View Appointments
              </button>
            </div>
          )}

          {!loading&&patients.length>0&&filtered.length===0&&(
            <div style={{textAlign:'center',padding:48,color:MUTED,fontSize:14}}>
              No patients match your search or filter.
            </div>
          )}

          {!loading&&filtered.map(p=>(
            <PatientCard
              key={p.id}
              patient={p}
              unread={unreadMap[p.id]||0}
              onChat={pat=>router.push(`/doctor/chat?patientId=${pat.id}`)}
              onDetails={setSelPat}
            />
          ))}
        </div>
      </div>

      {/* Detail panel */}
      {selPat&&(
        <PatientDetail
          patient={selPat}
          token={token}
          router={router}
          onClose={()=>setSelPat(null)}
        />
      )}
    </div>
  );
}