'use client';
/**
 * Shared Doctor Profile Modal Component
 * Used by: doctor Sidebar across all doctor pages
 * 
 * Buttons:
 *  - Edit Profile (name, specialty, bio, hospital, consultFee, qualification)
 *  - Change Password
 *  - Availability toggle (isAvailable ON/OFF)
 *  - View Public Profile (what patients see)
 *  - Copy App Login Email (@mediconnect.ai)
 *  - Sign Out
 */

import { useState, useEffect } from 'react';

const NAVY='#0c1a2e',BLUE='#1565c0',BLUE_P='#e3f0ff',RED='#c62828',RED_P='#fdecea',
      GREEN='#1b5e20',GREEN_P='#e8f5e9',AMBER='#b45309',AMBER_P='#fff3e0',
      TEAL='#00796b',BORDER='#e2e8f0',SURFACE='#f7f9fc',MUTED='#8896a7',SEC='#4a5568';
const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

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

export default function DoctorProfileModal({ onClose, tokenFn, onSignOut }) {
  const [view,     setView]     = useState('profile'); // profile | edit | password | withdraw
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

  // Withdrawal state
  const [wdPass,    setWdPass]    = useState('');
  const [wdReason,  setWdReason]  = useState('');
  const [wdErr,     setWdErr]     = useState('');
  const [wdConfirm, setWdConfirm] = useState(false);

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

  async function withdrawFromSystem() {
    setWdErr('');
    if (!wdPass.trim()) { setWdErr('Enter your password to confirm.'); return; }
    if (!wdConfirm)     { setWdErr('Please tick the confirmation checkbox.'); return; }
    setSaving(true);
    try {
      const r = await fetch(`${API}/doctor-data/withdraw`, {
        method:  'DELETE',
        headers: { Authorization: `Bearer ${tokenFn()}`, 'Content-Type': 'application/json' },
        body:    JSON.stringify({ password: wdPass, reason: wdReason }),
      });
      const d = await r.json();
      if (r.ok && d.success) {
        showToast('✅ Account deactivated. Signing you out…');
        setTimeout(() => onSignOut(), 2000);
      } else {
        setWdErr(d.message || 'Withdrawal failed.');
      }
    } catch {
      setWdErr('Network error. Please try again.');
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

                  <button onClick={() => setView('withdraw')}
                    style={{ width:'100%', padding:'11px 16px', background:'#fff5f5', color:'#9b1c1c', border:'1px solid #fca5a5',
                             borderRadius:10, fontSize:13.5, fontWeight:600, cursor:'pointer', textAlign:'left',
                             display:'flex', alignItems:'center', gap:10 }}>
                    <span style={{ fontSize:18 }}>⚠️</span> Withdraw from System
                  </button>

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

        {/* ── Withdraw from System ── */}
        {view === 'withdraw' && (
          <div style={{ flex:1, overflowY:'auto' }}>
            <div style={{ padding:'14px 20px', borderBottom:`1px solid ${BORDER}`, display:'flex', alignItems:'center', gap:10 }}>
              <button onClick={() => { setView('profile'); setWdErr(''); setWdPass(''); setWdReason(''); setWdConfirm(false); }}
                style={{ background:'none', border:'none', cursor:'pointer', color:MUTED, fontSize:18, padding:0 }}>←</button>
              <div style={{ fontSize:14, fontWeight:700, color:RED }}>⚠️ Withdraw from System</div>
            </div>
            <div style={{ padding:20, display:'flex', flexDirection:'column', gap:14 }}>
              <div style={{ background:'#fff5f5', border:'1px solid #fca5a5', borderRadius:12, padding:'14px 16px' }}>
                <div style={{ fontWeight:700, fontSize:13.5, color:'#7f1d1d', marginBottom:8 }}>What happens when you withdraw?</div>
                <div style={{ fontSize:12.5, color:'#991b1b', lineHeight:1.75 }}>
                  • Your profile is removed from patient search immediately<br/>
                  • All upcoming appointments must be resolved first<br/>
                  • Your patient medical records are <strong>retained</strong> as required by law<br/>
                  • Chat history and reports are preserved for patients<br/>
                  • You can request reactivation by emailing support@mediconnect.ai
                </div>
              </div>

              {wdErr && (
                <div style={{ background:RED_P, border:'1px solid #f5c6cb', borderRadius:9, padding:'10px 14px', fontSize:13, color:RED }}>
                  {wdErr}
                </div>
              )}

              <div>
                <label style={{ fontSize:12, fontWeight:600, color:SEC, display:'block', marginBottom:5 }}>
                  Reason for withdrawal (optional)
                </label>
                <textarea value={wdReason} onChange={e => setWdReason(e.target.value)}
                  placeholder="e.g. Retiring, moving to another platform, taking a break…"
                  rows={3} style={{ width:'100%', padding:'9px 12px', border:`1.5px solid ${BORDER}`, borderRadius:9,
                    fontSize:13, resize:'none', outline:'none', fontFamily:'DM Sans, sans-serif', boxSizing:'border-box' }} />
              </div>

              <div>
                <label style={{ fontSize:12, fontWeight:600, color:SEC, display:'block', marginBottom:5 }}>
                  Confirm with your password *
                </label>
                <input type="password" value={wdPass} placeholder="Enter your current password"
                  onChange={e => { setWdPass(e.target.value); setWdErr(''); }}
                  style={{ width:'100%', padding:'9px 12px', border:`1.5px solid ${BORDER}`, borderRadius:9,
                    fontSize:13, outline:'none', fontFamily:'DM Sans, sans-serif', boxSizing:'border-box' }} />
              </div>

              <label style={{ display:'flex', alignItems:'flex-start', gap:10, cursor:'pointer', fontSize:13, color:SEC, lineHeight:1.6 }}>
                <input type="checkbox" checked={wdConfirm} onChange={e => setWdConfirm(e.target.checked)}
                  style={{ marginTop:3, flexShrink:0, width:16, height:16 }} />
                I understand that my profile will be deactivated and I will be signed out immediately. My patient records will be retained.
              </label>

              <button onClick={withdrawFromSystem} disabled={saving || !wdPass || !wdConfirm}
                style={{ width:'100%', padding:'12px', background: (!wdPass || !wdConfirm || saving) ? '#fca5a5' : RED,
                  color:'white', border:'none', borderRadius:10, fontSize:14, fontWeight:700,
                  cursor: (!wdPass || !wdConfirm || saving) ? 'not-allowed' : 'pointer' }}>
                {saving ? '⏳ Processing withdrawal…' : '⚠️ Withdraw from MediConnect AI'}
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

