/**
 * src/lib/auth.js — NexMedicon AI
 *
 * ═══════════════════════════════════════════════════════════════════
 * ROOT CAUSES OF ALL THE REDIRECT BUGS (now fixed)
 * ═══════════════════════════════════════════════════════════════════
 *
 * BUG 1 — book/page.js reads the WRONG localStorage key:
 *   const tok = localStorage.getItem('mc_token');  ← this key is never written
 *   auth.js stopped writing 'mc_token' in the previous fix.
 *   tok is always null → router.push('/login') fires on every navigation.
 *   FIX: Every page must use getToken('PATIENT') / getToken('DOCTOR').
 *        Direct localStorage reads are forbidden in page code.
 *
 * BUG 2 — book/page.js double-stringifies the user object:
 *   const u = JSON.stringify(getUser('PATIENT'));  ← getUser returns an object
 *   JSON.parse(u) then gives back the object, but u was ALREADY a string,
 *   so parsed.role is sometimes undefined → router.push('/') fires.
 *   FIX: const u = getUser('PATIENT'); check u.role directly, no parse.
 *
 * BUG 3 — Previous auth.js fell through to localStorage on every read:
 *   return ssGet(k.token) || lsGet(k.token) || '';
 *   localStorage is shared across ALL tabs of the same origin.
 *   A new tab or refresh with empty sessionStorage would read another
 *   tab's token and inherit the wrong role/session.
 *   FIX: getToken() reads sessionStorage ONLY. No localStorage fallback.
 *
 * ═══════════════════════════════════════════════════════════════════
 * ARCHITECTURE
 * ═══════════════════════════════════════════════════════════════════
 *
 *  Live session (tab-private, always used):
 *    sessionStorage  mc_ss_token_patient  /  mc_ss_user_patient
 *    sessionStorage  mc_ss_token_doctor   /  mc_ss_user_doctor
 *
 *  Persist seed (opt-in, consumed once on load then deleted):
 *    localStorage    mc_seed_token_patient / mc_seed_user_patient
 *    localStorage    mc_seed_token_doctor  / mc_seed_user_doctor
 *
 *  Multi-tab result:
 *    Tab A = Patient, Tab B = Doctor  →  fully independent, zero leaking
 *    Two Patient tabs                 →  fully independent
 *    Refresh                          →  restores from own sessionStorage
 *    Browser close + reopen           →  restores if saveSession called
 *                                        with { persist: true }
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

// ── One-time cleanup of every previous localStorage key format ───
// Promotes them to sessionStorage (so this tab stays logged in),
// then deletes them from localStorage (stops cross-tab leaking).
function cleanupLegacy() {
  if (!isBrowser()) return;

  // Keys written by the broken previous auth.js fix
  [
    { lsToken: 'mc_token_patient', lsUser: 'mc_user_patient', role: 'PATIENT' },
    { lsToken: 'mc_token_doctor',  lsUser: 'mc_user_doctor',  role: 'DOCTOR'  },
  ].forEach(({ lsToken, lsUser, role }) => {
    const tok = ls.get(lsToken);
    const usr = ls.get(lsUser);
    if (tok) {
      const sk = ssKeys(role);
      if (sk && !ss.get(sk.token)) {
        ss.set(sk.token, tok);
        if (usr) ss.set(sk.user, usr);
      }
      ls.del(lsToken);
      if (usr) ls.del(lsUser);
    }
  });

  // Even older single shared key
  const oldTok = ls.get('mc_token');
  const oldUsr = ls.get('mc_user');
  if (oldTok) {
    try {
      const parsed = JSON.parse(oldUsr || '{}');
      const sk = ssKeys(parsed?.role);
      if (sk && !ss.get(sk.token)) {
        ss.set(sk.token, oldTok);
        if (oldUsr) ss.set(sk.user, oldUsr);
      }
    } catch {}
    ls.del('mc_token');
    if (oldUsr) ls.del('mc_user');
  }
}

// ── Consume persist seed (once per new tab, then delete) ─────────
function consumeSeed(role) {
  const sk = ssKeys(role);
  const lk = seedKeys(role);
  if (!sk || !lk) return;
  if (ss.get(sk.token)) return; // live session already present — skip

  const tok = ls.get(lk.token);
  const usr = ls.get(lk.user);
  if (tok && usr) {
    ss.set(sk.token, tok);
    ss.set(sk.user,  usr);
    // Delete immediately so a second tab can't read the same seed
    ls.del(lk.token);
    ls.del(lk.user);
  }
}

if (isBrowser()) {
  cleanupLegacy();
  consumeSeed('PATIENT');
  consumeSeed('DOCTOR');
}

// ═════════════════════════════════════════════════════════════════
// PUBLIC API  (drop-in replacement — same function signatures)
// ═════════════════════════════════════════════════════════════════

/**
 * saveSession(token, user, options?)
 *
 * Writes to tab-private sessionStorage only.
 * Pass { persist: true } to also write a one-time localStorage seed
 * so the session survives a full browser close + reopen.
 */
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

/**
 * getToken(role)
 * Reads sessionStorage ONLY — never falls through to localStorage.
 * Returns '' if no session exists in this tab (treat as logged out).
 */
export function getToken(role) {
  const sk = ssKeys(role);
  if (!sk) return '';
  return ss.get(sk.token) || '';
}

/**
 * getUser(role)
 * Returns parsed user object from sessionStorage, or {}.
 */
export function getUser(role) {
  const sk = ssKeys(role);
  if (!sk) return {};
  try { return JSON.parse(ss.get(sk.user) || '{}') || {}; } catch { return {}; }
}

/**
 * clearSession(role)
 * Clears this tab's session + any persist seed for the given role.
 * Other roles and other tabs are completely untouched.
 */
export function clearSession(role) {
  const sk = ssKeys(role);
  const lk = seedKeys(role);
  if (sk) { ss.del(sk.token); ss.del(sk.user); }
  if (lk) { ls.del(lk.token); ls.del(lk.user); }
}

/** Returns true if a live session token exists in this tab. */
export function hasSession(role) { return !!getToken(role); }