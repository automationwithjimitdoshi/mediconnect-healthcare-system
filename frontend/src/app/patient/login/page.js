'use client';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
/**
 * src/app/patient/login/page.js
 * Patient-specific login page.
 */
import { useState, Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

const API   = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';
const NAVY  = '#0c1a2e';
const GREEN = '#1b5e20', GREEN_P = '#e8f5e9';
const RED   = '#c62828', RED_P   = '#fdecea';
const TEAL  = '#00796b';
const BORDER = '#e2e8f0', MUTED = '#8896a7';

function PatientLoginPageInner() {
  const router = useRouter();
  const params = useSearchParams();

  const [email,    setEmail] = useState('');
  const [pass,     setPass]  = useState('');
  const [showPass, setShowP] = useState(false);
  const [busy,     setBusy]  = useState(false);
  const [err,      setErr]   = useState('');
  const [regOk,    setRegOk] = useState(false);

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
      const p = user.patient || {};
      localStorage.setItem('mc_token', token);
      localStorage.setItem('mc_user', JSON.stringify({
        id:        user.id,
        userId:    user.id,
        email:     user.email,
        role:      user.role,
        firstName: p.firstName || user.email.split('@')[0],
        lastName:  p.lastName  || '',
        phone:     p.phone     || '',
        photoUrl:  p.photoUrl  || null,
        patient:   user.patient || null,
      }));
      // ✅ FIX: hard navigate instead of router.push so login page
      //         never re-renders and causes the blink
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
        fontSize: 14, fontFamily: 'DM Sans,sans-serif',
        outline: 'none', boxSizing: 'border-box', background: 'white',
      }}
    />
  );

  return (
    <div style={{
      minHeight: '100vh',
      background: `linear-gradient(135deg,${TEAL} 0%,${NAVY} 60%,${NAVY} 100%)`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '24px 20px', fontFamily: 'DM Sans,sans-serif',
    }}>
      <div style={{ width: '100%', maxWidth: 440 }}>

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          {/* Replace /logo.png with your actual logo file placed in /public/logo.png */}
          <div style={{
            width: 72, height: 72, borderRadius: 18,
            background: 'rgba(255,255,255,0.12)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 14px', fontSize: 38,
            boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
          }}>
            🏥
            {/* Uncomment below and remove the emoji above once you have a logo:
            <img src="/logo.png" alt="NexMedicon AI"
              style={{ width: 48, height: 48, borderRadius: 10, objectFit: 'contain' }} />
            */}
          </div>
          <div style={{ fontSize: 26, fontWeight: 700, color: 'white', letterSpacing: '-0.5px' }}>
            Patient Portal
          </div>
          <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.55)', marginTop: 4 }}>
            NexMedicon AI — Your Health Dashboard
          </div>
        </div>

        <div style={{
          background: 'white', borderRadius: 18, padding: '32px 28px',
          boxShadow: '0 24px 64px rgba(0,0,0,0.3)',
        }}>

          {regOk && (
            <div style={{
              background: GREEN_P, border: `1px solid ${GREEN}30`,
              borderRadius: 10, padding: '12px 14px', marginBottom: 20,
              fontSize: 13, color: GREEN,
            }}>
              <strong>✅ Account created!</strong> Sign in to access your health dashboard.
            </div>
          )}

          <div style={{ fontSize: 20, fontWeight: 700, color: NAVY, marginBottom: 6 }}>
            Welcome back
          </div>
          <div style={{ fontSize: 13, color: MUTED, marginBottom: 24 }}>
            Sign in to manage your appointments and health records.
          </div>

          {err && (
            <div style={{
              background: RED_P, border: `1px solid ${RED}30`,
              borderRadius: 9, padding: '10px 14px', marginBottom: 16,
              fontSize: 13, color: RED,
            }}>
              {err}
            </div>
          )}

          <form onSubmit={doLogin} noValidate>

            <div style={{ marginBottom: 16 }}>
              <label style={{
                display: 'block', fontSize: 12, fontWeight: 600, color: MUTED,
                marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.05em',
              }}>
                Email Address
              </label>
              {inp(email, setEmail, 'email', 'Enter your registered email')}
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{
                display: 'block', fontSize: 12, fontWeight: 600, color: MUTED,
                marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.05em',
              }}>
                Password
              </label>
              <div style={{ position: 'relative' }}>
                {inp(pass, setPass, showPass ? 'text' : 'password', 'Enter your password')}
                <button
                  type="button"
                  onClick={() => setShowP(p => !p)}
                  style={{
                    position: 'absolute', right: 12, top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none', border: 'none',
                    cursor: 'pointer', color: MUTED, fontSize: 14,
                  }}
                >
                  {showPass ? '🙈' : '👁️'}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={busy}
              style={{
                width: '100%', padding: '13px',
                background: busy ? MUTED : TEAL,
                color: 'white', border: 'none', borderRadius: 11,
                fontSize: 15, fontWeight: 700,
                cursor: busy ? 'default' : 'pointer', marginBottom: 16,
              }}
            >
              {busy ? 'Signing in…' : '🏥 Sign In to Patient Portal'}
            </button>

          </form>

          <div style={{
            textAlign: 'center', fontSize: 13, color: MUTED,
            borderTop: `1px solid ${BORDER}`, paddingTop: 16,
          }}>
            <div style={{ marginBottom: 8 }}>
              <button
                onClick={() => router.push('/login#forgot')}
                style={{ background: 'none', border: 'none', color: TEAL, cursor: 'pointer', fontSize: 13 }}
              >
                Forgot password?
              </button>
            </div>
            <div>
              New patient?{' '}
              <button
                onClick={() => router.push('/register?role=PATIENT')}
                style={{ background: 'none', border: 'none', color: TEAL, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
              >
                Create account
              </button>
            </div>
            <div style={{ marginTop: 8 }}>
              <button
                onClick={() => router.push('/doctor/login')}
                style={{ background: 'none', border: 'none', color: MUTED, cursor: 'pointer', fontSize: 12 }}
              >
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
      <div style={{
        display: 'flex', height: '100vh',
        alignItems: 'center', justifyContent: 'center',
        fontFamily: 'DM Sans, sans-serif', fontSize: 14, color: '#8896a7',
        background: '#0c1a2e',
      }}>
        Loading…
      </div>
    }>
      <PatientLoginPageInner />
    </Suspense>
  );
}