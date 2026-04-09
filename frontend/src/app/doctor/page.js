'use client';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
/**
 * src/app/doctor/page.js — CDSS Enhanced
 *
 * NEW vs previous version:
 *   ✓ Feature B: Persistent Red Flag alert banner — fetches /api/cdss/alerts
 *     every 30 seconds, stays visible until doctor clicks "Acknowledge"
 *     Critical alerts (red) always render above everything else in the page.
 */

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { saveSession, getToken, getUser, clearSession } from '@/lib/auth';
import DoctorSidebar from '@/components/DoctorSidebar';

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
const BORDER  = '#e2e8f0';
const SURFACE = '#f7f9fc';
const MUTED   = '#8896a7';
const SEC     = '#4a5568';
const API     = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

const DOCTOR_NAV = [
  { id: 'doctorDashboard', label: 'Dashboard',     icon: '⊞', href: '/doctor'                },
  { id: 'doctorPatients',  label: 'All Patients',  icon: '👥', href: '/doctor/patients'       },
  { id: 'doctorAppts',     label: 'Appointments',  icon: '📅', href: '/doctor/appointments'   },
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
        const u = getUser('DOCTOR');
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
        // Update both sessionStorage and localStorage
        try {
          const u = { ...getUser('DOCTOR') };
          if (u.doctor) {
            u.doctor = { ...u.doctor, ...d.data };
            saveSession(getToken('DOCTOR'), u);
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

// ── Doctor bottom nav (mobile) ────────────────────────────────────────────────
const DOCTOR_BOTTOM_NAV = [
  { id: 'doctorDashboard', label: 'Home',     icon: '⊞', href: '/doctor'              },
  { id: 'doctorAppts',     label: 'Appts',    icon: '📅', href: '/doctor/appointments' },
  { id: 'doctorChat',      label: 'Chat',     icon: '💬', href: '/doctor/chat'         },
  { id: 'doctorReports',   label: 'Reports',  icon: '🔬', href: '/doctor/reports'      },
  { id: 'doctorMore',      label: 'More',     icon: '☰',  href: null                   },
];

function Sidebar({ active }) {
  const router = useRouter();
  const [showProfile, setShowProfile] = useState(false);
  const [chatBadge,   setChatBadge]   = useState(0);
  const [alertBadge,  setAlertBadge]  = useState(0);
  const [doctorName,  setDoctorName]  = useState('');
  const [specialty,   setSpecialty]   = useState('');
  const [moreOpen,    setMoreOpen]    = useState(false);

  useEffect(() => {
    const tok = getToken('DOCTOR');
    if (!tok) return;
    const h = { Authorization: `Bearer ${tok}` };
    fetch(`${API}/chat/rooms?limit=100`, { headers: h }).then(r => r.ok ? r.json() : null)
      .then(d => {
        const total = (d?.data || []).reduce((sum, r) => sum + (r.unreadCount || 0), 0);
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
        setDoctorName(`Dr. ${u.doctor.firstName || ''} ${u.doctor.lastName || ''}`.trim());
        setSpecialty(u.doctor.specialty || 'Doctor');
      } else {
        setDoctorName(u?.email || 'Doctor');
        setSpecialty('Doctor Portal');
      }
    } catch {}
  }, []);

  const initials = doctorName.split(' ').filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase() || 'DR';

  function signOut() {
    clearSession('DOCTOR');
    window.location.href = '/login';
  }

  function getBadgeValue(item) {
    if (item.badge === '_chat')   return chatBadge;
    if (item.badge === '_alerts') return alertBadge;
    return item.badge;
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
            <div className="mc-logo-text" style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', fontFamily: 'monospace', letterSpacing: '0.1em' }}>DOCTOR PORTAL</div>
          </div>
        </div>

        {/* Avatar — clickable to open profile */}
        <div
          onClick={() => setShowProfile(true)}
          title="View/Edit Profile"
          style={{ cursor: 'pointer', margin: '10px 6px 6px', background: 'rgba(255,255,255,0.06)', borderRadius: 9, padding: '8px 6px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
        >
          <div style={{ width: 30, height: 30, borderRadius: '50%', background: TEAL_P, color: TEAL, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{initials}</div>
          <div className="mc-user-info" style={{ flex: 1, minWidth: 0 }}>
            <div suppressHydrationWarning style={{ fontSize: 12, fontWeight: 500, color: 'white', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doctorName || 'Doctor'}</div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>{specialty}</div>
          </div>
        </div>

        {/* Section divider — always visible */}
        <div style={{ padding: '10px 0 4px', fontSize: 9, color: 'rgba(255,255,255,0.25)', fontFamily: 'monospace', letterSpacing: '0.12em', textAlign: 'center', flexShrink: 0 }}>· · ·</div>

        {/* Nav items — no side padding so icons centre cleanly in 60px */}
        <div style={{ padding: '2px 4px', flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
          {DOCTOR_NAV.map(item => {
            const isA = active === item.id;
            const badgeVal = getBadgeValue(item);
            return (
              <button
                className="mc-nav-btn"
                key={item.id}
                onClick={() => router.push(item.href)}
                style={{
                  margin: '1px 0',
                  borderRadius: 8,
                  background: isA ? BLUE : 'transparent',
                  color: isA ? 'white' : 'rgba(255,255,255,0.65)',
                  fontSize: 13,
                  fontFamily: 'DM Sans, sans-serif',
                  fontWeight: isA ? 600 : 400,
                  transition: 'background 0.12s',
                }}
              >
                <span className="mc-nav-icon">{item.icon}</span>
                <span className="mc-nav-label" style={{ textAlign: 'left' }}>{item.label}</span>
                {item.badge != null && badgeVal !== 0 && (
                  <span className="mc-nav-label" style={{
                    background: item.badge === 'PREMIUM' ? PURPLE : '#ef4444',
                    color: item.badge === 'PREMIUM' ? '#e9d5ff' : 'white',
                    fontSize: item.badge === 'PREMIUM' ? 8 : 10,
                    fontWeight: 700,
                    padding: item.badge === 'PREMIUM' ? '2px 5px' : '1px 5px',
                    borderRadius: 99, flexShrink: 0, flex: 'none',
                  }}>
                    {badgeVal}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Sign out — pinned to bottom, always visible */}
        <div style={{ padding: '8px 6px 10px', borderTop: '1px solid rgba(255,255,255,0.08)', flexShrink: 0, background: NAVY }}>
          <button
            className="mc-nav-btn"
            onClick={signOut}
            style={{
              borderRadius: 8, background: 'rgba(255,255,255,0.04)',
              color: 'rgba(255,255,255,0.5)', fontSize: 12,
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
        {DOCTOR_BOTTOM_NAV.map(item => {
          if (item.href === null) {
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
              style={{ position: 'relative' }}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
              {item.id === 'doctorChat' && chatBadge > 0 && (
                <span style={{ position: 'absolute', top: 6, right: 'calc(50% - 18px)', background: '#ef4444', color: 'white', fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 99 }}>
                  {chatBadge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* ── Mobile "More" Drawer — scrollable, sign out always at bottom ── */}
      {moreOpen && (
        <div
          onClick={() => setMoreOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(12,26,46,0.6)', zIndex: 200, display: 'flex', alignItems: 'flex-end' }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ width: '100%', background: NAVY, borderRadius: '16px 16px 0 0', paddingTop: 16, paddingBottom: 'env(safe-area-inset-bottom, 16px)', fontFamily: 'DM Sans, sans-serif', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}
          >
            <div style={{ width: 36, height: 4, background: 'rgba(255,255,255,0.2)', borderRadius: 99, margin: '0 auto 12px' }} />
            {/* Scrollable nav list */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {/* Profile row */}
              <button onClick={() => { setShowProfile(true); setMoreOpen(false); }}
                style={{ display: 'flex', alignItems: 'center', gap: 14, width: '100%', padding: '13px 24px', background: 'none', border: 'none', color: 'white', fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>
                <div style={{ width: 32, height: 32, borderRadius: '50%', background: TEAL_P, color: TEAL, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700 }}>{initials}</div>
                {doctorName || 'Doctor'} — Edit Profile
              </button>
              <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', margin: '4px 0' }} />
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
            {/* Sign out — always pinned at bottom of drawer */}
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', flexShrink: 0 }}>
              <button onClick={signOut}
                style={{ display: 'flex', alignItems: 'center', gap: 14, width: '100%', padding: '14px 24px', background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)', fontSize: 15, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>
                <span style={{ fontSize: 22, width: 28, textAlign: 'center' }}>🚪</span>
                Sign out
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Doctor Profile Modal */}
      {showProfile && (
        <DoctorProfileModal
          tokenFn={() => getToken('DOCTOR')}
          onClose={() => setShowProfile(false)}
          onSignOut={signOut}
        />
      )}
    </>
  );
}

function sPill(status) {
  const map = { CONFIRMED: { bg: GREEN_P, color: GREEN }, SCHEDULED: { bg: BLUE_P, color: BLUE }, RESCHEDULED: { bg: '#ede9fe', color: '#7c3aed' }, CANCELLED: { bg: RED_P, color: RED }, COMPLETED: { bg: GREEN_P, color: GREEN }, NO_SHOW: { bg: AMBER_P, color: AMBER } };
  const s = map[status] || { bg: SURFACE, color: MUTED };
  return { ...s, fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20, display: 'inline-block' };
}

function StatCard({ icon, label, value, sub, color, onClick, loading: ld }) {
  const [hov, setHov] = useState(false);
  return (
    <div onClick={onClick} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ background: 'white', borderRadius: 14, padding: '18px 20px', border: `1px solid ${BORDER}`, cursor: onClick ? 'pointer' : 'default', transition: 'box-shadow 0.15s', boxShadow: hov && onClick ? '0 4px 16px rgba(0,0,0,0.10)' : 'none' }}>
      <div style={{ width: 38, height: 38, borderRadius: 10, background: color + '22', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, marginBottom: 10 }}>{icon}</div>
      <div style={{ fontSize: 10, color: MUTED, fontFamily: 'IBM Plex Mono, monospace', letterSpacing: '0.04em', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, color, lineHeight: 1, marginBottom: 4 }}>{ld ? '…' : value}</div>
      <div style={{ fontSize: 11, color: MUTED }}>{sub}</div>
      {onClick && !ld && <div style={{ fontSize: 11, color: BLUE, marginTop: 6, fontWeight: 600 }}>View →</div>}
    </div>
  );
}

// ── Red Flag Alert Banner (Feature B) ─────────────────────────────────────────
function RedFlagBanners({ alerts, onAcknowledge, onNavigate }) {
  if (!alerts.length) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 16 }}>
      {alerts.map(alert => (
        <div key={alert.id}
          style={{ background: RED_P, border: `2px solid ${RED}`, borderRadius: 12, padding: '12px 16px', display: 'flex', alignItems: 'flex-start', gap: 12, animation: 'rfPulse 2s ease-in-out infinite' }}>
          {/* Flashing dot */}
          <div style={{ width: 12, height: 12, borderRadius: '50%', background: RED, flexShrink: 0, marginTop: 3, animation: 'rfBlink 1s ease-in-out infinite' }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, fontWeight: 700, background: RED, color: 'white', padding: '2px 8px', borderRadius: 4 }}>
                🚨 {alert.type === 'LAB_CRITICAL' ? 'CRITICAL LAB VALUE' : 'RED FLAG MESSAGE'}
              </span>
              <span style={{ fontSize: 11, color: RED, fontWeight: 600 }}>
                {alert.patientName} · {new Date(alert.triggeredAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, color: RED, marginBottom: 4 }}>{alert.message}</div>
            {alert.type === 'LAB_CRITICAL' && (
              <div style={{ fontSize: 12, color: SEC }}>
                Parameter: <strong>{alert.parameter}</strong> · Value: <strong>{alert.value}</strong>
                {alert.fileName && <> · File: {alert.fileName}</>}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 7, flexShrink: 0 }}>
            <button onClick={() => onNavigate(alert.patientId)}
              style={{ padding: '6px 12px', background: RED, color: 'white', border: 'none', borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
              View Patient →
            </button>
            <button onClick={() => onAcknowledge(alert.id)}
              style={{ padding: '6px 12px', background: 'white', color: RED, border: `1px solid ${RED}`, borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
              ✓ Acknowledged
            </button>
          </div>
        </div>
      ))}
      <style>{`
        @keyframes rfPulse { 0%,100%{box-shadow:0 0 0 0 rgba(198,40,40,0)} 50%{box-shadow:0 0 0 6px rgba(198,40,40,0.15)} }
        @keyframes rfBlink { 0%,100%{opacity:1} 50%{opacity:0.3} }
      `}</style>
    </div>
  );
}

// ── Main Dashboard ─────────────────────────────────────────────────────────────


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
  'LV end-diastolic volume','LV end-systolic volume',
  'LV wall motion abnormality','LV hypertrophy',
  'Right ventricular function','RV enlargement',
  'Mitral valve regurgitation','Mitral valve stenosis',
  'Aortic valve regurgitation','Aortic valve stenosis',
  'Tricuspid valve regurgitation','Pericardial effusion',
  'Diastolic dysfunction grade','Left atrial enlargement',
  'Segmental wall motion abnormality',
];

// Sends file to backend proxy — backend calls Anthropic/OpenAI (avoids CORS)
async function runCardiacAnalysis(imageBase64, mimeType, mode) {
  const tok = getToken('DOCTOR');
  let r;
  try {
    r = await fetch(`${API}/ai/cardiac-analyze`, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
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
  const [mode,      setMode]      = React.useState('ecg');
  const [file,      setFile]      = React.useState(null);
  const [preview,   setPreview]   = React.useState(null);
  const [isPdf,     setIsPdf]     = React.useState(false);
  const [analyzing, setAnalyzing] = React.useState(false);
  const [result,    setResult]    = React.useState(null);
  const [error,     setError]     = React.useState('');
  const [dragOver,  setDragOver]  = React.useState(false);
  const fileRef = React.useRef(null);

  const C = {
    NAVY:'#0c1a2e', BLUE:'#1565c0', BLUE_P:'#e3f0ff',
    RED:'#c62828',  RED_P:'#fdecea',
    AMBER:'#b45309',AMBER_P:'#fff3e0',
    GREEN:'#1b5e20',GREEN_P:'#e8f5e9',
    TEAL:'#00796b',
    BORDER:'#e2e8f0', SURF:'#f7f9fc', MUTED:'#8896a7', SEC:'#4a5568',
  };

  const modeConfig = {
    ecg:  { icon:'🫀', label:'12-Lead ECG',    color:C.RED,  bg:C.RED_P,   desc:'Detects: AF, Sinus Tachycardia/Bradycardia, LBBB, RBBB, 1° AV Block' },
    echo: { icon:'🔊', label:'Echocardiogram', color:C.TEAL, bg:'#e0f5f0', desc:'PanEcho: 39 tasks — LVEF, valve disease, wall motion, diastolic function' },
  };
  const cfg = modeConfig[mode];

  // Accepted MIME types for both tools
  const ACCEPTED_TYPES = [
    'image/jpeg','image/jpg','image/png','image/webp',
    'application/pdf',
  ];
  const ACCEPTED_EXTS  = '.jpg,.jpeg,.png,.webp,.pdf';

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
        reader.onload  = e => res(e.target.result.split(',')[1]);
        reader.onerror = () => rej(new Error('Could not read file'));
        reader.readAsDataURL(file);
      });
      const mime = normaliseMime(file.type);
      const res  = await runCardiacAnalysis(base64, mime, mode);
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
    <div style={{ background:'white', borderRadius:14, border:`1px solid ${C.BORDER}`, overflow:'hidden', marginBottom:20 }}>

      {/* ── Header ── */}
      <div style={{ background:`linear-gradient(135deg,${C.NAVY} 0%,#1a2e4a 100%)`, padding:'16px 20px' }}>
        <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:12 }}>
          <span style={{ fontSize:24 }}>🧠</span>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:15, fontWeight:700, color:'white' }}>Cardiac AI Diagnostics</div>
            <div style={{ fontSize:11, color:'rgba(255,255,255,0.5)' }}>Powered by Claude AI · For clinical reference only</div>
          </div>
          <div style={{ background:'rgba(255,255,255,0.12)', borderRadius:8, padding:'3px 10px', fontSize:10, color:'rgba(255,255,255,0.7)', fontWeight:700 }}>BETA</div>
        </div>
        {/* Mode tabs */}
        <div style={{ display:'flex', gap:8 }}>
          {[
            { id:'ecg',  label:'🫀 ECG Analysis',       sub:'12-lead · 6 diagnoses'  },
            { id:'echo', label:'🔊 Echo Interpretation', sub:'PanEcho · 39 tasks'     },
          ].map(t => (
            <button key={t.id} onClick={() => { setMode(t.id); reset(); }}
              style={{ flex:1, padding:'9px 12px', borderRadius:9, cursor:'pointer', textAlign:'left',
                border:`1.5px solid ${mode===t.id?'rgba(255,255,255,0.5)':'rgba(255,255,255,0.15)'}`,
                background:mode===t.id?'rgba(255,255,255,0.15)':'transparent', color:'white' }}>
              <div style={{ fontSize:12.5, fontWeight:700 }}>{t.label}</div>
              <div style={{ fontSize:10, opacity:0.55, marginTop:1 }}>{t.sub}</div>
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding:20 }}>

        {/* Instructions */}
        <div style={{ background:C.SURF, borderRadius:10, padding:'10px 14px', marginBottom:16, fontSize:12.5, color:C.SEC, lineHeight:1.7 }}>
          {mode === 'ecg' ? (
            <><strong>ECG Tool:</strong> Upload a scanned <strong>12-lead ECG</strong> as <strong>JPG, PNG or PDF</strong>. Detects:
              <strong style={{ color:C.RED }}> Atrial Fibrillation, Sinus Tachycardia, Sinus Bradycardia, Left Bundle Branch Block, Right Bundle Branch Block, First-Degree AV Block</strong>.
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
              style={{ border:`2px dashed ${dragOver||file ? cfg.color : C.BORDER}`,
                borderRadius:12, padding: file ? 16 : '28px 20px',
                textAlign: file ? 'left' : 'center', cursor:'pointer',
                background: dragOver||file ? cfg.bg : C.SURF, transition:'all 0.2s',
                marginBottom:14 }}>
              <input ref={fileRef} type="file" accept={ACCEPTED_EXTS} style={{ display:'none' }}
                onChange={e => handleFile(e.target.files?.[0])} />
              {file ? (
                <div style={{ display:'flex', gap:14, alignItems:'center' }}>
                  {/* Preview or PDF icon */}
                  {preview ? (
                    <img src={preview} alt="preview"
                      style={{ width:80, height:60, objectFit:'cover', borderRadius:8,
                        border:`1px solid ${C.BORDER}`, flexShrink:0 }} />
                  ) : (
                    <div style={{ width:80, height:60, background:'#fff0f0', borderRadius:8,
                      border:`1px solid ${C.BORDER}`, display:'flex', flexDirection:'column',
                      alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                      <span style={{ fontSize:26 }}>📄</span>
                      <span style={{ fontSize:9, color:C.RED, fontWeight:700 }}>PDF</span>
                    </div>
                  )}
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:13.5, fontWeight:600, color:C.NAVY,
                      overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                      {file.name}
                    </div>
                    <div style={{ fontSize:11.5, color:C.MUTED, marginTop:3 }}>
                      {(file.size/1024/1024).toFixed(2)} MB · {isPdf ? 'PDF document' : 'Image file'}
                    </div>
                    <button onClick={e => { e.stopPropagation(); reset(); }}
                      style={{ fontSize:11, color:C.RED, background:'none', border:'none',
                        cursor:'pointer', padding:0, marginTop:4, fontFamily:'DM Sans, sans-serif' }}>
                      × Remove
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div style={{ fontSize:36, marginBottom:10 }}>{cfg.icon}</div>
                  <div style={{ fontWeight:700, fontSize:14, color:C.NAVY, marginBottom:4 }}>
                    {dragOver ? 'Drop file here' : `Upload ${cfg.label}`}
                  </div>
                  <div style={{ fontSize:12, color:C.MUTED, marginBottom:6 }}>
                    JPG · PNG · WebP · PDF &nbsp;·&nbsp; Max 25 MB
                  </div>
                  <div style={{ fontSize:11, color:C.MUTED }}>Click to browse or drag &amp; drop</div>
                </>
              )}
            </div>

            {/* Error */}
            {error && (
              <div style={{ background:C.RED_P, border:'1px solid #f5c6cb', borderRadius:9,
                padding:'10px 14px', fontSize:13, color:C.RED, marginBottom:14, lineHeight:1.6 }}>
                <strong>⚠️ Error:</strong> {error}
              </div>
            )}

            {/* Analyze button */}
            <button onClick={analyze} disabled={!file || analyzing}
              style={{ width:'100%', padding:12, fontSize:14, fontWeight:700, border:'none',
                borderRadius:10, cursor: !file||analyzing ? 'not-allowed' : 'pointer',
                background: !file ? '#94a3b8' : analyzing ? '#64748b' : cfg.color,
                color:'white', transition:'background 0.2s' }}>
              {analyzing
                ? `⏳ Analysing ${cfg.label}… (10–30 seconds)`
                : file ? `🔍 Analyse ${cfg.label}` : `Upload a file to analyse`}
            </button>

            {analyzing && (
              <div style={{ textAlign:'center', padding:'16px 0 4px', color:C.MUTED, fontSize:12.5 }}>
                Claude AI is reading your {isPdf ? 'PDF' : 'image'} — please wait…
              </div>
            )}
          </>
        ) : (
          /* ── Results ── */
          <>
            {mode === 'ecg'
              ? <ECGResults  result={result} C={C} />
              : <EchoResults result={result} C={C} />
            }
            <button onClick={reset}
              style={{ width:'100%', padding:'10px', marginTop:14, background:C.SURF, color:C.SEC,
                border:`1px solid ${C.BORDER}`, borderRadius:9, fontSize:13, fontWeight:600, cursor:'pointer' }}>
              ← Analyse Another File
            </button>
            <div style={{ marginTop:10, padding:'8px 12px', background:C.AMBER_P, borderRadius:8,
              fontSize:11.5, color:C.AMBER, lineHeight:1.6 }}>
              ⚠️ <strong>Disclaimer:</strong> This AI output is for clinical reference only. Always confirm findings with a qualified cardiologist before making any clinical decisions.
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ECGResults({ result, C }) {
  const detected  = Array.isArray(result.detected) ? result.detected : [];
  const hasIssues = detected.length > 0;
  const confColor = c => c==='high'?C.GREEN : c==='medium'?C.AMBER : C.MUTED;
  const confBg    = c => c==='high'?C.GREEN_P : c==='medium'?C.AMBER_P : C.SURF;

  return (
    <div>
      {/* Urgent warning */}
      {result.warning && (
        <div style={{ background:C.RED_P, border:'1.5px solid #f5c6cb', borderRadius:10,
          padding:'12px 14px', marginBottom:14, display:'flex', gap:10, alignItems:'flex-start' }}>
          <span style={{ fontSize:20, flexShrink:0 }}>🚨</span>
          <div>
            <div style={{ fontWeight:700, fontSize:13.5, color:C.RED, marginBottom:3 }}>Urgent Finding</div>
            <div style={{ fontSize:13, color:C.RED }}>{result.warning}</div>
          </div>
        </div>
      )}

      {/* Main diagnosis panel */}
      <div style={{ background:hasIssues?C.RED_P:C.GREEN_P,
        border:`1.5px solid ${hasIssues?'#f5c6cb':'#a5d6a7'}`,
        borderRadius:12, padding:'14px 18px', marginBottom:14 }}>
        <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom: hasIssues?12:0 }}>
          <span style={{ fontSize:22 }}>{hasIssues?'⚠️':'✅'}</span>
          <div style={{ fontSize:14, fontWeight:700, color:hasIssues?C.RED:C.GREEN }}>
            {hasIssues
              ? `${detected.length} Diagnosis${detected.length>1?'es':''} Detected`
              : 'None of the model diagnoses detected'}
          </div>
        </div>
        {hasIssues && detected.map(d => {
          const conf = result.confidence?.[d];
          return (
            <div key={d} style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
              padding:'8px 12px', background:'white', borderRadius:8,
              border:'1px solid #f5c6cb', marginBottom:6 }}>
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <div style={{ width:8, height:8, borderRadius:'50%', background:C.RED, flexShrink:0 }}/>
                <span style={{ fontSize:13.5, fontWeight:600, color:C.NAVY }}>{d}</span>
              </div>
              {conf && (
                <span style={{ fontSize:11, fontWeight:700, background:confBg(conf),
                  color:confColor(conf), padding:'2px 8px', borderRadius:99 }}>
                  {conf} confidence
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* ECG metrics */}
      {(result.rate || result.rhythm || result.axis) && (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8, marginBottom:14 }}>
          {[
            { label:'Heart Rate', value:result.rate   },
            { label:'Rhythm',     value:result.rhythm  },
            { label:'Axis',       value:result.axis    },
          ].filter(m=>m.value).map(m=>(
            <div key={m.label} style={{ background:C.SURF, borderRadius:9, padding:'10px 12px', border:`1px solid ${C.BORDER}` }}>
              <div style={{ fontSize:10.5, color:C.MUTED, marginBottom:3 }}>{m.label}</div>
              <div style={{ fontSize:13, fontWeight:600, color:C.NAVY }}>{m.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Clinical summary */}
      {result.findings && (
        <div style={{ background:C.SURF, borderRadius:10, padding:'12px 14px', fontSize:13, color:C.SEC, lineHeight:1.75 }}>
          <div style={{ fontSize:10.5, fontWeight:700, color:C.MUTED, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:6 }}>Clinical Summary</div>
          {Array.isArray(result.findings)
                    ? (result.findings[0]?.title || result.findings[0]?.detail || '')
                    : (typeof result.findings === 'string' ? result.findings : '')}
        </div>
      )}
    </div>
  );
}

function EchoResults({ result, C }) {
  const lvefNum   = parseFloat(result.lvef);
  const lvefColor = isNaN(lvefNum) ? C.MUTED : lvefNum>=55 ? C.GREEN : lvefNum>=40 ? C.AMBER : C.RED;
  const lvefBg    = isNaN(lvefNum) ? C.SURF  : lvefNum>=55 ? C.GREEN_P : lvefNum>=40 ? C.AMBER_P : C.RED_P;

  return (
    <div>
      {/* LVEF hero */}
      {result.lvef && (
        <div style={{ background:lvefBg, border:`1.5px solid ${lvefColor}40`,
          borderRadius:12, padding:'14px 18px', marginBottom:14, display:'flex', alignItems:'center', gap:16 }}>
          <div style={{ textAlign:'center', flexShrink:0 }}>
            <div style={{ fontSize:34, fontWeight:800, color:lvefColor, lineHeight:1 }}>{result.lvef}</div>
            <div style={{ fontSize:11, color:C.MUTED, marginTop:2 }}>LVEF</div>
          </div>
          <div>
            <div style={{ fontSize:14, fontWeight:700, color:C.NAVY, marginBottom:3 }}>
              LV Function: {result.lvFunction||'—'}
            </div>
            {result.rvFunction && (
              <div style={{ fontSize:12.5, color:C.SEC }}>RV Function: {result.rvFunction}</div>
            )}
          </div>
        </div>
      )}

      {/* Valvular findings */}
      {result.valvularFindings && Object.keys(result.valvularFindings).length > 0 && (
        <div style={{ marginBottom:14 }}>
          <div style={{ fontSize:11.5, fontWeight:700, color:C.MUTED, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:8 }}>Valvular Assessment</div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
            {Object.entries(result.valvularFindings).filter(([,v])=>v&&v!=='not assessed').map(([valve,finding])=>(
              <div key={valve} style={{ background:C.SURF, borderRadius:9, padding:'9px 12px', border:`1px solid ${C.BORDER}` }}>
                <div style={{ fontSize:10.5, color:C.MUTED, textTransform:'capitalize', marginBottom:3 }}>{valve} valve</div>
                <div style={{ fontSize:12.5, fontWeight:600,
                  color: finding.toLowerCase().includes('normal')?C.GREEN
                       : finding.toLowerCase().includes('severe')?C.RED : C.AMBER }}>
                  {finding}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Structural + other metrics */}
      {result.structuralFindings?.length > 0 && (
        <div style={{ marginBottom:14 }}>
          <div style={{ fontSize:11.5, fontWeight:700, color:C.MUTED, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:8 }}>Structural Findings</div>
          {result.structuralFindings.map((f,i)=>(
            <div key={i} style={{ display:'flex', gap:8, fontSize:13, color:C.SEC, padding:'5px 0', borderBottom:`1px solid ${C.BORDER}` }}>
              <span style={{ color:C.TEAL, flexShrink:0 }}>•</span>{f}
            </div>
          ))}
        </div>
      )}

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:14 }}>
        {[
          { label:'Diastolic Function', value:result.diastolicFunction },
          { label:'Wall Motion',        value:result.wallMotion        },
          { label:'Pericardium',        value:result.pericardium       },
        ].filter(m=>m.value).map(m=>(
          <div key={m.label} style={{ background:C.SURF, borderRadius:9, padding:'9px 12px', border:`1px solid ${C.BORDER}` }}>
            <div style={{ fontSize:10.5, color:C.MUTED, marginBottom:3 }}>{m.label}</div>
            <div style={{ fontSize:12.5, fontWeight:600, color:C.NAVY }}>{m.value}</div>
          </div>
        ))}
      </div>

      {result.impression && (
        <div style={{ background:C.SURF, borderRadius:10, padding:'12px 14px', marginBottom:12, fontSize:13, color:C.SEC, lineHeight:1.75 }}>
          <div style={{ fontSize:10.5, fontWeight:700, color:C.MUTED, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:6 }}>Echocardiographic Impression</div>
          {result.impression}
        </div>
      )}

      {result.recommendations?.length > 0 && (
        <div style={{ background:C.GREEN_P, borderRadius:10, padding:'12px 14px', marginBottom:12, border:`1px solid #a5d6a7` }}>
          <div style={{ fontSize:10.5, fontWeight:700, color:C.GREEN, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:8 }}>Recommendations</div>
          {result.recommendations.map((rec,i) => (
            <div key={i} style={{ fontSize:12.5, color:C.SEC, display:'flex', gap:8, padding:'3px 0' }}>
              <span style={{ color:C.GREEN, fontWeight:700 }}>{i+1}.</span>{rec}
            </div>
          ))}
        </div>
      )}

      {result.tasks_assessed?.length > 0 && (
        <div style={{ fontSize:11.5, color:C.MUTED, lineHeight:1.7, marginBottom:6 }}>
          <strong>PanEcho tasks assessed:</strong> {result.tasks_assessed.join(', ')}
        </div>
      )}
      {result.limitations && (
        <div style={{ fontSize:11.5, color:C.MUTED, fontStyle:'italic' }}>
          ⚠️ Limitations: {result.limitations}
        </div>
      )}
    </div>
  );
}


export default function DoctorDashboard() {
  const router = useRouter();

  const [mounted,  setMounted]  = useState(false);
  const [user,     setUser]     = useState(null);
  const [appts,    setAppts]    = useState([]);
  const [patients, setPatients] = useState(0);
  const [loading,  setLoading]  = useState(true);

  // Feature B: Red Flag Alerts
  const [alerts,      setAlerts]      = useState([]);
  const [alertsLoaded,setAlertsLoaded]= useState(false);
  const [realPatients, setRealPatients] = useState([]);
  const [unreadCounts, setUnreadCounts] = useState({});

  const token = useCallback(() => getToken('DOCTOR'), []);

  // Fetch alerts + auto-refresh every 30 seconds
  const fetchAlerts = useCallback(async () => {
    try {
      const r = await fetch(`${API}/cdss/alerts`, { headers: { Authorization: `Bearer ${token()}` } });
      if (r.ok) {
        const d = await r.json();
        setAlerts(d.data || []);
      }
    } catch {}
    setAlertsLoaded(true);
  }, [token]);

  async function acknowledgeAlert(alertId) {
    try {
      await fetch(`${API}/cdss/alerts/acknowledge`, {
        method:  'POST',
        headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
        body:    JSON.stringify({ alertId }),
      });
      setAlerts(prev => prev.filter(a => a.id !== alertId));
    } catch {}
  }

  useEffect(() => {
    setMounted(true);
    const tok    = token();
    const parsed = getUser('DOCTOR');

    if (!tok)                          { window.location.href = '/login';   return; }
    if (!parsed || !parsed.role)       { window.location.href = '/login';   return; }
    if (parsed.role !== 'DOCTOR')      { window.location.href = '/patient'; return; }
    setUser(parsed);

    const headers = { Authorization: `Bearer ${tok}` };

    fetch(`${API}/auth/me`, { headers })
      .then(r => {
        if (r.status === 401 || r.status === 403) {
          clearSession('DOCTOR');
          window.location.href = '/login';
          return null;
        }
        return r.ok ? r.json() : null;
      })
      .catch(() => null);

    fetch(`${API}/appointments`, { headers }).then(r => r.json())
      .then(d => { setAppts(d.data || d.appointments || []); }).catch(() => {}).finally(() => setLoading(false));

    fetch(`${API}/patients`, { headers }).then(r => r.json())
      .then(d => setPatients(d.total || d.data?.length || d.patients?.length || 0)).catch(() => {});

    // Load alerts immediately, then poll every 30s
    fetchAlerts();
    const interval = setInterval(fetchAlerts, 30_000);

    // Load real patients for Patient Panel
    fetch(`${API}/doctor-data/patients`, { headers })
      .then(r => r.json())
      .then(d => setRealPatients((d.data || []).slice(0, 6)))
      .catch(() => {});

    // Load unread message counts from chat rooms
    fetch(`${API}/chat/rooms?limit=100`, { headers })
      .then(r => r.json())
      .then(d => {
        const counts = {};
        for (const room of (d.data || [])) {
          const p = room.patient || room.appointment?.patient;
          if (p?.id && (room.unreadCount || 0) > 0) counts[p.id] = room.unreadCount;
        }
        setUnreadCounts(counts);
      })
      .catch(() => {});

    return () => clearInterval(interval);
  }, []);

  const todayStr  = new Date().toDateString();
  const todayList = appts.filter(a => new Date(a.scheduledAt).toDateString() === todayStr);
  const upcoming  = appts.filter(a => !['CANCELLED', 'COMPLETED'].includes(a.status));
  const doctor    = user?.doctor;

  // Build patient panel from real data
  const uColor = u => ({ CRITICAL: RED, HIGH: AMBER, MEDIUM: BLUE, LOW: GREEN }[u] || MUTED);
  const uBg    = u => ({ CRITICAL: RED_P, HIGH: AMBER_P, MEDIUM: BLUE_P, LOW: GREEN_P }[u] || SURFACE);

  if (!mounted) return (
    <div className="mc-app-shell" style={{ background: 'linear-gradient(90deg, #0c1a2e 60px, #f7f9fc 60px)' }}>
      <div style={{ width: 60, minWidth: 60, background: NAVY, flexShrink: 0 }} />
      <div style={{ flex: 1, background: SURFACE }} />
    </div>
  );

  return (
    <div className="mc-app-shell">
      <DoctorSidebar active="doctorDashboard" onProfileClick={() => setShowProfile(true)} />

      <div className="mc-main">
        <div className="mc-content">

          {/* ── FEATURE B: Red Flag Banner — always at top ── */}
          {alertsLoaded && alerts.length > 0 && (
            <RedFlagBanners
              alerts={alerts}
              onAcknowledge={acknowledgeAlert}
              onNavigate={patientId => router.push(`/doctor/reports?patientId=${patientId}`)}
            />
          )}

          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 22, flexWrap: 'wrap', gap: 10 }}>
            <div>
              <div style={{ fontSize: 20, fontWeight: 700, color: NAVY }}>Doctor Dashboard</div>
              <div style={{ fontSize: 13, color: MUTED, marginTop: 2 }}>
                {doctor?.firstName ? `Dr. ${doctor.firstName} ${doctor.lastName} · ${doctor.specialty}` : 'Welcome'}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {/* Alert count badge on button */}
              <button onClick={() => router.push('/doctor/reports')}
                style={{ padding: '8px 16px', background: PURPLE, color: 'white', border: 'none', borderRadius: 9, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, position: 'relative' }}>
                🔬 Review Reports
                {alerts.length > 0 && (
                  <span style={{ background: RED, color: 'white', borderRadius: '50%', fontSize: 10, fontWeight: 700, width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'absolute', top: -6, right: -6 }}>{alerts.length}</span>
                )}
              </button>
              <button onClick={() => router.push('/doctor/chat')}
                style={{ padding: '8px 16px', background: BLUE, color: 'white', border: 'none', borderRadius: 9, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                💬 Open Chat
              </button>
            </div>
          </div>

          {/* Stat cards */}
          <div className="mc-stats-grid" style={{ marginBottom: 24 }}>
            <StatCard icon="📅" label="TODAY'S APPOINTMENTS" value={todayList.length} sub={`${upcoming.length} upcoming total`} color={BLUE}  loading={loading} onClick={() => router.push('/doctor/appointments')} />
            <StatCard icon="👥" label="TOTAL PATIENTS"       value={patients}         sub="in your panel"    color={TEAL}  loading={loading} onClick={() => router.push('/doctor/patients')} />
            <StatCard icon="✅" label="COMPLETED TODAY"      value={todayList.filter(a => a.status === 'COMPLETED').length} sub="consultations" color={GREEN} loading={loading} />
            <StatCard icon="🚨" label="CRITICAL ALERTS"      value={alerts.length}    sub="unacknowledged"   color={alerts.length > 0 ? RED : GREEN} loading={!alertsLoaded} onClick={alerts.length > 0 ? () => window.scrollTo({ top: 0, behavior: 'smooth' }) : undefined} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20, marginBottom: 20 }}>

            {/* Today's appointments */}
            <div style={{ background: 'white', borderRadius: 14, border: `1px solid ${BORDER}`, overflow: 'hidden' }}>
              <div style={{ padding: '14px 18px', borderBottom: `1px solid ${BORDER}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: NAVY }}>Today's Schedule</div>
                <button onClick={() => router.push('/doctor/appointments')} style={{ fontSize: 12, color: BLUE, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>View all →</button>
              </div>
              <div style={{ padding: '0 18px' }}>
                {loading ? (
                  <div style={{ padding: '24px 0', textAlign: 'center', color: MUTED }}>Loading…</div>
                ) : todayList.length === 0 ? (
                  <div style={{ padding: '28px 0', textAlign: 'center', color: MUTED, fontSize: 13 }}>No appointments today</div>
                ) : (
                  todayList.slice(0, 5).map((a, i) => {
                    const d = new Date(a.scheduledAt);
                    const p = a.patient;
                    return (
                      <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: i < todayList.length - 1 ? `1px solid ${BORDER}` : 'none' }}>
                        <div style={{ width: 34, height: 34, borderRadius: '50%', background: BLUE_P, color: BLUE, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                          {p ? `${p.firstName?.[0] || ''}${p.lastName?.[0] || ''}` : 'PT'}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: NAVY }}>{p ? `${p.firstName} ${p.lastName}` : 'Patient'}</div>
                          <div style={{ fontSize: 11, color: MUTED }}>{d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })} · {a.type?.replace('_', ' ')}</div>
                        </div>
                        <span style={{ ...sPill(a.status) }}>{a.status}</span>
                        <button onClick={() => router.push('/doctor/chat')} style={{ padding: '5px 10px', background: BLUE_P, color: BLUE, border: 'none', borderRadius: 7, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Chat</button>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Patient panel */}
            <div style={{ background: 'white', borderRadius: 14, border: `1px solid ${BORDER}`, overflow: 'hidden' }}>
              <div style={{ padding: '14px 18px', borderBottom: `1px solid ${BORDER}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: NAVY }}>Patient Panel</div>
                <button onClick={() => router.push('/doctor/patients')} style={{ fontSize: 12, color: BLUE, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>All patients →</button>
              </div>
              <div style={{ padding: '0 18px' }}>
                {realPatients.length === 0 ? (
                  <div style={{ padding: '24px 0', textAlign: 'center', color: MUTED, fontSize: 13 }}>
                    {loading ? 'Loading patients…' : 'No patients yet. Confirm an appointment to add patients.'}
                  </div>
                ) : realPatients.map((p, i) => {
                  const name    = `${p.firstName||''} ${p.lastName||''}`.trim();
                  const inits   = `${p.firstName?.[0]||''}${p.lastName?.[0]||''}`.toUpperCase()||'?';
                  const conds   = (p.conditions||[]).map(c=>c.condition||c).slice(0,2).join(', ') || 'No conditions recorded';
                  const urgency = alerts.some(a=>a.patient?.id===p.id||a.patientId===p.id) ? 'HIGH' : 'LOW';
                  const unread  = unreadCounts[p.id] || 0;
                  const patAlert= alerts.find(a=>a.patient?.id===p.id||a.patientId===p.id);
                  return (
                    <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 0', borderBottom: i < realPatients.length - 1 ? `1px solid ${BORDER}` : 'none', cursor: 'pointer' }}
                      onClick={() => router.push(`/doctor/patients/${p.id}`)}>
                      <div style={{ width: 34, height: 34, borderRadius: '50%', background: uBg(urgency), color: uColor(urgency), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                        {inits}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: 13, fontWeight: 600, color: NAVY }}>{name}</span>
                          {patAlert && <span style={{ fontSize: 9, fontWeight: 700, background: RED, color: 'white', padding: '1px 5px', borderRadius: 4 }}>🚨 ALERT</span>}
                        </div>
                        <div style={{ fontSize: 11, color: MUTED, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{conds}</div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                        {patAlert && <span style={{ fontSize: 10, fontWeight: 700, background: uBg('HIGH'), color: uColor('HIGH'), padding: '2px 7px', borderRadius: 4 }}>HIGH</span>}
                        {unread > 0 && <span style={{ fontSize: 10, fontWeight: 700, background: RED, color: 'white', borderRadius: 9, padding: '1px 6px' }}>{unread}</span>}
                      </div>
                      {/* Quick action buttons */}
                      <div style={{ display: 'flex', gap: 4, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                        <button
                          onClick={() => router.push(`/doctor/patients/${p.id}`)}
                          style={{ padding: '4px 8px', background: BLUE_P, color: BLUE, border: 'none', borderRadius: 6, fontSize: 10, fontWeight: 700, cursor: 'pointer' }}
                          title="View patient info"
                        >
                          Info
                        </button>
                        <button
                          onClick={() => router.push(`/doctor/chat?patientId=${p.id}`)}
                          style={{ padding: '4px 8px', background: GREEN_P, color: GREEN, border: 'none', borderRadius: 6, fontSize: 10, fontWeight: 700, cursor: 'pointer' }}
                          title="Open chat"
                        >
                          Chat
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* ── Cardiac AI Diagnostics — Cardiologists only ── */}
          {(()=>{
            const spec = (doctor?.specialty||'').toLowerCase();
            const isCardio = spec.includes('cardio') || spec.includes('cardiac') || spec.includes('heart');
            if (!isCardio) return null;
            return <ECGEchoTools isDoctor={true}/>;
          })()}


          {/* CDSS Feature cards */}
          <div style={{ background: 'white', borderRadius: 14, border: `1px solid ${BORDER}`, padding: '16px 18px' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: NAVY, marginBottom: 4 }}>🧠 CDSS — Clinical Decision Support</div>
            <div style={{ fontSize: 12.5, color: MUTED, marginBottom: 14 }}>AI-powered guardrails and insights active on your patient panel</div>
            <div className="mc-actions-grid">
              {[
                { icon: '📈', label: 'Delta-Check', desc: 'Velocity alerts on lab trends', color: BLUE, href: '/doctor/reports' },
                { icon: '🚨', label: 'Red Flag AI', desc: `${alerts.length} active alert${alerts.length !== 1 ? 's' : ''}`, color: alerts.length > 0 ? RED : GREEN, href: null, action: () => window.scrollTo({ top: 0, behavior: 'smooth' }) },
                { icon: '🏥', label: 'ABHA/ABDM',   desc: 'National health history', color: TEAL, href: '/doctor/patients' },
                { icon: '🔬', label: 'DDx Engine',  desc: 'Differential diagnosis AI', color: PURPLE, href: '/doctor/reports' },
              ].map(f => (
                <div key={f.label} onClick={() => f.href ? router.push(f.href) : f.action?.()}
                  style={{ padding: '12px 14px', borderRadius: 10, border: `1px solid ${f.color}30`, background: f.color + '08', cursor: 'pointer', transition: 'all 0.15s' }}>
                  <div style={{ fontSize: 22, marginBottom: 6 }}>{f.icon}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: f.color, marginBottom: 3 }}>{f.label}</div>
                  <div style={{ fontSize: 11.5, color: MUTED }}>{f.desc}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}