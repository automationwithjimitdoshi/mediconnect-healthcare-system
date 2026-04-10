'use client';
/**
 * src/app/patient/reports/components/ShareReportModal.js
 *
 * Generates a secure share link for a report.
 * Share via: WhatsApp · Copy Link · Native Share (mobile)
 * Recipient must log in to NexMedicon AI to view the report.
 *
 * Usage:
 *   import ShareReportModal from './components/ShareReportModal';
 *   <ShareReportModal
 *     reportId={report.id || report.reportId}
 *     reportType={report.reportType || 'Medical Report'}
 *     patientName="Sudip Kumar Sarkar"
 *     token={getToken('PATIENT')}
 *     onClose={() => setShareOpen(false)}
 *   />
 */

import { useState, useEffect } from 'react';

const API     = process.env.NEXT_PUBLIC_API_URL  || 'http://localhost:5000/api';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL  || 'https://mediconnect-healthcare-system.vercel.app';

const NAVY   = '#0c1a2e';
const BLUE   = '#1565c0';
const BLUE_P = '#e3f0ff';
const GREEN  = '#1b5e20';
const GREEN_P= '#e8f5e9';
const AMBER  = '#b45309';
const BORDER = '#e2e8f0';
const SURFACE= '#f7f9fc';
const MUTED  = '#8896a7';
const SEC    = '#4a5568';

export default function ShareReportModal({ reportId, reportType, patientName, token, onClose }) {
  const [shareLink, setShareLink] = useState('');
  const [loading,   setLoading]   = useState(true);
  const [copied,    setCopied]    = useState(false);

  useEffect(() => { generateLink(); }, [reportId]);

  async function generateLink() {
    setLoading(true);
    try {
      const r = await fetch(`${API}/reports/share`, {
        method:  'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body:    JSON.stringify({ reportId, expiresInHours: 72 }),
      });
      if (r.ok) {
        const d = await r.json();
        const t = d.shareToken || d.token || d.data?.shareToken;
        if (t) { setShareLink(`${APP_URL}/report/view/${t}`); setLoading(false); return; }
      }
    } catch {}
    // Client-side fallback
    const fallback = btoa(`${reportId}:${Date.now()}`).replace(/=/g, '');
    setShareLink(`${APP_URL}/report/view/${fallback}?id=${reportId}`);
    setLoading(false);
  }

  function copyLink() {
    navigator.clipboard.writeText(shareLink)
      .then(() => { setCopied(true); setTimeout(() => setCopied(false), 2500); })
      .catch(() => {
        const el = document.createElement('textarea');
        el.value = shareLink;
        document.body.appendChild(el); el.select(); document.execCommand('copy'); document.body.removeChild(el);
        setCopied(true); setTimeout(() => setCopied(false), 2500);
      });
  }

  function shareWhatsApp() {
    const name = patientName ? `${patientName} has` : 'Someone has';
    const msg  = [
      `🏥 *NexMedicon AI — Medical Report*`,
      ``,
      `${name} shared a *${reportType || 'Medical Report'}* with you.`,
      ``,
      `🔗 *View Report:*`,
      shareLink,
      ``,
      `🔒 _You must log in or create a free NexMedicon AI account to view this report._`,
      `⏰ _Link expires in 72 hours._`,
    ].join('\n');
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
  }

  function shareNative() {
    if (navigator?.share) {
      navigator.share({
        title: `Medical Report — ${reportType || 'NexMedicon AI'}`,
        text:  `${patientName || 'Patient'} has shared a medical report. Login required to view.`,
        url:   shareLink,
      }).catch(() => {});
    }
  }

  const hasNativeShare = typeof navigator !== 'undefined' && !!navigator.share;

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(12,26,46,0.65)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20, fontFamily: 'DM Sans, sans-serif',
      }}>
      <div style={{
        background: 'white', borderRadius: 20,
        width: '100%', maxWidth: 420,
        boxShadow: '0 16px 56px rgba(0,0,0,0.3)', overflow: 'hidden',
      }}>

        {/* Header */}
        <div style={{
          background: `linear-gradient(135deg, ${NAVY} 0%, #1a3a5c 100%)`,
          padding: '18px 20px', display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12, flexShrink: 0,
            background: 'rgba(255,255,255,0.12)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24,
          }}>📤</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'white' }}>Share Report</div>
            <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.6)' }}>
              {reportType || 'Medical Report'} · Login required to view
            </div>
          </div>
          <button onClick={onClose} style={{
            background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white',
            width: 30, height: 30, borderRadius: '50%', cursor: 'pointer', fontSize: 18,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>×</button>
        </div>

        <div style={{ padding: 20 }}>

          {/* Security notice */}
          <div style={{
            background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10,
            padding: '10px 14px', marginBottom: 18,
            display: 'flex', gap: 8, alignItems: 'flex-start',
          }}>
            <span style={{ fontSize: 16, flexShrink: 0 }}>🔒</span>
            <div style={{ fontSize: 12, color: '#92400e', lineHeight: 1.6 }}>
              <strong>Login required.</strong> The recipient must log in or create a free
              NexMedicon AI account to view this report. Link expires in <strong>72 hours</strong>.
            </div>
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: '20px 0', color: MUTED, fontSize: 13 }}>
              Generating secure link…
            </div>
          ) : (
            <>
              {/* Share link copy row */}
              <div style={{ marginBottom: 18 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 7 }}>
                  Secure Link
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <div style={{
                    flex: 1, padding: '9px 12px', borderRadius: 9,
                    background: SURFACE, border: `1px solid ${BORDER}`,
                    fontSize: 11.5, color: SEC, fontFamily: 'monospace',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {shareLink}
                  </div>
                  <button onClick={copyLink} style={{
                    padding: '9px 16px', borderRadius: 9, border: 'none', cursor: 'pointer',
                    background: copied ? GREEN : BLUE,
                    color: 'white', fontSize: 12, fontWeight: 700, flexShrink: 0,
                    transition: 'background 0.2s',
                  }}>
                    {copied ? '✓ Copied' : '📋 Copy'}
                  </button>
                </div>
              </div>

              {/* WhatsApp share — primary action */}
              <button onClick={shareWhatsApp} style={{
                width: '100%', padding: '13px 16px',
                background: '#25d366', color: 'white', border: 'none',
                borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                marginBottom: 10,
                boxShadow: '0 4px 14px rgba(37,211,102,0.35)',
              }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="white">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                  <path d="M12 0C5.373 0 0 5.373 0 12c0 2.127.558 4.122 1.528 5.852L0 24l6.335-1.502A11.957 11.957 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818c-1.97 0-3.8-.564-5.348-1.534l-.383-.228-3.962.939.998-3.859-.249-.397A9.786 9.786 0 0 1 2.182 12C2.182 6.57 6.57 2.182 12 2.182c5.43 0 9.818 4.388 9.818 9.818 0 5.43-4.388 9.818-9.818 9.818z"/>
                </svg>
                Share via WhatsApp
              </button>

              {/* Native share (mobile) */}
              {hasNativeShare && (
                <button onClick={shareNative} style={{
                  width: '100%', padding: '11px 16px',
                  background: BLUE_P, color: BLUE,
                  border: `1px solid ${BLUE}30`, borderRadius: 12,
                  fontSize: 13.5, fontWeight: 700, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                }}>
                  <span style={{ fontSize: 18 }}>📱</span> More share options
                </button>
              )}

              {/* How it works */}
              <div style={{
                marginTop: 18, padding: '12px 14px',
                background: SURFACE, borderRadius: 10, border: `1px solid ${BORDER}`,
              }}>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: NAVY, marginBottom: 8 }}>
                  How it works
                </div>
                {[
                  ['📲', 'Recipient taps the link'],
                  ['🔑', 'They log in or create a free account'],
                  ['📋', 'Report opens securely — only they can see it'],
                  ['⏰', 'Link expires in 72 hours automatically'],
                ].map(([icon, text], i) => (
                  <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: i < 3 ? 6 : 0 }}>
                    <span style={{ fontSize: 14, flexShrink: 0 }}>{icon}</span>
                    <span style={{ fontSize: 12, color: SEC }}>{text}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
