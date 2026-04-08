'use client';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
/**
 * src/app/patient/appointments/book/page.js
 *
 * Book a new appointment.
 * Steps: 1. Pick specialty / search doctors → 2. Pick date+time → 3. Confirm + Pay
 *
 * API endpoints used:
 *   GET  /api/doctors               — list available doctors (with optional search/specialty)
 *   GET  /api/doctors/:id/slots     — available slots for a date
 *   POST /api/appointments          — create appointment + Razorpay order
 *   POST /api/appointments/payment/verify — confirm payment
 *
 * Body sent for POST /api/appointments:
 *   { doctorId, scheduledAt, type, reason }
 *
 * FIXES vs uploaded version:
 *   ✓ Removed broken `import AppLayout from '@/components/AppLayout'`
 *   ✓ Removed broken `import { C, card, btn } from '@/lib/styles'`
 *   ✓ Fully self-contained with inline Sidebar — same pattern as all other pages
 */

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';

function getParam(name) {
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get(name);
}

const NAVY  ='#0c1a2e', BLUE  ='#1565c0', BLUE_P ='#e3f0ff', RED   ='#c62828', RED_P ='#fdecea',
      AMBER ='#b45309', AMBER_P='#fff3e0', GREEN ='#1b5e20', GREEN_P='#e8f5e9',
      TEAL  ='#00796b', TEAL_P ='#e0f5f0', BORDER='#e2e8f0', SURFACE='#f7f9fc', MUTED='#8896a7', SEC='#4a5568';
const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

const NAV = [
  { id:'patientDashboard', label:'Dashboard',       icon:'⊞', href:'/patient'                   },
  { id:'patientAppts',     label:'My Appointments', icon:'📅', href:'/patient/appointments'      },
  { id:'patientBook',      label:'Book Appointment',icon:'➕', href:'/patient/appointments/book' },
  { id:'patientChat',      label:'Chat with Doctor',icon:'💬', href:'/patient/chat', badge:1     },
  { id:'patientReports',   label:'Report Analyzer', icon:'🔬', href:'/patient/reports',badge:'FREE'},
];

const SPECIALTIES = [
  'All Specialties','General Medicine','Cardiology','Diabetology','Endocrinology',
  'Nephrology','Pulmonology','Neurology','Orthopedics','Dermatology',
  'Ophthalmology','ENT','Psychiatry','Gynaecology','Paediatrics',
];

// ── Sidebar ───────────────────────────────────────────────────────────────────
function Sidebar({ active }) {
  const router = useRouter();
  const [name, setName]   = useState('Patient');
  const [inits, setInits] = useState('P');
  useEffect(() => {
    try {
      const u = JSON.parse(localStorage.getItem('mc_user') || '{}');
      const n = u?.patient ? `${u.patient.firstName||''} ${u.patient.lastName||''}`.trim() : (u?.email || 'Patient');
      setName(n); setInits(n.split(' ').filter(Boolean).map(w=>w[0]).join('').slice(0,2).toUpperCase() || 'P');
    } catch {}
  }, []);
  return (
    <div style={{ width:220, background:NAVY, display:'flex', flexDirection:'column', flexShrink:0 }}>
      <div style={{ padding:'20px 18px 14px', borderBottom:'1px solid rgba(255,255,255,0.08)' }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ width:32, height:32, background:BLUE, borderRadius:8, display:'flex', alignItems:'center', justifyContent:'center', position:'relative', flexShrink:0 }}>
            <div style={{ position:'absolute', width:14, height:3, background:'white', borderRadius:2 }} />
            <div style={{ position:'absolute', width:3, height:14, background:'white', borderRadius:2 }} />
          </div>
          <div>
            <div style={{ fontSize:13, fontWeight:600, color:'white' }}>MediConnect AI</div>
            <div style={{ fontSize:9, color:'rgba(255,255,255,0.3)', fontFamily:'monospace', letterSpacing:'0.1em' }}>PATIENT PORTAL</div>
          </div>
        </div>
      </div>
      <div style={{ margin:'10px 10px 6px', background:'rgba(255,255,255,0.06)', borderRadius:9, padding:'8px 10px', display:'flex', alignItems:'center', gap:8 }}>
        <div style={{ width:30, height:30, borderRadius:'50%', background:BLUE_P, color:BLUE, display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:700, flexShrink:0 }}>{inits}</div>
        <div style={{ flex:1, minWidth:0 }}>
          <div suppressHydrationWarning style={{ fontSize:12, fontWeight:500, color:'white', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{name}</div>
          <div style={{ fontSize:10, color:'rgba(255,255,255,0.4)' }}>Patient</div>
        </div>
      </div>
      <div style={{ padding:'10px 18px 4px', fontSize:9, color:'rgba(255,255,255,0.25)', fontFamily:'monospace', letterSpacing:'0.12em' }}>MY HEALTH</div>
      <div style={{ padding:'0 8px', flex:1 }}>
        {NAV.map(item => { const isA = active===item.id; return (
          <button key={item.id} onClick={() => router.push(item.href)}
            style={{ display:'flex', alignItems:'center', gap:10, width:'100%', padding:'9px 12px', margin:'2px 0', borderRadius:8, cursor:'pointer', border:'none', textAlign:'left', background:isA?BLUE:'transparent', color:isA?'white':'rgba(255,255,255,0.55)', fontSize:13, fontFamily:'DM Sans, sans-serif', fontWeight:isA?500:400 }}>
            <span style={{ fontSize:14 }}>{item.icon}</span>
            <span style={{ flex:1 }}>{item.label}</span>
            {item.badge!=null && <span style={{ background:item.badge==='FREE'?'#0e7490':'#ef4444', color:'white', fontSize:item.badge==='FREE'?9:10, fontWeight:600, padding:item.badge==='FREE'?'2px 6px':'1px 5px', borderRadius:99 }}>{item.badge}</span>}
          </button>
        ); })}
      </div>
      <div style={{ padding:'10px 12px', borderTop:'1px solid rgba(255,255,255,0.08)' }}>
        <button onClick={() => { localStorage.removeItem('mc_token'); localStorage.removeItem('mc_user'); router.push('/login'); }}
          style={{ width:'100%', padding:'7px 10px', background:'rgba(255,255,255,0.05)', border:'none', borderRadius:8, color:'rgba(255,255,255,0.4)', fontSize:12, cursor:'pointer', fontFamily:'DM Sans, sans-serif', textAlign:'left' }}>
          🚪 Sign out
        </button>
      </div>
    </div>
  );
}

// ── Step indicator ─────────────────────────────────────────────────────────────
function Steps({ current }) {
  const steps = ['Find Doctor', 'Pick Date & Time', 'Confirm & Pay'];
  return (
    <div style={{ display:'flex', alignItems:'center', marginBottom:24 }}>
      {steps.map((s, i) => {
        const done    = i < current;
        const active  = i === current;
        return (
          <div key={i} style={{ display:'flex', alignItems:'center', flex: i < steps.length-1 ? 1 : 'none' }}>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <div style={{ width:28, height:28, borderRadius:'50%', background:done?GREEN:active?BLUE:BORDER, color:done||active?'white':MUTED, display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:700, flexShrink:0 }}>
                {done ? '✓' : i+1}
              </div>
              <div style={{ fontSize:13, fontWeight:active?600:400, color:active?NAVY:MUTED, whiteSpace:'nowrap' }}>{s}</div>
            </div>
            {i < steps.length-1 && <div style={{ flex:1, height:1, background:done?GREEN:BORDER, margin:'0 12px' }} />}
          </div>
        );
      })}
    </div>
  );
}

// ── Doctor card ───────────────────────────────────────────────────────────────
function DoctorCard({ doc, onSelect }) {
  const [hov, setHov] = useState(false);
  const fee = doc.consultFee ? `₹${Math.round(doc.consultFee / 100)}` : 'Fee on request';
  const inits = `${doc.firstName?.[0]||''}${doc.lastName?.[0]||''}`.toUpperCase() || 'DR';
  return (
    <div onClick={() => onSelect(doc)}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ background:'white', borderRadius:14, border:`1.5px solid ${hov?BLUE:BORDER}`, padding:'16px 18px', cursor:'pointer', transition:'all 0.15s', boxShadow:hov?'0 4px 16px rgba(0,0,0,0.08)':'none', display:'flex', gap:14, alignItems:'flex-start' }}>
      <div style={{ width:48, height:48, borderRadius:12, background:TEAL_P, color:TEAL, display:'flex', alignItems:'center', justifyContent:'center', fontSize:16, fontWeight:700, flexShrink:0 }}>
        {doc.photoUrl ? <img src={doc.photoUrl} alt={doc.firstName} style={{ width:48, height:48, borderRadius:12, objectFit:'cover' }}/> : inits}
      </div>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontSize:14, fontWeight:700, color:NAVY, marginBottom:2 }}>Dr. {doc.firstName} {doc.lastName}</div>
        <div style={{ fontSize:12, color:TEAL, fontWeight:600, marginBottom:4 }}>{doc.specialty}</div>
        {doc.qualification && <div style={{ fontSize:11.5, color:MUTED, marginBottom:3 }}>{doc.qualification}</div>}
        {doc.hospital && <div style={{ fontSize:11.5, color:MUTED, marginBottom:6 }}>🏥 {doc.hospital}</div>}
        <div style={{ display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' }}>
          <span style={{ fontSize:13, fontWeight:700, color:BLUE }}>{fee}</span>
          {doc.bio && <span style={{ fontSize:11.5, color:MUTED, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:220 }}>{doc.bio}</span>}
        </div>
      </div>
      <div style={{ fontSize:12, fontWeight:700, color:BLUE, flexShrink:0, marginTop:2 }}>Select →</div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
// Deduplicate doctors — same person registered multiple times
// Uses progressive key matching: phone → name+specialty → name only
function deduplicateDoctors(list) {
  if (!list || list.length === 0) return list;

  const seen = new Map();
  const result = [];

  for (const d of list) {
    const firstName  = (d.firstName  || '').toLowerCase().replace(/\s/g, '');
    const lastName   = (d.lastName   || '').toLowerCase().replace(/\s/g, '');
    const specialty  = (d.specialty  || '').toLowerCase().replace(/\s/g, '');
    const phone10    = (d.phone      || '').replace(/\D/g, '').slice(-10);

    // Build multiple possible keys — match on ANY of them
    const keys = [
      // Most specific: phone number (unique per person)
      phone10 ? `phone_${phone10}` : null,
      // Name + specialty (same doctor can't be in two specialties)
      `name_spec_${firstName}_${lastName}_${specialty}`,
      // Name only (absolute fallback — same first+last = same person)
      `name_${firstName}_${lastName}`,
    ].filter(Boolean);

    // Check if already seen by any key
    let existingKey = null;
    for (const k of keys) {
      if (seen.has(k)) { existingKey = k; break; }
    }

    if (existingKey) {
      // Already have this doctor — keep the more complete record
      const existingIdx = seen.get(existingKey);
      const existing    = result[existingIdx];
      const score  = r => (r.bio?r.bio.length:0) + (r.photoUrl?100:0) + (r.consultFee?10:0);
      if (score(d) > score(existing)) {
        result[existingIdx] = d; // replace with better record
        // Update all keys to point to same index
        keys.forEach(k => seen.set(k, existingIdx));
      }
    } else {
      // New doctor — add to result and register all keys
      const idx = result.length;
      result.push(d);
      keys.forEach(k => seen.set(k, idx));
    }
  }

  return result;
}


function BookAppointmentPage() {
  const router       = useRouter();

  const [mounted,  setMounted]  = useState(false);
  const [step,     setStep]     = useState(0); // 0=find 1=datetime 2=confirm
  const [loading,  setLoading]  = useState(false);
  const [toast,    setToast]    = useState('');

  // Step 0 — Doctor search
  const [search,    setSearch]    = useState('');
  const [specialty, setSpecialty] = useState('All Specialties');
  const [doctors,   setDoctors]   = useState([]);
  const [docLoading,setDocLoading]= useState(false);
  const [selDoctor, setSelDoctor] = useState(null);

  // Step 1 — Date + time
  const [selDate,  setSelDate]  = useState('');
  const [selTime,  setSelTime]  = useState('');
  const [slots,    setSlots]    = useState([]);
  const [slotLoad, setSlotLoad] = useState(false);
  const [apptType, setApptType] = useState('IN_PERSON');
  const [reason,   setReason]   = useState('');

  // Step 2 — Confirm + payment
  const [booking,  setBooking]  = useState(false);
  const [user,     setUser]     = useState(null);
  const [booked,   setBooked]   = useState(null); // { appointmentId, order }

  const token = useCallback(() => localStorage.getItem('mc_token') || '', []);

  const showToast = useCallback(msg => { setToast(msg); setTimeout(() => setToast(''), 4000); }, []);

  useEffect(() => {
    setMounted(true);
    const tok = localStorage.getItem('mc_token');
    const u   = localStorage.getItem('mc_user');
    if (!tok) { router.push('/login'); return; }
    if (u) {
      try { const parsed = JSON.parse(u); if (parsed.role !== 'PATIENT') { router.push('/'); return; } }
      catch {}
    }
    // Pre-select doctor if coming from a link with ?doctorId=
    const preId = getParam('doctorId');
    if (preId) loadSingleDoctor(preId);
    else loadDoctors();
  }, []);

  async function loadSingleDoctor(id) {
    setDocLoading(true);
    try {
      const r = await fetch(`${API}/doctors?limit=100`, { headers:{ Authorization:`Bearer ${token()}` } });
      const d = await r.json();
      const raw  = d.doctors || d.data || [];
      const list = deduplicateDoctors(raw);
      setDoctors(list);
      const doc = list.find(dr => dr.id === id || dr.userId === id);
      if (doc) { setSelDoctor(doc); setStep(1); }
    } catch {}
    setDocLoading(false);
  }

  async function loadDoctors() {
    setDocLoading(true);
    try {
      const params = new URLSearchParams({ limit:'50' });
      if (search.trim())                        params.set('search', search.trim());
      if (specialty !== 'All Specialties')      params.set('specialty', specialty);
      const r = await fetch(`${API}/doctors?${params}`, { headers:{ Authorization:`Bearer ${token()}` } });
      const d = await r.json();
      setDoctors(deduplicateDoctors(d.doctors || d.data || []));
    } catch { showToast('❌ Failed to load doctors'); }
    setDocLoading(false);
  }

  // Generate default slots (9 AM – 6 PM, 30-min intervals) for dates when the
  // doctor hasn't configured specific DoctorSlot records in the database.
  function generateDefaultSlots(dateStr) {
    const slots = [];
    const now = new Date();
    const isToday = dateStr === new Date().toISOString().split('T')[0];
    for (let h = 9; h < 18; h++) {
      for (let m of [0, 30]) {
        const slotDt = new Date(`${dateStr}T${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:00`);
        if (isToday && slotDt <= now) continue; // skip past times
        const display = slotDt.toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit', hour12:true });
        const time    = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
        slots.push({ time, display, available: true, isoTime: slotDt.toISOString() });
      }
    }
    return slots;
  }

  async function loadSlots(date) {
    if (!selDoctor || !date) return;
    setSlotLoad(true); setSlots([]);
    try {
      const r = await fetch(`${API}/doctors/${selDoctor.id}/slots?date=${date}`, { headers:{ Authorization:`Bearer ${token()}` } });
      const d = await r.json();
      const apiSlots = d.data || d.slots || [];
      const available = apiSlots.filter(s => s.available !== false);

      if (available.length > 0) {
        // Doctor has real configured slots → use them
        setSlots(available);
      } else if (apiSlots.length > 0 && available.length === 0) {
        // Doctor HAS slots but all are booked
        showToast('All slots for this date are already booked. Try another day.');
        setSlots([]);
      } else {
        // Doctor has NO slot records in DB → generate standard 9 AM–6 PM slots
        const defaults = generateDefaultSlots(date);
        if (defaults.length > 0) {
          setSlots(defaults);
        } else {
          // All default slots are in the past (today, evening)
          showToast('No more slots available today. Try selecting a future date.');
        }
      }
    } catch { showToast('❌ Failed to load slots'); }
    setSlotLoad(false);
  }

  function selectDate(date) {
    setSelDate(date); setSelTime(''); loadSlots(date);
  }

  async function bookAppointment() {
    if (!selDoctor || !selDate || !selTime) { showToast('Please select a date and time'); return; }
    setBooking(true);
    try {
      // Build ISO string in local time — avoid UTC conversion making time appear in the past
      const scheduledAt = new Date(`${selDate}T${selTime}:00`).toISOString();
      // Safety: ensure we're not sending a past time (browser clock drift)
      if (new Date(scheduledAt) < new Date(Date.now() - 60000)) {
        showToast('❌ Selected time is in the past. Please choose a future slot.');
        setBooking(false); return;
      }
      const r = await fetch(`${API}/appointments`, {
        method: 'POST',
        headers: { Authorization:`Bearer ${token()}`, 'Content-Type':'application/json' },
        body: JSON.stringify({ doctorId: selDoctor.id, scheduledAt, type: apptType, reason: reason.trim() || undefined }),
      });
      const d = await r.json();
      if (!r.ok) {
        const msg = d.error || d.message || 'Booking failed';
        // Show the full error so user knows exactly what went wrong
        showToast('❌ ' + msg);
        // Show fix hint if backend provided one
        if (d.fix) showToast('ℹ️ ' + d.fix.slice(0, 120));
        // Log doctors in DB if doctor not found (common setup issue)
        if (d.doctorsInDB) {
          console.warn('[BOOKING] Doctors in DB:', d.doctorsInDB);
          if (d.doctorsInDB.length === 0) {
            showToast('⚠️ No doctors in database. Ask admin to add doctors first.');
          }
        }
        setBooking(false); return;
      }

      setBooked(d);

      // Mock/dev mode: no Razorpay key → auto-confirm immediately
      const isMock = !d.order || d.order.mock || !d.order.keyId
        || (d.order.id || '').startsWith('order_mock_');

      if (isMock) {
        // Auto-verify so appointment status becomes SCHEDULED (awaiting doctor confirm)
        try {
          const vr = await fetch(`${API}/appointments/payment/verify`, {
            method: 'POST',
            headers: { Authorization:`Bearer ${token()}`, 'Content-Type':'application/json' },
            body: JSON.stringify({
              appointmentId:       d.appointment?.id || d.appointmentId,
              razorpay_order_id:   d.order?.id || 'order_mock',
              razorpay_payment_id: 'mock_pay_' + Date.now(),
              razorpay_signature:  'mock_sig',
            }),
          });
          const vd = await vr.json();
          if (!vr.ok) console.warn('[MOCK VERIFY]', vd.error || vd.message);
        } catch (e) { console.warn('[MOCK VERIFY]', e.message); }
        setStep(3);
      } else {
        // Real Razorpay payment — key is available
        loadRazorpay(d);
      }
    } catch (e) { showToast('❌ Network error: ' + e.message); }
    setBooking(false);
  }

  function loadRazorpay(bookingData) {
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = async () => {
      const options = {
        key:         bookingData.order.keyId || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || '',
        amount:      bookingData.order.amount,
        currency:    'INR',
        name:        'MediConnect AI',
        description: `Appointment with Dr. ${selDoctor.firstName} ${selDoctor.lastName}`,
        image:       '/logo.png',
        order_id:    bookingData.order.id,
        prefill: {
          name:    user ? user.firstName + ' ' + user.lastName : '',
          email:   user ? user.email : '',
          contact: user ? user.phone : '',
        },
        notes: { appointmentId: bookingData.appointment?.id || bookingData.appointmentId },
        theme: { color: '#1565c0' },
        handler: async function(resp) {
          try {
            await fetch(`${API}/appointments/payment/verify`, {
              method: 'POST',
              headers: { Authorization:`Bearer ${token()}`, 'Content-Type':'application/json' },
              body: JSON.stringify({
                appointmentId:       bookingData.appointment?.id || bookingData.appointmentId,
                razorpay_order_id:   resp.razorpay_order_id,
                razorpay_payment_id: resp.razorpay_payment_id,
                razorpay_signature:  resp.razorpay_signature,
              }),
            });
          } catch (e) { console.warn('Payment verify:', e.message); }
          setStep(3);
        },

      };
      const rzpKey = options.key || '';
      if (!rzpKey) {
        showToast('ℹ️ Payment gateway not configured — using test/mock mode. Appointment will be created directly.');
        // Fall back to mock confirmation
        try {
          await fetch(`${API}/appointments/payment/verify`, {
            method: 'POST',
            headers: { Authorization:`Bearer ${token()}`, 'Content-Type':'application/json' },
            body: JSON.stringify({
              appointmentId:       bookingData.appointment?.id || bookingData.appointmentId,
              razorpay_order_id:   bookingData.order?.id || 'order_mock',
              razorpay_payment_id: 'mock_pay_' + Date.now(),
              razorpay_signature:  'mock_sig',
            }),
          });
        } catch {}
        setStep(3);
        return;
      }
      const rzp = new window.Razorpay(options);
      rzp.open();
    };
    document.body.appendChild(script);
  }

  // Minimum date: today
  // Filter available times to only show future slots when date is today
  const nowHHMM = new Date().toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit', hour12:false }).replace(/[^\d:]/g,'').padStart(5,'0');
  const today  = new Date().toISOString().split('T')[0];
  const maxDate= new Date(Date.now() + 60*24*3600*1000).toISOString().split('T')[0];

  
  return (
    <div style={{ display:'flex', height:'100vh', overflow:'hidden', fontFamily:'DM Sans, sans-serif' }}>
      <Sidebar active="patientBook" />

      <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>
        <div style={{ flex:1, overflowY:'auto', padding:24, background:SURFACE }}>

          {/* Header */}
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:22, flexWrap:'wrap', gap:10 }}>
            <div>
              <div style={{ fontSize:20, fontWeight:700, color:NAVY }}>Book Appointment</div>
              <div style={{ fontSize:13, color:MUTED, marginTop:2 }}>Find a doctor and book your visit</div>
            </div>
            <button onClick={() => router.push('/patient/appointments')}
              style={{ padding:'8px 14px', background:'white', color:SEC, border:`1px solid ${BORDER}`, borderRadius:9, fontSize:13, cursor:'pointer' }}>
              ← My Appointments
            </button>
          </div>

          {/* Step indicators */}
          {step < 3 && <Steps current={step} />}

          {/* ── Step 0: Find Doctor ── */}
          {step === 0 && (
            <div>
              {/* Search + filter */}
              <div style={{ background:'white', borderRadius:14, border:`1px solid ${BORDER}`, padding:'16px 18px', marginBottom:16 }}>
                <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
                  <input value={search} onChange={e=>setSearch(e.target.value)} onKeyDown={e=>e.key==='Enter'&&loadDoctors()}
                    placeholder="Search by name or hospital…"
                    style={{ flex:1, minWidth:200, padding:'9px 12px', border:`1px solid ${BORDER}`, borderRadius:9, fontSize:13, outline:'none', fontFamily:'DM Sans, sans-serif' }}/>
                  <select value={specialty} onChange={e=>setSpecialty(e.target.value)}
                    style={{ padding:'9px 12px', border:`1px solid ${BORDER}`, borderRadius:9, fontSize:13, outline:'none', fontFamily:'DM Sans, sans-serif', background:'white' }}>
                    {SPECIALTIES.map(s=><option key={s}>{s}</option>)}
                  </select>
                  <button onClick={loadDoctors} disabled={docLoading}
                    style={{ padding:'9px 18px', background:BLUE, color:'white', border:'none', borderRadius:9, fontSize:13, fontWeight:600, cursor:docLoading?'default':'pointer', opacity:docLoading?0.7:1 }}>
                    {docLoading ? '⏳' : '🔍 Search'}
                  </button>
                </div>
              </div>

              {/* Doctor list */}
              {docLoading && <div style={{ padding:'32px 0', textAlign:'center', color:MUTED }}>Loading doctors…</div>}
              {!docLoading && doctors.length === 0 && (
                <div style={{ background:'white', borderRadius:14, border:`1px solid ${BORDER}`, padding:48, textAlign:'center' }}>
                  <div style={{ fontSize:32, marginBottom:12 }}>👨‍⚕️</div>
                  <div style={{ fontSize:14, fontWeight:600, color:SEC, marginBottom:6 }}>No doctors found</div>
                  <div style={{ fontSize:13, color:MUTED }}>Try a different search or specialty</div>
                </div>
              )}
              {!docLoading && doctors.length > 0 && (
                <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                  {doctors.map(doc => (
                    <DoctorCard key={doc.id} doc={doc} onSelect={d=>{ setSelDoctor(d); setStep(1); setSelDate(''); setSelTime(''); }} />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Step 1: Date + time ── */}
          {step === 1 && selDoctor && (
            <div style={{ maxWidth:640 }}>
              {/* Selected doctor card */}
              <div style={{ background:'white', borderRadius:14, border:`1px solid ${BORDER}`, padding:'14px 18px', marginBottom:20, display:'flex', gap:12, alignItems:'center' }}>
                <div style={{ width:44, height:44, borderRadius:10, background:TEAL_P, color:TEAL, display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, fontWeight:700, flexShrink:0 }}>
                  {selDoctor.firstName?.[0]||''}{selDoctor.lastName?.[0]||''}
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:14, fontWeight:700, color:NAVY }}>Dr. {selDoctor.firstName} {selDoctor.lastName}</div>
                  <div style={{ fontSize:12, color:TEAL }}>{selDoctor.specialty} · {selDoctor.hospital}</div>
                  <div style={{ fontSize:13, fontWeight:700, color:BLUE, marginTop:3 }}>
                    {selDoctor.consultFee ? `₹${Math.round(selDoctor.consultFee/100)}` : 'Fee on request'}
                  </div>
                </div>
                <button onClick={() => { setSelDoctor(null); setStep(0); }}
                  style={{ padding:'6px 12px', background:SURFACE, color:MUTED, border:`1px solid ${BORDER}`, borderRadius:8, fontSize:12, cursor:'pointer' }}>
                  Change
                </button>
              </div>

              {/* Appointment type */}
              <div style={{ background:'white', borderRadius:14, border:`1px solid ${BORDER}`, padding:'14px 18px', marginBottom:16 }}>
                <div style={{ fontSize:13, fontWeight:700, color:NAVY, marginBottom:10 }}>Appointment Type</div>
                <div style={{ display:'flex', gap:10 }}>
                  {['IN_PERSON','VIDEO_CALL'].map(t => (
                    <button key={t} onClick={() => setApptType(t)}
                      style={{ padding:'8px 20px', borderRadius:9, border:`1.5px solid ${apptType===t?BLUE:BORDER}`, background:apptType===t?BLUE_P:'white', color:apptType===t?BLUE:MUTED, fontSize:13, fontWeight:apptType===t?700:400, cursor:'pointer' }}>
                      {t==='IN_PERSON'?'🏥 In Person':'🎥 Video Call'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Date picker */}
              <div style={{ background:'white', borderRadius:14, border:`1px solid ${BORDER}`, padding:'14px 18px', marginBottom:16 }}>
                <div style={{ fontSize:13, fontWeight:700, color:NAVY, marginBottom:10 }}>Select Date</div>
                <input type="date" min={today} max={maxDate} value={selDate}
                  onChange={e => selectDate(e.target.value)}
                  style={{ padding:'9px 12px', border:`1px solid ${BORDER}`, borderRadius:9, fontSize:14, outline:'none', fontFamily:'DM Sans, sans-serif', width:'auto' }}/>
              </div>

              {/* Time slots */}
              {selDate && (
                <div style={{ background:'white', borderRadius:14, border:`1px solid ${BORDER}`, padding:'14px 18px', marginBottom:16 }}>
                  <div style={{ fontSize:13, fontWeight:700, color:NAVY, marginBottom:10 }}>
                    Available Times for {new Date(selDate+'T00:00:00').toLocaleDateString('en-IN',{weekday:'long',day:'numeric',month:'long'})}
                  </div>
                  {slotLoad && <div style={{ color:MUTED, fontSize:13 }}>Loading slots…</div>}

                  {/* Slot buttons (real or auto-generated defaults) */}
                  {!slotLoad && slots.length > 0 && (
                    <div>
                      <div style={{ fontSize:12, color:MUTED, marginBottom:8 }}>
                        {slots.length} time slot{slots.length > 1 ? 's' : ''} available — click to select
                      </div>
                      <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
                        {slots.map(slot => {
                          const slotKey   = slot.time || slot;
                          const slotLabel = slot.display || slot.time || slot;
                          return (
                            <button key={slotKey} onClick={() => setSelTime(slotKey)}
                              style={{ padding:'8px 16px', borderRadius:8, border:`1.5px solid ${selTime===slotKey?BLUE:BORDER}`, background:selTime===slotKey?BLUE:'white', color:selTime===slotKey?'white':NAVY, fontSize:13, fontWeight:selTime===slotKey?700:400, cursor:'pointer', fontFamily:'DM Sans, sans-serif', transition:'all 0.12s' }}>
                              {slotLabel}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Manual time — last-resort fallback (e.g. all default slots in the past for today) */}
                  {!slotLoad && slots.length === 0 && (
                    <div>
                      <div style={{ fontSize:12, color:MUTED, marginBottom:8 }}>Enter your preferred time:</div>
                      <input type="time" value={selTime} onChange={e => setSelTime(e.target.value)}
                        style={{ padding:'9px 14px', border:`1.5px solid ${selTime?BLUE:BORDER}`, borderRadius:9, fontSize:14, outline:'none' }}/>
                      {selTime && <span style={{ marginLeft:10, fontSize:12, color:GREEN, fontWeight:600 }}>✓ {selTime} selected</span>}
                    </div>
                  )}
                </div>
              )}

              {/* Reason */}
              <div style={{ background:'white', borderRadius:14, border:`1px solid ${BORDER}`, padding:'14px 18px', marginBottom:16 }}>
                <div style={{ fontSize:13, fontWeight:700, color:NAVY, marginBottom:8 }}>Reason for Visit (optional)</div>
                <textarea value={reason} onChange={e => setReason(e.target.value)}
                  placeholder="Briefly describe your symptoms or reason for the appointment…"
                  rows={3}
                  style={{ width:'100%', padding:'9px 12px', border:`1px solid ${BORDER}`, borderRadius:9, fontSize:13, outline:'none', resize:'vertical', fontFamily:'DM Sans, sans-serif', boxSizing:'border-box' }}/>
              </div>

              <div style={{ display:'flex', gap:10 }}>
                <button onClick={() => setStep(0)}
                  style={{ padding:'10px 20px', background:'white', color:SEC, border:`1px solid ${BORDER}`, borderRadius:9, fontSize:13, cursor:'pointer' }}>
                  ← Back
                </button>
                <button onClick={() => { if(!selDate||!selTime){showToast('Please select date and time');return;} setStep(2); }}
                  disabled={!selDate || !selTime}
                  style={{ flex:1, padding:'10px 20px', background:selDate&&selTime?BLUE:'#90a4ae', color:'white', border:'none', borderRadius:9, fontSize:13, fontWeight:600, cursor:selDate&&selTime?'pointer':'default' }}>
                  Continue to Confirm →
                </button>
              </div>
            </div>
          )}

          {/* ── Step 2: Confirm ── */}
          {step === 2 && selDoctor && (
            <div style={{ maxWidth:500 }}>
              <div style={{ background:'white', borderRadius:14, border:`1px solid ${BORDER}`, padding:'20px 22px', marginBottom:16 }}>
                <div style={{ fontSize:15, fontWeight:700, color:NAVY, marginBottom:16 }}>Appointment Summary</div>

                {[
                  ['Doctor',   `Dr. ${selDoctor.firstName} ${selDoctor.lastName}`],
                  ['Specialty', selDoctor.specialty],
                  ['Hospital',  selDoctor.hospital || '—'],
                  ['Type',      apptType === 'IN_PERSON' ? '🏥 In Person' : '🎥 Video Call'],
                  ['Date',      new Date(selDate+'T00:00:00').toLocaleDateString('en-IN',{weekday:'long',day:'numeric',month:'long',year:'numeric'})],
                  ['Time',      selTime],
                  ...(reason ? [['Reason', reason]] : []),
                  ['Consultation Fee', selDoctor.consultFee ? `₹${Math.round(selDoctor.consultFee/100)}` : 'Free / On request'],
                ].map(([label, value]) => (
                  <div key={label} style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', padding:'9px 0', borderBottom:`1px solid ${BORDER}`, gap:16 }}>
                    <span style={{ fontSize:13, color:MUTED, flexShrink:0 }}>{label}</span>
                    <span style={{ fontSize:13, fontWeight:500, color:NAVY, textAlign:'right' }}>{value}</span>
                  </div>
                ))}
              </div>

              <div style={{ background:BLUE_P, borderRadius:10, padding:'12px 14px', marginBottom:16, fontSize:12.5, color:BLUE }}>
                ℹ️ Payment is handled by Razorpay. In development mode, bookings are confirmed automatically without real payment.
              </div>

              <div style={{ display:'flex', gap:10 }}>
                <button onClick={() => setStep(1)}
                  style={{ padding:'10px 20px', background:'white', color:SEC, border:`1px solid ${BORDER}`, borderRadius:9, fontSize:13, cursor:'pointer' }}>
                  ← Back
                </button>
                <button onClick={bookAppointment} disabled={booking}
                  style={{ flex:1, padding:'10px 20px', background:booking?'#90a4ae':BLUE, color:'white', border:'none', borderRadius:9, fontSize:13, fontWeight:700, cursor:booking?'default':'pointer' }}>
                  {booking ? '⏳ Booking…' : `Confirm & Pay${selDoctor.consultFee ? ` ₹${Math.round(selDoctor.consultFee/100)}` : ''}`}
                </button>
              </div>
            </div>
          )}

          {/* ── Step 3: Success ── */}
          {step === 3 && (
            <div style={{ maxWidth:480, margin:'0 auto', textAlign:'center', padding:'32px 0' }}>
              <div style={{ fontSize:56, marginBottom:16 }}>✅</div>
              <div style={{ fontSize:22, fontWeight:700, color:GREEN, marginBottom:8 }}>Appointment Booked!</div>
              <div style={{ fontSize:14, color:SEC, lineHeight:1.7, marginBottom:24 }}>
                Your appointment with Dr. {selDoctor?.firstName} {selDoctor?.lastName} on{' '}
                {selDate && new Date(selDate+'T00:00:00').toLocaleDateString('en-IN',{day:'numeric',month:'long',year:'numeric'})} at {selTime} has been confirmed.
              </div>
              <div style={{ display:'flex', gap:10, justifyContent:'center', flexWrap:'wrap' }}>
                <button onClick={() => router.push('/patient/appointments')}
                  style={{ padding:'10px 22px', background:BLUE, color:'white', border:'none', borderRadius:9, fontSize:13, fontWeight:600, cursor:'pointer' }}>
                  View My Appointments
                </button>
                <button onClick={() => router.push('/patient/chat')}
                  style={{ padding:'10px 22px', background:TEAL_P, color:TEAL, border:`1px solid ${TEAL}30`, borderRadius:9, fontSize:13, fontWeight:600, cursor:'pointer' }}>
                  💬 Message Doctor
                </button>
                <button onClick={() => { setStep(0); setSelDoctor(null); setSelDate(''); setSelTime(''); setReason(''); loadDoctors(); }}
                  style={{ padding:'10px 22px', background:'white', color:MUTED, border:`1px solid ${BORDER}`, borderRadius:9, fontSize:13, cursor:'pointer' }}>
                  Book Another
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {toast && (
        <div style={{ position:'fixed', bottom:24, right:24, background:NAVY, color:'white', padding:'12px 20px', borderRadius:12, fontSize:13, zIndex:9999, boxShadow:'0 4px 20px rgba(0,0,0,0.2)', maxWidth:380 }}>
          {toast}
        </div>
      )}
    </div>
  );
}

export default BookAppointmentPage;