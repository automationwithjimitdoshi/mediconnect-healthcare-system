'use client';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
/**
 * src/app/doctor/appointments/page.js
 *
 * FIX: Removed broken imports:
 *   ✗ import AppLayout from '@/components/AppLayout'
 *   ✗ import { C, card, statusPill, btn } from '@/lib/styles'
 *
 * Now fully self-contained — inline Sidebar + all design tokens inlined.
 * All features preserved:
 *   - Filter tabs: All / Today / Upcoming / Completed / Cancelled
 *   - Confirm, Complete, Cancel actions with modals
 *   - Doctor's notes on completion
 *   - Patient initials avatar + TODAY badge
 *   - Toast notifications
 *   - Mounted guard (no hydration mismatch)
 */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

// ── Design tokens (inlined — no @/lib/styles dependency) ──────────────────────
const NAVY    = '#0c1a2e';
const BLUE    = '#1565c0';
const BLUE_P  = '#e3f0ff';
const RED     = '#c62828';
const RED_P   = '#fdecea';
const AMBER   = '#b45309';
const AMBER_P = '#fff3e0';
const GREEN   = '#1b5e20';
const GREEN_P = '#e8f5e9';
const TEAL    = '#00796b';
const TEAL_P  = '#e0f5f0';
const PURPLE  = '#6b21a8';
const PURPLE_P = '#f5f3ff';
const BORDER  = '#e2e8f0';
const SURFACE = '#f7f9fc';
const MUTED   = '#8896a7';
const SEC     = '#4a5568';

const API = process.env.NEXT_PUBLIC_API_URL || 'process.env.NEXT_PUBLIC_API_URL ? process.env.NEXT_PUBLIC_API_URL : (process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api")';

// Shared button styles
const btnPrimary   = { padding: '8px 18px', background: BLUE, color: 'white', border: 'none', borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' };
const btnSecondary = { padding: '8px 18px', background: 'white', color: BLUE, border: `1px solid ${BORDER}`, borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' };
const card         = { background: 'white', borderRadius: 14, border: `1px solid ${BORDER}`, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' };
const inputStyle   = { width: '100%', padding: '9px 12px', border: `1px solid ${BORDER}`, borderRadius: 9, fontSize: 13, outline: 'none', boxSizing: 'border-box', background: 'white' };

// ── Doctor sidebar nav ─────────────────────────────────────────────────────────
const DOCTOR_NAV = [
  { id: 'doctorDashboard', label: 'Dashboard',     icon: '⊞', href: '/doctor'               },
  { id: 'doctorPatients',  label: 'All Patients',  icon: '👥', href: '/doctor/patients'      },
  { id: 'doctorAppts',     label: 'Appointments',  icon: '📅', href: '/doctor/appointments'  },
  { id: 'doctorChat',      label: 'Patient Chat',  icon: '💬', href: '/doctor/chat',   badge: 3       },
  { id: 'doctorUpdates',   label: 'Updates',       icon: '🔔', href: '/doctor/updates', badge: 2      },
  { id: 'doctorReports',   label: 'Report Review', icon: '🔬', href: '/doctor/reports', badge: 'PREMIUM' },
];


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
    const ae = localStorage.getItem('mc_doctor_app_email') || '';
    if (!ae) {
      // Try to extract from mc_user
      try {
        const u = JSON.parse(localStorage.getItem('mc_user') || '{}');
        setAppEmail(u.email || '');
      } catch {}
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
        // Update localStorage user
        try {
          const u = JSON.parse(localStorage.getItem('mc_user') || '{}');
          if (u.doctor) {
            u.doctor = { ...u.doctor, ...d.data };
            localStorage.setItem('mc_user', JSON.stringify(u));
          }
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

function Sidebar({ active }) {
  const router = useRouter();
  const [showProfile,setShowProfile]=useState(false);
  const [chatBadge,  setChatBadge]  = useState(0);
  const [alertBadge, setAlertBadge] = useState(0);
  useEffect(() => {
    const tok = localStorage.getItem('mc_token') || '';
    if (!tok) return;
    const h = { Authorization: `Bearer ${tok}` };
    // Unread chat count
    fetch(`${API}/chat/rooms?limit=100`, {headers:h}).then(r=>r.ok?r.json():null)
      .then(d => {
        const total = (d?.data||[]).reduce((sum,r) => sum + (r.unreadCount||0), 0);
        setChatBadge(total);
      }).catch(()=>{});
    // Alert count
    fetch(`${API}/cdss/alerts`, {headers:h}).then(r=>r.ok?r.json():null)
      .then(d => setAlertBadge((d?.data||d?.alerts||[]).length))
      .catch(()=>{});
  }, []);
  const [doctorName, setDoctorName] = useState('');
  const [specialty,  setSpecialty]  = useState('');
  useEffect(() => {
    try {
      const u = JSON.parse(localStorage.getItem('mc_user') || '{}');
      if (u?.doctor) { setDoctorName(`Dr. ${u.doctor.firstName || ''} ${u.doctor.lastName || ''}`.trim()); setSpecialty(u.doctor.specialty || 'Doctor'); }
      else { setDoctorName(u?.email || 'Doctor'); setSpecialty('Doctor Portal'); }
    } catch {}
  }, []);
  const initials = doctorName.split(' ').filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase() || 'DR';
  return (
    <div style={{ width: 220, background: NAVY, display: 'flex', flexDirection: 'column', flexShrink: 0, overflow: 'hidden' }}>
      <div style={{ padding: '20px 18px 14px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 32, height: 32, background: BLUE, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', flexShrink: 0 }}>
            <div style={{ position: 'absolute', width: 14, height: 3, background: 'white', borderRadius: 2 }} />
            <div style={{ position: 'absolute', width: 3, height: 14, background: 'white', borderRadius: 2 }} />
          </div>
          <div><div style={{ fontSize: 13, fontWeight: 600, color: 'white' }}>MediConnect AI</div><div style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', fontFamily: 'monospace', letterSpacing: '0.1em' }}>DOCTOR PORTAL</div></div>
        </div>
      </div>
      <div onClick={()=>setShowProfile(true)} title="View/Edit Profile"
  style={{ cursor:'pointer', margin:'10px 10px 6px', background:'rgba(255,255,255,0.06)', borderRadius:9, padding:'8px 10px', display:'flex', alignItems:'center', gap:8 }}>
        <div style={{ width: 30, height: 30, borderRadius: '50%', background: TEAL_P, color: TEAL, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{initials}</div>
        <div style={{ flex: 1, minWidth: 0 }}><div suppressHydrationWarning style={{ fontSize: 12, fontWeight: 500, color: 'white', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doctorName || 'Doctor'}</div><div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>{specialty}</div></div>
      </div>
      <div style={{ padding: '10px 18px 4px', fontSize: 9, color: 'rgba(255,255,255,0.25)', fontFamily: 'monospace', letterSpacing: '0.12em' }}>CLINICAL</div>
      <div style={{ padding: '0 8px', flex: 1 }}>
        {DOCTOR_NAV.map(item => {
          const isA = active === item.id;
          return (
            <button key={item.id} onClick={() => router.push(item.href)}
              style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '9px 12px', margin: '2px 0', borderRadius: 8, cursor: 'pointer', border: 'none', textAlign: 'left', background: isA ? BLUE : 'transparent', color: isA ? 'white' : 'rgba(255,255,255,0.55)', fontSize: 13, fontFamily: 'DM Sans, sans-serif', fontWeight: isA ? 500 : 400, transition: 'background 0.12s' }}>
              <span style={{ fontSize: 14 }}>{item.icon}</span>
              <span style={{ flex: 1 }}>{item.label}</span>
              {(item.badge != null && item.badge !== 0 && (item.badge==='_chat'?chatBadge:item.badge==='_alerts'?alertBadge:item.badge) !== 0) && <span style={{ background: item.badge === 'PREMIUM' ? PURPLE : '#ef4444', color: item.badge === 'PREMIUM' ? '#e9d5ff' : 'white', fontSize: item.badge === 'PREMIUM' ? 8 : 10, fontWeight: 600, padding: item.badge === 'PREMIUM' ? '2px 5px' : '1px 5px', borderRadius: 99 }}>{item.badge==='_chat'?chatBadge:item.badge==='_alerts'?alertBadge:item.badge}</span>}
            </button>
          );
        })}
      </div>
      <div style={{ padding: '10px 12px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
        <button onClick={() => { localStorage.removeItem('mc_token'); localStorage.removeItem('mc_user'); router.push('/login'); }}
          style={{ width: '100%', padding: '7px 10px', background: 'rgba(255,255,255,0.05)', border: 'none', borderRadius: 8, color: 'rgba(255,255,255,0.4)', fontSize: 12, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', textAlign: 'left' }}>
          🚪 Sign out
        </button>
      </div>
      {showProfile&&(
        <DoctorProfileModal
          tokenFn={()=>localStorage.getItem('mc_token')||''}
          onClose={()=>setShowProfile(false)}
          onSignOut={()=>{localStorage.removeItem('mc_token');localStorage.removeItem('mc_user');router.push('/login');}}
        />
      )}
    </div>
  );
}

function sTag(status) {
  const map = {
    COMPLETED:   { bg: GREEN_P,   color: GREEN        },
    CONFIRMED:   { bg: '#d1fae5', color: '#065f46'    },
    CANCELLED:   { bg: RED_P,     color: RED          },
    NO_SHOW:     { bg: AMBER_P,   color: AMBER        },
    SCHEDULED:   { bg: BLUE_P,    color: BLUE         },
    RESCHEDULED: { bg: '#ede9fe', color: '#7c3aed'    },
  };
  const s = map[status] || { bg: '#f3f4f6', color: '#6b7280' };
  return { ...s, fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20, display: 'inline-block' };
}

// ── Modal wrapper ──────────────────────────────────────────────────────────────
function Modal({ title, subtitle, onClose, children, footer }) {
  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(12,26,46,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(2px)' }}>
      <div style={{ background: 'white', borderRadius: 16, width: 460, maxWidth: '92vw', boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}>
        <div style={{ padding: '20px 24px 0' }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: NAVY, marginBottom: 3 }}>{title}</div>
          {subtitle && <div style={{ fontSize: 12.5, color: MUTED, marginBottom: 18 }}>{subtitle}</div>}
        </div>
        <div style={{ padding: '0 24px' }}>{children}</div>
        {footer && (
          <div style={{ padding: '14px 24px', borderTop: `1px solid ${BORDER}`, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  MAIN PAGE
// ─────────────────────────────────────────────────────────────────────────────
export default function DoctorAppointmentsPage() {
  const router = useRouter();

  const [mounted,  setMounted]  = useState(false);
  const [appts,    setAppts]    = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [filter,   setFilter]   = useState('ALL');
  const [modal,    setModal]    = useState(null);  // { type, appt }
  const [saving,   setSaving]   = useState(false);
  const [toast,    setToast]    = useState('');
  const [notes,    setNotes]    = useState('');
  const [reason,   setReason]   = useState('');
  // Structured consultation sections
  const [sections,      setSections]      = useState({ followUp:'', prescription:'', notes:'', others:'' });
  const [secTab,        setSecTab]        = useState('notes');
  const [extracting,    setExtracting]    = useState(false);
  // Pharmacy finder state
  const [pharmacyModal, setPharmacyModal] = useState(false);
  const [pharmacies,    setPharmacies]    = useState([]);
  const [pharmaLoading, setPharmaLoading] = useState(false);
  const [pharmaError,   setPharmaError]   = useState('');
  const [parsedMeds,    setParsedMeds]    = useState([]);
  const [selectedMed,   setSelectedMed]   = useState('');
  const [userLocation,  setUserLocation]  = useState(null);

  const token     = () => localStorage.getItem('mc_token') || '';
  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 3500); };

  useEffect(() => {
    setMounted(true);
    if (!localStorage.getItem('mc_token')) { router.push('/login'); return; }
    fetch(`${API}/appointments?limit=200`, { headers: { Authorization: `Bearer ${token()}` } })
      .then(r => r.json())
      .then(d => setAppts(d.data || d.appointments || []))
      .catch(() => showToast('❌ Failed to load appointments'))
      .finally(() => setLoading(false));
  }, []);

  // ── Actions ────────────────────────────────────────────────────────────────
  async function doConfirm() {
    setSaving(true);
    try {
      const r = await fetch(`${API}/appointments/${modal.appt.id}/confirm`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
      });
      if (r.ok) { updateAppt(modal.appt.id, { status: 'CONFIRMED' }); showToast('✅ Appointment confirmed'); setModal(null); }
      else { const d = await r.json(); showToast('❌ ' + (d.error || 'Failed to confirm')); }
    } catch { showToast('❌ Network error'); }
    setSaving(false);
  }

  // ── Parse medicine names from prescription text ────────────────────────────
  function parseMedicines(prescText) {
    if (!prescText?.trim()) return [];
    // Each line is a medicine - extract just the drug name (first word/phrase before dose)
    return prescText.split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 2)
      .map(line => {
        // Remove common prefixes: Tab., Syp., Cap., Inj., Syr., Oint., etc.
        const clean = line.replace(/^(tab\.?|cap\.?|syr\.?|syp\.?|inj\.?|oint\.?|drops?\.?|gel\.?|cream\.?|susp\.?|sol\.?|\d+\.|[-•*])/gi, '').trim();
        // Extract drug name (up to the first number or punctuation indicating dose)
        const match = clean.match(/^([A-Za-z][A-Za-z\s&+/-]+?)(?:\s+\d|\s*[-–]|\s*,|$)/);
        return match ? match[1].trim() : clean.split(/\s+/).slice(0, 3).join(' ');
      })
      .filter(name => name.length > 1 && /[A-Za-z]/.test(name))
      .filter((name, idx, arr) => arr.indexOf(name) === idx); // deduplicate
  }

  // ── Find nearby pharmacies via OpenStreetMap Overpass API (free, no key) ────
  async function findNearbyPharmacies(lat, lng, radiusMeters = 2000) {
    // Overpass API query: find pharmacies within radius
    const query = '[out:json][timeout:15];(node["amenity"="pharmacy"](around:' + radiusMeters + ',' + lat + ',' + lng + ');way["amenity"="pharmacy"](around:' + radiusMeters + ',' + lat + ',' + lng + '););out body center;';
    const url   = 'https://overpass-api.de/api/interpreter';

    const r = await fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    'data=' + encodeURIComponent(query),
    });
    if (!r.ok) throw new Error('Overpass API error: ' + r.status);
    const d = await r.json();

    return (d.elements || []).map(el => {
      const elLat = el.lat ?? el.center?.lat;
      const elLng = el.lon ?? el.center?.lon;
      const dist  = elLat && elLng ? calcDist(lat, lng, elLat, elLng) : null;
      return {
        id:       el.id,
        name:     el.tags?.name || el.tags?.['name:en'] || 'Medical Store',
        address:  [el.tags?.['addr:housenumber'], el.tags?.['addr:street'], el.tags?.['addr:city']].filter(Boolean).join(', ') || el.tags?.['addr:full'] || '',
        phone:    el.tags?.phone || el.tags?.['contact:phone'] || '',
        hours:    el.tags?.opening_hours || '',
        lat:      elLat,
        lng:      elLng,
        dist:     dist, // km
        mapsUrl:  elLat ? 'https://www.google.com/maps/search/?api=1&query=' + elLat + ',' + elLng : null,
      };
    }).filter(p => p.lat).sort((a, b) => (a.dist||99) - (b.dist||99));
  }

  function calcDist(lat1, lng1, lat2, lng2) {
    const R   = 6371; // Earth radius km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a   = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLng/2)**2;
    return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)) * 10) / 10;
  }

  async function openPharmacyFinder() {
    const meds = parseMedicines(sections.prescription);
    setParsedMeds(meds);
    setSelectedMed(meds[0] || '');
    setPharmacies([]);
    setPharmaError('');
    setPharmacyModal(true);
    setPharmaLoading(true);

    try {
      // Get doctor's current location
      const pos = await new Promise((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10000 })
      );
      const { latitude: lat, longitude: lng } = pos.coords;
      setUserLocation({ lat, lng });

      const results = await findNearbyPharmacies(lat, lng, 3000);
      setPharmacies(results);
      if (results.length === 0) setPharmaError('No pharmacies found within 3km. Try expanding the area.');
    } catch (err) {
      if (err.code === 1) {
        setPharmaError('Location permission denied. Please allow location access in your browser to find nearby pharmacies.');
      } else if (err.code === 2) {
        setPharmaError('Location unavailable. Please check your device GPS/network.');
      } else {
        setPharmaError('Could not find nearby pharmacies: ' + err.message);
      }
    }
    setPharmaLoading(false);
  }

  async function autoExtractSections(rawNote, apptId) {
    if (!rawNote?.trim()) return;
    setExtracting(true);
    try {
      const r = await fetch(`${API}/appointments/${apptId}/extract-sections`, {
        method:  'POST',
        headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
        body:    JSON.stringify({ rawNote }),
      });
      const d = await r.json();
      if (r.ok && d.success && d.sections) {
        setSections(d.sections);
        showToast('✨ Sections auto-filled from clinical notes');
      }
    } catch {}
    setExtracting(false);
  }

  async function doComplete() {
    setSaving(true);
    try {
      // Use structured endpoint if any section has content, otherwise simple complete
      const hasStructured = sections.followUp || sections.prescription || sections.notes || sections.others;
      const endpoint = hasStructured ? 'complete-structured' : 'complete';
      const body     = hasStructured
        ? { followUp: sections.followUp, prescription: sections.prescription, notes: sections.notes, others: sections.others, summary: notes }
        : { notes };
      const r = await fetch(`${API}/appointments/${modal.appt.id}/${endpoint}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (r.ok) {
        updateAppt(modal.appt.id, { status: 'COMPLETED', notes });
        showToast('✅ Appointment completed with structured notes');
        setModal(null); setNotes(''); setSections({followUp:'',prescription:'',notes:'',others:''});
      } else { const d = await r.json(); showToast('❌ ' + (d.error || 'Failed to complete')); }
    } catch { showToast('❌ Network error'); }
    setSaving(false);
  }

  async function doCancel() {
    setSaving(true);
    try {
      const r = await fetch(`${API}/appointments/${modal.appt.id}/cancel`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason || 'Cancelled by doctor' }),
      });
      if (r.ok) { updateAppt(modal.appt.id, { status: 'CANCELLED' }); showToast('Appointment cancelled'); setModal(null); setReason(''); }
      else { const d = await r.json(); showToast('❌ ' + (d.error || 'Failed to cancel')); }
    } catch { showToast('❌ Network error'); }
    setSaving(false);
  }

  function updateAppt(id, patch) {
    setAppts(prev => prev.map(a => a.id === id ? { ...a, ...patch } : a));
  }

  // ── Filter logic ───────────────────────────────────────────────────────────
  const todayStr = new Date().toDateString();
  const filtered = appts.filter(a => {
    if (filter === 'TODAY')     return new Date(a.scheduledAt).toDateString() === todayStr;
    if (filter === 'UPCOMING')  return ['SCHEDULED','CONFIRMED','RESCHEDULED'].includes(a.status);
    if (filter === 'COMPLETED') return a.status === 'COMPLETED';
    if (filter === 'CANCELLED') return a.status === 'CANCELLED' || a.status === 'NO_SHOW';
    return true;
  }).sort((a, b) => new Date(b.scheduledAt) - new Date(a.scheduledAt));

  const counts = {
    ALL:       appts.length,
    TODAY:     appts.filter(a => new Date(a.scheduledAt).toDateString() === todayStr).length,
    UPCOMING:  appts.filter(a => ['SCHEDULED','CONFIRMED','RESCHEDULED'].includes(a.status)).length,
    COMPLETED: appts.filter(a => a.status === 'COMPLETED').length,
    CANCELLED: appts.filter(a => ['CANCELLED','NO_SHOW'].includes(a.status)).length,
  };

  const canAction = (a) => !['CANCELLED','COMPLETED','NO_SHOW'].includes(a.status);

  if (!mounted) return null;

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', fontFamily: 'DM Sans, sans-serif' }}>
      <Sidebar active="doctorAppts" />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        <div style={{ flex: 1, overflowY: 'auto', padding: 24, background: SURFACE }}>

          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 22 }}>
            <div>
              <div style={{ fontSize: 20, fontWeight: 700, color: NAVY }}>Appointment Schedule</div>
              <div style={{ fontSize: 13, color: MUTED, marginTop: 2 }}>
                {counts.TODAY} today · {counts.UPCOMING} upcoming · {counts.COMPLETED} completed
              </div>
            </div>
            <button onClick={() => router.push('/doctor/patients')} style={{ ...btnPrimary }}>
              + New Appointment
            </button>
          </div>

          {/* Filter tabs */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
            {[
              { key: 'ALL',       label: 'All'         },
              { key: 'TODAY',     label: '📅 Today'    },
              { key: 'UPCOMING',  label: '🔜 Upcoming' },
              { key: 'COMPLETED', label: '✅ Completed' },
              { key: 'CANCELLED', label: '❌ Cancelled' },
            ].map(f => (
              <button key={f.key} onClick={() => setFilter(f.key)}
                style={{ padding: '7px 16px', borderRadius: 9, border: `1px solid ${filter === f.key ? BLUE : BORDER}`, background: filter === f.key ? BLUE_P : 'white', color: filter === f.key ? BLUE : MUTED, fontSize: 12.5, fontWeight: filter === f.key ? 700 : 400, cursor: 'pointer' }}>
                {f.label}
                <span style={{ marginLeft: 5, fontSize: 11, opacity: 0.7 }}>({counts[f.key]})</span>
              </button>
            ))}
          </div>

          {/* Appointments table */}
          <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
            {loading ? (
              <div style={{ padding: 48, textAlign: 'center', color: MUTED, fontSize: 13 }}>Loading appointments…</div>
            ) : filtered.length === 0 ? (
              <div style={{ padding: 48, textAlign: 'center', color: MUTED }}>
                <div style={{ fontSize: 32, marginBottom: 10 }}>📅</div>
                <div style={{ fontSize: 14 }}>No {filter === 'ALL' ? '' : filter.toLowerCase()} appointments</div>
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {['Patient', 'Date & Time', 'Type', 'Reason', 'Status', 'Actions'].map(h => (
                      <th key={h} style={{ textAlign: 'left', padding: '10px 14px', fontSize: 11, color: MUTED, borderBottom: `1px solid ${BORDER}`, fontFamily: 'IBM Plex Mono, monospace', fontWeight: 600, letterSpacing: '0.04em' }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(a => {
                    const d        = new Date(a.scheduledAt);
                    const isToday  = d.toDateString() === todayStr;
                    const patName  = a.patient ? `${a.patient.firstName} ${a.patient.lastName}` : 'Patient';
                    const patInits = a.patient ? `${a.patient.firstName?.[0] || ''}${a.patient.lastName?.[0] || ''}` : 'PT';

                    return (
                      <tr key={a.id} style={{ borderBottom: `1px solid ${BORDER}`, background: isToday ? BLUE_P + '55' : 'white' }}>

                        {/* Patient */}
                        <td style={{ padding: '12px 14px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={{ width: 32, height: 32, borderRadius: '50%', background: BLUE_P, color: BLUE, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                              {patInits.toUpperCase()}
                            </div>
                            <div>
                              <div style={{ fontSize: 13, fontWeight: 600, color: NAVY }}>{patName}</div>
                              {a.patient?.phone && <div style={{ fontSize: 11, color: MUTED }}>{a.patient.phone}</div>}
                            </div>
                          </div>
                        </td>

                        {/* Date & Time */}
                        <td style={{ padding: '12px 14px' }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: NAVY, fontFamily: 'IBM Plex Mono, monospace' }}>
                            {d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </div>
                          <div style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>
                            {d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}
                            {isToday && <span style={{ marginLeft: 6, background: BLUE, color: 'white', fontSize: 9, padding: '1px 6px', borderRadius: 99, fontWeight: 700 }}>TODAY</span>}
                          </div>
                        </td>

                        {/* Type */}
                        <td style={{ padding: '12px 14px', fontSize: 12.5, color: NAVY }}>
                          {a.type?.replace('_', ' ') || '—'}
                        </td>

                        {/* Reason */}
                        <td style={{ padding: '12px 14px', fontSize: 12, color: MUTED, maxWidth: 200 }}>
                          <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {a.reason || '—'}
                          </div>
                          {a.notes && (
                            <div style={{ fontSize: 11, color: '#065f46', marginTop: 3, background: '#f0fdf4', padding: '2px 7px', borderRadius: 4, display: 'inline-block' }}>
                              🩺 {a.notes.length > 50 ? a.notes.slice(0, 50) + '…' : a.notes}
                            </div>
                          )}
                        </td>

                        {/* Status */}
                        <td style={{ padding: '12px 14px' }}>
                          <span style={sTag(a.status)}>{a.status.replace('_', ' ')}</span>
                        </td>

                        {/* Actions */}
                        <td style={{ padding: '12px 14px' }}>
                          {canAction(a) ? (
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                              {a.status === 'SCHEDULED' && (
                                <button onClick={() => setModal({ type: 'confirm', appt: a })}
                                  style={{ padding: '4px 10px', background: GREEN_P, color: GREEN, border: `1px solid ${GREEN}40`, borderRadius: 7, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                                  ✓ Confirm
                                </button>
                              )}
                              <button onClick={async () => {
                                  setNotes(''); setSections({followUp:'',prescription:'',notes:'',others:''}); setSecTab('prescription');
                                  setModal({ type: 'complete', appt: a });

                                  // ── Read Rx saved from chat page via sessionStorage ─────
                                  const pendingRx = sessionStorage.getItem('mc_pending_rx') || '';
                                  if (pendingRx) {
                                    setSections(s => ({ ...s, prescription: pendingRx }));
                                    sessionStorage.removeItem('mc_pending_rx');
                                  }

                                  const rid = a.chatRoom?.id;
                                  if (!rid) return;

                                  try {
                                    const [msgsRes, notesRes] = await Promise.all([
                                      fetch(`${API}/chat/rooms/${rid}/messages?limit=100`, { headers: { Authorization: `Bearer ${token()}` } }),
                                      fetch(`${API}/chat/rooms/${rid}/clinical-notes`,     { headers: { Authorization: `Bearer ${token()}` } }),
                                    ]);
                                    const msgsData  = msgsRes.ok  ? await msgsRes.json()  : {};
                                    const notesData = notesRes.ok ? await notesRes.json() : {};

                                    // Split doctor messages into prescription vs general notes
                                    const rxPat = /tab\.|cap\.|syr\.|inj\.|mg\b|ml\b|\bbd\b|\bod\b|\btds\b|\bqid\b|once daily|twice daily|three times/i;
                                    const dMsgs = (msgsData.data || []).filter(m =>
                                      m.senderRole === 'DOCTOR' && m.content &&
                                      m.content !== '[Message deleted]' &&
                                      m.type !== 'FILE' && m.type !== 'CLINICAL_NOTE'
                                    );
                                    const rxMsgs   = dMsgs.filter(m =>  rxPat.test(m.content)).map(m => m.content);
                                    const noteMsgs = dMsgs.filter(m => !rxPat.test(m.content)).map(m => m.content);
                                    const bullets  = (notesData.data || []).flatMap(n => n.bullets || []);

                                    // Fill prescription tab from Rx chat messages (if not already from sessionStorage)
                                    if (rxMsgs.length > 0 && !pendingRx) {
                                      setSections(s => ({ ...s, prescription: rxMsgs.join('\n') }));
                                    }

                                    // Fill notes from clinical note bullets + non-Rx messages
                                    const notesText = [...bullets, ...noteMsgs].join('\n').trim();
                                    if (notesText) setNotes(notesText.slice(0, 500));

                                    // Run AI extraction on all combined content
                                    const combined = [bullets.join('\n'), noteMsgs.join('\n'),
                                      rxMsgs.length ? 'Prescription:\n' + rxMsgs.join('\n') : ''
                                    ].filter(Boolean).join('\n').trim();
                                    if (combined) autoExtractSections(combined, a.id);

                                  } catch (e) { console.warn('Complete auto-fill:', e.message); }
                                }}
                                style={{ padding: '4px 10px', background: BLUE_P, color: BLUE, border: `1px solid ${BLUE}40`, borderRadius: 7, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                                ✅ Complete
                              </button>
                              <button onClick={() => { setReason(''); setModal({ type: 'cancel', appt: a }); }}
                                style={{ padding: '4px 10px', background: RED_P, color: RED, border: `1px solid ${RED}40`, borderRadius: 7, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                                ✕ Cancel
                              </button>
                            </div>
                          ) : (
                            <button onClick={() => router.push('/doctor/chat')}
                              style={{ padding: '4px 10px', background: SURFACE, color: NAVY, border: `1px solid ${BORDER}`, borderRadius: 7, fontSize: 11, cursor: 'pointer' }}>
                              💬 Chat
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* ── CONFIRM MODAL ── */}
      {modal?.type === 'confirm' && (
        <Modal
          title="Confirm Appointment"
          subtitle={`Confirm appointment with ${modal.appt.patient?.firstName} ${modal.appt.patient?.lastName}`}
          onClose={() => setModal(null)}
          footer={
            <>
              <button onClick={() => setModal(null)} style={{ ...btnSecondary }}>Cancel</button>
              <button onClick={doConfirm} disabled={saving}
                style={{ ...btnPrimary, background: GREEN, opacity: saving ? 0.6 : 1 }}>
                {saving ? 'Confirming…' : '✓ Confirm Appointment'}
              </button>
            </>
          }>
          <div style={{ background: GREEN_P, border: `1px solid ${GREEN}40`, borderRadius: 10, padding: '12px 14px', marginBottom: 14, fontSize: 13, color: GREEN }}>
            The patient will be notified that their appointment is confirmed.
          </div>
        </Modal>
      )}

      {/* ── COMPLETE MODAL ── */}
      {modal?.type === 'complete' && (
        <Modal
          title="Mark as Completed"
          subtitle={`Consultation with ${modal.appt.patient?.firstName} ${modal.appt.patient?.lastName}`}
          onClose={() => setModal(null)}
          footer={
            <>
              <button onClick={() => setModal(null)} style={{ ...btnSecondary }}>Cancel</button>
              <button onClick={doComplete} disabled={saving}
                style={{ ...btnPrimary, opacity: saving ? 0.6 : 1 }}>
                {saving ? 'Saving…' : '✅ Mark Complete'}
              </button>
            </>
          }>
          {/* AI extraction status */}
          {extracting && (
            <div style={{ display:'flex', alignItems:'center', gap:8, background:'#ede9fe', borderRadius:9, padding:'8px 12px', marginBottom:12, fontSize:12.5, color:'#7c3aed' }}>
              <span style={{ display:'inline-block', width:12, height:12, border:'2px solid #7c3aed', borderTopColor:'transparent', borderRadius:'50%', animation:'spin 0.8s linear infinite' }}/>
              AI is filling sections from clinical notes…
            </div>
          )}

          {/* Section tabs */}
          <div style={{ display:'flex', borderBottom:`1px solid ${BORDER}`, marginBottom:14 }}>
            {[
              { id:'notes',        icon:'📝', label:'Notes'       },
              { id:'prescription', icon:'💊', label:'Prescription'},
              { id:'followUp',     icon:'📅', label:'Follow-Up'   },
              { id:'others',       icon:'💡', label:'Others'      },
            ].map(t => (
              <button key={t.id} onClick={() => setSecTab(t.id)}
                style={{ flex:1, padding:'8px 4px', border:'none', background:'transparent', cursor:'pointer',
                  fontSize:11.5, fontWeight:secTab===t.id?700:400,
                  color:secTab===t.id?BLUE:MUTED,
                  borderBottom:secTab===t.id?`2px solid ${BLUE}`:'2px solid transparent',
                  marginBottom:-1, display:'flex', flexDirection:'column', alignItems:'center', gap:2 }}>
                <span style={{ fontSize:14 }}>{t.icon}</span>
                {t.label}
                {sections[t.id] && <span style={{ width:5, height:5, borderRadius:'50%', background:BLUE, marginTop:1 }}/>}
              </button>
            ))}
          </div>

          {/* Tab content */}
          {secTab === 'notes' && (
            <div>
              <label style={{ display:'block', fontSize:11.5, fontWeight:600, color:MUTED, marginBottom:5 }}>
                📝 Clinical Observations & Diagnosis
              </label>
              <textarea value={sections.notes} onChange={e => setSections(s=>({...s, notes:e.target.value}))}
                placeholder="Chief complaint, examination findings, diagnosis/impression…"
                rows={4} style={{ ...inputStyle, resize:'vertical', minHeight:90, fontFamily:'DM Sans, sans-serif', width:'100%', boxSizing:'border-box' }}/>
            </div>
          )}
          {secTab === 'prescription' && (
            <div>
              <label style={{ display:'block', fontSize:11.5, fontWeight:600, color:MUTED, marginBottom:5 }}>
                💊 Prescription
              </label>
              <textarea value={sections.prescription} onChange={e => setSections(s=>({...s, prescription:e.target.value}))}
                placeholder={'Tab. Paracetamol 500mg — 1 tablet TDS × 5 days\nSyr. Amoxicillin 125mg — 5ml BD × 7 days'}
                rows={5} style={{ ...inputStyle, resize:'vertical', minHeight:110, fontFamily:'monospace', fontSize:12.5, width:'100%', boxSizing:'border-box' }}/>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:8 }}>
                <div style={{ fontSize:11, color:MUTED }}>Each line = one medicine. AI pre-fills from voice notes.</div>
                <button type="button" onClick={openPharmacyFinder}
                  disabled={!sections.prescription?.trim()}
                  style={{ padding:'5px 12px', background:sections.prescription?.trim()?'#0e7490':'#94a3b8',
                    color:'white', border:'none', borderRadius:7, fontSize:11.5, fontWeight:700,
                    cursor:sections.prescription?.trim()?'pointer':'not-allowed',
                    display:'flex', alignItems:'center', gap:5, flexShrink:0 }}>
                  🏪 Find Nearby Pharmacies
                </button>
              </div>
            </div>
          )}
          {secTab === 'followUp' && (
            <div>
              <label style={{ display:'block', fontSize:11.5, fontWeight:600, color:MUTED, marginBottom:5 }}>
                📅 Follow-Up Instructions
              </label>
              <textarea value={sections.followUp} onChange={e => setSections(s=>({...s, followUp:e.target.value}))}
                placeholder={'Review after 1 week\nRepeat CBC and LFT after 2 weeks\nReferral to Cardiologist if symptoms persist'}
                rows={4} style={{ ...inputStyle, resize:'vertical', minHeight:90, fontFamily:'DM Sans, sans-serif', width:'100%', boxSizing:'border-box' }}/>
            </div>
          )}
          {secTab === 'others' && (
            <div>
              <label style={{ display:'block', fontSize:11.5, fontWeight:600, color:MUTED, marginBottom:5 }}>
                💡 Other Instructions
              </label>
              <textarea value={sections.others} onChange={e => setSections(s=>({...s, others:e.target.value}))}
                placeholder={'Drink 3 litres water daily\nAvoid spicy food for 1 week\nLight walking 20 min/day'}
                rows={4} style={{ ...inputStyle, resize:'vertical', minHeight:90, fontFamily:'DM Sans, sans-serif', width:'100%', boxSizing:'border-box' }}/>
            </div>
          )}

          {/* Overall summary */}
          <div style={{ marginTop:14 }}>
            <label style={{ display:'block', fontSize:11.5, fontWeight:600, color:MUTED, marginBottom:5 }}>
              📋 Overall Summary (shown in patient history)
            </label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="Brief consultation summary for patient records…"
              rows={2} style={{ ...inputStyle, resize:'vertical', fontFamily:'DM Sans, sans-serif', width:'100%', boxSizing:'border-box' }}/>
          </div>

          {/* Re-extract button */}
          {!extracting && (sections.notes || sections.prescription || sections.followUp) ? null : (
            <button onClick={() => autoExtractSections(notes || Object.values(sections).join('\n'), modal.appt.id)}
              disabled={extracting || (!notes && !sections.notes)}
              style={{ marginTop:10, width:'100%', padding:'7px', border:`1px dashed ${BLUE}40`, borderRadius:8,
                background:BLUE_P, color:BLUE, fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'DM Sans, sans-serif' }}>
              ✨ Auto-fill sections with AI
            </button>
          )}
        </Modal>
      )}

      {/* ── CANCEL MODAL ── */}
      {modal?.type === 'cancel' && (
        <Modal
          title="Cancel Appointment"
          subtitle="Are you sure? The patient will be notified."
          onClose={() => setModal(null)}
          footer={
            <>
              <button onClick={() => setModal(null)} style={{ ...btnSecondary }}>Keep Appointment</button>
              <button onClick={doCancel} disabled={saving}
                style={{ background: RED, color: 'white', border: 'none', padding: '8px 18px', borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
                {saving ? 'Cancelling…' : 'Yes, Cancel'}
              </button>
            </>
          }>
          <div style={{ background: RED_P, border: `1px solid #f5c6cb`, borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 13, color: RED }}>
            ⚠ If the patient has paid, a refund will be initiated automatically.
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: MUTED, marginBottom: 6 }}>
              Reason for cancellation
            </label>
            <select value={reason} onChange={e => setReason(e.target.value)} style={{ ...inputStyle }}>
              <option value="">Select a reason…</option>
              {['Doctor unavailable', 'Emergency', 'Patient requested', 'Duplicate booking', 'Other'].map(r => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </div>
        </Modal>
      )}

      {/* ── Pharmacy Finder Modal ── */}
      {pharmacyModal && (
        <div onClick={e => { if(e.target===e.currentTarget) setPharmacyModal(false); }}
          style={{ position:'fixed', inset:0, background:'rgba(12,26,46,0.65)', zIndex:600,
            display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
          <div style={{ background:'white', borderRadius:16, width:'100%', maxWidth:680,
            maxHeight:'88vh', display:'flex', flexDirection:'column', overflow:'hidden',
            boxShadow:'0 12px 48px rgba(0,0,0,0.25)', fontFamily:'DM Sans, sans-serif' }}>

            {/* Header */}
            <div style={{ background:NAVY, padding:'14px 20px', display:'flex', alignItems:'center', gap:12, flexShrink:0 }}>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:11, color:'rgba(255,255,255,0.4)', letterSpacing:'0.08em', marginBottom:3, fontFamily:'monospace' }}>🏪 NEARBY MEDICAL STORES</div>
                <div style={{ fontSize:14, fontWeight:700, color:'white' }}>Find Pharmacies for Prescription</div>
              </div>
              <button onClick={() => setPharmacyModal(false)}
                style={{ background:'rgba(255,255,255,0.1)', border:'none', color:'white', width:30, height:30, borderRadius:'50%', cursor:'pointer', fontSize:16 }}>×</button>
            </div>

            {/* Medicine chips */}
            {parsedMeds.length > 0 && (
              <div style={{ padding:'10px 16px', borderBottom:`1px solid ${BORDER}`, flexShrink:0 }}>
                <div style={{ fontSize:11, fontWeight:600, color:MUTED, marginBottom:7 }}>MEDICINES IN PRESCRIPTION — click to search</div>
                <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                  {parsedMeds.map(med => (
                    <button key={med} onClick={() => setSelectedMed(med)}
                      style={{ padding:'4px 12px', borderRadius:99, fontSize:12.5, fontWeight:600, cursor:'pointer', border:'1.5px solid',
                        background:selectedMed===med?'#0e7490':'white',
                        color:selectedMed===med?'white':'#0e7490',
                        borderColor:'#0e7490' }}>
                      💊 {med}
                    </button>
                  ))}
                </div>
                {selectedMed && (
                  <div style={{ marginTop:8, fontSize:12, color:'#0e7490', background:'#ecfeff', borderRadius:7, padding:'6px 10px' }}>
                    🔍 Showing pharmacies near you — ask for <strong>{selectedMed}</strong> or its generic equivalent
                  </div>
                )}
              </div>
            )}

            {/* Body */}
            <div style={{ flex:1, overflowY:'auto', padding:16 }}>

              {/* Loading */}
              {pharmaLoading && (
                <div style={{ textAlign:'center', padding:48, color:MUTED }}>
                  <div style={{ display:'inline-block', width:32, height:32, border:'3px solid #0e7490', borderTopColor:'transparent', borderRadius:'50%', animation:'spin 0.8s linear infinite', marginBottom:12 }}/>
                  <div style={{ fontSize:13 }}>Finding nearby pharmacies…</div>
                  <div style={{ fontSize:12, color:MUTED, marginTop:4 }}>Using your location to search OpenStreetMap</div>
                </div>
              )}

              {/* Error */}
              {!pharmaLoading && pharmaError && (
                <div style={{ background:RED_P, border:`1px solid #fca5a5`, borderRadius:10, padding:16, marginBottom:12 }}>
                  <div style={{ fontWeight:700, color:RED, marginBottom:4 }}>📍 Location Error</div>
                  <div style={{ fontSize:13, color:RED, lineHeight:1.6 }}>{pharmaError}</div>
                  <button onClick={openPharmacyFinder} style={{ marginTop:10, padding:'6px 14px', background:RED, color:'white', border:'none', borderRadius:7, fontSize:12, cursor:'pointer' }}>
                    Retry
                  </button>
                </div>
              )}

              {/* Results */}
              {!pharmaLoading && pharmacies.length > 0 && (
                <>
                  <div style={{ fontSize:11, fontWeight:700, color:MUTED, letterSpacing:'0.06em', marginBottom:10 }}>
                    {pharmacies.length} PHARMACIES WITHIN 3KM
                    {userLocation && <span style={{ fontWeight:400 }}> · sorted by distance</span>}
                  </div>
                  {pharmacies.map((p, i) => (
                    <div key={p.id} style={{ border:`1px solid ${BORDER}`, borderRadius:12, padding:'12px 14px', marginBottom:8,
                      background: i===0 ? '#f0fdfa' : 'white',
                      borderColor: i===0 ? '#5eead4' : BORDER }}>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:8 }}>
                        <div style={{ flex:1 }}>
                          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
                            <span style={{ fontSize:16 }}>🏪</span>
                            <span style={{ fontSize:13.5, fontWeight:700, color:NAVY }}>{p.name}</span>
                            {i === 0 && <span style={{ fontSize:10, fontWeight:700, background:'#0d9488', color:'white', padding:'2px 7px', borderRadius:99 }}>NEAREST</span>}
                          </div>
                          {p.address && (
                            <div style={{ fontSize:12, color:SEC, marginBottom:3, marginLeft:24 }}>📍 {p.address}</div>
                          )}
                          {p.phone && (
                            <div style={{ fontSize:12, color:SEC, marginBottom:3, marginLeft:24 }}>📞 {p.phone}</div>
                          )}
                          {p.hours && (
                            <div style={{ fontSize:11.5, color:MUTED, marginLeft:24 }}>🕐 {p.hours}</div>
                          )}
                        </div>
                        <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:6, flexShrink:0 }}>
                          {p.dist && (
                            <span style={{ fontSize:12, fontWeight:700, color:'#0e7490', background:'#ecfeff', padding:'3px 9px', borderRadius:99 }}>
                              {p.dist} km
                            </span>
                          )}
                          {p.mapsUrl && (
                            <a href={p.mapsUrl} target="_blank" rel="noopener noreferrer"
                              style={{ fontSize:11.5, color:BLUE, fontWeight:600, textDecoration:'none',
                                background:BLUE_P, padding:'4px 10px', borderRadius:6 }}>
                              📍 Open Maps
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </>
              )}

              {/* Empty state */}
              {!pharmaLoading && !pharmaError && pharmacies.length === 0 && !pharmaLoading && userLocation && (
                <div style={{ textAlign:'center', padding:48, color:MUTED }}>
                  <div style={{ fontSize:36, marginBottom:12 }}>🏪</div>
                  <div style={{ fontSize:14, fontWeight:600, color:NAVY, marginBottom:6 }}>No pharmacies found nearby</div>
                  <div style={{ fontSize:13 }}>No pharmacies found in OpenStreetMap within 3km of your location. Try searching manually on Google Maps.</div>
                  <a href={'https://www.google.com/maps/search/pharmacy+near+me'} target="_blank" rel="noopener noreferrer"
                    style={{ display:'inline-block', marginTop:12, padding:'8px 18px', background:BLUE, color:'white', borderRadius:8, fontSize:13, fontWeight:600, textDecoration:'none' }}>
                    Search on Google Maps
                  </a>
                </div>
              )}

              {/* Note about medicine availability */}
              {!pharmaLoading && pharmacies.length > 0 && selectedMed && (
                <div style={{ background:'#fffbeb', border:'1px solid #fde68a', borderRadius:10, padding:'10px 14px', marginTop:8 }}>
                  <div style={{ fontSize:12, fontWeight:700, color:AMBER, marginBottom:5 }}>💡 Tips for {selectedMed}</div>
                  <div style={{ fontSize:12, color:'#78350f', lineHeight:1.7 }}>
                    • Call ahead to confirm stock — smaller stores may not carry all brands<br/>
                    • Ask for the <strong>generic name</strong> if the brand is unavailable<br/>
                    • Large pharmacy chains (Apollo, MedPlus, Wellness) usually have better stock<br/>
                    • If unavailable locally, try 1mg.com or Netmeds for home delivery
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div style={{ padding:'10px 16px', borderTop:`1px solid ${BORDER}`, display:'flex', justifyContent:'space-between', alignItems:'center', flexShrink:0, background:SURFACE }}>
              <div style={{ fontSize:11, color:MUTED }}>
                📡 Powered by OpenStreetMap · Data may not be 100% up to date
              </div>
              <button onClick={() => setPharmacyModal(false)}
                style={{ padding:'7px 18px', background:NAVY, color:'white', border:'none', borderRadius:8, fontSize:13, fontWeight:600, cursor:'pointer' }}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, background: NAVY, color: 'white', padding: '12px 20px', borderRadius: 12, fontSize: 13, zIndex: 9999, boxShadow: '0 4px 20px rgba(0,0,0,0.2)', maxWidth: 360 }}>
          {toast}
        </div>
      )}

      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}


