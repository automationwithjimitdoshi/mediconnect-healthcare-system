'use client';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
/**
 * src/app/doctor/chat/page.js — CDSS Enhanced
 *
 * NEW vs previous version:
 *   ✓ Feature A: Delta-Check sparklines on file messages (velocity alerts)
 *   ✓ Feature B: Red flag check on incoming patient messages (calls /api/cdss/alerts/message-check)
 *   ✓ Feature C: ABHA panel in right sidebar — "Fetch National History" button
 *   ✓ Feature D: DDx Engine sidebar panel — auto-runs when file analyzed
 */

import { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import DoctorSidebar from '@/components/DoctorSidebar';
import { getToken, getUser, clearSession } from '@/lib/auth';
import { useDoctorAuth } from '@/lib/useDoctorAuth';

const NAVY='#0c1a2e',BLUE='#1565c0',BLUE_P='#e3f0ff',RED='#c62828',RED_P='#fdecea',
      AMBER='#b45309',AMBER_P='#fff3e0',GREEN='#1b5e20',GREEN_P='#e8f5e9',
      TEAL='#00796b',TEAL_P='#e0f5f0',PURPLE='#6b21a8',PURPLE_P='#f5f3ff',
      BORDER='#e2e8f0',SURFACE='#f7f9fc',MUTED='#8896a7',SEC='#4a5568';
const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';
const STATIC = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api').replace('/api','');

const NAV=[
  {id:'doctorDashboard',label:'Dashboard',    icon:'⊞',href:'/doctor'},
  {id:'doctorPatients', label:'All Patients', icon:'👥',href:'/doctor/patients'},
  {id:'doctorAppts',    label:'Appointments', icon:'📅',href:'/doctor/appointments'},
  {id:'doctorChat',     label:'Patient Chat', icon:'💬',href:'/doctor/chat',    badge:3},
  {id:'doctorUpdates',  label:'Updates',      icon:'🔔',href:'/doctor/updates',  badge:2},
  {id:'doctorReports',  label:'Report Review',icon:'🔬',href:'/doctor/reports', badge:'PREMIUM'},
];

const FICON=t=>({pdf:'📄',jpg:'🖼️',jpeg:'🖼️',png:'🖼️',webp:'🖼️',dcm:'🔬',dicom:'🔬',doc:'📝',docx:'📝'}[t?.toLowerCase()]||'📎');
const FBG  =t=>({pdf:'#fff0f0',jpg:'#f0f4ff',jpeg:'#f0f4ff',png:'#f0f4ff'}[t?.toLowerCase()]||'#f5f5f5');
const fmtSz=b=>{if(!b)return'';if(b<1024)return`${b}B`;if(b<1048576)return`${(b/1024).toFixed(0)}KB`;return`${(b/1048576).toFixed(1)}MB`;};
const fmtT =iso=>iso?new Date(iso).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}):'';
const fmtD =iso=>{if(!iso)return'—';return new Date(iso).toLocaleDateString('en-IN',{day:'numeric',month:'short'});};

async function triggerDownload(file, tokenFn) {
  const url = file?.storageUrl || file?.fileUrl;
  if (url) {
    try {
      const full = url.startsWith('http') ? url : `${STATIC}${url}`;
      const r = await fetch(full);
      if (r.ok) {
        const blob = await r.blob();
        const burl = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href=burl; a.download=file.fileName||'file';
        document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(burl);
        return true;
      }
    } catch {}
  }
  if (file?.id) {
    try {
      const r = await fetch(`${API}/files/${file.id}/download`,{headers:{Authorization:`Bearer ${tokenFn()}`}});
      if (r.ok) {
        const blob=await r.blob(); const burl=URL.createObjectURL(blob);
        const a=document.createElement('a'); a.href=burl; a.download=file.fileName||'file';
        document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(burl);
        return true;
      }
    } catch {}
  }
  return false;
}

// ── FEATURE A: Mini Sparkline ──────────────────────────────────────────────────
function MiniSparkline({ points, color=BLUE, width=80, height=28 }) {
  if (!points || points.length < 2) return null;
  const vals=points.map(p=>p.value), min=Math.min(...vals), max=Math.max(...vals), range=max-min||1;
  const pad=3, W=width-pad*2, H=height-pad*2;
  const coords=points.map((p,i)=>`${(pad+i/(points.length-1)*W).toFixed(1)},${(pad+(1-(p.value-min)/range)*H).toFixed(1)}`);
  return(
    <svg width={width} height={height} style={{flexShrink:0}}>
      <polyline points={coords.join(' ')} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round"/>
      {coords.map((c,i)=>{const[x,y]=c.split(',').map(Number);return<circle key={i} cx={x} cy={y} r={i===coords.length-1?2.5:1.5} fill={color}/>;}) }
    </svg>
  );
}

// ── FEATURE A: Delta-Check alert on a file bubble ─────────────────────────────
function DeltaCheckBadge({ patientId, fileName, tokenFn }) {
  const [data,   setData]   = useState(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!patientId) return;
    fetch(`${API}/cdss/delta/${patientId}`, { headers: { Authorization: `Bearer ${tokenFn()}` } })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.success) setData(d.data); })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, [patientId]);

  if (!loaded || !data) return null;
  const velocityAlerts = data.alerts || [];
  if (!velocityAlerts.length) return null;

  return (
    <div style={{ marginTop: 8 }}>
      {velocityAlerts.map((a, i) => (
        <div key={i} style={{ background: a.severity==='CRITICAL'?RED_P:AMBER_P, border:`1px solid ${a.severity==='CRITICAL'?'#f5c6cb':'#fde68a'}`, borderRadius: 7, padding: '6px 9px', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{ fontSize: 12 }}>⚡</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: a.severity==='CRITICAL'?RED:AMBER }}>
              Δ-CHECK: {a.parameter}
            </div>
            <div style={{ fontSize: 11, color: SEC }}>{a.change} — {a.message.split('—')[1]?.trim()}</div>
          </div>
          {data.parameters?.[a.parameter]?.points?.length >= 2 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <MiniSparkline points={data.parameters[a.parameter].points} color={a.severity==='CRITICAL'?RED:AMBER} width={70} height={26}/>
              <span style={{ fontSize: 10, fontWeight: 700, color: a.severity==='CRITICAL'?RED:AMBER }}>
                {a.direction === 'increasing' ? '↑' : '↓'}{Math.abs(data.parameters[a.parameter].pctChange3m ?? data.parameters[a.parameter].pctChange6m)}%
              </span>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Sidebar ───────────────────────────────────────────────────────────────────

// ── Doctor Profile Modal (inlined) ──────────────────────────────────────
const SPECIALTIES=['General Practice','Internal Medicine','Cardiology','Endocrinology & Diabetology',
  'Neurology','Orthopedics','Dermatology','Psychiatry','Pediatrics','Gynecology & Obstetrics',
  'Ophthalmology','ENT','Pulmonology','Nephrology','Gastroenterology','Oncology',
  'Rheumatology','Urology','General Surgery','Radiology','Anesthesiology','Emergency Medicine'];

function inp(err) {
  return {
    width:'100%', padding:'9px 12px', border:`1.5px solid ${err?RED:BORDER}`,
    borderRadius:9, fontSize:13, outline:'none', boxSizing:'border-box',
    fontFamily:'DM Sans, sans-serif', color:NAVY, background:'white',
  };
}

function DoctorProfileModal({ onClose, tokenFn, onSignOut }) {
  const [view,     setView]     = useState('profile'); // profile | edit | password | public
  const [doctor,   setDoctor]   = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [toast,    setToast]    = useState('');
  const [toastType,setToastType]= useState('ok');
  const [appEmail, setAppEmail] = useState('');

  // Edit form
  const [form, setForm] = useState({
    firstName:'', lastName:'', specialty:'', qualification:'',
    hospital:'', bio:'', consultFee:'', phone:'',
  });

  // Password form
  const [pwForm, setPwForm]   = useState({ current:'', next:'', confirm:'' });
  const [pwErr,  setPwErr]    = useState('');
  const [pwOk,   setPwOk]     = useState(false);

  const showToast = (msg, type='ok') => {
    setToast(msg); setToastType(type);
    setTimeout(() => setToast(''), 3500);
  };

  useEffect(() => {
    loadProfile();
    // Load stored app email
    const ae = (typeof window !== 'undefined' ? localStorage.getItem('mc_doctor_app_email') : '') || '';
    if (!ae) {
      // Try to extract from mc_user
      const _ue = getUser('DOCTOR'); setAppEmail(_ue.email || '');
    } else {
      setAppEmail(ae);
    }
  }, []);

  async function loadProfile() {
    setLoading(true);
    try {
      const r = await fetch(`${API}/doctor-data/profile`, {
        headers: { Authorization: `Bearer ${tokenFn()}` },
      });
      if (r.ok) {
        const d = await r.json();
        const doc = d.data || d.doctor || d;
        setDoctor(doc);
        setForm({
          firstName:     doc.firstName     || '',
          lastName:      doc.lastName      || '',
          specialty:     doc.specialty     || '',
          qualification: doc.qualification || '',
          hospital:      doc.hospital      || '',
          bio:           doc.bio           || '',
          consultFee:    doc.consultFee ? (doc.consultFee / 100).toString() : '',
          phone:         doc.phone         || '',
        });
      }
    } catch (e) {
      console.error('loadProfile:', e.message);
    }
    setLoading(false);
  }

  async function saveProfile() {
    if (!form.firstName.trim() || !form.lastName.trim()) {
      showToast('First and last name are required.', 'err'); return;
    }
    setSaving(true);
    try {
      const r = await fetch(`${API}/doctor-data/profile`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${tokenFn()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName:     form.firstName.trim(),
          lastName:      form.lastName.trim(),
          specialty:     form.specialty.trim(),
          qualification: form.qualification.trim(),
          hospital:      form.hospital.trim(),
          bio:           form.bio.trim(),
          phone:         form.phone.trim(),
          consultFee:    form.consultFee ? Math.round(parseFloat(form.consultFee) * 100) : undefined,
        }),
      });
      const d = await r.json();
      if (r.ok) {
        showToast('✅ Profile updated successfully!');
        // Update session via auth system
        try {
          const _u = getUser('DOCTOR'); const _t = getToken('DOCTOR');
          if (_u && _t) saveSession(_t, { ..._u, doctor: { ...(_u.doctor||{}), ...d.data } });
        } catch {}
        setDoctor(prev => ({ ...prev, ...d.data }));
        setView('profile');
      } else {
        showToast(d.message || 'Failed to update profile.', 'err');
      }
    } catch {
      showToast('Network error. Please try again.', 'err');
    }
    setSaving(false);
  }

  async function toggleAvailability() {
    if (!doctor) return;
    setSaving(true);
    try {
      const r = await fetch(`${API}/doctor-data/availability`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${tokenFn()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ isAvailable: !doctor.isAvailable }),
      });
      const d = await r.json();
      if (r.ok) {
        const updated = !doctor.isAvailable;
        setDoctor(prev => ({ ...prev, isAvailable: updated }));
        showToast(updated ? '✅ You are now Available' : '⚠️ You are now Unavailable');
      } else {
        showToast(d.message || 'Failed to update availability.', 'err');
      }
    } catch {
      showToast('Network error.', 'err');
    }
    setSaving(false);
  }

  async function changePassword() {
    setPwErr(''); setPwOk(false);
    if (!pwForm.current.trim()) { setPwErr('Enter your current password.'); return; }
    if (pwForm.next.length < 8)  { setPwErr('New password must be at least 8 characters.'); return; }
    if (pwForm.next !== pwForm.confirm) { setPwErr('Passwords do not match.'); return; }
    setSaving(true);
    try {
      const r = await fetch(`${API}/auth/change-password`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokenFn()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: pwForm.current, newPassword: pwForm.next }),
      });
      const d = await r.json();
      if (r.ok) {
        setPwOk(true);
        setPwForm({ current:'', next:'', confirm:'' });
        showToast('✅ Password changed successfully!');
        setTimeout(() => setView('profile'), 1500);
      } else {
        setPwErr(d.message || d.error || 'Failed to change password.');
      }
    } catch {
      setPwErr('Network error. Please try again.');
    }
    setSaving(false);
  }

  function copyAppEmail() {
    if (!appEmail) return;
    navigator.clipboard.writeText(appEmail).then(() => showToast('📋 App email copied!')).catch(() => {});
  }

  const initials = doctor
    ? `${doctor.firstName?.[0]||''}${doctor.lastName?.[0]||''}`.toUpperCase()
    : '?';

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position:'fixed', inset:0, background:'rgba(12,26,46,0.6)', zIndex:9999,
               display:'flex', alignItems:'flex-start', justifyContent:'flex-start', padding:0 }}>

      {/* Panel slides in from left, aligned with sidebar */}
      <div style={{ width:320, height:'100vh', background:'white', boxShadow:'4px 0 32px rgba(0,0,0,0.2)',
                    display:'flex', flexDirection:'column', overflowY:'auto', fontFamily:'DM Sans, sans-serif' }}>

        {/* ── Header ── */}
        <div style={{ background:NAVY, padding:'20px 20px 16px', flexShrink:0 }}>
          <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:14 }}>
            <div style={{ fontSize:12, color:'rgba(255,255,255,0.4)', fontFamily:'monospace', letterSpacing:'0.1em' }}>DOCTOR PROFILE</div>
            <button onClick={onClose}
              style={{ background:'rgba(255,255,255,0.1)', border:'none', color:'white', width:28, height:28,
                       borderRadius:'50%', cursor:'pointer', fontSize:16, display:'flex', alignItems:'center', justifyContent:'center' }}>×</button>
          </div>

          {/* Avatar + name */}
          <div style={{ display:'flex', alignItems:'center', gap:14 }}>
            <div style={{ width:56, height:56, borderRadius:'50%', background:BLUE_P, color:BLUE,
                          display:'flex', alignItems:'center', justifyContent:'center',
                          fontSize:20, fontWeight:700, flexShrink:0, border:'3px solid rgba(255,255,255,0.2)' }}>
              {initials}
            </div>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:16, fontWeight:700, color:'white', marginBottom:2 }}>
                {doctor ? `Dr. ${doctor.firstName} ${doctor.lastName}` : loading ? 'Loading…' : 'Doctor'}
              </div>
              <div style={{ fontSize:12, color:'rgba(255,255,255,0.6)' }}>{doctor?.specialty || ''}</div>
              <div style={{ display:'flex', alignItems:'center', gap:6, marginTop:4 }}>
                <div style={{ width:7, height:7, borderRadius:'50%',
                              background: doctor?.isAvailable ? '#4ade80' : '#f87171' }} />
                <span style={{ fontSize:11, color:'rgba(255,255,255,0.5)' }}>
                  {doctor?.isAvailable ? 'Available for appointments' : 'Not available'}
                </span>
              </div>
            </div>
          </div>

          {/* App email badge */}
          {appEmail && (
            <div onClick={copyAppEmail}
              style={{ marginTop:12, background:'rgba(255,255,255,0.08)', borderRadius:8,
                       padding:'7px 12px', cursor:'pointer', display:'flex', alignItems:'center', gap:8 }}
              title="Click to copy your app login email">
              <span style={{ fontSize:12 }}>🔑</span>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:9, color:'rgba(255,255,255,0.4)', fontFamily:'monospace', letterSpacing:'0.08em' }}>APP LOGIN EMAIL</div>
                <div style={{ fontSize:11.5, color:'rgba(255,255,255,0.85)', fontFamily:'monospace',
                              overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{appEmail}</div>
              </div>
              <span style={{ fontSize:11, color:'rgba(255,255,255,0.4)' }}>📋</span>
            </div>
          )}
        </div>

        {/* ── Navigation tabs within modal ── */}
        {view === 'profile' && (
          <div style={{ flex:1, overflowY:'auto' }}>
            {loading ? (
              <div style={{ padding:40, textAlign:'center', color:MUTED }}>Loading profile…</div>
            ) : (
              <>
                {/* Quick stats */}
                <div style={{ padding:'14px 20px', borderBottom:`1px solid ${BORDER}` }}>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                    {[
                      { label:'Hospital', value: doctor?.hospital || '—', icon:'🏥' },
                      { label:'Qualification', value: doctor?.qualification || '—', icon:'🎓' },
                      { label:'Consult Fee', value: doctor?.consultFee ? `₹${(doctor.consultFee/100).toFixed(0)}` : '—', icon:'💳' },
                      { label:'Phone', value: doctor?.phone || '—', icon:'📱' },
                    ].map(s => (
                      <div key={s.label} style={{ background:SURFACE, borderRadius:9, padding:'10px 12px' }}>
                        <div style={{ fontSize:11, color:MUTED, marginBottom:3 }}>{s.icon} {s.label}</div>
                        <div style={{ fontSize:12.5, fontWeight:600, color:NAVY, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{s.value}</div>
                      </div>
                    ))}
                  </div>
                  {doctor?.bio && (
                    <div style={{ marginTop:10, padding:'10px 12px', background:SURFACE, borderRadius:9, fontSize:12.5, color:SEC, lineHeight:1.65 }}>
                      {doctor.bio}
                    </div>
                  )}
                </div>

                {/* Action buttons */}
                <div style={{ padding:'14px 20px', display:'flex', flexDirection:'column', gap:8 }}>

                  <button onClick={() => setView('edit')}
                    style={{ width:'100%', padding:'11px 16px', background:BLUE, color:'white', border:'none',
                             borderRadius:10, fontSize:13.5, fontWeight:700, cursor:'pointer', textAlign:'left',
                             display:'flex', alignItems:'center', gap:10 }}>
                    <span style={{ fontSize:18 }}>✏️</span> Edit Profile
                  </button>

                  <button onClick={toggleAvailability} disabled={saving}
                    style={{ width:'100%', padding:'11px 16px', border:`1px solid ${doctor?.isAvailable?GREEN:AMBER}`,
                             background: doctor?.isAvailable ? GREEN_P : AMBER_P,
                             color: doctor?.isAvailable ? GREEN : AMBER,
                             borderRadius:10, fontSize:13.5, fontWeight:700, cursor:saving?'not-allowed':'pointer',
                             textAlign:'left', display:'flex', alignItems:'center', gap:10 }}>
                    <span style={{ fontSize:18 }}>{doctor?.isAvailable ? '🟢' : '🔴'}</span>
                    {saving ? 'Updating…' : doctor?.isAvailable ? 'Set as Unavailable' : 'Set as Available'}
                  </button>

                  <button onClick={() => setView('password')}
                    style={{ width:'100%', padding:'11px 16px', background:SURFACE, color:SEC, border:`1px solid ${BORDER}`,
                             borderRadius:10, fontSize:13.5, fontWeight:600, cursor:'pointer', textAlign:'left',
                             display:'flex', alignItems:'center', gap:10 }}>
                    <span style={{ fontSize:18 }}>🔒</span> Change Password
                  </button>

                  {appEmail && (
                    <button onClick={copyAppEmail}
                      style={{ width:'100%', padding:'11px 16px', background:SURFACE, color:SEC, border:`1px solid ${BORDER}`,
                               borderRadius:10, fontSize:13.5, fontWeight:600, cursor:'pointer', textAlign:'left',
                               display:'flex', alignItems:'center', gap:10 }}>
                      <span style={{ fontSize:18 }}>📋</span> Copy App Login Email
                    </button>
                  )}

                  <div style={{ height:1, background:BORDER, margin:'4px 0' }} />

                  <button onClick={onSignOut}
                    style={{ width:'100%', padding:'11px 16px', background:RED_P, color:RED, border:`1px solid #f5c6cb`,
                             borderRadius:10, fontSize:13.5, fontWeight:700, cursor:'pointer', textAlign:'left',
                             display:'flex', alignItems:'center', gap:10 }}>
                    <span style={{ fontSize:18 }}>🚪</span> Sign Out
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── Edit Profile ── */}
        {view === 'edit' && (
          <div style={{ flex:1, overflowY:'auto' }}>
            <div style={{ padding:'14px 20px', borderBottom:`1px solid ${BORDER}`, display:'flex', alignItems:'center', gap:10 }}>
              <button onClick={() => setView('profile')} style={{ background:'none', border:'none', cursor:'pointer', color:MUTED, fontSize:18, padding:0 }}>←</button>
              <div style={{ fontSize:14, fontWeight:700, color:NAVY }}>Edit Profile</div>
            </div>
            <div style={{ padding:20, display:'flex', flexDirection:'column', gap:12 }}>
              {[
                { label:'First Name *',     field:'firstName',     type:'text',   placeholder:'Raj' },
                { label:'Last Name *',      field:'lastName',      type:'text',   placeholder:'Sharma' },
                { label:'Phone',            field:'phone',         type:'tel',    placeholder:'+91 98765 43210' },
                { label:'Hospital / Clinic',field:'hospital',      type:'text',   placeholder:'Apollo Hospital' },
                { label:'Qualification',    field:'qualification', type:'text',   placeholder:'MBBS, MD' },
                { label:'Consultation Fee (₹)', field:'consultFee', type:'number', placeholder:'500' },
              ].map(({ label, field, type, placeholder }) => (
                <div key={field}>
                  <label style={{ fontSize:12, fontWeight:600, color:SEC, display:'block', marginBottom:5 }}>{label}</label>
                  <input type={type} value={form[field]} placeholder={placeholder}
                    onChange={e => setForm(p => ({ ...p, [field]: e.target.value }))}
                    style={inp()} />
                </div>
              ))}

              <div>
                <label style={{ fontSize:12, fontWeight:600, color:SEC, display:'block', marginBottom:5 }}>Specialty</label>
                <select value={form.specialty} onChange={e => setForm(p => ({ ...p, specialty: e.target.value }))} style={{ ...inp(), background:'white' }}>
                  <option value="">Select specialty…</option>
                  {SPECIALTIES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>

              <div>
                <label style={{ fontSize:12, fontWeight:600, color:SEC, display:'block', marginBottom:5 }}>Bio / About</label>
                <textarea value={form.bio} placeholder="Brief description visible to patients…"
                  onChange={e => setForm(p => ({ ...p, bio: e.target.value }))}
                  rows={3}
                  style={{ ...inp(), resize:'vertical', minHeight:72 }} />
              </div>

              <button onClick={saveProfile} disabled={saving}
                style={{ width:'100%', padding:12, background:saving?'#93c5fd':BLUE, color:'white', border:'none',
                         borderRadius:10, fontSize:14, fontWeight:700, cursor:saving?'not-allowed':'pointer' }}>
                {saving ? '⏳ Saving…' : '💾 Save Changes'}
              </button>
            </div>
          </div>
        )}

        {/* ── Change Password ── */}
        {view === 'password' && (
          <div style={{ flex:1, overflowY:'auto' }}>
            <div style={{ padding:'14px 20px', borderBottom:`1px solid ${BORDER}`, display:'flex', alignItems:'center', gap:10 }}>
              <button onClick={() => { setView('profile'); setPwErr(''); setPwOk(false); }}
                style={{ background:'none', border:'none', cursor:'pointer', color:MUTED, fontSize:18, padding:0 }}>←</button>
              <div style={{ fontSize:14, fontWeight:700, color:NAVY }}>Change Password</div>
            </div>
            <div style={{ padding:20, display:'flex', flexDirection:'column', gap:14 }}>
              {pwOk && (
                <div style={{ background:GREEN_P, border:'1px solid #a5d6a7', borderRadius:10, padding:'12px 14px', fontSize:13, color:GREEN }}>
                  ✅ Password changed successfully!
                </div>
              )}
              {pwErr && (
                <div style={{ background:RED_P, border:'1px solid #f5c6cb', borderRadius:10, padding:'12px 14px', fontSize:13, color:RED }}>
                  {pwErr}
                </div>
              )}
              {[
                { label:'Current Password', field:'current', placeholder:'Your current password' },
                { label:'New Password',     field:'next',    placeholder:'Minimum 8 characters' },
                { label:'Confirm New',      field:'confirm', placeholder:'Repeat new password' },
              ].map(({ label, field, placeholder }) => (
                <div key={field}>
                  <label style={{ fontSize:12, fontWeight:600, color:SEC, display:'block', marginBottom:5 }}>{label}</label>
                  <input type="password" value={pwForm[field]} placeholder={placeholder}
                    onChange={e => { setPwForm(p => ({ ...p, [field]: e.target.value })); setPwErr(''); }}
                    style={inp()} />
                </div>
              ))}

              <div style={{ background:SURFACE, borderRadius:9, padding:'10px 12px', fontSize:12, color:MUTED, lineHeight:1.6 }}>
                💡 After changing your password, you will need to sign in again on all devices.
              </div>

              <button onClick={changePassword} disabled={saving}
                style={{ width:'100%', padding:12, background:saving?'#93c5fd':BLUE, color:'white', border:'none',
                         borderRadius:10, fontSize:14, fontWeight:700, cursor:saving?'not-allowed':'pointer' }}>
                {saving ? '⏳ Changing…' : '🔒 Change Password'}
              </button>
            </div>
          </div>
        )}

        {/* ── Toast ── */}
        {toast && (
          <div style={{ position:'sticky', bottom:16, margin:'0 16px',
                        background: toastType==='err' ? RED : NAVY,
                        color:'white', padding:'10px 16px', borderRadius:10, fontSize:13,
                        boxShadow:'0 4px 16px rgba(0,0,0,0.2)', textAlign:'center' }}>
            {toast}
          </div>
        )}
      </div>
    </div>
  );
}

function AIModal({fileId, fileName, tokenFn, onClose}){
  const [data,setData]=useState(null);const [loading,setLoading]=useState(true);const [error,setError]=useState('');
  useEffect(()=>{load();},[fileId]);
  async function load(){setLoading(true);setError('');try{const r=await fetch(`${API}/files/${fileId}/analysis`,{headers:{Authorization:`Bearer ${tokenFn()}`}});if(!r.ok)throw new Error(`HTTP ${r.status}`);const d=await r.json();setData(d.data||d);if((d.data||d).aiStatus==='PROCESSING')setTimeout(load,4000);}catch(e){setError(e.message);}setLoading(false);}
  const analysis=data?.analysis;const uc={CRITICAL:{bg:RED_P,color:RED,label:'🚨 CRITICAL'},HIGH:{bg:AMBER_P,color:AMBER,label:'⚠ HIGH'},MEDIUM:{bg:BLUE_P,color:BLUE,label:'📋 MEDIUM'},LOW:{bg:GREEN_P,color:GREEN,label:'✓ LOW'}};const urg=uc[data?.urgencyLevel]||{bg:SURFACE,color:MUTED,label:'—'};
  return(<div style={{position:'fixed',inset:0,background:'rgba(12,26,46,0.65)',zIndex:9999,display:'flex',alignItems:'center',justifyContent:'center',padding:20}} onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
    <div style={{background:'white',borderRadius:16,width:'100%',maxWidth:640,maxHeight:'88vh',display:'flex',flexDirection:'column',boxShadow:'0 12px 48px rgba(0,0,0,0.25)',overflow:'hidden'}}>
      <div style={{background:NAVY,padding:'16px 20px',display:'flex',alignItems:'center',gap:12,flexShrink:0}}><div style={{flex:1,minWidth:0}}><div style={{fontSize:10,fontFamily:'monospace',color:'rgba(255,255,255,0.4)',letterSpacing:'0.1em',marginBottom:3}}>🔒 AI ANALYSIS · DOCTOR ONLY</div><div style={{fontSize:14,fontWeight:700,color:'white',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{fileName}</div></div>{data?.urgencyLevel&&<span style={{padding:'4px 10px',borderRadius:99,fontSize:12,fontWeight:700,background:urg.bg,color:urg.color,flexShrink:0}}>{urg.label}</span>}<button onClick={onClose} style={{background:'rgba(255,255,255,0.1)',border:'none',color:'white',width:28,height:28,borderRadius:'50%',cursor:'pointer',fontSize:16,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>×</button></div>
      <div style={{flex:1,overflowY:'auto',padding:20}}>
        {loading&&<div style={{textAlign:'center',padding:40,color:MUTED}}><div style={{fontSize:36,marginBottom:12}}>🧠</div>Analysing…</div>}
        {error&&<div style={{background:RED_P,border:'1px solid #f5c6cb',borderRadius:10,padding:16}}><div style={{fontWeight:700,color:RED,marginBottom:6}}>Unavailable</div><div style={{fontSize:12.5,color:SEC,marginBottom:10}}>{error}</div><button onClick={load} style={{padding:'6px 14px',background:RED,color:'white',border:'none',borderRadius:8,fontSize:12,cursor:'pointer'}}>Retry</button></div>}
        {!loading&&data&&(<>
          {data.briefSummary&&<div style={{background:NAVY,borderRadius:12,padding:'12px 16px',color:'white',marginBottom:14}}><div style={{fontSize:9,fontFamily:'monospace',opacity:0.5,letterSpacing:'0.1em',marginBottom:5}}>CLINICAL BRIEF</div><div style={{fontSize:13,lineHeight:1.7,opacity:0.95}}>{data.briefSummary}</div></div>}
          {analysis&&<>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:12}}>
              <div style={{background:SURFACE,borderRadius:10,padding:12}}><div style={{fontSize:12,fontWeight:700,color:NAVY,marginBottom:6}}>📋 Key Findings</div>{analysis.keyFindings?.length>0?analysis.keyFindings.map((f,i)=><div key={i} style={{fontSize:12,color:SEC,padding:'3px 0',borderBottom:`1px solid ${BORDER}`,lineHeight:1.5}}>• {f}</div>):<div style={{fontSize:12,color:MUTED}}>None</div>}</div>
              <div style={{background:analysis.abnormalValues?.length>0?RED_P:SURFACE,border:`1px solid ${analysis.abnormalValues?.length>0?'#f5c6cb':BORDER}`,borderRadius:10,padding:12}}><div style={{fontSize:12,fontWeight:700,color:analysis.abnormalValues?.length>0?RED:NAVY,marginBottom:6}}>{analysis.abnormalValues?.length>0?'🚨 Abnormal':'✓ Normal'}</div>{analysis.abnormalValues?.length>0?analysis.abnormalValues.map((v,i)=><div key={i} style={{fontSize:12,color:RED,padding:'3px 0',lineHeight:1.5}}>⚠ {v}</div>):<div style={{fontSize:12,color:GREEN}}>None detected</div>}</div>
            </div>
            {analysis.clinicalSignificance&&<div style={{background:BLUE_P,borderRadius:10,padding:12,marginBottom:12}}><div style={{fontSize:12,fontWeight:700,color:BLUE,marginBottom:4}}>🩺 Clinical Significance</div><div style={{fontSize:13,color:'#1e3a5f',lineHeight:1.7}}>{analysis.clinicalSignificance}</div></div>}
            {analysis.recommendedActions?.length>0&&<div style={{background:GREEN_P,borderRadius:10,padding:12}}><div style={{fontSize:12,fontWeight:700,color:GREEN,marginBottom:6}}>✅ Recommended</div>{analysis.recommendedActions.map((a,i)=><div key={i} style={{display:'flex',gap:8,padding:'3px 0',fontSize:12,color:'#1b4332'}}><span style={{fontWeight:700,flexShrink:0}}>{i+1}.</span><span>{a}</span></div>)}</div>}
          </>}
          <div style={{display:'flex',gap:7,marginTop:14,padding:'7px 12px',background:PURPLE_P,border:'1px solid #e9d5ff',borderRadius:8}}><span>🔒</span><span style={{fontSize:11,color:PURPLE}}>Doctor-only view. Patient cannot see this.</span></div>
        </>)}
      </div>
    </div>
  </div>);
}

// ── FEATURE C: ABHA Panel ────────────────────────────────────────────────────
function AbhaPanel({ patientId, tokenFn }) {
  const [abhaId,   setAbhaId]   = useState('');
  const [data,     setData]     = useState(null);
  const [loading,  setLoading]  = useState(false);
  const [checked,  setChecked]  = useState(false);
  const [error,    setError]    = useState('');

  // Check for cached data on mount
  useEffect(() => {
    if (!patientId) return;
    fetch(`${API}/cdss/abha/${patientId}`, { headers: { Authorization: `Bearer ${tokenFn()}` } })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.success && d.data) setData(d.data); })
      .catch(() => {})
      .finally(() => setChecked(true));
  }, [patientId]);

  async function fetchAbha() {
    if (!abhaId.trim()) { setError('Enter ABHA ID'); return; }
    setLoading(true); setError('');
    try {
      const r = await fetch(`${API}/cdss/abha/fetch`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokenFn()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ patientId, abhaId: abhaId.trim() }),
      });
      const d = await r.json();
      if (d.success) setData(d.data);
      else setError(d.message || 'Fetch failed');
    } catch (e) { setError(e.message); }
    setLoading(false);
  }

  if (!checked) return <div style={{padding:12,textAlign:'center',color:MUTED,fontSize:12}}>Loading ABHA…</div>;

  return (
    <div>
      {/* Input row */}
      {!data && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: NAVY, marginBottom: 6 }}>🏥 ABDM/ABHA National History</div>
          <div style={{ display: 'flex', gap: 6 }}>
            <input value={abhaId} onChange={e => setAbhaId(e.target.value)}
              placeholder="12-3456-7890-1234"
              style={{ flex: 1, padding: '6px 8px', border: `1px solid ${BORDER}`, borderRadius: 7, fontSize: 12, outline: 'none', fontFamily: 'monospace' }}/>
            <button onClick={fetchAbha} disabled={loading}
              style={{ padding: '6px 11px', background: TEAL, color: 'white', border: 'none', borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: loading ? 'default' : 'pointer', opacity: loading ? 0.7 : 1, whiteSpace: 'nowrap' }}>
              {loading ? '⏳' : '⊕ Fetch'}
            </button>
          </div>
          {error && <div style={{ fontSize: 11, color: RED, marginTop: 4 }}>{error}</div>}
          <div style={{ fontSize: 10.5, color: MUTED, marginTop: 4, lineHeight: 1.5 }}>Enter patient's 14-digit ABHA ID to pull their national health history from all hospitals.</div>
        </div>
      )}

      {/* Fetched data */}
      {data && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: NAVY }}>🏥 ABHA History</div>
            <div style={{ display: 'flex', gap: 5 }}>
              {data.source && (
                <span style={{ fontSize: 9, background: data.source==='ABDM national database'?GREEN_P:BLUE_P,
                  color: data.source==='ABDM national database'?GREEN:BLUE, padding: '1px 5px', borderRadius: 4, fontWeight: 700 }}>
                  {data.source==='ABDM national database'?'🏥 ABDM':' MediConnect'}
                </span>
              )}
              <button onClick={() => setData(null)} style={{ fontSize: 10, color: MUTED, background: 'none', border: 'none', cursor: 'pointer' }}>✕ Clear</button>
            </div>
          </div>

          {/* AI Summary */}
          {data.summary && (
            <div style={{ background: NAVY, borderRadius: 9, padding: '10px 12px', marginBottom: 10 }}>
              <div style={{ fontSize: 9, fontFamily: 'monospace', color: 'rgba(255,255,255,0.4)', letterSpacing: '0.08em', marginBottom: 5 }}>🧠 AI NATIONAL HISTORY SUMMARY</div>
              <div style={{ fontSize: 12, lineHeight: 1.65, color: 'rgba(255,255,255,0.92)' }}>{data.summary}</div>
            </div>
          )}

          {/* Conditions */}
          {data.records?.conditions?.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>Active Conditions</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {data.records.conditions.map((c, i) => (
                  <span key={i} style={{ fontSize: 11, background: RED_P, color: RED, padding: '2px 7px', borderRadius: 99, fontWeight: 600 }}>{c}</span>
                ))}
              </div>
            </div>
          )}

          {/* Encounter list */}
          {data.records?.encounters?.length > 0 && (
            <div>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Encounters ({data.records.encounters.length})</div>
              {data.records.encounters.map((e, i) => (
                <div key={i} style={{ background: SURFACE, borderRadius: 8, padding: '8px 10px', marginBottom: 5, border: `1px solid ${BORDER}` }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: NAVY, marginBottom: 2 }}>{e.date} · {e.hospital}</div>
                  <div style={{ fontSize: 10.5, color: TEAL, fontWeight: 600, marginBottom: 2 }}>{e.specialty} — {e.doctor}</div>
                  <div style={{ fontSize: 11, color: SEC }}>{e.diagnosis}</div>
                </div>
              ))}
            </div>
          )}

          {/* Medications from ABHA */}
          {data.records?.medications?.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>ABHA Medications</div>
              {data.records.medications.map((m, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, padding: '3px 0', borderBottom: `0.5px solid ${BORDER}` }}>
                  <span style={{ color: NAVY, fontWeight: 600 }}>{m.name} {m.dose}</span>
                  <span style={{ color: MUTED }}>{m.frequency}</span>
                </div>
              ))}
            </div>
          )}

          <div style={{ fontSize: 10, color: MUTED, marginTop: 8 }}>
            Fetched: {data.fetchedAt ? new Date(data.fetchedAt).toLocaleString('en-IN') : 'Just now'}
          </div>
        </div>
      )}
    </div>
  );
}

// ── FEATURE D: DDx Engine Panel ───────────────────────────────────────────────
function DdxPanel({ patientId, messages, patientContext, tokenFn }) {
  const [ddx,        setDdx]        = useState([]);
  const [loading,    setLoading]    = useState(false);
  const [loaded,     setLoaded]     = useState(false);
  const [source,     setSource]     = useState('');
  const [error,      setError]      = useState('');
  const [noData,     setNoData]     = useState(false);

  async function runDdx() {
    setLoading(true); setError(''); setDdx([]); setNoData(false);

    // Build report summary from most recent analyzed file in messages
    const fileMsgs = messages.filter(m => m.type === 'FILE' && (m.file || m._file));
    let reportSummary = '';
    if (fileMsgs.length) {
      const latestFile = fileMsgs[fileMsgs.length - 1];
      const file = latestFile.file || latestFile._file;
      if (file?.id) {
        try {
          const r = await fetch(`${API}/files/${file.id}/analysis`, { headers: { Authorization: `Bearer ${tokenFn()}` } });
          if (r.ok) {
            const d = await r.json();
            const ai = d.data || d;
            reportSummary = [ai.briefSummary, ...(ai.keyFindings || []), ...(ai.abnormalValues || [])].filter(Boolean).join('. ');
          }
        } catch {}
      }
    }

    try {
      const r = await fetch(`${API}/cdss/ddx`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokenFn()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patientId,
          reportSummary,
          chatMessages: messages.slice(-20).map(m => ({ content: m.content || m.text, senderRole: m.senderRole || (m.from === 'doctor' ? 'DOCTOR' : 'PATIENT') })),
          patientContext,
        }),
      });
      const d = await r.json();
      if (d.success) {
        if (!d.data.ddx?.length) { setNoData(true); }
        else { setDdx(d.data.ddx); setSource(d.data.source); }
      } else setError(d.message || 'DDx failed');
    } catch (e) { setError(e.message); }
    setLoading(false); setLoaded(true);
  }

  const confColor = c => ({ HIGH: RED, MEDIUM: AMBER, LOW: GREEN }[c] || MUTED);
  const confBg    = c => ({ HIGH: RED_P, MEDIUM: AMBER_P, LOW: GREEN_P }[c] || SURFACE);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: NAVY }}>🔬 DDx Engine</div>
        <button onClick={runDdx} disabled={loading}
          style={{ padding: '4px 10px', background: PURPLE, color: 'white', border: 'none', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: loading ? 'default' : 'pointer', opacity: loading ? 0.7 : 1 }}>
          {loading ? '⏳' : loaded ? '↺ Refresh' : '⊕ Run DDx'}
        </button>
      </div>

      {!loaded && !loading && (
        <div style={{ fontSize: 12, color: MUTED, lineHeight: 1.6 }}>
          Click "Run DDx" to generate a differential diagnosis from this patient's report findings and chat messages.
        </div>
      )}

      {loading && <div style={{ padding: '12px 0', textAlign: 'center', color: MUTED, fontSize: 12 }}>🧠 Analysing clinical context…</div>}
      {error   && <div style={{ fontSize: 12, color: RED, marginTop: 4 }}>❌ {error}</div>}
      {noData  && <div style={{ fontSize: 12, color: MUTED }}>Insufficient data. Upload a report and ensure the patient has described symptoms in chat.</div>}

      {source && (
        <div style={{ fontSize: 10, color: MUTED, marginBottom: 8 }}>
          Source: {source === 'ai' ? '🧠 AI-powered' : '📋 Rule-based'} · {ddx.length} condition{ddx.length !== 1 ? 's' : ''}
        </div>
      )}

      {ddx.map((d, i) => (
        <div key={i} style={{ background: SURFACE, borderRadius: 9, border: `1px solid ${confColor(d.confidence)}30`, padding: '9px 11px', marginBottom: 7 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4, gap: 5 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: NAVY, flex: 1 }}>{d.condition}</div>
            <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 4, background: confBg(d.confidence), color: confColor(d.confidence), flexShrink: 0 }}>{d.confidence}</span>
            {d.urgent && <span style={{ fontSize: 10, background: RED, color: 'white', padding: '1px 5px', borderRadius: 4, fontWeight: 700, flexShrink: 0 }}>URGENT</span>}
          </div>
          {d.reasoning && <div style={{ fontSize: 11.5, color: SEC, marginBottom: 5, lineHeight: 1.5 }}>{d.reasoning}</div>}
          <div style={{ fontSize: 11.5, color: TEAL, fontWeight: 600, lineHeight: 1.5 }}>→ {d.action}</div>
        </div>
      ))}

      {loaded && ddx.length > 0 && (
        <div style={{ fontSize: 10.5, color: MUTED, marginTop: 6, lineHeight: 1.5, padding: '6px 8px', background: PURPLE_P, borderRadius: 6 }}>
          ⚠ DDx is a decision support tool, not a diagnosis. Always apply clinical judgment.
        </div>
      )}
    </div>
  );
}

// ── File Bubble (with Delta-Check) ────────────────────────────────────────────
function FileBubble({msg, isMe, onDelete, onDownload, onAnalyze, patientId, tokenFn}){
  const file=msg.file||msg._file||{};const ext=(file.storageKey||file.fileName||'').split('.').pop().toLowerCase();
  const isDeleted=msg.isDeleted||msg.content==='[Message deleted]';
  if(isDeleted)return<div style={{padding:'8px 12px',borderRadius:10,background:SURFACE,border:`1px solid ${BORDER}`,fontSize:12,color:MUTED,fontStyle:'italic'}}>🗑 File deleted</div>;
  return(<div style={{position:'relative'}}>
    <div style={{display:'flex',gap:10,padding:'11px 14px',borderRadius:14,border:`1px solid ${BORDER}`,background:FBG(ext),maxWidth:310,borderBottomRightRadius:isMe?4:14,borderBottomLeftRadius:isMe?14:4}}>
      <div style={{width:36,height:36,borderRadius:8,background:'white',display:'flex',alignItems:'center',justifyContent:'center',fontSize:18,flexShrink:0}}>{FICON(ext)}</div>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontSize:12,fontWeight:600,color:NAVY,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',marginBottom:2}}>{file.fileName||'File'}</div>
        <div style={{fontSize:10,color:MUTED,fontFamily:'monospace',marginBottom:7}}>{fmtSz(file.fileSize)} · {fmtD(msg.createdAt)}</div>
        <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
          <button onClick={()=>onDownload(file)} style={{padding:'4px 10px',background:BLUE,color:'white',border:'none',borderRadius:6,fontSize:11,fontWeight:700,cursor:'pointer'}}>↓ Download</button>
          {file.id&&<button onClick={()=>onAnalyze(file.id,file.fileName)} style={{padding:'4px 10px',background:NAVY,color:'white',border:'none',borderRadius:6,fontSize:11,fontWeight:700,cursor:'pointer'}}>🧠 AI Review</button>}
        </div>
        {/* Feature A: Delta-Check alert inline below file bubble */}
        {!isMe && patientId && <DeltaCheckBadge patientId={patientId} fileName={file.fileName} tokenFn={tokenFn}/>}
      </div>
    </div>
    {isMe&&(<button onClick={()=>onDelete(msg.id)} style={{position:'absolute',top:-8,right:-8,width:22,height:22,borderRadius:'50%',background:RED,color:'white',border:'2px solid white',cursor:'pointer',fontSize:11,display:'flex',alignItems:'center',justifyContent:'center',fontWeight:700,boxShadow:'0 1px 4px rgba(0,0,0,0.2)',zIndex:2}}>×</button>)}
  </div>);
}

// ── Text Bubble ───────────────────────────────────────────────────────────────
function TextBubble({msg, isMe, onDelete, isRedFlag}){
  const isDeleted=msg.isDeleted||msg.content==='[Message deleted]';
  return(<div style={{position:'relative'}}>
    {/* Feature B: Red flag indicator on patient message */}
    {isRedFlag&&!isMe&&<div style={{fontSize:10,color:RED,fontWeight:700,marginBottom:3,display:'flex',alignItems:'center',gap:4}}><div style={{width:6,height:6,borderRadius:'50%',background:RED,animation:'rfBlink 1s infinite'}}/>🚨 RED FLAG KEYWORD DETECTED</div>}
    <div style={{padding:'10px 14px',borderRadius:14,fontSize:13,lineHeight:1.6,background:isMe?BLUE:(msg.isUrgent||isRedFlag?RED_P:'white'),color:isMe?'white':(msg.isUrgent||isRedFlag?RED:NAVY),border:isMe?'none':`1px solid ${msg.isUrgent||isRedFlag?'#f5c6cb':BORDER}`,borderBottomRightRadius:isMe?4:14,borderBottomLeftRadius:isMe?14:4,fontStyle:isDeleted?'italic':undefined,opacity:isDeleted?0.7:1}}>
      {isDeleted?'🗑 Message deleted':(msg.content||msg.text)}
    </div>
    {isMe&&!isDeleted&&<button onClick={()=>onDelete(msg.id)} style={{position:'absolute',top:-8,right:-8,width:22,height:22,borderRadius:'50%',background:RED,color:'white',border:'2px solid white',cursor:'pointer',fontSize:11,display:'flex',alignItems:'center',justifyContent:'center',fontWeight:700,boxShadow:'0 1px 4px rgba(0,0,0,0.2)',zIndex:2}}>×</button>}
  </div>);
}

// ── Main Page ─────────────────────────────────────────────────────────────────
function DoctorChatPageInner(){
  const router       = useRouter();
  const searchParams = useSearchParams();
  const bottomRef    = useRef(null);
  const fileRef      = useRef(null);
  const inputRef     = useRef(null);

  const [mounted,      setMounted]      = useState(false);
  const [rooms,        setRooms]        = useState([]);
  const [allPatients,  setAllPatients]  = useState([]); // fallback when no chat rooms exist
  const [selRoom,      setSelRoom]      = useState(null);
  const [messages,     setMessages]     = useState([]);
  const [input,        setInput]        = useState('');
  const [uploading,    setUploading]    = useState(false);
  const [sending,      setSending]      = useState(false);
  const [loading,      setLoading]      = useState(true);

  // Voice recorder
  const [recording,      setRecording]      = useState(false);
  const [recTranscript,  setRecTranscript]  = useState('');
  const [summarizing,    setSummarizing]    = useState(false);
  const [noteModal,      setNoteModal]      = useState(null);
  const [inputLang,      setInputLang]      = useState('en-IN'); // BCP-47 tag for SpeechRecognition
  const [outputLang,     setOutputLang]     = useState('en'); // summary output language
  const recognRef = useRef(null);

  // Camera
  const cameraRef = useRef(null);
  const [cameraUploading, setCameraUploading] = useState(false);

  // Clinical notes history
  const [clinicalNotes, setClinicalNotes] = useState([]);
  const [toast,        setToast]        = useState('');
  const [typing,       setTyping]       = useState(false);
  const [aiModal,      setAiModal]      = useState(null);
  const [redFlagMsgs,  setRedFlagMsgs]  = useState(new Set()); // messageIds flagged
  const [activePanel,  setActivePanel]  = useState('files'); // 'files'|'abha'|'ddx'
  // Chat lock state — true when appointment is CANCELLED (doctor cancelled or patient cancelled)
  const [chatLocked,   setChatLocked]   = useState(false);

  const token     = useCallback(()=>getToken('DOCTOR')||'',[]);
  const showToast = useCallback(msg=>{setToast(msg);setTimeout(()=>setToast(''),3500);},[]);

  const patient    = selRoom?.patient||selRoom?.appointment?.patient;
  const patName    = patient?`${patient.firstName} ${patient.lastName}`:'Patient';
  const patInits   = patient?`${patient.firstName?.[0]||''}${patient.lastName?.[0]||''}`:'PT';
  const patContext = { conditions: patient?.conditions||[], medications: patient?.medications||[] };
  const sharedFiles= messages.filter(m=>m.type==='FILE'||m.file||m._file);

  useEffect(()=>{setMounted(true);
    const tok = getToken('DOCTOR');
    if(!tok){window.location.href='/login';return;}
    const u = getUser('DOCTOR');
    if(u?.role && u.role!=='DOCTOR'){window.location.href='/';return;}
    loadRooms();
  },[]);

  // Update chatLocked whenever selected room changes
  useEffect(()=>{
    if(!selRoom) { setChatLocked(false); return; }
    const apptStatus = selRoom.apptStatus || selRoom.appointment?.status;
    setChatLocked(['CANCELLED','NO_SHOW'].includes(apptStatus));
  },[selRoom]);

  // Socket: listen for appointment-cancelled so chat locks instantly without page refresh
  useEffect(()=>{
    // Only wire if io is available (socket.io-client)
    let io = null;
    try {
      const { io: socketIo } = require('socket.io-client');
      const tok = token();
      io = socketIo((process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api').replace('/api', ''), { auth: { token: tok }, transports: ['websocket'] });
      io.on('appointment-cancelled', ({ appointmentId, chatLocked: locked }) => {
        // If the currently selected room belongs to this appointment, lock it
        setSelRoom(prev => {
          if (!prev) return prev;
          const apptId = prev.appointment?.id;
          if (apptId === appointmentId) {
            setChatLocked(true);
            return { ...prev, chatLocked: true, apptStatus: 'CANCELLED', appointment: { ...prev.appointment, status: 'CANCELLED' } };
          }
          return prev;
        });
        // Also update in rooms list
        setRooms(prev => prev.map(r =>
          r.appointment?.id === appointmentId
            ? { ...r, chatLocked: true, apptStatus: 'CANCELLED', appointment: { ...r.appointment, status: 'CANCELLED' } }
            : r
        ));
      });
    } catch (_) { /* socket.io-client may not be installed — non-fatal */ }
    return () => { try { io?.disconnect(); } catch(_) {} };
  }, []);

  useEffect(()=>{bottomRef.current?.scrollIntoView({behavior:'smooth'});},[messages,typing]);

  useEffect(()=>{
    const pid=searchParams?.get('patientId');
    if(pid&&rooms.length>0){const room=rooms.find(r=>(r.patient||r.appointment?.patient)?.id===pid);if(room&&room.id!==selRoom?.id){setSelRoom(room);loadMessages(room.id);}}
  },[rooms,searchParams]);

  async function loadRooms(){
    setLoading(true);
    const tok = token();
    // Load BOTH rooms and all patients in parallel — always show full patient list
    const [roomsResult, patientsResult] = await Promise.allSettled([
      fetch(`${API}/chat/rooms?limit=100`, {headers:{Authorization:`Bearer ${tok}`}}).then(r=>r.ok?r.json():null).catch(()=>null),
      fetch(`${API}/doctor-data/patients`,  {headers:{Authorization:`Bearer ${tok}`}}).then(r=>r.ok?r.json():null).catch(()=>null),
    ]);

    const roomList   = roomsResult.value?.data    || roomsResult.value?.rooms    || [];
    const patList    = patientsResult.value?.data  || patientsResult.value?.patients || [];

    setRooms(roomList);

    // Build a unified patient list: all patients, each marked with their room if they have one
    const roomByPatientId = {};
    for(const room of roomList){
      const p = room.patient || room.appointment?.patient;
      if(p?.id) roomByPatientId[p.id] = room;
    }

    // Merge: start from all patients, enrich with room data
    const merged = patList.map(p => ({...p, _room: roomByPatientId[p.id]||null}));

    // Also add any patients that appear in rooms but NOT in patList (edge case)
    const patIds = new Set(patList.map(p=>p.id));
    for(const room of roomList){
      const p = room.patient || room.appointment?.patient;
      if(p?.id && !patIds.has(p.id)){
        merged.push({...p, _room: room});
        patIds.add(p.id);
      }
    }

    // Sort: patients with rooms first, then alphabetical
    merged.sort((a,b)=>{
      if(a._room && !b._room) return -1;
      if(!a._room && b._room) return 1;
      return (a.firstName||'').localeCompare(b.firstName||'');
    });

    setAllPatients(merged);

    // Auto-select: deeplink or first patient with a room
    const pid = searchParams?.get('patientId');
    const autoPatient = pid ? merged.find(p=>p.id===pid) : merged.find(p=>p._room) || merged[0];
    if(autoPatient?._room){
      setSelRoom(autoPatient._room);
      await loadMessages(autoPatient._room.id);
    }

    setLoading(false);
  }

  // Keep loadAllPatients for legacy fallback (not used in new flow)
  async function loadAllPatients(){
    const tok = token();
    try{
      const r=await fetch(`${API}/doctor-data/patients`,{headers:{Authorization:`Bearer ${tok}`}});
      if(r.ok){const d=await r.json();setAllPatients(d.data||[]);}
    }catch{}
  }

  async function loadMessages(roomId){
    try{
      const r=await fetch(`${API}/chat/rooms/${roomId}/messages`,{headers:{Authorization:`Bearer ${token()}`}});
      if(!r.ok)return;
      const d=await r.json();
      if(d.data)setMessages(d.data.map(m=>{
        const isNote = m.type==='AI_SUMMARY' || m.content?.startsWith('CLINICAL_NOTE_DATA:');
        const humanText = isNote && m.content?.includes('\n---\n')
          ? m.content.slice(m.content.indexOf('\n---\n')+5)
          : (m.content||'');
        return {...m, from:m.senderRole==='DOCTOR'?'doctor':'patient', text:humanText, time:fmtT(m.createdAt), _file:m.file, isClinicalNote:isNote};
      }));
    }catch{}
  }

  // Auto-detect script from transcript using safe Unicode escape sequences
  function detectScript(text) {
    if (!text) return 'en';
    const hi  = (text.match(/[\u0900-\u097F]/g)||[]).length; // Devanagari
    const gu  = (text.match(/[\u0A80-\u0AFF]/g)||[]).length; // Gujarati
    const tot = text.replace(/\s/g,'').length || 1;
    if (gu/tot > 0.05) return 'gu';
    if (hi/tot > 0.05) return 'hi';
    return 'en';
  }

  function startRecording() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { showToast('Voice not supported. Use Chrome or Edge.'); return; }
    const recog = new SR();
    recog.continuous=true; recog.interimResults=true;
    // Use empty string = browser uses OS/device locale automatically.
    // This lets Chrome pick the right model (en-IN, hi-IN, gu-IN) based on
    // the device language setting — no manual override needed.
    // The backend auto-detects the actual script from the transcript.
    // Use the mic language selected by the doctor
    // SpeechRecognition requires explicit BCP-47 tag — empty string defaults to
    // OS locale which may not support Hindi/Gujarati on non-Indian systems
    recog.lang = inputLang || 'en-IN';
    let full='';
    recog.onresult = e => {
      let interim='';
      for(let i=e.resultIndex;i<e.results.length;i++){
        const t=e.results[i][0].transcript;
        if(e.results[i].isFinal) full+=t+' '; else interim=t;
      }
      setRecTranscript((full+interim).trim());
    };
    recog.onerror = e => { if(e.error==='not-allowed') showToast('Mic permission denied.'); stopRecording(); };
    recog.onend = () => setRecording(false);
    recog.start(); recognRef.current=recog;
    setRecording(true); setRecTranscript('');
    showToast('🎙️ Recording… speak now');
  }

  function stopRecording() { recognRef.current?.stop(); setRecording(false); }

  async function submitVoiceNote() {
    const text=recTranscript.trim();
    if(!text||!selRoom) return;
    setSummarizing(true); stopRecording();
    try{
      const r=await fetch(`${API}/chat/rooms/${selRoom.id}/summarize-note`,{
        method:'POST', headers:{Authorization:`Bearer ${token()}`,'Content-Type':'application/json'},
        body:JSON.stringify({rawText:text, sendToChat:false, outputLang}),
      });
      const d=await r.json();
      if(r.ok&&d.success) setNoteModal({...d.summary, rawText:text, outputLang, detectedLang:d.summary?.detectedLang||'en', sections:d.sections||{}});
      else setNoteModal({bullets:[text], summary:text, rawText:text, aiGenerated:false, sections:{}});
    }catch{ setNoteModal({bullets:[text], summary:text, rawText:text, aiGenerated:false}); }
    setSummarizing(false); setRecTranscript('');
  }

  async function sendNoteToChat(note) {
    if(!selRoom) return; setSending(true);
    try{
      const r=await fetch(`${API}/chat/rooms/${selRoom.id}/summarize-note`,{
        method:'POST', headers:{Authorization:`Bearer ${token()}`,'Content-Type':'application/json'},
        body:JSON.stringify({rawText:note.rawText, sendToChat:true, outputLang:note.outputLang||'en'}),
      });
      const d=await r.json();
      if(r.ok&&d.success){
        // Add to messages if a message was created
        if(d.message){
          const m=d.message;
          const humanText = m.content?.includes('CLINICAL_NOTE_DATA:')
            ? m.content.slice(m.content.indexOf('\n---\n')+5)
            : m.content;
          setMessages(prev=>[...prev,{...m,from:'doctor',text:humanText,time:fmtT(m.createdAt),isClinicalNote:true,noteSections:d.sections}]);
        }
        showToast('📋 Clinical note saved to chat');
        // Refresh the Notes tab
        loadClinicalNotes(selRoom.id);
        setActivePanel('notes');
      } else { showToast(d.message||'Failed to send note','err'); }
    }catch(e){ showToast('Failed to send note: '+e.message); }
    setSending(false); setNoteModal(null);
  }

  // Camera state for the live preview modal
  const videoRef   = useRef(null);
  const streamRef  = useRef(null);
  const [cameraModal, setCameraModal] = useState(false);

  async function openCamera() {
    if (!selRoom) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      setCameraModal(true);
      // Attach stream to video element after modal renders
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      }, 100);
    } catch (err) {
      if (err.name === 'NotAllowedError') showToast('Camera permission denied. Please allow camera access in browser settings.');
      else if (err.name === 'NotFoundError') showToast('No camera found on this device.');
      else showToast('Camera error: ' + err.message);
    }
  }

  function closeCamera() {
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
    setCameraModal(false);
  }

  async function captureAndSend() {
    const video = videoRef.current;
    if (!video || !selRoom) return;
    const canvas = document.createElement('canvas');
    canvas.width  = video.videoWidth  || 1280;
    canvas.height = video.videoHeight || 720;
    canvas.getContext('2d').drawImage(video, 0, 0);
    closeCamera();
    canvas.toBlob(async (blob) => {
      if (!blob) { showToast('Capture failed'); return; }
      setCameraUploading(true);
      try {
        const fd = new FormData();
        fd.append('files', blob, 'photo_' + Date.now() + '.jpg'); // backend expects 'files' (plural)
        const r = await fetch(`${API}/chat/rooms/${selRoom.id}/messages/file`, {
          method: 'POST', headers: { Authorization: `Bearer ${token()}` }, body: fd,
        });
        if (r.ok) { showToast('📸 Photo shared'); loadMessages(selRoom.id); }
        else showToast('Upload failed');
      } catch { showToast('Network error'); }
      setCameraUploading(false);
    }, 'image/jpeg', 0.9);
  }

  // Legacy name kept for button onClick compatibility
  const handleCameraPhoto = openCamera;

  async function loadClinicalNotes(roomId){
    try{
      const r=await fetch(`${API}/chat/rooms/${roomId}/clinical-notes`,{headers:{Authorization:`Bearer ${token()}`}});
      const d=await r.json();
      if(r.ok&&d.success) setClinicalNotes(d.data||[]);
    }catch{}
  }

  async function sendMessage(e){
    if(e)e.preventDefault();
    const text=input.trim();if(!text||!selRoom)return;
    setSending(true);
    try{
      const r=await fetch(`${API}/chat/rooms/${selRoom.id}/messages`,{method:'POST',headers:{Authorization:`Bearer ${token()}`,'Content-Type':'application/json'},body:JSON.stringify({content:text})});
      const d=await r.json();
      if(d.success&&d.data){
        const newMsg = {...d.data,from:'doctor',text:d.data.content,time:fmtT(d.data.createdAt)};
        setMessages(p=>[...p,newMsg]);
        setInput('');
        if(inputRef.current)inputRef.current.focus();
        // Auto-detect prescription content and save to sessionStorage for appointment modal
        const isRxMsg = /tab\.|cap\.|syr\.|inj\.|mg|ml|\bbd\b|\bod\b|\btds\b|\bqid\b/i.test(d.data.content||'');
        if(isRxMsg){
          const existing = sessionStorage.getItem('mc_pending_rx')||'';
          sessionStorage.setItem('mc_pending_rx', existing ? existing+'\n'+d.data.content : d.data.content);
        }
      }
    }catch{}
    setSending(false);
  }

  async function handleFileUpload(e){
    const file=e.target.files?.[0];if(!file||!selRoom)return;e.target.value='';
    setUploading(true);showToast('⏳ Uploading…');
    try{
      const fd=new FormData();fd.append('files',file);fd.append('caption',`Dr. shared: ${file.name}`);
      const r=await fetch(`${API}/chat/rooms/${selRoom.id}/messages/file`,{method:'POST',headers:{Authorization:`Bearer ${token()}`},body:fd});
      const d=await r.json();
      if(d.success){const msgs=(d.data||[]).map(m=>({...m,from:'doctor',text:m.content,time:fmtT(m.createdAt),_file:m.file}));setMessages(p=>[...p,...msgs]);showToast('✅ File sent');}
    }catch{showToast('❌ Upload failed');}
    setUploading(false);
  }

  async function deleteMessage(messageId){
    if(!selRoom||!window.confirm('Delete this message?'))return;
    try{
      const r=await fetch(`${API}/chat/rooms/${selRoom.id}/messages/${messageId}`,{method:'DELETE',headers:{Authorization:`Bearer ${token()}`}});
      const d=await r.json();
      if(d.success)setMessages(p=>p.map(m=>m.id===messageId?{...m,isDeleted:true,content:'[Message deleted]',text:'[Message deleted]'}:m));
    }catch{}
  }

  async function handleDownload(file){
    showToast('⏳ Downloading…');
    const ok=await triggerDownload(file,token);
    if(!ok)showToast('❌ Download failed');
  }

  // Feature B: Check incoming patient message for red flags (called when loading new messages)
  async function checkMessageForRedFlags(msg) {
    if (msg.senderRole !== 'PATIENT' || !msg.content) return;
    try {
      const r = await fetch(`${API}/cdss/alerts/message-check`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ patientId: patient?.id, patientName: patName, message: msg.content, doctorId: null }),
      });
      const d = await r.json();
      if (d.success && d.created > 0) {
        setRedFlagMsgs(prev => new Set([...prev, msg.id]));
      }
    } catch {}
  }

  // Auto-run red flag check when messages load
  useEffect(() => {
    if (!patient?.id) return;
    const patientMsgs = messages.filter(m => m.senderRole === 'PATIENT' && m.content);
    patientMsgs.forEach(m => {
      // Simple local check (avoid API spam)
      const RF = ['crushing chest pain','sudden vision loss','cannot breathe','heart attack','stroke','seizure','unconscious','anaphylaxis'];
      const lower = (m.content || '').toLowerCase();
      if (RF.some(kw => lower.includes(kw))) {
        setRedFlagMsgs(prev => new Set([...prev, m.id]));
      }
    });
  }, [messages, patient]);

  function handleKeyDown(e){if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendMessage();}}

  // ── Razorpay checkout helper ───────────────────────────────────────────────
  // Call this after POST /api/appointments returns a razorpayOrder object.
  // Usage: await openRazorpayCheckout({ razorpayOrder, appointment, patientName })
  async function openRazorpayCheckout({ razorpayOrder, appointment, patientName }) {
    return new Promise((resolve, reject) => {
      // Load Razorpay script if not already loaded
      const existing = document.getElementById('razorpay-sdk');
      const doOpen = () => {
        const options = {
          key:         razorpayOrder.keyId || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || '',
          amount:      razorpayOrder.amount,   // paise
          currency:    razorpayOrder.currency || 'INR',
          name:        'MediConnect',
          description: `Appointment with Dr. ${appointment?.doctor?.firstName || ''} ${appointment?.doctor?.lastName || ''}`,
          order_id:    razorpayOrder.id,
          prefill:     { name: patientName || '', email: '', contact: '' },
          theme:       { color: BLUE },
          handler: async (response) => {
            // Verify payment on backend
            try {
              const r = await fetch(`${API}/appointments/payment/verify`, {
                method:  'POST',
                headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  appointmentId:        appointment.id,
                  razorpay_order_id:    response.razorpay_order_id,
                  razorpay_payment_id:  response.razorpay_payment_id,
                  razorpay_signature:   response.razorpay_signature,
                }),
              });
              const d = await r.json();
              if (r.ok && d.success) {
                showToast('✅ Payment successful! Appointment confirmed.');
                resolve({ success: true, data: d.data });
              } else {
                showToast('❌ Payment verification failed: ' + (d.error || 'Unknown error'));
                reject(new Error(d.error || 'Verification failed'));
              }
            } catch (e) {
              showToast('❌ Network error during payment verification.');
              reject(e);
            }
          },
          modal: {
            ondismiss: () => {
              showToast('Payment cancelled. Your appointment slot is held for 10 minutes.');
              resolve({ success: false, dismissed: true });
            },
          },
        };
        const rzp = new window.Razorpay(options);
        rzp.on('payment.failed', (response) => {
          showToast('❌ Payment failed: ' + (response.error?.description || 'Unknown error'));
          reject(new Error(response.error?.description));
        });
        rzp.open();
      };

      if (window.Razorpay) { doOpen(); return; }
      if (!existing) {
        const script = document.createElement('script');
        script.id  = 'razorpay-sdk';
        script.src = 'https://checkout.razorpay.com/v1/checkout.js';
        script.onload = doOpen;
        script.onerror = () => reject(new Error('Failed to load Razorpay SDK'));
        document.body.appendChild(script);
      } else {
        existing.addEventListener('load', doOpen);
      }
    });
  }

  if(!mounted) return <div style={{minHeight:'100vh',background:'#0c1a2e'}}/>;

  return(
    <div style={{display:'flex',height:'100vh',fontFamily:'DM Sans, sans-serif',overflow:'hidden'}}>
      {aiModal&&<AIModal fileId={aiModal.fileId} fileName={aiModal.fileName} tokenFn={token} onClose={()=>setAiModal(null)}/>}
      <DoctorSidebar active="doctorChat"/>

      <div style={{flex:1,display:'flex',overflow:'hidden'}}>

        {/* Patient list */}
        <div style={{width:240,background:'white',borderRight:`1px solid ${BORDER}`,display:'flex',flexDirection:'column',overflow:'hidden',flexShrink:0}}>
          <div style={{padding:'13px 14px',borderBottom:`1px solid ${BORDER}`,fontWeight:700,fontSize:13,color:NAVY}}>Patients</div>
          <div style={{flex:1,overflowY:'auto'}}>
            {loading&&<div style={{padding:20,textAlign:'center',color:MUTED,fontSize:13}}>Loading…</div>}

            {/* ── Unified patient list (all patients, rooms shown where available) ── */}
            {!loading&&allPatients.length===0&&(
              <div style={{padding:24,textAlign:'center'}}>
                <div style={{fontSize:36,marginBottom:8}}>👥</div>
                <div style={{fontSize:13,fontWeight:600,color:NAVY,marginBottom:6}}>No patients yet</div>
                <div style={{fontSize:12,color:MUTED,lineHeight:1.6}}>
                  Patients appear here after they book an appointment with you and you confirm it.
                </div>
                <button onClick={()=>router.push('/doctor/appointments')}
                  style={{marginTop:12,padding:'8px 16px',background:BLUE,color:'white',border:'none',borderRadius:8,fontSize:12,fontWeight:600,cursor:'pointer'}}>
                  View Appointments
                </button>
              </div>
            )}
            {!loading&&allPatients.map(p=>{
              const room   = p._room;
              const isSel  = room ? selRoom?.id===room.id : false;
              const inits  = `${p.firstName?.[0]||''}${p.lastName?.[0]||''}`.toUpperCase()||'PT';
              const unread = (room?.unreadCount||0)>0;
              const hasChat = !!room;
              const isLocked = room?.chatLocked || ['CANCELLED','NO_SHOW'].includes(room?.apptStatus || room?.appointment?.status);
              return(
                <div key={p.id}
                  onClick={()=>{
                    if(hasChat){ setSelRoom(room); loadMessages(room.id); setRedFlagMsgs(new Set()); }
                    else { setSelRoom({_noRoom:true, patient:p, id:'no-room-'+p.id}); setMessages([]); }
                  }}
                  style={{padding:'11px 14px',borderBottom:`1px solid ${BORDER}`,cursor:'pointer',
                    background:isSel?BLUE_P:'transparent',
                    borderLeft:`3px solid ${isSel?BLUE:'transparent'}`,transition:'all 0.15s'}}>
                  <div style={{display:'flex',alignItems:'center',gap:10}}>
                    <div style={{width:36,height:36,borderRadius:'50%',
                      background:isLocked?'#fee2e2':BLUE_P,color:isLocked?RED:BLUE,
                      display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:700,flexShrink:0,position:'relative'}}>
                      {inits}
                      {unread&&!isLocked&&<div style={{position:'absolute',top:-2,right:-2,width:8,height:8,borderRadius:'50%',background:RED,border:'1.5px solid white'}}/>}
                      {isLocked&&<div style={{position:'absolute',bottom:-2,right:-2,width:12,height:12,borderRadius:'50%',background:'#dc2626',border:'1.5px solid white',display:'flex',alignItems:'center',justifyContent:'center',fontSize:7}}>🔒</div>}
                    </div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:13,fontWeight:isSel?700:600,color:isLocked?MUTED:NAVY,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                        {p.firstName} {p.lastName}
                      </div>
                      {hasChat
                        ? <div style={{fontSize:11,color:isLocked?RED:MUTED,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                            {isLocked ? '🔒 Appointment cancelled' : (room.lastMessage?.content||'💬 No messages yet')}
                          </div>
                        : <div style={{fontSize:11,color:MUTED,fontStyle:'italic'}}>No chat room — book appointment</div>
                      }
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Chat */}
        {!selRoom?(
          <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',flexDirection:'column',gap:10,color:MUTED,background:SURFACE}}>
            <div style={{fontSize:40}}>💬</div><div style={{fontSize:14,fontWeight:600,color:SEC}}>Select a patient to start chatting</div>
          </div>
        ):selRoom?._noRoom?(
          <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',flexDirection:'column',gap:16,padding:40,background:SURFACE}}>
            <div style={{fontSize:48}}>💬</div>
            <div style={{fontWeight:700,fontSize:17,color:NAVY}}>
              {selRoom.patient?.firstName} {selRoom.patient?.lastName}
            </div>
            <div style={{fontSize:13.5,color:SEC,textAlign:'center',maxWidth:360,lineHeight:1.7}}>
              No active chat room yet. Chat rooms are created automatically when this patient books an appointment and you confirm it.
            </div>
            <button onClick={()=>router.push('/doctor/appointments')}
              style={{padding:'10px 24px',background:BLUE,color:'white',border:'none',borderRadius:10,fontSize:13,fontWeight:700,cursor:'pointer'}}>
              📅 Go to Appointments
            </button>
          </div>
        ):(
          <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
            {/* Header */}
            <div style={{background:'white',borderBottom:`1px solid ${BORDER}`,padding:'11px 20px',display:'flex',alignItems:'center',gap:12,flexShrink:0}}>
              <div style={{width:36,height:36,borderRadius:'50%',background:BLUE_P,color:BLUE,display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:700,flexShrink:0}}>{patInits}</div>
              <div style={{flex:1}}><div style={{fontSize:14,fontWeight:600,color:NAVY}}>{patName}</div><div style={{fontSize:11,color:MUTED}}>{patient?.conditions?.slice(0,2).map(c=>c.condition||c).join(' · ') || 'No conditions recorded'}</div></div>
              <button onClick={()=>router.push(`/doctor/reports?patientId=${patient?.id}`)} style={{padding:'6px 12px',background:BLUE_P,color:BLUE,border:'none',borderRadius:8,fontSize:12,fontWeight:700,cursor:'pointer'}}>📋 Reports</button>
              <button onClick={()=>showToast('Video call launching…')} style={{padding:'6px 12px',background:'white',color:SEC,border:`1px solid ${BORDER}`,borderRadius:8,fontSize:12,cursor:'pointer'}}>🎥 Video</button>
            </div>

            {/* Messages */}
            <div style={{flex:1,overflowY:'auto',padding:'16px 20px',paddingRight:44,display:'flex',flexDirection:'column',gap:14,background:SURFACE}}>
              {messages.map((msg,i)=>{
                const isMe=msg.from==='doctor'||msg.senderRole==='DOCTOR';
                const isFile=msg.type==='FILE'||!!(msg.file||msg._file);
                const isRF=redFlagMsgs.has(msg.id);
                return(<div key={msg.id||i} style={{display:'flex',flexDirection:'column',maxWidth:'72%',alignSelf:isMe?'flex-end':'flex-start',alignItems:isMe?'flex-end':'flex-start'}}>
                  {isFile
                    ?<FileBubble msg={msg} isMe={isMe} onDelete={deleteMessage} onDownload={handleDownload} onAnalyze={(fid,fn)=>setAiModal({fileId:fid,fileName:fn})} patientId={!isMe?patient?.id:null} tokenFn={token}/>
                    :msg.isClinicalNote?(
                  <div style={{background:'#f0fdf4',border:'1px solid #86efac',borderRadius:12,padding:'10px 14px',maxWidth:400}}>
                    <div style={{fontSize:10,fontWeight:700,color:'#166534',marginBottom:6,display:'flex',alignItems:'center',gap:6}}>
                      📋 CLINICAL NOTE
                    </div>
                    {(()=>{
                      // Strip CLINICAL_NOTE_DATA: header if present, show only human-readable bullets
                      let displayText = msg.text || '';
                      if(displayText.startsWith('CLINICAL_NOTE_DATA:')){
                        const sep = displayText.indexOf('\n---\n');
                        displayText = sep>=0 ? displayText.slice(sep+5) : displayText;
                      }
                      return displayText.split('\n').filter(l=>l.trim()).map((line,li)=>(
                        <div key={li} style={{fontSize:13,color:'#1e293b',lineHeight:1.65,padding:'1px 0'}}>{line}</div>
                      ));
                    })()}
                  </div>
                ):isMe&&/tab\.|cap\.|syr\.|inj\.|mg\b|ml\b|\bbd\b|\bod\b|\btds\b/i.test(msg.text||'')?(
                  <div style={{position:'relative'}}>
                    <div style={{background:'#fff7ed',border:'1px solid #fed7aa',borderRadius:12,padding:'10px 14px',maxWidth:400,borderBottomRightRadius:4}}>
                      <div style={{fontSize:10,fontWeight:700,color:'#9a3412',marginBottom:5}}>💊 PRESCRIPTION MESSAGE</div>
                      <div style={{fontSize:13,color:'#1e293b',lineHeight:1.65,whiteSpace:'pre-wrap'}}>{msg.text}</div>
                      <div style={{fontSize:10,color:'#c2410c',marginTop:5,fontStyle:'italic'}}>
                        This will be auto-included when you complete the appointment
                      </div>
                    </div>
                    {isMe&&<button onClick={()=>onDelete(msg.id)} style={{position:'absolute',top:-8,right:-8,width:22,height:22,borderRadius:'50%',background:RED,color:'white',border:'2px solid white',cursor:'pointer',fontSize:11,display:'flex',alignItems:'center',justifyContent:'center',fontWeight:700,boxShadow:'0 1px 4px rgba(0,0,0,0.2)',zIndex:2}}>×</button>}
                  </div>
                ):<TextBubble msg={msg} isMe={isMe} onDelete={deleteMessage} isRedFlag={isRF&&!isMe}/>
                  }
                  <div style={{fontSize:10,color:MUTED,marginTop:3,fontFamily:'monospace'}}>{isMe?'You (Dr.)':patName} · {msg.time}</div>
                </div>);
              })}
              {typing&&<div style={{alignSelf:'flex-start',padding:'10px 16px',background:'white',border:`1px solid ${BORDER}`,borderRadius:14,display:'flex',gap:4,alignItems:'center'}}>{[0,0.2,0.4].map(d=><div key={d} style={{width:6,height:6,borderRadius:'50%',background:MUTED,animation:`dcBounce 1.2s infinite ${d}s`}}/>)}</div>}
              <div ref={bottomRef}/>
            </div>

            {/* Compose */}
            <div style={{background:'white',borderTop:`1px solid ${BORDER}`,padding:'10px 16px',flexShrink:0}}>
              {/* Language selector — always visible when not recording */}
              {!recording&&!summarizing&&(
                <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:8,flexWrap:'wrap'}}>
                  {/* Mic language — controls SpeechRecognition.lang */}
                  <div style={{display:'flex',alignItems:'center',gap:5}}>
                    <span style={{fontSize:11,color:MUTED,fontWeight:600,whiteSpace:'nowrap'}}>🎙️ Mic:</span>
                    {[{code:'en-IN',label:'English'},{code:'hi-IN',label:'हिंदी'},{code:'gu-IN',label:'Gujarati'}].map(l=>(
                      <button key={l.code} onClick={()=>setInputLang(l.code)}
                        style={{padding:'3px 10px',borderRadius:20,border:`1.5px solid ${inputLang===l.code?BLUE:BORDER}`,
                          background:inputLang===l.code?BLUE_P:'white',color:inputLang===l.code?BLUE:MUTED,
                          fontSize:11.5,fontWeight:inputLang===l.code?700:400,cursor:'pointer'}}>
                        {l.label}
                      </button>
                    ))}
                  </div>
                  <div style={{width:1,height:18,background:BORDER}}/>
                  {/* Summary language — controls outputLang sent to backend for translation */}
                  <div style={{display:'flex',alignItems:'center',gap:5}}>
                    <span style={{fontSize:11,color:MUTED,fontWeight:600,whiteSpace:'nowrap'}}>📋 Summary:</span>
                    {[{code:'en',label:'English'},{code:'hi',label:'हिंदी'},{code:'gu',label:'Gujarati'}].map(l=>(
                      <button key={l.code} onClick={()=>setOutputLang(l.code)}
                        style={{padding:'3px 10px',borderRadius:20,border:`1.5px solid ${outputLang===l.code?'#7c3aed':BORDER}`,
                          background:outputLang===l.code?'#ede9fe':'white',color:outputLang===l.code?'#7c3aed':MUTED,
                          fontSize:11.5,fontWeight:outputLang===l.code?700:400,cursor:'pointer'}}>
                        {l.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Voice recording banner */}
              {(recording||recTranscript||summarizing)&&(
                <div style={{background:recording?'#fef2f2':'#f0fdf4',border:`1px solid ${recording?'#fca5a5':'#86efac'}`,borderRadius:10,padding:'8px 12px',marginBottom:8,fontSize:12.5}}>
                  {summarizing?(
                    <div style={{display:'flex',alignItems:'center',gap:8,color:'#166534'}}>
                      <span style={{display:'inline-block',width:12,height:12,border:'2px solid #16a34a',borderTopColor:'transparent',borderRadius:'50%',animation:'spin 0.8s linear infinite'}}/>
                      AI is summarizing your note…
                    </div>
                  ):recording?(
                    <div>
                      <div style={{display:'flex',alignItems:'center',gap:8,color:'#991b1b',fontWeight:600,marginBottom:4}}>
                        <span style={{width:8,height:8,background:'#ef4444',borderRadius:'50%',animation:'rfBlink 1s infinite',display:'inline-block'}}/>
                        Recording… speak now
                      </div>
                      {recTranscript&&<div style={{color:'#374151',fontStyle:'italic',fontSize:12,lineHeight:1.5,maxHeight:60,overflowY:'auto'}}>{recTranscript}</div>}
                      <div style={{display:'flex',gap:8,marginTop:6}}>
                        <button onClick={submitVoiceNote} disabled={!recTranscript}
                          style={{padding:'4px 12px',background:'#16a34a',color:'white',border:'none',borderRadius:6,fontSize:12,fontWeight:700,cursor:recTranscript?'pointer':'not-allowed',opacity:recTranscript?1:0.5}}>
                          ✓ Done — Summarize
                        </button>
                        <button onClick={stopRecording}
                          style={{padding:'4px 12px',background:'#ef4444',color:'white',border:'none',borderRadius:6,fontSize:12,fontWeight:600,cursor:'pointer'}}>
                          ✕ Cancel
                        </button>
                      </div>
                    </div>
                  ):(
                    <div style={{display:'flex',alignItems:'center',gap:8,color:'#166534'}}>
                      <span>✓ Transcription ready</span>
                      <button onClick={submitVoiceNote} style={{padding:'3px 10px',background:'#16a34a',color:'white',border:'none',borderRadius:5,fontSize:11.5,cursor:'pointer',fontWeight:600}}>
                        Summarize with AI
                      </button>
                    </div>
                  )}
                </div>
              )}

              {(uploading||cameraUploading)&&<div style={{fontSize:12,color:BLUE,marginBottom:6}}>⏳ Uploading…</div>}

              {/* ── Chat locked banner (shown when appointment is cancelled) ── */}
              {chatLocked ? (
                <div style={{background:'#fef2f2',border:'1px solid #fca5a5',borderRadius:12,padding:'14px 18px',textAlign:'center'}}>
                  <div style={{fontSize:16,marginBottom:6}}>🔒</div>
                  <div style={{fontSize:13,fontWeight:700,color:RED,marginBottom:4}}>Chat Disabled</div>
                  <div style={{fontSize:12,color:'#7f1d1d',lineHeight:1.6}}>
                    This appointment has been cancelled. No further messages can be sent.
                  </div>
                </div>
              ) : (
              <form onSubmit={sendMessage} style={{display:'flex',gap:6,alignItems:'flex-end'}}>
                {/* Hidden inputs */}
                <input type="file" ref={fileRef} onChange={handleFileUpload} style={{display:'none'}} accept=".pdf,.jpg,.jpeg,.png,.webp,.dcm,.doc,.docx"/>
                {/* Camera handled via getUserMedia — no hidden input needed */}

                {/* Attach file */}
                <button type="button" onClick={()=>fileRef.current?.click()} title="Attach file"
                  style={{width:36,height:36,borderRadius:9,border:`1px solid ${BORDER}`,background:'white',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',fontSize:17,flexShrink:0}}>
                  {uploading?'⏳':'📎'}
                </button>

                {/* Camera — take physical note photo */}
                <button type="button" onClick={openCamera} title="Take photo of physical notes"
                  style={{width:36,height:36,borderRadius:9,border:`1px solid ${BORDER}`,background:'white',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',fontSize:17,flexShrink:0}}>
                  {cameraUploading?'⏳':'📷'}
                </button>

                {/* Voice record button */}
                <button type="button" onClick={recording?stopRecording:startRecording}
                  title={recording?'Stop recording':'Start voice recording'}
                  style={{width:36,height:36,borderRadius:9,border:`1px solid ${recording?'#ef4444':BORDER}`,
                    background:recording?'#fef2f2':'white',display:'flex',alignItems:'center',
                    justifyContent:'center',cursor:'pointer',fontSize:17,flexShrink:0,
                    animation:recording?'rfBlink 1.5s infinite':undefined}}>
                  🎙️
                </button>

                {/* Text input */}
                <textarea ref={inputRef} value={input} onChange={e=>setInput(e.target.value)} onKeyDown={handleKeyDown}
                  placeholder="Type a message or clinical note… (Enter to send)"
                  rows={1} style={{flex:1,border:`1px solid ${BORDER}`,borderRadius:10,padding:'8px 12px',fontSize:13,
                    resize:'none',outline:'none',fontFamily:'DM Sans, sans-serif',minHeight:36,maxHeight:120}}/>

                {/* Send */}
                <button type="submit" disabled={!input.trim()||sending}
                  style={{padding:'0 18px',height:36,background:input.trim()&&!sending?BLUE:'#90a4ae',color:'white',
                    border:'none',borderRadius:10,fontSize:13,fontWeight:600,
                    cursor:input.trim()&&!sending?'pointer':'default',flexShrink:0}}>
                  {sending?'…':'Send'}
                </button>
              </form>
              )}
            </div>
          </div>
        )}

        {/* Right panel — 3 tabs: Files / ABHA / DDx */}
        {selRoom&&(
          <div style={{width:280,flexShrink:0,background:'white',borderLeft:`1px solid ${BORDER}`,display:'flex',flexDirection:'column',overflow:'hidden'}}>
            {/* Tab bar */}
            <div style={{display:'flex',borderBottom:`1px solid ${BORDER}`,flexShrink:0}}>
              {[{id:'files',icon:'📁',label:'Files'},{id:'notes',icon:'📋',label:'Notes'},{id:'abha',icon:'🏥',label:'ABHA'},{id:'ddx',icon:'🔬',label:'DDx'}].map(tab=>(
                <button key={tab.id} onClick={()=>setActivePanel(tab.id)}
                  style={{flex:1,padding:'10px 0',border:'none',background:'transparent',cursor:'pointer',fontSize:11,fontWeight:activePanel===tab.id?700:500,color:activePanel===tab.id?BLUE:MUTED,borderBottom:activePanel===tab.id?`2px solid ${BLUE}`:'2px solid transparent',marginBottom:-1,display:'flex',flexDirection:'column',alignItems:'center',gap:2}}>
                  <span style={{fontSize:14}}>{tab.icon}</span>{tab.label}
                </button>
              ))}
            </div>

            <div style={{flex:1,overflowY:'auto',padding:12}}>

              {/* Files tab */}
              {activePanel==='files'&&(<>
                <div style={{fontSize:10,fontFamily:'monospace',color:MUTED,letterSpacing:'0.06em',marginBottom:8}}>SHARED FILES ({sharedFiles.length})</div>
                {sharedFiles.length===0&&<div style={{fontSize:12,color:MUTED,textAlign:'center',padding:'20px 0'}}><div style={{fontSize:24,marginBottom:8}}>📁</div>No files shared yet.</div>}
                {sharedFiles.slice().reverse().map((m,i)=>{
                  const file=m.file||m._file;if(!file)return null;const ext=(file.storageKey||file.fileName||'').split('.').pop().toLowerCase();
                  return(<div key={i} style={{display:'flex',gap:8,padding:'8px 0',borderBottom:`1px solid ${BORDER}`}}>
                    <div style={{width:28,height:28,borderRadius:7,background:FBG(ext),display:'flex',alignItems:'center',justifyContent:'center',fontSize:13,flexShrink:0}}>{FICON(ext)}</div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:11,fontWeight:600,color:NAVY,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{file.fileName}</div>
                      <div style={{fontSize:10,color:MUTED}}>{fmtSz(file.fileSize)} · {fmtD(m.createdAt||m.time)}</div>
                      <div style={{display:'flex',gap:6,marginTop:3}}>
                        <button onClick={()=>handleDownload(file)} style={{fontSize:10,color:BLUE,fontWeight:700,background:'none',border:'none',cursor:'pointer',padding:0}}>↓ Download</button>
                        {file.id&&<button onClick={()=>setAiModal({fileId:file.id,fileName:file.fileName})} style={{fontSize:10,color:NAVY,fontWeight:700,background:'none',border:'none',cursor:'pointer',padding:0}}>🧠 AI</button>}
                      </div>
                    </div>
                  </div>);
                })}
                <button type="button" onClick={()=>fileRef.current?.click()} style={{width:'100%',marginTop:10,padding:'8px 0',border:`2px dashed ${BORDER}`,borderRadius:10,background:'none',cursor:'pointer',fontSize:12,color:MUTED,fontFamily:'DM Sans, sans-serif'}}>📎 Send a file</button>

                {/* Quick patient info */}
                {patient&&<div style={{marginTop:12,paddingTop:12,borderTop:`1px solid ${BORDER}`}}>
                  <div style={{fontSize:10,fontFamily:'monospace',color:MUTED,letterSpacing:'0.06em',marginBottom:6}}>PATIENT INFO</div>
                  {(patient.conditions||[]).slice(0,3).map(c=><div key={c.condition||c} style={{background:AMBER_P,borderRadius:5,padding:'3px 8px',marginBottom:4,fontSize:11,color:AMBER,fontWeight:500}}>{c.condition||c}</div>)}
                  {(patient.medications||[]).slice(0,3).map(m=><div key={m.name||m} style={{background:BLUE_P,borderRadius:5,padding:'3px 8px',marginBottom:4,fontSize:11,color:BLUE,fontWeight:500}}>{m.name||m}{m.dose?` ${m.dose}`:''}</div>)}
                </div>}
              </>)}

              {/* Clinical Notes tab — shows both AI notes AND doctor's chat messages */}
              {activePanel==='notes'&&(
                <div>
                  {/* Clinical notes from voice recordings */}
                  {clinicalNotes.length>0&&(
                    <>
                      <div style={{fontSize:10,fontFamily:'monospace',color:MUTED,letterSpacing:'0.06em',marginBottom:8}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
                    <div style={{fontSize:10,fontFamily:'monospace',color:MUTED,letterSpacing:'0.06em'}}>
                      CLINICAL NOTES ({clinicalNotes.length})
                    </div>
                    <button onClick={()=>{
                        const rxPat=/tab\.|cap\.|syr\.|inj\.|mg\b|ml\b|\bbd\b|\bod\b|\btds\b/i;
                        const rxMsgs=messages.filter(m=>m.from==='doctor'&&m.text&&m.text!=='[Message deleted]'&&rxPat.test(m.text)).map(m=>m.text);
                        if(rxMsgs.length){sessionStorage.setItem('mc_pending_rx',rxMsgs.join('\n'));showToast('💊 '+rxMsgs.length+' prescription(s) ready — open Complete Appointment to use');}
                        else showToast('No prescription messages found in chat yet');
                      }}
                      style={{fontSize:10,padding:'3px 8px',background:'#0e7490',color:'white',border:'none',borderRadius:5,cursor:'pointer',fontWeight:600,flexShrink:0}}>
                      💊 Save All Rx
                    </button>
                  </div>
                      </div>
                      {clinicalNotes.map((note,i)=>(
                        <div key={note.id||i} style={{background:'#f0fdf4',border:'1px solid #86efac',borderRadius:10,padding:'10px 12px',marginBottom:8}}>
                          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}>
                            <span style={{fontSize:10,fontWeight:700,color:note.urgency==='critical'?RED:note.urgency==='urgent'?AMBER:'#166534',
                              background:note.urgency==='critical'?RED_P:note.urgency==='urgent'?AMBER_P:'#dcfce7',
                              padding:'2px 7px',borderRadius:99}}>
                              📋 {note.category?.toUpperCase()||'CLINICAL NOTE'}
                            </span>
                            <span style={{fontSize:10,color:MUTED}}>{fmtD(note.createdAt)}</span>
                          </div>
                          {/* Show sections if available, else show bullets/content lines */}
                          {note.sections && Object.values(note.sections).some(v=>v?.trim()) ? (
                            <div>
                              {[
                                {key:'notes',        icon:'📝', label:'Notes'},
                                {key:'prescription', icon:'💊', label:'Prescription'},
                                {key:'followUp',     icon:'📅', label:'Follow-Up'},
                                {key:'others',       icon:'💡', label:'Others'},
                              ].filter(s=>note.sections[s.key]?.trim()).map(s=>(
                                <div key={s.key} style={{marginBottom:5}}>
                                  <div style={{fontSize:10,fontWeight:700,color:MUTED,marginBottom:2}}>{s.icon} {s.label}</div>
                                  <div style={{fontSize:11.5,color:'#1e293b',lineHeight:1.6,whiteSpace:'pre-wrap',paddingLeft:8}}>{note.sections[s.key]}</div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            (note.bullets?.length ? note.bullets : (note.content||'').split('\n').filter(l=>l.trim())).map((b,j)=>(
                              <div key={j} style={{fontSize:12,color:'#1e293b',lineHeight:1.65,padding:'1px 0'}}>{b}</div>
                            ))
                          )}
                          {note.tags?.length>0&&(
                            <div style={{display:'flex',gap:4,flexWrap:'wrap',marginTop:5}}>
                              {note.tags.map(t=>(
                                <span key={t} style={{fontSize:10,background:BLUE_P,color:BLUE,padding:'1px 6px',borderRadius:99}}>{t}</span>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </>
                  )}

                  {/* Doctor's chat messages — prescriptions and notes typed in chat */}
                  {(()=>{
                    const docMsgs = messages.filter(m =>
                      m.from === 'doctor' &&
                      m.text && m.text !== '[Message deleted]' &&
                      !m.isClinicalNote &&
                      !m._file && !m.file
                    );
                    if (docMsgs.length === 0 && clinicalNotes.length === 0) {
                      return (
                        <div style={{textAlign:'center',padding:'24px 0',color:MUTED}}>
                          <div style={{fontSize:28,marginBottom:8}}>📋</div>
                          <div style={{fontSize:12,fontWeight:600}}>No notes yet</div>
                          <div style={{fontSize:11,marginTop:4,lineHeight:1.6}}>
                            Messages you type in chat appear here.<br/>
                            Use 🎙️ for AI-structured notes.
                          </div>
                        </div>
                      );
                    }
                    if (docMsgs.length === 0) return null;
                    return (
                      <>
                        <div style={{fontSize:10,fontFamily:'monospace',color:MUTED,letterSpacing:'0.06em',marginBottom:8,marginTop:clinicalNotes.length>0?12:0}}>
                          MESSAGES FROM YOU ({docMsgs.length})
                        </div>
                        {docMsgs.map((m,i)=>{
                          const isRx = /tab\.|cap\.|syr\.|inj\.|mg|ml|bd|od|tds|qid|once|twice|daily/i.test(m.text||'');
                          return (
                            <div key={m.id||i} style={{background:isRx?'#fff7ed':'#f8fafc',
                              border:`1px solid ${isRx?'#fed7aa':BORDER}`,borderRadius:9,
                              padding:'8px 11px',marginBottom:6}}>
                              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:4}}>
                                <span style={{fontSize:10,fontWeight:700,
                                  color:isRx?'#9a3412':'#475569',
                                  background:isRx?'#ffedd5':'#f1f5f9',
                                  padding:'2px 7px',borderRadius:99}}>
                                  {isRx?'💊 PRESCRIPTION':'💬 NOTE'}
                                </span>
                                <div style={{display:'flex',alignItems:'center',gap:6}}>
                                  <span style={{fontSize:10,color:MUTED}}>{m.time}</span>
                                  {isRx&&(
                                    <button onClick={()=>{
                                      // Copy Rx to sessionStorage so appointment modal can read it
                                      const existing = sessionStorage.getItem('mc_pending_rx')||'';
                                      const combined = existing ? existing+'\n'+m.text : m.text;
                                      sessionStorage.setItem('mc_pending_rx', combined);
                                      showToast('💊 Prescription saved — will auto-fill in Complete Appointment modal');
                                    }}
                                      style={{fontSize:10,padding:'2px 8px',background:'#0e7490',color:'white',
                                        border:'none',borderRadius:5,cursor:'pointer',fontWeight:600}}>
                                      + Save Rx
                                    </button>
                                  )}
                                </div>
                              </div>
                              <div style={{fontSize:12,color:'#1e293b',lineHeight:1.65,whiteSpace:'pre-wrap'}}>{m.text}</div>
                            </div>
                          );
                        })}
                      </>
                    );
                  })()}

                  <button onClick={()=>loadClinicalNotes(selRoom?.id)}
                    style={{width:'100%',padding:'7px',border:`1px dashed ${BORDER}`,borderRadius:8,background:'none',
                      cursor:'pointer',fontSize:11.5,color:MUTED,fontFamily:'DM Sans, sans-serif',marginTop:6}}>
                    ↻ Refresh
                  </button>
                </div>
              )}

              {/* Feature C: ABHA tab */}
              {activePanel==='abha'&&<AbhaPanel patientId={patient?.id} tokenFn={token}/>}

              {/* Feature D: DDx tab */}
              {activePanel==='ddx'&&<DdxPanel patientId={patient?.id} messages={messages} patientContext={patContext} tokenFn={token}/>}
            </div>
          </div>
        )}
      </div>

      {/* ── Voice Note Review Modal ── */}
      {noteModal&&(
        <div onClick={e=>{if(e.target===e.currentTarget)setNoteModal(null);}}
          style={{position:'fixed',inset:0,background:'rgba(12,26,46,0.6)',zIndex:400,display:'flex',alignItems:'center',justifyContent:'center',padding:20}}>
          <div style={{background:'white',borderRadius:16,width:'100%',maxWidth:520,boxShadow:'0 12px 48px rgba(0,0,0,0.25)',fontFamily:'DM Sans, sans-serif',overflow:'hidden'}}>
            {/* Header */}
            <div style={{background:NAVY,padding:'14px 20px',display:'flex',alignItems:'center',gap:10}}>
              <div style={{fontSize:14,fontWeight:700,color:'white',flex:1}}>
                📋 Clinical Note Summary
                {noteModal.aiGenerated&&<span style={{fontSize:10,background:'rgba(255,255,255,0.15)',color:'rgba(255,255,255,0.8)',padding:'2px 8px',borderRadius:99,marginLeft:8}}>AI Enhanced</span>}
                {noteModal.detectedLang&&noteModal.detectedLang!=='en'&&(
                  <span style={{fontSize:10,background:'rgba(255,255,255,0.15)',color:'rgba(255,255,255,0.8)',padding:'2px 8px',borderRadius:99,marginLeft:4}}>
                    🎙️ {noteModal.detectedLang==='hi'?'हिंदी detected':'ગુજરાતી detected'}
                  </span>
                )}
                {noteModal.outputLang&&noteModal.outputLang!=='en'&&(
                  <span style={{fontSize:10,background:'rgba(255,255,255,0.12)',color:'rgba(255,255,255,0.75)',padding:'2px 8px',borderRadius:99,marginLeft:4}}>
                    📋 {noteModal.outputLang==='hi'?'हिंदी':'ગુજરાતી'}
                  </span>
                )}
              </div>
              <button onClick={()=>setNoteModal(null)} style={{background:'rgba(255,255,255,0.1)',border:'none',color:'white',width:28,height:28,borderRadius:'50%',cursor:'pointer',fontSize:15}}>×</button>
            </div>

            {/* Bullet points */}
            <div style={{padding:'16px 20px',maxHeight:320,overflowY:'auto'}}>
              <div style={{fontSize:12,fontWeight:700,color:MUTED,textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:10}}>Key Points</div>
              {(noteModal.bullets||[]).map((b,i)=>(
                <div key={i} style={{display:'flex',gap:8,padding:'6px 0',borderBottom:i<noteModal.bullets.length-1?`1px solid ${BORDER}`:'none'}}>
                  <span style={{color:BLUE,flexShrink:0,marginTop:1}}>•</span>
                  <span style={{fontSize:13,color:'#1e293b',lineHeight:1.6}}>{b.replace(/^[•\-]\s*/,'')}</span>
                </div>
              ))}

              {noteModal.category&&(
                <div style={{display:'flex',gap:8,marginTop:12,flexWrap:'wrap'}}>
                  <span style={{fontSize:11,background:BLUE_P,color:BLUE,padding:'3px 10px',borderRadius:99,fontWeight:600}}>{noteModal.category}</span>
                  {noteModal.urgency&&noteModal.urgency!=='routine'&&(
                    <span style={{fontSize:11,background:noteModal.urgency==='critical'?RED_P:AMBER_P,
                      color:noteModal.urgency==='critical'?RED:AMBER,padding:'3px 10px',borderRadius:99,fontWeight:600}}>
                      {noteModal.urgency==='critical'?'🚨 Critical':'⚠️ Urgent'}
                    </span>
                  )}
                  {(noteModal.tags||[]).map(t=><span key={t} style={{fontSize:11,background:'#f1f5f9',color:'#475569',padding:'3px 8px',borderRadius:99}}>{t}</span>)}
                </div>
              )}

              {/* Extracted Sections */}
              {noteModal.sections && Object.values(noteModal.sections).some(v=>v?.trim()) && (
                <div style={{marginTop:14}}>
                  <div style={{fontSize:12,fontWeight:700,color:MUTED,textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:8}}>
                    ✨ Auto-extracted sections
                  </div>
                  {[
                    {key:'notes',        icon:'📝', label:'Clinical Notes',    color:NAVY,  bg:'#f8fafc'},
                    {key:'prescription', icon:'💊', label:'Prescription',      color:'#9a3412', bg:'#fff7ed'},
                    {key:'followUp',     icon:'📅', label:'Follow-Up',         color:BLUE,  bg:BLUE_P},
                    {key:'others',       icon:'💡', label:'Other Instructions', color:GREEN, bg:GREEN_P},
                  ].filter(s=>noteModal.sections[s.key]?.trim()).map(s=>(
                    <div key={s.key} style={{background:s.bg,borderRadius:9,padding:'9px 12px',marginBottom:6,border:`1px solid ${s.color}20`}}>
                      <div style={{fontSize:11,fontWeight:700,color:s.color,marginBottom:4}}>{s.icon} {s.label}</div>
                      <div style={{fontSize:12,color:'#1e293b',lineHeight:1.65,whiteSpace:'pre-wrap'}}>{noteModal.sections[s.key]}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* Original transcript */}
              <details style={{marginTop:12}}>
                <summary style={{fontSize:11.5,color:MUTED,cursor:'pointer',userSelect:'none'}}>Original transcript</summary>
                <div style={{fontSize:12,color:'#64748b',lineHeight:1.6,marginTop:6,padding:'8px',background:'#f8fafc',borderRadius:7,fontStyle:'italic'}}>
                  {noteModal.rawText}
                </div>
              </details>
            </div>

            {/* Actions */}
            <div style={{padding:'12px 20px',borderTop:`1px solid ${BORDER}`,display:'flex',gap:10}}>
              <button onClick={()=>sendNoteToChat(noteModal)} disabled={sending}
                style={{flex:1,padding:'10px',background:sending?'#93c5fd':BLUE,color:'white',border:'none',
                  borderRadius:9,fontSize:13.5,fontWeight:700,cursor:sending?'not-allowed':'pointer'}}>
                {sending?'⏳ Saving…':'📋 Send to Chat & Save'}
              </button>
              <button onClick={()=>setNoteModal(null)}
                style={{padding:'10px 18px',background:'#f1f5f9',color:'#475569',border:`1px solid ${BORDER}`,
                  borderRadius:9,fontSize:13.5,fontWeight:600,cursor:'pointer'}}>
                Discard
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Camera Preview Modal ── */}
      {cameraModal&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.92)',zIndex:800,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:16}}>
          <div style={{fontSize:14,color:'white',fontWeight:600}}>📷 Position your photo and tap Capture</div>
          <video ref={videoRef} autoPlay playsInline muted
            style={{width:'min(90vw,640px)',height:'auto',borderRadius:12,border:'3px solid white',background:'#000'}}
          />
          <div style={{display:'flex',gap:16}}>
            <button onClick={captureAndSend}
              style={{padding:'12px 32px',background:'white',color:'#0c1a2e',border:'none',borderRadius:10,
                fontSize:15,fontWeight:700,cursor:'pointer'}}>
              📸 Capture & Send
            </button>
            <button onClick={closeCamera}
              style={{padding:'12px 24px',background:'rgba(255,255,255,0.15)',color:'white',border:'1px solid rgba(255,255,255,0.3)',
                borderRadius:10,fontSize:15,fontWeight:600,cursor:'pointer'}}>
              ✕ Cancel
            </button>
          </div>
        </div>
      )}

      {toast&&<div style={{position:'fixed',bottom:24,right:24,background:NAVY,color:'white',padding:'12px 20px',borderRadius:12,fontSize:13,zIndex:9999,boxShadow:'0 4px 20px rgba(0,0,0,0.2)',maxWidth:380}}>{toast}</div>}
      <style>{`@keyframes dcBounce{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}} @keyframes rfBlink{0%,100%{opacity:1}50%{opacity:0.3}} @keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

export default function DoctorChatPage() {
  return (
    <Suspense fallback={<div style={{display:'flex',height:'100vh',alignItems:'center',justifyContent:'center',fontFamily:'DM Sans, sans-serif',color:'#8896a7'}}>Loading…</div>}>
      <DoctorChatPageInner/>
    </Suspense>
  );
}

