/**
 * src/lib/auth.js — NexMedicon AI
 *
 * BLANK PAGE FIX:
 * The previous version stored tokens in sessionStorage only.
 * sessionStorage is cleared when:
 *   - The browser tab is closed and reopened
 *   - The user does a hard refresh (Ctrl+Shift+R)
 *   - Vercel redeploys and the page reloads
 * This made every page guard see an empty token and redirect to /login,
 * resulting in a blank page loop.
 *
 * THE CORRECT APPROACH:
 * - saveSession() writes to BOTH localStorage (persist) AND sessionStorage (fast read)
 * - getToken() reads sessionStorage first, falls back to localStorage for same role only
 * - Cross-tab isolation is achieved via ROLE-SCOPED keys (not shared keys)
 *   mc_token_doctor  can only be read by doctor pages calling getToken('DOCTOR')
 *   mc_token_patient can only be read by patient pages calling getToken('PATIENT')
 * - This means Tab A (Patient) and Tab B (Doctor) never share tokens because
 *   each page explicitly passes its own role to getToken()
 *
 * WHAT WAS ACTUALLY CAUSING THE ORIGINAL REDIRECT BUG:
 * The OLD code used a SINGLE shared key: localStorage.getItem('mc_token')
 * Any page could read any role's token. That's fixed by role-scoped keys.
 * sessionStorage-only was an overreaction that broke page refresh.
 */

const KEYS = {
  PATIENT: { token: 'mc_token_patient', user: 'mc_user_patient' },
  DOCTOR:  { token: 'mc_token_doctor',  user: 'mc_user_doctor'  },
};

const isBrowser = () => typeof window !== 'undefined';

const ls = {
  get:   k     => { try { return isBrowser() ? localStorage.getItem(k)   : null; } catch { return null; } },
  set:   (k,v) => { try { if (isBrowser())   localStorage.setItem(k,v);         } catch {} },
  del:   k     => { try { if (isBrowser())   localStorage.removeItem(k);        } catch {} },
};
const ss = {
  get:   k     => { try { return isBrowser() ? sessionStorage.getItem(k)  : null; } catch { return null; } },
  set:   (k,v) => { try { if (isBrowser())   sessionStorage.setItem(k,v);        } catch {} },
  del:   k     => { try { if (isBrowser())   sessionStorage.removeItem(k);       } catch {} },
};

function keysFor(role) { return KEYS[(role||'').toUpperCase()] || null; }

// ── One-time cleanup of legacy shared keys ───────────────────────────────────
// Old versions of auth.js wrote a single shared 'mc_token' / 'mc_user' key.
// These must be deleted — they leak across roles and tabs.
// We promote them to role-scoped keys first so the user stays logged in.
function cleanupLegacy() {
  if (!isBrowser()) return;
  const oldTok = ls.get('mc_token');
  const oldUsr = ls.get('mc_user');
  if (!oldTok) return;
  try {
    const parsed = JSON.parse(oldUsr || '{}');
    const k = keysFor(parsed?.role);
    if (k && !ls.get(k.token)) {
      ls.set(k.token, oldTok);
      if (oldUsr) ls.set(k.user, oldUsr);
    }
  } catch {}
  ls.del('mc_token');
  if (oldUsr) ls.del('mc_user');
}

if (isBrowser()) cleanupLegacy();

// ── PUBLIC API ────────────────────────────────────────────────────────────────

/**
 * saveSession(token, user)
 * Writes to BOTH sessionStorage (fast, tab-private) and localStorage (persists
 * across refresh/reopen). Role-scoped keys prevent cross-role leaking.
 */
export function saveSession(token, user) {
  if (!token || !user) return;
  const role = (user.role || '').toUpperCase();
  const k = keysFor(role);
  if (!k) { console.warn('[auth] saveSession — unknown role:', user.role); return; }
  const payload = JSON.stringify({ ...user, role });
  ls.set(k.token, token);
  ls.set(k.user,  payload);
  ss.set(k.token, token);
  ss.set(k.user,  payload);
}

/**
 * getToken(role)
 * role MUST be passed explicitly — 'PATIENT' or 'DOCTOR'.
 * Reads sessionStorage first (fast), falls back to localStorage (survives refresh).
 * Role-scoped keys mean getToken('PATIENT') can NEVER return a doctor's token
 * and getToken('DOCTOR') can NEVER return a patient's token.
 */
export function getToken(role) {
  const k = keysFor(role);
  if (!k) return '';
  return ss.get(k.token) || ls.get(k.token) || '';
}

/**
 * getUser(role)
 * Returns parsed user object for the given role, or {}.
 */
export function getUser(role) {
  const k = keysFor(role);
  if (!k) return {};
  const raw = ss.get(k.user) || ls.get(k.user);
  try { return JSON.parse(raw || '{}') || {}; } catch { return {}; }
}

/**
 * clearSession(role)
 * Signs out the given role only. Other role's session is untouched.
 */
export function clearSession(role) {
  const k = keysFor(role);
  if (!k) return;
  ls.del(k.token); ls.del(k.user);
  ss.del(k.token); ss.del(k.user);
}

/** True if a session exists for this role. */
export function hasSession(role) { return !!getToken(role); }