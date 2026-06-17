const token = () => localStorage.getItem('token');

async function req(method, path, body) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token() ? { Authorization: `Bearer ${token()}` } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

export const api = {
  login:          (email, password)          => req('POST', '/auth/login',           { email, password }),
  register:       (name, email, password)    => req('POST', '/auth/register',        { name, email, password }),
  forgotPassword: (email)                    => req('POST', '/auth/forgot-password', { email }),
  resetPassword:  (token, password)          => req('POST', '/auth/reset-password',  { token, password }),
  me:          ()                => req('GET',  '/auth/me'),
  getOptions:  ()                => req('GET',  '/options'),

  getTasks:       ()             => req('GET',   '/tasks'),
  startTask:      (product, qr_no, status_field) => req('POST', '/tasks', { product, qr_no, status_field }),
  pauseTask:      (id)           => req('PATCH', `/tasks/${id}/pause`),
  resumeTask:     (id)           => req('PATCH', `/tasks/${id}/resume`),
  stopTask:       (id)           => req('PATCH', `/tasks/${id}/stop`),
  completeTask:   (id)           => req('PATCH', `/tasks/${id}/complete`),
  setSize:        (id, size_category, reason) => req('PATCH', `/tasks/${id}/size`, { size_category, ...(reason ? { reason } : {}) }),
  setStuckReason: (id, reason)   => req('PATCH', `/tasks/${id}/stuck-reason`, { reason }),

  admin: {
    getUsers:      ()        => req('GET',    '/admin/users'),
    getSummary:    ()        => req('GET',    '/admin/summary'),
    editTask:      (id, data) => req('PATCH',  `/admin/tasks/${id}`, data),
    getProducts:   ()        => req('GET',    '/admin/products'),
    addProduct:    (name)    => req('POST',   '/admin/products', { name }),
    deleteProduct: (id)      => req('DELETE', `/admin/products/${id}`),
    getTasks:      (filters) => req('GET', `/admin/tasks?${new URLSearchParams(
      Object.fromEntries(Object.entries(filters).filter(([, v]) => v))
    )}`),
  },
};
