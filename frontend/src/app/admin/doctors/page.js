'use client';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
/**
 * src/app/admin/doctors/page.js — Admin Doctor Management
 *
 * Access: http://localhost:3000/admin/doctors
 * Admin key: value of ADMIN_SECRET in backend/.env (default: mediconnect-admin-2024)
 *
 * Features:
 *  - Tabs: Pending Review | All Doctors
 *  - PENDING doctors: show MRN, SMC, qualification → Approve / Reject buttons
 *  - All doctors: search, deactivate/activate, delete
 */
import { useState, useEffect } from 'react';

const API    = 'process.env.NEXT_PUBLIC_API_URL ? process.env.NEXT_PUBLIC_API_URL : (process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api")';
const NAVY   = '#0c1a2e', BLUE = '#1565c0', BLUE_P = '#e3f0ff';
const RED    = '#c62828', RED_P = '#fdecea';
const GREEN  = '#1b5e20', GREEN_P = '#e8f5e9';
const AMBER  = '#b45309', AMBER_P = '#fff3e0';
const PURPLE = '#7c3aed', PURPLE_P = '#f5f3ff';
const BORDER = '#e2e8f0', SURFACE = '#f7f9fc', MUTED = '#8896a7', SEC = '#4a5568';

export default function AdminDoctorsPage() {
  const [adminKey,  setAdminKey]  = useState('mediconnect-admin-2024');
  const [tab,       setTab]       = useState('pending'); // 'pending' | 'all'
  const [doctors,   setDoctors]   = useState([]);
  const [pending,   setPending]   = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState('');
  const [search,    setSearch]    = useState('');
  const [toast,     setToast]     = useState('');
  const [rejectModal, setRejectModal] = useState(null); // doctor being rejected
  const [rejectReason, setRejectReason] = useState('');
  const [confirm,   setConfirm]   = useState(null);
  const [actionBusy, setActionBusy] = useState('');

  const showToast = (msg, ms=3500) => { setToast(msg); setTimeout(() => setToast(''), ms); };

  const headers = () => ({
    'x-admin-secret': adminKey,
    'Content-Type':   'application/json',
  });

  async function loadAll() {
    setLoading(true); setError('');
    try {
      const [allRes, pendRes] = await Promise.all([
        fetch(`${API}/auth/admin/all-doctors`,     { headers: headers() }),
        fetch(`${API}/auth/admin/pending-doctors`, { headers: headers() }),
      ]);
      if (allRes.status === 403) {
        setError('❌ Wrong admin key. Check ADMIN_SECRET in backend/.env');
        setLoading(false); return;
      }
      const allData  = allRes.ok  ? await allRes.json()  : { data: [] };
      const pendData = pendRes.ok ? await pendRes.json() : { data: [] };
      setDoctors(allData.data  || []);
      setPending(pendData.data || []);
    } catch (e) {
      setError('❌ Network error — is the backend running on port 5000?');
    }
    setLoading(false);
  }

  async function approveDoctor(doctorId, name) {
    setActionBusy(doctorId);
    try {
      const r = await fetch(`${API}/auth/admin/approve-doctor`, {
        method: 'POST', headers: headers(),
        body: JSON.stringify({ doctorId }),
      });
      const d = await r.json();
      if (r.ok && d.success) {
        showToast('✅ Dr. ' + name + ' approved — account is now active');
        await loadAll();
      } else {
        showToast('❌ ' + (d.error || d.message || 'Failed to approve'));
      }
    } catch { showToast('❌ Network error'); }
    setActionBusy('');
  }

  async function rejectDoctor() {
    if (!rejectModal) return;
    setActionBusy(rejectModal.doctorId);
    try {
      const r = await fetch(`${API}/auth/admin/reject-doctor`, {
        method: 'POST', headers: headers(),
        body: JSON.stringify({ doctorId: rejectModal.doctorId, reason: rejectReason.trim() || 'Credentials could not be verified' }),
      });
      const d = await r.json();
      if (r.ok && d.success) {
        showToast('⛔ ' + rejectModal.name + ' rejected');
        setRejectModal(null); setRejectReason('');
        await loadAll();
      } else {
        showToast('❌ ' + (d.error || 'Failed to reject'));
      }
    } catch { showToast('❌ Network error'); }
    setActionBusy('');
  }

  async function deleteDoctor(doctor) {
    setActionBusy(doctor.doctorId); setConfirm(null);
    try {
      const r = await fetch(`${API}/doctor-data/delete-account`, {
        method: 'DELETE',
        headers: { 'x-admin-key': adminKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ doctorId: doctor.doctorId }),
      });
      const d = await r.json();
      if (r.ok && d.success) {
        showToast('🗑 ' + doctor.name + ' permanently deleted');
        await loadAll();
      } else {
        showToast('❌ ' + (d.message || 'Failed to delete'));
      }
    } catch { showToast('❌ Network error'); }
    setActionBusy('');
  }

  const filteredDoctors = doctors.filter(d =>
    !search ||
    d.name.toLowerCase().includes(search.toLowerCase()) ||
    (d.email || '').toLowerCase().includes(search.toLowerCase()) ||
    (d.specialty || '').toLowerCase().includes(search.toLowerCase()) ||
    (d.mrn || '').toLowerCase().includes(search.toLowerCase())
  );

  const statusBadge = (status, isActive) => {
    if (!isActive && status !== 'APPROVED') {
      if (status === 'PENDING_REVIEW') return { label:'⏳ PENDING REVIEW',  bg:AMBER_P,  color:AMBER  };
      if (status === 'REJECTED')        return { label:'⛔ REJECTED',        bg:RED_P,    color:RED    };
      return                                   { label:'🔒 DEACTIVATED',     bg:RED_P,    color:RED    };
    }
    if (!isActive) return { label:'🔒 DEACTIVATED', bg:RED_P, color:RED };
    return null;
  };

  return (
    <div style={{ minHeight:'100vh', background:SURFACE, fontFamily:'DM Sans, sans-serif' }}>

      {/* ── Header ── */}
      <div style={{ background:NAVY, padding:'16px 32px', display:'flex', alignItems:'center', gap:16 }}>
        <div style={{ fontSize:18, fontWeight:700, color:'white' }}>⚙️ MediConnect Admin — Doctor Management</div>
        <div style={{ marginLeft:'auto', display:'flex', gap:12, alignItems:'center' }}>
          <a href="/admin/patients" style={{ fontSize:12, color:'rgba(255,255,255,0.5)', textDecoration:'none', padding:'4px 12px', border:'1px solid rgba(255,255,255,0.15)', borderRadius:6 }}>
            👥 Patients
          </a>
        </div>
      </div>

      <div style={{ maxWidth:900, margin:'0 auto', padding:'28px 20px' }}>

        {/* ── Admin key + Load ── */}
        <div style={{ background:'white', border:`1px solid ${BORDER}`, borderRadius:14, padding:'18px 20px', marginBottom:22, display:'flex', gap:12, alignItems:'center' }}>
          <span style={{ fontSize:13, fontWeight:600, color:SEC, flexShrink:0 }}>🔑 Admin Key:</span>
          <input
            type="password" value={adminKey}
            onChange={e => setAdminKey(e.target.value)}
            placeholder="ADMIN_SECRET from backend/.env"
            style={{ flex:1, padding:'8px 12px', border:`1px solid ${BORDER}`, borderRadius:8, fontSize:13, fontFamily:'DM Sans, sans-serif', outline:'none' }}
          />
          <button onClick={loadAll} disabled={loading || !adminKey.trim()}
            style={{ padding:'9px 22px', background:BLUE, color:'white', border:'none', borderRadius:9, fontSize:13, fontWeight:700, cursor:'pointer', flexShrink:0 }}>
            {loading ? '⏳ Loading…' : '🔄 Load Doctors'}
          </button>
        </div>

        {error && (
          <div style={{ background:RED_P, border:`1px solid ${RED}30`, borderRadius:10, padding:'12px 16px', marginBottom:18, fontSize:13, color:RED }}>
            {error}
          </div>
        )}

        {/* ── Stats ── */}
        {doctors.length > 0 && (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:14, marginBottom:22 }}>
            {[
              { label:'Total Doctors',    value:doctors.length,                                   color:NAVY   },
              { label:'Active',           value:doctors.filter(d=>d.isActive).length,              color:GREEN  },
              { label:'Pending Review',   value:pending.length,                                    color:AMBER  },
              { label:'Deactivated',      value:doctors.filter(d=>!d.isActive).length,             color:RED    },
            ].map(s => (
              <div key={s.label} style={{ background:'white', border:`1px solid ${BORDER}`, borderRadius:12, padding:'16px 18px' }}>
                <div style={{ fontSize:26, fontWeight:800, color:s.color }}>{s.value}</div>
                <div style={{ fontSize:12, color:MUTED, marginTop:3 }}>{s.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* ── Tabs ── */}
        {doctors.length > 0 && (
          <div style={{ display:'flex', gap:0, marginBottom:18, background:'white', borderRadius:10, border:`1px solid ${BORDER}`, overflow:'hidden' }}>
            {[
              { key:'pending', label:`⏳ Pending Review (${pending.length})` },
              { key:'all',     label:`👨‍⚕️ All Doctors (${doctors.length})`    },
            ].map(t => (
              <button key={t.key} onClick={() => setTab(t.key)}
                style={{ flex:1, padding:'11px', border:'none', cursor:'pointer', fontSize:13.5, fontWeight:600,
                  background: tab===t.key ? BLUE : 'white',
                  color:      tab===t.key ? 'white' : SEC,
                  borderRight: t.key==='pending' ? `1px solid ${BORDER}` : 'none' }}>
                {t.label}
              </button>
            ))}
          </div>
        )}

        {/* ── PENDING TAB ── */}
        {tab === 'pending' && doctors.length > 0 && (
          <div>
            {pending.length === 0 ? (
              <div style={{ background:'white', border:`1px solid ${BORDER}`, borderRadius:14, padding:'48px 24px', textAlign:'center' }}>
                <div style={{ fontSize:40, marginBottom:12 }}>✅</div>
                <div style={{ fontSize:16, fontWeight:700, color:NAVY }}>No doctors pending review</div>
                <div style={{ fontSize:13, color:MUTED, marginTop:6 }}>All registered doctors have been reviewed.</div>
              </div>
            ) : (
              pending.map(doc => (
                <div key={doc.doctorId} style={{ background:'white', border:`2px solid ${AMBER}40`, borderRadius:14, padding:'20px 22px', marginBottom:14, boxShadow:'0 2px 8px rgba(0,0,0,0.06)' }}>
                  {/* Doctor header */}
                  <div style={{ display:'flex', alignItems:'flex-start', gap:14, marginBottom:16 }}>
                    <div style={{ width:46, height:46, borderRadius:12, background:AMBER_P, color:AMBER, display:'flex', alignItems:'center', justifyContent:'center', fontSize:16, fontWeight:700, flexShrink:0 }}>
                      {(doc.name||'?').split(' ').filter(Boolean).slice(1,3).map(w=>w[0]).join('')}
                    </div>
                    <div style={{ flex:1 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
                        <span style={{ fontSize:15, fontWeight:700, color:NAVY }}>{doc.name}</span>
                        <span style={{ fontSize:10, fontWeight:700, background:AMBER_P, color:AMBER, padding:'2px 8px', borderRadius:99 }}>⏳ PENDING REVIEW</span>
                      </div>
                      <div style={{ fontSize:12.5, color:SEC }}>{doc.specialty} · {doc.hospital}</div>
                      <div style={{ fontSize:12, color:MUTED, marginTop:2 }}>📧 {doc.email} · 📱 {doc.phone}</div>
                      <div style={{ fontSize:11, color:MUTED, marginTop:1 }}>Registered: {new Date(doc.registeredAt).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' })}</div>
                    </div>
                  </div>

                  {/* Credentials box */}
                  <div style={{ background:PURPLE_P, border:`1px solid #c4b5fd`, borderRadius:10, padding:'14px 16px', marginBottom:16 }}>
                    <div style={{ fontSize:11, fontWeight:700, color:PURPLE, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:10 }}>🏥 Medical Credentials to Verify</div>
                    <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10 }}>
                      <div>
                        <div style={{ fontSize:10, color:PURPLE, fontWeight:600, textTransform:'uppercase', marginBottom:3 }}>MRN</div>
                        <div style={{ fontSize:14, fontWeight:700, color:NAVY, fontFamily:'monospace' }}>{doc.mrn || '—'}</div>
                        <div style={{ fontSize:10, color:MUTED, marginTop:2 }}>Medical Reg. Number</div>
                      </div>
                      <div>
                        <div style={{ fontSize:10, color:PURPLE, fontWeight:600, textTransform:'uppercase', marginBottom:3 }}>State Medical Council</div>
                        <div style={{ fontSize:13, fontWeight:600, color:NAVY }}>{doc.smc || '—'}</div>
                      </div>
                      <div>
                        <div style={{ fontSize:10, color:PURPLE, fontWeight:600, textTransform:'uppercase', marginBottom:3 }}>Qualification</div>
                        <div style={{ fontSize:13, fontWeight:600, color:NAVY }}>{doc.qualification || '—'}</div>
                        {doc.regYear && <div style={{ fontSize:10, color:MUTED, marginTop:2 }}>Registered {doc.regYear}</div>}
                      </div>
                    </div>
                  </div>

                  {/* Verify instructions */}
                  <div style={{ background:'#f0f9ff', border:'1px solid #bae6fd', borderRadius:8, padding:'10px 14px', marginBottom:16, fontSize:12, color:'#0c4a6e', lineHeight:1.6 }}>
                    💡 <strong>How to verify:</strong> Search MRN <strong style={{ fontFamily:'monospace' }}>{doc.mrn}</strong> on{' '}
                    <a href="https://www.nmc.org.in/information-desk/for-public/verify-doctor" target="_blank" rel="noopener noreferrer"
                      style={{ color:BLUE, fontWeight:600 }}>NMC website →</a>{' '}
                    or contact {doc.smc || 'the relevant'} State Medical Council directly.
                  </div>

                  {/* Action buttons */}
                  <div style={{ display:'flex', gap:10 }}>
                    <button onClick={() => approveDoctor(doc.doctorId, doc.name)}
                      disabled={actionBusy === doc.doctorId}
                      style={{ flex:1, padding:'11px', background:GREEN, color:'white', border:'none', borderRadius:9, fontSize:13.5, fontWeight:700, cursor:'pointer', opacity:actionBusy===doc.doctorId?0.6:1 }}>
                      {actionBusy === doc.doctorId ? '⏳ Processing…' : '✅ Approve — Activate Account'}
                    </button>
                    <button onClick={() => { setRejectModal(doc); setRejectReason(''); }}
                      disabled={actionBusy === doc.doctorId}
                      style={{ flex:1, padding:'11px', background:RED_P, color:RED, border:`1px solid ${RED}40`, borderRadius:9, fontSize:13.5, fontWeight:700, cursor:'pointer' }}>
                      ⛔ Reject — Decline Registration
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* ── ALL DOCTORS TAB ── */}
        {tab === 'all' && doctors.length > 0 && (
          <div>
            <input
              type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="🔍  Search by name, email, specialty, or MRN…"
              style={{ width:'100%', padding:'11px 16px', border:`1px solid ${BORDER}`, borderRadius:10,
                fontSize:13, marginBottom:16, outline:'none', fontFamily:'DM Sans, sans-serif', boxSizing:'border-box' }}
            />

            {filteredDoctors.map(doctor => {
              const badge = statusBadge(doctor.status, doctor.isActive);
              return (
                <div key={doctor.doctorId} style={{ background:'white', border:`1px solid ${BORDER}`, borderRadius:12, padding:'16px 18px', marginBottom:10, display:'flex', alignItems:'center', gap:14 }}>
                  <div style={{ width:40, height:40, borderRadius:10, background:BLUE_P, color:BLUE, display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:700, flexShrink:0 }}>
                    {(doctor.name||'?').split(' ').filter(Boolean).slice(1,3).map(w=>w[0]).join('')}
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:3 }}>
                      <span style={{ fontSize:14, fontWeight:700, color:NAVY }}>{doctor.name}</span>
                      {badge && <span style={{ fontSize:10, fontWeight:700, background:badge.bg, color:badge.color, padding:'2px 7px', borderRadius:99 }}>{badge.label}</span>}
                    </div>
                    <div style={{ fontSize:12.5, color:SEC }}>{doctor.specialty} · {doctor.hospital}</div>
                    <div style={{ fontSize:12, color:MUTED, marginTop:2, display:'flex', flexWrap:'wrap', gap:12 }}>
                      <span>📧 {doctor.email}</span>
                      <span>📱 {doctor.phone}</span>
                      {doctor.mrn && <span>🏥 MRN: <strong style={{ fontFamily:'monospace' }}>{doctor.mrn}</strong></span>}
                      <span>📅 {new Date(doctor.registeredAt).toLocaleDateString('en-IN')}</span>
                    </div>
                  </div>
                  <div style={{ display:'flex', gap:8, flexShrink:0 }}>
                    {doctor.status === 'PENDING_REVIEW' && (
                      <>
                        <button onClick={() => approveDoctor(doctor.doctorId, doctor.name)}
                          disabled={actionBusy === doctor.doctorId}
                          style={{ padding:'7px 14px', background:GREEN_P, color:GREEN, border:`1px solid ${GREEN}40`, borderRadius:7, fontSize:12, fontWeight:700, cursor:'pointer' }}>
                          ✅ Approve
                        </button>
                        <button onClick={() => { setRejectModal(doctor); setRejectReason(''); }}
                          style={{ padding:'7px 14px', background:RED_P, color:RED, border:`1px solid ${RED}40`, borderRadius:7, fontSize:12, fontWeight:700, cursor:'pointer' }}>
                          ⛔ Reject
                        </button>
                      </>
                    )}
                    <button onClick={() => setConfirm(doctor)}
                      disabled={actionBusy === doctor.doctorId}
                      style={{ padding:'7px 14px', background:RED_P, color:RED, border:`1px solid ${RED}40`, borderRadius:7, fontSize:12, fontWeight:700, cursor:'pointer' }}>
                      🗑 Delete
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── Empty state ── */}
        {doctors.length === 0 && !loading && !error && (
          <div style={{ background:'white', border:`1px solid ${BORDER}`, borderRadius:14, padding:'64px 24px', textAlign:'center' }}>
            <div style={{ fontSize:40, marginBottom:12 }}>🩺</div>
            <div style={{ fontSize:16, fontWeight:700, color:NAVY, marginBottom:6 }}>Enter your admin key and click "Load Doctors"</div>
            <div style={{ fontSize:13, color:MUTED }}>Default key: <code style={{ background:SURFACE, padding:'2px 6px', borderRadius:4 }}>mediconnect-admin-2024</code></div>
          </div>
        )}
      </div>

      {/* ── REJECT MODAL ── */}
      {rejectModal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(12,26,46,0.6)', zIndex:300, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
          <div style={{ background:'white', borderRadius:16, padding:'28px 28px', maxWidth:460, width:'100%', fontFamily:'DM Sans, sans-serif' }}>
            <div style={{ fontSize:17, fontWeight:700, color:NAVY, marginBottom:4 }}>⛔ Reject Doctor Registration</div>
            <div style={{ fontSize:13, color:SEC, marginBottom:4 }}>{rejectModal.name}</div>
            <div style={{ fontSize:12, color:MUTED, marginBottom:18 }}>MRN: {rejectModal.mrn || '—'} · {rejectModal.smc || '—'}</div>
            <label style={{ display:'block', fontSize:12, fontWeight:600, color:MUTED, marginBottom:6, textTransform:'uppercase' }}>Rejection Reason (shown to doctor on login)</label>
            <textarea
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              placeholder="e.g. MRN not found in Maharashtra SMC records. Please contact support@mediconnect.ai with your registration certificate."
              rows={4}
              style={{ width:'100%', padding:'10px 12px', border:`1px solid ${BORDER}`, borderRadius:9, fontSize:13, fontFamily:'DM Sans, sans-serif', outline:'none', resize:'vertical', boxSizing:'border-box', marginBottom:18 }}
            />
            <div style={{ display:'flex', gap:10 }}>
              <button onClick={() => setRejectModal(null)}
                style={{ flex:1, padding:11, background:SURFACE, color:SEC, border:`1px solid ${BORDER}`, borderRadius:9, fontSize:13.5, fontWeight:600, cursor:'pointer' }}>
                Cancel
              </button>
              <button onClick={rejectDoctor} disabled={actionBusy === rejectModal.doctorId}
                style={{ flex:1, padding:11, background:RED, color:'white', border:'none', borderRadius:9, fontSize:13.5, fontWeight:700, cursor:'pointer', opacity:actionBusy===rejectModal?.doctorId?0.6:1 }}>
                {actionBusy === rejectModal?.doctorId ? '⏳ Rejecting…' : '⛔ Confirm Rejection'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── DELETE CONFIRM MODAL ── */}
      {confirm && (
        <div style={{ position:'fixed', inset:0, background:'rgba(12,26,46,0.55)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
          <div style={{ background:'white', borderRadius:16, padding:28, maxWidth:400, width:'100%', fontFamily:'DM Sans, sans-serif' }}>
            <div style={{ fontSize:16, fontWeight:700, color:NAVY, marginBottom:8 }}>🗑 Permanently Delete Doctor?</div>
            <div style={{ fontSize:14, fontWeight:700, color:RED, marginBottom:4 }}>{confirm.name}</div>
            <div style={{ fontSize:13, color:SEC, marginBottom:16 }}>{confirm.email} · {confirm.specialty}</div>
            <div style={{ background:RED_P, border:'1px solid #fca5a5', borderRadius:9, padding:'10px 14px', fontSize:12.5, color:RED, marginBottom:20, lineHeight:1.7 }}>
              ⚠️ This permanently deletes the doctor account, all their slots, and cancels pending appointments. <strong>This cannot be undone.</strong>
            </div>
            <div style={{ display:'flex', gap:10 }}>
              <button onClick={() => setConfirm(null)}
                style={{ flex:1, padding:11, background:SURFACE, color:SEC, border:`1px solid ${BORDER}`, borderRadius:9, fontSize:13.5, fontWeight:600, cursor:'pointer' }}>
                Cancel
              </button>
              <button onClick={() => deleteDoctor(confirm)} disabled={actionBusy === confirm.doctorId}
                style={{ flex:1, padding:11, background:RED, color:'white', border:'none', borderRadius:9, fontSize:13.5, fontWeight:700, cursor:'pointer' }}>
                {actionBusy === confirm.doctorId ? '⏳ Deleting…' : '🗑 Yes, Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Toast ── */}
      {toast && (
        <div style={{ position:'fixed', bottom:24, right:24, background:NAVY, color:'white', padding:'12px 20px', borderRadius:12, fontSize:13.5, fontWeight:600, zIndex:999, boxShadow:'0 8px 24px rgba(0,0,0,0.3)' }}>
          {toast}
        </div>
      )}
    </div>
  );
}

