const API_URL = process.env.NEXT_PUBLIC_API_URL || 'process.env.NEXT_PUBLIC_API_URL ? process.env.NEXT_PUBLIC_API_URL : (process.env.NEXT_PUBLIC_API_URL || (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api'))';

async function request(endpoint, options = {}) {
  const token = typeof window !== 'undefined' ? localStorage.getItem('mc_token') : null;

  const config = {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
    ...options,
  };

  const res = await fetch(`${API_URL}${endpoint}`, config);
  const data = await res.json();

  if (res.status === 401 && typeof window !== 'undefined') {
    localStorage.removeItem('mc_token');
    localStorage.removeItem('mc_user');
    window.location.href = '/login';
    return;
  }

  if (!res.ok) {
    throw { response: { data, status: res.status } };
  }

  return { data };
}

export const authAPI = {
  login:    (body)         => request('/auth/login',    { method: 'POST', body: JSON.stringify(body) }),
  register: (body)         => request('/auth/register', { method: 'POST', body: JSON.stringify(body) }),
  me:       ()             => request('/auth/me'),
};

export const appointmentAPI = {
  list:       (params)     => request('/appointments?' + new URLSearchParams(params)),
  get:        (id)         => request(`/appointments/${id}`),
  create:     (body)       => request('/appointments',                  { method: 'POST',  body: JSON.stringify(body) }),
  reschedule: (id, body)   => request(`/appointments/${id}/reschedule`, { method: 'PATCH', body: JSON.stringify(body) }),
  cancel:     (id, body)   => request(`/appointments/${id}/cancel`,     { method: 'PATCH', body: JSON.stringify(body) }),
  getDoctors: ()           => request('/doctors'),
  getSlots:   (doctorId, date) => request(`/doctors/${doctorId}/slots?date=${date}`),
};

export const paymentAPI = {
  createOrder: (body)      => request('/payments/create-order', { method: 'POST', body: JSON.stringify(body) }),
  verify:      (body)      => request('/payments/verify',       { method: 'POST', body: JSON.stringify(body) }),
  refund:      (body)      => request('/payments/refund',       { method: 'POST', body: JSON.stringify(body) }),
  history:     ()          => request('/payments/history'),
};

export const chatAPI = {
  rooms:    ()                  => request('/chat/rooms'),
  messages: (roomId, params)    => request(`/chat/${roomId}/messages?` + new URLSearchParams(params)),
  send:     (roomId, body)      => request(`/chat/${roomId}/messages`, { method: 'POST', body: JSON.stringify(body) }),
  search:   (roomId, q)         => request(`/chat/${roomId}/search?q=${encodeURIComponent(q)}`),
};

export const fileAPI = {
  upload: (formData, onProgress) => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('mc_token') : null;
    return fetch(`${API_URL}/files/upload`, {
      method:  'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body:    formData,
    }).then(r => r.json().then(data => ({ data })));
  },
  getPatientFiles: (patientId, params) => request(`/files/patient/${patientId}?` + new URLSearchParams(params)),
  delete:          (id)                => request(`/files/${id}`, { method: 'DELETE' }),
};

export const aiAPI = {
  summary: (patientId) => request(`/ai/summary/${patientId}`),
  ask:     (body)      => request('/ai/ask', { method: 'POST', body: JSON.stringify(body) }),
};

export const patientAPI = {
  list:     (params) => request('/patients?' + new URLSearchParams(params)),
  get:      (id)     => request(`/patients/${id}`),
  history:  (id)     => request(`/patients/${id}/history`),
  vitals:   (id)     => request(`/patients/${id}/vitals`),
  timeline: (id)     => request(`/patients/${id}/timeline`),
  files:    (id, p)  => request(`/files/patient/${id}?` + new URLSearchParams(p)),
};

