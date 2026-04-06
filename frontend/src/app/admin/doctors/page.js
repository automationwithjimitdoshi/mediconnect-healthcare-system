'use client';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
/**
 * src/app/admin/doctors/page.js
 * Smart Doctor Verification Admin Panel
 * Access: /admin/doctors
 */
import { useState, useEffect } from 'react';

const API  = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';
const NAVY = '#0c1a2e', BLUE = '#1565c0', BLUE_P = '#e3f0ff';
const RED  = '#c62828', RED_P = '#fdecea';
const GREEN = '#1b5e20', GREEN_P = '#e8f5e9';
const AMBER = '#b45309', AMBER_P = '#fff3e0';
const PURPLE = '#7c3aed', PURPLE_P = '#f5f3ff';
const BORDER = '#e2e8f0', SURFACE = '#f7f9fc', MUTED = '#8896a7';

// ── Credential confidence scorer ──────────────────────────────────────────────
function scoreCredentials(doc) {
  let score = 0;
  const flags = [];
  const positives = [];

  // MRN format check
  const mrn = doc.mrn || '';
  if (/^[A-Z]{2,3}\/\d{4,8}$/.test(mrn)) {
    score += 30; positives.push('MRN format valid');
  } else if (/^\d{5,8}$/.test(mrn)) {
    score += 20; positives.push('Numeric MRN');
  } else if (mrn && mrn !== '—') {
    score += 10; flags.push('MRN format unusual');
  } else {
    flags.push('No MRN provided');
  }

  // SMC provided
  if (doc.smc && doc.smc !== '—') { score += 15; positives.push('SMC specified'); }
  else flags.push('No SMC selected');

  // Qualification check
  const qual = (doc.qualification || '').toUpperCase();
  const validQuals = ['MBBS','MD','MS','DNB','DM','MCH','BDS','MDS','BAMS','BHMS'];
  if (validQuals.some(q => qual.includes(q))) { score += 20; positives.push('Recognised qualification'); }
  else { flags.push('Qualification not standard'); }

  // Hospital provided
  if (doc.hospital && doc.hospital.length > 3) { score += 10; positives.push('Hospital listed'); }
  else flags.push('No hospital provided');

  // Registration year plausibility
  const yr = parseInt(doc.regYear);
  const currentYear = new Date().getFullYear();
  if (yr >= 1980 && yr <= currentYear) { score += 10; positives.push('Valid registration year'); }
  else if (doc.regYear && doc.regYear !== '—') flags.push('Unusual registration year');

  // Email domain check
  const email = (doc.email || '').toLowerCase();
  const trustedDomains = ['aiims.edu','gov.in','nmc.org.in','apollo.com','fortishealthcare.com','manipalhospitals.com','narayanahealth.org','medanta.org'];
  if (trustedDomains.some(d => email.endsWith(d))) {
    score += 15; positives.push('Institutional email');
  } else if (email.includes('gmail') || email.includes('yahoo') || email.includes('hotmail')) {
    flags.push('Personal email (manual verification needed)');
  }

  // Phone provided
  if (doc.phone && doc.phone.replace(/\D/g,'').length >= 10) { score += 5; positives.push('Phone provided'); }

  // Clamp score
  score = Math.min(100, Math.max(0, score));

  const risk = score >= 75 ? 'LOW' : score >= 50 ? 'MEDIUM' : 'HIGH';
  return { score, risk, flags, positives };
}

function ScoreBadge({ score, risk }) {
  const colors = { LOW: [GREEN, GREEN_P], MEDIUM: [AMBER, AMBER_P], HIGH: [RED, RED_P] };
  const [c, bg] = colors[risk] || [MUTED, SURFACE];
  return (
    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
      <div style={{ position:'relative', width:52, height:52, flexShrink:0 }}>
        <svg width="52" height="52" viewBox="0 0 52 52">
          <circle cx="26" cy="26" r="22" fill="none" stroke={BORDER} strokeWidth="4"/>
          <circle cx="26" cy="26" r="22" fill="none" stroke={c} strokeWidth="4"
            strokeDasharray={`${(score/100)*138} 138`}
            strokeLinecap="round"
            transform="rotate(-90 26 26)"/>
        </svg>
        <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:800, color:c }}>{score}</div>
      </div>
      <div>
        <div style={{ fontSize:11, fontWeight:700, color:c }}>{risk} RISK</div>
        <div style={{ fontSize:10, color:MUTED }}>Confidence score</div>
      </div>
    </div>
  );
}

export default function AdminDoctorsPage() {
  const [adminKey,     setAdminKey]     = useState('mediconnect-admin-2024');
  const [tab,          setTab]          = useState('pending');
  const [doctors,      setDoctors]      = useState([]);
  const [pending,      setPending]      = useState([]);
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState('');
  const [search,       setSearch]       = useState('');
  const [toast,        setToast]        = useState('');
  const [rejectModal,  setRejectModal]  = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [confirmDel,   setConfirmDel]   = useState(null);
  const [actionBusy,   setActionBusy]   = useState('');
  const [expanded,     setExpanded]     = useState(null); // expanded doctor card id

  const showToast = (msg, ms=4000) => { setToast(msg); setTimeout(()=>setToast(''), ms); };
  const headers   = () => ({ 'x-admin-secret': adminKey, 'Content-Type': 'application/json' });

  async function loadAll() {
    setLoading(true); setError('');
    try {
      const [allRes, pendRes] = await Promise.all([
        fetch(`${API}/auth/admin/all-doctors`,     { headers: headers() }),
        fetch(`${API}/auth/admin/pending-doctors`, { headers: headers() }),
      ]);
      if (allRes.status === 403) { setError('❌ Wrong admin key.'); setLoading(false); return; }
      const allData  = allRes.ok  ? await allRes.json()  : { data: [] };
      const pendData = pendRes.ok ? await pendRes.json() : { data: [] };
      setDoctors(allData.data  || []);
      setPending(pendData.data || []);
    } catch { setError('❌ Network error — is the backend running?'); }
    setLoading(false);
  }

  async function approveDoctor(doctorId, name) {
    setActionBusy(doctorId);
    try {
      const r = await fetch(`${API}/auth/admin/approve-doctor`, { method:'POST', headers:headers(), body:JSON.stringify({ doctorId }) });
      const d = await r.json();
      if (r.ok && d.success) { showToast('✅ Dr. '+name+' approved — account is now active'); await loadAll(); }
      else showToast('❌ '+(d.error||'Failed'));
    } catch { showToast('❌ Network error'); }
    setActionBusy('');
  }

  async function rejectDoctor() {
    if (!rejectModal) return;
    setActionBusy(rejectModal.doctorId);
    try {
      const r = await fetch(`${API}/auth/admin/reject-doctor`, {
        method:'POST', headers:headers(),
        body:JSON.stringify({ doctorId:rejectModal.doctorId, reason:rejectReason.trim()||'Credentials could not be verified' }),
      });
      const d = await r.json();
      if (r.ok && d.success) { showToast('⛔ '+rejectModal.name+' rejected'); setRejectModal(null); setRejectReason(''); await loadAll(); }
      else showToast('❌ '+(d.error||'Failed'));
    } catch { showToast('❌ Network error'); }
    setActionBusy('');
  }

  async function deleteDoctor(doc) {
    setActionBusy(doc.doctorId); setConfirmDel(null);
    try {
      const r = await fetch(`${API}/doctor-data/delete-account`, {
        method:'DELETE', headers:{ 'x-admin-key':adminKey, 'Content-Type':'application/json' },
        body:JSON.stringify({ doctorId:doc.doctorId }),
      });
      const d = await r.json();
      if (r.ok && d.success) { showToast('🗑 '+doc.name+' deleted'); await loadAll(); }
      else showToast('❌ '+(d.message||'Failed'));
    } catch { showToast('❌ Network error'); }
    setActionBusy('');
  }

  const filtered = doctors.filter(d =>
    !search ||
    (d.name||'').toLowerCase().includes(search.toLowerCase()) ||
    (d.email||'').toLowerCase().includes(search.toLowerCase()) ||
    (d.specialty||'').toLowerCase().includes(search.toLowerCase()) ||
    (d.mrn||'').toLowerCase().includes(search.toLowerCase())
  );

  const statusBadge = (status, isActive) => {
    if (status === 'PENDING_REVIEW') return { label:'⏳ PENDING', bg:AMBER_P, color:AMBER };
    if (status === 'REJECTED')        return { label:'⛔ REJECTED', bg:RED_P,   color:RED   };
    if (!isActive)                    return { label:'🔒 INACTIVE', bg:RED_P,   color:RED   };
    return { label:'✅ ACTIVE', bg:GREEN_P, color:GREEN };
  };

  return (
    <div style={{ minHeight:'100vh', background:SURFACE, fontFamily:'DM Sans, sans-serif' }}>

      {/* Header */}
      <div style={{ background:NAVY, padding:'16px 32px', display:'flex', alignItems:'center', gap:16 }}>
        <div style={{ fontSize:18, fontWeight:700, color:'white' }}>⚕️ MediConnect — Doctor Verification Panel</div>
        <div style={{ marginLeft:'auto', fontSize:12, color:'rgba(255,255,255,0.4)' }}>Admin only</div>
      </div>

      <div style={{ maxWidth:960, margin:'0 auto', padding:'28px 20px' }}>

        {/* Admin key input */}
        <div style={{ background:'white', border:`1px solid ${BORDER}`, borderRadius:14, padding:'18px 20px', marginBottom:22, display:'flex', gap:12, alignItems:'center' }}>
          <span style={{ fontSize:13, fontWeight:600, color:MUTED, flexShrink:0 }}>🔑 Admin Key:</span>
          <input type="password" value={adminKey} onChange={e=>setAdminKey(e.target.value)}
            placeholder="ADMIN_SECRET from Railway Variables"
            style={{ flex:1, padding:'8px 12px', border:`1px solid ${BORDER}`, borderRadius:8, fontSize:13, outline:'none', fontFamily:'DM Sans, sans-serif' }}/>
          <button onClick={loadAll} disabled={loading||!adminKey.trim()}
            style={{ padding:'9px 22px', background:BLUE, color:'white', border:'none', borderRadius:9, fontSize:13, fontWeight:700, cursor:'pointer', flexShrink:0 }}>
            {loading?'⏳ Loading…':'🔄 Load Doctors'}
          </button>
        </div>

        {error && <div style={{ background:RED_P, border:`1px solid ${RED}30`, borderRadius:10, padding:'12px 16px', marginBottom:18, fontSize:13, color:RED }}>{error}</div>}

        {/* Stats */}
        {doctors.length > 0 && (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:14, marginBottom:22 }}>
            {[
              { label:'Total Doctors',  value:doctors.length,                                                  color:NAVY,   icon:'👨‍⚕️' },
              { label:'Active',         value:doctors.filter(d=>d.isActive&&d.status==='APPROVED').length,     color:GREEN,  icon:'✅' },
              { label:'Pending Review', value:pending.length,                                                  color:AMBER,  icon:'⏳' },
              { label:'Rejected',       value:doctors.filter(d=>d.status==='REJECTED').length,                 color:RED,    icon:'⛔' },
            ].map(s => (
              <div key={s.label} style={{ background:'white', border:`1px solid ${BORDER}`, borderRadius:12, padding:'16px 18px', display:'flex', alignItems:'center', gap:12 }}>
                <div style={{ fontSize:28 }}>{s.icon}</div>
                <div>
                  <div style={{ fontSize:26, fontWeight:800, color:s.color }}>{s.value}</div>
                  <div style={{ fontSize:12, color:MUTED }}>{s.label}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Tabs */}
        {doctors.length > 0 && (
          <div style={{ display:'flex', marginBottom:18, background:'white', borderRadius:10, border:`1px solid ${BORDER}`, overflow:'hidden' }}>
            {[
              { key:'pending', label:`⏳ Pending Review (${pending.length})` },
              { key:'all',     label:`👨‍⚕️ All Doctors (${doctors.length})`   },
            ].map(t => (
              <button key={t.key} onClick={()=>setTab(t.key)}
                style={{ flex:1, padding:'12px', border:'none', cursor:'pointer', fontSize:13.5, fontWeight:600,
                  background:tab===t.key?BLUE:'white', color:tab===t.key?'white':MUTED,
                  borderRight:t.key==='pending'?`1px solid ${BORDER}`:'none' }}>
                {t.label}
              </button>
            ))}
          </div>
        )}

        {/* ── PENDING TAB ── */}
        {tab==='pending' && doctors.length > 0 && (
          <div>
            {pending.length === 0 ? (
              <div style={{ background:'white', border:`1px solid ${BORDER}`, borderRadius:14, padding:'60px 24px', textAlign:'center' }}>
                <div style={{ fontSize:48, marginBottom:12 }}>✅</div>
                <div style={{ fontSize:16, fontWeight:700, color:NAVY }}>No doctors pending review</div>
                <div style={{ fontSize:13, color:MUTED, marginTop:6 }}>All registrations have been reviewed.</div>
              </div>
            ) : pending.map(doc => {
              const cred   = scoreCredentials(doc);
              const isOpen = expanded === doc.doctorId;
              return (
                <div key={doc.doctorId} style={{ background:'white', border:`2px solid ${cred.risk==='HIGH'?RED:cred.risk==='MEDIUM'?AMBER:BLUE}30`, borderRadius:14, padding:'20px 22px', marginBottom:16, boxShadow:'0 2px 12px rgba(0,0,0,0.06)' }}>

                  {/* Top row */}
                  <div style={{ display:'flex', alignItems:'flex-start', gap:14, marginBottom:16 }}>
                    <div style={{ width:46, height:46, borderRadius:12, background:AMBER_P, color:AMBER, display:'flex', alignItems:'center', justifyContent:'center', fontSize:16, fontWeight:700, flexShrink:0 }}>
                      {(doc.name||'?').split(' ').filter(Boolean).slice(1,3).map(w=>w[0]).join('')||'DR'}
                    </div>
                    <div style={{ flex:1 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', marginBottom:4 }}>
                        <span style={{ fontSize:15, fontWeight:700, color:NAVY }}>{doc.name}</span>
                        <span style={{ fontSize:10, fontWeight:700, background:AMBER_P, color:AMBER, padding:'2px 8px', borderRadius:99 }}>⏳ PENDING REVIEW</span>
                      </div>
                      <div style={{ fontSize:12.5, color:MUTED }}>{doc.specialty} · {doc.hospital}</div>
                      <div style={{ fontSize:12, color:MUTED, marginTop:2 }}>📧 {doc.email} · 📱 {doc.phone}</div>
                      <div style={{ fontSize:11, color:MUTED, marginTop:1 }}>
                        Registered: {doc.registeredAt ? new Date(doc.registeredAt).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}) : '—'}
                      </div>
                    </div>
                    <ScoreBadge score={cred.score} risk={cred.risk}/>
                  </div>

                  {/* Smart analysis */}
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:14 }}>
                    {cred.positives.length > 0 && (
                      <div style={{ background:GREEN_P, border:`1px solid ${GREEN}20`, borderRadius:9, padding:'10px 12px' }}>
                        <div style={{ fontSize:10, fontWeight:700, color:GREEN, marginBottom:6, textTransform:'uppercase', letterSpacing:'0.06em' }}>✅ Positive signals</div>
                        {cred.positives.map((p,i) => <div key={i} style={{ fontSize:11.5, color:GREEN, marginBottom:2 }}>• {p}</div>)}
                      </div>
                    )}
                    {cred.flags.length > 0 && (
                      <div style={{ background:RED_P, border:`1px solid ${RED}20`, borderRadius:9, padding:'10px 12px' }}>
                        <div style={{ fontSize:10, fontWeight:700, color:RED, marginBottom:6, textTransform:'uppercase', letterSpacing:'0.06em' }}>⚠ Flags to verify</div>
                        {cred.flags.map((f,i) => <div key={i} style={{ fontSize:11.5, color:RED, marginBottom:2 }}>• {f}</div>)}
                      </div>
                    )}
                  </div>

                  {/* Credentials box */}
                  <div style={{ background:PURPLE_P, border:`1px solid #c4b5fd`, borderRadius:10, padding:'14px 16px', marginBottom:14 }}>
                    <div style={{ fontSize:11, fontWeight:700, color:PURPLE, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:10 }}>🏥 Submitted Credentials</div>
                    <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10 }}>
                      {[
                        { label:'MRN',             value:doc.mrn          },
                        { label:'State Med Council',value:doc.smc          },
                        { label:'Qualification',   value:doc.qualification },
                        { label:'Reg. Year',       value:doc.regYear       },
                        { label:'Hospital',        value:doc.hospital      },
                        { label:'Specialty',       value:doc.specialty     },
                      ].map(f => (
                        <div key={f.label}>
                          <div style={{ fontSize:10, color:PURPLE, fontWeight:600, textTransform:'uppercase', marginBottom:2 }}>{f.label}</div>
                          <div style={{ fontSize:12.5, fontWeight:600, color:NAVY, fontFamily: f.label==='MRN'?'monospace':undefined }}>{f.value||'—'}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Verification links */}
                  <div style={{ background:'#f0f9ff', border:'1px solid #bae6fd', borderRadius:8, padding:'10px 14px', marginBottom:14, fontSize:12, color:'#0c4a6e', lineHeight:1.7 }}>
                    💡 <strong>Verify:</strong>{' '}
                    <a href="https://www.nmc.org.in/information-desk/for-public/verify-doctor" target="_blank" rel="noopener noreferrer" style={{ color:BLUE, fontWeight:600 }}>NMC Website →</a>
                    {doc.smc && doc.smc !== '—' && <>{' · '}<a href={`https://www.google.com/search?q=${encodeURIComponent(doc.smc+' State Medical Council doctor verification')}`} target="_blank" rel="noopener noreferrer" style={{ color:BLUE, fontWeight:600 }}>{doc.smc} SMC →</a></>}
                    {' · '}
                    <a href={`https://www.google.com/search?q=Dr+${encodeURIComponent(doc.name||'')}+${encodeURIComponent(doc.hospital||'')}+${encodeURIComponent(doc.specialty||'')}`} target="_blank" rel="noopener noreferrer" style={{ color:BLUE, fontWeight:600 }}>Google Search →</a>
                  </div>

                  {/* AI recommendation */}
                  <div style={{ background: cred.risk==='LOW'?GREEN_P:cred.risk==='MEDIUM'?AMBER_P:RED_P,
                    border:`1px solid ${cred.risk==='LOW'?GREEN:cred.risk==='MEDIUM'?AMBER:RED}30`,
                    borderRadius:8, padding:'10px 14px', marginBottom:16, fontSize:12,
                    color:cred.risk==='LOW'?GREEN:cred.risk==='MEDIUM'?AMBER:RED, lineHeight:1.6 }}>
                    {cred.risk==='LOW' && '🟢 Low risk — credentials look complete and valid. Likely safe to approve after quick NMC check.'}
                    {cred.risk==='MEDIUM' && '🟡 Medium risk — some fields need manual verification. Check NMC website before approving.'}
                    {cred.risk==='HIGH' && '🔴 High risk — multiple missing or suspicious fields. Do not approve without thorough verification. Consider requesting additional documents.'}
                  </div>

                  {/* Action buttons */}
                  <div style={{ display:'flex', gap:10 }}>
                    <button onClick={()=>approveDoctor(doc.doctorId, doc.name)} disabled={actionBusy===doc.doctorId}
                      style={{ flex:1, padding:'11px', background:GREEN, color:'white', border:'none', borderRadius:9, fontSize:13.5, fontWeight:700, cursor:'pointer', opacity:actionBusy===doc.doctorId?0.6:1 }}>
                      {actionBusy===doc.doctorId?'⏳ Processing…':'✅ Approve — Activate Account'}
                    </button>
                    <button onClick={()=>{ setRejectModal(doc); setRejectReason(cred.flags.length?`Issues found: ${cred.flags.join(', ')}`:''); }}
                      disabled={actionBusy===doc.doctorId}
                      style={{ flex:1, padding:'11px', background:RED_P, color:RED, border:`1px solid ${RED}40`, borderRadius:9, fontSize:13.5, fontWeight:700, cursor:'pointer' }}>
                      ⛔ Reject — Decline Registration
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── ALL DOCTORS TAB ── */}
        {tab==='all' && doctors.length > 0 && (
          <div>
            <input type="text" value={search} onChange={e=>setSearch(e.target.value)}
              placeholder="🔍  Search by name, email, specialty or MRN…"
              style={{ width:'100%', padding:'11px 16px', border:`1px solid ${BORDER}`, borderRadius:10,
                fontSize:13, marginBottom:16, outline:'none', fontFamily:'DM Sans, sans-serif', boxSizing:'border-box' }}/>

            {filtered.map(doc => {
              const badge = statusBadge(doc.status, doc.isActive);
              const cred  = scoreCredentials(doc);
              return (
                <div key={doc.doctorId} style={{ background:'white', border:`1px solid ${BORDER}`, borderRadius:12, padding:'16px 18px', marginBottom:10 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:14 }}>
                    <div style={{ width:40, height:40, borderRadius:10, background:BLUE_P, color:BLUE, display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:700, flexShrink:0 }}>
                      {(doc.name||'?').split(' ').filter(Boolean).slice(1,3).map(w=>w[0]).join('')||'DR'}
                    </div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', marginBottom:2 }}>
                        <span style={{ fontSize:14, fontWeight:700, color:NAVY }}>{doc.name}</span>
                        <span style={{ fontSize:10, fontWeight:700, background:badge.bg, color:badge.color, padding:'2px 7px', borderRadius:99 }}>{badge.label}</span>
                      </div>
                      <div style={{ fontSize:12.5, color:MUTED }}>{doc.specialty} · {doc.hospital}</div>
                      <div style={{ fontSize:12, color:MUTED, marginTop:2, display:'flex', flexWrap:'wrap', gap:10 }}>
                        <span>📧 {doc.email}</span>
                        {doc.mrn && doc.mrn!=='—' && <span>🏥 <strong style={{ fontFamily:'monospace' }}>{doc.mrn}</strong></span>}
                        <span>📅 {doc.registeredAt?new Date(doc.registeredAt).toLocaleDateString('en-IN'):''}</span>
                      </div>
                    </div>

                    {/* Score pill */}
                    <div style={{ fontSize:11, fontWeight:700, padding:'4px 10px', borderRadius:99,
                      background:cred.risk==='LOW'?GREEN_P:cred.risk==='MEDIUM'?AMBER_P:RED_P,
                      color:cred.risk==='LOW'?GREEN:cred.risk==='MEDIUM'?AMBER:RED, flexShrink:0 }}>
                      {cred.score}/100
                    </div>

                    <div style={{ display:'flex', gap:8, flexShrink:0 }}>
                      {doc.status==='PENDING_REVIEW' && <>
                        <button onClick={()=>approveDoctor(doc.doctorId,doc.name)} disabled={actionBusy===doc.doctorId}
                          style={{ padding:'7px 14px', background:GREEN_P, color:GREEN, border:`1px solid ${GREEN}40`, borderRadius:7, fontSize:12, fontWeight:700, cursor:'pointer' }}>✅ Approve</button>
                        <button onClick={()=>{ setRejectModal(doc); setRejectReason(''); }}
                          style={{ padding:'7px 14px', background:RED_P, color:RED, border:`1px solid ${RED}40`, borderRadius:7, fontSize:12, fontWeight:700, cursor:'pointer' }}>⛔ Reject</button>
                      </>}
                      <button onClick={()=>setConfirmDel(doc)} disabled={actionBusy===doc.doctorId}
                        style={{ padding:'7px 14px', background:RED_P, color:RED, border:`1px solid ${RED}40`, borderRadius:7, fontSize:12, fontWeight:700, cursor:'pointer' }}>🗑 Delete</button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Empty state */}
        {doctors.length===0 && !loading && !error && (
          <div style={{ background:'white', border:`1px solid ${BORDER}`, borderRadius:14, padding:'64px 24px', textAlign:'center' }}>
            <div style={{ fontSize:40, marginBottom:12 }}>🩺</div>
            <div style={{ fontSize:16, fontWeight:700, color:NAVY, marginBottom:6 }}>Enter your admin key and click "Load Doctors"</div>
            <div style={{ fontSize:13, color:MUTED }}>Default key: <code style={{ background:SURFACE, padding:'2px 8px', borderRadius:4 }}>mediconnect-admin-2024</code></div>
          </div>
        )}
      </div>

      {/* Reject modal */}
      {rejectModal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(12,26,46,0.6)', zIndex:300, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
          <div style={{ background:'white', borderRadius:16, padding:'28px 28px', maxWidth:480, width:'100%', fontFamily:'DM Sans, sans-serif' }}>
            <div style={{ fontSize:17, fontWeight:700, color:NAVY, marginBottom:4 }}>⛔ Reject Doctor Registration</div>
            <div style={{ fontSize:13, color:MUTED, marginBottom:16 }}>{rejectModal.name} · MRN: {rejectModal.mrn||'—'}</div>
            <label style={{ display:'block', fontSize:12, fontWeight:600, color:MUTED, marginBottom:6, textTransform:'uppercase' }}>Rejection Reason (shown to doctor on login)</label>
            <textarea value={rejectReason} onChange={e=>setRejectReason(e.target.value)} rows={4}
              placeholder="e.g. MRN not found in Maharashtra SMC records. Please contact support@mediconnect.ai with your registration certificate."
              style={{ width:'100%', padding:'10px 12px', border:`1px solid ${BORDER}`, borderRadius:9, fontSize:13, fontFamily:'DM Sans, sans-serif', outline:'none', resize:'vertical', boxSizing:'border-box', marginBottom:18 }}/>
            <div style={{ display:'flex', gap:10 }}>
              <button onClick={()=>setRejectModal(null)} style={{ flex:1, padding:11, background:SURFACE, color:MUTED, border:`1px solid ${BORDER}`, borderRadius:9, fontSize:13.5, fontWeight:600, cursor:'pointer' }}>Cancel</button>
              <button onClick={rejectDoctor} disabled={actionBusy===rejectModal.doctorId}
                style={{ flex:1, padding:11, background:RED, color:'white', border:'none', borderRadius:9, fontSize:13.5, fontWeight:700, cursor:'pointer', opacity:actionBusy===rejectModal.doctorId?0.6:1 }}>
                {actionBusy===rejectModal.doctorId?'⏳ Rejecting…':'⛔ Confirm Rejection'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm modal */}
      {confirmDel && (
        <div style={{ position:'fixed', inset:0, background:'rgba(12,26,46,0.55)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
          <div style={{ background:'white', borderRadius:16, padding:28, maxWidth:400, width:'100%' }}>
            <div style={{ fontSize:16, fontWeight:700, color:NAVY, marginBottom:8 }}>🗑 Permanently Delete Doctor?</div>
            <div style={{ fontSize:14, fontWeight:700, color:RED, marginBottom:4 }}>{confirmDel.name}</div>
            <div style={{ fontSize:13, color:MUTED, marginBottom:16 }}>{confirmDel.email}</div>
            <div style={{ background:RED_P, borderRadius:9, padding:'10px 14px', fontSize:12.5, color:RED, marginBottom:20, lineHeight:1.7 }}>
              ⚠️ This permanently deletes the doctor account. <strong>Cannot be undone.</strong>
            </div>
            <div style={{ display:'flex', gap:10 }}>
              <button onClick={()=>setConfirmDel(null)} style={{ flex:1, padding:11, background:SURFACE, color:MUTED, border:`1px solid ${BORDER}`, borderRadius:9, fontSize:13.5, fontWeight:600, cursor:'pointer' }}>Cancel</button>
              <button onClick={()=>deleteDoctor(confirmDel)} disabled={actionBusy===confirmDel.doctorId}
                style={{ flex:1, padding:11, background:RED, color:'white', border:'none', borderRadius:9, fontSize:13.5, fontWeight:700, cursor:'pointer' }}>
                {actionBusy===confirmDel.doctorId?'⏳…':'🗑 Yes, Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div style={{ position:'fixed', bottom:24, right:24, background:NAVY, color:'white', padding:'12px 20px', borderRadius:12, fontSize:13.5, fontWeight:600, zIndex:999, boxShadow:'0 8px 24px rgba(0,0,0,0.3)' }}>
          {toast}
        </div>
      )}
    </div>
  );
}