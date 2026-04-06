// src/app/doctor/chat/AIFileAnalysis.js
// Drop this component into the doctor chat page
// Import it: import AIFileAnalysis from './AIFileAnalysis';

'use client';
import { useState, useEffect } from 'react';

const NAVY  = '#0c1a2e';
const BLUE  = '#1565c0';
const BLUE_PALE = '#e3f0ff';
const RED   = '#c62828';
const RED_PALE  = '#fdecea';
const AMBER = '#b45309';
const AMBER_PALE = '#fff3e0';
const GREEN = '#1b5e20';
const GREEN_PALE = '#e8f5e9';
const BORDER = '#e2e8f0';
const SURFACE = '#f7f9fc';
const TEXT_MUTED = '#8896a7';

const urgencyConfig = {
  CRITICAL: { bg: RED_PALE,   color: RED,   label: '🚨 CRITICAL',  border: '#f5c6cb' },
  HIGH:     { bg: AMBER_PALE, color: AMBER, label: '⚠ HIGH',       border: '#fde68a' },
  MEDIUM:   { bg: BLUE_PALE,  color: BLUE,  label: '📋 MEDIUM',    border: BLUE+'40' },
  LOW:      { bg: GREEN_PALE, color: GREEN, label: '✓ LOW',         border: GREEN+'40' },
  PENDING:  { bg: SURFACE,    color: TEXT_MUTED, label: '⏳ PROCESSING', border: BORDER },
};

export default function AIFileAnalysis({ fileId, fileName, onClose }) {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const [polling, setPolling] = useState(false);

  useEffect(() => {
    if (!fileId) return;
    fetchAnalysis();
  }, [fileId]);

  async function fetchAnalysis() {
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem('mc_token');
      const res = await fetch(`process.env.NEXT_PUBLIC_API_URL ? process.env.NEXT_PUBLIC_API_URL : (process.env.NEXT_PUBLIC_API_URL || (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api'))/files/${fileId}/analysis`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Failed to load analysis');
      const d = await res.json();
      setData(d);

      // If still processing, poll every 4 seconds
      if (d.aiStatus === 'PROCESSING') {
        setPolling(true);
        setTimeout(fetchAnalysis, 4000);
      } else {
        setPolling(false);
      }
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  }

  const urgency = urgencyConfig[data?.urgencyLevel] || urgencyConfig.PENDING;
  const analysis = data?.analysis;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(12,26,46,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, fontFamily: 'DM Sans, sans-serif' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>

      <div style={{ background: 'white', borderRadius: 16, width: 620, maxWidth: '95vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 8px 40px rgba(0,0,0,0.25)', overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ background: NAVY, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#4ade80' }} />
              <span style={{ fontSize: 10, fontFamily: 'monospace', color: 'rgba(255,255,255,0.5)', letterSpacing: '0.1em' }}>AI MEDICAL BRAIN · DOCUMENT ANALYSIS · DOCTOR ONLY</span>
            </div>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'white' }}>{fileName}</div>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
            {data?.urgencyLevel && data.urgencyLevel !== 'PENDING' && (
              <span style={{ padding: '4px 12px', borderRadius: 99, fontSize: 12, fontWeight: 600, background: urgency.bg, color: urgency.color, border: '1px solid ' + urgency.border }}>
                {urgency.label}
              </span>
            )}
            <button onClick={onClose}
              style={{ border: 'none', background: 'rgba(255,255,255,0.1)', color: 'white', width: 28, height: 28, borderRadius: '50%', cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              ×
            </button>
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>

          {loading && (
            <div style={{ textAlign: 'center', padding: 48, color: TEXT_MUTED }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>🧠</div>
              <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 6 }}>
                {polling ? 'AI is analysing this document...' : 'Loading analysis...'}
              </div>
              <div style={{ fontSize: 12 }}>This usually takes 10-20 seconds</div>
            </div>
          )}

          {error && (
            <div style={{ background: RED_PALE, border: '1px solid #f5c6cb', borderRadius: 10, padding: 16, color: RED, fontSize: 13 }}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Analysis unavailable</div>
              <div>{error}</div>
              <button onClick={fetchAnalysis} style={{ marginTop: 10, padding: '6px 14px', background: RED, color: 'white', border: 'none', borderRadius: 8, fontSize: 12, cursor: 'pointer' }}>Retry</button>
            </div>
          )}

          {!loading && data && (
            <div>

              {/* Still processing */}
              {data.aiStatus === 'PROCESSING' && (
                <div style={{ background: AMBER_PALE, border: '1px solid ' + AMBER + '40', borderRadius: 10, padding: '12px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 18 }}>⏳</span>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: AMBER }}>AI analysis in progress...</div>
                    <div style={{ fontSize: 11, color: TEXT_MUTED }}>Refreshing automatically every 4 seconds</div>
                  </div>
                </div>
              )}

              {/* Brief summary */}
              {data.briefSummary && (
                <div style={{ background: NAVY, borderRadius: 12, padding: 16, color: 'white', marginBottom: 16 }}>
                  <div style={{ fontSize: 10, fontFamily: 'monospace', opacity: 0.5, letterSpacing: '0.1em', marginBottom: 8 }}>QUICK BRIEF</div>
                  <div style={{ fontSize: 14, lineHeight: 1.65, opacity: 0.95 }}>{data.briefSummary}</div>
                </div>
              )}

              {/* Full analysis */}
              {analysis && (
                <>
                  {/* Document type */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                    <span style={{ fontSize: 13, color: TEXT_MUTED }}>Document type:</span>
                    <span style={{ fontSize: 13, fontWeight: 500 }}>{analysis.documentType}</span>
                  </div>

                  {/* Urgency reason */}
                  {analysis.urgencyReason && (
                    <div style={{ background: urgency.bg, border: '1px solid ' + urgency.border, borderRadius: 10, padding: '10px 14px', marginBottom: 16, fontSize: 12, color: urgency.color }}>
                      <strong>Urgency ({data.urgencyLevel}):</strong> {analysis.urgencyReason}
                    </div>
                  )}

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>

                    {/* Key findings */}
                    <div style={{ background: SURFACE, borderRadius: 10, padding: 14 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 10, color: NAVY }}>📋 Key Findings</div>
                      {analysis.keyFindings?.length > 0 ? analysis.keyFindings.map((f, i) => (
                        <div key={i} style={{ fontSize: 12, color: '#374151', padding: '4px 0', borderBottom: '1px solid ' + BORDER, lineHeight: 1.5 }}>
                          • {f}
                        </div>
                      )) : <div style={{ fontSize: 12, color: TEXT_MUTED }}>No findings extracted</div>}
                    </div>

                    {/* Abnormal values */}
                    <div style={{ background: analysis.abnormalValues?.length > 0 ? RED_PALE : SURFACE, border: analysis.abnormalValues?.length > 0 ? '1px solid #f5c6cb' : '1px solid ' + BORDER, borderRadius: 10, padding: 14 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 10, color: analysis.abnormalValues?.length > 0 ? RED : NAVY }}>
                        {analysis.abnormalValues?.length > 0 ? '🚨 Abnormal Values' : '✓ Abnormal Values'}
                      </div>
                      {analysis.abnormalValues?.length > 0 ? analysis.abnormalValues.map((v, i) => (
                        <div key={i} style={{ fontSize: 12, color: RED, padding: '4px 0', borderBottom: '1px solid #f5c6cb', lineHeight: 1.5 }}>
                          ⚠ {v}
                        </div>
                      )) : (
                        <div style={{ fontSize: 12, color: GREEN }}>No abnormal values detected</div>
                      )}
                    </div>
                  </div>

                  {/* Clinical significance */}
                  {analysis.clinicalSignificance && (
                    <div style={{ background: BLUE_PALE, border: '1px solid ' + BLUE + '30', borderRadius: 10, padding: 14, marginBottom: 14 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: BLUE, marginBottom: 6 }}>🩺 Clinical Significance</div>
                      <div style={{ fontSize: 13, color: '#1e3a5f', lineHeight: 1.65 }}>{analysis.clinicalSignificance}</div>
                    </div>
                  )}

                  {/* Recommended actions */}
                  {analysis.recommendedActions?.length > 0 && (
                    <div style={{ background: GREEN_PALE, border: '1px solid ' + GREEN + '40', borderRadius: 10, padding: 14 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: GREEN, marginBottom: 8 }}>✅ Recommended Actions</div>
                      {analysis.recommendedActions.map((a, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '4px 0', fontSize: 12, color: '#1b4332' }}>
                          <span style={{ flexShrink: 0, fontWeight: 600 }}>{i + 1}.</span>
                          <span style={{ lineHeight: 1.5 }}>{a}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}

              {/* Doctor-only notice */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 16, padding: '8px 12px', background: '#f8f4ff', border: '1px solid #e9d5ff', borderRadius: 8 }}>
                <span style={{ fontSize: 14 }}>🔒</span>
                <span style={{ fontSize: 11, color: '#6b21a8' }}>This AI analysis is only visible to you. The patient cannot see this information.</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


