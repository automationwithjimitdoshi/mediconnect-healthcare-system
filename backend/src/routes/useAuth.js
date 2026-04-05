import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { authAPI } from '@/lib/api';
import { connectSocket, disconnectSocket } from '@/lib/socket';



// ── Helper: flatten { id, email, role, patient: { firstName } } → flat object ──
function flattenUser(rawUser) {
  const profile = rawUser?.patient || rawUser?.doctor || {};
  return {
    id:           rawUser.id,
    email:        rawUser.email,
    role:         rawUser.role,
    firstName:    profile.firstName  || rawUser.firstName  || rawUser.email?.split('@')[0] || '',
    lastName:     profile.lastName   || rawUser.lastName   || '',
    profilePhoto: profile.photoUrl   || rawUser.profilePhoto || null,
    patient:      rawUser.patient    || null,
    doctor:       rawUser.doctor     || null,
  };
}

// ── Helper: extract token + user from backend response ──────────────────────
// Backend returns either { token, user } or { data: { token, user } }
function extractAuthData(resData) {
  if (resData?.token && resData?.user) return resData;
  if (resData?.data?.token) return resData.data;
  throw new Error('Invalid auth response format');
}

// ── Helper: save to localStorage so ALL pages can read auth state ────────────
function persistToLocalStorage(token, user) {
  if (typeof window === 'undefined') return;
  localStorage.setItem('mc_token',         token);
  localStorage.setItem('mc_user',          JSON.stringify(user));
  localStorage.setItem('mediconnect_token', token);  // legacy key used by api.ts interceptor
}

export const useAuthStore = create()(
  persist(
    (set) => ({
      user: null,
      token: null,
      isLoading: false,

      login: async (email, password) => {
        set({ isLoading: true });
        try {
          const res = await authAPI.login({ email, password });
          const { token, user: rawUser } = extractAuthData(res.data);
          const user = flattenUser(rawUser);
          set({ token, user, isLoading: false });
          persistToLocalStorage(token, user);
          connectSocket(token);
        } catch (err) {
          set({ isLoading: false });
          throw err;
        }
      },

      register: async (data) => {
        set({ isLoading: true });
        try {
          const res = await authAPI.register(data);
          const { token, user: rawUser } = extractAuthData(res.data);
          const user = flattenUser(rawUser);
          set({ token, user, isLoading: false });
          persistToLocalStorage(token, user);
          connectSocket(token);
        } catch (err) {
          set({ isLoading: false });
          throw err;
        }
      },

      logout: () => {
        set({ user: null, token: null });
        if (typeof window !== 'undefined') {
          localStorage.removeItem('mc_token');
          localStorage.removeItem('mc_user');
          localStorage.removeItem('mediconnect_token');
          localStorage.removeItem('mediconnect_auth');
        }
        disconnectSocket();
        window.location.href = '/login';
      },

      updateUser: (data) => {
        set((state) => {
          const updated = state.user ? { ...state.user, ...data } : null;
          if (updated && state.token) persistToLocalStorage(state.token, updated);
          return { user: updated };
        });
      },

      refreshProfile: async () => {
        try {
          const res = await authAPI.getProfile();
          // /auth/me returns { user: {...} }
          const rawUser = res.data?.user || res.data?.data || res.data;
          const user = flattenUser(rawUser);
          set((state) => {
            if (state.token) persistToLocalStorage(state.token, user);
            return { user };
          });
        } catch (err) {
          console.error('Failed to refresh profile:', err);
        }
      },
    }),
    {
      name: 'mediconnect_auth',
      partialize: (state) => ({ user: state.user, token: state.token }),
    }
  )
);

export const useAuth = () => useAuthStore();