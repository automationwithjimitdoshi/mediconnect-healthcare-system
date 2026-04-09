'use client';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import PatientSidebar from '@/components/PatientSidebar';
import { getToken, getUser, clearSession } from '@/lib/auth';

const C = {
  navy:      '#0c1a2e',
  blue:      '#1565c0',
  bluePale:  '#e3f0ff',
  surface:   '#f7f9fc',
  border:    '#e2e8f0',
  textMuted: '#8896a7',
  red:       '#c62828',
  redPale:   '#fdecea',
  green:     '#1b5e20',
  greenPale: '#e8f5e9',
  amber:     '#b45309',
};

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

export default function PatientProfilePage() {
  const router  = useRouter();
  const [mounted, setMounted] = useState(false);
  const [patient,  setPatient]  = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [toast,    setToast]    = useState('');
  const [tab,      setTab]      = useState('info'); // 'info' | 'password' | 'health'

  // Form state — personal info
  const [form, setForm] = useState({
    firstName: '', lastName: '', phone: '', gender: 'Male',
    dateOfBirth: '', bloodType: '', address: '',
    emergencyName: '', emergencyPhone: '',
  });

  // Form state — password
  const [pass, setPass] = useState({ current: '', next: '', confirm: '' });

  const token    = () => getToken('PATIENT') || '';
  const showToast = (msg, ms = 3500) => { setToast(msg); setTimeout(() => setToast(''), ms); };

  // ── Load profile ────────────────────────────────────────────────────────────
  useEffect(() => {
    setMounted(true);
    if (!token()) { router.push('/login'); return; }

    fetch(`${API}/auth/me`, { headers: { Authorization: `Bearer ${token()}` } })
      .then(r => r.json())
      .then(d => {
        // Try d.data.patient, d.patient, or d.data
        // auth.js returns { user: { id, role, patient: {...} } }
      const u = d.user || d.data || d;
      const p = u?.patient || u;
      if (p?.firstName) {
          setPatient(p);
          setForm({
            firstName:     p.firstName    || '',
            lastName:      p.lastName     || '',
            phone:         p.phone        || '',
            gender:        p.gender       || 'Male',
            dateOfBirth:   p.dateOfBirth  ? p.dateOfBirth.split('T')[0] : '',
            bloodType:     p.bloodType    || '',
            address:       p.address      || '',
            emergencyName: p.emergencyName  || '',
            emergencyPhone:p.emergencyPhone || '',
          });
        }
      })
      .catch(err => console.error('Profile load error:', err))
      .finally(() => setLoading(false));
  }, []);

  // ── Save personal info ──────────────────────────────────────────────────────
  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const res  = await fetch(`${API}/auth/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (res.ok) {
        showToast('✅ Profile updated successfully');
        const updated = data.data?.patient || data.patient || data.data;
        if (updated?.firstName) setPatient(updated);
      } else {
        showToast('❌ ' + (data.error || data.message || 'Update failed'));
      }
    } catch { showToast('❌ Network error — please try again'); }
    setSaving(false);
  }

  // ── Change password ─────────────────────────────────────────────────────────
  async function handlePasswordChange(e) {
    e.preventDefault();
    if (!pass.current)  return showToast('⚠ Enter your current password');
    if (pass.next.length < 8) return showToast('⚠ New password must be at least 8 characters');
    if (pass.next !== pass.confirm) return showToast('⚠ New passwords do not match');
    setSaving(true);
    try {
      const res  = await fetch(`${API}/auth/password`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ currentPassword: pass.current, newPassword: pass.next }),
      });
      const data = await res.json();
      if (res.ok) {
        showToast('✅ Password changed successfully');
        setPass({ current: '', next: '', confirm: '' });
      } else {
        showToast('❌ ' + (data.error || data.message || 'Password change failed'));
      }
    } catch { showToast('❌ Network error'); }
    setSaving(false);
  }

  const f = (k) => (e) => setForm(prev => ({ ...prev, [k]: e.target.value }));
  const inputStyle = { width: '100%', padding: '9px 12px', border: `1px solid ${C.border}`, borderRadius: 9, fontSize: 13, outline: 'none', boxSizing: 'border-box', background: 'white' };
  const labelStyle = { display: 'block', fontSize: 12, fontWeight: 500, color: C.textMuted, marginBottom: 5 };

  const initials = (patient?.firstName?.[0] || '?') + (patient?.lastName?.[0] || '');

  if(!mounted) return <div style={{minHeight:'100vh',background:'#f7f9fc'}}/>;

  return (
    <AppLayout role="patient">
      <div style={{ flex: 1, overflowY: 'auto', padding: 24, background: C.surface }}>

        {/* Header */}
        <div style={{ fontSize: 20, fontWeight: 600, color: C.navy, marginBottom: 4 }}>My Profile</div>
        <div style={{ fontSize: 13, color: C.textMuted, marginBottom: 22 }}>Manage your personal and health information</div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 48, color: C.textMuted }}>Loading profile…</div>
        ) : (
          <div style={{ display: 'flex', gap: 20, maxWidth: 860, alignItems: 'flex-start' }}>

            {/* Left — Avatar + nav tabs */}
            <div style={{ width: 200, flexShrink: 0 }}>
              <div style={{ ...card, padding: 20, textAlign: 'center', marginBottom: 12 }}>
                {/* Avatar */}
                <div style={{ width: 72, height: 72, borderRadius: '50%', background: C.bluePale, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, fontWeight: 700, color: C.blue, margin: '0 auto 12px' }}>
                  {initials}
                </div>
                <div style={{ fontSize: 14, fontWeight: 600, color: C.navy }}>
                  {patient?.firstName} {patient?.lastName}
                </div>
                <div style={{ fontSize: 11, color: C.textMuted, marginTop: 3 }}>Patient</div>
                {patient?.bloodType && (
                  <div style={{ marginTop: 8, display: 'inline-block', background: '#fee2e2', color: '#b91c1c', padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600 }}>
                    {patient.bloodType}
                  </div>
                )}
              </div>

              {/* Tab nav */}
              {[
                { id: 'info',     label: '👤 Personal Info' },
                { id: 'health',   label: '🏥 Health Info' },
                { id: 'password', label: '🔒 Password' },
              ].map(t => (
                <button key={t.id} onClick={() => setTab(t.id)}
                  style={{ display: 'block', width: '100%', padding: '10px 14px', marginBottom: 6, borderRadius: 10, border: 'none', textAlign: 'left', fontSize: 13, fontWeight: tab === t.id ? 600 : 400, cursor: 'pointer', background: tab === t.id ? C.bluePale : 'white', color: tab === t.id ? C.blue : C.navy }}>
                  {t.label}
                </button>
              ))}
            </div>

            {/* Right — Form content */}
            <div style={{ flex: 1 }}>

              {/* ── Personal Info ── */}
              {tab === 'info' && (
                <form onSubmit={handleSave}>
                  <div style={{ ...card, padding: 24 }}>
                    <div style={{ fontSize: 15, fontWeight: 600, color: C.navy, marginBottom: 18 }}>Personal Information</div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
                      <div>
                        <label style={labelStyle}>First Name</label>
                        <input value={form.firstName} onChange={f('firstName')} style={inputStyle} placeholder="First name" />
                      </div>
                      <div>
                        <label style={labelStyle}>Last Name</label>
                        <input value={form.lastName} onChange={f('lastName')} style={inputStyle} placeholder="Last name" />
                      </div>
                    </div>

                    <div style={{ marginBottom: 14 }}>
                      <label style={labelStyle}>Phone Number</label>
                      <input value={form.phone} onChange={f('phone')} style={inputStyle} placeholder="+91 98765 43210" type="tel" />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
                      <div>
                        <label style={labelStyle}>Gender</label>
                        <select value={form.gender} onChange={f('gender')} style={inputStyle}>
                          <option>Male</option><option>Female</option><option>Other</option>
                        </select>
                      </div>
                      <div>
                        <label style={labelStyle}>Date of Birth</label>
                        <input type="date" value={form.dateOfBirth} onChange={f('dateOfBirth')} style={inputStyle} />
                      </div>
                    </div>

                    <div style={{ marginBottom: 14 }}>
                      <label style={labelStyle}>Address</label>
                      <input value={form.address} onChange={f('address')} style={inputStyle} placeholder="Your address" />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 20 }}>
                      <div>
                        <label style={labelStyle}>Emergency Contact Name</label>
                        <input value={form.emergencyName} onChange={f('emergencyName')} style={inputStyle} placeholder="Contact name" />
                      </div>
                      <div>
                        <label style={labelStyle}>Emergency Contact Phone</label>
                        <input value={form.emergencyPhone} onChange={f('emergencyPhone')} style={inputStyle} placeholder="Contact phone" type="tel" />
                      </div>
                    </div>

                    <button type="submit" disabled={saving} style={{ ...btn.primary, opacity: saving ? 0.7 : 1 }}>
                      {saving ? 'Saving…' : '💾 Save Changes'}
                    </button>
                  </div>
                </form>
              )}

              {/* ── Health Info ── */}
              {tab === 'health' && (
                <form onSubmit={handleSave}>
                  <div style={{ ...card, padding: 24 }}>
                    <div style={{ fontSize: 15, fontWeight: 600, color: C.navy, marginBottom: 18 }}>Health Information</div>

                    <div style={{ marginBottom: 14 }}>
                      <label style={labelStyle}>Blood Type</label>
                      <select value={form.bloodType} onChange={f('bloodType')} style={{ ...inputStyle, width: 160 }}>
                        <option value="">Unknown</option>
                        {['A+','A-','B+','B-','AB+','AB-','O+','O-'].map(bg => <option key={bg}>{bg}</option>)}
                      </select>
                    </div>

                    {/* Health conditions — read only from DB, shown for reference */}
                    {patient?.conditions?.length > 0 && (
                      <div style={{ marginBottom: 14 }}>
                        <label style={labelStyle}>Chronic Conditions</label>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          {patient.conditions.map((c, i) => (
                            <span key={i} style={{ background: '#fee2e2', color: '#b91c1c', padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 500 }}>
                              {c.condition}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {patient?.allergies?.length > 0 && (
                      <div style={{ marginBottom: 14 }}>
                        <label style={labelStyle}>Allergies</label>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          {patient.allergies.map((a, i) => (
                            <span key={i} style={{ background: '#fef3c7', color: '#92400e', padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 500 }}>
                              {a.allergen}{a.severity ? ` (${a.severity})` : ''}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {patient?.medications?.length > 0 && (
                      <div style={{ marginBottom: 14 }}>
                        <label style={labelStyle}>Active Medications</label>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {patient.medications.map((m, i) => (
                            <div key={i} style={{ background: '#f0f9ff', borderRadius: 8, padding: '8px 12px', fontSize: 12 }}>
                              <span style={{ fontWeight: 600, color: C.navy }}>{m.name}</span>
                              <span style={{ color: C.textMuted, marginLeft: 8 }}>{m.dose} · {m.frequency}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <button type="submit" disabled={saving} style={{ ...btn.primary, opacity: saving ? 0.7 : 1 }}>
                      {saving ? 'Saving…' : '💾 Save Changes'}
                    </button>
                  </div>
                </form>
              )}

              {/* ── Change Password ── */}
              {tab === 'password' && (
                <form onSubmit={handlePasswordChange}>
                  <div style={{ ...card, padding: 24 }}>
                    <div style={{ fontSize: 15, fontWeight: 600, color: C.navy, marginBottom: 6 }}>Change Password</div>
                    <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 20 }}>Use a strong password with at least 8 characters</div>

                    <div style={{ marginBottom: 14 }}>
                      <label style={labelStyle}>Current Password</label>
                      <input type="password" value={pass.current} onChange={e => setPass(p => ({ ...p, current: e.target.value }))}
                        style={inputStyle} placeholder="Enter current password" />
                    </div>
                    <div style={{ marginBottom: 14 }}>
                      <label style={labelStyle}>New Password</label>
                      <input type="password" value={pass.next} onChange={e => setPass(p => ({ ...p, next: e.target.value }))}
                        style={inputStyle} placeholder="At least 8 characters" />
                    </div>
                    <div style={{ marginBottom: 20 }}>
                      <label style={labelStyle}>Confirm New Password</label>
                      <input type="password" value={pass.confirm} onChange={e => setPass(p => ({ ...p, confirm: e.target.value }))}
                        style={inputStyle} placeholder="Repeat new password" />
                      {pass.confirm && pass.next !== pass.confirm && (
                        <div style={{ fontSize: 11, color: '#ef4444', marginTop: 4 }}>⚠ Passwords do not match</div>
                      )}
                    </div>

                    <button type="submit" disabled={saving || !pass.current || !pass.next || pass.next !== pass.confirm}
                      style={{ ...btn.primary, opacity: (saving || !pass.current || !pass.next || pass.next !== pass.confirm) ? 0.5 : 1 }}>
                      {saving ? 'Updating…' : '🔒 Update Password'}
                    </button>
                  </div>
                </form>
              )}

            </div>
          </div>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, background: C.navy, color: 'white', padding: '12px 20px', borderRadius: 12, fontSize: 13, zIndex: 9999, boxShadow: '0 4px 20px rgba(0,0,0,0.2)', maxWidth: 360 }}>
          {toast}
        </div>
      )}
    </AppLayout>
  );
}

