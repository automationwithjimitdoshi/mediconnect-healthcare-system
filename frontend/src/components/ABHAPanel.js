'use client';
import { useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL || 'process.env.NEXT_PUBLIC_API_URL ? process.env.NEXT_PUBLIC_API_URL : (process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api")';

export default function ABHAPanel({ patientId }) {
  const [abhaId,  setAbhaId]  = useState('');
  const [loading, setLoading] = useState(false);
  const [result,  setResult]  = useState(null);
  const [error,   setError]   = useState('');
  const [open,    setOpen]    = useState(false);

  const token = () => localStorage.getItem('mc_token') || '';

  async function handleFetch() {
    if (!abhaId.trim()) return;
    setLoading(true); setError('');
    try {
      const r = await fetch(`${API}/abha/fetch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ abhaId: abhaId.trim(), patientId })
      });
      const d = await r.json();
      if (r.ok) setResult(d.data);
      else setError(d.error || 'Failed to fetch ABHA data');
    } catch { setError('Network error'); }
    setLoading(false);
  }

  const C = { blue: '#2563eb', red: '#dc2626', green: '#16a34a', border: '#e2e8f0', muted: '#64748b', bg: '#f8fafc' };

  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden', marginBottom: 16 }}>
      {/* Header — always visible */}
      <div
        onClick={() => setOpen(!open)}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 16px', background: '#eff6ff', cursor: 'pointer' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 20 }}>🏛️</span>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.blue }}>ABDM / ABHA History</div>
            <div style={{ fontSize: 11, color: C.muted }}>Pull national health records with one tap</div>
          </div>
        </div>
        <span style={{ fontSize: 16, color: C.blue }}>{open ? '▲' : '▼'}</span>
      </div>

      {open && (
        <div style={{ padding: 16, background: 'white' }}>
          {!result ? (
            <>
              <div style={{ fontSize: 12, color: C.muted, marginBottom: 10 }}>
                Enter the patient's 14-digit ABHA ID to fetch their complete health history from all hospitals across India.
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  value={abhaId}
                  onChange={e => setAbhaId(e.target.value)}
                  placeholder="e.g. 91-1234-5678-9012"
                  style={{ flex: 1, padding: '9px 12px', border: `1px solid ${C.border}`,
                    borderRadius: 8, fontSize: 13, outline: 'none' }}
                />
                <button
                  onClick={handleFetch}
                  disabled={loading || !abhaId.trim()}
                  style={{ background: C.blue, color: 'white', border: 'none',
                    padding: '9px 18px', borderRadius: 8, fontSize: 13,
                    fontWeight: 600, cursor: loading ? 'wait' : 'pointer',
                    opacity: loading || !abhaId.trim() ? 0.6 : 1 }}>
                  {loading ? 'Fetching…' : '⚡ One-Click Fetch'}
                </button>
              </div>
              {error && <div style={{ fontSize: 12, color: C.red, marginTop: 8 }}>⚠ {error}</div>}
            </>
          ) : (
            <div>
              {/* AI Summary */}
              <div style={{ background: '#eff6ff', borderRadius: 10, padding: '12px 14px', marginBottom: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.blue, marginBottom: 6 }}>
                  🧠 AI Summary — ABHA: {result.abhaId}
                </div>
                <div style={{ fontSize: 13, color: '#1e3a5f', lineHeight: 1.5 }}>{result.summary}</div>
                {result.aiInsight && (
                  <div style={{ fontSize: 12, color: C.blue, marginTop: 8, fontStyle: 'italic' }}>
                    💡 {result.aiInsight}
                  </div>
                )}
              </div>

              {/* Red flags */}
              {result.redFlags?.length > 0 && (
                <div style={{ background: '#fef2f2', border: `1px solid #fca5a5`, borderRadius: 8, padding: '10px 14px', marginBottom: 10 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: C.red, marginBottom: 4 }}>⚠ Red Flags</div>
                  {result.redFlags.map((f, i) => <div key={i} style={{ fontSize: 12, color: '#7f1d1d' }}>• {f}</div>)}
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {[
                  { label: '🏥 Previous Hospitals',   items: result.previousHospitals   },
                  { label: '🩺 Key Diagnoses',         items: result.keyDiagnoses        },
                  { label: '💊 Past Medications',      items: result.previousMedications },
                  { label: '⚕️ Recent Procedures',    items: result.recentProcedures    },
                ].map(section => section.items?.length > 0 && (
                  <div key={section.label} style={{ background: C.bg, borderRadius: 8, padding: 10 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#475569', marginBottom: 6 }}>{section.label}</div>
                    {section.items.map((item, i) => (
                      <div key={i} style={{ fontSize: 12, color: '#334155', marginBottom: 3 }}>• {item}</div>
                    ))}
                  </div>
                ))}
              </div>

              <button onClick={() => { setResult(null); setAbhaId(''); }}
                style={{ marginTop: 12, fontSize: 12, color: C.muted, background: 'none',
                  border: `1px solid ${C.border}`, padding: '5px 12px', borderRadius: 6, cursor: 'pointer' }}>
                ↩ Search Another ABHA ID
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}


