'use client';
import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';

const API = process.env.NEXT_PUBLIC_API_URL || 'process.env.NEXT_PUBLIC_API_URL ? process.env.NEXT_PUBLIC_API_URL : (process.env.NEXT_PUBLIC_API_URL || (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api'))';

export default function CriticalAlertBanner() {
  const router   = useRouter();
  const [alerts, setAlerts]  = useState([]);
  const [dismissed, setDism] = useState(new Set());
  const pollRef = useRef(null);

  const token = () => localStorage.getItem('mc_token') || '';

  const fetchAlerts = async () => {
    try {
      const r = await fetch(`${API}/appointments/critical-alerts`, {
        headers: { Authorization: `Bearer ${token()}` }
      });
      const d = await r.json();
      setAlerts(d.data || []);
    } catch (_) {}
  };

  useEffect(() => {
    fetchAlerts();
    // Poll every 30 seconds
    pollRef.current = setInterval(fetchAlerts, 30000);
    return () => clearInterval(pollRef.current);
  }, []);

  // Dismiss one alert (mark as read via API)
  const dismiss = async (messageId) => {
    setDism(prev => new Set([...prev, messageId]));
    await fetch(`${API}/chat/messages/${messageId}/read`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token()}` }
    }).catch(() => {});
  };

  const visible = alerts.filter(a => !dismissed.has(a.messageId));
  if (visible.length === 0) return null;

  return (
    <div style={{
      position: 'sticky', top: 0, zIndex: 999,
      background: '#dc2626', color: 'white',
      padding: '10px 20px', boxShadow: '0 4px 12px rgba(220,38,38,0.4)'
    }}>
      {/* Pulsing indicator */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: visible.length > 1 ? 8 : 0 }}>
        <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%',
          background: 'white', animation: 'pulse 1s infinite' }} />
        <strong style={{ fontSize: 13 }}>
          🚨 {visible.length} CRITICAL ALERT{visible.length > 1 ? 'S' : ''} — REQUIRES IMMEDIATE ATTENTION
        </strong>
      </div>

      {visible.map(alert => (
        <div key={alert.messageId} style={{
          display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'space-between',
          background: 'rgba(0,0,0,0.2)', borderRadius: 8, padding: '8px 12px',
          marginBottom: 6
        }}>
          <div style={{ flex: 1 }}>
            <span style={{ fontWeight: 700, fontSize: 13 }}>
              {alert.patient?.firstName} {alert.patient?.lastName}:
            </span>
            <span style={{ fontSize: 12, marginLeft: 8 }}>
              {alert.redFlags?.[0]?.message || alert.content?.slice(0, 80) || 'Critical alert'}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <button
              onClick={() => router.push('/doctor/chat/' + alert.chatRoomId)}
              style={{ background: 'white', color: '#dc2626', border: 'none',
                padding: '4px 12px', borderRadius: 6, fontSize: 12,
                fontWeight: 700, cursor: 'pointer' }}>
              View Now
            </button>
            <button
              onClick={() => dismiss(alert.messageId)}
              style={{ background: 'transparent', color: 'white', border: '1px solid rgba(255,255,255,0.5)',
                padding: '4px 12px', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}>
              Acknowledge
            </button>
          </div>
        </div>
      ))}

      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }`}</style>
    </div>
  );
}


