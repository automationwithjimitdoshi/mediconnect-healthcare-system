'use client';
/**
 * src/app/patient/chat/page.js — FINAL
 *
 * Download: tries static URL first (http://localhost:5000/uploads/...)
 *           then /api/files/:id/download as fallback
 * Delete:   × button always visible on own messages, works in demo AND real mode
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';

const NAVY = '#0c1a2e', BLUE = '#1565c0', BLUE_P = '#e3f0ff', RED = '#c62828', RED_P = '#fdecea',
  AMBER = '#b45309', AMBER_P = '#fff3e0', GREEN = '#1b5e20', TEAL = '#00796b', TEAL_P = '#e0f5f0',
  BORDER = '#e2e8f0', SURFACE = '#f7f9fc', MUTED = '#8896a7';
const API = 'http://localhost:5000/api';
const STATIC = 'http://localhost:5000'; // Express serves /uploads as static

const NAV = [
  { id: 'patientDashboard', label: 'Dashboard', icon: '⊞', href: '/patient' },
  { id: 'patientAppts', label: 'My Appointments', icon: '📅', href: '/patient/appointments' },
  { id: 'patientBook', label: 'Book Appointment', icon: '➕', href: '/patient/appointments/book' },
  { id: 'patientChat', label: 'Chat with Doctor', icon: '💬', href: '/patient/chat', badge: '_chat' },
  { id: 'patientFiles', label: 'My Files', icon: '📁', href: '/patient/files' },
  { id: 'patientReports', label: 'Report Analyzer', icon: '🔬', href: '/patient/reports', badge: 'FREE' },
];

const FICON = t => ({ pdf: '📄', jpg: '🖼️', jpeg: '🖼️', png: '🖼️', webp: '🖼️', dcm: '🔬', dicom: '🔬', doc: '📝', docx: '📝' }[t?.toLowerCase()] || '📎');
const FBG = t => ({ pdf: '#fff0f0', jpg: '#f0f4ff', jpeg: '#f0f4ff', png: '#f0f4ff' }[t?.toLowerCase()] || '#f5f5f5');
const fmtSz = b => { if (!b) return ''; if (b < 1024) return `${b}B`; if (b < 1048576) return `${(b / 1024).toFixed(0)}KB`; return `${(b / 1048576).toFixed(1)}MB`; };
const fmtT = iso => iso ? new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';

// No hardcoded demo messages — real data only

// ── Build download URL for a file ─────────────────────────────────────────────
// Priority: storageUrl (static, always works) > fileUrl > API endpoint
function buildDownloadUrl(file, token) {
  if (file?.storageUrl) return `${STATIC}${file.storageUrl}`;
  if (file?.fileUrl) return `${STATIC}${file.fileUrl}`;
  if (file?.id) return `${API}/files/${file.id}/download`; // needs auth header
  return null;
}

async function triggerDownload(file, tokenFn) {
  const ext = (file.storageKey || file.fileName || '').split('.').pop().toLowerCase();

  // 1. Static URL — works if Express serves /uploads as static (most setups do)
  if (file.storageUrl || file.fileUrl) {
    const staticUrl = file.storageUrl || file.fileUrl;
    const fullUrl = staticUrl.startsWith('http') ? staticUrl : `${STATIC}${staticUrl}`;
    try {
      const r = await fetch(fullUrl);
      if (r.ok) {
        const blob = await r.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = file.fileName || `file.${ext}`;
        document.body.appendChild(a); a.click();
        document.body.removeChild(a); URL.revokeObjectURL(url);
        return true;
      }
    } catch { }
  }

  // 2. Authenticated API endpoint
  if (file.id) {
    try {
      const r = await fetch(`${API}/files/${file.id}/download`, {
        headers: { Authorization: `Bearer ${tokenFn()}` },
      });
      if (r.ok) {
        const blob = await r.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = file.fileName || `file.${ext}`;
        document.body.appendChild(a); a.click();
        document.body.removeChild(a); URL.revokeObjectURL(url);
        return true;
      }
    } catch { }
  }

  return false;
}

// ── Sidebar ───────────────────────────────────────────────────────────────────
function Sidebar({ active }) {
  const router = useRouter();
  const [name, setName] = useState('Patient');
  const [ini, setIni] = useState('P');
  const [chatBadge, setChatBadge] = useState(0);
  useEffect(() => {
    const tok = localStorage.getItem('mc_token') || '';
    if (tok) {
      fetch(`${API}/chat/rooms?limit=100`, { headers: { Authorization: `Bearer ${tok}` } })
        .then(r => r.ok ? r.json() : null)
        .then(d => { const n = (d?.data || []).reduce((s, r) => s + (r.unreadCount || 0), 0); setChatBadge(n); })
        .catch(() => { });
    }
  }, []);
  useEffect(() => {
    try {
      const u = JSON.parse(localStorage.getItem('mc_user') || '{}');
      const n = u?.patient ? `${u.patient.firstName || ''} ${u.patient.lastName || ''}`.trim() : (u?.email || 'Patient');
      setName(n); setIni(n.split(' ').filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase() || 'P');
    } catch { }
  }, []);
  return (
    <div style={{ width: 220, background: NAVY, display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
      <div style={{ padding: '20px 18px 14px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 32, height: 32, background: BLUE, borderRadius: 8, position: 'relative', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ position: 'absolute', width: 14, height: 3, background: 'white', borderRadius: 2 }} />
            <div style={{ position: 'absolute', width: 3, height: 14, background: 'white', borderRadius: 2 }} />
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'white' }}>MediConnect AI</div>
            <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', fontFamily: 'monospace', letterSpacing: '0.1em' }}>PATIENT PORTAL</div>
          </div>
        </div>
      </div>
      <div style={{ margin: '10px 10px 6px', background: 'rgba(255,255,255,0.06)', borderRadius: 9, padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 30, height: 30, borderRadius: '50%', background: BLUE_P, color: BLUE, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{ini}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div suppressHydrationWarning style={{ fontSize: 12, fontWeight: 500, color: 'white', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>Patient</div>
        </div>
      </div>
      <div style={{ padding: '10px 18px 4px', fontSize: 9, color: 'rgba(255,255,255,0.25)', fontFamily: 'monospace', letterSpacing: '0.12em' }}>MY HEALTH</div>
      <div style={{ padding: '0 8px', flex: 1 }}>
        {NAV.map(item => {
          const isA = active === item.id; return (
            <button key={item.id} onClick={() => router.push(item.href)}
              style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '9px 12px', margin: '2px 0', borderRadius: 8, cursor: 'pointer', border: 'none', textAlign: 'left', background: isA ? BLUE : 'transparent', color: isA ? 'white' : 'rgba(255,255,255,0.55)', fontSize: 13, fontFamily: 'DM Sans, sans-serif', fontWeight: isA ? 500 : 400 }}>
              <span style={{ fontSize: 14 }}>{item.icon}</span>
              <span style={{ flex: 1 }}>{item.label}</span>
              {(item.badge != null && (item.badge === '_chat' ? chatBadge : item.badge) !== 0) && <span style={{ background: item.badge === 'FREE' ? '#0e7490' : '#ef4444', color: 'white', fontSize: item.badge === 'FREE' ? 9 : 10, fontWeight: 600, padding: item.badge === 'FREE' ? '2px 6px' : '1px 5px', borderRadius: 99 }}>{item.badge === '_chat' ? chatBadge : item.badge}</span>}
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
    </div>
  );
}

// ── File message bubble ───────────────────────────────────────────────────────
function FileBubble({ msg, isMe, onDelete, onDownload }) {
  const file = msg.file || msg._file || {};
  const ext = (file.storageKey || file.fileName || '').split('.').pop().toLowerCase();
  if (msg.isDeleted || msg.content === '[Message deleted]') {
    return <div style={{ padding: '8px 12px', borderRadius: 10, background: SURFACE, border: `1px solid ${BORDER}`, fontSize: 12, color: MUTED, fontStyle: 'italic' }}>🗑 File deleted</div>;
  }
  return (
    <div style={{ position: 'relative' }}>
      <div style={{ display: 'flex', gap: 10, padding: '10px 14px', borderRadius: 14, border: `1px solid ${BORDER}`, background: FBG(ext), maxWidth: 290, borderBottomRightRadius: isMe ? 4 : 14, borderBottomLeftRadius: isMe ? 14 : 4 }}>
        <div style={{ width: 36, height: 36, borderRadius: 8, background: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>{FICON(ext)}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: NAVY, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 2 }}>{file.fileName || 'File'}</div>
          <div style={{ fontSize: 10, color: MUTED, fontFamily: 'monospace', marginBottom: 6 }}>{fmtSz(file.fileSize)}</div>
          {/* ↓ Download — always visible */}
          <button onClick={() => onDownload(file)}
            style={{ padding: '4px 10px', background: BLUE, color: 'white', border: 'none', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
            ↓ Download
          </button>
          {!msg.demo && <div style={{ fontSize: 10, color: TEAL, marginTop: 4 }}>📋 Visible in Report Review</div>}
        </div>
      </div>
      {/* × Delete — ALWAYS visible on own messages */}
      {isMe && (
        <button onClick={() => onDelete(msg.id, !!msg.demo)}
          style={{ position: 'absolute', top: -8, right: -8, width: 22, height: 22, borderRadius: '50%', background: RED, color: 'white', border: '2px solid white', cursor: 'pointer', fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, boxShadow: '0 1px 4px rgba(0,0,0,0.2)', zIndex: 2 }}>
          ×
        </button>
      )}
    </div>
  );
}

// ── Text message bubble ───────────────────────────────────────────────────────
function TextBubble({ msg, isMe, onDelete }) {
  const isDeleted = msg.isDeleted || msg.content === '[Message deleted]';
  return (
    <div style={{ position: 'relative' }}>
      <div style={{ padding: '10px 14px', borderRadius: 14, fontSize: 13, lineHeight: 1.6, background: isMe ? BLUE : (msg.urgent || msg.isUrgent ? RED_P : 'white'), color: isMe ? 'white' : (msg.urgent || msg.isUrgent ? RED : NAVY), border: isMe ? 'none' : `1px solid ${msg.urgent || msg.isUrgent ? '#f5c6cb' : BORDER}`, borderBottomRightRadius: isMe ? 4 : 14, borderBottomLeftRadius: isMe ? 14 : 4, fontStyle: isDeleted ? 'italic' : undefined, opacity: isDeleted ? 0.7 : 1 }}>
        {isDeleted ? '🗑 Message deleted' : (msg.content || msg.text)}
      </div>
      {/* × Delete — ALWAYS visible on own non-deleted messages */}
      {isMe && !isDeleted && (
        <button onClick={() => onDelete(msg.id, !!msg.demo)}
          style={{ position: 'absolute', top: -8, right: -8, width: 22, height: 22, borderRadius: '50%', background: RED, color: 'white', border: '2px solid white', cursor: 'pointer', fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, boxShadow: '0 1px 4px rgba(0,0,0,0.2)', zIndex: 2 }}>
          ×
        </button>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function PatientChatPage() {
  const router = useRouter();
  const bottomRef = useRef(null);
  const fileRef = useRef(null);
  const inputRef = useRef(null);

  const [mounted, setMounted] = useState(false);
  const [rooms, setRooms] = useState([]);
  const [selRoom, setSelRoom] = useState(null);
  const [messages, setMessages] = useState([]);
  const [camModal, setCamModal] = useState(false);
  const [input, setInput] = useState('');
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState('');
  const [isDemo, setIsDemo] = useState(false);
  const [typing, setTyping] = useState(false);

  const token = useCallback(() => localStorage.getItem('mc_token') || '', []);
  const showToast = useCallback(msg => { setToast(msg); setTimeout(() => setToast(''), 3500); }, []);

  const sharedFiles = messages.filter(m => m.type === 'FILE' || m.file || m._file);
  const doctor = selRoom?.doctor || selRoom?.appointment?.doctor;
  const docName = doctor ? `Dr. ${doctor.firstName} ${doctor.lastName}` : 'Your Doctor';
  const docSpec = doctor?.specialty || 'General Practice';
  const docInit = doctor ? `${doctor.firstName?.[0] || ''}${doctor.lastName?.[0] || ''}` : 'DR';

  useEffect(() => {
    setMounted(true);
    if (!localStorage.getItem('mc_token')) { router.push('/login'); return; }
    loadRooms();
    // Refresh rooms every 30s — picks up status changes (cancel/confirm) without page reload
    const iv = setInterval(() => {
      const tok = localStorage.getItem('mc_token') || '';
      fetch(`${API}/chat/rooms`, { headers: { Authorization: `Bearer ${tok}` } })
        .then(r => r.json())
        .then(d => {
          const fresh = (d.data || d.rooms || []).filter(r => !['CANCELLED', 'NO_SHOW'].includes(r.appointment?.status));
          setRooms(fresh);
        }).catch(() => { });
    }, 30000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, typing]);

  async function loadRooms() {
    setLoading(true);
    try {
      const r = await fetch(`${API}/chat/rooms`, { headers: { Authorization: `Bearer ${token()}` } });
      if (!r.ok) throw new Error('status ' + r.status);
      const d = await r.json();
      const seen = new Set();
      // Show all non-cancelled rooms, but only CONFIRMED rooms allow messaging
      let list = (d.data || d.rooms || []).filter(room => {
        const apptSt = room.appointment?.status;
        // Hard-hide CANCELLED and NO_SHOW rooms entirely
        if (['CANCELLED', 'NO_SHOW'].includes(apptSt)) return false;
        const doc = room.doctor || room.appointment?.doctor;
        const key = doc?.id || room.id;
        if (seen.has(key)) return false;
        seen.add(key); return true;
      });

      // If no rooms found, try creating rooms for existing appointments
      if (list.length === 0) {
        try {
          const ar = await fetch(`${API}/appointments?limit=20`, { headers: { Authorization: `Bearer ${token()}` } });
          const ad = await ar.json();
          const appts = (ad.data || ad.appointments || []).filter(a =>
            ['CONFIRMED'].includes(a.status) // only allow chat after doctor confirms
          );
          // Create chat room for each appointment that doesn't have one
          for (const appt of appts) {
            try {
              await fetch(`${API}/appointments/${appt.id}/ensure-chat`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
              });
            } catch (e) { console.warn('ensure-chat:', e.message); }
          }
          // Reload rooms after creating them
          if (appts.length > 0) {
            const r2 = await fetch(`${API}/chat/rooms`, { headers: { Authorization: `Bearer ${token()}` } });
            const d2 = await r2.json();
            const seen2 = new Set();
            list = (d2.data || d2.rooms || []).filter(room => {
              const apptSt2 = room.appointment?.status;
              if (['CANCELLED', 'NO_SHOW'].includes(apptSt2)) return false;
              const key = (room.doctor || room.appointment?.doctor)?.id || room.id;
              if (seen2.has(key)) return false;
              seen2.add(key); return true;
            });
          }
        } catch (e) { console.warn('ensure-chat loop:', e.message); }
      }

      setRooms(list); setIsDemo(false);
      if (list.length > 0) {
        // Prefer a CONFIRMED room over SCHEDULED when auto-selecting
        const preferred = list.find(r => r.appointment?.status === 'CONFIRMED')
          || list.find(r => ['COMPLETED', 'RESCHEDULED'].includes(r.appointment?.status))
          || list[0];
        setSelRoom(preferred); await loadMessages(preferred.id);
      }
      // Return the list so callers can check it
      return list;
    } catch (e) { console.warn('loadRooms:', e.message); setIsDemo(false); }
    setLoading(false);
  }

  async function loadMessages(roomId) {
    activeRoomId.current = roomId;   // stamp which room we're loading for
    setMessages([]);                 // clear immediately before fetch
    try {
      const r = await fetch(`${API}/chat/rooms/${roomId}/messages`, { headers: { Authorization: `Bearer ${token()}` } });
      if (!r.ok) return;
      const d = await r.json();
      // Only update state if the user is still on the same room (prevents race)
      if (activeRoomId.current !== roomId) return;
      if (d.data) setMessages(d.data.map(m => ({ ...m, roomId, from: m.senderRole === 'PATIENT' ? 'patient' : 'doctor', text: m.content, time: fmtT(m.createdAt), _file: m.file })));
    } catch (e) { console.error('loadMessages:', e); }
  }

  async function openPatientCamera() {
    if (isLocked) { showToast('Doctor must confirm appointment before you can send photos.'); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
      streamRef2.current = stream;
      setCamModal(true);
      setTimeout(() => { if (videoRef2.current) { videoRef2.current.srcObject = stream; videoRef2.current.play().catch(() => { }); } }, 100);
    } catch (err) {
      if (err.name === 'NotAllowedError') showToast('Camera permission denied.');
      else if (err.name === 'NotFoundError') showToast('No camera found.');
      else showToast('Camera error: ' + err.message);
    }
  }
  function closePatientCamera() {
    if (streamRef2.current) { streamRef2.current.getTracks().forEach(t => t.stop()); streamRef2.current = null; }
    setCamModal(false);
  }
  async function capturePatientPhoto() {
    const video = videoRef2.current; if (!video || !selRoom) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 1280; canvas.height = video.videoHeight || 720;
    canvas.getContext('2d').drawImage(video, 0, 0);
    closePatientCamera();
    canvas.toBlob(async (blob) => {
      if (!blob) { showToast('Capture failed'); return; }
      setCamUploading(true);
      try {
        const fd = new FormData(); fd.append('files', blob, 'photo_' + Date.now() + '.jpg');
        const r = await fetch(`${API}/chat/rooms/${selRoom.id}/messages/file`, { method: 'POST', headers: { Authorization: `Bearer ${token()}` }, body: fd });
        if (r.ok) { showToast('📸 Photo shared'); loadMessages(selRoom.id); }
        else showToast('Upload failed');
      } catch { showToast('Network error'); }
      setCamUploading(false);
    }, 'image/jpeg', 0.9);
  }

  // Chat is locked if no room OR appointment not confirmed by doctor
  const freshRoom = selRoom ? (rooms.find(r => r.id === selRoom.id) || selRoom) : null;
  const apptStatus = freshRoom?.appointment?.status || 'SCHEDULED';
  const isLocked = !freshRoom
    || ['CANCELLED', 'NO_SHOW', 'SCHEDULED'].includes(apptStatus)
    || !['CONFIRMED', 'COMPLETED', 'RESCHEDULED'].includes(apptStatus);

  async function sendMessage(e) {
    if (e) e.preventDefault();
    const text = input.trim(); if (!text) return;
    if (!selRoom) { showToast('Book an appointment first to start chatting with your doctor.'); return; }
    // Re-verify appointment status live from server before every send — prevents stale cache
    try {
      const liveR = await fetch(`${API}/chat/rooms`, { headers: { Authorization: `Bearer ${token()}` } });
      const liveD = await liveR.json();
      const liveRooms = (liveD.data || liveD.rooms || []);
      const liveRoom = liveRooms.find(r => r.id === selRoom.id);
      const liveSt = liveRoom?.appointment?.status;
      if (!liveRoom || ['CANCELLED', 'NO_SHOW', 'SCHEDULED'].includes(liveSt) || !['CONFIRMED', 'COMPLETED', 'RESCHEDULED'].includes(liveSt || '')) {
        // Update local state so UI reflects the real status
        if (liveRooms.length) setRooms(liveRooms.filter(r => !['CANCELLED', 'NO_SHOW'].includes(r.appointment?.status)));
        showToast('🔒 You cannot send messages. Doctor has not confirmed or has cancelled the appointment.');
        return;
      }
    } catch {/* network error — fall through to normal check */ }
    if (isLocked) { showToast('🔒 Chat is disabled — doctor must confirm your appointment first.'); return; }
    setSending(true);
    try {
      const r = await fetch(`${API}/chat/rooms/${selRoom.id}/messages`, { method: 'POST', headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ content: text }) });
      const d = await r.json();
      if (d.success && d.data) { setMessages(p => [...p, { ...d.data, from: 'patient', text: d.data.content, time: fmtT(d.data.createdAt) }]); setInput(''); if (inputRef.current) inputRef.current.focus(); }
      else showToast('❌ ' + (d.message || 'Failed to send'));
    } catch { showToast('❌ Network error'); }
    setSending(false);
  }

  async function handleFileUpload(e) {
    const file = e.target.files?.[0]; if (!file) return; e.target.value = '';
    if (!selRoom) { showToast('Book an appointment first to send files to your doctor.'); return; }
    // Live status check — same as sendMessage
    try {
      const liveR = await fetch(`${API}/chat/rooms`, { headers: { Authorization: `Bearer ${token()}` } });
      const liveD = await liveR.json();
      const liveRoom = (liveD.data || liveD.rooms || []).find(r => r.id === selRoom.id);
      const liveSt = liveRoom?.appointment?.status;
      if (!liveRoom || !['CONFIRMED', 'COMPLETED', 'RESCHEDULED'].includes(liveSt || '')) {
        showToast('🔒 File sharing disabled — appointment is not confirmed.'); return;
      }
    } catch { }
    if (isLocked) { showToast('🔒 Chat is disabled — doctor must confirm your appointment first.'); return; }
    if (file.size > 50 * 1024 * 1024) { showToast('❌ File too large (max 50MB)'); return; }
    setUploading(true); showToast('⏳ Uploading ' + file.name + '…');
    try {
      const fd = new FormData(); fd.append('files', file); fd.append('caption', 'Shared: ' + file.name);
      const r = await fetch(`${API}/chat/rooms/${selRoom.id}/messages/file`, { method: 'POST', headers: { Authorization: `Bearer ${token()}` }, body: fd });
      const d = await r.json();
      if (d.success) {
        const msgs = (d.data || []).map(m => ({ ...m, from: 'patient', text: m.content, time: fmtT(m.createdAt), _file: m.file }));
        setMessages(p => [...p, ...msgs]);
        showToast('✅ ' + file.name + ' uploaded — visible in doctor\'s Report Review');
      } else showToast('❌ ' + d.message);
    } catch { showToast('❌ Network error'); }
    setUploading(false);
  }

  async function deleteMessage(messageId, isDemoMsg) {
    if (isDemoMsg) {
      if (!window.confirm('Remove this message?')) return;
      setMessages(p => p.map(m => m.id === messageId ? { ...m, isDeleted: true, content: '[Message deleted]', text: '[Message deleted]' } : m));
      showToast('Message removed'); return;
    }
    if (!selRoom) return;
    if (!window.confirm('Delete this message? The file stays in Report Review.')) return;
    try {
      const r = await fetch(`${API}/chat/rooms/${selRoom.id}/messages/${messageId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token()}` } });
      const d = await r.json();
      if (d.success) { setMessages(p => p.map(m => m.id === messageId ? { ...m, isDeleted: true, content: '[Message deleted]', text: '[Message deleted]' } : m)); showToast('Message deleted'); }
      else showToast('❌ ' + d.message);
    } catch { showToast('❌ Network error'); }
  }

  async function handleDownload(file) {
    if (!file.storageUrl && !file.fileUrl && !file.id) { showToast('❌ No file URL available (demo mode)'); return; }
    showToast('⏳ Downloading…');
    const ok = await triggerDownload(file, token);
    if (!ok) showToast('❌ Download failed. Ensure backend is running and /uploads is accessible.');
  }

  function handleKeyDown(e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }

  if (!mounted) return null;

  return (
    <div style={{ display: 'flex', height: '100vh', fontFamily: 'DM Sans, sans-serif', overflow: 'hidden' }}>
      <Sidebar active="patientChat" />
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* Room picker */}
        {rooms.length > 0 && (
          <div style={{ width: 220, background: 'white', borderRight: `1px solid ${BORDER}`, overflowY: 'auto', flexShrink: 0 }}>
            <div style={{ padding: '12px 14px', fontSize: 12, fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: `1px solid ${BORDER}` }}>Conversations</div>
            {rooms.map(room => {
              const doc = room.doctor || room.appointment?.doctor; const isSel = selRoom?.id === room.id; return (
                (() => {
                  const rSt = room.appointment?.status;
                  const canSelect = ['CONFIRMED', 'COMPLETED', 'RESCHEDULED'].includes(rSt);
                  return (
                    <div key={room.id}
                      onClick={() => { if (canSelect) { activeRoomId.current = room.id; setMessages([]); setSelRoom(room); loadMessages(room.id); } }}
                      style={{
                        padding: '11px 14px', borderBottom: `1px solid ${BORDER}`,
                        cursor: canSelect ? 'pointer' : 'not-allowed', opacity: canSelect ? 1 : 0.55,
                        background: isSel ? BLUE_P : 'transparent', borderLeft: `3px solid ${isSel ? BLUE : 'transparent'}`
                      }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: NAVY, marginBottom: 2 }}>{doc ? `Dr. ${doc.firstName} ${doc.lastName}` : 'Doctor'}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                        <div style={{ fontSize: 11, color: MUTED }}>{doc?.specialty || ''}</div>
                        {rSt && (
                          <span style={{
                            fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 99,
                            background: rSt === 'CONFIRMED' ? GREEN_P : rSt === 'COMPLETED' ? BLUE_P : rSt === 'SCHEDULED' ? AMBER_P : '#fdecea',
                            color: rSt === 'CONFIRMED' ? GREEN : rSt === 'COMPLETED' ? BLUE : rSt === 'SCHEDULED' ? AMBER : '#c62828'
                          }}>
                            {rSt === 'SCHEDULED' ? '⏳ Pending' : rSt}
                          </span>
                        )}
                      </div>
                      {!canSelect && rSt === 'SCHEDULED' && <div style={{ fontSize: 10, color: AMBER, marginTop: 3 }}>Awaiting doctor confirmation</div>}
                    </div>
                  );
                })()
              );
            })}
          </div>
        )}

        {/* Chat */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Header */}
          <div style={{ background: 'white', borderBottom: `1px solid ${BORDER}`, padding: '11px 20px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
            <div style={{ width: 36, height: 36, borderRadius: '50%', background: TEAL_P, color: TEAL, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, flexShrink: 0 }}>{docInit.toUpperCase()}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: NAVY }}>{docName}</div>
              <div style={{ fontSize: 11, color: TEAL }}>● {selRoom ? 'Active' : 'No active chat'} · {docSpec}</div>
            </div>
            {!selRoom && <div style={{ background: AMBER_P, border: `1px solid ${AMBER}30`, borderRadius: 8, padding: '5px 10px', fontSize: 11, color: AMBER, fontWeight: 600 }}>No active chat — book appointment first</div>}
            <button onClick={() => showToast('Video call launching…')} style={{ padding: '6px 14px', border: `1px solid ${BORDER}`, background: 'white', borderRadius: 8, fontSize: 12, cursor: 'pointer' }}>🎥 Video Call</button>
          </div>

          {/* Banner */}
          <div style={{ background: AMBER_P, borderBottom: `1px solid ${AMBER}30`, padding: '9px 20px', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
            <span>📎</span>
            <span style={{ fontSize: 12, color: AMBER, flex: 1 }}>{!selRoom ? 'Book an appointment with a doctor to activate chat and share reports.' : 'Upload lab reports — they appear in your doctor\'s Report Review instantly.'}</span>
            <button onClick={() => router.push('/patient/appointments/book')} style={{ padding: '5px 12px', border: `1px solid ${AMBER}60`, background: 'white', borderRadius: 8, fontSize: 11, cursor: 'pointer', color: AMBER, flexShrink: 0 }}>Book Appointment</button>
          </div>

          {/* Messages — paddingRight:44 so × button isn't clipped by scroll */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', paddingRight: 44, display: 'flex', flexDirection: 'column', gap: 14, background: SURFACE }}>
            {loading && <div style={{ textAlign: 'center', padding: 40, color: MUTED }}><div style={{ fontSize: 24, marginBottom: 8 }}>💬</div>Loading…</div>}
            {!loading && !selRoom && (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 40, textAlign: 'center' }}>
                <div style={{ fontSize: 56 }}>💬</div>
                <div style={{ fontWeight: 700, fontSize: 18, color: NAVY }}>No chat rooms yet</div>
                <div style={{ fontSize: 13.5, color: '#4a5568', lineHeight: 1.7, maxWidth: 340 }}>
                  Chat with your doctor becomes available after you book and confirm an appointment.
                </div>
                <button onClick={() => router.push('/patient/appointments/book')}
                  style={{ padding: '11px 28px', background: BLUE, color: 'white', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
                  📅 Book an Appointment
                </button>
              </div>
            )}
            {!loading && messages.map((msg, i) => {
              const isMe = msg.from === 'patient' || msg.senderRole === 'PATIENT';
              const isFile = msg.type === 'FILE' || !!(msg.file || msg._file);
              return (
                <div key={msg.id || i} style={{ display: 'flex', flexDirection: 'column', maxWidth: '72%', alignSelf: isMe ? 'flex-end' : 'flex-start', alignItems: isMe ? 'flex-end' : 'flex-start' }}>
                  {(msg.urgent || msg.isUrgent) && !isMe && <div style={{ fontSize: 10, color: RED, fontWeight: 700, fontFamily: 'monospace', marginBottom: 3 }}>🚨 IMPORTANT MESSAGE FROM DOCTOR</div>}
                  {isFile
                    ? <FileBubble msg={msg} isMe={isMe} onDelete={deleteMessage} onDownload={handleDownload} />
                    : <TextBubble msg={msg} isMe={isMe} onDelete={deleteMessage} />
                  }
                  <div style={{ fontSize: 10, color: MUTED, marginTop: 3, fontFamily: 'monospace' }}>{isMe ? 'You' : docName} · {msg.time}</div>
                </div>
              );
            })}
            {typing && <div style={{ alignSelf: 'flex-start', display: 'flex', gap: 8, alignItems: 'center' }}>
              <div style={{ padding: '10px 16px', background: 'white', border: `1px solid ${BORDER}`, borderRadius: 14, display: 'flex', gap: 4, alignItems: 'center' }}>
                {[0, 0.2, 0.4].map(d => <div key={d} style={{ width: 6, height: 6, borderRadius: '50%', background: MUTED, animation: `pcBounce 1.2s infinite ${d}s` }} />)}
              </div>
              <span style={{ fontSize: 11, color: MUTED }}>{docName} is typing…</span>
            </div>}
            <div ref={bottomRef} />
          </div>

          {/* Compose — hidden entirely when locked, shown when active */}
          <div style={{ background: 'white', borderTop: `1px solid ${BORDER}`, padding: '12px 20px', flexShrink: 0 }}>
            {isLocked ? (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
                background: apptStatus === 'CANCELLED' || apptStatus === 'NO_SHOW' ? RED_P : AMBER_P,
                borderRadius: 10, border: `1px solid ${apptStatus === 'CANCELLED' || apptStatus === 'NO_SHOW' ? RED + '40' : AMBER + '40'}`
              }}>
                <span style={{ fontSize: 18 }}>🔒</span>
                <span style={{ fontSize: 13, color: apptStatus === 'CANCELLED' || apptStatus === 'NO_SHOW' ? RED : AMBER, fontWeight: 500 }}>
                  {apptStatus === 'CANCELLED' || apptStatus === 'NO_SHOW'
                    ? 'This appointment was cancelled. Messaging is permanently disabled.'
                    : 'Chat unlocks after the doctor confirms your appointment.'}
                </span>
              </div>
            ) : (
              <>
                {uploading && <div style={{ fontSize: 12, color: BLUE, marginBottom: 8 }}>⏳ Uploading…</div>}
                <form onSubmit={sendMessage} style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                  <input type="file" ref={fileRef} onChange={handleFileUpload} style={{ display: 'none' }} accept=".pdf,.jpg,.jpeg,.png,.webp,.dcm,.doc,.docx" />
                  <button type="button" onClick={() => fileRef.current?.click()} title="Attach medical file"
                    style={{ width: 38, height: 38, borderRadius: 10, border: `1px solid ${BORDER}`, background: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 18, flexShrink: 0 }}>
                    {uploading ? '⏳' : '📎'}
                  </button>
                  <button type="button" onClick={openPatientCamera} title="Take photo"
                    style={{ width: 38, height: 38, borderRadius: 10, border: `1px solid ${BORDER}`, background: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 18, flexShrink: 0 }}>
                    {camUploading ? '⏳' : '📷'}
                  </button>
                  <textarea ref={inputRef} value={input} onChange={e => setInput(e.target.value)} onKeyDown={handleKeyDown}
                    placeholder={`Message ${docName}… (Enter to send)`}
                    rows={1} style={{ flex: 1, border: `1px solid ${BORDER}`, borderRadius: 12, padding: '9px 14px', fontSize: 13, resize: 'none', outline: 'none', fontFamily: 'DM Sans, sans-serif', minHeight: 38, maxHeight: 120 }} />
                  <button type="submit" disabled={!input.trim() || sending}
                    style={{ padding: '0 22px', height: 38, background: input.trim() && !sending ? BLUE : '#90a4ae', color: 'white', border: 'none', borderRadius: 12, fontSize: 13, fontWeight: 600, cursor: input.trim() && !sending ? 'pointer' : 'default', flexShrink: 0 }}>
                    {sending ? '…' : 'Send'}
                  </button>
                </form>
              </>
            )}
          </div>
        </div>

        {/* Right panel */}
        <div style={{ width: 260, flexShrink: 0, background: 'white', borderLeft: `1px solid ${BORDER}`, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: 14, borderBottom: `1px solid ${BORDER}` }}>
            <div style={{ background: NAVY, borderRadius: 12, padding: 14, color: 'white' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}><div style={{ width: 7, height: 7, borderRadius: '50%', background: '#4ade80' }} /><span style={{ fontSize: 9, fontFamily: 'monospace', opacity: 0.5, letterSpacing: '0.1em' }}>AI HEALTH SUMMARY</span></div>
              <div style={{ fontSize: 11, lineHeight: 1.65, opacity: 0.92 }}>{'Upload your lab reports via the Report Analyzer to build your AI health summary.'}</div>
            </div>
          </div>
          <div style={{ padding: 14, flex: 1 }}>
            <div style={{ fontSize: 10, fontFamily: 'monospace', color: MUTED, letterSpacing: '0.08em', marginBottom: 10 }}>SHARED FILES ({sharedFiles.length})</div>
            {sharedFiles.length === 0 && <div style={{ fontSize: 12, color: MUTED, textAlign: 'center', padding: '20px 0' }}><div style={{ fontSize: 24, marginBottom: 8 }}>📁</div>No files yet.</div>}
            {sharedFiles.slice().reverse().map((m, i) => {
              const file = m.file || m._file; if (!file) return null;
              const ext = (file.storageKey || file.fileName || '').split('.').pop().toLowerCase();
              return (
                <div key={i} style={{ display: 'flex', gap: 8, padding: '8px 0', borderBottom: `1px solid ${BORDER}` }}>
                  <div style={{ width: 28, height: 28, borderRadius: 7, background: FBG(ext), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, flexShrink: 0 }}>{FICON(ext)}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: NAVY, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.fileName}</div>
                    <div style={{ fontSize: 10, color: MUTED }}>{fmtSz(file.fileSize)}</div>
                    <button onClick={() => handleDownload(file)}
                      style={{ fontSize: 10, color: BLUE, fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginTop: 2 }}>↓ Download</button>
                  </div>
                </div>
              );
            })}
            <button type="button" onClick={() => fileRef.current?.click()}
              style={{ width: '100%', marginTop: 10, padding: '9px 0', border: `2px dashed ${BORDER}`, borderRadius: 10, background: 'none', cursor: 'pointer', fontSize: 12, color: MUTED, fontFamily: 'DM Sans, sans-serif' }}>
              📎 Upload a report
            </button>
          </div>
          <div style={{ padding: 14, borderTop: `1px solid ${BORDER}` }}>
            <div style={{ fontSize: 10, fontFamily: 'monospace', color: MUTED, letterSpacing: '0.08em', marginBottom: 10 }}>UPCOMING APPOINTMENTS</div>
            {selRoom?.appointment ? <div style={{ background: BLUE_P, borderRadius: 10, padding: '10px 12px', marginBottom: 10 }}><div style={{ fontSize: 12, fontWeight: 600, color: BLUE }}>{docName}</div><div style={{ fontSize: 10, color: MUTED, fontFamily: 'monospace', marginTop: 2 }}>{selRoom.appointment.scheduledAt ? new Date(selRoom.appointment.scheduledAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Scheduled'}</div></div> : <div style={{ fontSize: 12, color: MUTED, marginBottom: 10 }}>No upcoming appointments</div>}
            <button onClick={() => router.push('/patient/appointments/book')} style={{ width: '100%', padding: '9px 0', background: BLUE, color: 'white', border: 'none', borderRadius: 10, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>+ Book Appointment</button>
          </div>
        </div>
      </div>

      {/* Patient Camera Modal */}
      {camModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', zIndex: 800, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
          <div style={{ fontSize: 14, color: 'white', fontWeight: 600 }}>📷 Position and tap Capture</div>
          <video ref={videoRef2} autoPlay playsInline muted style={{ width: 'min(90vw,640px)', height: 'auto', borderRadius: 12, border: '3px solid white', background: '#000' }} />
          <div style={{ display: 'flex', gap: 16 }}>
            <button onClick={capturePatientPhoto} style={{ padding: '12px 32px', background: 'white', color: '#0c1a2e', border: 'none', borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>📸 Capture & Send</button>
            <button onClick={closePatientCamera} style={{ padding: '12px 24px', background: 'rgba(255,255,255,0.15)', color: 'white', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 10, fontSize: 15, fontWeight: 600, cursor: 'pointer' }}>✕ Cancel</button>
          </div>
        </div>
      )}

      {toast && <div style={{ position: 'fixed', bottom: 24, right: 24, background: NAVY, color: 'white', padding: '12px 20px', borderRadius: 12, fontSize: 13, zIndex: 9999, boxShadow: '0 4px 20px rgba(0,0,0,0.2)', maxWidth: 400, lineHeight: 1.5 }}>{toast}</div>}
      <style>{`@keyframes pcBounce{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}`}</style>
    </div>
  );
}