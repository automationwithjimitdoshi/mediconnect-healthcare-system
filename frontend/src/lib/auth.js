/**
 * src/lib/auth.js — NexMedicon AI
 *
 * THE ACTUAL PROBLEM THAT WAS CAUSING CROSS-TAB SESSION LEAKING:
 * ─────────────────────────────────────────────────────────────────
 * Every saveSession() call was ALSO writing to shared legacy keys
 * mc_token / mc_user (localStorage). When Tab A (Patient) refreshed
 * its session via /auth/me, it overwrote those legacy keys with the
 * patient's token. Tab B (Doctor) then fell through to legacy keys
 * in its getToken() fallback chain and got the patient's token instead
 * of the doctor's. Result: both tabs forced into the same role.
 *
 * THE FIX:
 * ─────────────────────────────────────────────────────────────────
 * 1. saveSession() writes ONLY to role-scoped keys. No legacy writes.
 * 2. getToken(role) reads ONLY from role-scoped keys. No legacy reads.
 * 3. Legacy keys (mc_token/mc_user) are ONLY read once on first load
 *    to migrate existing sessions — and immediately promoted to
 *    role-scoped keys so legacy is never read again.
 * 4. sessionStorage mirrors localStorage for extra tab isolation
 *    on desktop (sessionStorage is always tab-private).
 *
 * KEY ARCHITECTURE:
 * ─────────────────────────────────────────────────────────────────
 *   Patient session  → mc_token_patient  /  mc_user_patient
 *   Doctor  session  → mc_token_doctor   /  mc_user_doctor
 *   Legacy  (once)   → mc_token / mc_user  (migrated + deleted)
 *
 * Works on: Desktop tabs · Android WebView · iOS WebView · Expo
 */

const KEYS = {
  PATIENT: { token: 'mc_token_patient', user: 'mc_user_patient' },
  DOCTOR:  { token: 'mc_token_doctor',  user: 'mc_user_doctor'  },
};

// ── SSR guard ────────────────────────────────────────────────────
const isBrowser = () => typeof window !== 'undefined';

// ── Storage helpers — every one guards against SSR + throws ─────
function lsGet(k)    { if (!isBrowser()) return null; try { return localStorage.getItem(k);    } catch { return null; } }
function lsSet(k, v) { if (!isBrowser()) return;      try { localStorage.setItem(k, v);        } catch {} }
function lsDel(k)    { if (!isBrowser()) return;      try { localStorage.removeItem(k);        } catch {} }
function ssGet(k)    { if (!isBrowser()) return null; try { return sessionStorage.getItem(k);  } catch { return null; } }
function ssSet(k, v) { if (!isBrowser()) return;      try { sessionStorage.setItem(k, v);      } catch {} }
function ssDel(k)    { if (!isBrowser()) return;      try { sessionStorage.removeItem(k);      } catch {} }

function keysFor(role) { return KEYS[(role || '').toUpperCase()] || null; }

// ── One-time legacy migration ─────────────────────────────────────
// Called internally. Reads old shared mc_token/mc_user, promotes to
// role-scoped keys, then DELETES the legacy keys so they never leak again.
function migrateLegacy() {
  if (!isBrowser()) return;
  const tok = lsGet('mc_token');
  const raw = lsGet('mc_user');
  if (!tok || !raw) return;
  try {
    const user = JSON.parse(raw);
    const k = keysFor(user?.role);
    if (k && !lsGet(k.token)) {
      // Only migrate if role-scoped slot is empty (don't overwrite a real session)
      lsSet(k.token, tok);
      lsSet(k.user,  raw);
      ssSet(k.token, tok);
      ssSet(k.user,  raw);
      console.log('[auth] Migrated legacy session →', user.role);
    }
  } catch {}
  // Always delete legacy keys after migration attempt
  lsDel('mc_token');
  lsDel('mc_user');
}

// Run migration once when this module is first imported in the browser
if (isBrowser()) migrateLegacy();

// ─────────────────────────────────────────────────────────────────
// PUBLIC API
// ─────────────────────────────────────────────────────────────────

/**
 * saveSession(token, user)
 * Writes ONLY to role-scoped keys — never touches legacy keys.
 * This is the key fix: no shared keys = no cross-tab leaking.
 */
export function saveSession(token, user) {
  if (!token || !user) return;
  const k = keysFor(user.role);
  if (!k) return;
  const str = JSON.stringify(user);
  // localStorage: persists across page refreshes and new tabs
  lsSet(k.token, token);
  lsSet(k.user,  str);
  // sessionStorage: tab-private, takes priority in getToken/getUser
  ssSet(k.token, token);
  ssSet(k.user,  str);
  // NEVER write to mc_token / mc_user (legacy) — that was the leaking vector
}

/**
 * getToken(role)
 * role is REQUIRED. Always pass 'PATIENT' or 'DOCTOR' explicitly.
 * Reads sessionStorage first (tab-private), then localStorage.
 * NEVER reads legacy keys.
 */
export function getToken(role) {
  const k = keysFor(role);
  if (!k) return '';
  return ssGet(k.token) || lsGet(k.token) || '';
}

/**
 * getUser(role)
 * role is REQUIRED. Returns parsed user object or {}.
 * NEVER reads legacy keys.
 */
export function getUser(role) {
  const k = keysFor(role);
  if (!k) return {};
  const raw = ssGet(k.user) || lsGet(k.user);
  try { return JSON.parse(raw || '{}') || {}; } catch { return {}; }
}

/**
 * clearSession(role)
 * Clears ONLY the given role's keys.
 * The other role's keys are completely untouched.
 */
export function clearSession(role) {
  const k = keysFor(role);
  if (!k) return;
  lsDel(k.token); lsDel(k.user);
  ssDel(k.token); ssDel(k.user);
}

/** True if a session token exists for this role */
export function hasSession(role) {
  return !!getToken(role);
}