'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

const API = process.env.NEXT_PUBLIC_API_URL || 'process.env.NEXT_PUBLIC_API_URL ? process.env.NEXT_PUBLIC_API_URL : (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

export default function PatientDashboard() {
  const router = useRouter();
  const [mounted, setMounted]   = useState(false);
  const [user, setUser]         = useState(null);
  const [upcoming, setUpcoming] = useState([]);
  const [stats, setStats]       = useState({ upcoming: 0, completed: 0, total: 0 });
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    setMounted(true);
    const token = localStorage.getItem('mc_token');
    const u     = localStorage.getItem('mc_user');
    if (!token) { router.push('/login'); return; }
    if (u) { try { setUser(JSON.parse(u)); } catch (_) {} }

    const headers = { Authorization: `Bearer ${token}` };

    Promise.all([
      fetch(`${API}/appointments/upcoming`, { headers }).then(r => r.json()),
      fetch(`${API}/appointments?limit=200`, { headers }).then(r => r.json()),
    ]).then(([upRes, allRes]) => {
      const upList  = upRes.data  || upRes.appointments  || [];
      const allList = allRes.data || allRes.appointments || [];
      setUpcoming(upList);
      setStats({
        upcoming:  allList.filter(a => ['SCHEDULED','CONFIRMED','RESCHEDULED'].includes(a.status)).length,
        completed: allList.filter(a => a.status === 'COMPLETED').length,
        total:     allList.length,
      });
    }).catch(err => console.error('Dashboard fetch error:', err))
      .finally(() => setLoading(false));
  }, []);

  const greeting = () => {
    const h = new Date().getHours();
    return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  };

  const patientName = user?.patient?.firstName || user?.firstName || user?.name || 'there';

  if (!mounted) return null;

  return (
    <AppLayout role="patient">
      <div style={{ flex: 1, overflowY: 'auto', padding: 24, background: C.surface }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 700, color: C.navy }}>{greeting()}, {patientName} 👋</div>
            <div style={{ fontSize: 13, color: C.textMuted, marginTop: 3 }}>
              {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </div>
          </div>
          <button onClick={() => router.push('/patient/appointments/book')} style={{ ...btn.primary }}>
            + Book Appointment
          </button>
        </div>

        {/* Stats row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14, marginBottom: 28 }}>
          {[
            { label: 'Upcoming',     value: loading ? '…' : stats.upcoming,  icon: '📅', color: C.blue    },
            { label: 'Completed',    value: loading ? '…' : stats.completed, icon: '✅', color: '#16a34a' },
            { label: 'Total Visits', value: loading ? '…' : stats.total,     icon: '🏥', color: C.navy    },
          ].map(s => (
            <div key={s.label} style={{ ...card, display: 'flex', alignItems: 'center', gap: 16, padding: '16px 20px' }}>
              <div style={{ fontSize: 28 }}>{s.icon}</div>
              <div>
                <div style={{ fontSize: 28, fontWeight: 700, color: s.color, lineHeight: 1 }}>{s.value}</div>
                <div style={{ fontSize: 12, color: C.textMuted, marginTop: 3 }}>{s.label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Report Analyzer highlight banner */}
        <div style={{ background: 'linear-gradient(135deg, #0e7490 0%, #1565c0 100%)', borderRadius: 14, padding: '18px 22px', marginBottom: 24, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
              <span style={{ fontSize: 22 }}>🔬</span>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'white' }}>Free Report Analyzer</div>
              <span style={{ background: 'rgba(255,255,255,0.2)', color: '#a5f3fc', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20 }}>FREE</span>
            </div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.85)', lineHeight: 1.6, maxWidth: 520 }}>
              Upload any lab report — CBC, Lipid Panel, Thyroid, Blood Sugar — and get instant plain-English results. Understand every value, see what's abnormal, and know which doctor to see.
            </div>
          </div>
          <button onClick={() => router.push('/patient/reports')}
            style={{ padding: '10px 22px', background: 'white', color: '#0e7490', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}>
            Analyze a Report →
          </button>
        </div>

        {/* Upcoming appointments */}
        <div style={{ ...card, marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: C.navy }}>Upcoming Appointments</div>
            <button onClick={() => router.push('/patient/appointments')}
              style={{ fontSize: 12, color: C.blue, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
              View all
            </button>
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: 32, color: C.textMuted }}>Loading…</div>
          ) : upcoming.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 32 }}>
              <div style={{ fontSize: 32, marginBottom: 10 }}>📅</div>
              <div style={{ color: C.textMuted, fontSize: 13, marginBottom: 16 }}>No upcoming appointments</div>
              <button onClick={() => router.push('/patient/appointments/book')} style={{ ...btn.primary }}>
                Book Now
              </button>
            </div>
          ) : (
            upcoming.map(a => {
              const d = new Date(a.scheduledAt);
              return (
                <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 0', borderBottom: `1px solid ${C.border}` }}>
                  <div style={{ width: 48, textAlign: 'center', background: C.bluePale, borderRadius: 10, padding: '6px 4px', flexShrink: 0 }}>
                    <div style={{ fontSize: 20, fontWeight: 700, color: C.blue, lineHeight: 1 }}>{d.getDate()}</div>
                    <div style={{ fontSize: 9, fontFamily: 'IBM Plex Mono, monospace', color: C.blue }}>
                      {d.toLocaleString('default', { month: 'short' }).toUpperCase()}
                    </div>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>
                      {a.doctor ? `Dr. ${a.doctor.firstName} ${a.doctor.lastName}` : 'Doctor'}
                    </div>
                    <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>
                      {a.doctor?.specialty && `${a.doctor.specialty} · `}
                      {d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      {a.type && ` · ${a.type.replace('_', ' ')}`}
                    </div>
                    {a.reason && <div style={{ fontSize: 11, color: C.textMuted, marginTop: 1 }}>{a.reason}</div>}
                  </div>
                  <span style={statusPill(a.status)}>{a.status}</span>
                </div>
              );
            })
          )}
        </div>

        {/* Quick actions */}
        <div style={{ ...card }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: C.navy, marginBottom: 14 }}>Quick Actions</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10 }}>
            {[
              { label: 'Book Appointment',  icon: '📅', href: '/patient/appointments/book', color: C.blue    },
              { label: 'Message Doctor',    icon: '💬', href: '/patient/chat',               color: '#0e7490' },
              { label: 'Upload Reports',    icon: '📁', href: '/patient/files',              color: '#6d28d9' },
              { label: 'Analyze a Report',  icon: '🔬', href: '/patient/reports',            color: '#1565c0', highlight: true },
            ].map(q => (
              <button key={q.href} onClick={() => router.push(q.href)}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                  padding: '14px 10px',
                  border: q.highlight ? `2px solid ${q.color}30` : `1px solid ${C.border}`,
                  borderRadius: 12,
                  background: q.highlight ? `${q.color}08` : 'white',
                  cursor: 'pointer', fontSize: 12.5, fontWeight: 500, color: C.navy,
                  transition: 'all 0.15s', position: 'relative',
                }}>
                {q.highlight && (
                  <span style={{ position: 'absolute', top: -8, right: -8, background: '#0e7490', color: '#a5f3fc', fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 20 }}>
                    FREE
                  </span>
                )}
                <span style={{ fontSize: 22 }}>{q.icon}</span>
                {q.label}
              </button>
            ))}
          </div>
        </div>

      </div>
    </AppLayout>
  );
}


