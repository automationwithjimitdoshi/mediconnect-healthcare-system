'use client';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
/**
 * src/app/doctor/reports/page.js — FINAL
 *
 * NO server.js changes needed. Uses only already-registered routes:
 *
 * PATIENTS  → GET /api/chat/rooms
 *             Same endpoint the doctor chat page uses → shows all 4 patients
 *             Each patient comes with their _roomId stored
 *
 * FILES     → GET /api/chat/rooms/:roomId/files
 *             No appointment check — just checks room membership
 *             Returns ALL files uploaded to that chat room
 *
 * DOWNLOAD  → GET /api/files/:id/download  (fixed in files.js output)
 *
 * The appointment-only patient list issue is bypassed completely by
 * loading files per-room instead of per-patient.
 */

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import DoctorSidebar from '@/components/DoctorSidebar';
import { getToken, getUser, clearSession } from '@/lib/auth';
import { useDoctorAuth } from '@/lib/useDoctorAuth';

function getParam(name) {
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get(name);
}

const NAVY = '#0c1a2e', BLUE = '#1565c0', BLUE_P = '#e3f0ff', RED = '#c62828', RED_P = '#fdecea',
  AMBER = '#b45309', AMBER_P = '#fff3e0', GREEN = '#1b5e20', GREEN_P = '#e8f5e9',
  TEAL = '#00796b', TEAL_P = '#e0f5f0', PURPLE = '#6b21a8', PURPLE_P = '#f5f3ff',
  BORDER = '#e2e8f0', SURFACE = '#f7f9fc', MUTED = '#8896a7', SEC = '#4a5568';
const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';
const STATIC = 'http://localhost:5000';

const NAV = [
  { id: 'doctorDashboard', label: 'Dashboard', icon: '⊞', href: '/doctor' },
  { id: 'doctorPatients', label: 'All Patients', icon: '👥', href: '/doctor/patients' },
  { id: 'doctorAppts', label: 'Appointments', icon: '📅', href: '/doctor/appointments' },
  { id: 'doctorChat', label: 'Patient Chat', icon: '💬', href: '/doctor/chat', badge: 3 },
  { id: 'doctorUpdates', label: 'Updates', icon: '🔔', href: '/doctor/updates', badge: 2 },
  { id: 'doctorReports', label: 'Report Review', icon: '🔬', href: '/doctor/reports', badge: 'PREMIUM' },
];
const URG = {
  CRITICAL: { bg: RED_P, color: RED, dot: RED, label: 'Critical' },
  HIGH: { bg: AMBER_P, color: AMBER, dot: AMBER, label: 'High' },
  MEDIUM: { bg: BLUE_P, color: BLUE, dot: BLUE, label: 'Medium' },
  LOW: { bg: GREEN_P, color: GREEN, dot: GREEN, label: 'Low' },
};
const ACTS = [
  { id: 'ORDER_TEST', icon: '🧪', label: 'Order Test', color: BLUE },
  { id: 'BOOK_FOLLOWUP', icon: '📅', label: 'Follow-up', color: GREEN },
  { id: 'SEND_MESSAGE', icon: '💬', label: 'Message', color: TEAL },
  { id: 'WRITE_PRESCRIPTION', icon: '📋', label: 'Prescription', color: PURPLE },
  { id: 'REFER', icon: '🏥', label: 'Refer', color: AMBER },
  { id: 'NOTE', icon: '📝', label: 'Note', color: MUTED },
];

const getAge = dob => { if (!dob) return '—'; const d = new Date(dob), t = new Date(); let a = t.getFullYear() - d.getFullYear(); if (t.getMonth() < d.getMonth() || (t.getMonth() === d.getMonth() && t.getDate() < d.getDate())) a--; return a; };
const fmtDate = iso => { if (!iso) return '—'; return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }); };
const fmtSize = b => { if (!b) return ''; if (b < 1024) return `${b}B`; if (b < 1048576) return `${(b / 1024).toFixed(0)}KB`; return `${(b / 1048576).toFixed(1)}MB`; };
const initials = p => `${p?.firstName?.[0] || ''}${p?.lastName?.[0] || ''}`.toUpperCase() || 'PT';
const catIcon = cat => ({ PDF: '📄', IMAGE: '🖼️', DICOM: '🔬', DOCUMENT: '📝' }[cat] || '📎');

function normFile(f) {
  const M = { pdf: 'PDF', image: 'IMAGE', dicom: 'DICOM', document: 'DOCUMENT', general: 'DOCUMENT', lab_report: 'PDF', imaging: 'IMAGE' };
  const raw = f.category || 'DOCUMENT';
  const category = raw === raw.toUpperCase() ? raw : (M[raw.toLowerCase()] || 'DOCUMENT');
  const fileUrl = f.fileUrl || f.storageUrl || null;
  const isAnalyzed = !!(f.isAnalyzed || f.isProcessed);
  let ai = f.aiAnalysis; if (typeof ai === 'string') { try { ai = JSON.parse(ai); } catch { ai = null; } }
  return { ...f, category, fileUrl, isAnalyzed, aiAnalysis: ai };
}

// Download — static URL first (works if Express serves /uploads), then API fallback
async function doDownload(file, tokenFn) {
  const staticUrl = file.storageUrl || file.fileUrl;
  if (staticUrl) {
    try {
      const url = staticUrl.startsWith('http') ? staticUrl : `${STATIC}${staticUrl}`;
      const r = await fetch(url);
      if (r.ok) {
        const blob = await r.blob(); const burl = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = burl; a.download = file.fileName || 'file';
        document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(burl);
        return true;
      }
    } catch { }
  }
  if (file.id) {
    try {
      const r = await fetch(`${API}/files/${file.id}/download`, { headers: { Authorization: `Bearer ${tokenFn()}` } });
      if (r.ok) {
        const blob = await r.blob(); const burl = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = burl; a.download = file.fileName || 'file';
        document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(burl);
        return true;
      }
    } catch { }
  }
  return false;
}

// Drug rules (inlined, no external import)
const DRUG_RULES = [
  { drug: 'metformin', param: /creatinine|egfr/i, check: (v, u, s) => s === 'abnormal' || (typeof v === 'number' && v < 30), sev: 'CRITICAL', msg: 'Metformin contraindicated when eGFR<30.', act: 'Withhold. Check eGFR.' },
  { drug: /statin|atorvastatin|rosuvastatin|simvastatin/i, param: /alt|ast|liver/i, check: (_, __, s) => s === 'abnormal', sev: 'HIGH', msg: 'Elevated liver enzymes with statin.', act: 'Withhold. Repeat LFT.' },
  { drug: /warfarin|acenocoumarol/i, param: /inr/i, check: (v) => typeof v === 'number' && v > 3.5, sev: 'CRITICAL', msg: 'INR>3.5 on warfarin — bleeding risk.', act: 'Hold. Consider Vitamin K.' },
  { drug: /ramipril|lisinopril|losartan|telmisartan/i, param: /potassium/i, check: (v) => typeof v === 'number' && v > 5.5, sev: 'CRITICAL', msg: 'Hyperkalaemia with ACE/ARB.', act: 'Withhold. Dietary K restriction.' },
  { drug: 'digoxin', param: /potassium/i, check: (v) => typeof v === 'number' && v < 3.5, sev: 'CRITICAL', msg: 'Hypokalaemia with digoxin.', act: 'Correct K+ urgently.' },
  { drug: /insulin|glibenclamide|gliclazide/i, param: /glucose|hba1c/i, check: (v, u) => typeof v === 'number' && (v < 4 || (u?.includes('%') && v < 5)), sev: 'HIGH', msg: 'Low glucose with insulin.', act: 'Review insulin dose.' },
  { drug: /prednisolone|dexamethasone|prednisone/i, param: /glucose|hba1c/i, check: (_, __, s) => s === 'abnormal', sev: 'HIGH', msg: 'Hyperglycaemia with corticosteroid.', act: 'Monitor glucose.' },
];
function checkDrug(meds, analysis) {
  if (!meds?.length || !analysis) return [];
  const finds = [...(analysis.abnormalValues || []).map(f => ({ t: f, s: 'abnormal' })), ...(analysis.keyFindings || []).map(f => ({ t: f, s: 'normal' }))];
  const alerts = [];
  for (const rule of DRUG_RULES) {
    const med = meds.find(m => { const n = (m.name || '').toLowerCase(); return rule.drug instanceof RegExp ? rule.drug.test(n) : n.includes(rule.drug.toLowerCase()); });
    if (!med) continue;
    for (const f of finds) {
      if (!rule.param.test(f.t)) continue;
      const nv = f.t.match(/([\d.]+)/); const v = nv ? parseFloat(nv[1]) : null;
      const nu = f.t.match(/[\d.]+\s*([^\s(,—0-9]+)/); const u = nu ? nu[1] : '';
      if (rule.check(v, u, f.s) && !alerts.some(a => a.drug === med.name && a.msg === rule.msg))
        alerts.push({ sev: rule.sev, drug: med.name + (med.dosage ? ` ${med.dosage}` : ''), msg: rule.msg, act: rule.act });
    }
  }
  return alerts.sort((a, b) => ({ CRITICAL: 0, HIGH: 1 }[a.sev] ?? 2) - ({ CRITICAL: 0, HIGH: 1 }[b.sev] ?? 2));
}
function getChecklist(t = '') {
  t = t.toLowerCase();
  if (t.includes('cbc') || t.includes('blood count')) return [{ id: 'hb', label: 'Haemoglobin within range?', c: true }, { id: 'wbc', label: 'WBC differential reviewed?', c: true }, { id: 'plt', label: 'Platelet adequate?', c: true }, { id: 'notify', label: 'Patient notified?', c: true }];
  if (t.includes('lipid') || t.includes('cholesterol')) return [{ id: 'ldl', label: 'LDL below target?', c: true }, { id: 'statin', label: 'Statin therapy reviewed?', c: true }, { id: 'notify', label: 'Patient notified?', c: true }];
  if (t.includes('thyroid') || t.includes('tsh')) return [{ id: 'tsh', label: 'TSH within range?', c: true }, { id: 'meds', label: 'Medication adjusted?', c: true }, { id: 'notify', label: 'Patient notified?', c: true }];
  if (t.includes('glucose') || t.includes('hba1c')) return [{ id: 'hba1c', label: 'HbA1c within target (<7%)?', c: true }, { id: 'meds', label: 'Antidiabetic adjusted?', c: true }, { id: 'renal', label: 'Renal function checked?', c: true }, { id: 'notify', label: 'Patient notified?', c: true }];
  if (t.includes('liver') || t.includes('lft')) return [{ id: 'alt', label: 'ALT/AST reviewed?', c: true }, { id: 'drugs', label: 'Hepatotoxic meds reviewed?', c: true }, { id: 'notify', label: 'Patient notified?', c: true }];
  if (t.includes('renal') || t.includes('egfr')) return [{ id: 'stage', label: 'CKD stage from eGFR?', c: true }, { id: 'meds', label: 'Nephrotoxic meds adjusted?', c: true }, { id: 'notify', label: 'Patient notified?', c: true }];
  return [{ id: 'findings', label: 'All key findings reviewed?', c: true }, { id: 'abnormals', label: 'All abnormal values actioned?', c: true }, { id: 'notify', label: 'Patient notified?', c: true }];
}

// Sidebar

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

  useDoctorAuth();

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

function Sparkline({ points, color = BLUE, width = 160, height = 40 }) {
  if (!points || points.length < 2) return null;
  const vals = points.map(p => p.value), min = Math.min(...vals), max = Math.max(...vals), range = max - min || 1;
  const pad = 4, W = width - pad * 2, H = height - pad * 2;
  const coords = points.map((p, i) => `${(pad + i / (points.length - 1) * W).toFixed(1)},${(pad + (1 - (p.value - min) / range) * H).toFixed(1)}`);
  return (<div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><svg width={width} height={height}><polyline points={coords.join(' ')} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />{coords.map((c, i) => { const [x, y] = c.split(',').map(Number); return <circle key={i} cx={x} cy={y} r={i === coords.length - 1 ? 3.5 : 2} fill={color} />; })}</svg><div><div style={{ fontSize: 13, fontWeight: 700, color }}>{vals[vals.length - 1]} {points[0]?.unit}</div><div style={{ fontSize: 10, color: MUTED }}>{vals[0]}→{vals[vals.length - 1]}</div></div></div>);
}

// AI Modal
function AIModal({ fileId, fileName, medications, tokenFn, onClose }) {
  const [data, setData] = useState(null); const [loading, setLoading] = useState(true); const [error, setError] = useState(''); const [polling, setPolling] = useState(false);
  useEffect(() => { if (fileId) load(); }, [fileId]);
  async function load() { setLoading(true); setError(''); try { const r = await fetch(`${API}/files/${fileId}/analysis`, { headers: { Authorization: `Bearer ${tokenFn()}` } }); if (!r.ok) throw new Error(`HTTP ${r.status}`); const d = await r.json(); const res = d.data || d; setData(res); if (res.aiStatus === 'PROCESSING') { setPolling(true); setTimeout(load, 4000); } else setPolling(false); } catch (e) { setError(e.message); } setLoading(false); }
  const analysis = data?.analysis;
  const UC = { CRITICAL: { bg: RED_P, color: RED, label: '🚨 CRITICAL', border: '#f5c6cb' }, HIGH: { bg: AMBER_P, color: AMBER, label: '⚠ HIGH', border: '#fde68a' }, MEDIUM: { bg: BLUE_P, color: BLUE, label: '📋 MEDIUM', border: BORDER }, LOW: { bg: GREEN_P, color: GREEN, label: '✓ LOW', border: `${GREEN}40` } };
  const urg = UC[data?.urgencyLevel] || { bg: SURFACE, color: MUTED, label: '—', border: BORDER };
  const da = data && medications ? checkDrug(medications, analysis || data) : [];
  return (<div style={{ position: 'fixed', inset: 0, background: 'rgba(12,26,46,0.65)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div style={{ background: 'white', borderRadius: 16, width: '100%', maxWidth: 660, maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 12px 48px rgba(0,0,0,0.25)', overflow: 'hidden' }}>
      <div style={{ background: NAVY, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 10, fontFamily: 'monospace', color: 'rgba(255,255,255,0.4)', letterSpacing: '0.1em', marginBottom: 3 }}>🔒 AI ANALYSIS · DOCTOR ONLY</div><div style={{ fontSize: 14, fontWeight: 700, color: 'white', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fileName}</div></div>
        {data?.urgencyLevel && <span style={{ padding: '4px 12px', borderRadius: 99, fontSize: 12, fontWeight: 700, background: urg.bg, color: urg.color, border: `1px solid ${urg.border}`, flexShrink: 0 }}>{urg.label}</span>}
        <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white', width: 30, height: 30, borderRadius: '50%', cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>×</button>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
        {loading && <div style={{ textAlign: 'center', padding: 48, color: MUTED }}><div style={{ fontSize: 36, marginBottom: 12 }}>🧠</div><div style={{ fontSize: 14, fontWeight: 600 }}>{polling ? 'Analysing…' : 'Loading…'}</div></div>}
        {error && <div style={{ background: RED_P, border: '1px solid #f5c6cb', borderRadius: 10, padding: 16 }}><div style={{ fontWeight: 700, color: RED, fontSize: 13, marginBottom: 4 }}>Analysis unavailable</div><div style={{ fontSize: 12.5, color: SEC, marginBottom: 10 }}>{error}</div><button onClick={load} style={{ padding: '6px 14px', background: RED, color: 'white', border: 'none', borderRadius: 8, fontSize: 12, cursor: 'pointer' }}>Retry</button></div>}
        {!loading && data && (<>
          {data?.urgencyLevel === 'CRITICAL' && <div style={{ background: RED_P, border: '1px solid #f5c6cb', borderRadius: 12, padding: '14px 16px', marginBottom: 16 }}><div style={{ fontWeight: 700, color: RED, fontSize: 13, marginBottom: 8 }}>🚨 Critical — Immediate Action Required</div>{['Review in full history context immediately', 'Arrange same-day hospital review if cardiac/renal', 'Document findings and action plan'].map((s, i) => <div key={i} style={{ display: 'flex', gap: 8, padding: '4px 0', fontSize: 12.5, color: RED }}><span style={{ fontWeight: 700, flexShrink: 0 }}>{i + 1}.</span><span>{s}</span></div>)}</div>}
          {data.briefSummary && <div style={{ background: NAVY, borderRadius: 12, padding: '14px 16px', color: 'white', marginBottom: 16 }}><div style={{ fontSize: 10, fontFamily: 'monospace', opacity: 0.5, letterSpacing: '0.1em', marginBottom: 6 }}>CLINICAL BRIEF</div><div style={{ fontSize: 13.5, lineHeight: 1.7, opacity: 0.95 }}>{data.briefSummary}</div></div>}
          {da.length > 0 && <div style={{ background: AMBER_P, border: `1px solid #fde68a`, borderRadius: 12, padding: '14px 16px', marginBottom: 16 }}><div style={{ fontWeight: 700, color: AMBER, fontSize: 13, marginBottom: 10 }}>⚠️ Drug Alerts ({da.length})</div>{da.map((a, i) => <div key={i} style={{ padding: '10px 12px', background: 'white', borderRadius: 8, marginBottom: 8, border: `1px solid ${a.sev === 'CRITICAL' ? '#f5c6cb' : '#fde68a'}` }}><div style={{ display: 'flex', gap: 8, marginBottom: 4 }}><span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: a.sev === 'CRITICAL' ? RED_P : AMBER_P, color: a.sev === 'CRITICAL' ? RED : AMBER }}>{a.sev}</span><span style={{ fontSize: 12.5, fontWeight: 700, color: NAVY }}>{a.drug}</span></div><div style={{ fontSize: 12, color: SEC, marginBottom: 4 }}>{a.msg}</div><div style={{ fontSize: 12, color: GREEN, fontWeight: 500 }}>→ {a.act}</div></div>)}</div>}
          {analysis && <>
            <div style={{ fontSize: 12.5, color: MUTED, marginBottom: 12 }}>Type: <strong style={{ color: NAVY }}>{analysis.documentType || 'Medical document'}</strong></div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
              <div style={{ background: SURFACE, borderRadius: 10, padding: 14 }}><div style={{ fontSize: 12, fontWeight: 700, color: NAVY, marginBottom: 8 }}>📋 Key Findings</div>{analysis.keyFindings?.length > 0 ? analysis.keyFindings.map((f, i) => <div key={i} style={{ fontSize: 12.5, color: SEC, padding: '4px 0', borderBottom: `1px solid ${BORDER}`, lineHeight: 1.5 }}>• {f}</div>) : <div style={{ fontSize: 12, color: MUTED }}>None</div>}</div>
              <div style={{ background: analysis.abnormalValues?.length > 0 ? RED_P : SURFACE, border: `1px solid ${analysis.abnormalValues?.length > 0 ? '#f5c6cb' : BORDER}`, borderRadius: 10, padding: 14 }}><div style={{ fontSize: 12, fontWeight: 700, color: analysis.abnormalValues?.length > 0 ? RED : NAVY, marginBottom: 8 }}>{analysis.abnormalValues?.length > 0 ? '🚨 Abnormal' : '✓ All Normal'}</div>{analysis.abnormalValues?.length > 0 ? analysis.abnormalValues.map((v, i) => <div key={i} style={{ fontSize: 12.5, color: RED, padding: '4px 0', lineHeight: 1.5 }}>⚠ {v}</div>) : <div style={{ fontSize: 12, color: GREEN }}>None detected</div>}</div>
            </div>
            {analysis.clinicalSignificance && <div style={{ background: BLUE_P, border: `1px solid ${BLUE}30`, borderRadius: 10, padding: 14, marginBottom: 14 }}><div style={{ fontSize: 12, fontWeight: 700, color: BLUE, marginBottom: 6 }}>🩺 Clinical Significance</div><div style={{ fontSize: 13, color: '#1e3a5f', lineHeight: 1.7 }}>{analysis.clinicalSignificance}</div></div>}
            {analysis.recommendedActions?.length > 0 && <div style={{ background: GREEN_P, border: `1px solid ${GREEN}40`, borderRadius: 10, padding: 14 }}><div style={{ fontSize: 12, fontWeight: 700, color: GREEN, marginBottom: 8 }}>✅ Recommended Actions</div>{analysis.recommendedActions.map((a, i) => <div key={i} style={{ display: 'flex', gap: 8, padding: '4px 0', fontSize: 12.5, color: '#1b4332' }}><span style={{ fontWeight: 700, flexShrink: 0 }}>{i + 1}.</span><span style={{ lineHeight: 1.5 }}>{a}</span></div>)}</div>}
          </>}
          <div style={{ display: 'flex', gap: 7, marginTop: 16, padding: '8px 12px', background: PURPLE_P, border: `1px solid #e9d5ff`, borderRadius: 8 }}><span>🔒</span><span style={{ fontSize: 11, color: PURPLE }}>Visible to you only.</span></div>
        </>)}
      </div>
    </div>
  </div>);
}

// ─────────────────────────────────────────────────────────────────────────────
//  MAIN PAGE
// ─────────────────────────────────────────────────────────────────────────────
function DoctorReportReviewInner() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [patients, setPatients] = useState([]);  // each patient has ._roomId
  const [selPat, setSelPat] = useState(null);
  const [files, setFiles] = useState([]);
  const [summary, setSummary] = useState(null);
  const [brief, setBrief] = useState('');
  const [briefLoad, setBriefLoad] = useState(false);
  const [actions, setActions] = useState([]);
  const [loadPats, setLoadPats] = useState(true);
  const [loadFiles, setLoadFiles] = useState(false);
  const [patSearchQ, setPatSearchQ] = useState('');
  const [fileSearchQ, setFileSearchQ] = useState('');
  const [catFilter, setCatFilter] = useState('ALL');
  const [activeTab, setActiveTab] = useState('files');
  const [aiFile, setAiFile] = useState(null);
  const [toast, setToast] = useState('');
  const [checklists, setChecklists] = useState({});
  const [selF4CL, setSelF4CL] = useState(null);
  const [actForm, setActForm] = useState({ actionType: 'ORDER_TEST', description: '', dueDate: '' });
  const [savingAct, setSavingAct] = useState(false);
  const [downloading, setDownloading] = useState(null);
  const [showUpload, setShowUpload] = useState(false); // doctor's own upload panel
  const [uploading, setUploading] = useState(false);
  const [uploadRes, setUploadRes] = useState(null);  // analysis result from own upload
  const [uploadFile, setUploadFile] = useState(null);
  const [sharedFilter, setSharedFilter] = useState(false); // show only patients who shared reports

  const token = useCallback(() => getToken('DOCTOR') || '', []);
  const showToast = msg => { setToast(msg); setTimeout(() => setToast(''), 3500); };

  useEffect(() => {
    setMounted(true);
    const tok = getToken('DOCTOR');
    if (!tok) { window.location.href = '/login'; return; }
    const u = getUser('DOCTOR');
    if (u?.role && u.role !== 'DOCTOR') { window.location.href = '/'; return; }
    fetchPatients();
  }, []);

  useEffect(() => {
    const pid = getParam('patientId');
    if (pid && patients.length > 0) { const p = patients.find(x => x.id === pid); if (p) selectPatient(p); }
  }, [patients]);

  // ── FETCH PATIENTS via chat rooms ──────────────────────────────────────────
  // This is exactly what the doctor chat page does to show all patients.
  // Each room has room.appointment.patient with full details.
  // We store room.id on each patient so we can load files per-room later.
  async function fetchPatients() {
    setLoadPats(true);
    const tok = token();
    let list = [];

    // Source 1: chat rooms — gives patients + their roomId for file loading
    try {
      const r = await fetch(`${API}/chat/rooms?limit=200`, { headers: { Authorization: `Bearer ${tok}` } });
      if (r.ok) {
        const d = await r.json();
        const rooms = d.data || d.rooms || [];
        const seen = new Set();
        for (const room of rooms) {
          const p = room.patient || room.appointment?.patient;
          if (p?.id && !seen.has(p.id)) {
            seen.add(p.id);
            list.push({ ...p, conditions: (p.conditions || []), _roomId: room.id });
          }
        }
      }
    } catch (e) { console.warn('fetchPatients chat/rooms:', e.message); }

    // Source 2: /api/doctor-data/patients — returns ALL patients regardless of appointment
    if (list.length === 0) {
      try {
        const r = await fetch(`${API}/doctor-data/patients`, { headers: { Authorization: `Bearer ${tok}` } });
        if (r.ok) {
          const d = await r.json();
          const pts = d.data || [];
          const seen = new Set(list.map(p => p.id));
          for (const p of pts) {
            if (!seen.has(p.id)) {
              seen.add(p.id);
              list.push({ ...p, conditions: p.conditions || [] });
            }
          }
        }
      } catch (e) { console.warn('fetchPatients doctor-data:', e.message); }
    }

    // Source 3: /api/patients — standard endpoint
    if (list.length === 0) {
      try {
        const r = await fetch(`${API}/patients?limit=100`, { headers: { Authorization: `Bearer ${tok}` } });
        if (r.ok) { const d = await r.json(); list = d.data || d.patients || []; }
      } catch (e) { console.warn('fetchPatients /patients:', e.message); }
    }

    setPatients(list);
    setLoadPats(false);
  }

  // ── SELECT PATIENT ─────────────────────────────────────────────────────────
  // FILES come from /api/chat/rooms/:roomId/files — no appointment check!
  // This endpoint is already registered in chat.js and works for all room members.
  async function selectPatient(p) {
    setSelPat(p); setFiles([]); setSummary(null); setBrief(''); setActions([]);
    setLoadFiles(true); setActiveTab('files'); setCatFilter('ALL'); setSelF4CL(null); setFileSearchQ('');

    const tok = token();
    const allFiles = new Map(); // id → file, for deduplication

    // Source 1: chat room files (no appointment check needed)
    if (p._roomId) {
      try {
        const r = await fetch(`${API}/chat/rooms/${p._roomId}/files`, { headers: { Authorization: `Bearer ${tok}` } });
        if (r.ok) { const d = await r.json(); (d.data || []).map(normFile).forEach(f => allFiles.set(f.id, f)); }
      } catch (e) { console.warn('room files:', e.message); }
    }

    // Source 2: /api/doctor-data/patient/:id/files — no appointment check, most reliable
    try {
      const r = await fetch(`${API}/doctor-data/patient/${p.id}/files`, { headers: { Authorization: `Bearer ${tok}` } });
      if (r.ok) { const d = await r.json(); (d.data || []).map(normFile).forEach(f => allFiles.set(f.id, f)); }
    } catch { }

    // Source 3: /api/patients/:id/files — may require appointment relationship
    try {
      const r = await fetch(`${API}/patients/${p.id}/files`, { headers: { Authorization: `Bearer ${tok}` } });
      if (r.ok) { const d = await r.json(); (d.data || d.files || []).map(normFile).forEach(f => allFiles.set(f.id, f)); }
    } catch { }

    setFiles([...allFiles.values()]);

    // Load patient summary (try doctor-data first — no appointment check)
    try {
      const r = await fetch(`${API}/doctor-data/patient/${p.id}`, { headers: { Authorization: `Bearer ${tok}` } });
      if (r.ok) { const d = await r.json(); setSummary({ patient: d.data || d.patient || d }); }
      else throw new Error('doctor-data failed');
    } catch {
      try {
        const r = await fetch(`${API}/patients/${p.id}`, { headers: { Authorization: `Bearer ${tok}` } });
        if (r.ok) { const d = await r.json(); setSummary({ patient: d.data || d.patient || d }); }
      } catch { }
    }

    setLoadFiles(false);

    // AI Brief (non-blocking)
    setBriefLoad(true);
    try { const r = await fetch(`${API}/ai/summary/${p.id}`, { headers: { Authorization: `Bearer ${tok}` } }); if (r.ok) { const d = await r.json(); setBrief(d.summary || ''); } } catch { }
    setBriefLoad(false);

    // Actions (non-blocking, optional)
    try { const r = await fetch(`${API}/reports/doctor/patient/${p.id}/actions`, { headers: { Authorization: `Bearer ${tok}` } }); if (r?.ok) { const d = await r.json(); if (d.success) setActions(d.data || []); } } catch { }
  }

  async function handleDownload(file) {
    setDownloading(file.id); showToast('⏳ Downloading…');
    const ok = await doDownload(file, token);
    if (!ok) showToast('❌ Download failed. Ensure the backend is running and the uploads folder exists.');
    setDownloading(null);
  }

  async function saveChecklist(fileId) {
    const cl = checklists[fileId]; if (!cl || !selPat) return;
    try {
      const r = await fetch(`${API}/reports/doctor/patient/${selPat.id}/checklist`, { method: 'POST', headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ fileId, checklist: cl }) });
      const d = await r.json();
      if (d.success) { showToast('✅ Checklist saved'); setFiles(prev => prev.map(f => f.id === fileId ? { ...f, reviewChecklist: cl, reviewedAt: d.data?.reviewedAt } : f)); }
      else showToast('❌ ' + d.message);
    } catch { showToast('❌ Network error'); }
  }

  async function logAction() {
    if (!actForm.description.trim() || !selPat) return; setSavingAct(true);
    try {
      const r = await fetch(`${API}/reports/doctor/patient/${selPat.id}/actions`, { method: 'POST', headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ ...actForm, fileId: selF4CL?.id || null }) });
      const d = await r.json();
      if (d.success) { showToast('✅ Action logged'); setActions(prev => [d.data, ...prev]); setActForm({ actionType: 'ORDER_TEST', description: '', dueDate: '' }); }
      else showToast('❌ ' + d.message);
    } catch { showToast('❌ Network error'); }
    setSavingAct(false);
  }

  const filteredFiles = files.filter(f => (catFilter === 'ALL' || f.category === catFilter) && (!fileSearchQ || f.fileName?.toLowerCase().includes(fileSearchQ.toLowerCase())));
  const criticalFiles = files.filter(f => f.urgencyLevel === 'CRITICAL' || f.urgencyLevel === 'HIGH');
  const medications = summary?.patient?.medications || [];
  const allDA = files.reduce((acc, f) => { if (!f.aiAnalysis) return acc; return [...acc, ...checkDrug(medications, f.aiAnalysis)]; }, []).filter((a, i, arr) => arr.findIndex(x => x.drug === a.drug && x.msg === a.msg) === i);
  // Patients who have shared reports = those with patientAnalysis files
  const patFiltered = patients.filter(p => {
    const nameMatch = !patSearchQ || `${p.firstName} ${p.lastName}`.toLowerCase().includes(patSearchQ.toLowerCase());
    const sharedMatch = !sharedFilter || (p._sharedReportCount || 0) > 0 || (p.urgentFileCount || 0) > 0 || (p.totalAnalyzed || 0) > 0;
    return nameMatch && sharedMatch;
  });
  const analyzedFiles = files.filter(f => f.isAnalyzed);

  
  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', fontFamily: 'DM Sans, sans-serif' }}>
      {aiFile && <AIModal fileId={aiFile.id} fileName={aiFile.fileName} medications={medications} tokenFn={token} onClose={() => setAiFile(null)} />}
      <DoctorSidebar active="doctorReports" />

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', background: SURFACE }}>

        {/* Patient list */}
        <div style={{ width: 260, background: 'white', borderRight: `1px solid ${BORDER}`, display: 'flex', flexDirection: 'column', flexShrink: 0, overflow: 'hidden' }}>
          <div style={{ padding: '14px 16px', borderBottom: `1px solid ${BORDER}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: NAVY, flex: 1 }}>Report Review</div>
              <span style={{ background: PURPLE_P, color: PURPLE, fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 99, letterSpacing: '0.05em' }}>PREMIUM</span>
            </div>
            <input placeholder="Search patients…" value={patSearchQ} onChange={e => setPatSearchQ(e.target.value)}
              style={{ width: '100%', padding: '7px 10px', borderRadius: 8, border: `1px solid ${BORDER}`, fontSize: 12.5, outline: 'none', boxSizing: 'border-box', marginBottom: 8 }} />
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={() => { setSharedFilter(f => !f); }} title="Show only patients who shared reports"
                style={{ flex: 1, padding: '5px 8px', borderRadius: 7, border: `1px solid ${sharedFilter ? BLUE : BORDER}`, background: sharedFilter ? BLUE_P : 'white', color: sharedFilter ? BLUE : MUTED, fontSize: 11.5, fontWeight: 600, cursor: 'pointer' }}>
                📤 {sharedFilter ? 'All Patients' : 'Shared Only'}
              </button>
              <button onClick={() => { setShowUpload(true); setUploadRes(null); setUploadFile(null); }} title="Upload & analyze your own report"
                style={{ flex: 1, padding: '5px 8px', borderRadius: 7, border: `1px solid ${BORDER}`, background: 'white', color: NAVY, fontSize: 11.5, fontWeight: 600, cursor: 'pointer' }}>
                ⬆️ Upload Report
              </button>
            </div>
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {loadPats && <div style={{ padding: 20, textAlign: 'center', color: MUTED, fontSize: 13 }}>Loading patients…</div>}
            {!loadPats && patFiltered.length === 0 && (
              <div style={{ padding: 20, textAlign: 'center', color: MUTED, fontSize: 13 }}>
                {patSearchQ ? 'No patients match search' : 'No patients found. Confirm an appointment to link patients.'}
              </div>
            )}
            {patFiltered.map(p => {
              const isSel = selPat?.id === p.id;
              return (
                <div key={p.id} onClick={() => selectPatient(p)}
                  style={{ padding: '11px 14px', borderBottom: `1px solid ${BORDER}`, cursor: 'pointer', background: isSel ? BLUE_P : 'transparent', borderLeft: `3px solid ${isSel ? BLUE : 'transparent'}`, transition: 'all 0.15s' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 34, height: 34, borderRadius: '50%', background: BLUE_P, color: BLUE, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{initials(p)}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: isSel ? 700 : 600, color: NAVY, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.firstName} {p.lastName}</div>
                      {(p.urgentFileCount > 0 || p.totalAnalyzed > 0) && <span style={{ fontSize: 9, fontWeight: 700, background: GREEN_P, color: GREEN, padding: '1px 5px', borderRadius: 99, marginLeft: 5, flexShrink: 0 }}>Shared</span>}
                      <div style={{ fontSize: 11.5, color: MUTED }}>{getAge(p.dateOfBirth)} yrs · {p.bloodType || '—'}</div>
                    </div>
                  </div>
                  {(p.conditions || []).slice(0, 2).map(c => (
                    <span key={c.condition || c} style={{ display: 'inline-block', fontSize: 10.5, background: SURFACE, color: SEC, borderRadius: 4, padding: '1px 6px', border: `1px solid ${BORDER}`, marginTop: 5, marginLeft: 44, marginRight: 3 }}>{c.condition || c}</span>
                  ))}
                </div>
              );
            })}
          </div>
        </div>

        {/* Centre */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
          {!selPat ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 14, padding: 40 }}>
              <div style={{ fontSize: 56 }}>👈</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: SEC }}>Select a patient from the left panel</div>
              <div style={{ fontSize: 13, textAlign: 'center', lineHeight: 1.7, maxWidth: 320, color: MUTED }}>
                {loadPats ? 'Loading patient list…' : patients.length > 0 ? `${patients.length} patient${patients.length > 1 ? 's' : ''} available.` : 'No patients found.'}
              </div>
            </div>
          ) : (
            <>
              {/* Header */}
              <div style={{ padding: '14px 20px', borderBottom: `1px solid ${BORDER}`, background: 'white', display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0, flexWrap: 'wrap' }}>
                <div style={{ width: 42, height: 42, borderRadius: '50%', background: BLUE_P, color: BLUE, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, flexShrink: 0 }}>{initials(selPat)}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 15, color: NAVY }}>{selPat.firstName} {selPat.lastName}</div>
                  <div style={{ fontSize: 12.5, color: MUTED }}>{getAge(selPat.dateOfBirth)} yrs · {selPat.gender || '—'} · {selPat.bloodType || '—'} · {files.length} file{files.length !== 1 ? 's' : ''} ({analyzedFiles.length} analyzed)</div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {allDA.filter(a => a.sev === 'CRITICAL').length > 0 && <div style={{ background: RED_P, border: '1px solid #f5c6cb', borderRadius: 9, padding: '6px 12px', display: 'flex', gap: 6, alignItems: 'center' }}><span>⚠️</span><span style={{ fontSize: 12, fontWeight: 700, color: RED }}>{allDA.filter(a => a.sev === 'CRITICAL').length} drug alert{allDA.filter(a => a.sev === 'CRITICAL').length > 1 ? 's' : ''}</span></div>}
                  {criticalFiles.length > 0 && <div style={{ background: RED_P, border: '1px solid #f5c6cb', borderRadius: 9, padding: '6px 12px', display: 'flex', gap: 6, alignItems: 'center' }}><div style={{ width: 7, height: 7, borderRadius: '50%', background: RED }} /><span style={{ fontSize: 12, fontWeight: 700, color: RED }}>{criticalFiles.length} urgent</span></div>}
                  <button onClick={() => router.push('/doctor/chat')} style={{ padding: '7px 14px', background: BLUE, color: 'white', border: 'none', borderRadius: 9, fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>💬 Chat</button>
                </div>
              </div>

              {/* AI Brief */}
              {(brief || briefLoad) && <div style={{ padding: '12px 20px', background: NAVY, borderBottom: `1px solid ${BORDER}`, flexShrink: 0 }}><div style={{ fontSize: 9, fontFamily: 'monospace', color: 'rgba(255,255,255,0.4)', letterSpacing: '0.1em', marginBottom: 5 }}>🧠 AI PRE-REVIEW BRIEF</div><div style={{ fontSize: 13, color: briefLoad ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.92)', lineHeight: 1.65 }}>{briefLoad ? 'Generating clinical brief…' : brief}</div></div>}

              {/* Tabs */}
              <div style={{ display: 'flex', borderBottom: `1px solid ${BORDER}`, background: 'white', flexShrink: 0, overflowX: 'auto' }}>
                {[
                  { id: 'files', icon: '📁', label: 'Files', badge: criticalFiles.length },
                  { id: 'checklist', icon: '✅', label: 'Checklist', badge: 0 },
                  { id: 'actions', icon: '⚡', label: 'Actions', badge: actions.length },
                  ...(patients.length > 1 ? [{ id: 'compare', icon: '⚖️', label: 'Compare', badge: 0 }] : []),
                ].map(t => (
                  <button key={t.id} onClick={() => setActiveTab(t.id)}
                    style={{ padding: '11px 16px', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 13, fontWeight: activeTab === t.id ? 700 : 500, color: activeTab === t.id ? BLUE : MUTED, borderBottom: activeTab === t.id ? `2px solid ${BLUE}` : '2px solid transparent', marginBottom: -1, fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap', flexShrink: 0 }}>
                    <span>{t.icon}</span>{t.label}
                    {t.badge > 0 && <span style={{ background: RED, color: 'white', borderRadius: 9, padding: '1px 6px', fontSize: 10, fontWeight: 700 }}>{t.badge}</span>}
                  </button>
                ))}
              </div>

              <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>

                {/* FILES TAB */}
                {activeTab === 'files' && (<>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
                    {['ALL', 'PDF', 'IMAGE', 'DOCUMENT', 'DICOM'].map(cat => (
                      <button key={cat} onClick={() => setCatFilter(cat)} style={{ padding: '5px 12px', borderRadius: 8, border: `1px solid ${catFilter === cat ? BLUE : BORDER}`, background: catFilter === cat ? BLUE_P : 'white', color: catFilter === cat ? BLUE : SEC, fontSize: 12, fontWeight: catFilter === cat ? 700 : 400, cursor: 'pointer' }}>{cat}</button>
                    ))}
                    <input placeholder="Search files…" value={fileSearchQ} onChange={e => setFileSearchQ(e.target.value)} style={{ marginLeft: 'auto', padding: '5px 12px', borderRadius: 8, border: `1px solid ${BORDER}`, fontSize: 12.5, outline: 'none', width: 160 }} />
                  </div>
                  {loadFiles && <div style={{ textAlign: 'center', padding: 40, color: MUTED }}>Loading files…</div>}
                  {!loadFiles && filteredFiles.length === 0 && (
                    <div style={{ textAlign: 'center', padding: 48, background: 'white', borderRadius: 14, border: `1px solid ${BORDER}` }}>
                      <div style={{ fontSize: 36, marginBottom: 10 }}>📂</div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: SEC, marginBottom: 6 }}>No files found</div>
                      <div style={{ fontSize: 13, color: MUTED, marginBottom: 14 }}>{files.length === 0 ? 'This patient has no uploaded files yet.' : 'Try changing the filter.'}</div>
                      {files.length === 0 && <div style={{ background: BLUE_P, borderRadius: 10, padding: '12px 16px', fontSize: 12.5, color: BLUE, textAlign: 'left', maxWidth: 360, margin: '0 auto', lineHeight: 1.7 }}>Files appear here when the patient uploads via:<br />• Patient Chat (📎 button)<br />• Report Analyzer page<br />• Files section</div>}
                    </div>
                  )}
                  {filteredFiles.map(f => {
                    const urg = URG[f.urgencyLevel] || {};
                    const isCrit = f.urgencyLevel === 'CRITICAL' || f.urgencyLevel === 'HIGH';
                    return (
                      <div key={f.id} style={{ background: 'white', borderRadius: 12, border: `1px solid ${isCrit ? (f.urgencyLevel === 'CRITICAL' ? '#f5c6cb' : '#fde68a') : BORDER}`, padding: '14px 16px', display: 'flex', gap: 14, alignItems: 'flex-start', marginBottom: 10 }}>
                        <span style={{ fontSize: 24, flexShrink: 0, marginTop: 2 }}>{catIcon(f.category)}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          {/* ...file info content... */}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 7, flexShrink: 0 }}>
                          <button onClick={() => setAiFile({ id: f.id, fileName: f.fileName })} style={{ padding: '7px 14px', background: NAVY, color: 'white', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>🧠 AI Review</button>
                          <button onClick={() => { setSelF4CL(f); setActiveTab('checklist'); }} style={{ padding: '7px 14px', background: PURPLE_P, color: PURPLE, border: `1px solid ${PURPLE}30`, borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>✅ Checklist</button>
                          <button onClick={() => handleDownload(f)} disabled={downloading === f.id}
                            style={{ padding: '7px 14px', background: downloading === f.id ? SURFACE : BLUE_P, color: downloading === f.id ? MUTED : BLUE, border: `1px solid ${BORDER}`, borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: downloading === f.id ? 'default' : 'pointer', textAlign: 'center' }}>
                            {downloading === f.id ? '⏳…' : '↓ Download'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </>)}

                {/* CHECKLIST TAB */}
                {activeTab === 'checklist' && (<>
                  <div style={{ background: 'white', borderRadius: 12, border: `1px solid ${BORDER}`, padding: 16, marginBottom: 16 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: NAVY, marginBottom: 10 }}>Select a file to review</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 200, overflowY: 'auto' }}>
                      {analyzedFiles.length === 0 && <div style={{ fontSize: 13, color: MUTED }}>No analyzed files yet. Run AI Review first.</div>}
                      {analyzedFiles.map(f => (
                        <button key={f.id} onClick={() => setSelF4CL(f)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 9, border: `1px solid ${selF4CL?.id === f.id ? BLUE : BORDER}`, background: selF4CL?.id === f.id ? BLUE_P : 'white', cursor: 'pointer', textAlign: 'left' }}>
                          <span style={{ fontSize: 16 }}>{catIcon(f.category)}</span>
                          <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 13, fontWeight: 600, color: NAVY, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.fileName}</div><div style={{ fontSize: 11, color: MUTED }}>{fmtDate(f.createdAt)}{f.reviewedAt ? ' · ✓ Reviewed' : ''}</div></div>
                        </button>
                      ))}
                    </div>
                  </div>
                  {selF4CL && (() => {
                    const items = getChecklist(selF4CL.aiAnalysis?.documentType || '');
                    const current = checklists[selF4CL.id] || {}; const done = items.filter(i => current[i.id]).length;
                    return (<div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}><div><div style={{ fontWeight: 700, fontSize: 14, color: NAVY }}>Checklist</div><div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>{done}/{items.length} items</div></div><button onClick={() => saveChecklist(selF4CL.id)} style={{ padding: '8px 16px', background: BLUE, color: 'white', border: 'none', borderRadius: 9, fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>💾 Save</button></div>
                      <div style={{ background: '#f0f0f0', borderRadius: 4, height: 6, marginBottom: 16 }}><div style={{ height: '100%', background: done === items.length ? GREEN : BLUE, borderRadius: 4, width: `${(done / items.length) * 100}%` }} /></div>
                      {items.map(item => {
                        const checked = !!current[item.id]; return (
                          <div key={item.id} onClick={() => setChecklists(prev => ({ ...prev, [selF4CL.id]: { ...current, [item.id]: !checked } }))} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 14px', background: 'white', borderRadius: 10, border: `1px solid ${checked ? GREEN + '40' : item.c ? RED + '25' : BORDER}`, cursor: 'pointer', marginBottom: 8 }}>
                            <div style={{ width: 20, height: 20, borderRadius: 5, border: `2px solid ${checked ? GREEN : BORDER}`, background: checked ? GREEN : 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>{checked && <span style={{ color: 'white', fontSize: 12, fontWeight: 700 }}>✓</span>}</div>
                            <div style={{ flex: 1 }}><div style={{ fontSize: 13, color: checked ? MUTED : NAVY, textDecoration: checked ? 'line-through' : 'none', lineHeight: 1.5 }}>{item.label}</div>{item.c && !checked && <div style={{ fontSize: 11, color: RED, marginTop: 2, fontWeight: 600 }}>⚠ Required</div>}</div>
                          </div>
                        );
                      })}
                      {done === items.length && <div style={{ background: GREEN_P, border: `1px solid ${GREEN}40`, borderRadius: 12, padding: '12px 16px', marginTop: 8, display: 'flex', gap: 10, alignItems: 'center' }}><span style={{ fontSize: 20 }}>🎉</span><div style={{ fontWeight: 700, color: GREEN, fontSize: 13 }}>Review complete — save to record timestamp.</div></div>}
                    </div>);
                  })()}
                </>)}

                {/* ACTIONS TAB */}
                {activeTab === 'actions' && (<>
                  <div style={{ background: 'white', borderRadius: 14, border: `1px solid ${BORDER}`, padding: 18, marginBottom: 16 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: NAVY, marginBottom: 14 }}>⚡ Log Clinical Action</div>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
                      {ACTS.map(at => <button key={at.id} onClick={() => setActForm(p => ({ ...p, actionType: at.id }))} style={{ padding: '6px 12px', borderRadius: 8, border: `1px solid ${actForm.actionType === at.id ? at.color : BORDER}`, background: actForm.actionType === at.id ? `${at.color}15` : 'white', color: actForm.actionType === at.id ? at.color : MUTED, fontSize: 12, fontWeight: actForm.actionType === at.id ? 700 : 400, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}><span>{at.icon}</span>{at.label}</button>)}
                    </div>
                    <textarea value={actForm.description} onChange={e => setActForm(p => ({ ...p, description: e.target.value }))} placeholder="Describe the action…" rows={3} style={{ width: '100%', padding: '9px 12px', border: `1px solid ${BORDER}`, borderRadius: 9, fontSize: 13, outline: 'none', boxSizing: 'border-box', resize: 'vertical', fontFamily: 'DM Sans, sans-serif', marginBottom: 10 }} />
                    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
                      <div><div style={{ fontSize: 11.5, color: MUTED, marginBottom: 4 }}>Due date (optional)</div><input type="date" value={actForm.dueDate} onChange={e => setActForm(p => ({ ...p, dueDate: e.target.value }))} style={{ padding: '7px 10px', border: `1px solid ${BORDER}`, borderRadius: 8, fontSize: 12.5, outline: 'none' }} /></div>
                      <button onClick={logAction} disabled={!actForm.description.trim() || savingAct} style={{ padding: '9px 20px', background: BLUE, color: 'white', border: 'none', borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: (!actForm.description.trim() || savingAct) ? 0.5 : 1 }}>{savingAct ? 'Saving…' : '+ Log Action'}</button>
                    </div>
                  </div>
                  {actions.length === 0 ? <div style={{ textAlign: 'center', padding: 32, color: MUTED, background: 'white', borderRadius: 14, border: `1px solid ${BORDER}` }}><div style={{ fontSize: 28, marginBottom: 8 }}>📋</div>No actions logged yet.</div> : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {actions.map((a, i) => {
                        const at = ACTS.find(x => x.id === a.actionType) || { icon: '📝', label: a.actionType || 'Note', color: MUTED }; return (
                          <div key={a.id || i} style={{ background: 'white', borderRadius: 10, border: `1px solid ${BORDER}`, padding: '12px 14px', display: 'flex', gap: 12 }}>
                            <span style={{ fontSize: 20, flexShrink: 0, marginTop: 2 }}>{at.icon}</span>
                            <div style={{ flex: 1 }}><div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}><span style={{ fontSize: 12.5, fontWeight: 700, color: at.color }}>{at.label}</span><span style={{ fontSize: 11, color: MUTED }}>{fmtDate(a.createdAt)}</span></div><div style={{ fontSize: 13, color: SEC, lineHeight: 1.5 }}>{a.description}</div></div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>)}

                {/* COMPARE TAB */}
                {activeTab === 'compare' && patients.length > 1 && (<>
                  <div style={{ background: 'white', borderRadius: 12, border: `1px solid ${BORDER}`, padding: 16, marginBottom: 16 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      <div><div style={{ fontSize: 11, fontWeight: 700, color: MUTED, textTransform: 'uppercase', marginBottom: 5 }}>Patient A</div><div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', background: BLUE_P, borderRadius: 8 }}><div style={{ width: 28, height: 28, borderRadius: '50%', background: BLUE_P, color: BLUE, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700 }}>{initials(selPat)}</div><span style={{ fontSize: 13, fontWeight: 600, color: NAVY }}>{selPat.firstName} {selPat.lastName}</span></div></div>
                      <div><div style={{ fontSize: 11, fontWeight: 700, color: MUTED, textTransform: 'uppercase', marginBottom: 5 }}>Patient B</div><select onChange={async e => { const cmp = patients.find(p => p.id === e.target.value); if (!cmp) return; }} style={{ width: '100%', padding: '9px 11px', borderRadius: 8, border: `1px solid ${BORDER}`, fontSize: 13, outline: 'none' }}><option value="">Select…</option>{patients.filter(p => p.id !== selPat.id).map(p => <option key={p.id} value={p.id}>{p.firstName} {p.lastName}</option>)}</select></div>
                    </div>
                  </div>
                  <div style={{ textAlign: 'center', padding: 32, color: MUTED, background: 'white', borderRadius: 14, border: `1px solid ${BORDER}` }}>Select Patient B above to compare urgency levels side by side.</div>
                </>)}
              </div>
            </>
          )}
        </div>

        {/* Quick History */}
        {selPat && summary && (
          <div style={{ width: 220, background: 'white', borderLeft: `1px solid ${BORDER}`, display: 'flex', flexDirection: 'column', overflow: 'hidden', flexShrink: 0 }}>
            <div style={{ padding: '13px 14px', borderBottom: `1px solid ${BORDER}`, fontWeight: 700, fontSize: 13, color: NAVY }}>Quick History</div>
            {allDA.length > 0 && <div style={{ padding: '10px 14px', borderBottom: `1px solid ${BORDER}`, background: RED_P }}><div style={{ fontSize: 11.5, fontWeight: 700, color: RED, marginBottom: 5 }}>⚠️ Drug Alerts ({allDA.length})</div>{allDA.slice(0, 3).map((a, i) => <div key={i} style={{ fontSize: 11, color: RED, marginBottom: 3 }}>{a.sev}: {a.drug.split(' ')[0]}</div>)}</div>}
            <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px' }}>
              {[{ title: 'Conditions', items: summary.patient?.conditions?.map(c => c.condition) || [], color: AMBER }, { title: 'Allergies', items: summary.patient?.allergies?.map(a => a.allergen) || [], color: RED }, { title: 'Medications', items: summary.patient?.medications?.map(m => `${m.name}${m.dose ? ` ${m.dose}` : ''}`) || [], color: BLUE }].map(s => (
                <div key={s.title} style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 10.5, fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>{s.title}</div>
                  {s.items.length > 0 ? s.items.map(item => <div key={item} style={{ background: s.color + '15', borderRadius: 5, padding: '4px 8px', marginBottom: 4, fontSize: 12, color: s.color, fontWeight: 500 }}>{item}</div>) : <div style={{ fontSize: 12, color: MUTED }}>None documented</div>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Doctor upload & analyze modal ── */}
      {showUpload && (
        <div onClick={e => { if (e.target === e.currentTarget && !uploading) { setShowUpload(false); setUploadRes(null); setUploadFile(null); } }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(12,26,46,0.55)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: 'white', borderRadius: 16, width: '100%', maxWidth: 520, maxHeight: '85vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 12px 40px rgba(0,0,0,0.2)' }}>
            <div style={{ background: NAVY, padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 15, color: 'white' }}>⬆️ Upload & Analyze Report</div>
              <button onClick={() => { setShowUpload(false); setUploadRes(null); setUploadFile(null); }} disabled={uploading}
                style={{ background: 'rgba(255,255,255,0.12)', border: 'none', color: 'white', width: 28, height: 28, borderRadius: '50%', cursor: 'pointer', fontSize: 16 }}>×</button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
              {!uploadRes ? (
                <>
                  <div style={{ fontSize: 13, color: SEC, marginBottom: 16, lineHeight: 1.6 }}>
                    Upload any lab report PDF or image for an instant AI analysis — for your reference or before a patient consultation.
                  </div>
                  <label style={{ display: 'block', border: `2px dashed ${uploadFile ? BLUE : BORDER}`, borderRadius: 12, padding: '28px 20px', textAlign: 'center', cursor: uploading ? 'not-allowed' : 'pointer', background: uploadFile ? BLUE_P : SURFACE, transition: 'all 0.18s', marginBottom: 14 }}>
                    <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" style={{ display: 'none' }}
                      onChange={e => { if (e.target.files[0]) setUploadFile(e.target.files[0]); }} disabled={uploading} />
                    <div style={{ fontSize: 32, marginBottom: 8 }}>{uploadFile ? '📄' : '📁'}</div>
                    <div style={{ fontWeight: 700, fontSize: 14, color: NAVY, marginBottom: 4 }}>{uploadFile ? uploadFile.name : 'Click to choose a PDF or image'}</div>
                    <div style={{ fontSize: 12, color: MUTED }}>{uploadFile ? `${(uploadFile.size / 1048576).toFixed(1)} MB · Click to change` : 'PDF, JPG, PNG · Max 20 MB'}</div>
                  </label>
                  <button onClick={async () => {
                    if (!uploadFile) { showToast('Select a file first.'); return; }
                    setUploading(true);
                    try {
                      const fd = new FormData(); fd.append('file', uploadFile); fd.append('lang', 'en');
                      const r = await fetch(`${API}/reports/patient/analyze`, { method: 'POST', headers: { Authorization: `Bearer ${token()}` }, body: fd });
                      const d = await r.json();
                      if (r.ok && d.success) setUploadRes(d.analysis);
                      else showToast(d.message || 'Analysis failed.');
                    } catch { showToast('Network error.'); }
                    setUploading(false);
                  }} disabled={!uploadFile || uploading}
                    style={{ width: '100%', padding: 11, background: uploadFile && !uploading ? BLUE : '#93c5fd', color: 'white', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: uploadFile && !uploading ? 'pointer' : 'not-allowed' }}>
                    {uploading ? '⏳ Analyzing…' : '🔬 Analyze Report'}
                  </button>
                </>
              ) : (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, padding: '12px 16px', background: GREEN_P, borderRadius: 10, border: '1px solid #a5d6a7' }}>
                    <span style={{ fontSize: 24 }}>✅</span>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14, color: GREEN }}>{uploadRes.reportType || 'Analysis complete'}</div>
                      {typeof uploadRes.healthScore === 'number' && <div style={{ fontSize: 12.5, color: GREEN }}>Health Score: {uploadRes.healthScore}/100 — {uploadRes.scoreLabel}</div>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
                    {[
                      { label: 'Parameters', value: uploadRes.parameters?.length || 0, color: BLUE },
                      { label: 'Abnormal', value: (uploadRes.parameters || []).filter(p => p.status !== 'normal').length, color: RED },
                      { label: 'Normal', value: (uploadRes.parameters || []).filter(p => p.status === 'normal').length, color: GREEN },
                    ].map(s => (
                      <div key={s.label} style={{ flex: 1, padding: '10px', background: SURFACE, borderRadius: 9, textAlign: 'center', border: `1px solid ${BORDER}` }}>
                        <div style={{ fontSize: 20, fontWeight: 800, color: s.color }}>{s.value}</div>
                        <div style={{ fontSize: 11, color: MUTED }}>{s.label}</div>
                      </div>
                    ))}
                  </div>
                  {(uploadRes.findings || []).filter(f => f.severity !== 'ok').slice(0, 6).map((f, i) => (
                    <div key={i} style={{
                      display: 'flex', gap: 10, padding: '9px 12px', marginBottom: 6, borderRadius: 9,
                      background: f.severity === 'critical' ? RED_P : f.severity === 'warning' ? AMBER_P : GREEN_P,
                      border: `1px solid ${f.severity === 'critical' ? '#f5c6cb' : f.severity === 'warning' ? '#fde68a' : '#a5d6a7'}`
                    }}>
                      <span style={{ fontSize: 16, flexShrink: 0 }}>{f.icon}</span>
                      <div>
                        <div style={{ fontSize: 12.5, fontWeight: 700, color: f.severity === 'critical' ? RED : f.severity === 'warning' ? AMBER : GREEN }}>{f.title}</div>
                        <div style={{ fontSize: 12, color: SEC, marginTop: 2, lineHeight: 1.5 }}>{f.detail}</div>
                      </div>
                    </div>
                  ))}
                  {(uploadRes.parameters || []).filter(p => p.status !== 'normal').length > 0 && (
                    <div style={{ marginTop: 14, border: `1px solid ${BORDER}`, borderRadius: 9, overflow: 'hidden' }}>
                      <div style={{ padding: '8px 12px', background: SURFACE, fontSize: 11.5, fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: `1px solid ${BORDER}` }}>Abnormal Parameters</div>
                      {uploadRes.parameters.filter(p => p.status !== 'normal').map((p, i, arr) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 12px', borderBottom: i < arr.length - 1 ? `1px solid ${BORDER}` : 'none', background: p.status === 'high' ? RED_P : AMBER_P }}>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: NAVY }}>{p.name}</div>
                            <div style={{ fontSize: 11, color: MUTED }}>Normal: {p.referenceRange} {p.unit}</div>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: p.status === 'high' ? RED : AMBER }}>{p.value} {p.unit}</div>
                            <div style={{ fontSize: 10, fontWeight: 700, color: p.status === 'high' ? RED : AMBER }}>{p.status === 'high' ? '▲ HIGH' : '▼ LOW'}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                    <button onClick={() => { setUploadRes(null); setUploadFile(null); }}
                      style={{ flex: 1, padding: '9px', background: SURFACE, color: SEC, border: `1px solid ${BORDER}`, borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>← Analyze Another</button>
                    <button onClick={() => { setShowUpload(false); setUploadRes(null); setUploadFile(null); }}
                      style={{ flex: 1, padding: '9px', background: BLUE, color: 'white', border: 'none', borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Done</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {toast && <div style={{ position: 'fixed', bottom: 24, right: 24, background: NAVY, color: 'white', padding: '12px 20px', borderRadius: 12, fontSize: 13, zIndex: 9999, boxShadow: '0 4px 20px rgba(0,0,0,0.2)', maxWidth: 360 }}>{toast}</div>}
    </div>
  );
}

export default function DoctorReportReview() {
  return <DoctorReportReviewInner/>;
}