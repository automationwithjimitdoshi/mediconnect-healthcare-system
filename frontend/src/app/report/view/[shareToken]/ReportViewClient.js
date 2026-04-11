'use client';
/**
 * src/app/report/view/[shareToken]/ReportViewClient.js
 *
 * Client-side report viewer. Receives shareToken as a prop from the
 * server component page.js (which handles Open Graph meta tags for WhatsApp).
 */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getToken, getUser } from '@/lib/auth';

const API     = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://mediconnect-healthcare-system.vercel.app';

const NAVY   = '#0c1a2e';
const BLUE   = '#1565c0';
const BLUE_P = '#e3f0ff';
const GREEN  = '#1b5e20';
const GREEN_P= '#e8f5e9';
const RED    = '#c62828';
const RED_P  = '#fdecea';
const AMBER  = '#b45309';
const AMBER_P= '#fff3e0';
const BORDER = '#e2e8f0';
const SURFACE= '#f7f9fc';
const MUTED  = '#8896a7';
const SEC    = '#4a5568';

function ParameterRow({ param }) {
  const isHigh     = param.status === 'high' || param.status === 'abnormal_high';
  const isLow      = param.status === 'low'  || param.status === 'abnormal_low';
  const isAbnormal = isHigh || isLow || param.status === 'abnormal';
  const color = isHigh ? RED : isLow ? AMBER : GREEN;
  const bg    = isHigh ? RED_P : isLow ? AMBER_P : GREEN_P;
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'9px 14px', borderBottom:`1px solid ${BORDER}`, background: isAbnormal ? bg+'80' : 'white' }}>
      <div style={{ flex:1 }}>
        <div style={{ fontSize:13, fontWeight:isAbnormal?700:500, color:NAVY }}>{param.name}</div>
        {param.referenceRange && <div style={{ fontSize:11, color:MUTED }}>Normal: {param.referenceRange} {param.unit}</div>}
      </div>
      <div style={{ textAlign:'right' }}>
        <div style={{ fontSize:13, fontWeight:700, color:isAbnormal?color:NAVY }}>
          {param.value} {param.unit}
          {isHigh && <span style={{ marginLeft:5, fontSize:10 }}>▲</span>}
          {isLow  && <span style={{ marginLeft:5, fontSize:10 }}>▼</span>}
        </div>
        {isAbnormal && <div style={{ fontSize:10, fontWeight:700, color, background:bg, padding:'1px 6px', borderRadius:4, display:'inline-block' }}>{isHigh?'HIGH':isLow?'LOW':'ABNORMAL'}</div>}
      </div>
    </div>
  );
}

// ── NOT LOGGED IN — Branded landing page ──────────────────────────────────────
function LoginGate({ shareToken }) {
  const router = useRouter();

  function goLogin() {
    try { sessionStorage.setItem('mc_post_login_redirect', `/report/view/${shareToken}`); } catch {}
    router.push(`/patient/login?redirect=/report/view/${shareToken}`);
  }
  function goRegister() {
    try { sessionStorage.setItem('mc_post_login_redirect', `/report/view/${shareToken}`); } catch {}
    router.push(`/register?redirect=/report/view/${shareToken}`);
  }

  return (
    <div style={{ minHeight:'100vh', background:`linear-gradient(135deg, ${NAVY} 0%, #1a3a5c 60%, #0e4a3a 100%)`, display:'flex', alignItems:'center', justifyContent:'center', padding:24, fontFamily:'DM Sans, sans-serif' }}>
      <div style={{ width:'100%', maxWidth:420, textAlign:'center' }}>

        {/* Logo */}
        <div style={{ marginBottom:32 }}>
          <div style={{ width:72, height:72, borderRadius:18, background:'linear-gradient(135deg, #1565c0 0%, #00796b 100%)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 16px', boxShadow:'0 8px 28px rgba(0,0,0,0.4)' }}>
            <svg width="36" height="36" viewBox="0 0 40 40" fill="none">
              <rect x="16" y="4" width="8" height="32" rx="3" fill="white" fillOpacity="0.95"/>
              <rect x="4" y="16" width="32" height="8" rx="3" fill="white" fillOpacity="0.95"/>
            </svg>
          </div>
          <div style={{ fontSize:26, fontWeight:800, color:'white', letterSpacing:'-0.5px' }}>NexMedicon AI</div>
          <div style={{ fontSize:13, color:'rgba(255,255,255,0.5)', marginTop:4 }}>Your health, intelligently managed</div>
        </div>

        {/* Card */}
        <div style={{ background:'white', borderRadius:20, padding:'32px 28px', boxShadow:'0 24px 64px rgba(0,0,0,0.35)' }}>
          <div style={{ fontSize:40, marginBottom:14 }}>📋</div>
          <div style={{ fontSize:18, fontWeight:700, color:NAVY, marginBottom:8 }}>Medical Report Shared With You</div>
          <div style={{ fontSize:13.5, color:SEC, lineHeight:1.7, marginBottom:24 }}>
            Someone has shared a medical report with you via NexMedicon AI. Please log in or create a free account to view it securely.
          </div>

          <div style={{ background:'#fffbeb', border:'1px solid #fde68a', borderRadius:10, padding:'10px 14px', marginBottom:24, display:'flex', gap:8, alignItems:'center' }}>
            <span style={{ fontSize:18 }}>🔒</span>
            <div style={{ fontSize:12, color:'#92400e', textAlign:'left', lineHeight:1.5 }}>
              This report is encrypted and protected. Only authorised users can view it.
            </div>
          </div>

          <button onClick={goLogin} style={{ width:'100%', padding:'13px', background:BLUE, color:'white', border:'none', borderRadius:12, fontSize:15, fontWeight:700, cursor:'pointer', marginBottom:12 }}>
            🔑 Log In to View Report
          </button>
          <button onClick={goRegister} style={{ width:'100%', padding:'13px', background:'white', color:NAVY, border:`1.5px solid ${BORDER}`, borderRadius:12, fontSize:14, fontWeight:600, cursor:'pointer' }}>
            Create Free Account
          </button>
          <div style={{ fontSize:11.5, color:MUTED, marginTop:16, lineHeight:1.6 }}>
            Don't have an account? Register as a patient in under 60 seconds.<br/>This link expires in 72 hours.
          </div>
        </div>
      </div>
    </div>
  );
}

// ── MAIN CLIENT COMPONENT ─────────────────────────────────────────────────────
export default function ReportViewClient({ shareToken }) {
  const router = useRouter();

  const [status, setStatus] = useState('loading'); // loading | gate | viewing | error
  const [report, setReport] = useState(null);
  const [errMsg, setErrMsg] = useState('');

  useEffect(() => {
    if (!shareToken) { setStatus('error'); setErrMsg('Invalid share link.'); return; }
    const patTok = getToken('PATIENT');
    const docTok = getToken('DOCTOR');
    const tok    = patTok || docTok;
    if (!tok) { setStatus('gate'); return; }
    fetchReport(tok);
  }, [shareToken]);

  async function fetchReport(tok) {
    setStatus('loading');
    try {
      const r = await fetch(`${API}/reports/shared/${shareToken}`, { headers: { Authorization: `Bearer ${tok}` } });
      if (r.status === 401 || r.status === 403) { setStatus('gate'); return; }
      if (r.status === 404 || r.status === 410) { setStatus('error'); setErrMsg('This report link has expired or is no longer available.'); return; }
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      setReport(d.data || d.report || d);
      setStatus('viewing');
    } catch {
      // Fallback: try ?id= param
      const reportId = new URLSearchParams(window.location.search).get('id');
      if (reportId) {
        await fetchByReportId(tok, reportId);
      } else {
        setStatus('error');
        setErrMsg('Could not load the report. The link may have expired.');
      }
    }
  }

  async function fetchByReportId(tok, reportId) {
    try {
      const r = await fetch(`${API}/reports/${reportId}`, { headers: { Authorization: `Bearer ${tok}` } });
      if (!r.ok) throw new Error();
      const d = await r.json();
      setReport(d.data || d.report || d);
      setStatus('viewing');
    } catch {
      setStatus('error');
      setErrMsg('Report not found or access denied.');
    }
  }

  // ── Loading ──
  if (status === 'loading') return (
    <div style={{ minHeight:'100vh', background:SURFACE, display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'DM Sans, sans-serif' }}>
      <div style={{ textAlign:'center', color:MUTED }}>
        <div style={{ fontSize:40, marginBottom:12 }}>📋</div>
        <div style={{ fontSize:14 }}>Loading report…</div>
      </div>
    </div>
  );

  // ── Login gate ──
  if (status === 'gate') return <LoginGate shareToken={shareToken} />;

  // ── Error ──
  if (status === 'error') return (
    <div style={{ minHeight:'100vh', background:SURFACE, display:'flex', alignItems:'center', justifyContent:'center', padding:24, fontFamily:'DM Sans, sans-serif' }}>
      <div style={{ textAlign:'center', maxWidth:380 }}>
        <div style={{ fontSize:48, marginBottom:16 }}>⚠️</div>
        <div style={{ fontSize:18, fontWeight:700, color:NAVY, marginBottom:8 }}>Report Unavailable</div>
        <div style={{ fontSize:14, color:MUTED, lineHeight:1.7, marginBottom:24 }}>{errMsg}</div>
        <button onClick={() => router.push('/')} style={{ padding:'10px 24px', background:BLUE, color:'white', border:'none', borderRadius:10, fontSize:14, fontWeight:600, cursor:'pointer' }}>
          Go to Home
        </button>
      </div>
    </div>
  );

  // ── Report viewer ──
  const params2     = report?.parameters || [];
  const findings    = report?.findings   || [];
  const abnormals   = params2.filter(p => p.status !== 'normal');
  const normals     = params2.filter(p => p.status === 'normal');
  const healthScore = report?.healthScore;
  const scoreColor  = healthScore >= 80 ? GREEN : healthScore >= 60 ? AMBER : RED;
  const reportType  = report?.reportType || report?.type || 'Medical Report';
  const patName     = report?.patientName
    || (report?.patient ? `${report.patient.firstName||''} ${report.patient.lastName||''}`.trim() : 'Patient');

  return (
    <div style={{ minHeight:'100vh', background:SURFACE, fontFamily:'DM Sans, sans-serif' }}>

      {/* Header */}
      <div style={{ background:`linear-gradient(135deg, ${NAVY} 0%, #1a3a5c 100%)`, padding:'16px 24px', display:'flex', alignItems:'center', gap:12 }}>
        <div style={{ width:36, height:36, borderRadius:10, background:'linear-gradient(135deg, #1565c0, #00796b)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18 }}>🔬</div>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:16, fontWeight:700, color:'white' }}>{reportType}</div>
          <div style={{ fontSize:12, color:'rgba(255,255,255,0.6)' }}>NexMedicon AI · Shared Report · {patName}</div>
        </div>
        <div style={{ fontSize:10, background:'rgba(255,255,255,0.12)', color:'rgba(255,255,255,0.7)', padding:'3px 10px', borderRadius:99, fontWeight:700 }}>🔒 SECURE</div>
      </div>

      <div style={{ maxWidth:680, margin:'0 auto', padding:'20px 16px' }}>

        <div style={{ background:AMBER_P, border:`1px solid #fde68a`, borderRadius:10, padding:'10px 14px', marginBottom:16, fontSize:12.5, color:AMBER }}>
          ⚠️ Educational analysis only — not a medical diagnosis. Consult a doctor for treatment decisions.
        </div>

        {/* Stats */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(130px, 1fr))', gap:10, marginBottom:20 }}>
          {healthScore != null && (
            <div style={{ background:'white', borderRadius:12, padding:'14px 16px', border:`1px solid ${BORDER}`, textAlign:'center' }}>
              <div style={{ fontSize:11, color:MUTED, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.04em', marginBottom:4 }}>Health Score</div>
              <div style={{ fontSize:28, fontWeight:800, color:scoreColor, lineHeight:1 }}>{healthScore}</div>
              <div style={{ fontSize:11, color:scoreColor, marginTop:3 }}>{report?.scoreLabel||''}</div>
            </div>
          )}
          <div style={{ background:'white', borderRadius:12, padding:'14px 16px', border:`1px solid ${BORDER}`, textAlign:'center' }}>
            <div style={{ fontSize:11, color:MUTED, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.04em', marginBottom:4 }}>Abnormal</div>
            <div style={{ fontSize:28, fontWeight:800, color:RED, lineHeight:1 }}>{abnormals.length}</div>
            <div style={{ fontSize:11, color:MUTED, marginTop:3 }}>Need attention</div>
          </div>
          <div style={{ background:'white', borderRadius:12, padding:'14px 16px', border:`1px solid ${BORDER}`, textAlign:'center' }}>
            <div style={{ fontSize:11, color:MUTED, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.04em', marginBottom:4 }}>Normal</div>
            <div style={{ fontSize:28, fontWeight:800, color:GREEN, lineHeight:1 }}>{normals.length}</div>
            <div style={{ fontSize:11, color:MUTED, marginTop:3 }}>Within range</div>
          </div>
          <div style={{ background:'white', borderRadius:12, padding:'14px 16px', border:`1px solid ${BORDER}`, textAlign:'center' }}>
            <div style={{ fontSize:11, color:MUTED, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.04em', marginBottom:4 }}>Total Checked</div>
            <div style={{ fontSize:28, fontWeight:800, color:NAVY, lineHeight:1 }}>{params2.length}</div>
            <div style={{ fontSize:11, color:MUTED, marginTop:3 }}>Parameters</div>
          </div>
        </div>

        {/* Key findings */}
        {findings.filter(f => f.severity !== 'ok').length > 0 && (
          <div style={{ background:'white', borderRadius:14, border:`1px solid ${BORDER}`, overflow:'hidden', marginBottom:16 }}>
            <div style={{ padding:'12px 16px', borderBottom:`1px solid ${BORDER}`, fontSize:13, fontWeight:700, color:NAVY }}>🔍 Key Findings</div>
            {findings.filter(f => f.severity !== 'ok').map((f, i) => (
              <div key={i} style={{ display:'flex', gap:10, padding:'10px 16px', borderBottom:`1px solid ${BORDER}`, background:f.severity==='critical'?RED_P:f.severity==='warning'?AMBER_P:GREEN_P }}>
                <span style={{ fontSize:18, flexShrink:0 }}>{f.icon||'•'}</span>
                <div>
                  <div style={{ fontSize:13, fontWeight:700, color:f.severity==='critical'?RED:f.severity==='warning'?AMBER:GREEN }}>{f.title}</div>
                  <div style={{ fontSize:12, color:SEC, lineHeight:1.5, marginTop:2 }}>{f.detail}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Abnormal parameters */}
        {abnormals.length > 0 && (
          <div style={{ background:'white', borderRadius:14, border:`1.5px solid #f5c6cb`, overflow:'hidden', marginBottom:16 }}>
            <div style={{ padding:'12px 16px', borderBottom:`1px solid ${BORDER}`, fontSize:13, fontWeight:700, color:RED, background:RED_P }}>
              ⚠️ Abnormal Values ({abnormals.length})
            </div>
            {abnormals.map((p, i) => <ParameterRow key={i} param={p} />)}
          </div>
        )}

        {/* Normal parameters */}
        {normals.length > 0 && (
          <div style={{ background:'white', borderRadius:14, border:`1px solid ${BORDER}`, overflow:'hidden', marginBottom:20 }}>
            <div style={{ padding:'12px 16px', borderBottom:`1px solid ${BORDER}`, fontSize:13, fontWeight:700, color:GREEN }}>
              ✅ Normal Values ({normals.length})
            </div>
            {normals.map((p, i) => <ParameterRow key={i} param={p} />)}
          </div>
        )}

        {/* Book CTA */}
        <div style={{ background:`linear-gradient(135deg, ${BLUE} 0%, #00796b 100%)`, borderRadius:14, padding:'18px 20px', marginBottom:20, display:'flex', alignItems:'center', justifyContent:'space-between', gap:16, flexWrap:'wrap' }}>
          <div>
            <div style={{ fontSize:14, fontWeight:700, color:'white', marginBottom:4 }}>Get a consultation</div>
            <div style={{ fontSize:12.5, color:'rgba(255,255,255,0.8)', lineHeight:1.5 }}>Book with a specialist on NexMedicon AI</div>
          </div>
          <button onClick={() => router.push('/patient/appointments/book')} style={{ padding:'10px 22px', background:'white', color:BLUE, border:'none', borderRadius:10, fontSize:13, fontWeight:700, cursor:'pointer', flexShrink:0 }}>
            Book Now →
          </button>
        </div>
      </div>
    </div>
  );
}
