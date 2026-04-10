/**
 * src/lib/auth.js — NexMedicon AI
 *
 * ═══════════════════════════════════════════════════════════════════
 * ROOT CAUSE OF THE ORIGINAL BUG (and why previous fixes didn't work)
 * ═══════════════════════════════════════════════════════════════════
 *
 * The previous version used this read pattern in getToken():
 *
 *   return ssGet(k.token) || lsGet(k.token) || '';
 *
 * This ALWAYS falls through to localStorage when sessionStorage is
 * empty (e.g. when a new tab is opened, or on first load before login).
 * localStorage is SHARED across every tab of the same origin — so any
 * token written by Tab A is instantly visible to Tab B.
 *
 * Role-scoped keys (mc_token_patient vs mc_token_doctor) prevent
 * ROLE confusion, but they do NOT prevent the same role from leaking
 * between two tabs. If you open two Patient tabs and log into different
 * patient accounts, the second login overwrites the first in localStorage
 * and both tabs now share the same patient token.
 *
 * ═══════════════════════════════════════════════════════════════════
 * THE FIX: sessionStorage-first, localStorage only as a one-time seed
 * ═══════════════════════════════════════════════════════════════════
 *
 * Rule 1 — WRITES go to sessionStorage ONLY.
 *   Active session data is NEVER written to localStorage after login.
 *   This makes every tab's live session fully private.
 *
 * Rule 2 — READS come from sessionStorage ONLY.
 *   getToken() and getUser() never fall through to localStorage.
 *   If sessionStorage is empty, the user is considered logged out
 *   for this tab, regardless of what other tabs have stored.
 *
 * Rule 3 — localStorage is used for ONE thing only: "remember me" seeding.
 *   On the very first page load of a NEW tab (sessionStorage empty),
 *   we optionally copy a persisted token from localStorage into
 *   sessionStorage so that a page refresh doesn't log you out.
 *   This seed is REMOVED from localStorage immediately after copying,
 *   so it can never be read by a second tab.
 *
 * Rule 4 — "Remember me" is opt-in and role-scoped.
 *   saveSession(token, user, { persist: true }) writes a seed to
 *   localStorage. saveSession without persist skips localStorage
 *   entirely. This lets you choose per-login whether to persist.
 *
 * ───────────────────────────────────────────────────────────────────
 * KEY ARCHITECTURE:
 *
 *   Live session (tab-private):
 *     sessionStorage['mc_token_patient']  /  mc_user_patient
 *     sessionStorage['mc_token_doctor']   /  mc_user_doctor
 *
 *   Persisted seed (consumed once, then deleted):
 *     localStorage['mc_seed_patient']     /  mc_seed_user_patient
 *     localStorage['mc_seed_doctor']      /  mc_seed_user_doctor
 *
 * ───────────────────────────────────────────────────────────────────
 * MULTI-TAB BEHAVIOUR:
 *
 *   Scenario A — Tab A = Patient, Tab B = Doctor (your use case):
 *     ✅ Tab A sessionStorage has patient token only.
 *     ✅ Tab B sessionStorage has doctor token only.
 *     ✅ Neither token leaks to the other tab.
 *     ✅ Refreshing either tab restores from its own sessionStorage.
 *
 *   Scenario B — Two tabs, same role:
 *     ✅ Each tab has its own sessionStorage → fully independent.
 *     ✅ You can log into two different patient accounts simultaneously.
 *
 *   Scenario C — Close browser, reopen (persist: true):
 *     ✅ localStorage seed exists → consumed into sessionStorage → deleted.
 *     ✅ A second tab opened immediately after won't find the seed
 *        (already deleted) → must log in manually.
 */

// ── Key definitions ──────────────────────────────────────────────
const SS_KEYS = {
  PATIENT: { token: 'mc_token_patient',      user: 'mc_user_patient'      },
  DOCTOR:  { token: 'mc_token_doctor',       user: 'mc_user_doctor'       },
};
const LS_SEED_KEYS = {
  PATIENT: { token: 'mc_seed_patient',       user: 'mc_seed_user_patient' },
  DOCTOR:  { token: 'mc_seed_doctor',        user: 'mc_seed_user_doctor'  },
};

// ── SSR guard ────────────────────────────────────────────────────
const isBrowser = () => typeof window !== 'undefined';

// ── Storage helpers ──────────────────────────────────────────────
const ss = {
  get: k  => { try { return isBrowser() ? sessionStorage.getItem(k)    : null; } catch { return null; } },
  set: (k,v)=>{ try { if (isBrowser())   sessionStorage.setItem(k, v);        } catch {} },
  del: k  => { try { if (isBrowser())   sessionStorage.removeItem(k);         } catch {} },
};
const ls = {
  get: k  => { try { return isBrowser() ? localStorage.getItem(k)      : null; } catch { return null; } },
  set: (k,v)=>{ try { if (isBrowser())   localStorage.setItem(k, v);          } catch {} },
  del: k  => { try { if (isBrowser())   localStorage.removeItem(k);           } catch {} },
};

function keysFor(role) {
  return SS_KEYS[(role || '').toUpperCase()] || null;
}
function seedKeysFor(role) {
  return LS_SEED_KEYS[(role || '').toUpperCase()] || null;
}

// ── One-time seed consumption ─────────────────────────────────────
// Called once per tab on module load.
// If sessionStorage is empty for a role but localStorage has a seed,
// copy the seed into sessionStorage then DELETE the seed from localStorage.
// This means only the FIRST tab to load after a persist will auto-login;
// any subsequent tab opening finds no seed and must log in manually.
function consumeSeedIfNeeded(role) {
  const sk = keysFor(role);
  const lk = seedKeysFor(role);
  if (!sk || !lk) return;

  // Already have a live session in this tab — no seed needed
  if (ss.get(sk.token)) return;

  const seedToken = ls.get(lk.token);
  const seedUser  = ls.get(lk.user);

  if (seedToken && seedUser) {
    // Consume: copy into tab-private sessionStorage
    ss.set(sk.token, seedToken);
    ss.set(sk.user,  seedUser);
    // DELETE from localStorage immediately so no other tab can read it
    ls.del(lk.token);
    ls.del(lk.user);
    console.log(`[auth] Consumed persisted seed for ${role} → tab session activated`);
  }
}

// ── Legacy key cleanup ───────────────────────────────────────────
// One-time cleanup of old mc_token / mc_user keys that previous
// versions of auth.js may have written. We promote them to the
// correct role-scoped sessionStorage keys and delete them.
function cleanupLegacy() {
  if (!isBrowser()) return;

  // Old role-scoped localStorage keys from the PREVIOUS broken version
  const oldLsKeys = [
    { token: 'mc_token_patient', user: 'mc_user_patient', role: 'PATIENT' },
    { token: 'mc_token_doctor',  user: 'mc_user_doctor',  role: 'DOCTOR'  },
  ];
  oldLsKeys.forEach(({ token: tk, user: uk, role }) => {
    const val = ls.get(tk);
    const usr = ls.get(uk);
    if (val && usr) {
      const sk = keysFor(role);
      // Only promote if this tab doesn't already have a live session
      if (sk && !ss.get(sk.token)) {
        ss.set(sk.token, val);
        ss.set(sk.user,  usr);
        console.log(`[auth] Promoted old localStorage key to sessionStorage for ${role}`);
      }
      // Always remove from localStorage — this was the leaking vector
      ls.del(tk);
      ls.del(uk);
    }
  });

  // Even older shared legacy keys
  const legacyTok = ls.get('mc_token');
  const legacyUsr = ls.get('mc_user');
  if (legacyTok && legacyUsr) {
    try {
      const parsed = JSON.parse(legacyUsr);
      const sk = keysFor(parsed?.role);
      if (sk && !ss.get(sk.token)) {
        ss.set(sk.token, legacyTok);
        ss.set(sk.user,  legacyUsr);
        console.log('[auth] Promoted legacy mc_token → sessionStorage');
      }
    } catch {}
    ls.del('mc_token');
    ls.del('mc_user');
  }
}

// Run cleanup + seed consumption once when module loads in browser
if (isBrowser()) {
  cleanupLegacy();
  consumeSeedIfNeeded('PATIENT');
  consumeSeedIfNeeded('DOCTOR');
}

// ═════════════════════════════════════════════════════════════════
// PUBLIC API
// ═════════════════════════════════════════════════════════════════

/**
 * saveSession(token, user, options?)
 *
 * Writes the session to tab-private sessionStorage ONLY.
 *
 * Options:
 *   persist: boolean (default false)
 *     If true, also writes a one-time seed to localStorage so the
 *     session survives a full browser close+reopen (consumed once,
 *     then deleted — so only one new tab gets auto-login).
 *
 * Usage:
 *   saveSession(token, user)               // tab-only, no persistence
 *   saveSession(token, user, { persist: true })  // survives browser restart
 */
export function saveSession(token, user, options = {}) {
  if (!token || !user) return;

  const role = (user.role || '').toUpperCase();
  const sk = keysFor(role);
  if (!sk) {
    console.warn('[auth] saveSession: unknown role', user.role);
    return;
  }

  const str = JSON.stringify({ ...user, role }); // ensure role is always stored

  // Always write to sessionStorage (tab-private, live session)
  ss.set(sk.token, token);
  ss.set(sk.user,  str);

  // Optionally write a persistent seed to localStorage
  if (options.persist) {
    const lk = seedKeysFor(role);
    if (lk) {
      ls.set(lk.token, token);
      ls.set(lk.user,  str);
    }
  }
  // NEVER write directly to mc_token_patient/mc_token_doctor in localStorage
}

/**
 * getToken(role)
 *
 * Reads ONLY from sessionStorage (tab-private).
 * Returns '' if no session exists in this tab.
 *
 * role: 'PATIENT' | 'DOCTOR' (required)
 */
export function getToken(role) {
  const sk = keysFor(role);
  if (!sk) return '';
  return ss.get(sk.token) || '';
}

/**
 * getUser(role)
 *
 * Reads ONLY from sessionStorage (tab-private).
 * Returns parsed user object or {}.
 *
 * role: 'PATIENT' | 'DOCTOR' (required)
 */
export function getUser(role) {
  const sk = keysFor(role);
  if (!sk) return {};
  const raw = ss.get(sk.user);
  try { return JSON.parse(raw || '{}') || {}; } catch { return {}; }
}

/**
 * clearSession(role)
 *
 * Clears this tab's session for the given role.
 * Also removes any persisted seed for this role from localStorage.
 * The other role's session (in this tab or any other tab) is untouched.
 *
 * role: 'PATIENT' | 'DOCTOR' (required)
 */
export function clearSession(role) {
  const sk = keysFor(role);
  const lk = seedKeysFor(role);
  if (sk) { ss.del(sk.token); ss.del(sk.user); }
  if (lk) { ls.del(lk.token); ls.del(lk.user); }
}

/**
 * hasSession(role)
 *
 * Returns true if a live session token exists in this tab.
 *
 * role: 'PATIENT' | 'DOCTOR' (required)
 */
export function hasSession(role) {
  return !!getToken(role);
}