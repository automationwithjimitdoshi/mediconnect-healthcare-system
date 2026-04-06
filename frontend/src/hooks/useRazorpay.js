'use client';
import { useCallback } from 'react';

function loadRazorpayScript() {
  return new Promise((resolve) => {
    if (document.getElementById('razorpay-script')) return resolve(true);
    const script    = document.createElement('script');
    script.id       = 'razorpay-script';
    script.src      = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload   = () => resolve(true);
    script.onerror  = () => resolve(false);
    document.body.appendChild(script);
  });
}

export function useRazorpay() {
  const initiatePayment = useCallback(async ({
    appointmentId, patientName, patientPhone,
    doctorName, amount, onSuccess, onFailure,
  }) => {
    try {
      const loaded = await loadRazorpayScript();
      if (!loaded) throw new Error('Razorpay SDK failed to load');

      const token = localStorage.getItem('mc_token');
      const res   = await fetch(
        (process.env.NEXT_PUBLIC_API_URL || 'process.env.NEXT_PUBLIC_API_URL ? process.env.NEXT_PUBLIC_API_URL : (process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api")') + '/payments/create-order',
        {
          method:  'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body:    JSON.stringify({ appointmentId }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create order');

      const options = {
        key:         data.keyId,
        amount:      data.amount,
        currency:    data.currency,
        order_id:    data.orderId,
        name:        'MediConnect AI',
        description: `Consultation — ${doctorName}`,
        prefill:     { name: patientName, contact: patientPhone },
        theme:       { color: '#1565c0' },
        handler: async (response) => {
          try {
            const vres = await fetch(
              (process.env.NEXT_PUBLIC_API_URL || 'process.env.NEXT_PUBLIC_API_URL ? process.env.NEXT_PUBLIC_API_URL : (process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api")') + '/payments/verify',
              {
                method:  'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body:    JSON.stringify({ ...response, appointmentId }),
              }
            );
            const vdata = await vres.json();
            if (!vres.ok) throw new Error(vdata.error);
            onSuccess && onSuccess(vdata);
          } catch (err) {
            onFailure && onFailure(err);
          }
        },
        modal: { ondismiss: () => onFailure && onFailure(new Error('Payment dismissed')) },
      };

      const rzp = new window.Razorpay(options);
      rzp.open();
    } catch (err) {
      console.error('Razorpay error:', err);
      onFailure && onFailure(err);
    }
  }, []);

  return { initiatePayment };
}

