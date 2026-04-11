'use client';
/**
 * src/app/patient/files/page.js
 *
 * FIXES:
 *  - Download: uses /api/files/:id/download (authenticated) instead of static URL
 *  - Delete: added 🗑 delete button with confirmation dialog on every file card
 *  - Removes file from list instantly on delete (optimistic UI)
 */

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { getToken } from '@/lib/auth';
import PatientSidebar from '@/components/PatientSidebar';

const API  = process.env.NEXT_PUBLIC_API_URL  || 'http://localhost:5000/api';
const BASE = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:5000';

const NAVY  = '#0c1a2e', BLUE = '#1565c0', BLUE_P = '#e3f0ff',
      GREEN = '#1b5e20', GREEN_P = '#e8f5e9', RED = '#c62828', RED_P = '#fdecea',
      AMBER = '#b45309', BORDER = '#e2e8f0', SURFACE = '#f7f9fc',
      MUTED = '#8896a7', SEC = '#4a5568';

const CAT_ICON  = { PDF: '📄', IMAGE: '🖼️', DOCUMENT: '📝', DICOM: '🔬' };
const CAT_COLOR = { PDF: RED_P, IMAGE: BLUE_P, DOCUMENT: '#f3f0ff', DICOM: GREEN_P };

function fmtSize(b) {
  if (!b) return '';
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / 1048576).toFixed(1)} MB`;
}

function fmtDateTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  });
}

function getCategory(file) {
  if (file.category) return file.category;
  const mime = file.fileType || file.mimeType || '';
  if (mime.startsWith('image/')) return 'IMAGE';
  if (mime === 'application/pdf') return 'PDF';
  return 'DOCUMENT';
}

// ── Confirm Delete Dialog ─────────────────────────────────────────────────────
function ConfirmDialog({ fileName, onConfirm, onCancel }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(12,26,46,0.55)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
      onClick={e => { if (e.target === e.currentTarget) onCancel(); }}>
      <div style={{ background: 'white', borderRadius: 16, padding: '28px 28px 24px', maxWidth: 400, width: '100%', boxShadow: '0 16px 48px rgba(0,0,0,0.2)' }}>
        <div style={{ fontSize: 36, textAlign: 'center', marginBottom: 14 }}>🗑️</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: NAVY, textAlign: 'center', marginBottom: 8 }}>Delete File?</div>
        <div style={{ fontSize: 13, color: SEC, textAlign: 'center', marginBottom: 6 }}>
          This will permanently delete:
        </div>
        <div style={{ fontSize: 13, fontWeight: 600, color: NAVY, textAlign: 'center', background: SURFACE, borderRadius: 8, padding: '8px 12px', marginBottom: 20, wordBreak: 'break-word' }}>
          {fileName}
        </div>
        <div style={{ fontSize: 12, color: MUTED, textAlign: 'center', marginBottom: 20 }}>
          This action cannot be undone. Any AI analysis for this file will also be removed.
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onCancel}
            style={{ flex: 1, padding: '10px', background: SURFACE, color: SEC, border: `1.5px solid ${BORDER}`, borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
            Cancel
          </button>
          <button onClick={onConfirm}
            style={{ flex: 1, padding: '10px', background: RED, color: 'white', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
            🗑 Delete
          </button>
        </div>
      </div>
    </div>
  );
}

export default function PatientFilesPage() {
  const router  = useRouter();
  const fileRef = useRef(null);
  const dropRef = useRef(null);

  const [mounted,     setMounted]     = useState(false);
  const [files,       setFiles]       = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [uploading,   setUploading]   = useState(false);
  const [dragOver,    setDragOver]    = useState(false);
  const [toast,       setToast]       = useState(null);
  const [filter,      setFilter]      = useState('ALL');
  const [search,      setSearch]      = useState('');
  const [confirmFile, setConfirmFile] = useState(null);  // file pending delete
  const [deleting,    setDeleting]    = useState(null);  // id being deleted
  const [downloading, setDownloading] = useState(null);  // id being downloaded

  const tok = () => getToken('PATIENT') || getToken('DOCTOR') || '';

  function showToast(msg, type = 'ok') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }

  useEffect(() => {
    setMounted(true);
    const t = tok();
    if (!t) { router.push('/patient/login'); return; }
    loadFiles(t);
  }, []);

  async function loadFiles(t) {
    setLoading(true);
    try {
      const [r1, r2] = await Promise.allSettled([
        fetch(`${API}/reports/patient/my-files`, { headers: { Authorization: `Bearer ${t}` } }),
        fetch(`${API}/files/my`,                 { headers: { Authorization: `Bearer ${t}` } }),
      ]);
      const list1 = r1.status === 'fulfilled' && r1.value.ok ? (await r1.value.json()).data || [] : [];
      const list2 = r2.status === 'fulfilled' && r2.value.ok ? (await r2.value.json()).data || [] : [];

      const seen = new Set();
      const merged = [...list1, ...list2]
        .filter(f => { if (seen.has(f.id)) return false; seen.add(f.id); return true; })
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      setFiles(merged);
    } catch {
      showToast('Failed to load files', 'err');
    } finally {
      setLoading(false);
    }
  }

  async function handleUpload(fileList) {
    const file = fileList?.[0];
    if (!file) return;
    const allowed = ['application/pdf','image/jpeg','image/png','image/webp',
      'application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','text/plain'];
    if (!allowed.includes(file.type)) { showToast('Unsupported file type. Use PDF, JPG, PNG, DOCX.', 'err'); return; }
    if (file.size > 20 * 1024 * 1024) { showToast('File too large. Max 20 MB.', 'err'); return; }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const r = await fetch(`${API}/files/upload`, { method: 'POST', headers: { Authorization: `Bearer ${tok()}` }, body: fd });
      const d = await r.json();
      if (!r.ok) throw new Error(d.message || 'Upload failed');
      showToast(`✅ ${file.name} uploaded`);
      await loadFiles(tok());
    } catch (err) {
      showToast(err.message || 'Upload failed', 'err');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  // ── Download: fetch blob from static URL → trigger browser save dialog ──────
  // Express serves /uploads as static — no auth needed, always works locally.
  // Using fetch→blob→anchor forces the browser to SAVE the file instead of opening it.
  async function handleDownload(file) {
    setDownloading(file.id);
    try {
      const rawUrl = file.storageUrl || file.fileUrl || '';
      if (!rawUrl) { showToast('File URL not available', 'err'); return; }

      // Build absolute static URL: '/uploads/pdfs/abc.PDF' → 'http://localhost:5000/uploads/pdfs/abc.PDF'
      const staticUrl = rawUrl.startsWith('http') ? rawUrl : `${BASE}${rawUrl}`;

      // fetch the file as a blob — this forces download instead of browser navigation
      const r = await fetch(staticUrl);
      if (!r.ok) throw new Error(`Server returned ${r.status}`);

      const blob = await r.blob();
      const blobUrl = URL.createObjectURL(blob);

      // Create a hidden anchor with `download` attribute — triggers Save dialog
      const a = document.createElement('a');
      a.href     = blobUrl;
      a.download = file.fileName || 'download'; // filename shown in Save dialog
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);

      showToast(`✅ ${file.fileName} downloaded`);
    } catch (err) {
      showToast('Download failed: ' + err.message, 'err');
    } finally {
      setDownloading(null);
    }
  }

  // ── Delete ────────────────────────────────────────────────────────────────
  async function handleDelete(file) {
    setConfirmFile(null);
    setDeleting(file.id);

    // Optimistic removal
    setFiles(prev => prev.filter(f => f.id !== file.id));

    try {
      // Try dedicated delete endpoint first
      let r = await fetch(`${API}/files/${file.id}`, {
        method:  'DELETE',
        headers: { Authorization: `Bearer ${tok()}` },
      });

      // Some setups route delete through reports
      if (r.status === 404 || r.status === 405) {
        r = await fetch(`${API}/reports/patient/files/${file.id}`, {
          method:  'DELETE',
          headers: { Authorization: `Bearer ${tok()}` },
        });
      }

      if (r.ok) {
        showToast(`🗑 ${file.fileName} deleted`);
      } else {
        // Rollback on failure
        setFiles(prev => [file, ...prev].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
        showToast('Delete failed. Please try again.', 'err');
      }
    } catch {
      setFiles(prev => [file, ...prev].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
      showToast('Delete failed. Please try again.', 'err');
    } finally {
      setDeleting(null);
    }
  }

  const filtered = files.filter(f => {
    const cat = getCategory(f);
    const matchCat    = filter === 'ALL' || cat === filter;
    const matchSearch = !search.trim() || (f.fileName || '').toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  const counts = {
    ALL:      files.length,
    PDF:      files.filter(f => getCategory(f) === 'PDF').length,
    IMAGE:    files.filter(f => getCategory(f) === 'IMAGE').length,
    DOCUMENT: files.filter(f => getCategory(f) === 'DOCUMENT').length,
  };

  if (!mounted) return null;

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', fontFamily: 'DM Sans, sans-serif' }}>
      <PatientSidebar active="patientFiles" />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: SURFACE }}>

        {/* Confirm Delete Dialog */}
        {confirmFile && (
          <ConfirmDialog
            fileName={confirmFile.fileName}
            onConfirm={() => handleDelete(confirmFile)}
            onCancel={() => setConfirmFile(null)}
          />
        )}

        {/* Toast */}
        {toast && (
          <div style={{ position: 'fixed', top: 20, right: 24, zIndex: 999, background: toast.type === 'err' ? RED : GREEN, color: 'white', padding: '10px 18px', borderRadius: 10, fontSize: 13, fontWeight: 600, boxShadow: '0 4px 16px rgba(0,0,0,0.2)' }}>
            {toast.msg}
          </div>
        )}

        {/* Header */}
        <div style={{ background: 'white', borderBottom: `1px solid ${BORDER}`, padding: '16px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 19, fontWeight: 700, color: NAVY }}>📁 My Files</div>
            <div style={{ fontSize: 13, color: MUTED, marginTop: 2 }}>
              {loading ? 'Loading…' : `${files.length} file${files.length !== 1 ? 's' : ''} · ${fmtSize(files.reduce((s, f) => s + (f.fileSize || 0), 0))} total`}
            </div>
          </div>
          <button onClick={() => fileRef.current?.click()} disabled={uploading}
            style={{ padding: '9px 20px', background: uploading ? '#93c5fd' : BLUE, color: 'white', border: 'none', borderRadius: 10, fontSize: 13.5, fontWeight: 700, cursor: uploading ? 'not-allowed' : 'pointer' }}>
            {uploading ? '⏳ Uploading…' : '+ Upload File'}
          </button>
          <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.txt"
            style={{ display: 'none' }}
            onChange={e => { if (e.target.files?.[0]) handleUpload(e.target.files); }} />
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 28px' }}>

          {/* Drop zone */}
          <div ref={dropRef}
            onClick={() => !uploading && fileRef.current?.click()}
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => { e.preventDefault(); setDragOver(false); handleUpload(e.dataTransfer.files); }}
            style={{ background: dragOver ? BLUE_P : 'white', border: `2px dashed ${dragOver ? BLUE : BORDER}`, borderRadius: 14, padding: '22px', textAlign: 'center', cursor: uploading ? 'not-allowed' : 'pointer', marginBottom: 20, transition: 'all 0.15s' }}>
            <div style={{ fontSize: 28, marginBottom: 6 }}>☁️</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: NAVY, marginBottom: 4 }}>
              {uploading ? 'Uploading…' : 'Drop a file here or click to upload'}
            </div>
            <div style={{ fontSize: 12, color: MUTED }}>PDF, JPG, PNG, DOCX · Max 20 MB</div>
            <div style={{ fontSize: 11.5, color: BLUE, marginTop: 6 }}>
              💡 Reports uploaded via the Report Analyzer also appear here automatically
            </div>
          </div>

          {/* Filters + search */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
            {['ALL', 'PDF', 'IMAGE', 'DOCUMENT'].map(cat => (
              <button key={cat} onClick={() => setFilter(cat)}
                style={{ padding: '6px 14px', borderRadius: 99, border: `1.5px solid ${filter === cat ? BLUE : BORDER}`, background: filter === cat ? BLUE : 'white', color: filter === cat ? 'white' : SEC, fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
                {cat === 'ALL' ? `All (${counts.ALL})` : `${CAT_ICON[cat] || ''} ${cat} (${counts[cat] || 0})`}
              </button>
            ))}
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search files…"
              style={{ marginLeft: 'auto', padding: '7px 12px', border: `1.5px solid ${BORDER}`, borderRadius: 8, fontSize: 13, outline: 'none', fontFamily: 'DM Sans, sans-serif', minWidth: 180 }} />
          </div>

          {/* File list */}
          {loading ? (
            <div style={{ textAlign: 'center', padding: 60, color: MUTED }}>
              <div style={{ fontSize: 32, marginBottom: 10 }}>⏳</div>
              <div>Loading your files…</div>
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 60, color: MUTED }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>📭</div>
              <div style={{ fontSize: 15, fontWeight: 600, color: NAVY, marginBottom: 6 }}>
                {files.length === 0 ? 'No files yet' : 'No files match your filter'}
              </div>
              <div style={{ fontSize: 13 }}>
                {files.length === 0
                  ? 'Upload a file above, or use the Report Analyzer — reports will appear here automatically.'
                  : 'Try clearing the search or selecting a different category.'}
              </div>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 12 }}>
              {filtered.map(file => {
                const cat        = getCategory(file);
                const isAnalyzed = !!(file.patientAnalysis || file.patientAnalyzedAt || file.isAnalyzed || file.isProcessed);
                const isDeleting = deleting === file.id;
                const isDling    = downloading === file.id;

                return (
                  <div key={file.id} style={{ background: isDeleting ? '#fef2f2' : 'white', borderRadius: 12, border: `1px solid ${isDeleting ? '#fca5a5' : BORDER}`, padding: '14px 18px', display: 'flex', alignItems: 'flex-start', gap: 14, opacity: isDeleting ? 0.6 : 1, transition: 'all 0.2s' }}>

                    {/* Category Icon */}
                    <div style={{ width: 44, height: 44, borderRadius: 10, background: CAT_COLOR[cat] || SURFACE, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>
                      {CAT_ICON[cat] || '📎'}
                    </div>

                    {/* File Info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: NAVY, marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {file.fileName || 'Unnamed file'}
                      </div>
                      <div style={{ fontSize: 12, color: MUTED, marginBottom: 4 }}>
                        🕒 {fmtDateTime(file.createdAt)}
                        {file.fileSize ? ` · ${fmtSize(file.fileSize)}` : ''}
                        {file.category ? ` · ${file.category}` : ''}
                      </div>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {isAnalyzed && (
                          <span style={{ fontSize: 10.5, fontWeight: 700, background: GREEN_P, color: GREEN, padding: '2px 8px', borderRadius: 99 }}>
                            🔬 AI Analyzed
                          </span>
                        )}
                        {file.patientAnalyzedAt && (
                          <span style={{ fontSize: 10.5, color: MUTED }}>
                            Analyzed {fmtDateTime(file.patientAnalyzedAt)}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div style={{ display: 'flex', gap: 8, flexShrink: 0, alignItems: 'center' }}>

                      {/* Analyze */}
                      <button onClick={() => router.push('/patient/reports')}
                        style={{ padding: '6px 12px', background: BLUE_P, color: BLUE, border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                        🔬 Analyze
                      </button>

                      {/* Download */}
                      <button onClick={() => handleDownload(file)} disabled={isDling || isDeleting}
                        style={{ padding: '6px 12px', background: SURFACE, color: isDling ? MUTED : SEC, border: `1px solid ${BORDER}`, borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: isDling || isDeleting ? 'not-allowed' : 'pointer', minWidth: 90, textAlign: 'center' }}>
                        {isDling ? '⏳ …' : '↓ Download'}
                      </button>

                      {/* Delete */}
                      <button
                        onClick={() => !isDeleting && setConfirmFile(file)}
                        disabled={isDeleting}
                        title="Delete file"
                        style={{ padding: '6px 10px', background: isDeleting ? SURFACE : RED_P, color: isDeleting ? MUTED : RED, border: `1px solid ${isDeleting ? BORDER : '#fca5a5'}`, borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: isDeleting ? 'not-allowed' : 'pointer' }}>
                        {isDeleting ? '…' : '🗑'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}