'use client';
import { create } from 'zustand';

export const useAuthStore = create((set) => ({
  user:  typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('mc_user') || 'null') : null,
  token: typeof window !== 'undefined' ? localStorage.getItem('mc_token') : null,
  isAuthenticated: typeof window !== 'undefined' ? !!localStorage.getItem('mc_token') : false,

  setAuth: (user, token) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('mc_token', token);
      localStorage.setItem('mc_user', JSON.stringify(user));
    }
    set({ user, token, isAuthenticated: true });
  },

  logout: () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('mc_token');
      localStorage.removeItem('mc_user');
    }
    set({ user: null, token: null, isAuthenticated: false });
  },

  updateUser: (updates) => set((s) => ({ user: { ...s.user, ...updates } })),
}));

export const useAppStore = create((set) => ({
  appointments:    [],
  setAppointments: (appointments) => set({ appointments }),
  addAppointment:  (a)  => set((s) => ({ appointments: [a, ...s.appointments] })),
  updateAppointment: (id, data) => set((s) => ({
    appointments: s.appointments.map((a) => a.id === id ? { ...a, ...data } : a)
  })),

  chatRooms:       [],
  setChatRooms:    (chatRooms) => set({ chatRooms }),
  activeChatRoom:  null,
  setActiveChatRoom: (room) => set({ activeChatRoom: room }),

  messages: {},
  setMessages: (roomId, msgs) => set((s) => ({ messages: { ...s.messages, [roomId]: msgs } })),
  addMessage:  (roomId, msg)  => set((s) => ({
    messages: { ...s.messages, [roomId]: [...(s.messages[roomId] || []), msg] }
  })),

  patients:          [],
  setPatients:       (patients) => set({ patients }),
  selectedPatient:   null,
  setSelectedPatient:(p) => set({ selectedPatient: p }),

  urgentAlerts:    [],
  addUrgentAlert:  (alert) => set((s) => ({ urgentAlerts: [alert, ...s.urgentAlerts.slice(0, 9)] })),
  dismissAlert:    (idx)   => set((s) => ({ urgentAlerts: s.urgentAlerts.filter((_, i) => i !== idx) })),
}));