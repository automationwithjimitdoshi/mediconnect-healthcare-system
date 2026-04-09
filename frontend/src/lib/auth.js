/**
 * src/lib/auth.js — NexMedicon AI Session Manager
 *
 * ROLE-SCOPED STORAGE — Patient and Doctor sessions never interfere:
 *   Patient  → mc_token_patient / mc_user_patient
 *   Doctor   → mc_token_doctor  / mc_user_doctor
 *
 * SSR-SAFE — All localStorage/sessionStorage access is guarded by
 * typeof window checks so Next.js SSR never crashes.
 * Do NOT add 'use client' — this is a plain utility module, not a component.
 *
 * Works on: Desktop browser tabs · Android WebView · iOS WebView · Expo
 */

const KEYS = {
  PATIENT: { token: 'mc_token_patient', user: 'mc_user_patient' },
  DOCTOR:  { token: 'mc_token_doctor',  user: 'mc_user_doctor'  },
};
const LEGACY = { token: 'mc_token', user: 'mc_user' };

/* ── SSR guard — never access storage on server ────────────────────────── */
const isBrowser = () => typeof window !== 'undefined';

/* ── Safe storage helpers ───────────────────────────────────────────────── */
function lsGet(key) {
  if (!isBrowser()) return null;
  try { return localStorage.getItem(key); } catch { return null; }
}
function lsSet(key, val) {
  if (!isBrowser()) return;
  try { localStorage.setItem(key, val); } catch {}
}
function lsDel(key) {
  if (!isBrowser()) return;
  try { localStorage.removeItem(key); } catch {}
}
function ssGet(key) {
  if (!isBrowser()) return null;
  try { return sessionStorage.getItem(key); } catch { return null; }
}
function ssSet(key, val) {
  if (!isBrowser()) return;
  try { sessionStorage.setItem(key, val); } catch {}
}
function ssDel(key) {
  if (!isBrowser()) return;
  try { sessionStorage.removeItem(key); } catch {}
}

/* ── Role key lookup ────────────────────────────────────────────────────── */
function keysFor(role) {
  return KEYS[(role || '').toUpperCase()] || null;
}

/* ── Auto-detect role from URL path ────────────────────────────────────── */
function detectRole() {
  if (!isBrowser()) return null;
  const p = window.location.pathname;
  if (p.startsWith('/doctor'))  return 'DOCTOR';
  if (p.startsWith('/patient')) return 'PATIENT';
  return null;
}

/**
 * saveSession(token, user)
 * Writes to role-scoped keys (primary) + legacy keys (backward compat).
 * Call this on every successful login.
 */
export function saveSession(token, user) {
  if (!token || !user) return;
  const str = JSON.stringify(user);
  const k   = keysFor(user.role);

  if (k) {
    lsSet(k.token, token); lsSet(k.user, str);
    ssSet(k.token, token); ssSet(k.user, str);
  }
  // Legacy keys — keep for any pages not yet updated
  lsSet(LEGACY.token, token);
  lsSet(LEGACY.user,  str);
}

/**
 * getToken(role?)
 * sessionStorage first (tab isolation on desktop), then localStorage.
 * If no role given, auto-detects from URL.
 */
export function getToken(role) {
  const r = role || detectRole();
  if (r) {
    const k = keysFor(r);
    if (k) return ssGet(k.token) || lsGet(k.token) || '';
  }
  // No role context — try all
  return ssGet(KEYS.DOCTOR.token)  || lsGet(KEYS.DOCTOR.token)  ||
         ssGet(KEYS.PATIENT.token) || lsGet(KEYS.PATIENT.token) ||
         lsGet(LEGACY.token) || '';
}

/**
 * getUser(role?)
 * Returns the parsed user object for the given role.
 * Returns {} if not found (never throws).
 */
export function getUser(role) {
  const r = role || detectRole();
  let raw = null;

  if (r) {
    const k = keysFor(r);
    if (k) raw = ssGet(k.user) || lsGet(k.user);
  } else {
    raw = ssGet(KEYS.DOCTOR.user)  || lsGet(KEYS.DOCTOR.user)  ||
          ssGet(KEYS.PATIENT.user) || lsGet(KEYS.PATIENT.user) ||
          lsGet(LEGACY.user);
  }

  try { return JSON.parse(raw || '{}') || {}; } catch { return {}; }
}

/**
 * clearSession(role?)
 * Clears ONLY the given role's keys — other role is untouched.
 * If no role given, clears everything.
 */
export function clearSession(role) {
  const r = role || detectRole();
  if (r) {
    const k = keysFor(r);
    if (k) {
      lsDel(k.token); lsDel(k.user);
      ssDel(k.token); ssDel(k.user);
    }
    // Clear legacy only if it belongs to this role
    const lu = (() => { try { return JSON.parse(lsGet(LEGACY.user) || '{}'); } catch { return {}; } })();
    if (!lu.role || lu.role === r) {
      lsDel(LEGACY.token); lsDel(LEGACY.user);
    }
  } else {
    Object.values(KEYS).forEach(k => {
      lsDel(k.token); lsDel(k.user);
      ssDel(k.token); ssDel(k.user);
    });
    lsDel(LEGACY.token); lsDel(LEGACY.user);
  }
}

/** True if a valid session exists for the given role (or any role) */
export function hasSession(role) {
  return !!getToken(role);
}

/** Returns 'PATIENT' | 'DOCTOR' | null based on current URL */
export function getRole() {
  return detectRole();
}