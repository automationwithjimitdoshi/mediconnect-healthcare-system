/**
 * src/lib/styles.js
 *
 * Shared design tokens used by AppLayout and patient pages.
 * All pages that import { C, card, statusPill, btn } from '@/lib/styles'
 * need this file at src/lib/styles.js
 */

export const C = {
  navy:      '#0c1a2e',
  blue:      '#1565c0',
  bluePale:  '#e3f0ff',
  red:       '#c62828',
  redPale:   '#fdecea',
  amber:     '#b45309',
  amberPale: '#fff3e0',
  green:     '#1b5e20',
  greenPale: '#e8f5e9',
  teal:      '#00796b',
  tealPale:  '#e0f5f0',
  purple:    '#6b21a8',
  border:    '#e2e8f0',
  surface:   '#f7f9fc',
  textMuted: '#8896a7',
  textSec:   '#4a5568',
};

export const card = {
  background:   'white',
  borderRadius: 14,
  padding:      '18px 20px',
  border:       `1px solid ${C.border}`,
  boxShadow:    '0 1px 3px rgba(0,0,0,0.06)',
};

export function statusPill(status) {
  const map = {
    CONFIRMED:   { bg: C.greenPale, color: C.green  },
    SCHEDULED:   { bg: C.bluePale,  color: C.blue   },
    RESCHEDULED: { bg: '#ede9fe',   color: '#7c3aed' },
    CANCELLED:   { bg: C.redPale,   color: C.red    },
    COMPLETED:   { bg: C.greenPale, color: C.green  },
    NO_SHOW:     { bg: C.amberPale, color: C.amber  },
  };
  const s = map[status] || { bg: C.surface, color: C.textMuted };
  return {
    display:      'inline-block',
    background:   s.bg,
    color:        s.color,
    fontSize:     11,
    fontWeight:   600,
    padding:      '3px 10px',
    borderRadius: 20,
  };
}

export const btn = {
  primary: {
    padding:      '9px 18px',
    background:   C.blue,
    color:        'white',
    border:       'none',
    borderRadius: 9,
    fontSize:     13,
    fontWeight:   600,
    cursor:       'pointer',
    fontFamily:   'DM Sans, sans-serif',
  },
  secondary: {
    padding:      '9px 18px',
    background:   'white',
    color:        C.blue,
    border:       `1px solid ${C.border}`,
    borderRadius: 9,
    fontSize:     13,
    fontWeight:   600,
    cursor:       'pointer',
    fontFamily:   'DM Sans, sans-serif',
  },
  danger: {
    padding:      '9px 18px',
    background:   C.red,
    color:        'white',
    border:       'none',
    borderRadius: 9,
    fontSize:     13,
    fontWeight:   600,
    cursor:       'pointer',
    fontFamily:   'DM Sans, sans-serif',
  },
};