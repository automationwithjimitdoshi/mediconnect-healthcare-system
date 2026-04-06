'use client';
/**
 * src/app/admin/patients/page.js — Admin Patient Management
 * Access: http://localhost:3000/admin/patients
 * Admin key: mediconnect-admin-2024
 */

import { useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';
const NAVY='#0c1a2e',BLUE='#1565c0',RED='#c62828',RED_P='#fdecea',
      GREEN='#1b5e20',GREEN_P='#e8f5e9',AMBER='#b45309',AMBER_P='#fff3e0',
      BORDER='#e2e8f0',SURFACE='#f7f9fc',MUTED='#8896a7',SEC='#4a5568';

const fmtDate = iso => iso ? new Date(iso).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'}) : '';

export default function AdminPatientsPage() {
  const [adminKey, setAdminKey] = useState('mediconnect-admin-2024');
  const [patients, setPatients] = useState([]);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');
  const [deleting, setDeleting] = useState(null);
  const [confirm,  setConfirm]  = useState(null);
  const [toast,    setToast]    = useState('');
  const [search,   setSearch]   = useState('');

  const showToast = msg => { setToast(msg); setTimeout(() => setToast(''), 3500); };

  async function loadPatients() {
    setLoading(true); setError('');
    try {
      const r = await fetch(`${API}/doctor-data/all-patients`, {
        headers: { 'x-admin-key': adminKey },
      });
      const d = await r.json();
      if (r.ok && d.success) setPatients(d.data);
      else setError(d.message || 'Failed to load');
    } catch { setError('Network error — is the backend running?'); }
    setLoading(false);
  }

  async function deletePatient(patient) {
    setDeleting(patient.id); setConfirm(null);
    try {
      const r = await fetch(`${API}/doctor-data/delete-patient`, {
        method:  'DELETE',
        headers: { 'x-admin-key': adminKey, 'Content-Type': 'application/json' },
        body:    JSON.stringify({ patientId: patient.id }),
      });
      const d = await r.json();
      if (r.ok && d.success) {
        setPatients(prev => prev.filter(p => p.id !== patient.id));
        showToast('✅ ' + patient.name + ' permanently deleted');
      } else {
        showToast('❌ ' + (d.message || 'Delete failed'));
      }
    } catch { showToast('❌ Network error'); }
    setDeleting(null);
  }

  const filtered = patients.filter(p =>
    !search ||
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.email.toLowerCase().includes(search.toLowerCase()) ||
    (p.phone || '').includes(search)
  );

  return (
    <div style={{ minHeight:'100vh', background:SURFACE, fontFamily:'DM Sans, sans-serif' }}>
      {/* Header */}
      <div style={{ background:NAVY, padding:'16px 32px', display:'flex', alignItems:'center', gap:16 }}>
        <div style={{ fontSize:18, fontWeight:700, color:'white' }}>⚙️ MediConnect Admin — Patient Management</div>
        <div style={{ marginLeft:'auto', display:'flex', gap:12 }}>
          <a href="/admin/doctors" style={{ fontSize:12, color:'rgba(255,255,255,0.5)', textDecoration:'none', padding:'4px 12px', border:'1px solid rgba(255,255,255,0.15)', borderRadius:6 }}>
            → Doctor Admin
          </a>
        </div>
      </div>

      <div style={{ maxWidth:1000, margin:'0 auto', padding:'28px 20px' }}>

        {/* Admin key + load */}
        <div style={{ background:'white', borderRadius:14, border:`1px solid ${BORDER}`, padding:'20px 24px', marginBottom:20 }}>
          <div style={{ fontSize:14, fontWeight:700, color:NAVY, marginBottom:12 }}>Admin Key</div>
          <div style={{ display:'flex', gap:10 }}>
            <input value={adminKey} onChange={e => setAdminKey(e.target.value)}
              placeholder="Admin key (default: mediconnect-admin-2024)"
              type="password"
              style={{ flex:1, padding:'9px 12px', border:`1.5px solid ${BORDER}`, borderRadius:9, fontSize:13, outline:'none', fontFamily:'DM Sans, sans-serif' }} />
            <button onClick={loadPatients} disabled={loading}
              style={{ padding:'9px 24px', background:BLUE, color:'white', border:'none', borderRadius:9, fontSize:13.5, fontWeight:700, cursor:'pointer' }}>
              {loading ? '⏳ Loading…' : 'Load Patients'}
            </button>
          </div>
          {error && <div style={{ marginTop:10, color:RED, fontSize:13 }}>❌ {error}</div>}
        </div>

        {/* Stats */}
        {patients.length > 0 && (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:20 }}>
            {[
              { label:'Total Patients',  value:patients.length,                        color:NAVY  },
              { label:'Active',          value:patients.filter(p=>p.isActive).length,  color:GREEN },
              { label:'Deactivated',     value:patients.filter(p=>!p.isActive).length, color:RED   },
              { label:'Total Files',     value:patients.reduce((s,p)=>s+p.files,0),    color:BLUE  },
            ].map(s => (
              <div key={s.label} style={{ background:'white', borderRadius:12, border:`1px solid ${BORDER}`, padding:'14px 18px' }}>
                <div style={{ fontSize:24, fontWeight:800, color:s.color }}>{s.value}</div>
                <div style={{ fontSize:12, color:MUTED, marginTop:2 }}>{s.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Search */}
        {patients.length > 0 && (
          <div style={{ background:'white', borderRadius:10, border:`1px solid ${BORDER}`, padding:'8px 14px', display:'flex', alignItems:'center', gap:8, marginBottom:16 }}>
            <span style={{ color:MUTED }}>🔍</span>
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search by name, email or phone…"
              style={{ border:'none', background:'transparent', outline:'none', fontSize:13, flex:1, fontFamily:'DM Sans, sans-serif' }} />
            {search && <button onClick={() => setSearch('')} style={{ background:'none', border:'none', cursor:'pointer', color:MUTED, fontSize:16 }}>×</button>}
          </div>
        )}

        {/* Patient list */}
        {filtered.map(patient => (
          <div key={patient.id} style={{
            background:'white', borderRadius:12,
            border:`1px solid ${patient.isActive ? BORDER : '#fca5a5'}`,
            padding:'14px 20px', marginBottom:10,
            display:'flex', alignItems:'center', gap:14,
            opacity: patient.isActive ? 1 : 0.7,
          }}>
            {/* Avatar */}
            <div style={{ width:42, height:42, borderRadius:10, background:patient.isActive?'#e3f0ff':RED_P,
              color:patient.isActive?BLUE:RED, display:'flex', alignItems:'center', justifyContent:'center',
              fontSize:13, fontWeight:700, flexShrink:0 }}>
              {patient.name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase()}
            </div>

            {/* Info */}
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:3 }}>
                <div style={{ fontSize:14, fontWeight:700, color:NAVY }}>{patient.name}</div>
                {!patient.isActive && (
                  <span style={{ fontSize:10, fontWeight:700, background:RED_P, color:RED, padding:'2px 7px', borderRadius:99 }}>DEACTIVATED</span>
                )}
              </div>
              <div style={{ fontSize:12.5, color:SEC }}>
                📧 {patient.email} · 📱 {patient.phone || '—'} · {patient.gender || '—'} · {patient.bloodType || '—'}
              </div>
              <div style={{ fontSize:12, color:MUTED, marginTop:3, display:'flex', gap:14 }}>
                <span>📅 Joined {fmtDate(patient.createdAt)}</span>
                <span>📋 {patient.appointments} appointments</span>
                <span>📁 {patient.files} files</span>
                <span>💬 {patient.messages} messages</span>
              </div>
            </div>

            {/* Delete */}
            <button onClick={() => setConfirm(patient)} disabled={deleting === patient.id}
              style={{ padding:'8px 16px', background:RED_P, color:RED, border:'1px solid #fca5a5',
                borderRadius:8, fontSize:12.5, fontWeight:700, cursor:'pointer', flexShrink:0 }}>
              {deleting === patient.id ? '⏳ Deleting…' : '🗑 Delete'}
            </button>
          </div>
        ))}

        {patients.length > 0 && filtered.length === 0 && (
          <div style={{ textAlign:'center', padding:32, color:MUTED }}>No patients match your search.</div>
        )}

        {patients.length === 0 && !loading && !error && (
          <div style={{ textAlign:'center', padding:64, color:MUTED, fontSize:14 }}>
            Enter admin key and click "Load Patients" to view all registered patients.
          </div>
        )}
      </div>

      {/* Confirm delete modal */}
      {confirm && (
        <div onClick={e => { if(e.target===e.currentTarget) setConfirm(null); }}
          style={{ position:'fixed', inset:0, background:'rgba(12,26,46,0.55)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
          <div style={{ background:'white', borderRadius:16, padding:28, maxWidth:420, width:'100%', fontFamily:'DM Sans, sans-serif' }}>
            <div style={{ fontSize:16, fontWeight:700, color:NAVY, marginBottom:8 }}>🗑 Permanently Delete Patient?</div>
            <div style={{ fontSize:14, fontWeight:700, color:RED, marginBottom:4 }}>{confirm.name}</div>
            <div style={{ fontSize:13, color:SEC, marginBottom:6 }}>{confirm.email}</div>

            {/* What gets deleted */}
            <div style={{ background:RED_P, border:'1px solid #fca5a5', borderRadius:9, padding:'12px 14px', fontSize:12.5, color:RED, marginBottom:20, lineHeight:1.8 }}>
              ⚠️ This will permanently delete:<br/>
              • All medical files and reports ({confirm.files} files)<br/>
              • All appointments ({confirm.appointments} records)<br/>
              • All messages and chat history<br/>
              • All conditions, medications, vitals, allergies<br/>
              <strong>This cannot be undone.</strong>
            </div>

            <div style={{ display:'flex', gap:10 }}>
              <button onClick={() => setConfirm(null)}
                style={{ flex:1, padding:11, background:SURFACE, color:SEC, border:`1px solid ${BORDER}`, borderRadius:9, fontSize:13.5, fontWeight:600, cursor:'pointer' }}>
                Cancel
              </button>
              <button onClick={() => deletePatient(confirm)}
                style={{ flex:1, padding:11, background:RED, color:'white', border:'none', borderRadius:9, fontSize:13.5, fontWeight:700, cursor:'pointer' }}>
                Yes, Delete Permanently
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div style={{ position:'fixed', bottom:24, right:24, background:NAVY, color:'white',
          padding:'12px 20px', borderRadius:12, fontSize:13, zIndex:9999, boxShadow:'0 4px 20px rgba(0,0,0,0.2)' }}>
          {toast}
        </div>
      )}
    </div>
  );
}
