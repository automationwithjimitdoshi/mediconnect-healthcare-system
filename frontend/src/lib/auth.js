/**
 * src/lib/auth.js — NexMedicon AI  (FINAL FIX)
 *
 * ROOT CAUSE of all redirect loops across every doctor and patient page:
 *
 *   getToken() was:  ssGet(k.token) || lsGet(k.token) || ''
 *
 * localStorage is shared across ALL browser tabs of the same origin.
 * When any new page loads with empty sessionStorage it falls through to
 * localStorage, finds either nothing (key never written) or the wrong
 * tab's token, and immediately redirects to /login or /.
 *
 * THE FIX — three strict rules applied everywhere:
 *   1. saveSession()  → writes sessionStorage ONLY (tab-private).
 *   2. getToken()     → reads sessionStorage ONLY.  No localStorage fallback.
 *   3. getUser()      → reads sessionStorage ONLY.  No localStorage fallback.
 *   4. localStorage   → used ONLY for optional "remember-me" seed, consumed
 *                       once on first tab load then deleted.
 *
 * KEY NAMES
 *   Live session (tab-private):
 *     sessionStorage  mc_ss_token_patient / mc_ss_user_patient
 *     sessionStorage  mc_ss_token_doctor  / mc_ss_user_doctor
 *   Persist seed (opt-in, one-time):
 *     localStorage    mc_seed_token_patient / mc_seed_user_patient
 *     localStorage    mc_seed_token_doctor  / mc_seed_user_doctor
 */

const SS = {
  PATIENT: { token: 'mc_ss_token_patient', user: 'mc_ss_user_patient' },
  DOCTOR:  { token: 'mc_ss_token_doctor',  user: 'mc_ss_user_doctor'  },
};
const SEED = {
  PATIENT: { token: 'mc_seed_token_patient', user: 'mc_seed_user_patient' },
  DOCTOR:  { token: 'mc_seed_token_doctor',  user: 'mc_seed_user_doctor'  },
};

const isBrowser = () => typeof window !== 'undefined';
const ss = {
  get:   k     => { try { return isBrowser() ? sessionStorage.getItem(k)  : null; } catch { return null; } },
  set:   (k,v) => { try { if (isBrowser())   sessionStorage.setItem(k,v);        } catch {} },
  del:   k     => { try { if (isBrowser())   sessionStorage.removeItem(k);       } catch {} },
};
const ls = {
  get:   k     => { try { return isBrowser() ? localStorage.getItem(k)    : null; } catch { return null; } },
  set:   (k,v) => { try { if (isBrowser())   localStorage.setItem(k,v);          } catch {} },
  del:   k     => { try { if (isBrowser())   localStorage.removeItem(k);         } catch {} },
};

function ssKeys(role)   { return SS[  (role||'').toUpperCase()] || null; }
function seedKeys(role) { return SEED[(role||'').toUpperCase()] || null; }

// ── One-time cleanup: migrate ALL previous localStorage key formats ───────────
// Every previous version of auth.js wrote tokens to localStorage under
// different key names.  We promote them into sessionStorage (so this tab
// stays logged in after the upgrade) then DELETE them from localStorage
// so they can never leak to other tabs again.
function cleanupLegacy() {
  if (!isBrowser()) return;
  [
    { lsToken: 'mc_token_patient', lsUser: 'mc_user_patient', role: 'PATIENT' },
    { lsToken: 'mc_token_doctor',  lsUser: 'mc_user_doctor',  role: 'DOCTOR'  },
  ].forEach(({ lsToken, lsUser, role }) => {
    const tok = ls.get(lsToken);
    const usr = ls.get(lsUser);
    if (tok) {
      const sk = ssKeys(role);
      if (sk && !ss.get(sk.token)) { ss.set(sk.token, tok); if (usr) ss.set(sk.user, usr); }
      ls.del(lsToken); if (usr) ls.del(lsUser);
    }
  });
  const oldTok = ls.get('mc_token');
  const oldUsr = ls.get('mc_user');
  if (oldTok) {
    try {
      const parsed = JSON.parse(oldUsr || '{}');
      const sk = ssKeys(parsed?.role);
      if (sk && !ss.get(sk.token)) { ss.set(sk.token, oldTok); if (oldUsr) ss.set(sk.user, oldUsr); }
    } catch {}
    ls.del('mc_token'); if (oldUsr) ls.del('mc_user');
  }
}

// ── Consume persist seed (once per new tab, then delete) ─────────────────────
function consumeSeed(role) {
  const sk = ssKeys(role); const lk = seedKeys(role);
  if (!sk || !lk || ss.get(sk.token)) return;
  const tok = ls.get(lk.token); const usr = ls.get(lk.user);
  if (tok && usr) {
    ss.set(sk.token, tok); ss.set(sk.user, usr);
    ls.del(lk.token); ls.del(lk.user); // delete so second tab cannot read it
  }
}

if (isBrowser()) { cleanupLegacy(); consumeSeed('PATIENT'); consumeSeed('DOCTOR'); }

// ── PUBLIC API ────────────────────────────────────────────────────────────────

/** Write session to tab-private sessionStorage only.
 *  Pass { persist: true } to also write a one-time localStorage seed so the
 *  session survives a full browser close + reopen (consumed once, then deleted). */
export function saveSession(token, user, options = {}) {
  if (!token || !user) return;
  const role = (user.role || '').toUpperCase();
  const sk = ssKeys(role);
  if (!sk) { console.warn('[auth] saveSession — unknown role:', user.role); return; }
  const payload = JSON.stringify({ ...user, role });
  ss.set(sk.token, token);
  ss.set(sk.user,  payload);
  if (options.persist) {
    const lk = seedKeys(role);
    if (lk) { ls.set(lk.token, token); ls.set(lk.user, payload); }
  }
}

/** Read token from sessionStorage ONLY.  Returns '' if no session in this tab. */
export function getToken(role) {
  const sk = ssKeys(role);
  if (!sk) return '';
  return ss.get(sk.token) || '';
}

/** Read user object from sessionStorage ONLY.  Returns {} if no session. */
export function getUser(role) {
  const sk = ssKeys(role);
  if (!sk) return {};
  try { return JSON.parse(ss.get(sk.user) || '{}') || {}; } catch { return {}; }
}

/** Clear this tab's session + any persist seed for the given role.
 *  Other roles and other tabs are completely unaffected. */
export function clearSession(role) {
  const sk = ssKeys(role); const lk = seedKeys(role);
  if (sk) { ss.del(sk.token); ss.del(sk.user); }
  if (lk) { ls.del(lk.token); ls.del(lk.user); }
}

/** Returns true if a live session token exists in this tab for this role. */
export function hasSession(role) { return !!getToken(role); }