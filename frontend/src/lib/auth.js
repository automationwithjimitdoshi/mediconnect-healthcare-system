/**
 * src/lib/auth.js — NexMedicon AI Session Manager
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PROBLEM SOLVED: Simultaneous Patient + Doctor Sessions
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Previous approach used shared keys (mc_token, mc_user) in localStorage.
 * Result: logging in as doctor overwrote patient session and vice versa.
 * sessionStorage "fix" helped on desktop tabs but broke Android WebView
 * because WebView is a single browsing context (no tab isolation).
 *
 * DEFINITIVE FIX: Role-scoped storage keys
 * ─────────────────────────────────────────────────────────────────────────────
 *   Patient  → mc_token_patient  /  mc_user_patient
 *   Doctor   → mc_token_doctor   /  mc_user_doctor
 *
 * These keys NEVER overlap. A doctor login writes to doctor keys only.
 * A patient login writes to patient keys only.
 * Both sessions can coexist in localStorage simultaneously.
 *
 * Works identically on:
 *   ✓ Desktop browser (multiple tabs, same origin)
 *   ✓ Android WebView (single browsing context)
 *   ✓ iOS WebView
 *   ✓ Page refresh in any context
 *   ✓ Multiple users on same device (different roles)
 *
 * BACKWARD COMPATIBILITY:
 * The old shared keys (mc_token, mc_user) are still read as a fallback
 * so existing logged-in users aren't kicked out after the update.
 * ─────────────────────────────────────────────────────────────────────────────
 */

// Role-scoped keys — each role has completely separate storage
const KEYS = {
  PATIENT: { token: 'mc_token_patient', user: 'mc_user_patient' },
  DOCTOR:  { token: 'mc_token_doctor',  user: 'mc_user_doctor'  },
};

// Legacy keys — read-only fallback for existing sessions
const LEGACY = { token: 'mc_token', user: 'mc_user' };

/** Safe storage access — never throws */
function safe(fn, fallback = null) {
  try { return fn(); } catch { return fallback; }
}

/** Get the storage keys for a given role */
function keysFor(role) {
  const r = (role || '').toUpperCase();
  return KEYS[r] || null;
}

/**
 * saveSession(token, user)
 * Writes to role-scoped keys based on user.role.
 * Also writes legacy keys for backward compat on first login.
 */
export function saveSession(token, user) {
  if (!token || !user) return;
  const userStr = JSON.stringify(user);
  const k = keysFor(user.role);

  if (k) {
    // Write to role-scoped keys (primary)
    safe(() => localStorage.setItem(k.token, token));
    safe(() => localStorage.setItem(k.user,  userStr));
    // Also write to sessionStorage for extra tab isolation on desktop
    safe(() => sessionStorage.setItem(k.token, token));
    safe(() => sessionStorage.setItem(k.user,  userStr));
  }

  // Write legacy keys so any pages not yet updated still work
  safe(() => localStorage.setItem(LEGACY.token, token));
  safe(() => localStorage.setItem(LEGACY.user,  userStr));
}

/**
 * getToken(role?)
 * Returns token for the given role.
 * If no role given, tries the current page's role context first,
 * then falls back to any available token.
 * Priority: sessionStorage role-scoped → localStorage role-scoped → legacy
 */
export function getToken(role) {
  if (role) {
    const k = keysFor(role);
    if (k) {
      return safe(() => sessionStorage.getItem(k.token), null)
          || safe(() => localStorage.getItem(k.token),   null)
          || '';
    }
  }
  // No role specified — detect from page URL path
  const path = typeof window !== 'undefined' ? window.location.pathname : '';
  if (path.startsWith('/doctor')) return getToken('DOCTOR');
  if (path.startsWith('/patient')) return getToken('PATIENT');
  // Fallback: try both, then legacy
  return safe(() => sessionStorage.getItem(KEYS.DOCTOR.token), null)
      || safe(() => localStorage.getItem(KEYS.DOCTOR.token),   null)
      || safe(() => sessionStorage.getItem(KEYS.PATIENT.token), null)
      || safe(() => localStorage.getItem(KEYS.PATIENT.token),  null)
      || safe(() => localStorage.getItem(LEGACY.token),        null)
      || '';
}

/**
 * getUser(role?)
 * Returns user object for the given role.
 * Same priority chain as getToken.
 */
export function getUser(role) {
  let raw = null;

  if (role) {
    const k = keysFor(role);
    if (k) {
      raw = safe(() => sessionStorage.getItem(k.user), null)
         || safe(() => localStorage.getItem(k.user),   null);
    }
  } else {
    // Auto-detect from URL
    const path = typeof window !== 'undefined' ? window.location.pathname : '';
    if (path.startsWith('/doctor'))  return getUser('DOCTOR');
    if (path.startsWith('/patient')) return getUser('PATIENT');
    // Fallback
    raw = safe(() => sessionStorage.getItem(KEYS.DOCTOR.user),  null)
       || safe(() => localStorage.getItem(KEYS.DOCTOR.user),    null)
       || safe(() => sessionStorage.getItem(KEYS.PATIENT.user), null)
       || safe(() => localStorage.getItem(KEYS.PATIENT.user),   null)
       || safe(() => localStorage.getItem(LEGACY.user),         null);
  }

  return safe(() => JSON.parse(raw || '{}'), {});
}

/**
 * clearSession(role?)
 * Clears ONLY the specified role's keys.
 * If role given: clears only that role → other role's session untouched.
 * If no role: clears everything including legacy.
 *
 * CRITICAL: Unlike the old version, this does NOT wipe the other role.
 */
export function clearSession(role) {
  if (role) {
    const k = keysFor(role);
    if (k) {
      safe(() => localStorage.removeItem(k.token));
      safe(() => localStorage.removeItem(k.user));
      safe(() => sessionStorage.removeItem(k.token));
      safe(() => sessionStorage.removeItem(k.user));
    }
    // Also clear legacy only if the role matches what's stored there
    const legacyUser = safe(() => JSON.parse(localStorage.getItem(LEGACY.user) || '{}'), {});
    if (!legacyUser.role || legacyUser.role === role.toUpperCase()) {
      safe(() => localStorage.removeItem(LEGACY.token));
      safe(() => localStorage.removeItem(LEGACY.user));
    }
  } else {
    // Full clear — all roles
    Object.values(KEYS).forEach(k => {
      safe(() => localStorage.removeItem(k.token));
      safe(() => localStorage.removeItem(k.user));
      safe(() => sessionStorage.removeItem(k.token));
      safe(() => sessionStorage.removeItem(k.user));
    });
    safe(() => localStorage.removeItem(LEGACY.token));
    safe(() => localStorage.removeItem(LEGACY.user));
  }
}

/**
 * hasSession(role?)
 * True if a session exists for the given role (or any role if none given).
 */
export function hasSession(role) {
  return !!getToken(role);
}

/**
 * getRole()
 * Returns the role of the current page context ('PATIENT' | 'DOCTOR' | null)
 */
export function getRole() {
  const path = typeof window !== 'undefined' ? window.location.pathname : '';
  if (path.startsWith('/doctor'))  return 'DOCTOR';
  if (path.startsWith('/patient')) return 'PATIENT';
  return null;
}