'use client';
/**
 * src/app/patient/login/page.js  (or src/app/login/page.js)
 *
 * CHANGE vs previous version:
 *   After successful login, checks sessionStorage for 'mc_post_login_redirect'.
 *   If present (set by the /report/view/[shareToken] page when user wasn't logged in),
 *   redirects the user back to the shared report instead of the dashboard.
 */

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { saveSession } from '@/lib/auth';

const API    = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';
const NAVY   = '#0c1a2e';
const BLUE   = '#1565c0';
const BLUE_P = '#e3f0ff';
const GREEN  = '#1b5e20', GREEN_P = '#e8f5e9';
const RED    = '#c62828', RED_P   = '#fdecea';
const BORDER = '#e2e8f0', MUTED   = '#8896a7';

function PatientLoginInner() {
  const router = useRouter();
  const params = useSearchParams();

  const [email,    setEmail]  = useState('');
  const [pass,     setPass]   = useState('');
  const [showPass, setShowP]  = useState(false);
  const [busy,     setBusy]   = useState(false);
  const [err,      setErr]    = useState('');
  const [regOk,    setRegOk]  = useState(false);

  useEffect(() => {
    if (params?.get('registered') === '1') setRegOk(true);
    const pre = params?.get('email');
    if (pre) setEmail(pre);
  }, []);

  async function doLogin(e) {
    e.preventDefault();
    if (!email.trim()) { setErr('Enter your email address.'); return; }
    if (!pass)         { setErr('Enter your password.');      return; }
    setBusy(true);
    setErr('');

    try {
      const r = await fetch(`${API}/auth/login`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email: email.trim().toLowerCase(), password: pass }),
      });
      const d = await r.json();

      if (!r.ok) {
        setErr(d.error || d.message || 'Login failed. Check your credentials.');
        setBusy(false);
        return;
      }

      const { token, user } = d;

      if (user.role !== 'PATIENT') {
        setErr('This is the Patient login. Doctors should use the Doctor login page.');
        setBusy(false);
        return;
      }

      const pat = user.patient || {};
      saveSession(token, {
        id:        user.id,
        userId:    user.id,
        email:     user.email,
        role:      user.role,
        firstName: pat.firstName || user.email.split('@')[0],
        lastName:  pat.lastName  || '',
        phone:     pat.phone     || '',
        patient:   user.patient  || null,
      });

      // ── NEW: redirect back to shared report if the user came from one ──
      // ShareReportModal and report/view/[shareToken] both store this key
      // in sessionStorage so the user lands on their report after login.
      try {
        const postLoginRedirect = sessionStorage.getItem('mc_post_login_redirect');
        if (postLoginRedirect) {
          sessionStorage.removeItem('mc_post_login_redirect');
          window.location.href = postLoginRedirect;
          return;
        }
      } catch {}

      // Default redirect
      // Also handle ?redirect= query param (used by report view page)
      const redirectParam = params?.get('redirect');
      if (redirectParam) {
        window.location.href = redirectParam;
        return;
      }

      window.location.href = '/patient';

    } catch {
      setErr('Cannot connect to the server. Make sure the backend is running.');
      setBusy(false);
    }
  }

  const inp = (val, set, type = 'text', ph = '') => (
    <input
      type={type}
      value={val}
      onChange={e => set(e.target.value)}
      placeholder={ph}
      style={{
        width: '100%', padding: '11px 14px',
        border: `1px solid ${BORDER}`, borderRadius: 10,
        fontSize: 14, fontFamily: 'DM Sans, sans-serif',
        outline: 'none', boxSizing: 'border-box', background: 'white',
      }}
    />
  );

  return (
    <div style={{
      minHeight: '100vh',
      background: `linear-gradient(135deg, ${NAVY} 0%, #1E3A5F 55%, #0e4a3a 100%)`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '24px 20px', fontFamily: 'DM Sans, sans-serif',
    }}>
      <div style={{ width: '100%', maxWidth: 440 }}>

        {/* Logo + Title */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{
            width: 72, height: 72, borderRadius: 18,
            background: 'linear-gradient(135deg, #1565c0 0%, #00796b 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 16px',
            boxShadow: '0 8px 28px rgba(0,0,0,0.35)',
          }}>
            <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="16" y="4" width="8" height="32" rx="3" fill="white" fillOpacity="0.95"/>
              <rect x="4" y="16" width="32" height="8" rx="3" fill="white" fillOpacity="0.95"/>
            </svg>
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, color: 'white', letterSpacing: '-0.5px', lineHeight: 1.1 }}>
            NexMedicon AI
          </div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginTop: 6 }}>
            Patient Portal
          </div>
        </div>

        <div style={{ background: 'white', borderRadius: 18, padding: '32px 28px', boxShadow: '0 24px 64px rgba(0,0,0,0.3)' }}>

          {regOk && (
            <div style={{ background: GREEN_P, border: `1px solid ${GREEN}30`, borderRadius: 10, padding: '12px 14px', marginBottom: 20, fontSize: 13, color: GREEN }}>
              <strong>✅ Registration successful!</strong> You can now sign in.
            </div>
          )}

          {/* Show a hint if user came from a shared report link */}
          {params?.get('redirect')?.includes('/report/view/') && (
            <div style={{ background: BLUE_P, border: `1px solid ${BLUE}30`, borderRadius: 10, padding: '12px 14px', marginBottom: 20, fontSize: 13, color: BLUE }}>
              🔒 <strong>A medical report has been shared with you.</strong><br />
              <span style={{ fontSize: 12, color: MUTED }}>Log in to view it securely.</span>
            </div>
          )}

          <div style={{ fontSize: 20, fontWeight: 700, color: NAVY, marginBottom: 6 }}>Patient Sign In</div>
          <div style={{ fontSize: 13, color: MUTED, marginBottom: 24 }}>
            Access your health records, reports, and appointments.
          </div>

          {err && (
            <div style={{ background: RED_P, border: `1px solid ${RED}30`, borderRadius: 9, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: RED }}>
              {err}
            </div>
          )}

          <form onSubmit={doLogin} noValidate>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: MUTED, marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Email Address
              </label>
              {inp(email, setEmail, 'email', 'your@email.com')}
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: MUTED, marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Password
              </label>
              <div style={{ position: 'relative' }}>
                {inp(pass, setPass, showPass ? 'text' : 'password', 'Enter your password')}
                <button type="button" onClick={() => setShowP(p => !p)}
                  style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: MUTED, fontSize: 14 }}>
                  {showPass ? '🙈' : '👁️'}
                </button>
              </div>
            </div>

            <button type="submit" disabled={busy}
              style={{ width: '100%', padding: '13px', background: busy ? MUTED : BLUE, color: 'white', border: 'none', borderRadius: 11, fontSize: 15, fontWeight: 700, cursor: busy ? 'default' : 'pointer', marginBottom: 16 }}>
              {busy ? 'Signing in…' : '🔑 Sign In'}
            </button>
          </form>

          <div style={{ textAlign: 'center', fontSize: 13, color: MUTED, borderTop: `1px solid ${BORDER}`, paddingTop: 16 }}>
            <div style={{ marginBottom: 8 }}>
              <button onClick={() => router.push('/login#forgot')}
                style={{ background: 'none', border: 'none', color: BLUE, cursor: 'pointer', fontSize: 13 }}>
                Forgot password?
              </button>
            </div>
            <div style={{ marginBottom: 8 }}>
              New to NexMedicon?{' '}
              <button onClick={() => router.push('/register?role=PATIENT')}
                style={{ background: 'none', border: 'none', color: BLUE, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                Create an account
              </button>
            </div>
            <div>
              <button onClick={() => router.push('/doctor/login')}
                style={{ background: 'none', border: 'none', color: MUTED, cursor: 'pointer', fontSize: 12 }}>
                Doctor? Sign in here →
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PatientLoginPage() {
  return (
    <Suspense fallback={
      <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', background: '#0c1a2e', fontFamily: 'DM Sans, sans-serif', fontSize: 14, color: '#8896a7' }}>
        Loading…
      </div>
    }>
      <PatientLoginInner />
    </Suspense>
  );
}