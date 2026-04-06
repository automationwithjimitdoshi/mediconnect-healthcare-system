'use client';
import { useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL || 'process.env.NEXT_PUBLIC_API_URL ? process.env.NEXT_PUBLIC_API_URL : (process.env.NEXT_PUBLIC_API_URL || (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api'))';

const PROB_COLOR = {
  HIGH:     { bg: '#dcfce7', text: '#15803d', border: '#86efac' },
  MODERATE: { bg: '#fef9c3', text: '#854d0e', border: '#fde047' },
  LOW:      { bg: '#f1f5f9', text: '#475569', border: '#cbd5e1' },
};

const URG_COLOR = {
  HIGH:     '#dc2626',
  MODERATE: '#f97316',
  LOW:      '#16a34a',
};

export default function DDxSidebar({ roomId }) {
  const [ddx,     setDDx]     = useState(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');
  const [open,    setOpen]    = useState(true);
  const [expanded, setExpanded] = useState(null);

  const token = () => localStorage.getItem('mc_token') || '';

  async function runDDx() {
    setLoading(true); setError('');
    try {
      const r = await fetch(`${API}/chat/rooms/${roomId}/ddx`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` }
      });
      const d = await r.json();
      if (r.ok) setDDx(d.data);
      else setError(d.error || 'DDx generation failed');
    } catch { setError('Network error'); }
    setLoading(false);
  }

  const C = { blue: '#2563eb', border: '#e2e8f0', muted: '#64748b', navy: '#0f172a' };

  return (
    <div style={{ width: 300, borderLeft: `1px solid ${C.border}`, background: '#fafafa',
      display: 'flex', flexDirection: 'column', flexShrink: 0 }}>

      {/* Header */}
      <div style={{ padding: '12px 14px', borderBottom: `1px solid ${C.border}`,
        background: 'white', cursor: 'pointer' }} onClick={() => setOpen(!open)}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.navy }}>🩺 DDx Engine</div>
            <div style={{ fontSize: 10, color: C.muted }}>Differential Diagnosis AI</div>
          </div>
          <span style={{ color: C.muted }}>{open ? '◀' : '▶'}</span>
        </div>
      </div>

      {open && (
        <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
          {!ddx ? (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <div style={{ fontSize: 32, marginBottom: 10 }}>🔬</div>
              <div style={{ fontSize: 12, color: C.muted, marginBottom: 14, lineHeight: 1.5 }}>
                Analyze the chat history + lab reports to generate a differential diagnosis.
              </div>
              <button
                onClick={runDDx}
                disabled={loading}
                style={{ background: C.blue, color: 'white', border: 'none',
                  padding: '10px 16px', borderRadius: 9, fontSize: 13,
                  fontWeight: 600, cursor: loading ? 'wait' : 'pointer',
                  width: '100%', opacity: loading ? 0.7 : 1 }}>
                {loading ? '⏳ Analyzing…' : '⚡ Run DDx Analysis'}
              </button>
              {error && <div style={{ fontSize: 11, color: '#dc2626', marginTop: 8 }}>⚠ {error}</div>}
            </div>
          ) : (
            <div>
              {/* Symptom clusters */}
              {ddx.keySymptomClusters?.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: C.muted,
                    textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
                    Symptom Clusters
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {ddx.keySymptomClusters.map((s, i) => (
                      <span key={i} style={{ background: '#eff6ff', color: C.blue,
                        padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 500 }}>
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Top diagnoses */}
              <div style={{ fontSize: 10, fontWeight: 700, color: C.muted,
                textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
                Likely Conditions
              </div>

              {ddx.topDiagnoses?.map((dx, i) => {
                const prob   = PROB_COLOR[dx.probability] || PROB_COLOR.LOW;
                const isOpen = expanded === i;
                return (
                  <div key={i} style={{ border: `1px solid ${prob.border}`, borderRadius: 10,
                    marginBottom: 8, overflow: 'hidden' }}>
                    <div
                      onClick={() => setExpanded(isOpen ? null : i)}
                      style={{ padding: '10px 12px', background: prob.bg, cursor: 'pointer',
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: prob.text }}>
                          #{dx.rank} {dx.condition}
                        </div>
                        <div style={{ display: 'flex', gap: 6, marginTop: 3 }}>
                          <span style={{ fontSize: 10, fontWeight: 600, color: prob.text }}>
                            {dx.probability}
                          </span>
                          {dx.urgency && (
                            <span style={{ fontSize: 10, color: URG_COLOR[dx.urgency] || '#64748b' }}>
                              ● {dx.urgency} urgency
                            </span>
                          )}
                        </div>
                      </div>
                      <span style={{ fontSize: 14, color: prob.text }}>{isOpen ? '▲' : '▼'}</span>
                    </div>

                    {isOpen && (
                      <div style={{ padding: '10px 12px', background: 'white', fontSize: 11 }}>
                        {dx.supportingEvidence?.length > 0 && (
                          <div style={{ marginBottom: 8 }}>
                            <div style={{ fontWeight: 600, color: '#15803d', marginBottom: 3 }}>✓ Supporting</div>
                            {dx.supportingEvidence.map((e, j) => (
                              <div key={j} style={{ color: '#166534', marginBottom: 2 }}>• {e}</div>
                            ))}
                          </div>
                        )}
                        {dx.againstEvidence?.length > 0 && (
                          <div style={{ marginBottom: 8 }}>
                            <div style={{ fontWeight: 600, color: '#dc2626', marginBottom: 3 }}>✗ Against</div>
                            {dx.againstEvidence.map((e, j) => (
                              <div key={j} style={{ color: '#991b1b', marginBottom: 2 }}>• {e}</div>
                            ))}
                          </div>
                        )}
                        {dx.suggestedTests?.length > 0 && (
                          <div style={{ background: '#f0f9ff', borderRadius: 6, padding: '6px 8px' }}>
                            <div style={{ fontWeight: 600, color: C.blue, marginBottom: 3 }}>📋 Order</div>
                            {dx.suggestedTests.map((t, j) => (
                              <div key={j} style={{ color: '#1e40af' }}>• {t}</div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Critical to exclude */}
              {ddx.criticalToExclude?.length > 0 && (
                <div style={{ background: '#fef2f2', border: '1px solid #fca5a5',
                  borderRadius: 8, padding: '8px 10px', marginBottom: 10 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#dc2626', marginBottom: 4 }}>
                    ⚠ MUST EXCLUDE
                  </div>
                  {ddx.criticalToExclude.map((c, i) => (
                    <div key={i} style={{ fontSize: 11, color: '#7f1d1d', marginBottom: 2 }}>• {c}</div>
                  ))}
                </div>
              )}

              {/* Clinical pearl */}
              {ddx.clinicalPearl && (
                <div style={{ background: '#fefce8', border: '1px solid #fde68a',
                  borderRadius: 8, padding: '8px 10px', marginBottom: 10 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#92400e', marginBottom: 4 }}>
                    💡 Clinical Pearl
                  </div>
                  <div style={{ fontSize: 11, color: '#78350f', lineHeight: 1.5 }}>{ddx.clinicalPearl}</div>
                </div>
              )}

              {/* Disclaimer */}
              <div style={{ fontSize: 10, color: C.muted, fontStyle: 'italic', lineHeight: 1.4, marginBottom: 8 }}>
                {ddx.disclaimer}
              </div>

              <button onClick={() => setDDx(null)}
                style={{ width: '100%', padding: '8px', background: 'white',
                  border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12,
                  color: C.muted, cursor: 'pointer' }}>
                ↩ Re-run Analysis
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}


