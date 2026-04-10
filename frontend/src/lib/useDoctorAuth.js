'use client';
/**
 * src/lib/useDoctorAuth.js — NexMedicon AI
 *
 * Drop-in auth guard hook for every doctor page.
 * Replaces broken localStorage.getItem('mc_token') patterns.
 *
 * Usage (inside any doctor page component):
 *   import { useDoctorAuth } from '@/lib/useDoctorAuth';
 *   const tok = useDoctorAuth();   // redirects if not logged in as DOCTOR
 */

import { useEffect } from 'react';
import { getToken, getUser } from '@/lib/auth';

export function useDoctorAuth() {
  const tok = getToken('DOCTOR');
  useEffect(() => {
    if (!tok) { window.location.href = '/login'; return; }
    const u = getUser('DOCTOR');
    if (u?.role && u.role !== 'DOCTOR') { window.location.href = '/'; }
  }, []);
  return tok;
}

export function usePatientAuth() {
  const tok = getToken('PATIENT');
  useEffect(() => {
    if (!tok) { window.location.href = '/login'; return; }
    const u = getUser('PATIENT');
    if (u?.role && u.role !== 'PATIENT') { window.location.href = '/'; }
  }, []);
  return tok;
}