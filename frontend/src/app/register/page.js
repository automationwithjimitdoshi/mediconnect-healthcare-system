'use client';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
/**
 * src/app/register/page.js
 * - Patient + Doctor registration
 * - Real-time validation for every field
 * - Phone number with country code
 * - Password strength meter
 * - Clear errors for duplicate email, phone, etc.
 * - After success → /login?registered=1
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';

const API   = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';
const NAVY  = '#0A1628', BLUE  = '#2563EB', BLUE_L = '#60A5FA';
const RED   = '#DC2626', RED_P = '#FEF2F2';
const GREEN = '#166534';
const AMBER = '#92400E', AMB_P = '#FFFBEB';
const BORDER= '#E2E8F0', MUTED = '#64748B';

const inp = (err) => ({ width:'100%', padding:'9px 12px', border:`1.5px solid ${err?'#FCA5A5':BORDER}`, borderRadius:9, fontSize:13, outline:'none', boxSizing:'border-box', fontFamily:'DM Sans, sans-serif' });
const lbl = { display:'block', fontSize:12, fontWeight:500, color:'#374151', marginBottom:4 };

function FieldError({ msg }) {
  if (!msg) return null;
  return <div style={{ fontSize:12, color:RED, marginTop:3 }}>{msg}</div>;
}

function passStrength(p) {
  if (!p) return null;
  if (p.length < 6)  return { w:'25%', c:'#ef4444', label:'Too short' };
  if (p.length < 8 || !/[0-9]/.test(p)) return { w:'50%', c:AMBER, label:'Weak' };
  if (!/[A-Z]/.test(p)||!/[^a-zA-Z0-9]/.test(p)) return { w:'75%', c:'#f59e0b', label:'Fair' };
  return { w:'100%', c:'#22c55e', label:'Strong' };
}

const SPECIALTIES = ['Cardiology','Dermatology','Endocrinology','ENT','Gastroenterology','General Medicine','General Practice','Gynaecology','Haematology','Nephrology','Neurology','Oncology','Ophthalmology','Orthopaedics','Paediatrics','Psychiatry','Pulmonology','Radiology','Rheumatology','Urology','Other'];

export default function RegisterPage() {
  const router = useRouter();
  const [role, setRole] = useState(() => {
    // Allow ?role=DOCTOR or ?role=PATIENT in URL to pre-select the tab
    if (typeof window !== 'undefined') {
      const p = new URLSearchParams(window.location.search).get('role');
      if (p === 'DOCTOR' || p === 'PATIENT') return p;
    }
    return 'PATIENT';
  });
  const [form, setForm] = useState({
    email:'', password:'', confirmPassword:'',
    firstName:'', lastName:'', phone:'', countryCode:'+91',
    dateOfBirth:'', gender:'Male', bloodType:'', abhaNumber:'',
    specialty:'', qualification:'', hospital:'', consultFee:'',
    medicalRegNumber:'', stateMedicalCouncil:'', registrationYear:'',
  });
  const [fieldErrs, setFErrs] = useState({});
  const [formErr,   setFormErr] = useState('');
  const [loading,   setLoading] = useState(false);
  const [pending,   setPending] = useState(null);

  const f = k => e => {
    setForm(p => ({ ...p, [k]: e.target.value }));
    setFErrs(p => ({ ...p, [k]: '' })); // clear field error on change
    setFormErr('');
  };

  const str = passStrength(form.password);

  function validate() {
    const errs = {};
    if (!form.firstName.trim())  errs.firstName = 'First name is required.';
    if (!form.lastName.trim())   errs.lastName  = 'Last name is required.';
    if (!form.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()))
      errs.email = 'Enter a valid email address.';
    const fullPhone = `${form.countryCode}${form.phone.trim().replace(/^0+/,'')}`;
    if (!form.phone.trim() || form.phone.replace(/\D/g,'').length < 7)
      errs.phone = 'Enter a valid phone number (min 7 digits).';
    if (form.password.length < 6)
      errs.password = 'Password must be at least 6 characters.';
    if (form.password !== form.confirmPassword)
      errs.confirmPassword = 'Passwords do not match.';
    if (role === 'DOCTOR') {
      if (!form.specialty.trim())     errs.specialty     = 'Specialty is required.';
      if (!form.qualification.trim()) errs.qualification = 'Qualification is required.';
      if (!form.hospital.trim())      errs.hospital      = 'Hospital/clinic is required.';
    }
    return errs;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setFErrs(errs); return; }
    setLoading(true); setFormErr(''); setFErrs({});

    const fullPhone = `${form.countryCode}${form.phone.trim().replace(/^0+/,'')}`;

    try {
      const body = {
        email:     form.email.trim().toLowerCase(),
        password:  form.password,
        role,
        firstName: form.firstName.trim(),
        lastName:  form.lastName.trim(),
        phone:     fullPhone,
      };
      if (role === 'PATIENT') {
        if (form.dateOfBirth) body.dateOfBirth = form.dateOfBirth;
        body.gender    = form.gender;
        body.bloodType = form.bloodType || null;
        if (form.abhaNumber?.trim()) body.abhaNumber = form.abhaNumber.trim();
      } else {
        body.specialty           = form.specialty.trim();
        body.qualification       = form.qualification.trim();
        body.hospital            = form.hospital.trim();
        body.medicalRegNumber    = form.medicalRegNumber.trim();
        body.stateMedicalCouncil = form.stateMedicalCouncil.trim();
        body.registrationYear    = form.registrationYear.trim();
        if (form.consultFee) body.consultFee = parseFloat(form.consultFee);
      }

      const res  = await fetch(`${API}/auth/register`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) });
      const data = await res.json();

      if (!res.ok) {
        const msg = data.error || data.errors?.[0]?.msg || String(data.errors?.[0] || '') || 'Registration failed.';
        // Use exact error codes from backend to avoid false matches
        if (msg === 'EMAIL_TAKEN') {
          setFErrs({ email: 'This email is already registered. Try signing in.' });
        } else if (msg === 'PHONE_TAKEN') {
          setFErrs({ phone: 'This phone number is already in use. Try a different number.' });
        } else if (msg === 'MISSING_MRN') {
          setFErrs({ medicalRegNumber: 'Medical Registration Number is required for doctor accounts.' });
        } else if (msg === 'INVALID_MRN') {
          setFErrs({ medicalRegNumber: 'Invalid format. Expected e.g. MH/12345 or DL/67890.' });
        } else if (msg === 'MRN_TAKEN') {
          setFErrs({ medicalRegNumber: 'This Medical Registration Number is already registered.' });
        } else if (msg === 'INVALID_QUALIFICATION') {
          setFErrs({ qualification: 'Must include a recognised medical degree (MBBS, MD, MS, BDS etc.).' });
        } else if (data.errors && Array.isArray(data.errors)) {
          // express-validator errors
          const fieldErrs = {};
          data.errors.forEach(e => { if (e.path) fieldErrs[e.path] = e.msg; });
          if (Object.keys(fieldErrs).length) setFErrs(fieldErrs);
          else setFormErr(data.errors.map(e => e.msg || e).join('. '));
        } else {
          setFormErr(msg);
        }
        setLoading(false); return;
      }

      localStorage.removeItem('mc_token');
      localStorage.removeItem('mc_user');

      if (role === 'DOCTOR') {
        if (data.pendingReview) {
          // Show pending screen — do NOT redirect yet
          setPending({ appEmail: data.appEmail, mrn: form.medicalRegNumber });
        } else {
          // Auto-approved (institutional email)
          if (data.appEmail) localStorage.setItem('mc_doctor_app_email', data.appEmail);
          router.push('/doctor/login?registered=1&appEmail=' + encodeURIComponent(data.appEmail || ''));
        }
      } else {
        router.push('/patient/login?registered=1');
      }

    } catch {
      setFormErr('Cannot connect to the server. Make sure the backend is running on port 5000.');
    }
    setLoading(false);
  }

  return (
    <div style={{ minHeight:'100vh', background:`linear-gradient(135deg, ${NAVY} 0%, #1E3A5F 50%, ${NAVY} 100%)`, display:'flex', alignItems:'center', justifyContent:'center', padding:'24px 20px', fontFamily:'DM Sans, sans-serif' }}>
      <div style={{ width:'100%', maxWidth:520 }}>

        {/* Logo */}
        <div style={{ textAlign:'center', marginBottom:24 }}>
          <div style={{ display:'inline-flex', alignItems:'center', gap:10 }}>
            <div style={{ width:38, height:38, borderRadius:10, background:BLUE, display:'flex', alignItems:'center', justifyContent:'center', fontSize:20 }}>＋</div>
            <span style={{ fontSize:20, fontWeight:800, color:'white' }}>MediConnect <span style={{ color:BLUE_L }}>AI</span></span>
          </div>
        </div>

        <div style={{ background:'white', borderRadius:20, padding:'28px 28px', boxShadow:'0 20px 60px rgba(0,0,0,0.3)' }}>
          <div style={{ fontSize:20, fontWeight:700, color:'#0F172A', marginBottom:2 }}>Create your account</div>
          <div style={{ fontSize:13, color:MUTED, marginBottom:20 }}>Join MediConnect AI</div>

          {/* Role toggle */}
          <div style={{ display:'flex', background:'#F1F5F9', borderRadius:10, padding:3, marginBottom:20 }}>
            {['PATIENT','DOCTOR'].map(r => (
              <button key={r} type="button" onClick={()=>{setRole(r);setFErrs({});setFormErr('');}}
                style={{ flex:1, padding:'8px', borderRadius:8, border:'none', cursor:'pointer', fontSize:13, fontWeight:600, transition:'all 0.15s', background:role===r?'white':'transparent', color:role===r?BLUE:MUTED, boxShadow:role===r?'0 1px 4px rgba(0,0,0,0.1)':'none', fontFamily:'DM Sans, sans-serif' }}>
                {r==='PATIENT'?'🧑 Patient':'👨‍⚕️ Doctor'}
              </button>
            ))}
          </div>

          {formErr && (
            <div style={{ background:RED_P, border:'1px solid #FCA5A5', borderRadius:10, padding:'10px 14px', fontSize:13, color:RED, marginBottom:16 }}>
              ⚠ {formErr}
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate>

            {/* Name row */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:12 }}>
              <div>
                <label style={lbl}>First Name *</label>
                <input required value={form.firstName} onChange={f('firstName')} style={inp(fieldErrs.firstName)} placeholder="Priya" />
                <FieldError msg={fieldErrs.firstName} />
              </div>
              <div>
                <label style={lbl}>Last Name *</label>
                <input required value={form.lastName} onChange={f('lastName')} style={inp(fieldErrs.lastName)} placeholder="Sharma" />
                <FieldError msg={fieldErrs.lastName} />
              </div>
            </div>

            {/* Email */}
            <div style={{ marginBottom:12 }}>
              <label style={lbl}>Email Address *</label>
              <input type="email" required value={form.email} onChange={f('email')} style={inp(fieldErrs.email)} placeholder={role==='DOCTOR'?'your.personal@gmail.com':'you@example.com'} autoComplete="email" />
              {role==='DOCTOR'&&<div style={{fontSize:11,color:'#0e7490',marginTop:3,marginBottom:2}}>💡 After registration you will receive a <strong>@mediconnect.ai</strong> app login (e.g. <em>dsharma@mediconnect.ai</em>). Use that to sign in.</div>}
              <FieldError msg={fieldErrs.email} />
            </div>

            {/* Phone with country code */}
            <div style={{ marginBottom:12 }}>
              <label style={lbl}>Phone Number * <span style={{ color:MUTED, fontWeight:400 }}>(for SMS alerts)</span></label>
              <div style={{ display:'flex', gap:8 }}>
                <select value={form.countryCode} onChange={f('countryCode')}
                  style={{ padding:'9px 8px', border:`1.5px solid ${BORDER}`, borderRadius:9, fontSize:13, outline:'none', fontFamily:'DM Sans, sans-serif', background:'white', width:100, flexShrink:0 }}>
                  <option value="+91">🇮🇳 +91</option>
                  <option value="+1">🇺🇸 +1</option>
                  <option value="+44">🇬🇧 +44</option>
                  <option value="+971">🇦🇪 +971</option>
                  <option value="+65">🇸🇬 +65</option>
                  <option value="+61">🇦🇺 +61</option>
                  <option value="+49">🇩🇪 +49</option>
                  <option value="+33">🇫🇷 +33</option>
                </select>
                <div style={{ flex:1 }}>
                  <input type="tel" required value={form.phone} onChange={f('phone')}
                    style={{ ...inp(fieldErrs.phone), width:'100%' }} placeholder="98765 43210" autoComplete="tel" />
                </div>
              </div>
              <FieldError msg={fieldErrs.phone} />
              <div style={{ fontSize:11, color:MUTED, marginTop:3 }}>We'll send appointment reminders and report results via SMS.</div>
            </div>

            {/* Password row */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom: str?6:12 }}>
              <div>
                <label style={lbl}>Password *</label>
                <input type="password" required minLength={6} value={form.password} onChange={f('password')} style={inp(fieldErrs.password)} placeholder="Min 6 characters" autoComplete="new-password" />
                <FieldError msg={fieldErrs.password} />
              </div>
              <div>
                <label style={lbl}>Confirm Password *</label>
                <input type="password" required value={form.confirmPassword} onChange={f('confirmPassword')} style={inp(fieldErrs.confirmPassword)} placeholder="Repeat password" autoComplete="new-password" />
                <FieldError msg={fieldErrs.confirmPassword} />
              </div>
            </div>

            {/* Password strength bar */}
            {str && (
              <div style={{ marginBottom:12 }}>
                <div style={{ height:4, background:'#E2E8F0', borderRadius:2, overflow:'hidden' }}>
                  <div style={{ height:'100%', width:str.w, background:str.c, transition:'width 0.3s, background 0.3s', borderRadius:2 }} />
                </div>
                <div style={{ fontSize:11, color:str.c, marginTop:3, fontWeight:600 }}>Password strength: {str.label}</div>
              </div>
            )}

            {/* Patient-only fields */}
            {role==='PATIENT' && (<>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:12 }}>
                <div>
                  <label style={lbl}>Date of Birth</label>
                  <input type="date" value={form.dateOfBirth} onChange={f('dateOfBirth')} style={inp()} max={new Date().toISOString().split('T')[0]} />
                </div>
                <div>
                  <label style={lbl}>Gender</label>
                  <select value={form.gender} onChange={f('gender')} style={{ ...inp(), width:'100%' }}>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                    <option value="Prefer not to say">Prefer not to say</option>
                  </select>
                </div>
              </div>
              <div style={{ marginBottom:12 }}>
                <label style={lbl}>Blood Type</label>
                <select value={form.bloodType} onChange={f('bloodType')} style={{ ...inp(), width:180 }}>
                  <option value="">Unknown</option>
                  {['A+','A-','B+','B-','AB+','AB-','O+','O-'].map(b=><option key={b}>{b}</option>)}
                </select>
              </div>

              {/* ABHA Number */}
              <div style={{ marginBottom:16 }}>
                <label style={lbl}>ABHA Number <span style={{ fontSize:10, color:'#6b7280', fontWeight:400 }}>(Optional)</span></label>
                <input type="text" value={form.abhaNumber} onChange={f('abhaNumber')}
                  placeholder="12-3456-7890-1234"
                  maxLength={19}
                  style={{ ...inp(), fontFamily:'monospace', letterSpacing:'0.05em' }}
                />
                <div style={{ fontSize:11, color:'#6b7280', marginTop:4 }}>
                  Your 14-digit Ayushman Bharat Health Account ID. Helps doctors access your national health records.
                </div>
              </div>
            </>)}

            {/* Doctor-only fields */}
            {role==='DOCTOR' && (<>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:12 }}>
                <div>
                  <label style={lbl}>Specialty *</label>
                  <select value={form.specialty} onChange={f('specialty')} style={{ ...inp(fieldErrs.specialty), width:'100%' }}>
                    <option value="">Select specialty…</option>
                    {SPECIALTIES.map(s=><option key={s}>{s}</option>)}
                  </select>
                  <FieldError msg={fieldErrs.specialty} />
                </div>
                <div>
                  <label style={lbl}>Qualification *</label>
                  <input required value={form.qualification} onChange={f('qualification')} style={inp(fieldErrs.qualification)} placeholder="MBBS, MD" />
                  <FieldError msg={fieldErrs.qualification} />
                </div>
              </div>
              <div style={{ marginBottom:12 }}>
                <label style={lbl}>Hospital / Clinic *</label>
                <input required value={form.hospital} onChange={f('hospital')} style={inp(fieldErrs.hospital)} placeholder="Apollo Hospitals, Bangalore" />
                <FieldError msg={fieldErrs.hospital} />
              </div>
              <div style={{ marginBottom:16 }}>
                <label style={lbl}>Consultation Fee (₹)</label>
                <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <span style={{ fontSize:18, color:MUTED }}>₹</span>
                  <input type="number" min="0" step="50" value={form.consultFee} onChange={f('consultFee')} style={{ ...inp(), width:180 }} placeholder="500" />
                </div>
                <div style={{ fontSize:11, color:MUTED, marginTop:3 }}>Leave blank to set later from your profile.</div>
              </div>

            {/* ── Doctor Verification Fields ───────────────────────────── */}
              <div style={{ marginBottom:16 }}>
                <label style={{ display:'block', fontSize:12, fontWeight:700, color:'#7c3aed', marginBottom:5, textTransform:'uppercase', letterSpacing:'0.05em' }}>
                  🏥 Medical Registration Number *
                </label>
                <input
                  type="text"
                  value={form.medicalRegNumber}
                  onChange={e=>setForm(p=>({...p,medicalRegNumber:e.target.value}))}
                  placeholder="e.g. MH/12345 or DL/67890"
                  style={{ ...inp(), borderColor: fieldErrs.medicalRegNumber ? '#dc2626' : '#c4b5fd' }}
                />
                {fieldErrs.medicalRegNumber
                  ? <div style={{ color:'#dc2626', fontSize:11, marginTop:3 }}>{fieldErrs.medicalRegNumber}</div>
                  : <div style={{ fontSize:11, color:MUTED, marginTop:3 }}>Issued by your State Medical Council (SMC). Required for verification.</div>
                }
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:16 }}>
                <div>
                  <label style={{ display:'block', fontSize:12, fontWeight:600, color:MUTED, marginBottom:5, textTransform:'uppercase', letterSpacing:'0.05em' }}>State Medical Council</label>
                  <select value={form.stateMedicalCouncil} onChange={e=>setForm(p=>({...p,stateMedicalCouncil:e.target.value}))}
                    style={{ ...inp(), padding:'9px 10px' }}>
                    <option value="">Select SMC…</option>
                    {['Andhra Pradesh','Arunachal Pradesh','Assam','Bihar','Chandigarh','Chhattisgarh','Delhi','Goa','Gujarat','Haryana','Himachal Pradesh','Jammu & Kashmir','Jharkhand','Karnataka','Kerala','Madhya Pradesh','Maharashtra','Manipur','Meghalaya','Mizoram','Nagaland','Odisha','Punjab','Rajasthan','Sikkim','Tamil Nadu','Telangana','Tripura','Uttar Pradesh','Uttarakhand','West Bengal','NMC (National)'].map(s=>(
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ display:'block', fontSize:12, fontWeight:600, color:MUTED, marginBottom:5, textTransform:'uppercase', letterSpacing:'0.05em' }}>Year of Registration</label>
                  <input type="number" min="1950" max={new Date().getFullYear()} value={form.registrationYear}
                    onChange={e=>setForm(p=>({...p,registrationYear:e.target.value}))}
                    placeholder={String(new Date().getFullYear()-2)}
                    style={{ ...inp() }} />
                </div>
              </div>
              <div style={{ background:'#f5f3ff', border:'1px solid #c4b5fd', borderRadius:10, padding:'12px 14px', marginBottom:16, fontSize:12, color:'#6d28d9', lineHeight:1.6 }}>
                🔒 <strong>Verification Notice:</strong> Your medical credentials (MRN, qualification, SMC) will be reviewed by our team within <strong>24-48 hours</strong>. You will receive an email once your account is approved. Providing false credentials may result in permanent account removal and legal action.
              </div>
            </>)}

            {/* ── Pending Verification Screen ───────────────────────────── */}
            {pending && (
              <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.7)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:999, padding:20 }}>
                <div style={{ background:'white', borderRadius:20, padding:'40px 32px', maxWidth:480, textAlign:'center', boxShadow:'0 24px 64px rgba(0,0,0,0.4)' }}>
                  <div style={{ fontSize:52, marginBottom:16 }}>⏳</div>
                  <div style={{ fontSize:22, fontWeight:700, color:'#1e1b4b', marginBottom:8 }}>Account Under Review</div>
                  <div style={{ fontSize:14, color:'#6b7280', lineHeight:1.7, marginBottom:20 }}>
                    Thank you for registering, <strong>Dr. {form.firstName} {form.lastName}</strong>.<br/>
                    Your medical credentials are being verified by our team.
                  </div>
                  {pending.mrn && <div style={{ background:'#f5f3ff', borderRadius:10, padding:'10px 16px', marginBottom:16, fontSize:13, color:'#6d28d9' }}>
                    MRN submitted: <strong style={{ fontFamily:'monospace' }}>{pending.mrn}</strong>
                  </div>}
                  {pending.appEmail && <div style={{ background:'#eff6ff', borderRadius:10, padding:'10px 16px', marginBottom:20, fontSize:13, color:'#1565c0' }}>
                    Your login email: <strong style={{ fontFamily:'monospace' }}>{pending.appEmail}</strong><br/>
                    <span style={{ fontSize:11, color:'#6b7280' }}>Save this — use it to log in once approved.</span>
                  </div>}
                  <div style={{ fontSize:13, color:'#374151', marginBottom:24, background:'#f9fafb', borderRadius:10, padding:'12px 16px', textAlign:'left' }}>
                    <div style={{ fontWeight:600, marginBottom:6 }}>What happens next?</div>
                    <div>1. Our admin team reviews your MRN and qualifications</div>
                    <div>2. We may contact you on {form.phone} or {form.email} for additional documents</div>
                    <div>3. You will receive an approval email within 24-48 hours</div>
                    <div>4. Once approved, you can log in and start seeing patients</div>
                  </div>
                  <button onClick={()=>router.push('/doctor/login')}
                    style={{ width:'100%', padding:'12px', background:'#7c3aed', color:'white', border:'none', borderRadius:11, fontSize:14, fontWeight:700, cursor:'pointer' }}>
                    Go to Doctor Login →
                  </button>
                </div>
              </div>
            )}

            <button type="submit" disabled={loading}
              style={{ width:'100%', padding:12, background:loading?'#93C5FD':BLUE, color:'white', border:'none', borderRadius:10, fontSize:14, fontWeight:600, cursor:loading?'not-allowed':'pointer', fontFamily:'DM Sans, sans-serif' }}>
              {loading?'Creating account…':'Create Account'}
            </button>
          </form>

          {/* Disclaimer */}
          <div style={{ marginTop:12, fontSize:11, color:MUTED, textAlign:'center', lineHeight:1.5 }}>
            By creating an account, you agree to receive SMS notifications on the provided phone number.
          </div>

          <div style={{ marginTop:14, textAlign:'center', fontSize:13, color:MUTED }}>
            Already have an account? <a href="/login" style={{ color:BLUE, fontWeight:600, textDecoration:'none' }}>Sign in</a>
          </div>
        </div>
      </div>
    </div>
  );
}