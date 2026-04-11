'use client';
/**
 * src/app/patient/files/page.js — My Files
 * 
 * Shows ALL files the patient has:
 *  - Uploaded via Report Analyzer
 *  - Shared in doctor chat
 *  - Directly uploaded here
 * 
 * Features:
 *  - Upload new files (drag & drop or click)
 *  - View, Download, Delete per file
 *  - Filter by type (All / Lab Reports / ECG / Images / Documents)
 *  - AI analysis status badge (Analyzed / Pending / Not analyzed)
 *  - Link to re-analyze in Report Analyzer
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';

const NAVY='#0c1a2e',BLUE='#1565c0',BLUE_P='#e3f0ff',RED='#c62828',RED_P='#fdecea',
      AMBER='#b45309',AMBER_P='#fff3e0',GREEN='#1b5e20',GREEN_P='#e8f5e9',
      TEAL='#00796b',BORDER='#e2e8f0',SURFACE='#f7f9fc',MUTED='#8896a7',SEC='#4a5568';
const API    = 'http://localhost:5000/api';
const STATIC = 'http://localhost:5000';

const NAV = [
  { id:'patientDashboard', label:'Dashboard',        icon:'⊞', href:'/patient'                   },
  { id:'patientAppts',     label:'My Appointments',  icon:'📅', href:'/patient/appointments'      },
  { id:'patientBook',      label:'Book Appointment', icon:'➕', href:'/patient/appointments/book' },
  { id:'patientChat',      label:'Chat with Doctor', icon:'💬', href:'/patient/chat'              },
  { id:'patientFiles',     label:'My Files',         icon:'📁', href:'/patient/files'             },
  { id:'patientReports',   label:'Report Analyzer',  icon:'🔬', href:'/patient/reports', badge:'FREE' },
];

const FILE_CATS = [
  { id:'all',    label:'All Files',    icon:'📁' },
  { id:'lab',    label:'Lab Reports',  icon:'🧪' },
  { id:'ecg',    label:'ECG',          icon:'🫀' },
  { id:'image',  label:'Images',       icon:'🖼️' },
  { id:'pdf',    label:'PDFs',         icon:'📄' },
  { id:'other',  label:'Other',        icon:'📎' },
];

function getFileCat(file) {
  const cat  = (file.category || '').toLowerCase();
  const mime = (file.mimeType  || '').toLowerCase();
  const name = (file.fileName  || '').toLowerCase();
  if (cat === 'ecg' || name.includes('ecg')) return 'ecg';
  if (cat === 'pdf' || mime === 'application/pdf') return 'pdf';
  if (cat === 'image' || mime.startsWith('image/')) return 'image';
  if (name.includes('lab') || name.includes('report') || name.includes('cbc') ||
      name.includes('blood') || name.includes('urine') || cat === 'lab' || cat === 'blood_report') return 'lab';
  return 'other';
}

function getFileIcon(file) {
  const c = getFileCat(file);
  return { lab:'🧪', ecg:'🫀', pdf:'📄', image:'🖼️', other:'📎' }[c] || '📎';
}

function getFileBg(file) {
  const c = getFileCat(file);
  return { lab:'#f0fff4', ecg:'#fff0f0', pdf:'#fff5f0', image:'#f0f4ff', other:SURFACE }[c] || SURFACE;
}

const fmtSize = b => { if (!b) return ''; if (b<1024) return `${b}B`; if (b<1048576) return `${(b/1024).toFixed(0)}KB`; return `${(b/1048576).toFixed(1)}MB`; };
const fmtDate = iso => iso ? new Date(iso).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}) : '';

// ── Sidebar ───────────────────────────────────────────────────────────────────
function Sidebar({ active }) {
  const router = useRouter();
  const [name,      setName]      = useState('Patient');
  const [inits,     setInits]     = useState('P');
  const [chatBadge, setChatBadge] = useState(0);

  useEffect(() => {
    try {
      const u = JSON.parse(localStorage.getItem('mc_user') || '{}');
      const n = u?.patient ? `${u.patient.firstName||''} ${u.patient.lastName||''}`.trim() : (u?.email || 'Patient');
      setName(n); setInits(n.split(' ').filter(Boolean).map(w=>w[0]).join('').slice(0,2).toUpperCase() || 'P');
    } catch {}
    const tok = localStorage.getItem('mc_token') || '';
    if (tok) {
      fetch(`${API}/chat/rooms?limit=100`, { headers: { Authorization: `Bearer ${tok}` } })
        .then(r => r.ok ? r.json() : null)
        .then(d => setChatBadge((d?.data||[]).reduce((s,r) => s+(r.unreadCount||0), 0)))
        .catch(() => {});
    }
  }, []);

  return (
    <div style={{ width:220, background:NAVY, display:'flex', flexDirection:'column', flexShrink:0, overflow:'hidden' }}>
      <div style={{ padding:'20px 18px 14px', borderBottom:'1px solid rgba(255,255,255,0.08)' }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ width:32, height:32, background:BLUE, borderRadius:8, position:'relative', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center' }}>
            <div style={{ position:'absolute', width:14, height:3, background:'white', borderRadius:2 }}/>
            <div style={{ position:'absolute', width:3, height:14, background:'white', borderRadius:2 }}/>
          </div>
          <div>
            <div style={{ fontSize:13, fontWeight:600, color:'white' }}>MediConnect AI</div>
            <div style={{ fontSize:9, color:'rgba(255,255,255,0.3)', fontFamily:'monospace', letterSpacing:'0.1em' }}>PATIENT PORTAL</div>
          </div>
        </div>
      </div>
      <div style={{ margin:'10px 10px 6px', background:'rgba(255,255,255,0.06)', borderRadius:9, padding:'8px 10px', display:'flex', alignItems:'center', gap:8 }}>
        <div style={{ width:30, height:30, borderRadius:'50%', background:BLUE_P, color:BLUE, display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:700, flexShrink:0 }}>{inits}</div>
        <div style={{ flex:1, minWidth:0 }}>
          <div suppressHydrationWarning style={{ fontSize:12, fontWeight:500, color:'white', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{name}</div>
          <div style={{ fontSize:10, color:'rgba(255,255,255,0.4)' }}>Patient</div>
        </div>
      </div>
      <div style={{ padding:'10px 18px 4px', fontSize:9, color:'rgba(255,255,255,0.25)', fontFamily:'monospace', letterSpacing:'0.12em' }}>MY HEALTH</div>
      <div style={{ padding:'0 8px', flex:1, overflowY:'auto' }}>
        {NAV.map(item => {
          const isActive = item.id === active;
          return (
            <button key={item.id} onClick={() => router.push(item.href)}
              style={{ display:'flex', alignItems:'center', gap:10, width:'100%', padding:'9px 12px', margin:'2px 0', borderRadius:8, cursor:'pointer', border:'none', textAlign:'left', background:isActive?BLUE:'transparent', color:isActive?'white':'rgba(255,255,255,0.55)', fontSize:13, fontFamily:'DM Sans, sans-serif', fontWeight:isActive?500:400 }}>
              <span style={{ fontSize:14 }}>{item.icon}</span>
              <span style={{ flex:1 }}>{item.label}</span>
              {item.id === 'patientChat' && chatBadge > 0 && (
                <span style={{ background:'#ef4444', color:'white', fontSize:10, fontWeight:600, padding:'1px 5px', borderRadius:99 }}>{chatBadge}</span>
              )}
              {item.id === 'patientReports' && (
                <span style={{ background:'#0e7490', color:'white', fontSize:9, fontWeight:600, padding:'2px 6px', borderRadius:99 }}>FREE</span>
              )}
            </button>
          );
        })}
      </div>
      <div style={{ padding:'10px 12px', borderTop:'1px solid rgba(255,255,255,0.08)' }}>
        <button onClick={() => { localStorage.removeItem('mc_token'); localStorage.removeItem('mc_user'); router.push('/login'); }}
          style={{ width:'100%', padding:'7px 10px', background:'rgba(255,255,255,0.05)', border:'none', borderRadius:8, color:'rgba(255,255,255,0.4)', fontSize:12, cursor:'pointer', textAlign:'left', fontFamily:'DM Sans, sans-serif' }}>
          🚪 Sign out
        </button>
      </div>
    </div>
  );
}

// ── File Card ─────────────────────────────────────────────────────────────────
function FileCard({ file, onDownload, onDelete, onAnalyze, analyzing }) {
  const cat      = getFileCat(file);
  const icon     = getFileIcon(file);
  const bg       = getFileBg(file);
  const analyzed = file.patientAnalysis || file.isProcessed;
  const isPending= file.patientAnalysis?.pending;

  return (
    <div style={{ background:'white', borderRadius:14, border:`1px solid ${BORDER}`, overflow:'hidden', transition:'box-shadow 0.15s' }}>
      {/* File type banner */}
      <div style={{ background:bg, padding:'12px 16px', display:'flex', alignItems:'center', gap:12, borderBottom:`1px solid ${BORDER}` }}>
        <div style={{ width:44, height:44, borderRadius:10, background:'white', border:`1px solid ${BORDER}`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:22, flexShrink:0 }}>
          {icon}
        </div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:13.5, fontWeight:700, color:NAVY, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
            {file.fileName || 'File'}
          </div>
          <div style={{ fontSize:11.5, color:MUTED, marginTop:2 }}>
            {fmtSize(file.fileSize)} · {fmtDate(file.createdAt)}
          </div>
        </div>
        {/* Analysis status badge */}
        {analyzed && !isPending ? (
          <span style={{ fontSize:11, fontWeight:700, background:GREEN_P, color:GREEN, padding:'3px 9px', borderRadius:99, border:'1px solid #a5d6a7', flexShrink:0 }}>
            ✓ Analyzed
          </span>
        ) : isPending ? (
          <span style={{ fontSize:11, fontWeight:700, background:AMBER_P, color:AMBER, padding:'3px 9px', borderRadius:99, border:'1px solid #fde68a', flexShrink:0 }}>
            ⏳ Pending AI
          </span>
        ) : (
          <span style={{ fontSize:11, fontWeight:600, background:SURFACE, color:MUTED, padding:'3px 9px', borderRadius:99, border:`1px solid ${BORDER}`, flexShrink:0 }}>
            Not analyzed
          </span>
        )}
      </div>

      {/* Quick analysis summary if available */}
      {file.patientAnalysis && !isPending && (() => {
        const pa = file.patientAnalysis;
        // findings can be: string, or array of {icon, title, detail, severity}
        // scoreLabel is a better single-line summary
        let summary = '';
        if (pa.scoreLabel)                        summary = pa.scoreLabel;
        else if (typeof pa.findings === 'string') summary = pa.findings.slice(0, 120);
        else if (Array.isArray(pa.findings) && pa.findings.length > 0) {
          // Get the most severe finding's title
          const top = pa.findings.find(f => f.severity === 'critical' || f.severity === 'warning') || pa.findings[0];
          summary = (top?.title ? top.icon + ' ' + top.title : '') || '';
        }
        if (!summary) return null;
        return (
          <div style={{ padding:'10px 16px', background:SURFACE, borderBottom:`1px solid ${BORDER}`, fontSize:12, color:SEC, lineHeight:1.6 }}>
            <span style={{ fontWeight:600, color:NAVY }}>AI Summary: </span>
            {summary}{summary.length >= 120 ? '…' : ''}
          </div>
        );
      })()}

      {/* Actions */}
      <div style={{ padding:'12px 16px', display:'flex', gap:8, flexWrap:'wrap' }}>
        <button onClick={() => onDownload(file)}
          style={{ padding:'6px 14px', background:BLUE, color:'white', border:'none', borderRadius:8, fontSize:12.5, fontWeight:600, cursor:'pointer' }}>
          ↓ Download
        </button>
        {analyzing ? (
          <button disabled
            style={{ padding:'6px 14px', background:'#f0fdfa', color:TEAL, border:`1px solid ${TEAL}40`, borderRadius:8, fontSize:12.5, fontWeight:600, cursor:'not-allowed', display:'flex', alignItems:'center', gap:6 }}>
            <span style={{ display:'inline-block', width:12, height:12, border:`2px solid ${TEAL}`, borderTopColor:'transparent', borderRadius:'50%', animation:'spin 0.8s linear infinite' }}/>
            Analyzing…
          </button>
        ) : !analyzed || isPending ? (
          <button onClick={() => onAnalyze(file)}
            style={{ padding:'6px 14px', background:TEAL, color:'white', border:'none', borderRadius:8, fontSize:12.5, fontWeight:600, cursor:'pointer' }}>
            🔬 Analyze
          </button>
        ) : (
          <button onClick={() => onAnalyze(file)}
            style={{ padding:'6px 14px', background:SURFACE, color:TEAL, border:`1px solid ${TEAL}40`, borderRadius:8, fontSize:12.5, fontWeight:600, cursor:'pointer' }}>
            🔬 Re-analyze
          </button>
        )}
        <button onClick={() => onDelete(file)}
          style={{ padding:'6px 14px', background:RED_P, color:RED, border:'1px solid #f5c6cb', borderRadius:8, fontSize:12.5, fontWeight:600, cursor:'pointer', marginLeft:'auto' }}>
          🗑 Delete
        </button>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function PatientFilesPage() {
  const router   = useRouter();
  const fileRef  = useRef(null);
  const [mounted,   setMounted]   = useState(false);
  const [files,     setFiles]     = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [uploading, setUploading] = useState(false);
  const [filter,    setFilter]    = useState('all');
  const [search,    setSearch]    = useState('');
  const [dragOver,  setDragOver]  = useState(false);
  const [toast,     setToast]     = useState({ msg:'', type:'ok' });
  const [delModal,   setDelModal]   = useState(null); // file to delete
  const [analyzingId,setAnalyzingId]= useState(null); // file id currently being analyzed
  const [analysisResult,setAnalysisResult] = useState(null); // {file, analysis} to show in modal

  const token     = useCallback(() => localStorage.getItem('mc_token') || '', []);
  const showToast = useCallback((msg, type='ok') => { setToast({ msg, type }); setTimeout(() => setToast({ msg:'', type:'ok' }), 3500); }, []);

  useEffect(() => {
    setMounted(true);
    const u = localStorage.getItem('mc_user');
    if (!u) { router.push('/login'); return; }
    if (JSON.parse(u).role !== 'PATIENT') { router.push('/'); return; }
    loadFiles();
  }, []);

  async function loadFiles() {
    setLoading(true);
    try {
      const r = await fetch(`${API}/files`, { headers: { Authorization: `Bearer ${token()}` } });
      const d = await r.json();
      const list = d.data || d.files || [];
      // Sort newest first
      list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      setFiles(list);
    } catch { showToast('Failed to load files', 'err'); }
    setLoading(false);
  }

  async function handleUpload(file) {
    if (!file) return;
    const allowed = ['application/pdf','image/jpeg','image/jpg','image/png','image/webp','application/msword',
                     'application/vnd.openxmlformats-officedocument.wordprocessingml.document','text/plain'];
    if (!allowed.includes(file.type)) { showToast('Unsupported file type. Use PDF, JPG, PNG, WebP, or DOC.', 'err'); return; }
    if (file.size > 25 * 1024 * 1024) { showToast('File too large — maximum 25 MB.', 'err'); return; }

    setUploading(true);
    showToast(`⏳ Uploading ${file.name}…`);

    try {
      const fd = new FormData();
      fd.append('files', file); // backend expects field name 'files' (array)
      // description is optional — not sent

      const r = await fetch(`${API}/files/upload`, {
        method:  'POST',
        headers: { Authorization: `Bearer ${token()}` },
        body:    fd,
      });
      const d = await r.json();
      if (r.ok && d.success) {
        showToast(`✅ ${file.name} uploaded successfully`);
        loadFiles();
      } else {
        showToast(d.message || 'Upload failed', 'err');
      }
    } catch { showToast('Network error — upload failed', 'err'); }
    setUploading(false);
  }

  async function handleDelete(file) {
    try {
      const r = await fetch(`${API}/files/${file.id}`, {
        method:  'DELETE',
        headers: { Authorization: `Bearer ${token()}` },
      });
      const d = await r.json();
      if (r.ok && d.success) {
        setFiles(prev => prev.filter(f => f.id !== file.id));
        showToast('🗑 File deleted');
      } else {
        showToast(d.message || 'Delete failed', 'err');
      }
    } catch { showToast('Network error', 'err'); }
    setDelModal(null);
  }

  async function handleDownload(file) {
    try {
      if (file.storageUrl) {
        const url = file.storageUrl.startsWith('http') ? file.storageUrl : `${STATIC}${file.storageUrl}`;
        const r = await fetch(url);
        if (r.ok) {
          const blob = await r.blob();
          const a    = document.createElement('a');
          a.href     = URL.createObjectURL(blob);
          a.download = file.fileName || 'file';
          a.click();
          URL.revokeObjectURL(a.href);
          return;
        }
      }
      // Auth download fallback
      const r = await fetch(`${API}/files/${file.id}/download`, { headers: { Authorization: `Bearer ${token()}` } });
      if (r.ok) {
        const blob = await r.blob();
        const a    = document.createElement('a');
        a.href     = URL.createObjectURL(blob);
        a.download = file.fileName || 'file';
        a.click();
        URL.revokeObjectURL(a.href);
      }
    } catch { showToast('Download failed', 'err'); }
  }

  async function handleAnalyze(file) {
    setAnalyzingId(file.id);
    setAnalysisResult(null);
    try {
      const r = await fetch(`${API}/reports/patient/reanalyze`, {
        method:  'POST',
        headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
        body:    JSON.stringify({ fileId: file.id, lang: 'en' }),
      });
      const d = await r.json();
      if (r.ok && d.success) {
        // Update file in list with new analysis
        setFiles(prev => prev.map(f => f.id === file.id
          ? { ...f, patientAnalysis: d.analysis, isProcessed: true }
          : f
        ));
        setAnalysisResult({ file, analysis: d.analysis });
        showToast('✅ Analysis complete!');
      } else {
        showToast(d.message || 'Analysis failed — try the Report Analyzer for a new upload', 'err');
      }
    } catch {
      showToast('Network error during analysis', 'err');
    }
    setAnalyzingId(null);
  }

  // Filter + search
  const filtered = files.filter(f => {
    const matchCat    = filter === 'all' || getFileCat(f) === filter;
    const matchSearch = !search || (f.fileName || '').toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  const totalSize = files.reduce((s, f) => s + (f.fileSize || 0), 0);

  if (!mounted) return null;

  return (
    <div style={{ display:'flex', height:'100vh', overflow:'hidden', fontFamily:'DM Sans, sans-serif' }}>
      <Sidebar active="patientFiles"/>

      <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden', background:SURFACE }}>

        {/* Header */}
        <div style={{ background:'white', borderBottom:`1px solid ${BORDER}`, padding:'16px 28px', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
          <div>
            <div style={{ fontSize:19, fontWeight:700, color:NAVY }}>📁 My Files</div>
            <div style={{ fontSize:13, color:MUTED, marginTop:2 }}>
              {loading ? 'Loading…' : `${files.length} file${files.length!==1?'s':''} · ${fmtSize(totalSize)} total`}
            </div>
          </div>
          <button onClick={() => fileRef.current?.click()} disabled={uploading}
            style={{ padding:'9px 20px', background:uploading?'#93c5fd':BLUE, color:'white', border:'none', borderRadius:10, fontSize:13.5, fontWeight:700, cursor:uploading?'not-allowed':'pointer', display:'flex', alignItems:'center', gap:8 }}>
            {uploading ? '⏳ Uploading…' : '+ Upload File'}
          </button>
          <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.txt" style={{ display:'none' }}
            onChange={e => { handleUpload(e.target.files?.[0]); e.target.value=''; }} />
        </div>

        {/* Drop zone banner */}
        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); handleUpload(e.dataTransfer.files[0]); }}
          style={{ background:dragOver?BLUE_P:'white', borderBottom:`1px solid ${dragOver?BLUE:BORDER}`,
            padding:'10px 28px', textAlign:'center', fontSize:13, color:dragOver?BLUE:MUTED,
            transition:'all 0.2s', flexShrink:0, cursor:'default' }}>
          {dragOver ? '📁 Drop file here to upload' : 'Drag & drop a file anywhere here to upload · Supports PDF, JPG, PNG, WebP, DOC'}
        </div>

        {/* Filter bar */}
        <div style={{ background:'white', borderBottom:`1px solid ${BORDER}`, padding:'10px 28px', display:'flex', gap:8, alignItems:'center', flexShrink:0, flexWrap:'wrap' }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, background:SURFACE, borderRadius:9, padding:'7px 12px', border:`1px solid ${BORDER}`, flex:1, minWidth:200 }}>
            <span style={{ color:MUTED }}>🔍</span>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search files…"
              style={{ border:'none', background:'transparent', outline:'none', fontSize:13, color:NAVY, fontFamily:'DM Sans, sans-serif', flex:1 }}/>
            {search && <button onClick={() => setSearch('')} style={{ background:'none', border:'none', cursor:'pointer', color:MUTED }}>×</button>}
          </div>
          <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
            {FILE_CATS.map(cat => {
              const count = cat.id === 'all' ? files.length : files.filter(f => getFileCat(f) === cat.id).length;
              return (
                <button key={cat.id} onClick={() => setFilter(cat.id)}
                  style={{ padding:'6px 12px', borderRadius:8, border:`1px solid ${filter===cat.id?BLUE:BORDER}`,
                    background:filter===cat.id?BLUE_P:'white', color:filter===cat.id?BLUE:MUTED,
                    fontSize:12.5, fontWeight:filter===cat.id?700:400, cursor:'pointer',
                    display:'flex', alignItems:'center', gap:5 }}>
                  {cat.icon} {cat.label}
                  {count > 0 && <span style={{ fontSize:10, opacity:0.7 }}>({count})</span>}
                </button>
              );
            })}
          </div>
        </div>

        {/* File grid */}
        <div style={{ flex:1, overflowY:'auto', padding:'20px 28px' }}>
          {loading && (
            <div style={{ textAlign:'center', padding:64, color:MUTED }}>
              <div style={{ fontSize:36, marginBottom:12 }}>⏳</div>
              <div>Loading your files…</div>
            </div>
          )}

          {!loading && files.length === 0 && (
            <div style={{ textAlign:'center', padding:64, background:'white', borderRadius:16, border:`1px solid ${BORDER}` }}>
              <div style={{ fontSize:56, marginBottom:16 }}>📁</div>
              <div style={{ fontSize:18, fontWeight:700, color:NAVY, marginBottom:8 }}>No files yet</div>
              <div style={{ fontSize:14, color:MUTED, maxWidth:380, margin:'0 auto 24px', lineHeight:1.7 }}>
                Upload lab reports, ECG scans, prescriptions or any medical document. Files uploaded via Report Analyzer or shared in chat also appear here.
              </div>
              <button onClick={() => fileRef.current?.click()}
                style={{ padding:'11px 28px', background:BLUE, color:'white', border:'none', borderRadius:10, fontSize:14, fontWeight:700, cursor:'pointer', marginRight:12 }}>
                + Upload First File
              </button>
              <button onClick={() => router.push('/patient/reports')}
                style={{ padding:'11px 28px', background:SURFACE, color:TEAL, border:`1px solid ${TEAL}40`, borderRadius:10, fontSize:14, fontWeight:600, cursor:'pointer' }}>
                🔬 Use Report Analyzer
              </button>
            </div>
          )}

          {!loading && filtered.length === 0 && files.length > 0 && (
            <div style={{ textAlign:'center', padding:48, color:MUTED, fontSize:14 }}>
              No files match your search or filter.
            </div>
          )}

          {!loading && filtered.length > 0 && (
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(360px, 1fr))', gap:16 }}>
              {filtered.map(f => (
                <FileCard key={f.id} file={f}
                  onDownload={handleDownload}
                  onDelete={file => setDelModal(file)}
                  onAnalyze={handleAnalyze}
                  analyzing={analyzingId === f.id}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Analysis result modal */}
      {analysisResult && (
        <div onClick={e => { if(e.target===e.currentTarget) setAnalysisResult(null); }}
          style={{ position:'fixed', inset:0, background:'rgba(12,26,46,0.6)', zIndex:300, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
          <div style={{ background:'white', borderRadius:16, width:'100%', maxWidth:600, maxHeight:'85vh', display:'flex', flexDirection:'column', boxShadow:'0 12px 48px rgba(0,0,0,0.25)', overflow:'hidden', fontFamily:'DM Sans, sans-serif' }}>
            {/* Header */}
            <div style={{ background:NAVY, padding:'16px 20px', display:'flex', alignItems:'center', gap:12, flexShrink:0 }}>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:11, color:'rgba(255,255,255,0.4)', fontFamily:'monospace', letterSpacing:'0.08em', marginBottom:4 }}>🔬 AI ANALYSIS RESULT</div>
                <div style={{ fontSize:14, fontWeight:700, color:'white', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{analysisResult.file.fileName}</div>
              </div>
              <button onClick={() => setAnalysisResult(null)}
                style={{ background:'rgba(255,255,255,0.1)', border:'none', color:'white', width:30, height:30, borderRadius:'50%', cursor:'pointer', fontSize:16, display:'flex', alignItems:'center', justifyContent:'center' }}>×</button>
            </div>

            {/* Body */}
            <div style={{ flex:1, overflowY:'auto', padding:20 }}>
              {(() => {
                const a = analysisResult.analysis;
                if (!a) return <div style={{ color:MUTED, textAlign:'center', padding:40 }}>No analysis data</div>;

                return (
                  <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
                    {/* Health score */}
                    {typeof a.healthScore === 'number' && (
                      <div style={{ display:'flex', alignItems:'center', gap:16, padding:'14px 18px', background:a.healthScore>=80?GREEN_P:a.healthScore>=60?AMBER_P:RED_P, borderRadius:12, border:`1px solid ${a.healthScore>=80?'#a5d6a7':a.healthScore>=60?'#fde68a':'#f5c6cb'}` }}>
                        <div style={{ fontSize:36, fontWeight:800, color:a.healthScore>=80?GREEN:a.healthScore>=60?AMBER:RED, lineHeight:1 }}>{a.healthScore}</div>
                        <div>
                          <div style={{ fontSize:14, fontWeight:700, color:NAVY }}>Health Score / 100</div>
                          <div style={{ fontSize:13, color:SEC }}>{a.scoreLabel || ''}</div>
                        </div>
                      </div>
                    )}

                    {/* Report type */}
                    {a.reportType && (
                      <div style={{ fontSize:13, color:SEC }}><strong style={{ color:NAVY }}>Report type:</strong> {a.reportType}</div>
                    )}

                    {/* Key findings */}
                    {Array.isArray(a.findings) && a.findings.length > 0 && (
                      <div>
                        <div style={{ fontSize:12, fontWeight:700, color:MUTED, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:8 }}>Key Findings</div>
                        {a.findings.map((f, i) => {
                          const sevBg    = {critical:RED_P, warning:AMBER_P, caution:AMBER_P, ok:GREEN_P, info:BLUE_P}[f.severity] || SURFACE;
                          const sevColor = {critical:RED,   warning:AMBER,   caution:AMBER,   ok:GREEN,   info:BLUE}[f.severity]  || MUTED;
                          return (
                            <div key={i} style={{ display:'flex', gap:10, padding:'10px 12px', background:sevBg, borderRadius:9, marginBottom:6, border:`1px solid ${sevColor}20` }}>
                              <span style={{ fontSize:18, flexShrink:0 }}>{f.icon}</span>
                              <div>
                                <div style={{ fontWeight:700, fontSize:13, color:NAVY, marginBottom:2 }}>{f.title}</div>
                                <div style={{ fontSize:12.5, color:SEC, lineHeight:1.6 }}>{f.detail}</div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Parameters summary */}
                    {Array.isArray(a.parameters) && a.parameters.length > 0 && (
                      <div>
                        <div style={{ fontSize:12, fontWeight:700, color:MUTED, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:8 }}>
                          Parameters ({a.parameters.filter(p=>p.status!=='normal').length} abnormal of {a.parameters.length})
                        </div>
                        {a.parameters.filter(p => p.status !== 'normal').slice(0, 8).map((p, i) => (
                          <div key={i} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'7px 12px', background:p.status==='high'?RED_P:p.status==='low'?BLUE_P:SURFACE, borderRadius:7, marginBottom:4 }}>
                            <span style={{ fontSize:13, color:NAVY, fontWeight:600 }}>{p.name}</span>
                            <span style={{ fontSize:13, fontWeight:700, color:p.status==='high'?RED:p.status==='low'?BLUE:MUTED }}>
                              {p.value} {p.unit} <span style={{ fontSize:10 }}>({p.status === 'high' ? '↑ High' : '↓ Low'})</span>
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Suggestions */}
                    {Array.isArray(a.suggestions) && a.suggestions.length > 0 && (
                      <div style={{ background:GREEN_P, borderRadius:10, padding:'12px 14px', border:'1px solid #a5d6a7' }}>
                        <div style={{ fontSize:12, fontWeight:700, color:GREEN, marginBottom:6, textTransform:'uppercase', letterSpacing:'0.06em' }}>Recommendations</div>
                        {a.suggestions.slice(0, 3).map((s, i) => (
                          <div key={i}>
                            <div style={{ fontSize:12.5, fontWeight:700, color:NAVY, marginBottom:3 }}>{s.icon} {s.category}</div>
                            {(s.items || []).slice(0, 2).map((item, j) => (
                              <div key={j} style={{ fontSize:12, color:SEC, padding:'2px 0 2px 16px' }}>• {item}</div>
                            ))}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>

            {/* Footer */}
            <div style={{ padding:'12px 20px', borderTop:`1px solid ${BORDER}`, display:'flex', gap:10, flexShrink:0 }}>
              <button onClick={() => router.push(`/patient/reports?fileId=${analysisResult.file.id}`)}
                style={{ flex:1, padding:'10px', background:BLUE, color:'white', border:'none', borderRadius:9, fontSize:13.5, fontWeight:700, cursor:'pointer' }}>
                📊 Full Report View
              </button>
              <button onClick={() => setAnalysisResult(null)}
                style={{ padding:'10px 20px', background:SURFACE, color:SEC, border:`1px solid ${BORDER}`, borderRadius:9, fontSize:13.5, fontWeight:600, cursor:'pointer' }}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation modal */}
      {delModal && (
        <div onClick={e => { if (e.target === e.currentTarget) setDelModal(null); }}
          style={{ position:'fixed', inset:0, background:'rgba(12,26,46,0.55)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
          <div style={{ background:'white', borderRadius:16, padding:28, maxWidth:380, width:'100%', fontFamily:'DM Sans, sans-serif' }}>
            <div style={{ fontSize:16, fontWeight:700, color:NAVY, marginBottom:8 }}>Delete File?</div>
            <div style={{ fontSize:13.5, color:SEC, marginBottom:6, lineHeight:1.6 }}>
              <strong>{delModal.fileName}</strong>
            </div>
            <div style={{ fontSize:13, color:MUTED, marginBottom:20, lineHeight:1.6 }}>
              This will permanently delete the file and its AI analysis. This cannot be undone.
            </div>
            <div style={{ display:'flex', gap:10 }}>
              <button onClick={() => setDelModal(null)}
                style={{ flex:1, padding:11, background:SURFACE, color:SEC, border:`1px solid ${BORDER}`, borderRadius:9, fontSize:13.5, fontWeight:600, cursor:'pointer' }}>
                Cancel
              </button>
              <button onClick={() => handleDelete(delModal)}
                style={{ flex:1, padding:11, background:RED, color:'white', border:'none', borderRadius:9, fontSize:13.5, fontWeight:700, cursor:'pointer' }}>
                🗑 Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast.msg && (
        <div style={{ position:'fixed', bottom:24, right:24, background:toast.type==='err'?RED:NAVY, color:'white',
          padding:'12px 20px', borderRadius:12, fontSize:13, zIndex:9999, boxShadow:'0 4px 20px rgba(0,0,0,0.2)', maxWidth:400, lineHeight:1.5 }}>
          {toast.msg}
        </div>
      )}
    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}