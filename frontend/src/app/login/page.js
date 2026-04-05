'use client';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
/**
 * src/app/login/page.js
 * Landing login page — shows role selector (Patient / Doctor).
 * Also handles #forgot hash for forgot-password flow (backward compat).
 */
import { useState, Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

const API  = 'http://localhost:5000/api';
const NAVY = '#0c1a2e', BLUE = '#1565c0', BLUE_P = '#e3f0ff';
const TEAL = '#00796b', TEAL_P = '#e0f5f0';
const GREEN = '#1b5e20', GREEN_P = '#e8f5e9', RED = '#c62828', RED_P = '#fdecea';
const BORDER = '#e2e8f0', MUTED = '#8896a7', SURFACE = '#f7f9fc';

function LoginLandingPageInner() {
  const router  = useRouter();
  const params  = useSearchParams();
  const [showForgot, setShowForgot] = useState(false);
  // Forgot password state
  const [fpEmail, setFpEmail] = useState('');
  const [fpStep,  setFpStep]  = useState(1); // 1=email, 2=otp, 3=new-pass, 4=done
  const [fpOtp,   setFpOtp]   = useState('');
  const [fpPass,  setFpPass]  = useState('');
  const [fpPass2, setFpPass2] = useState('');
  const [fpBusy,  setFpBusy]  = useState(false);
  const [fpErr,   setFpErr]   = useState('');
  const [fpInfo,  setFpInfo]  = useState('');

  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.hash === '#forgot') setShowForgot(true);
    const pre = params?.get('email');
    if (pre) setFpEmail(pre);
  }, []);

  // ── Forgot password steps ────────────────────────────────────────────────
  async function sendOtp(e) {
    e.preventDefault();
    if (!fpEmail.trim()) { setFpErr('Enter your email address.'); return; }
    setFpBusy(true); setFpErr(''); setFpInfo('');
    try {
      const r = await fetch(`${API}/auth/forgot-password`, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ email: fpEmail.trim().toLowerCase() }),
      });
      const d = await r.json();
      if (!r.ok) { setFpErr(d.error||'Failed to send OTP.'); setFpBusy(false); return; }
      setFpInfo(d.message || 'OTP sent. Check your inbox or the backend console.');
      setFpStep(2);
    } catch { setFpErr('Cannot reach server.'); }
    setFpBusy(false);
  }

  async function verifyOtp(e) {
    e.preventDefault();
    if (!fpOtp.trim()) { setFpErr('Enter the OTP.'); return; }
    setFpBusy(true); setFpErr('');
    try {
      const r = await fetch(`${API}/auth/verify-otp`, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ email: fpEmail.trim().toLowerCase(), otp: fpOtp.trim() }),
      });
      const d = await r.json();
      if (!r.ok) { setFpErr(d.error||'Invalid OTP.'); setFpBusy(false); return; }
      setFpStep(3);
    } catch { setFpErr('Cannot reach server.'); }
    setFpBusy(false);
  }

  async function resetPass(e) {
    e.preventDefault();
    if (fpPass.length < 6) { setFpErr('Password must be at least 6 characters.'); return; }
    if (fpPass !== fpPass2) { setFpErr('Passwords do not match.'); return; }
    setFpBusy(true); setFpErr('');
    try {
      const r = await fetch(`${API}/auth/reset-password`, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ email: fpEmail.trim().toLowerCase(), otp: fpOtp.trim(), newPassword: fpPass }),
      });
      const d = await r.json();
      if (!r.ok) { setFpErr(d.error||'Reset failed.'); setFpBusy(false); return; }
      setFpStep(4);
    } catch { setFpErr('Cannot reach server.'); }
    setFpBusy(false);
  }

  const inp = (val, set, type='text', ph='') => (
    <input type={type} value={val} onChange={e=>set(e.target.value)} placeholder={ph}
      style={{width:'100%',padding:'11px 14px',border:`1px solid ${BORDER}`,borderRadius:10,
        fontSize:14,fontFamily:'DM Sans,sans-serif',outline:'none',boxSizing:'border-box',background:'white'}} />
  );

  if (showForgot) return (
    <div style={{minHeight:'100vh',background:`linear-gradient(135deg,${NAVY} 0%,#1E3A5F 100%)`,
      display:'flex',alignItems:'center',justifyContent:'center',padding:24,fontFamily:'DM Sans,sans-serif'}}>
      <div style={{width:'100%',maxWidth:420,background:'white',borderRadius:18,padding:'32px 28px',boxShadow:'0 24px 64px rgba(0,0,0,0.3)'}}>
        <div style={{fontSize:20,fontWeight:700,color:NAVY,marginBottom:4}}>Reset Password</div>
        <div style={{fontSize:13,color:MUTED,marginBottom:24}}>
          {fpStep===1?'Enter your email to receive an OTP.':fpStep===2?'Enter the OTP sent to your email.':fpStep===3?'Set a new password.':'Password reset!'}
        </div>
        {fpErr&&<div style={{background:RED_P,border:`1px solid ${RED}30`,borderRadius:9,padding:'10px 14px',marginBottom:14,fontSize:13,color:RED}}>{fpErr}</div>}
        {fpInfo&&<div style={{background:GREEN_P,border:`1px solid ${GREEN}30`,borderRadius:9,padding:'10px 14px',marginBottom:14,fontSize:13,color:GREEN}}>{fpInfo}</div>}
        {fpStep===1&&<form onSubmit={sendOtp}>{inp(fpEmail,setFpEmail,'email','Registered email')}<button type="submit" disabled={fpBusy} style={{width:'100%',padding:'13px',background:BLUE,color:'white',border:'none',borderRadius:11,fontSize:15,fontWeight:700,cursor:'pointer',marginTop:16}}>{fpBusy?'Sending…':'Send OTP'}</button></form>}
        {fpStep===2&&<form onSubmit={verifyOtp}>{inp(fpOtp,setFpOtp,'text','6-digit OTP')}<button type="submit" disabled={fpBusy} style={{width:'100%',padding:'13px',background:BLUE,color:'white',border:'none',borderRadius:11,fontSize:15,fontWeight:700,cursor:'pointer',marginTop:16}}>{fpBusy?'Verifying…':'Verify OTP'}</button></form>}
        {fpStep===3&&<form onSubmit={resetPass}><div style={{marginBottom:12}}>{inp(fpPass,setFpPass,'password','New password (min 6 chars)')}</div>{inp(fpPass2,setFpPass2,'password','Confirm new password')}<button type="submit" disabled={fpBusy} style={{width:'100%',padding:'13px',background:BLUE,color:'white',border:'none',borderRadius:11,fontSize:15,fontWeight:700,cursor:'pointer',marginTop:16}}>{fpBusy?'Saving…':'Set New Password'}</button></form>}
        {fpStep===4&&<div style={{textAlign:'center'}}><div style={{fontSize:40,marginBottom:12}}>✅</div><div style={{fontSize:15,color:GREEN,fontWeight:600}}>Password updated!</div><button onClick={()=>setShowForgot(false)} style={{marginTop:16,padding:'11px 24px',background:BLUE,color:'white',border:'none',borderRadius:10,fontSize:14,cursor:'pointer',fontWeight:600}}>Back to Sign In</button></div>}
        {fpStep<4&&<button onClick={()=>setShowForgot(false)} style={{width:'100%',marginTop:14,padding:'10px',background:'none',border:`1px solid ${BORDER}`,borderRadius:10,fontSize:13,cursor:'pointer',color:MUTED}}>← Back to Sign In</button>}
      </div>
    </div>
  );

  return (
    <div style={{minHeight:'100vh',background:`linear-gradient(135deg,${NAVY} 0%,#1E3A5F 50%,${NAVY} 100%)`,
      display:'flex',alignItems:'center',justifyContent:'center',padding:'24px 20px',
      fontFamily:'DM Sans,sans-serif'}}>
      <div style={{width:'100%',maxWidth:440}}>

        <div style={{textAlign:'center',marginBottom:36}}>
          <div style={{fontSize:40,marginBottom:10}}>⚕️</div>
          <div style={{fontSize:28,fontWeight:700,color:'white',letterSpacing:'-0.5px'}}>MediConnect AI</div>
          <div style={{fontSize:14,color:'rgba(255,255,255,0.55)',marginTop:6}}>Healthcare Intelligence Platform</div>
        </div>

        <div style={{fontSize:15,fontWeight:600,color:'rgba(255,255,255,0.7)',textAlign:'center',marginBottom:20}}>
          Who are you signing in as?
        </div>

        <div style={{display:'flex',flexDirection:'column',gap:14}}>

          {/* Patient login card */}
          <button onClick={()=>router.push('/patient/login')}
            style={{background:'white',border:'none',borderRadius:16,padding:'22px 24px',
              cursor:'pointer',textAlign:'left',display:'flex',alignItems:'center',gap:16,
              boxShadow:'0 4px 20px rgba(0,0,0,0.15)',transition:'transform 0.1s'}}>
            <div style={{width:52,height:52,borderRadius:14,background:TEAL_P,
              display:'flex',alignItems:'center',justifyContent:'center',fontSize:26,flexShrink:0}}>
              🏥
            </div>
            <div style={{flex:1}}>
              <div style={{fontSize:17,fontWeight:700,color:NAVY}}>I'm a Patient</div>
              <div style={{fontSize:13,color:MUTED,marginTop:3}}>
                Access appointments, chat with your doctor, analyze reports
              </div>
            </div>
            <div style={{fontSize:20,color:MUTED}}>→</div>
          </button>

          {/* Doctor login card */}
          <button onClick={()=>router.push('/doctor/login')}
            style={{background:'white',border:'none',borderRadius:16,padding:'22px 24px',
              cursor:'pointer',textAlign:'left',display:'flex',alignItems:'center',gap:16,
              boxShadow:'0 4px 20px rgba(0,0,0,0.15)'}}>
            <div style={{width:52,height:52,borderRadius:14,background:BLUE_P,
              display:'flex',alignItems:'center',justifyContent:'center',fontSize:26,flexShrink:0}}>
              🩺
            </div>
            <div style={{flex:1}}>
              <div style={{fontSize:17,fontWeight:700,color:NAVY}}>I'm a Doctor</div>
              <div style={{fontSize:13,color:MUTED,marginTop:3}}>
                Manage appointments, review reports, clinical dashboard
              </div>
            </div>
            <div style={{fontSize:20,color:MUTED}}>→</div>
          </button>
        </div>

        <div style={{textAlign:'center',marginTop:24,fontSize:13,color:'rgba(255,255,255,0.5)'}}>
          New here?{' '}
          <button onClick={()=>router.push('/register')}
            style={{background:'none',border:'none',color:'rgba(255,255,255,0.8)',
              cursor:'pointer',fontSize:13,fontWeight:600,textDecoration:'underline'}}>
            Create an account
          </button>
        </div>
      </div>
    </div>
  );
}

export default function LoginLandingPage() {
  return (
    <Suspense fallback={<div style={{display:'flex',height:'100vh',alignItems:'center',justifyContent:'center',fontFamily:'DM Sans, sans-serif',fontSize:14,color:'#8896a7'}}>Loading…</div>}>
      <LoginLandingPageInner/>
    </Suspense>
  );
}