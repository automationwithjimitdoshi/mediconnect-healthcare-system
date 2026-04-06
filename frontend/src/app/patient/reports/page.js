'use client';
/**
 * src/app/patient/reports/page.js
 *
 * FIXES:
 *  1. Removed `import AppLayout from '@/components/AppLayout'` (doesn't exist → build crash)
 *  2. Inline Sidebar replaces AppLayout — same pattern as all other working pages
 *  3. Single return renders correct screen based on `phase` — no multiple early returns
 *     with AppLayout (which caused the "Declaration between returns" Next.js error)
 *
 * FEATURES (all 4 preserved):
 *  A. Abnormal value detection  — flagged with reference range + visual bar
 *  B. Plain-English explanations — side-by-side jargon vs plain demo
 *  C. Actionable suggestions    — diet, lifestyle, follow-up tests
 *  D. Doctor recommendations    — specialists with urgency tags
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';

// ── Design tokens ──────────────────────────────────────────────────────────────
const NAVY  = '#0c1a2e', BLUE   = '#1565c0', BLUE_P = '#e3f0ff',
      RED   = '#c62828', RED_P  = '#fdecea', AMBER  = '#b45309', AMBER_P = '#fff3e0',
      GREEN = '#1b5e20', GREEN_P= '#e8f5e9', TEAL   = '#00796b',
      BORDER= '#e2e8f0', SURFACE= '#f7f9fc', MUTED  = '#8896a7', SEC = '#4a5568';
const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

const LANGS = [
  { code: 'en', native: 'English'  },
  { code: 'hi', native: 'हिंदी'    },
  { code: 'gu', native: 'ગુજરાતી' },
];

// Analysis step labels — must be const (not inside component) to avoid Next.js build error
const STEPS = [
  'Reading your report…',
  'Identifying test parameters…',
  'Comparing against reference ranges…',
  'Detecting abnormal patterns…',
  'Writing plain-English explanations…',
  'Preparing suggestions & specialist list…',
];

const SEV = {
  critical: { bg: RED_P,     border: '#f5c6cb', text: RED   },
  warning:  { bg: AMBER_P,   border: '#fde68a', text: AMBER },
  caution:  { bg: '#fff9c4', border: '#fff176', text: '#6d4c00' },
  ok:       { bg: GREEN_P,   border: '#a5d6a7', text: GREEN },
  info:     { bg: BLUE_P,    border: '#90caf9', text: BLUE  },
};

function sc(status) {
  if (status === 'normal') return { text: GREEN, bg: GREEN_P, bar: '#43a047' };
  if (status === 'high')   return { text: AMBER, bg: AMBER_P, bar: '#fb8c00' };
  return                          { text: BLUE,  bg: BLUE_P,  bar: '#1976d2' };
}

function timeAgo(iso) {
  if (!iso) return '';
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (d < 1) return 'today';
  if (d < 30) return `${d}d ago`;
  return `${Math.floor(d / 30)}mo ago`;
}

// ── NAV ───────────────────────────────────────────────────────────────────────
const NAV = [
  { id:'patientDashboard', label:'Dashboard',        icon:'⊞', href:'/patient'              },
  { id:'patientAppts',     label:'My Appointments',  icon:'📅', href:'/patient/appointments' },
  { id:'patientBook',      label:'Book Appointment', icon:'➕', href:'/patient/appointments/book' },
  { id:'patientChat',      label:'Chat with Doctor', icon:'💬', href:'/patient/chat'         },
  { id:'patientFiles',     label:'My Files',         icon:'📁', href:'/patient/files'              },
  { id:'patientReports',   label:'Report Analyzer',  icon:'🔬', href:'/patient/reports'      },
];

// ── Sidebar ───────────────────────────────────────────────────────────────────
function Sidebar() {
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
    // Fetch unread chat count
    const tok = localStorage.getItem('mc_token') || '';
    if (tok) {
      fetch(`${API}/chat/rooms?limit=100`, { headers: { Authorization: `Bearer ${tok}` } })
        .then(r => r.ok ? r.json() : null)
        .then(d => { const n = (d?.data||[]).reduce((s,r) => s+(r.unreadCount||0), 0); setChatBadge(n); })
        .catch(() => {});
    }
  }, []);
  return (
    <div style={{ width:220, background:NAVY, display:'flex', flexDirection:'column', flexShrink:0, overflow:'hidden' }}>
      <div style={{ padding:'20px 18px 14px', borderBottom:'1px solid rgba(255,255,255,0.08)' }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ width:32, height:32, background:BLUE, borderRadius:8, display:'flex', alignItems:'center', justifyContent:'center', position:'relative', flexShrink:0 }}>
            <div style={{ position:'absolute', width:14, height:3, background:'white', borderRadius:2 }} />
            <div style={{ position:'absolute', width:3, height:14, background:'white', borderRadius:2 }} />
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
          const isActive = item.href === '/patient/reports';
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

// ─────────────────────────────────────────────────────────────────────────────
//  FEATURE CARD DEFINITIONS  (all 4 features)
// ─────────────────────────────────────────────────────────────────────────────
const FEATURES = [
  {
    id: 'abnormal', icon: '🔬', title: 'Abnormal value detection',
    desc: 'Every out-of-range result flagged with the exact reference range and a visual progress bar.',
    color: RED, colorBg: RED_P,
    demo: () => (
      <div>
        <div style={{ fontSize:12, fontWeight:700, color:MUTED, textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:10 }}>Example — CBC result</div>
        {[
          { name:'Haemoglobin', value:9.8,   unit:'g/dL', low:12,  high:16,    status:'low'    },
          { name:'WBC Count',   value:11200,  unit:'/µL',  low:0,   high:11000, status:'high'   },
          { name:'Platelets',   value:210,    unit:'K/µL', low:150, high:400,   status:'normal' },
        ].map(p => {
          const s = sc(p.status);
          const pct = p.low === 0 ? Math.min((p.value/p.high)*80,100) : Math.max(0,Math.min(100,((p.value-p.low)/(p.high-p.low))*60+20));
          return (
            <div key={p.name} style={{ marginBottom:10, padding:'10px 12px', background:p.status!=='normal'?s.bg:SURFACE, borderRadius:8, border:`1px solid ${p.status!=='normal'?s.bar+'40':BORDER}` }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:5 }}>
                <span style={{ fontSize:12.5, fontWeight:600, color:NAVY }}>{p.name}</span>
                <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                  <span style={{ fontSize:13, fontWeight:700, color:s.text }}>{p.value>999?p.value.toLocaleString():p.value} {p.unit}</span>
                  {p.status!=='normal' && <span style={{ fontSize:11, fontWeight:700, background:s.bg, color:s.text, borderRadius:4, padding:'1px 7px', border:`1px solid ${s.bar}30` }}>{p.status==='high'?'High ↑':'Low ↓'}</span>}
                </div>
              </div>
              <div style={{ position:'relative', height:5, background:'#e9ecef', borderRadius:3 }}>
                <div style={{ position:'absolute', left:'20%', right:'20%', height:'100%', background:'#c8e6c9', borderRadius:3, opacity:0.8 }} />
                <div style={{ position:'absolute', left:`${pct.toFixed(0)}%`, transform:'translateX(-50%)', width:11, height:11, borderRadius:'50%', background:s.bar, top:-3, border:'2px solid white' }} />
              </div>
              <div style={{ fontSize:11, color:MUTED, marginTop:4 }}>Ref: {p.low>0?`${p.low}–${p.high}`:`<${p.high}`} {p.unit}</div>
            </div>
          );
        })}
        <div style={{ fontSize:12, color:RED, fontWeight:600, marginTop:4 }}>↑ Coloured rows = abnormal values detected automatically</div>
      </div>
    ),
  },
  {
    id: 'plain', icon: '💬', title: 'Plain-English explanations',
    desc: 'No medical jargon — each parameter explained in one clear sentence you can actually understand.',
    color: BLUE, colorBg: BLUE_P,
    demo: () => (
      <div>
        <div style={{ fontSize:12, fontWeight:700, color:MUTED, textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:10 }}>Jargon vs plain English</div>
        {[
          { term:'HbA1c — 8.2%', medical:'Glycated haemoglobin exceeding target threshold. Indicates suboptimal glycaemic control.', plain:"This shows your average blood sugar over 3 months. 8.2% is above the healthy limit — your blood sugar has been running high and your doctor may need to adjust treatment." },
          { term:'LDL — 148 mg/dL', medical:'Low-density lipoprotein elevated above desirable range. Atherogenic risk factor.', plain:"LDL is the 'bad' cholesterol that clogs arteries. Your level is above the safe limit of 100 mg/dL — diet changes and possibly medication can bring this down." },
        ].map((ex, i) => (
          <div key={i} style={{ marginBottom:12, borderRadius:9, overflow:'hidden', border:`1px solid ${BORDER}` }}>
            <div style={{ padding:'7px 12px', background:NAVY, color:'rgba(255,255,255,0.75)', fontSize:12, fontWeight:700 }}>{ex.term}</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr' }}>
              <div style={{ padding:'9px 12px', borderRight:`1px solid ${BORDER}`, background:'#fff5f5' }}>
                <div style={{ fontSize:10.5, fontWeight:700, color:RED, marginBottom:4, textTransform:'uppercase', letterSpacing:'0.04em' }}>Medical jargon ❌</div>
                <div style={{ fontSize:12, color:SEC, lineHeight:1.5 }}>{ex.medical}</div>
              </div>
              <div style={{ padding:'9px 12px', background:GREEN_P }}>
                <div style={{ fontSize:10.5, fontWeight:700, color:GREEN, marginBottom:4, textTransform:'uppercase', letterSpacing:'0.04em' }}>Plain English ✓</div>
                <div style={{ fontSize:12, color:SEC, lineHeight:1.5 }}>{ex.plain}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    ),
  },
  {
    id: 'suggestions', icon: '📋', title: 'Actionable suggestions',
    desc: 'Diet, lifestyle, and follow-up test recommendations — specific and practical, not vague advice.',
    color: AMBER, colorBg: AMBER_P,
    demo: () => (
      <div>
        <div style={{ fontSize:12, fontWeight:700, color:MUTED, textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:10 }}>Example — iron deficiency result</div>
        {[
          { cat:'Diet',           icon:'🥗', color:GREEN, items:['Eat iron-rich foods daily: dal, spinach, rajma, fortified cereals','Add lemon juice with meals — boosts absorption up to 3×','Avoid tea/coffee within 1 hour of iron-rich meals'] },
          { cat:'Lifestyle',      icon:'🏃', color:BLUE,  items:['30 min brisk walk, 5 days/week — improves red blood cell production','Sleep 7–8 hours — poor sleep worsens anaemia'] },
          { cat:'Follow-up tests',icon:'🧪', color:AMBER, items:['Serum Ferritin + Serum Iron + TIBC — confirms iron deficiency','Repeat CBC in 4 weeks after starting iron supplements'] },
        ].map(s => (
          <div key={s.cat} style={{ marginBottom:10 }}>
            <div style={{ display:'flex', alignItems:'center', gap:7, marginBottom:5 }}>
              <span style={{ fontSize:15 }}>{s.icon}</span>
              <span style={{ fontSize:12.5, fontWeight:700, color:s.color }}>{s.cat}</span>
            </div>
            {s.items.map((item,j) => (
              <div key={j} style={{ display:'flex', gap:7, padding:'3px 0' }}>
                <div style={{ width:5, height:5, borderRadius:'50%', background:s.color, flexShrink:0, marginTop:6 }} />
                <span style={{ fontSize:12.5, color:SEC, lineHeight:1.55 }}>{item}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    ),
  },
  {
    id: 'doctors', icon: '🩺', title: 'Doctor recommendations',
    desc: 'Which specialist to see, why, and how urgently — tailored to what your specific report shows.',
    color: TEAL, colorBg: '#e0f5f0',
    demo: () => (
      <div>
        <div style={{ fontSize:12, fontWeight:700, color:MUTED, textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:10 }}>Specialists based on your results</div>
        {[
          { icon:'👨‍⚕️', spec:'General Physician',      reason:'First contact — reviews all findings and coordinates care.',                           urgLabel:'Within 1–2 weeks', urgColor:RED,   urgBg:RED_P   },
          { icon:'🩸', spec:'Haematologist',             reason:"Specialist for anaemia — if Hb doesn't improve after 4–6 weeks of supplements.",    urgLabel:'Within 1 month',   urgColor:AMBER, urgBg:AMBER_P },
          { icon:'❤️', spec:'Cardiologist',              reason:'LDL/HDL imbalance noted — cardiovascular risk assessment recommended.',               urgLabel:'Within 1 month',   urgColor:AMBER, urgBg:AMBER_P },
          { icon:'🥦', spec:'Nutritionist / Dietitian',  reason:'Personalised meal plan for iron deficiency and high cholesterol.',                    urgLabel:'When convenient',  urgColor:GREEN, urgBg:GREEN_P },
        ].map((d,i) => (
          <div key={i} style={{ display:'flex', gap:10, padding:'9px 12px', background:SURFACE, borderRadius:9, marginBottom:7, border:`1px solid ${BORDER}` }}>
            <span style={{ fontSize:20, flexShrink:0 }}>{d.icon}</span>
            <div style={{ flex:1 }}>
              <div style={{ display:'flex', justifyContent:'space-between', flexWrap:'wrap', gap:5, marginBottom:2 }}>
                <span style={{ fontSize:13, fontWeight:700, color:NAVY }}>{d.spec}</span>
                <span style={{ fontSize:11, fontWeight:600, padding:'2px 8px', borderRadius:4, background:d.urgBg, color:d.urgColor }}>{d.urgLabel}</span>
              </div>
              <div style={{ fontSize:12, color:SEC, lineHeight:1.5 }}>{d.reason}</div>
            </div>
          </div>
        ))}
        <div style={{ fontSize:12, color:TEAL, fontWeight:600, marginTop:4 }}>↑ Generated from YOUR specific report findings</div>
      </div>
    ),
  },
];

// ── Feature Card component ─────────────────────────────────────────────────────
function FeatureCard({ feature, isActive, onToggle, onUpload }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div style={{ background:'white', borderRadius:12, border:`1.5px solid ${isActive?feature.color+'60':hovered?feature.color+'30':BORDER}`, overflow:'hidden', transition:'all 0.18s', boxShadow:isActive?`0 4px 18px ${feature.color}18`:hovered?'0 2px 10px rgba(0,0,0,0.07)':'none', cursor:'pointer' }}
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
      <div onClick={onToggle} style={{ padding:'14px 16px', display:'flex', alignItems:'flex-start', gap:12 }}>
        <div style={{ width:40, height:40, borderRadius:10, background:isActive?feature.color:feature.colorBg, display:'flex', alignItems:'center', justifyContent:'center', fontSize:20, flexShrink:0, transition:'background 0.2s' }}>
          {feature.icon}
        </div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontWeight:700, fontSize:13.5, color:NAVY, marginBottom:3 }}>{feature.title}</div>
          <div style={{ fontSize:12.5, color:SEC, lineHeight:1.5 }}>{feature.desc}</div>
        </div>
        <div style={{ fontSize:16, color:isActive?feature.color:MUTED, transition:'transform 0.2s, color 0.2s', transform:isActive?'rotate(180deg)':'rotate(0deg)', flexShrink:0, marginTop:2 }}>▾</div>
      </div>
      {isActive && (
        <div>
          <div style={{ height:1, background:feature.color+'25', margin:'0 16px' }} />
          <div style={{ padding:'14px 16px', background:SURFACE }}>{feature.demo()}</div>
          <div style={{ padding:'10px 16px 14px', background:SURFACE, borderTop:`1px solid ${BORDER}` }}>
            <button onClick={e => { e.stopPropagation(); onUpload(); }}
              style={{ width:'100%', padding:'10px 14px', background:feature.color, color:'white', border:'none', borderRadius:9, fontSize:13, fontWeight:700, cursor:'pointer' }}>
              📤 Upload your report to see this for your own results
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Shared sub-components ──────────────────────────────────────────────────────
function TabBtn({ id, label, active, onClick, badge }) {
  return (
    <button onClick={() => onClick(id)} style={{ padding:'8px 14px', border:'none', background:'transparent', cursor:'pointer', fontSize:13, fontWeight:active?700:500, color:active?BLUE:MUTED, borderBottom:active?`2px solid ${BLUE}`:'2px solid transparent', marginBottom:-1, fontFamily:'inherit' }}>
      {label}
      {badge > 0 && <span style={{ marginLeft:5, background:RED, color:'white', borderRadius:9, padding:'1px 6px', fontSize:10, fontWeight:700 }}>{badge}</span>}
    </button>
  );
}

function StatCard({ label, value, color, sub }) {
  return (
    <div style={{ background:'white', borderRadius:12, padding:'14px 18px', border:`1px solid ${BORDER}` }}>
      <div style={{ fontSize:11, fontWeight:600, color:MUTED, textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:5 }}>{label}</div>
      <div style={{ fontSize:28, fontWeight:700, color:color||NAVY, lineHeight:1 }}>{value}</div>
      {sub && <div style={{ fontSize:12, color:MUTED, marginTop:3 }}>{sub}</div>}
    </div>
  );
}

function ParamRow({ p }) {
  const s  = sc(p.status);
  const lo = Number(p.low)||0, hi = Number(p.high)||1;
  const v  = typeof p.value==='number'?p.value:parseFloat(p.value)||0;
  const pct= lo===0 ? Math.min((v/hi)*80,100) : Math.max(0,Math.min(100,((v-lo)/(hi-lo))*60+20));
  const disp = typeof p.value==='number' && p.value>9999 ? p.value.toLocaleString() : p.value;
  return (
    <div style={{ padding:'12px 16px', borderBottom:`1px solid ${BORDER}` }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom:6, flexWrap:'wrap', gap:4 }}>
        <span style={{ fontSize:13, fontWeight:600, color:NAVY }}>{p.name}</span>
        <div style={{ display:'flex', alignItems:'center', gap:7 }}>
          <span style={{ fontSize:14, fontWeight:700, color:s.text }}>{disp} {p.unit}</span>
          <span style={{ background:s.bg, color:s.text, borderRadius:4, padding:'2px 8px', fontSize:11, fontWeight:600 }}>
            {p.status==='normal'?'Normal':p.status==='high'?'High ↑':'Low ↓'}
          </span>
        </div>
      </div>
      <div style={{ position:'relative', height:6, background:'#f0f0f0', borderRadius:3, marginBottom:5 }}>
        <div style={{ position:'absolute', left:'20%', right:'20%', height:'100%', background:'#c8e6c9', borderRadius:3, opacity:0.8 }} />
        <div style={{ position:'absolute', left:`${pct.toFixed(0)}%`, transform:'translateX(-50%)', width:12, height:12, borderRadius:'50%', background:s.bar, top:-3, border:'2px solid white' }} />
      </div>
      <div style={{ fontSize:11, color:MUTED, marginBottom:5 }}>
        Reference: {p.referenceRange||(p.low>0?`${p.low}–${p.high}`:`<${p.high}`)} {p.unit}
      </div>
      {p.plain && <div style={{ fontSize:12.5, color:SEC, lineHeight:1.65, padding:'6px 10px', background:SURFACE, borderRadius:7, borderLeft:`3px solid ${s.bar}` }}>{p.plain}</div>}
    </div>
  );
}

function LangSelector({ value, onChange }) {
  return (
    <div style={{ display:'flex', gap:4 }}>
      {LANGS.map(l => (
        <button key={l.code} onClick={() => onChange(l.code)}
          style={{ padding:'5px 12px', borderRadius:8, border:`1px solid ${value===l.code?BLUE:BORDER}`, background:value===l.code?BLUE_P:'white', color:value===l.code?BLUE:SEC, fontWeight:value===l.code?700:400, fontSize:12, cursor:'pointer' }}>
          {l.native}
        </button>
      ))}
    </div>
  );
}

function ShareModal({ fileId, analysis, chatRooms, onClose, token }) {
  const [tab,      setTab]      = useState('chat'); // 'chat' | 'sms' | 'whatsapp'
  const [status,   setStatus]   = useState('idle');
  const [sentRoom, setSentRoom] = useState('');
  const [smsPhone, setSmsPhone] = useState('');
  const [smsSent,  setSmsSent]  = useState('');
  const [smsErr,   setSmsErr]   = useState('');
  const [smsBusy,  setSmsBusy]  = useState(false);

  async function doShare(roomId, label) {
    setStatus('sending');
    try {
      const r = await fetch(`${API}/reports/patient/share`, { method:'POST', headers:{ Authorization:`Bearer ${token}`, 'Content-Type':'application/json' }, body:JSON.stringify({ fileId, roomId }) });
      const d = await r.json();
      if (d.success) { setStatus('success'); setSentRoom(label); } else setStatus('error');
    } catch { setStatus('error'); }
  }

  async function doSendSMS(channel) {
    if (!smsPhone.trim() || smsPhone.replace(/\D/g,'').length < 7) { setSmsErr('Enter a valid phone number.'); return; }
    setSmsBusy(true); setSmsErr(''); setSmsSent('');
    try {
      const r = await fetch(`${API}/auth/share-report-sms`, { method:'POST', headers:{ Authorization:`Bearer ${token}`, 'Content-Type':'application/json' }, body:JSON.stringify({ fileId, channel, customPhone: smsPhone.trim() }) });
      const d = await r.json();
      if (d.success && d.sent) { setSmsSent(d.message || 'Sent!'); }
      else { setSmsErr(d.message || 'Send failed. Check Twilio config.'); }
    } catch { setSmsErr('Network error.'); }
    setSmsBusy(false);
  }
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(12,26,46,0.55)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}
      onClick={e => { if (e.target===e.currentTarget) onClose(); }}>
      <div style={{ background:'white', borderRadius:16, width:'100%', maxWidth:420, overflow:'hidden', boxShadow:'0 12px 40px rgba(0,0,0,0.2)' }}>
        <div style={{ background:NAVY, padding:'14px 18px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div style={{ fontWeight:700, fontSize:15, color:'white' }}>Share Report</div>
          <button onClick={onClose} style={{ background:'rgba(255,255,255,0.12)', border:'none', color:'white', width:28, height:28, borderRadius:'50%', cursor:'pointer', fontSize:16 }}>×</button>
        </div>
        {/* Tabs */}
        <div style={{ display:'flex', borderBottom:`1px solid ${BORDER}` }}>
          {[{id:'chat',icon:'💬',label:'Doctor Chat'},{id:'sms',icon:'📱',label:'SMS'},{id:'whatsapp',icon:'🟢',label:'WhatsApp'}].map(t=>(
            <button key={t.id} onClick={()=>{setTab(t.id);setSmsErr('');setSmsSent('');}}
              style={{ flex:1, padding:'10px 0', border:'none', background:tab===t.id?BLUE_P:'transparent', color:tab===t.id?BLUE:MUTED, fontSize:12.5, fontWeight:tab===t.id?700:400, cursor:'pointer', borderBottom:tab===t.id?`2px solid ${BLUE}`:'2px solid transparent', marginBottom:-1 }}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>
        <div style={{ padding:18 }}>
          {analysis?.reportType && (
            <div style={{ background:SURFACE, border:`1px solid ${BORDER}`, borderRadius:10, padding:'10px 14px', marginBottom:16, fontSize:13 }}>
              <div style={{ fontWeight:700, color:NAVY, marginBottom:3 }}>{analysis.reportType}</div>
              {typeof analysis.healthScore==='number' && <div style={{ color:MUTED }}>Health Score: <strong style={{ color:analysis.healthScore>=80?GREEN:analysis.healthScore>=60?AMBER:RED }}>{analysis.healthScore}/100</strong> — {analysis.scoreLabel}</div>}
            </div>
          )}
          {status==='success' ? (
            <div style={{ textAlign:'center', padding:'20px 0' }}>
              <div style={{ fontSize:36, marginBottom:10 }}>✅</div>
              <div style={{ fontWeight:700, fontSize:16, color:GREEN, marginBottom:5 }}>Shared successfully!</div>
              <div style={{ fontSize:13, color:SEC }}>Your report was shared with {sentRoom}.</div>
              <button onClick={onClose} style={{ marginTop:16, padding:'8px 20px', background:BLUE, color:'white', border:'none', borderRadius:9, fontSize:13, fontWeight:700, cursor:'pointer' }}>Done</button>
            </div>
          ) : status==='error' ? (
            <div style={{ background:RED_P, border:`1px solid #f5c6cb`, borderRadius:9, padding:12, marginBottom:14 }}>
              <div style={{ fontWeight:700, color:RED, fontSize:13 }}>Share failed — please try again.</div>
              <button onClick={() => setStatus('idle')} style={{ marginTop:8, padding:'5px 14px', background:RED, color:'white', border:'none', borderRadius:7, fontSize:12, cursor:'pointer' }}>Retry</button>
            </div>
          ) : (
            <>
              <div style={{ fontSize:12.5, fontWeight:700, color:MUTED, textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:10 }}>Choose a chat</div>
              {chatRooms.length===0 && <div style={{ padding:'20px 0', textAlign:'center', color:MUTED, fontSize:13 }}>No chat rooms found. Book an appointment first.</div>}
              {chatRooms.map(room => {
                const doc = room.appointment?.doctor;
                const label = doc ? `Dr. ${doc.firstName} ${doc.lastName}` : 'Doctor';
                return (
                  <button key={room.id} disabled={status==='sending'} onClick={() => doShare(room.id, label)}
                    style={{ display:'flex', alignItems:'center', gap:12, width:'100%', padding:'11px 14px', borderRadius:10, border:`1px solid ${BORDER}`, background:SURFACE, cursor:'pointer', marginBottom:8, textAlign:'left', opacity:status==='sending'?0.6:1 }}>
                    <div style={{ width:36, height:36, borderRadius:'50%', background:BLUE_P, color:BLUE, display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, fontSize:13, flexShrink:0 }}>
                      {doc?`${doc.firstName?.[0]||''}${doc.lastName?.[0]||''}`:'DR'}
                    </div>
                    <div style={{ flex:1 }}>
                      <div style={{ fontWeight:600, fontSize:13, color:NAVY }}>{label}</div>
                      <div style={{ fontSize:11.5, color:MUTED }}>{doc?.specialty||''}</div>
                    </div>
                    <span style={{ color:BLUE, fontSize:12.5, fontWeight:700 }}>{status==='sending'?'…':'Share →'}</span>
                  </button>
                );
              })}
            </>
          )}

          {/* SMS tab */}
          {(tab==='sms'||tab==='whatsapp') && (
            <div style={{ marginTop:4 }}>
              {smsSent ? (
                <div style={{ background:GREEN_P, border:`1px solid #86efac`, borderRadius:10, padding:'12px 14px', textAlign:'center' }}>
                  <div style={{ fontSize:22, marginBottom:6 }}>{tab==='whatsapp'?'🟢':'📱'}</div>
                  <div style={{ fontWeight:700, color:GREEN, fontSize:13 }}>Sent!</div>
                  <div style={{ fontSize:12.5, color:SEC, marginTop:4 }}>{smsSent}</div>
                  <button onClick={onClose} style={{ marginTop:12, padding:'7px 18px', background:BLUE, color:'white', border:'none', borderRadius:9, fontSize:13, fontWeight:600, cursor:'pointer' }}>Done</button>
                </div>
              ) : (
                <>
                  <div style={{ fontSize:12.5, color:MUTED, marginBottom:10 }}>
                    Send the report summary directly to a phone number via {tab==='whatsapp'?'WhatsApp':'SMS'}.
                  </div>
                  {smsErr && <div style={{ background:RED_P, border:`1px solid #f5c6cb`, borderRadius:8, padding:'8px 12px', fontSize:12.5, color:RED, marginBottom:10 }}>{smsErr}</div>}
                  <div style={{ marginBottom:10 }}>
                    <label style={{ display:'block', fontSize:12, fontWeight:600, color:SEC, marginBottom:5 }}>Phone number (with country code)</label>
                    <input type="tel" value={smsPhone} onChange={e=>setSmsPhone(e.target.value)}
                      placeholder="+91 98765 43210"
                      style={{ width:'100%', padding:'9px 12px', border:`1px solid ${BORDER}`, borderRadius:9, fontSize:13, outline:'none', boxSizing:'border-box' }} />
                    <div style={{ fontSize:11, color:MUTED, marginTop:4 }}>Include country code, e.g. +91 for India</div>
                  </div>
                  {tab==='whatsapp' && (
                    <div style={{ background:AMBER_P, border:`1px solid #fde68a`, borderRadius:8, padding:'8px 12px', fontSize:12, color:AMBER, marginBottom:10 }}>
                      ⚠ WhatsApp requires Twilio WhatsApp sandbox setup. The patient must have opted in.
                    </div>
                  )}
                  <button onClick={()=>doSendSMS(tab)} disabled={smsBusy}
                    style={{ width:'100%', padding:'10px', background:tab==='whatsapp'?'#16a34a':BLUE, color:'white', border:'none', borderRadius:9, fontSize:13, fontWeight:700, cursor:smsBusy?'not-allowed':'pointer', opacity:smsBusy?0.7:1 }}>
                    {smsBusy?'Sending…':`Send via ${tab==='whatsapp'?'WhatsApp':'SMS'} →`}
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function HistoryCard({ item, onRestore }) {
  const analysis   = item.patientAnalysis;
  const scoreColor = (analysis?.healthScore??0)>=80?GREEN:(analysis?.healthScore??0)>=60?AMBER:RED;
  const topFinding = analysis?.findings?.find(f => f.severity==='critical'||f.severity==='warning');
  return (
    <div style={{ background:'white', borderRadius:12, border:`1px solid ${BORDER}`, padding:'13px 16px', display:'flex', gap:14, alignItems:'flex-start' }}>
      <div style={{ width:42, height:42, borderRadius:10, background:BLUE_P, display:'flex', alignItems:'center', justifyContent:'center', fontSize:22, flexShrink:0 }}>
        {item.fileType?.includes('image')?'🖼️':'📄'}
      </div>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontWeight:700, fontSize:13.5, color:NAVY, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', marginBottom:2 }}>{item.fileName}</div>
        <div style={{ fontSize:12, color:MUTED, marginBottom:6 }}>{analysis?.reportType||item.category} · Analyzed {timeAgo(item.patientAnalyzedAt)}</div>
        {typeof analysis?.healthScore==='number' && (
          <div style={{ display:'inline-flex', alignItems:'center', gap:6, background:SURFACE, border:`1px solid ${BORDER}`, borderRadius:6, padding:'3px 10px', marginBottom:topFinding?5:0 }}>
            <span style={{ fontSize:13, fontWeight:700, color:scoreColor }}>{analysis.healthScore}</span>
            <span style={{ fontSize:11.5, color:MUTED }}>/ 100 — {analysis.scoreLabel}</span>
          </div>
        )}
        {topFinding && <div style={{ fontSize:12, color:SEV[topFinding.severity]?.text||SEC, marginTop:3 }}>{topFinding.icon} {topFinding.title}</div>}
      </div>
      <button onClick={() => onRestore(item)}
        style={{ padding:'7px 14px', background:NAVY, color:'white', border:'none', borderRadius:8, fontSize:12, fontWeight:700, cursor:'pointer', flexShrink:0 }}>
        View →
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  MAIN PAGE
// ─────────────────────────────────────────────────────────────────────────────
// ── SMS Modal ──────────────────────────────────────────────────────────────────
function SMSModal({ result, onClose, token }) {
  const [phone,  setPhone]  = useState('');
  const [busy,   setBusy]   = useState(false);
  const [status, setStatus] = useState('idle'); // idle | success | error
  const [msg,    setMsg]    = useState('');

  async function doSend(e) {
    e.preventDefault();
    if (!phone.trim() || phone.replace(/\D/g,'').length < 7) { setMsg('Enter a valid phone number.'); return; }
    setBusy(true); setMsg('');
    try {
      const r = await fetch(`${API}/auth/send-report-sms`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone:       phone.trim(),
          reportType:  result.reportType,
          patientName: '',
          healthScore: result.healthScore,
          scoreLabel:  result.scoreLabel,
          findings:    result.findings?.filter(f => f.severity === 'critical' || f.severity === 'warning').slice(0, 3) || [],
        }),
      });
      const d = await r.json();
      if (r.ok && d.success) setStatus('success');
      else { setStatus('error'); setMsg(d.error || 'SMS failed. Check backend smsService config.'); }
    } catch { setStatus('error'); setMsg('Network error.'); }
    setBusy(false);
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(12,26,46,0.55)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background:'white', borderRadius:16, width:'100%', maxWidth:420, overflow:'hidden', boxShadow:'0 12px 40px rgba(0,0,0,0.2)' }}>
        <div style={{ background:'#7c3aed', padding:'14px 18px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div style={{ fontWeight:700, fontSize:15, color:'white' }}>📱 Send report to phone</div>
          <button onClick={onClose} style={{ background:'rgba(255,255,255,0.15)', border:'none', color:'white', width:28, height:28, borderRadius:'50%', cursor:'pointer', fontSize:16 }}>×</button>
        </div>
        <div style={{ padding:20 }}>
          {status === 'success' ? (
            <div style={{ textAlign:'center', padding:'16px 0' }}>
              <div style={{ fontSize:36, marginBottom:10 }}>📲</div>
              <div style={{ fontWeight:700, fontSize:16, color:'#166534', marginBottom:6 }}>SMS sent!</div>
              <div style={{ fontSize:13, color:'#374151', marginBottom:16 }}>The report summary has been sent to {phone}.</div>
              <button onClick={onClose} style={{ padding:'8px 20px', background:'#7c3aed', color:'white', border:'none', borderRadius:9, fontSize:13, fontWeight:700, cursor:'pointer' }}>Done</button>
            </div>
          ) : (
            <>
              <div style={{ background:'#f5f3ff', border:'1px solid #ddd6fe', borderRadius:9, padding:'10px 14px', marginBottom:16, fontSize:13, color:'#5b21b6' }}>
                Sends a plain-text SMS summary of this report — health score, key findings, and report type.
              </div>
              {msg && <div style={{ background:'#FEF2F2', border:'1px solid #FCA5A5', borderRadius:9, padding:'9px 13px', fontSize:13, color:'#DC2626', marginBottom:12 }}>{msg}</div>}
              <form onSubmit={doSend}>
                <div style={{ marginBottom:16 }}>
                  <label style={{ display:'block', fontSize:13, fontWeight:500, color:'#374151', marginBottom:5 }}>Phone number (with country code)</label>
                  <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} required autoFocus
                    placeholder="+91 98765 43210"
                    style={{ width:'100%', padding:'10px 12px', border:'1.5px solid #E2E8F0', borderRadius:9, fontSize:14, outline:'none', boxSizing:'border-box', fontFamily:'DM Sans, sans-serif' }} />
                  <div style={{ fontSize:12, color:'#64748B', marginTop:4 }}>You can send to your own number or a family member's number.</div>
                </div>
                <button type="submit" disabled={busy}
                  style={{ width:'100%', padding:11, background:busy?'#a78bfa':'#7c3aed', color:'white', border:'none', borderRadius:9, fontSize:14, fontWeight:700, cursor:busy?'not-allowed':'pointer', fontFamily:'DM Sans, sans-serif' }}>
                  {busy ? 'Sending…' : '📱 Send SMS'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}


export default function PatientReportAnalyzer() {
  const router  = useRouter();
  const fileRef = useRef(null);
  const dropRef = useRef(null);

  const [mounted,       setMounted]     = useState(false);
  const [phase,         setPhase]       = useState('upload'); // upload | analyzing | results | error
  const [lang,          setLang]        = useState('en');
  const [analyzeStep,   setStep]        = useState(0);
  const [result,        setResult]      = useState(null);
  const [currentFileId, setFileId]      = useState(null);
  const [currentName,   setFileName]    = useState('');
  const [errorMsg,      setError]       = useState('');
  const [activeTab,     setTab]         = useState('findings');
  const [dragOver,      setDragOver]    = useState(false);
  const [history,       setHistory]     = useState([]);
  const [chatRooms,     setChatRooms]   = useState([]);
  const [showShare,     setShowShare]   = useState(false);
  const [showSMS,       setShowSMS]     = useState(false);
  const [smsPhone,      setSmsPhone]    = useState('');
  const [smsBusy,       setSmsBusy]     = useState(false);
  const [smsResult,     setSmsResult]   = useState('');
  const [reanalyzing,   setReanalyzing] = useState(false);
  const [historyLoaded, setHLoaded]     = useState(false);
  const [activeFeature, setActiveFeat]  = useState(null);
  const [reportMeta,    setReportMeta]  = useState({ patientName:'', labName:'' });

  const token = useCallback(() => localStorage.getItem('mc_token') || '', []);

  useEffect(() => {
    setMounted(true);
    const u = localStorage.getItem('mc_user');
    if (!u) { router.push('/login'); return; }
    const user = JSON.parse(u);
    if (user.role !== 'PATIENT') { router.push('/'); return; }
    fetchHistory();
    fetchChatRooms();
  }, []);

  async function fetchHistory() {
    try {
      const r = await fetch(`${API}/reports/patient/history`, { headers:{ Authorization:`Bearer ${token()}` } });
      const d = await r.json();
      if (d.success) setHistory(d.data || []);
    } catch {} finally { setHLoaded(true); }
  }

  async function fetchChatRooms() {
    try {
      const r = await fetch(`${API}/chat/rooms`, { headers:{ Authorization:`Bearer ${token()}` } });
      const d = await r.json();
      setChatRooms(d.data || d.rooms || []);
    } catch {}
  }

  async function sendReportSMS() {
    if (!smsPhone.trim() || smsPhone.replace(/\D/g,'').length < 7) {
      setSmsResult('❌ Enter a valid phone number (at least 7 digits).');
      return;
    }
    setSmsBusy(true); setSmsResult('');
    try {
      const r = await fetch(`${API}/auth/send-report-sms`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone:      smsPhone.trim(),
          fileName:   currentName,
          reportType: result?.reportType,
          healthScore:result?.healthScore,
          scoreLabel: result?.scoreLabel,
          findings:   result?.findings || [],
        }),
      });
      const d = await r.json();
      if (d.success) {
        setSmsResult(d.simulated
          ? '⚠️ SMS service not configured on server. Check backend console for the message preview.'
          : `✅ Report summary sent to ${smsPhone}!`);
      } else {
        setSmsResult(`❌ ${d.error || 'Failed to send SMS.'}`);
      }
    } catch { setSmsResult('❌ Could not reach server. Check your connection.'); }
    setSmsBusy(false);
  }

  function toggleFeature(id) { setActiveFeat(prev => prev===id?null:id); }

  function handleFileSelect(file) {
    if (!file) return;
    if (file.size > 20*1024*1024) { setError('File too large. Max 20 MB.'); setPhase('error'); return; }
    startAnalysis(file);
  }

  async function startAnalysis(file) {
    // Check token before calling — redirects to login if session expired
    const tok = token();
    if (!tok) { router.push('/login'); return; }

    setPhase('analyzing'); setStep(0); setError(''); setResult(null);
    setFileName(file.name); setFileId(null);
    let s = 0;
    const iv = setInterval(() => { s++; setStep(s); if (s >= STEPS.length) clearInterval(iv); }, 620);
    try {
      const fd = new FormData();
      fd.append('file', file); fd.append('lang', lang);
      const r = await fetch(`${API}/reports/patient/analyze`, { method:'POST', headers:{ Authorization:`Bearer ${tok}` }, body:fd });
      const d = await r.json();
      clearInterval(iv); setStep(STEPS.length);
      if (r.status === 401) { router.push('/login'); return; }
      if (!r.ok || !d.success) { setError(d.message||'Analysis failed. Check server console for details.'); setPhase('error'); return; }
      await new Promise(res => setTimeout(res, 400));
      setResult(d.analysis); setFileId(d.fileId); setFileName(d.fileName||file.name);
      setReportMeta({ patientName: d.analysis?.patientName||'', labName: d.analysis?.labName||'' });
      setPhase('results'); setTab('findings'); fetchHistory();
    } catch {
      clearInterval(iv); setError('Network error. Check connection and try again.'); setPhase('error');
    }
  }

  async function changeLanguage(newLang) {
    if (newLang===lang) return; setLang(newLang);
    if (phase!=='results' || !currentFileId) return;
    setReanalyzing(true);
    try {
      const r = await fetch(`${API}/reports/patient/reanalyze`, { method:'POST', headers:{ Authorization:`Bearer ${token()}`, 'Content-Type':'application/json' }, body:JSON.stringify({ fileId:currentFileId, lang:newLang }) });
      const d = await r.json();
      if (d.success && d.analysis) { setResult(d.analysis); fetchHistory(); }
    } catch {} finally { setReanalyzing(false); }
  }

  function restoreFromHistory(item) {
    setResult(item.patientAnalysis); setFileId(item.id); setFileName(item.fileName);
    setLang(item.patientAnalysis?.lang||'en'); setPhase('results'); setTab('findings');
    setReportMeta({ patientName: item.patientAnalysis?.patientName||'', labName: item.patientAnalysis?.labName||'' });
    window.scrollTo({ top:0, behavior:'smooth' });
  }

  if (!mounted) return null;

  // ── Determine content for current phase ────────────────────────────────────
  const abnormal   = result?.parameters?.filter(p => p.status!=='normal').length || 0;
  const normal     = result?.parameters?.filter(p => p.status==='normal').length  || 0;
  const scoreColor = (result?.healthScore??0)>=80 ? GREEN : (result?.healthScore??0)>=60 ? AMBER : RED;
  const cats       = result?.parameters ? [...new Set(result.parameters.map(p => p.category||'Other'))] : [];

  function renderContent() {
    // ── Upload / Error screen ──────────────────────────────────────────────
    if (phase==='upload' || phase==='error') return (
      <div style={{ flex:1, overflowY:'auto', padding:24, background:SURFACE }}>
        {/* Header */}
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:22, flexWrap:'wrap', gap:10 }}>
          <div>
            <div style={{ fontSize:20, fontWeight:700, color:NAVY }}>My Report Analyzer</div>
            <div style={{ fontSize:13, color:MUTED, marginTop:3 }}>Upload any lab report — get instant plain-English analysis, free</div>
          </div>
          <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:4 }}>
            <div style={{ fontSize:11.5, color:MUTED, fontWeight:600 }}>Analysis language</div>
            <LangSelector value={lang} onChange={setLang} />
          </div>
        </div>

        {/* Disclaimer */}
        <div style={{ background:AMBER_P, border:`1px solid #fde68a`, borderRadius:10, padding:'10px 14px', marginBottom:18, fontSize:13, color:AMBER, lineHeight:1.6 }}>
          <strong>Medical disclaimer:</strong> For educational purposes only — not a diagnosis. Always consult a qualified doctor.
        </div>

        {/* Error banner */}
        {phase==='error' && (
          <div style={{ background:RED_P, border:`1px solid #f5c6cb`, borderRadius:10, padding:'12px 16px', marginBottom:18, display:'flex', gap:12, alignItems:'flex-start' }}>
            <span style={{ fontSize:18, flexShrink:0 }}>❌</span>
            <div style={{ flex:1 }}>
              <div style={{ fontWeight:700, color:RED, fontSize:13, marginBottom:2 }}>Upload failed</div>
              <div style={{ fontSize:12.5, color:SEC }}>{errorMsg}</div>
            </div>
            <button onClick={() => setPhase('upload')} style={{ padding:'6px 14px', background:RED, color:'white', border:'none', borderRadius:8, fontSize:12, fontWeight:600, cursor:'pointer', flexShrink:0 }}>Try again</button>
          </div>
        )}

        {/* Feature cards */}
        <div style={{ marginBottom:14 }}>
          <div style={{ fontSize:13, fontWeight:700, color:NAVY, marginBottom:4 }}>What you'll get — click any feature to see a live preview</div>
          <div style={{ fontSize:12.5, color:MUTED, marginBottom:14 }}>Click to expand and explore with example data, then upload your report to see it with your own results.</div>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:12, marginBottom:22 }}>
          {FEATURES.map(f => (
            <FeatureCard key={f.id} feature={f} isActive={activeFeature===f.id}
              onToggle={() => toggleFeature(f.id)} onUpload={() => fileRef.current?.click()} />
          ))}
        </div>

        <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.txt" style={{ display:'none' }}
          onChange={e => { if (e.target.files[0]) handleFileSelect(e.target.files[0]); }} />

        {/* Drop zone */}
        <div ref={dropRef} onClick={() => fileRef.current?.click()}
          onDragOver={e => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); handleFileSelect(e.dataTransfer.files[0]); }}
          style={{ background:dragOver?BLUE_P:'white', border:`2px dashed ${dragOver?BLUE:BORDER}`, borderRadius:14, padding:'28px 24px', textAlign:'center', cursor:'pointer', marginBottom:22, transition:'all 0.18s' }}>
          <div style={{ fontSize:34, marginBottom:10 }}>📋</div>
          <div style={{ fontWeight:700, fontSize:16, color:NAVY, marginBottom:5 }}>Upload your lab report</div>
          <div style={{ fontSize:13, color:MUTED, marginBottom:16 }}>PDF, JPG, PNG · CBC, Lipid, Thyroid, Glucose, Cardiac · Max 20 MB</div>
          <div style={{ display:'flex', justifyContent:'center', gap:10, flexWrap:'wrap' }}>
            <button onClick={e => { e.stopPropagation(); fileRef.current?.click(); }}
              style={{ padding:'9px 22px', background:BLUE, color:'white', border:'none', borderRadius:9, fontSize:13, fontWeight:700, cursor:'pointer' }}>
              Choose file
            </button>
            <span style={{ padding:'9px 0', fontSize:13, color:MUTED }}>or drag & drop here</span>
          </div>
          <div style={{ marginTop:12, fontSize:12, color:MUTED }}>
            Language: <strong style={{ color:BLUE }}>{LANGS.find(l => l.code===lang)?.native}</strong>
          </div>
        </div>

        {/* History */}
        {historyLoaded && history.length > 0 && (
          <div>
            <div style={{ fontWeight:700, fontSize:14, color:NAVY, marginBottom:12 }}>Past Analyses</div>
            <div style={{ display:'flex', flexDirection:'column', gap:9 }}>
              {history.map(item => <HistoryCard key={item.id} item={item} onRestore={restoreFromHistory} />)}
            </div>
          </div>
        )}
        {historyLoaded && history.length===0 && (
          <div style={{ textAlign:'center', padding:'20px 0', color:MUTED, fontSize:13 }}>
            Your analyzed reports will appear here so you can revisit them anytime.
          </div>
        )}
      </div>
    );

    // ── Analyzing screen ───────────────────────────────────────────────────
    if (phase==='analyzing') return (
      <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', background:SURFACE }}>
        <div style={{ background:'white', borderRadius:16, border:`1px solid ${BORDER}`, padding:32, maxWidth:520, width:'100%', textAlign:'center', boxShadow:'0 2px 16px rgba(0,0,0,0.08)' }}>
          <div style={{ fontSize:40, marginBottom:12 }}>🧠</div>
          <div style={{ fontWeight:700, fontSize:18, color:NAVY, marginBottom:4 }}>Analyzing your report</div>
          <div style={{ fontSize:13, color:MUTED, marginBottom:6 }}>{currentName}</div>
          <div style={{ fontSize:12.5, color:MUTED, marginBottom:22 }}>
            Language: <strong>{LANGS.find(l => l.code===lang)?.native}</strong> · Usually takes 15–30 seconds
          </div>
          <div style={{ background:'#f0f0f0', borderRadius:6, height:7, overflow:'hidden', marginBottom:22 }}>
            <div style={{ height:'100%', background:BLUE, borderRadius:6, transition:'width 0.5s ease', width:`${Math.round((analyzeStep/STEPS.length)*100)}%` }} />
          </div>
          {STEPS.map((s, i) => (
            <div key={i} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 0', borderBottom:`0.5px solid ${BORDER}`, textAlign:'left' }}>
              <div style={{ width:20, height:20, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                {i<analyzeStep ? <span style={{ color:GREEN, fontSize:14, fontWeight:700 }}>✓</span>
                  : i===analyzeStep ? <div style={{ width:9, height:9, borderRadius:'50%', background:BLUE, animation:'rPulse 1s infinite' }} />
                  : <div style={{ width:9, height:9, borderRadius:'50%', background:'#e0e0e0' }} />}
              </div>
              <span style={{ fontSize:13, color:i<=analyzeStep?NAVY:MUTED }}>{s}</span>
            </div>
          ))}
        </div>
        <style>{`@keyframes rPulse{0%,100%{opacity:1}50%{opacity:.25}}`}</style>
      </div>
    );

    // ── Results screen ─────────────────────────────────────────────────────
    if (phase!=='results' || !result) return null;

    // "Not a medical report"
    if (result.notMedical) return (
      <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', background:SURFACE }}>
        <div style={{ background:'white', borderRadius:14, border:`1px solid ${BORDER}`, padding:32, maxWidth:480, textAlign:'center' }}>
          <div style={{ fontSize:40, marginBottom:12 }}>📄</div>
          <div style={{ fontWeight:700, fontSize:17, color:NAVY, marginBottom:8 }}>Not a medical report</div>
          <div style={{ fontSize:13.5, color:SEC, lineHeight:1.7, marginBottom:20 }}>{result.message}</div>
          <button onClick={() => setPhase('upload')} style={{ padding:'9px 22px', background:BLUE, color:'white', border:'none', borderRadius:9, fontSize:13, fontWeight:700, cursor:'pointer' }}>
            Upload a different file
          </button>
        </div>
      </div>
    );

    return (
      <div style={{ flex:1, overflowY:'auto', padding:24, background:SURFACE }}>
        {/* Header */}
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:14, flexWrap:'wrap', gap:10 }}>
          <div>
            <div style={{ fontSize:20, fontWeight:700, color:NAVY }}>My Report Results</div>
            <div style={{ fontSize:13, color:MUTED, marginTop:3 }}>{result.reportType||'Medical Report'} · {currentName}</div>
            {(result.patientName || result.labName) && (
              <div style={{ display:'flex', gap:12, marginTop:4, flexWrap:'wrap' }}>
                {result.patientName && (
                  <div style={{ fontSize:12, color:BLUE, background:BLUE_P, borderRadius:6, padding:'2px 8px', fontWeight:600 }}>
                    👤 {result.patientName}
                  </div>
                )}
                {result.labName && (
                  <div style={{ fontSize:12, color:TEAL, background:'#e0f2f1', borderRadius:6, padding:'2px 8px', fontWeight:600 }}>
                    🏥 {result.labName}
                  </div>
                )}
              </div>
            )}
          </div>
          <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
            <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:4 }}>
              <div style={{ fontSize:11, color:MUTED }}>{reanalyzing?'⏳ Re-analyzing…':'Change language'}</div>
              <LangSelector value={lang} onChange={changeLanguage} />
            </div>
            <button onClick={() => { setPhase('upload'); setResult(null); }}
              style={{ padding:'8px 14px', background:'white', color:SEC, border:`1px solid ${BORDER}`, borderRadius:9, fontSize:12.5, fontWeight:600, cursor:'pointer' }}>
              Upload another
            </button>
            {currentFileId && (
              <button onClick={() => setShowShare(true)}
                style={{ padding:'8px 14px', background:TEAL, color:'white', border:'none', borderRadius:9, fontSize:12.5, fontWeight:700, cursor:'pointer' }}>
                📤 Share with doctor
              </button>
            )}
            {result && (
              <button onClick={() => { setShowSMS(true); setSmsResult(''); }}
                style={{ padding:'8px 14px', background:'#7c3aed', color:'white', border:'none', borderRadius:9, fontSize:12.5, fontWeight:700, cursor:'pointer' }}>
                📱 Send to phone
              </button>
            )}
          </div>
        </div>

        <div style={{ background:AMBER_P, border:`1px solid #fde68a`, borderRadius:9, padding:'8px 13px', marginBottom:14, fontSize:12.5, color:AMBER }}>
          Educational analysis only — not a medical diagnosis. Consult a doctor for treatment decisions.
        </div>

        {!result.aiAvailable && (
          <div style={{ background:AMBER_P, border:`1px solid #fde68a`, borderRadius:12, padding:'14px 16px', marginBottom:14 }}>
            <div style={{ fontWeight:700, fontSize:13, color:AMBER, marginBottom:4 }}>AI analysis temporarily unavailable</div>
            <div style={{ fontSize:13, color:SEC }}>{result.message}</div>
          </div>
        )}

        {reanalyzing && (
          <div style={{ background:BLUE_P, border:`1px solid #90caf9`, borderRadius:10, padding:'10px 14px', marginBottom:14, display:'flex', alignItems:'center', gap:10 }}>
            <div style={{ width:10, height:10, borderRadius:'50%', background:BLUE, animation:'rPulse 1s infinite' }} />
            <span style={{ fontSize:13, color:BLUE, fontWeight:600 }}>Re-analyzing in {LANGS.find(l => l.code===lang)?.native}…</span>
          </div>
        )}

        {/* Stats */}
        {result.healthScore !== null && (
          <div style={{ display:'grid', gridTemplateColumns:'auto 1fr 1fr 1fr', gap:12, marginBottom:18 }}>
            <div style={{ background:'white', borderRadius:12, padding:'14px 20px', border:`1px solid ${BORDER}`, textAlign:'center' }}>
              <div style={{ fontSize:11, fontWeight:700, color:MUTED, textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:4 }}>Health Score</div>
              <div style={{ fontSize:34, fontWeight:700, color:scoreColor, lineHeight:1 }}>{result.healthScore}</div>
              <div style={{ fontSize:12, color:scoreColor, marginTop:2 }}>{result.scoreLabel}</div>
            </div>
            <StatCard label="Abnormal Values"   value={abnormal} color={RED}   sub="Need attention" />
            <StatCard label="Normal Values"      value={normal}   color={GREEN} sub="Within range" />
            <StatCard label="Parameters Checked" value={result.parameters?.length||0} color={MUTED} sub="Total" />
          </div>
        )}

        {/* Tabs */}
        <div style={{ display:'flex', gap:2, marginBottom:14, borderBottom:`1px solid ${BORDER}`, paddingBottom:1 }}>
          <TabBtn id="findings"    label="Key Findings"   active={activeTab==='findings'}    onClick={setTab} badge={result.findings?.filter(f=>f.severity==='critical').length||0} />
          <TabBtn id="parameters"  label="All Parameters" active={activeTab==='parameters'}  onClick={setTab} badge={0} />
          <TabBtn id="plain"       label="Plain English"  active={activeTab==='plain'}       onClick={setTab} badge={0} />
          <TabBtn id="suggestions" label="What To Do"     active={activeTab==='suggestions'} onClick={setTab} badge={0} />
          <TabBtn id="doctors"     label="See a Doctor"   active={activeTab==='doctors'}     onClick={setTab} badge={0} />
        </div>

        {/* Findings */}
        {activeTab==='findings' && (
          <div style={{ background:'white', borderRadius:14, border:`1px solid ${BORDER}`, overflow:'hidden' }}>
            {result.findings?.length > 0 ? result.findings.map((f, i) => {
              const s = SEV[f.severity]||SEV.info;
              return (
                <div key={i} style={{ padding:'13px 16px', borderBottom:i<result.findings.length-1?`1px solid ${BORDER}`:'none', background:s.bg, display:'flex', gap:12 }}>
                  <span style={{ fontSize:18, flexShrink:0, marginTop:1 }}>{f.icon}</span>
                  <div>
                    <div style={{ fontWeight:700, fontSize:13.5, color:s.text, marginBottom:3 }}>{f.title}</div>
                    <div style={{ fontSize:13, color:SEC, lineHeight:1.65 }}>{f.detail}</div>
                  </div>
                </div>
              );
            }) : <div style={{ padding:32, textAlign:'center', color:MUTED, fontSize:13 }}>No findings — everything looks normal!</div>}
          </div>
        )}

        {/* Parameters */}
        {activeTab==='parameters' && (
          <div>
            {cats.length===0 && <div style={{ padding:32, textAlign:'center', color:MUTED, fontSize:13 }}>No parameters extracted from this report.</div>}
            {cats.map(cat => (
              <div key={cat} style={{ background:'white', borderRadius:14, border:`1px solid ${BORDER}`, overflow:'hidden', marginBottom:14 }}>
                <div style={{ padding:'11px 16px', borderBottom:`1px solid ${BORDER}`, display:'flex', justifyContent:'space-between' }}>
                  <span style={{ fontWeight:700, fontSize:14, color:NAVY }}>{cat}</span>
                  <span style={{ fontSize:12, color:MUTED }}>{result.parameters.filter(p=>(p.category||'Other')===cat && p.status!=='normal').length} abnormal</span>
                </div>
                {result.parameters.filter(p=>(p.category||'Other')===cat).map(p => <ParamRow key={p.name} p={p} />)}
              </div>
            ))}
          </div>
        )}

        {/* Suggestions */}
        {activeTab==='plain' && (
          <div style={{ background:'white', borderRadius:14, border:`1px solid ${BORDER}`, overflow:'hidden' }}>
            <div style={{ padding:'14px 18px', borderBottom:`1px solid ${BORDER}`, background:BLUE_P }}>
              <div style={{ fontWeight:800, fontSize:14, color:BLUE }}>
                {lang==='hi' ? '💬 सरल हिंदी में — हर जांच का अर्थ' : lang==='gu' ? '💬 સરળ ભાષામાં — દરેક ટેસ્ટ નો અર્થ' : '💬 What Every Test Means — In Plain Language'}
              </div>
              <div style={{ fontSize:12.5, color:SEC, marginTop:4, lineHeight:1.6 }}>
                {lang==='hi' ? 'हर जांच का सरल अर्थ — कोई जटिल चिकित्सा शब्दावली नहीं।' : lang==='gu' ? 'દરેક ટેસ્ટ નો સરળ અર્થ — કોઈ જટિલ શબ્દો નહીં.' : 'Simple explanations of what each test measures, what your result means, and which values are good or bad.'}
              </div>
            </div>
            {result.parameters?.length > 0 ? result.parameters.map((p, i) => {
              // Use Hindi guide when available for full Hindi translation
              const guide  = (lang === 'hi' && p.guideHi) ? p.guideHi : (p.guide || null);
              const isAbn  = p.status !== 'normal';
              const isHigh = p.status === 'high';
              const chip   = isAbn ? (isHigh ? { bg:'#fff1f2', border:'#fca5a5', text:'#dc2626', label:'▲ HIGH' } : { bg:'#fffbeb', border:'#fde68a', text:'#b45309', label:'▼ LOW' })
                                   : { bg:'#f0fdf4', border:'#86efac', text:'#16a34a', label:'✓ Normal' };
              return (
                <div key={i} style={{ borderBottom:i<result.parameters.length-1?`1px solid ${BORDER}`:'none' }}>
                  {/* ── Header ── */}
                  <div style={{ padding:'14px 18px 10px', display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:10 }}>
                    <div>
                      <div style={{ fontWeight:800, fontSize:14, color:NAVY }}>{p.name}</div>
                      {guide && <div style={{ fontSize:12, color:MUTED, marginTop:1 }}>{guide.unit}</div>}
                    </div>
                    <div style={{ display:'flex', alignItems:'center', gap:8, flexShrink:0 }}>
                      <span style={{ fontSize:16, fontWeight:800, color:NAVY }}>{p.value}</span>
                      <span style={{ fontSize:11, fontWeight:400, color:MUTED }}>{p.unit}</span>
                      <span style={{ fontSize:12, fontWeight:700, padding:'3px 10px', borderRadius:20,
                        background:chip.bg, color:chip.text, border:`1px solid ${chip.border}` }}>
                        {chip.label}
                      </span>
                    </div>
                  </div>

                  {/* ── What it measures ── */}
                  {/* What it measures — show Hindi p.plain or English guide */}
                  <div style={{ margin:'0 18px 10px', padding:'10px 14px', background:'#f8fafc', borderRadius:9,
                    borderLeft:'3px solid #93c5fd', fontSize:13, color:SEC, lineHeight:1.75 }}>
                    <span style={{ fontWeight:700, color:NAVY, marginRight:6 }}>
                      {lang==='hi' ? '🔬 यह जांच क्या मापती है:' : lang==='gu' ? '🔬 આ ટેસ્ટ શું માપે છે:' : '🔬 What this test measures:'}
                    </span>
                    {lang === 'gu' && p.plain
                      ? p.plain.split(' | ')[0]   /* Gujarati plain from getPlainExplanation */
                      : lang === 'hi' && p.plain
                        ? p.plain.split(' | ')[0] /* Hindi plain from getPlainExplanation */
                        : (guide ? guide.what : p.plain?.split(' | ')[0] || '')}
                  </div>

                  {/* ── Reference range table ── */}
                  {guide?.ranges && (
                    <div style={{ margin:'0 18px 10px' }}>
                      <div style={{ fontSize:11.5, fontWeight:700, color:MUTED, textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:6 }}>{lang==='hi' ? 'संदर्भ सीमाएं' : lang==='gu' ? 'સંદર્ભ સીમાઓ' : 'Reference Ranges'}</div>
                      <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                        {guide.ranges.map((r, ri) => {
                          const isCurrent = (p.status==='normal' && r.label.toLowerCase().includes('normal'))
                                          || (isHigh && (r.label.toLowerCase().includes('high') || r.label.toLowerCase().includes('elev') || r.label.toLowerCase().includes('above') || r.label.toLowerCase().includes('diabet') || r.label.toLowerCase().includes('insuf') || r.label.toLowerCase().includes('defic') || r.label.toLowerCase().includes('positive') || r.label.toLowerCase().includes('bord')))
                                          || (!isHigh && isAbn && (r.label.toLowerCase().includes('low') || r.label.toLowerCase().includes('defic') || r.label.toLowerCase().includes('hypo') || r.label.toLowerCase().includes('negative')));
                          return (
                            <div key={ri} style={{ display:'flex', gap:10, padding:'7px 10px', borderRadius:8,
                              background:isCurrent ? r.color+'18' : '#f8fafc',
                              border:isCurrent ? `1.5px solid ${r.color}50` : `1px solid ${BORDER}` }}>
                              <div style={{ width:10, height:10, borderRadius:'50%', background:r.color, flexShrink:0, marginTop:4 }} />
                              <div style={{ flex:1 }}>
                                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:3 }}>
                                  <span style={{ fontSize:12.5, fontWeight:700, color:r.color }}>{r.label}</span>
                                  <span style={{ fontSize:12, color:MUTED, fontFamily:'monospace' }}>{r.range}</span>
                                </div>
                                <div style={{ fontSize:12.5, color:isCurrent?'#374151':MUTED, lineHeight:1.6 }}>{r.meaning}</div>
                              </div>
                              {isCurrent && <div style={{ fontSize:14, flexShrink:0 }}>{lang==='hi' ? '← आप' : lang==='gu' ? '← તમે' : '← You'}</div>}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* ── Good range summary ── */}
                  {guide?.goodRange && (
                    <div style={{ margin:'0 18px 14px', padding:'8px 12px', background:'#f0fdf4', borderRadius:8,
                      border:'1px solid #bbf7d0', fontSize:12.5, color:'#166534' }}>
                      <span style={{ fontWeight:700 }}>✅ {lang==='hi' ? 'अच्छी सीमा:' : lang==='gu' ? 'સારી સીमा:' : 'Good range:'} </span>
                      {lang !== 'en' && p.plain ? p.plain.split(' | ')[1] || guide.goodRange : guide.goodRange}
                    </div>
                  )}

                  {/* ── Fallback for parameters not in guide ── */}
                  {!guide && p.referenceRange && (
                    <div style={{ margin:'0 18px 14px', padding:'9px 13px', background:SURFACE, borderRadius:8, fontSize:13, color:SEC, lineHeight:1.65 }}>
                      {p.plain || (lang==='hi'
                        ? `आपका ${p.name} परिणाम ${p.value} ${p.unit} है — संदर्भ सीमा ${p.referenceRange} ${p.unit} से ${p.status==='normal'?'सामान्य':'भिन्न'} है।`
                        : `Your ${p.name} result of ${p.value} ${p.unit} is ${p.status === 'normal' ? 'within' : 'outside'} the reference range of ${p.referenceRange} ${p.unit}.`)}
                      <div style={{ marginTop:5, fontSize:12, color:MUTED }}>📏 Reference: {p.referenceRange} {p.unit}</div>
                    </div>
                  )}
                </div>
              );
            }) : (
              <div style={{ padding:40, textAlign:'center', color:MUTED, fontSize:13.5 }}>
                No parameters found in this report.
              </div>
            )}
          </div>
        )}

        {activeTab==='suggestions' && (
          <div style={{ background:'white', borderRadius:14, border:`1px solid ${BORDER}`, overflow:'hidden' }}>
            {result.suggestions?.length > 0 ? result.suggestions.map((s, i) => (
              <div key={i} style={{ padding:'14px 16px', borderBottom:i<result.suggestions.length-1?`1px solid ${BORDER}`:'none' }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
                  <span style={{ fontSize:18 }}>{s.icon}</span>
                  <span style={{ fontWeight:700, fontSize:14, color:NAVY }}>{s.category}</span>
                </div>
                {s.items?.map((item, j) => (
                  <div key={j} style={{ display:'flex', gap:8, padding:'4px 0' }}>
                    <div style={{ width:5, height:5, borderRadius:'50%', background:BLUE, flexShrink:0, marginTop:7 }} />
                    <span style={{ fontSize:13, color:SEC, lineHeight:1.65 }}>{item}</span>
                  </div>
                ))}
              </div>
            )) : <div style={{ padding:32, textAlign:'center', color:MUTED, fontSize:13 }}>No suggestions available.</div>}
          </div>
        )}

        {/* Doctors */}
        {activeTab==='doctors' && (
          <div style={{ background:'white', borderRadius:14, border:`1px solid ${BORDER}`, overflow:'hidden' }}>
            {result.doctors?.map((d, i) => {
              const urgC = d.urgency==='high'?RED:d.urgency==='medium'?AMBER:GREEN;
              const urgB = d.urgency==='high'?RED_P:d.urgency==='medium'?AMBER_P:GREEN_P;
              const urgL = d.urgency==='high'?'Within 1–2 weeks':d.urgency==='medium'?'Within 1 month':'When convenient';
              return (
                <div key={i} style={{ padding:'13px 16px', borderBottom:i<result.doctors.length-1?`1px solid ${BORDER}`:'none', display:'flex', gap:12 }}>
                  <span style={{ fontSize:22, flexShrink:0 }}>{d.icon}</span>
                  <div style={{ flex:1 }}>
                    <div style={{ display:'flex', justifyContent:'space-between', flexWrap:'wrap', gap:6, marginBottom:3 }}>
                      <span style={{ fontWeight:700, fontSize:13.5, color:NAVY }}>{d.specialty}</span>
                      <span style={{ fontSize:11.5, fontWeight:600, padding:'2px 9px', borderRadius:4, background:urgB, color:urgC }}>{urgL}</span>
                    </div>
                    <div style={{ fontSize:13, color:SEC, lineHeight:1.5 }}>{d.reason}</div>
                  </div>
                </div>
              );
            })}
            <div style={{ padding:'13px 16px', background:BLUE_P, borderTop:`1px solid ${BORDER}` }}>
              <div style={{ fontWeight:700, fontSize:13, color:BLUE, marginBottom:4 }}>📅 Book an appointment directly</div>
              <div style={{ fontSize:12.5, color:'#1e3a5f', marginBottom:10 }}>Book through MediConnect — your report will be shared automatically.</div>
              <div style={{ display:'flex', gap:8 }}>
                <button onClick={() => router.push('/patient/appointments/book')}
                  style={{ padding:'8px 18px', background:BLUE, color:'white', border:'none', borderRadius:9, fontSize:12.5, fontWeight:700, cursor:'pointer' }}>
                  Book now
                </button>
                {currentFileId && (
                  <button onClick={() => setShowShare(true)}
                    style={{ padding:'8px 16px', background:TEAL, color:'white', border:'none', borderRadius:9, fontSize:12.5, fontWeight:700, cursor:'pointer' }}>
                    📤 Share this report
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {result.disclaimer && (
          <div style={{ marginTop:18, padding:'12px 14px', background:'#f8f4ff', border:`1px solid #e9d5ff`, borderRadius:10, fontSize:12, color:'#6b21a8', lineHeight:1.5 }}>
            ⚠️ {result.disclaimer}
          </div>
        )}

        <style>{`@keyframes rPulse{0%,100%{opacity:1}50%{opacity:.25}}`}</style>
      </div>
    );
  }

  return (
    <div style={{ display:'flex', height:'100vh', overflow:'hidden', fontFamily:'DM Sans, sans-serif' }}>
      <Sidebar />
      <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden', minWidth:0 }}>
        {showShare && result && (
          <ShareModal fileId={currentFileId} analysis={result} chatRooms={chatRooms} token={token()} onClose={() => setShowShare(false)} />
        )}

        {/* ── SMS Modal ── */}
        {showSMS && (
          <div style={{ position:'fixed', inset:0, background:'rgba(12,26,46,0.55)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}
            onClick={e => { if (e.target===e.currentTarget) { setShowSMS(false); setSmsResult(''); setSmsPhone(''); } }}>
            <div style={{ background:'white', borderRadius:16, width:'100%', maxWidth:420, overflow:'hidden', boxShadow:'0 12px 40px rgba(0,0,0,0.2)' }}>
              <div style={{ background:NAVY, padding:'14px 18px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                <div style={{ fontWeight:700, fontSize:15, color:'white' }}>📱 Send to Phone Number</div>
                <button onClick={() => { setShowSMS(false); setSmsResult(''); setSmsPhone(''); }}
                  style={{ background:'rgba(255,255,255,0.12)', border:'none', color:'white', width:28, height:28, borderRadius:'50%', cursor:'pointer', fontSize:16 }}>×</button>
              </div>
              <div style={{ padding:20 }}>
                <div style={{ fontSize:13, color:SEC, marginBottom:14, lineHeight:1.6 }}>
                  Send a summary of this report analysis to any phone number via SMS.
                  The recipient will receive the report type, health score, and key findings.
                </div>
                {result?.reportType && (
                  <div style={{ background:SURFACE, border:`1px solid ${BORDER}`, borderRadius:10, padding:'10px 14px', marginBottom:16, fontSize:13 }}>
                    <div style={{ fontWeight:700, color:NAVY, marginBottom:2 }}>{result.reportType}</div>
                    {result.healthScore != null && (
                      <div style={{ color:MUTED }}>Health Score: <strong style={{ color: result.healthScore>=80?GREEN:result.healthScore>=60?AMBER:RED }}>{result.healthScore}/100</strong></div>
                    )}
                  </div>
                )}
                {smsResult ? (
                  <div style={{ background: smsResult.startsWith('✅')?GREEN_P:smsResult.startsWith('⚠')?AMBER_P:RED_P,
                    border:`1px solid ${smsResult.startsWith('✅')?'#86efac':smsResult.startsWith('⚠')?'#fde68a':'#f5c6cb'}`,
                    borderRadius:10, padding:'12px 14px', fontSize:13,
                    color: smsResult.startsWith('✅')?GREEN:smsResult.startsWith('⚠')?AMBER:RED, marginBottom:14 }}>
                    {smsResult}
                  </div>
                ) : null}
                <div style={{ marginBottom:14 }}>
                  <label style={{ display:'block', fontSize:12, fontWeight:600, color:MUTED, marginBottom:6 }}>
                    Phone Number (with country code)
                  </label>
                  <input type="tel" value={smsPhone} onChange={e => { setSmsPhone(e.target.value); setSmsResult(''); }}
                    placeholder="+91 98765 43210"
                    style={{ width:'100%', padding:'10px 12px', border:`1.5px solid ${BORDER}`, borderRadius:9, fontSize:14, outline:'none', boxSizing:'border-box', fontFamily:'DM Sans, sans-serif' }} />
                  <div style={{ fontSize:11, color:MUTED, marginTop:4 }}>
                    Include country code, e.g. +91 for India, +1 for USA
                  </div>
                </div>
                <button onClick={sendReportSMS} disabled={smsBusy || smsResult.startsWith('✅')}
                  style={{ width:'100%', padding:'10px 14px', background: smsBusy||smsResult.startsWith('✅')?'#94a3b8':BLUE, color:'white', border:'none', borderRadius:9, fontSize:13, fontWeight:700, cursor: smsBusy||smsResult.startsWith('✅')?'not-allowed':'pointer' }}>
                  {smsBusy ? '📤 Sending…' : smsResult.startsWith('✅') ? '✅ Sent!' : '📱 Send SMS'}
                </button>
              </div>
            </div>
          </div>
        )}

        {renderContent()}
      </div>
    </div>
  );
}
