'use client';
/**
 * src/lib/useDoctorAuth.js — NexMedicon AI
 *
 * Auth guard hooks for doctor and patient pages.
 *
 * BLANK PAGE FIX:
 * The previous version called getToken() at render time (outside useEffect).
 * On SSR / first render, isBrowser() is false so getToken() returns ''.
 * This caused every page to render nothing before the client hydrated.
 *
 * Fix: the redirect logic runs ONLY inside useEffect (client-side only).
 * The hook returns the token so pages can use it in their own fetch calls.
 */

import { useEffect, useState } from 'react';
import { getToken, getUser } from '@/lib/auth';

/**
 * useDoctorAuth()
 * Call inside any doctor page component (not at module level).
 * - If no DOCTOR token exists → redirects to /login
 * - If wrong role → redirects to /
 * - Otherwise → returns the token string
 *
 * The redirect only fires on the client after mount, so SSR renders normally.
 */
export function useDoctorAuth() {
  const [tok, setTok] = useState('');

  useEffect(() => {
    const t = getToken('DOCTOR');
    if (!t) {
      window.location.href = '/login';
      return;
    }
    const u = getUser('DOCTOR');
    if (u?.role && u.role !== 'DOCTOR') {
      window.location.href = '/';
      return;
    }
    setTok(t);
  }, []);

  return tok;
}

/**
 * usePatientAuth()
 * Same pattern for patient pages.
 */
export function usePatientAuth() {
  const [tok, setTok] = useState('');

  useEffect(() => {
    const t = getToken('PATIENT');
    if (!t) {
      window.location.href = '/login';
      return;
    }
    const u = getUser('PATIENT');
    if (u?.role && u.role !== 'PATIENT') {
      window.location.href = '/';
      return;
    }
    setTok(t);
  }, []);

  return tok;
}