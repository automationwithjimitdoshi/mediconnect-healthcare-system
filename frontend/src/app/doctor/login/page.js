'use client';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
/**
 * src/app/doctor/login/page.js
 * Doctor-specific login page — NexMedicon AI
 */
import { useState, Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { saveSession } from '@/lib/auth';

const API    = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';
const NAVY   = '#0c1a2e';
const BLUE   = '#1565c0';
const BLUE_P = '#e3f0ff';
const GREEN  = '#1b5e20', GREEN_P = '#e8f5e9';
const RED    = '#c62828', RED_P   = '#fdecea';
const AMBER  = '#b45309', AMBER_P = '#fff7ed';
const BORDER = '#e2e8f0', MUTED = '#8896a7';

function DoctorLoginPageInner() {
  const router = useRouter();
  const params = useSearchParams();

  const [email,      setEmail]  = useState('');
  const [pass,       setPass]   = useState('');
  const [showPass,   setShowP]  = useState(false);
  const [busy,       setBusy]   = useState(false);
  const [err,        setErr]    = useState('');
  const [regOk,      setRegOk]  = useState(false);
  const [appEmailInfo, setAppEmailInfo] = useState('');

  useEffect(() => {
    if (params?.get('registered') === '1') setRegOk(true);
    const pre = params?.get('email');
    if (pre) setEmail(pre);
    const appEmail = params?.get('appEmail');
    if (appEmail) {
      setEmail(appEmail);
      setAppEmailInfo(appEmail);
    }
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
        // Handle specific doctor error states
        if (d.error === 'PENDING_REVIEW') {
          setErr('');
          setBusy(false);
          // Show pending state inline
          setErr('PENDING_REVIEW');
          return;
        }
        if (d.error === 'ACCOUNT_REJECTED') {
          setErr(d.message || 'Your account was not approved. Contact support@nexmedicon.ai.');
          setBusy(false);
          return;
        }
        setErr(d.error || d.message || 'Login failed. Check your credentials.');
        setBusy(false);
        return;
      }

      const { token, user } = d;
      if (user.role !== 'DOCTOR') {
        setErr('This is the Doctor login. Patients should use the Patient login page.');
        setBusy(false);
        return;
      }

      const doc = user.doctor || {};
      saveSession(token, {
        id:        user.id,
        userId:    user.id,
        email:     user.email,
        role:      user.role,
        firstName: doc.firstName || user.email.split('@')[0],
        lastName:  doc.lastName  || '',
        phone:     doc.phone     || '',
        specialty: doc.specialty || '',
        photoUrl:  doc.photoUrl  || null,
        doctor:    user.doctor   || null,
      });

      // Store app email for profile modal display
      try { localStorage.setItem('mc_doctor_app_email', user.email); } catch {}

      window.location.href = '/doctor';
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

  // Pending review state
  if (err === 'PENDING_REVIEW') {
    return (
      <div style={{
        minHeight: '100vh',
        background: `linear-gradient(135deg, ${NAVY} 0%, #1E3A5F 60%, ${NAVY} 100%)`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '24px 20px', fontFamily: 'DM Sans, sans-serif',
      }}>
        <div style={{ width: '100%', maxWidth: 440 }}>
          <div style={{ background: 'white', borderRadius: 18, padding: '36px 28px', boxShadow: '0 24px 64px rgba(0,0,0,0.3)', textAlign: 'center' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>⏳</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: NAVY, marginBottom: 8 }}>Account Under Review</div>
            <div style={{ fontSize: 13, color: MUTED, lineHeight: 1.7, marginBottom: 24 }}>
              Your medical credentials are being verified by our team.
              This typically takes <strong>24–48 hours</strong>.
              You'll receive an email once your account is approved.
            </div>
            <div style={{ background: AMBER_P, border: `1px solid ${AMBER}30`, borderRadius: 10, padding: '12px 16px', fontSize: 12.5, color: AMBER, lineHeight: 1.6, marginBottom: 20 }}>
              💡 If you believe this is a mistake or need urgent access,
              contact <strong>support@nexmedicon.ai</strong>
            </div>
            <button
              onClick={() => { setErr(''); setPass(''); }}
              style={{ padding: '11px 28px', background: BLUE, color: 'white', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
            >
              ← Back to Sign In
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: `linear-gradient(135deg, ${NAVY} 0%, #1E3A5F 55%, ${NAVY} 100%)`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '24px 20px', fontFamily: 'DM Sans, sans-serif',
    }}>
      <div style={{ width: '100%', maxWidth: 440 }}>

        {/* Logo + Title */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{
            width: 72, height: 72, borderRadius: 18,
            background: 'linear-gradient(135deg, #1565c0 0%, #0c1a2e 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 16px',
            boxShadow: '0 8px 28px rgba(0,0,0,0.35)',
          }}>
            <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="16" y="4" width="8" height="32" rx="3" fill="white" fillOpacity="0.95"/>
              <rect x="4" y="16" width="32" height="8" rx="3" fill="white" fillOpacity="0.95"/>
              <path d="M4 20 L10 20 L13 14 L17 26 L21 18 L24 22 L27 20 L36 20"
                stroke="white" strokeWidth="1.5" strokeOpacity="0.35"
                strokeLinecap="round" strokeLinejoin="round" fill="none"/>
            </svg>
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, color: 'white', letterSpacing: '-0.5px', lineHeight: 1.1 }}>
            NexMedicon AI
          </div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginTop: 6, letterSpacing: '0.02em' }}>
            Doctor Portal — Clinical Dashboard
          </div>
        </div>

        <div style={{ background: 'white', borderRadius: 18, padding: '32px 28px', boxShadow: '0 24px 64px rgba(0,0,0,0.3)' }}>

          {regOk && (
            <div style={{
              background: GREEN_P, border: `1px solid ${GREEN}30`,
              borderRadius: 10, padding: '12px 14px', marginBottom: 20, fontSize: 13, color: GREEN,
            }}>
              <strong>✅ Registration submitted!</strong> Check your email for your app login credentials.
            </div>
          )}

          {appEmailInfo && (
            <div style={{
              background: BLUE_P, border: `1px solid ${BLUE}30`,
              borderRadius: 10, padding: '12px 14px', marginBottom: 20, fontSize: 13, color: BLUE,
            }}>
              <strong>🔑 Your app login email:</strong><br />
              <code style={{ fontFamily: 'monospace', fontSize: 13 }}>{appEmailInfo}</code><br />
              <span style={{ fontSize: 11, color: MUTED }}>Use this email (not your personal email) to sign in.</span>
            </div>
          )}

          <div style={{ fontSize: 20, fontWeight: 700, color: NAVY, marginBottom: 6 }}>Doctor Sign In</div>
          <div style={{ fontSize: 13, color: MUTED, marginBottom: 24 }}>
            Sign in with your NexMedicon app email address.
          </div>

          {err && err !== 'PENDING_REVIEW' && (
            <div style={{
              background: RED_P, border: `1px solid ${RED}30`,
              borderRadius: 9, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: RED,
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
                App Email Address
              </label>
              {inp(email, setEmail, 'email', 'e.g. dsharma@nexmedicon.ai')}
              <div style={{ fontSize: 11, color: MUTED, marginTop: 4 }}>
                Use the @nexmedicon.ai email sent to you during registration.
              </div>
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
                background: busy ? MUTED : BLUE,
                color: 'white', border: 'none', borderRadius: 11,
                fontSize: 15, fontWeight: 700,
                cursor: busy ? 'default' : 'pointer', marginBottom: 16,
              }}
            >
              {busy ? 'Signing in…' : '🩺 Sign In to Doctor Portal'}
            </button>

          </form>

          <div style={{
            textAlign: 'center', fontSize: 13, color: MUTED,
            borderTop: `1px solid ${BORDER}`, paddingTop: 16,
          }}>
            <div style={{ marginBottom: 8 }}>
              <button
                onClick={() => router.push('/login#forgot')}
                style={{ background: 'none', border: 'none', color: BLUE, cursor: 'pointer', fontSize: 13 }}
              >
                Forgot password?
              </button>
            </div>
            <div style={{ marginBottom: 8 }}>
              Not registered yet?{' '}
              <button
                onClick={() => router.push('/register?role=DOCTOR')}
                style={{ background: 'none', border: 'none', color: BLUE, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
              >
                Register as Doctor
              </button>
            </div>
            <div>
              <button
                onClick={() => router.push('/patient/login')}
                style={{ background: 'none', border: 'none', color: MUTED, cursor: 'pointer', fontSize: 12 }}
              >
                Patient? Sign in here →
              </button>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

export default function DoctorLoginPage() {
  return (
    <Suspense fallback={
      <div style={{
        display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'DM Sans, sans-serif', fontSize: 14, color: '#8896a7', background: '#0c1a2e',
      }}>
        Loading…
      </div>
    }>
      <DoctorLoginPageInner />
    </Suspense>
  );
}