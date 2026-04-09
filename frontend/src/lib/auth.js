/**
 * src/lib/auth.js  — NexMedicon AI Frontend Auth Utility
 *
 * WHY THIS EXISTS:
 * localStorage is shared across ALL browser tabs for the same origin.
 * If a doctor logs in Tab 1 and a patient logs in Tab 2, they overwrite
 * each other's mc_token / mc_user → silent logout.
 *
 * FIX:
 * sessionStorage is tab-isolated (browser spec §10.2.9).
 * We write to BOTH storages on login:
 *   sessionStorage → read first (tab-specific, always wins)
 *   localStorage   → fallback for same-tab refresh / Expo WebView reload
 *
 * Result:
 *   Tab 1 (Doctor)  → own sessionStorage, unaffected by Tab 2
 *   Tab 2 (Patient) → own sessionStorage, unaffected by Tab 1
 *   Page refresh    → sessionStorage survives, reads correctly
 *   New tab         → falls back to localStorage (last login for that device)
 */

const TOKEN_KEY = 'mc_token';
const USER_KEY  = 'mc_user';

function safe(fn, fallback) {
  try { return fn(); } catch { return fallback; }
}

/** Save auth session — writes to both sessionStorage (tab) and localStorage (persist) */
export function saveSession(token, user) {
  const userStr = JSON.stringify(user);
  safe(() => { sessionStorage.setItem(TOKEN_KEY, token); sessionStorage.setItem(USER_KEY, userStr); });
  safe(() => { localStorage.setItem(TOKEN_KEY, token);   localStorage.setItem(USER_KEY, userStr); });
}

/** Get token — sessionStorage first (tab-isolated), localStorage as fallback */
export function getToken() {
  return safe(() => sessionStorage.getItem(TOKEN_KEY), null)
      || safe(() => localStorage.getItem(TOKEN_KEY),   null)
      || '';
}

/** Get user object — sessionStorage first, localStorage as fallback */
export function getUser() {
  const raw = safe(() => sessionStorage.getItem(USER_KEY), null)
           || safe(() => localStorage.getItem(USER_KEY),   null)
           || '{}';
  return safe(() => JSON.parse(raw), {});
}

/**
 * Clear session for THIS tab only.
 * Does NOT touch other tabs' sessionStorage (they're isolated by browser).
 * Clears localStorage too — used on explicit signout from this tab.
 */
export function clearSession() {
  safe(() => { sessionStorage.removeItem(TOKEN_KEY); sessionStorage.removeItem(USER_KEY); });
  safe(() => { localStorage.removeItem(TOKEN_KEY);   localStorage.removeItem(USER_KEY); });
}

/** True if this tab has a valid-looking session */
export function hasSession() {
  return !!getToken();
}
