'use client';
/**
 * src/app/doctor/updates/page.js
 * 
 * Real-time updates for doctors from multiple live data sources:
 *  - Unread patient messages (from chat rooms)
 *  - Urgent/Red-flag messages (from appointments/critical-alerts)
 *  - CDSS system alerts (in-memory alert store)
 *  - Upcoming appointments (today + tomorrow)
 */

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';

const NAVY = '#0c1a2e', BLUE = '#1565c0', BLUE_P = '#e3f0ff', RED = '#c62828', RED_P = '#fdecea',
  AMBER = '#b45309', AMBER_P = '#fff3e0', GREEN = '#1b5e20', GREEN_P = '#e8f5e9',
  TEAL = '#00796b', TEAL_P = '#e0f5f0', PURPLE = '#6b21a8', PURPLE_P = '#f5f3ff',
  BORDER = '#e2e8f0', SURFACE = '#f7f9fc', MUTED = '#8896a7', SEC = '#4a5568';
const API = process.env.NEXT_PUBLIC_API_URL || 'process.env.NEXT_PUBLIC_API_URL ? process.env.NEXT_PUBLIC_API_URL : (process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api")';

const NAV = [
  { id: 'doctorDashboard', label: 'Dashboard', icon: '⊞', href: '/doctor' },
  { id: 'doctorPatients', label: 'All Patients', icon: '👥', href: '/doctor/patients' },
  { id: 'doctorAppts', label: 'Appointments', icon: '📅', href: '/doctor/appointments' },
  { id: 'doctorChat', label: 'Patient Chat', icon: '💬', href: '/doctor/chat', badge: '_chat' },
  { id: 'doctorUpdates', label: 'Updates', icon: '🔔', href: '/doctor/updates', badge: '_alerts' },
  { id: 'doctorReports', label: 'Report Review', icon: '🔬', href: '/doctor/reports', badge: 'PREMIUM' },
];

const fmtDate = iso => { if (!iso) return '—'; const d = new Date(iso); const now = new Date(); const diff = Math.floor((now - d) / 60000); if (diff < 1) return 'Just now'; if (diff < 60) return `${diff}m ago`; if (diff < 1440) return `${Math.floor(diff / 60)}h ago`; return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }); };
const fmtAppt = iso => { if (!iso) return '—'; return new Date(iso).toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); };


// ── Doctor Profile Modal (inlined) ──────────────────────────────────────
const SPECIALTIES = ['General Practice', 'Internal Medicine', 'Cardiology', 'Endocrinology & Diabetology',
  'Neurology', 'Orthopedics', 'Dermatology', 'Psychiatry', 'Pediatrics', 'Gynecology & Obstetrics',
  'Ophthalmology', 'ENT', 'Pulmonology', 'Nephrology', 'Gastroenterology', 'Oncology',
  'Rheumatology', 'Urology', 'General Surgery', 'Radiology', 'Anesthesiology', 'Emergency Medicine'];

function inp(err) {
  return {
    width: '100%', padding: '9px 12px', border: `1.5px solid ${err ? RED : BORDER}`,
    borderRadius: 9, fontSize: 13, outline: 'none', boxSizing: 'border-box',
    fontFamily: 'DM Sans, sans-serif', color: NAVY, background: 'white',
  };
}

function DoctorProfileModal({ onClose, tokenFn, onSignOut }) {
  const [view, setView] = useState('profile'); // profile | edit | password | public
  const [doctor, setDoctor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');
  const [toastType, setToastType] = useState('ok');
  const [appEmail, setAppEmail] = useState('');

  // Edit form
  const [form, setForm] = useState({
    firstName: '', lastName: '', specialty: '', qualification: '',
    hospital: '', bio: '', consultFee: '', phone: '',
  });

  // Password form
  const [pwForm, setPwForm] = useState({ current: '', next: '', confirm: '' });
  const [pwErr, setPwErr] = useState('');
  const [pwOk, setPwOk] = useState(false);

  const showToast = (msg, type = 'ok') => {
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
      } catch { }
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
          firstName: doc.firstName || '',
          lastName: doc.lastName || '',
          specialty: doc.specialty || '',
          qualification: doc.qualification || '',
          hospital: doc.hospital || '',
          bio: doc.bio || '',
          consultFee: doc.consultFee ? (doc.consultFee / 100).toString() : '',
          phone: doc.phone || '',
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
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim(),
          specialty: form.specialty.trim(),
          qualification: form.qualification.trim(),
          hospital: form.hospital.trim(),
          bio: form.bio.trim(),
          phone: form.phone.trim(),
          consultFee: form.consultFee ? Math.round(parseFloat(form.consultFee) * 100) : undefined,
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
        } catch { }
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
    if (pwForm.next.length < 8) { setPwErr('New password must be at least 8 characters.'); return; }
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
        setPwForm({ current: '', next: '', confirm: '' });
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
    navigator.clipboard.writeText(appEmail).then(() => showToast('📋 App email copied!')).catch(() => { });
  }

  const initials = doctor
    ? `${doctor.firstName?.[0] || ''}${doctor.lastName?.[0] || ''}`.toUpperCase()
    : '?';

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(12,26,46,0.6)', zIndex: 9999,
        display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-start', padding: 0
      }}>

      {/* Panel slides in from left, aligned with sidebar */}
      <div style={{
        width: 320, height: '100vh', background: 'white', boxShadow: '4px 0 32px rgba(0,0,0,0.2)',
        display: 'flex', flexDirection: 'column', overflowY: 'auto', fontFamily: 'DM Sans, sans-serif'
      }}>

        {/* ── Header ── */}
        <div style={{ background: NAVY, padding: '20px 20px 16px', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', fontFamily: 'monospace', letterSpacing: '0.1em' }}>DOCTOR PROFILE</div>
            <button onClick={onClose}
              style={{
                background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white', width: 28, height: 28,
                borderRadius: '50%', cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>×</button>
          </div>

          {/* Avatar + name */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{
              width: 56, height: 56, borderRadius: '50%', background: BLUE_P, color: BLUE,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 20, fontWeight: 700, flexShrink: 0, border: '3px solid rgba(255,255,255,0.2)'
            }}>
              {initials}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'white', marginBottom: 2 }}>
                {doctor ? `Dr. ${doctor.firstName} ${doctor.lastName}` : loading ? 'Loading…' : 'Doctor'}
              </div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>{doctor?.specialty || ''}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                <div style={{
                  width: 7, height: 7, borderRadius: '50%',
                  background: doctor?.isAvailable ? '#4ade80' : '#f87171'
                }} />
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>
                  {doctor?.isAvailable ? 'Available for appointments' : 'Not available'}
                </span>
              </div>
            </div>
          </div>

          {/* App email badge */}
          {appEmail && (
            <div onClick={copyAppEmail}
              style={{
                marginTop: 12, background: 'rgba(255,255,255,0.08)', borderRadius: 8,
                padding: '7px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8
              }}
              title="Click to copy your app login email">
              <span style={{ fontSize: 12 }}>🔑</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', fontFamily: 'monospace', letterSpacing: '0.08em' }}>APP LOGIN EMAIL</div>
                <div style={{
                  fontSize: 11.5, color: 'rgba(255,255,255,0.85)', fontFamily: 'monospace',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                }}>{appEmail}</div>
              </div>
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>📋</span>
            </div>
          )}
        </div>

        {/* ── Navigation tabs within modal ── */}
        {view === 'profile' && (
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {loading ? (
              <div style={{ padding: 40, textAlign: 'center', color: MUTED }}>Loading profile…</div>
            ) : (
              <>
                {/* Quick stats */}
                <div style={{ padding: '14px 20px', borderBottom: `1px solid ${BORDER}` }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    {[
                      { label: 'Hospital', value: doctor?.hospital || '—', icon: '🏥' },
                      { label: 'Qualification', value: doctor?.qualification || '—', icon: '🎓' },
                      { label: 'Consult Fee', value: doctor?.consultFee ? `₹${(doctor.consultFee / 100).toFixed(0)}` : '—', icon: '💳' },
                      { label: 'Phone', value: doctor?.phone || '—', icon: '📱' },
                    ].map(s => (
                      <div key={s.label} style={{ background: SURFACE, borderRadius: 9, padding: '10px 12px' }}>
                        <div style={{ fontSize: 11, color: MUTED, marginBottom: 3 }}>{s.icon} {s.label}</div>
                        <div style={{ fontSize: 12.5, fontWeight: 600, color: NAVY, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.value}</div>
                      </div>
                    ))}
                  </div>
                  {doctor?.bio && (
                    <div style={{ marginTop: 10, padding: '10px 12px', background: SURFACE, borderRadius: 9, fontSize: 12.5, color: SEC, lineHeight: 1.65 }}>
                      {doctor.bio}
                    </div>
                  )}
                </div>

                {/* Action buttons */}
                <div style={{ padding: '14px 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>

                  <button onClick={() => setView('edit')}
                    style={{
                      width: '100%', padding: '11px 16px', background: BLUE, color: 'white', border: 'none',
                      borderRadius: 10, fontSize: 13.5, fontWeight: 700, cursor: 'pointer', textAlign: 'left',
                      display: 'flex', alignItems: 'center', gap: 10
                    }}>
                    <span style={{ fontSize: 18 }}>✏️</span> Edit Profile
                  </button>

                  <button onClick={toggleAvailability} disabled={saving}
                    style={{
                      width: '100%', padding: '11px 16px', border: `1px solid ${doctor?.isAvailable ? GREEN : AMBER}`,
                      background: doctor?.isAvailable ? GREEN_P : AMBER_P,
                      color: doctor?.isAvailable ? GREEN : AMBER,
                      borderRadius: 10, fontSize: 13.5, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer',
                      textAlign: 'left', display: 'flex', alignItems: 'center', gap: 10
                    }}>
                    <span style={{ fontSize: 18 }}>{doctor?.isAvailable ? '🟢' : '🔴'}</span>
                    {saving ? 'Updating…' : doctor?.isAvailable ? 'Set as Unavailable' : 'Set as Available'}
                  </button>

                  <button onClick={() => setView('password')}
                    style={{
                      width: '100%', padding: '11px 16px', background: SURFACE, color: SEC, border: `1px solid ${BORDER}`,
                      borderRadius: 10, fontSize: 13.5, fontWeight: 600, cursor: 'pointer', textAlign: 'left',
                      display: 'flex', alignItems: 'center', gap: 10
                    }}>
                    <span style={{ fontSize: 18 }}>🔒</span> Change Password
                  </button>

                  {appEmail && (
                    <button onClick={copyAppEmail}
                      style={{
                        width: '100%', padding: '11px 16px', background: SURFACE, color: SEC, border: `1px solid ${BORDER}`,
                        borderRadius: 10, fontSize: 13.5, fontWeight: 600, cursor: 'pointer', textAlign: 'left',
                        display: 'flex', alignItems: 'center', gap: 10
                      }}>
                      <span style={{ fontSize: 18 }}>📋</span> Copy App Login Email
                    </button>
                  )}

                  <div style={{ height: 1, background: BORDER, margin: '4px 0' }} />

                  <button onClick={onSignOut}
                    style={{
                      width: '100%', padding: '11px 16px', background: RED_P, color: RED, border: `1px solid #f5c6cb`,
                      borderRadius: 10, fontSize: 13.5, fontWeight: 700, cursor: 'pointer', textAlign: 'left',
                      display: 'flex', alignItems: 'center', gap: 10
                    }}>
                    <span style={{ fontSize: 18 }}>🚪</span> Sign Out
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── Edit Profile ── */}
        {view === 'edit' && (
          <div style={{ flex: 1, overflowY: 'auto' }}>
            <div style={{ padding: '14px 20px', borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', gap: 10 }}>
              <button onClick={() => setView('profile')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: MUTED, fontSize: 18, padding: 0 }}>←</button>
              <div style={{ fontSize: 14, fontWeight: 700, color: NAVY }}>Edit Profile</div>
            </div>
            <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[
                { label: 'First Name *', field: 'firstName', type: 'text', placeholder: 'Raj' },
                { label: 'Last Name *', field: 'lastName', type: 'text', placeholder: 'Sharma' },
                { label: 'Phone', field: 'phone', type: 'tel', placeholder: '+91 98765 43210' },
                { label: 'Hospital / Clinic', field: 'hospital', type: 'text', placeholder: 'Apollo Hospital' },
                { label: 'Qualification', field: 'qualification', type: 'text', placeholder: 'MBBS, MD' },
                { label: 'Consultation Fee (₹)', field: 'consultFee', type: 'number', placeholder: '500' },
              ].map(({ label, field, type, placeholder }) => (
                <div key={field}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: SEC, display: 'block', marginBottom: 5 }}>{label}</label>
                  <input type={type} value={form[field]} placeholder={placeholder}
                    onChange={e => setForm(p => ({ ...p, [field]: e.target.value }))}
                    style={inp()} />
                </div>
              ))}

              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: SEC, display: 'block', marginBottom: 5 }}>Specialty</label>
                <select value={form.specialty} onChange={e => setForm(p => ({ ...p, specialty: e.target.value }))} style={{ ...inp(), background: 'white' }}>
                  <option value="">Select specialty…</option>
                  {SPECIALTIES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: SEC, display: 'block', marginBottom: 5 }}>Bio / About</label>
                <textarea value={form.bio} placeholder="Brief description visible to patients…"
                  onChange={e => setForm(p => ({ ...p, bio: e.target.value }))}
                  rows={3}
                  style={{ ...inp(), resize: 'vertical', minHeight: 72 }} />
              </div>

              <button onClick={saveProfile} disabled={saving}
                style={{
                  width: '100%', padding: 12, background: saving ? '#93c5fd' : BLUE, color: 'white', border: 'none',
                  borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer'
                }}>
                {saving ? '⏳ Saving…' : '💾 Save Changes'}
              </button>
            </div>
          </div>
        )}

        {/* ── Change Password ── */}
        {view === 'password' && (
          <div style={{ flex: 1, overflowY: 'auto' }}>
            <div style={{ padding: '14px 20px', borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', gap: 10 }}>
              <button onClick={() => { setView('profile'); setPwErr(''); setPwOk(false); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: MUTED, fontSize: 18, padding: 0 }}>←</button>
              <div style={{ fontSize: 14, fontWeight: 700, color: NAVY }}>Change Password</div>
            </div>
            <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
              {pwOk && (
                <div style={{ background: GREEN_P, border: '1px solid #a5d6a7', borderRadius: 10, padding: '12px 14px', fontSize: 13, color: GREEN }}>
                  ✅ Password changed successfully!
                </div>
              )}
              {pwErr && (
                <div style={{ background: RED_P, border: '1px solid #f5c6cb', borderRadius: 10, padding: '12px 14px', fontSize: 13, color: RED }}>
                  {pwErr}
                </div>
              )}
              {[
                { label: 'Current Password', field: 'current', placeholder: 'Your current password' },
                { label: 'New Password', field: 'next', placeholder: 'Minimum 8 characters' },
                { label: 'Confirm New', field: 'confirm', placeholder: 'Repeat new password' },
              ].map(({ label, field, placeholder }) => (
                <div key={field}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: SEC, display: 'block', marginBottom: 5 }}>{label}</label>
                  <input type="password" value={pwForm[field]} placeholder={placeholder}
                    onChange={e => { setPwForm(p => ({ ...p, [field]: e.target.value })); setPwErr(''); }}
                    style={inp()} />
                </div>
              ))}

              <div style={{ background: SURFACE, borderRadius: 9, padding: '10px 12px', fontSize: 12, color: MUTED, lineHeight: 1.6 }}>
                💡 After changing your password, you will need to sign in again on all devices.
              </div>

              <button onClick={changePassword} disabled={saving}
                style={{
                  width: '100%', padding: 12, background: saving ? '#93c5fd' : BLUE, color: 'white', border: 'none',
                  borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer'
                }}>
                {saving ? '⏳ Changing…' : '🔒 Change Password'}
              </button>
            </div>
          </div>
        )}

        {/* ── Toast ── */}
        {toast && (
          <div style={{
            position: 'sticky', bottom: 16, margin: '0 16px',
            background: toastType === 'err' ? RED : NAVY,
            color: 'white', padding: '10px 16px', borderRadius: 10, fontSize: 13,
            boxShadow: '0 4px 16px rgba(0,0,0,0.2)', textAlign: 'center'
          }}>
            {toast}
          </div>
        )}
      </div>
    </div>
  );
}

function Sidebar({ active }) {
  const router = useRouter();
  const [showProfile, setShowProfile] = useState(false);
  const [chatBadge, setChatBadge] = useState(0);
  const [alertBadge, setAlertBadge] = useState(0);

  useEffect(() => {
    const tok = localStorage.getItem('mc_token') || '';
    if (!tok) return;
    const h = { Authorization: `Bearer ${tok}` };
    // Unread chat count
    fetch(`${API}/chat/rooms?limit=100`, { headers: h })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        const total = (d?.data || []).reduce((sum, r) => sum + (r.unreadCount || 0), 0);
        setChatBadge(total);
      }).catch(() => { });
    // Alert count
    fetch(`${API}/cdss/alerts`, { headers: h })
      .then(r => r.ok ? r.json() : null)
      .then(d => setAlertBadge((d?.data || d?.alerts || []).length))
      .catch(() => { });
  }, []);

  const [doctorName, setDoctorName] = useState('');
  const [specialty, setSpecialty] = useState('');
  useEffect(() => {
    try {
      const u = JSON.parse(localStorage.getItem('mc_user') || '{}');
      if (u?.doctor) {
        setDoctorName(`Dr. ${u.doctor.firstName || ''} ${u.doctor.lastName || ''}`.trim());
        setSpecialty(u.doctor.specialty || 'Doctor');
      } else {
        setDoctorName(u?.email || 'Doctor');
        setSpecialty('Doctor Portal');
      }
    } catch { }
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
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'white' }}>MediConnect AI</div>
            <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', fontFamily: 'monospace', letterSpacing: '0.1em' }}>DOCTOR PORTAL</div>
          </div>
        </div>
      </div>

      {/* Fix 1: merged duplicate style props into one object */}
      <div
        onClick={() => setShowProfile(true)}
        title="View/Edit Profile"
        style={{
          cursor: 'pointer',
          margin: '10px 10px 6px',
          background: 'rgba(255,255,255,0.06)',
          borderRadius: 9,
          padding: '8px 10px',
          display: 'flex',
          alignItems: 'center',
          gap: 8
        }}
      >
        <div style={{ width: 30, height: 30, borderRadius: '50%', background: TEAL_P, color: TEAL, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
          {initials}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div suppressHydrationWarning style={{ fontSize: 12, fontWeight: 500, color: 'white', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {doctorName || 'Doctor'}
          </div>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>{specialty}</div>
        </div>
      </div>

      <div style={{ padding: '10px 18px 4px', fontSize: 9, color: 'rgba(255,255,255,0.25)', fontFamily: 'monospace', letterSpacing: '0.12em' }}>CLINICAL</div>

      <div style={{ padding: '0 8px', flex: 1 }}>
        {/* Fix 2: was DOCTOR_NAV — the array in this file is called NAV */}
        {NAV.map(item => {
          const isA = active === item.id;
          const badgeVal = item.badge === '_chat' ? chatBadge : item.badge === '_alerts' ? alertBadge : item.badge;
          return (
            <button key={item.id} onClick={() => router.push(item.href)}
              style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '9px 12px', margin: '2px 0', borderRadius: 8, cursor: 'pointer', border: 'none', textAlign: 'left', background: isA ? BLUE : 'transparent', color: isA ? 'white' : 'rgba(255,255,255,0.55)', fontSize: 13, fontFamily: 'DM Sans, sans-serif', fontWeight: isA ? 500 : 400, transition: 'background 0.12s' }}>
              <span style={{ fontSize: 14 }}>{item.icon}</span>
              <span style={{ flex: 1 }}>{item.label}</span>
              {item.badge != null && badgeVal !== 0 && (
                <span style={{ background: item.badge === 'PREMIUM' ? PURPLE : '#ef4444', color: item.badge === 'PREMIUM' ? '#e9d5ff' : 'white', fontSize: item.badge === 'PREMIUM' ? 8 : 10, fontWeight: 600, padding: item.badge === 'PREMIUM' ? '2px 5px' : '1px 5px', borderRadius: 99 }}>
                  {badgeVal}
                </span>
              )}
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

      {showProfile && (
        <DoctorProfileModal
          tokenFn={() => localStorage.getItem('mc_token') || ''}
          onClose={() => setShowProfile(false)}
          onSignOut={() => { localStorage.removeItem('mc_token'); localStorage.removeItem('mc_user'); router.push('/login'); }}
        />
      )}
    </div>
  );
}
function TabBtn({ id, label, active, onClick, count }) {
  return (
    <button onClick={() => onClick(id)}
      style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: active ? BLUE : 'transparent', color: active ? 'white' : MUTED, fontSize: 13, fontWeight: active ? 700 : 400, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
      {label}
      {count > 0 && <span style={{ background: active ? 'rgba(255,255,255,0.25)' : '#ef4444', color: 'white', fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 99 }}>{count}</span>}
    </button>
  );
}

// ── Update card ────────────────────────────────────────────────────────────────
function UpdateCard({ icon, title, subtitle, meta, bg, border, color, onClick, badge, badgeBg }) {
  return (
    <div onClick={onClick} style={{ background: bg || 'white', border: `1px solid ${border || BORDER}`, borderRadius: 12, padding: '13px 16px', cursor: onClick ? 'pointer' : 'default', transition: 'all 0.15s', display: 'flex', gap: 14, alignItems: 'flex-start', marginBottom: 10 }}>
      <div style={{ width: 40, height: 40, borderRadius: 10, background: border + '20' || SURFACE, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>{icon}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: color || NAVY, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</div>
          {badge && <span style={{ fontSize: 10, fontWeight: 700, background: badgeBg || RED_P, color: color || RED, padding: '2px 7px', borderRadius: 99, flexShrink: 0 }}>{badge}</span>}
        </div>
        {subtitle && <div style={{ fontSize: 13, color: SEC, lineHeight: 1.55, marginBottom: 4 }}>{subtitle}</div>}
        {meta && <div style={{ fontSize: 11.5, color: MUTED, fontFamily: 'monospace' }}>{meta}</div>}
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function DoctorUpdatesPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [tab, setTab] = useState('messages');
  const [loading, setLoading] = useState(true);
  const [unreadRooms, setUnreadRooms] = useState([]);    // rooms with unread messages
  const [urgentMsgs, setUrgentMsgs] = useState([]);      // red-flag / urgent messages
  const [cdssAlerts, setCdssAlerts] = useState([]);       // CDSS system alerts
  const [appts, setAppts] = useState([]);                 // upcoming appointments
  const [acking, setAcking] = useState(null);
  const [toast, setToast] = useState('');

  const token = useCallback(() => localStorage.getItem('mc_token') || '', []);
  const showToast = msg => { setToast(msg); setTimeout(() => setToast(''), 3500); };

  useEffect(() => {
    setMounted(true);
    const u = localStorage.getItem('mc_user');
    if (!u) { router.push('/login'); return; }
    if (JSON.parse(u).role !== 'DOCTOR') { router.push('/'); return; }
    fetchAll();
    const interval = setInterval(fetchAll, 30000); // poll every 30s
    return () => clearInterval(interval);
  }, []);

  async function fetchAll() {
    setLoading(true);
    const tok = token();
    const h = { Authorization: `Bearer ${tok}` };

    await Promise.allSettled([
      // Unread chat messages
      fetch(`${API}/chat/rooms?limit=100`, { headers: h }).then(r => r.ok ? r.json() : null).then(d => {
        const rooms = (d?.data || []).filter(r => (r.unreadCount || 0) > 0);
        setUnreadRooms(rooms);
      }),
      // Urgent/red-flag messages
      fetch(`${API}/appointments/critical-alerts`, { headers: h }).then(r => r.ok ? r.json() : null).then(d => {
        setUrgentMsgs(d?.data || []);
      }),
      // CDSS alerts
      fetch(`${API}/cdss/alerts`, { headers: h }).then(r => r.ok ? r.json() : null).then(d => {
        setCdssAlerts(d?.data || d?.alerts || []);
      }),
      // Appointments (upcoming)
      fetch(`${API}/appointments?limit=50`, { headers: h }).then(r => r.ok ? r.json() : null).then(d => {
        const all = d?.data || d?.appointments || [];
        const now = new Date();
        // Filter client-side: upcoming only, not cancelled/completed
        const upcoming = all.filter(a => new Date(a.scheduledAt) >= now && !['CANCELLED', 'COMPLETED'].includes(a.status));
        upcoming.sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt));
        setAppts(upcoming.slice(0, 10));
      }),
    ]);

    setLoading(false);
  }

  async function acknowledgeAlert(alertId) {
    setAcking(alertId);
    try {
      const r = await fetch(`${API}/cdss/alerts/acknowledge`, { method: 'POST', headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ alertId }) });
      const d = await r.json();
      if (d.success) { setCdssAlerts(p => p.filter(a => a.id !== alertId)); showToast('✅ Alert acknowledged'); }
      else showToast('❌ ' + d.message);
    } catch { showToast('❌ Network error'); }
    setAcking(null);
  }

  const totalUnread = unreadRooms.reduce((s, r) => s + (r.unreadCount || 0), 0);
  const totalAlerts = cdssAlerts.length + urgentMsgs.length;

  if (!mounted) return null;

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', fontFamily: 'DM Sans, sans-serif' }}>
      <Sidebar active="doctorUpdates" />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: SURFACE }}>

        {/* Header */}
        <div style={{ background: 'white', borderBottom: `1px solid ${BORDER}`, padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 19, fontWeight: 700, color: NAVY }}>🔔 Updates</div>
            <div style={{ fontSize: 13, color: MUTED, marginTop: 2 }}>Real-time notifications from your patient panel</div>
          </div>
          <button onClick={fetchAll} disabled={loading}
            style={{ padding: '8px 18px', background: loading ? SURFACE : 'white', border: `1px solid ${BORDER}`, borderRadius: 9, fontSize: 13, fontWeight: 600, color: SEC, cursor: loading ? 'not-allowed' : 'pointer' }}>
            {loading ? '⏳ Refreshing…' : '🔄 Refresh'}
          </button>
        </div>

        {/* Summary strip */}
        <div style={{ background: 'white', borderBottom: `1px solid ${BORDER}`, padding: '12px 24px', display: 'flex', gap: 20, flexShrink: 0 }}>
          {[
            { label: 'Unread Messages', value: totalUnread, color: BLUE, bg: BLUE_P, icon: '💬' },
            { label: 'Urgent Alerts', value: totalAlerts, color: RED, bg: RED_P, icon: '🚨' },
            { label: 'Upcoming Appts', value: appts.length, color: GREEN, bg: GREEN_P, icon: '📅' },
          ].map(s => (
            <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', background: s.bg, borderRadius: 10, border: `1px solid ${s.color}20` }}>
              <span style={{ fontSize: 20 }}>{s.icon}</span>
              <div>
                <div style={{ fontSize: 20, fontWeight: 800, color: s.color, lineHeight: 1 }}>{s.value}</div>
                <div style={{ fontSize: 11, color: s.color, opacity: 0.8 }}>{s.label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div style={{ background: 'white', borderBottom: `1px solid ${BORDER}`, padding: '8px 24px', display: 'flex', gap: 4, flexShrink: 0 }}>
          <TabBtn id="messages" label="Unread Chats" active={tab === 'messages'} onClick={setTab} count={totalUnread} />
          <TabBtn id="urgent" label="Urgent" active={tab === 'urgent'} onClick={setTab} count={urgentMsgs.length} />
          <TabBtn id="alerts" label="CDSS Alerts" active={tab === 'alerts'} onClick={setTab} count={cdssAlerts.length} />
          <TabBtn id="appointments" label="Appointments" active={tab === 'appointments'} onClick={setTab} count={appts.length} />
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
          {loading && <div style={{ textAlign: 'center', padding: 48, color: MUTED, fontSize: 14 }}>⏳ Loading updates…</div>}

          {/* ── Unread Chats ── */}
          {!loading && tab === 'messages' && (
            unreadRooms.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 56, background: 'white', borderRadius: 14, border: `1px solid ${BORDER}` }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>💬</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: NAVY, marginBottom: 6 }}>All caught up!</div>
                <div style={{ fontSize: 13, color: MUTED }}>No unread messages from your patients.</div>
              </div>
            ) : unreadRooms.map(room => {
              const p = room.patient || room.appointment?.patient;
              const doc = room.doctor || room.appointment?.doctor;
              const name = p ? `${p.firstName || ''} ${p.lastName || ''}`.trim() : 'Unknown Patient';
              const last = room.lastMessage;
              return (
                <UpdateCard key={room.id}
                  icon="💬"
                  title={name}
                  subtitle={last?.content || 'New message'}
                  meta={`${room.unreadCount} unread · ${fmtDate(last?.createdAt)}`}
                  bg={BLUE_P} border="#90caf9" color={BLUE}
                  badge={`${room.unreadCount} new`} badgeBg={BLUE_P}
                  onClick={() => router.push(`/doctor/chat?patientId=${p?.id || ''}`)}
                />
              );
            })
          )}

          {/* ── Urgent Messages ── */}
          {!loading && tab === 'urgent' && (
            urgentMsgs.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 56, background: 'white', borderRadius: 14, border: `1px solid ${BORDER}` }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: NAVY, marginBottom: 6 }}>No urgent alerts</div>
                <div style={{ fontSize: 13, color: MUTED }}>No red-flag or urgent messages from patients.</div>
              </div>
            ) : urgentMsgs.map(msg => {
              const name = msg.patient ? `${msg.patient.firstName || ''} ${msg.patient.lastName || ''}`.trim() : 'Patient';
              return (
                <UpdateCard key={msg.messageId}
                  icon="🚨"
                  title={`${name} — Urgent Message`}
                  subtitle={msg.content}
                  meta={`${fmtDate(msg.createdAt)}${msg.redFlags?.length ? ' · Red flags: ' + msg.redFlags.slice(0, 3).join(', ') : ''}`}
                  bg={RED_P} border="#f5c6cb" color={RED}
                  badge="URGENT" badgeBg={RED_P}
                  onClick={() => router.push(`/doctor/chat?patientId=${msg.patient?.id || ''}`)}
                />
              );
            })
          )}

          {/* ── CDSS Alerts ── */}
          {!loading && tab === 'alerts' && (
            cdssAlerts.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 56, background: 'white', borderRadius: 14, border: `1px solid ${BORDER}` }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>🧠</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: NAVY, marginBottom: 6 }}>No CDSS alerts</div>
                <div style={{ fontSize: 13, color: MUTED }}>Clinical decision support is monitoring your patients.</div>
              </div>
            ) : cdssAlerts.map(alert => {
              const sevColor = { CRITICAL: RED, HIGH: AMBER, MEDIUM: BLUE, LOW: GREEN }[alert.severity] || MUTED;
              const sevBg = { CRITICAL: RED_P, HIGH: AMBER_P, MEDIUM: BLUE_P, LOW: GREEN_P }[alert.severity] || SURFACE;
              return (
                <div key={alert.id} style={{ background: 'white', border: `1px solid ${BORDER}`, borderRadius: 12, padding: '14px 16px', marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                    <div style={{ width: 40, height: 40, borderRadius: 10, background: sevBg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>
                      {alert.severity === 'CRITICAL' ? '🚨' : alert.severity === 'HIGH' ? '⚠️' : '🔔'}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 700, color: NAVY, flex: 1 }}>{alert.patientName || 'Patient'}</div>
                        <span style={{ fontSize: 10, fontWeight: 700, background: sevBg, color: sevColor, padding: '2px 7px', borderRadius: 99 }}>{alert.severity}</span>
                      </div>
                      <div style={{ fontSize: 13, color: SEC, lineHeight: 1.6, marginBottom: 6 }}>{alert.message || alert.reason}</div>
                      {alert.parameter && <div style={{ fontSize: 12, color: MUTED, fontFamily: 'monospace' }}>Parameter: {alert.parameter} · {fmtDate(alert.triggeredAt)}</div>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 12, paddingTop: 10, borderTop: `1px solid ${BORDER}` }}>
                    <button onClick={() => router.push(alert.patientId ? `/doctor/reports?patientId=${alert.patientId}` : '/doctor/reports')}
                      style={{ flex: 1, padding: '7px', background: BLUE, color: 'white', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                      🔬 Review Report
                    </button>
                    <button onClick={() => acknowledgeAlert(alert.id)} disabled={acking === alert.id}
                      style={{ flex: 1, padding: '7px', background: SURFACE, color: SEC, border: `1px solid ${BORDER}`, borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: acking === alert.id ? 'not-allowed' : 'pointer' }}>
                      {acking === alert.id ? '⏳ Acknowledging…' : '✓ Acknowledge'}
                    </button>
                  </div>
                </div>
              );
            })
          )}

          {/* ── Appointments ── */}
          {!loading && tab === 'appointments' && (
            appts.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 56, background: 'white', borderRadius: 14, border: `1px solid ${BORDER}` }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>📅</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: NAVY, marginBottom: 6 }}>No upcoming appointments</div>
                <div style={{ fontSize: 13, color: MUTED }}>You have no confirmed or pending appointments.</div>
                <button onClick={() => router.push('/doctor/appointments')}
                  style={{ marginTop: 16, padding: '9px 22px', background: BLUE, color: 'white', border: 'none', borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                  View Appointments
                </button>
              </div>
            ) : appts.map(appt => {
              const p = appt.patient; const name = p ? `${p.firstName || ''} ${p.lastName || ''}`.trim() : 'Patient';
              const isToday = new Date(appt.scheduledAt).toDateString() === new Date().toDateString();
              const statusColor = { CONFIRMED: GREEN, PENDING: AMBER, CANCELLED: RED, COMPLETED: MUTED }[appt.status] || MUTED;
              const statusBg = { CONFIRMED: GREEN_P, PENDING: AMBER_P, CANCELLED: RED_P, COMPLETED: SURFACE }[appt.status] || SURFACE;
              return (
                <UpdateCard key={appt.id}
                  icon={isToday ? '📍' : '📅'}
                  title={name}
                  subtitle={appt.reason || appt.notes || 'Consultation'}
                  meta={`${fmtAppt(appt.scheduledAt)} · ${appt.type || 'In-person'}`}
                  bg={isToday ? GREEN_P : 'white'} border={isToday ? '#a5d6a7' : BORDER} color={isToday ? GREEN : NAVY}
                  badge={isToday ? 'TODAY' : appt.status} badgeBg={isToday ? GREEN_P : statusBg}
                  onClick={() => router.push('/doctor/appointments')}
                />
              );
            })
          )}
        </div>
      </div>

      {toast && <div style={{ position: 'fixed', bottom: 24, right: 24, background: NAVY, color: 'white', padding: '12px 20px', borderRadius: 12, fontSize: 13, zIndex: 9999, boxShadow: '0 4px 20px rgba(0,0,0,0.2)', maxWidth: 360 }}>{toast}</div>}
    </div>
  );
}


