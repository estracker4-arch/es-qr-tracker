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
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    // Auth failed (expired/invalid token) — notify app to show the session banner,
    // but not for the login call itself (bad credentials there are normal).
    if (res.status === 401 && !path.startsWith('/auth/login')) {
      window.dispatchEvent(new Event('session-expired'));
    }
    throw new Error(data.error || 'Request failed');
  }
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
  unstopTask:     (id)           => req('PATCH', `/tasks/${id}/unstop`),
  completeTask:   (id)           => req('PATCH', `/tasks/${id}/complete`),
  setStuckReason: (id, reason)   => req('PATCH', `/tasks/${id}/stuck-reason`, { reason }),
  deleteTask:     (id)           => req('DELETE', `/tasks/${id}`),

  admin: {
    getUsers:      ()        => req('GET',    '/admin/users'),
    getAllUsers:   ()        => req('GET',    '/admin/all-users'),
    setUserRole:   (id, role) => req('PATCH', `/admin/users/${id}/role`, { role }),
    setCanTasks:   (id, can_do_tasks) => req('PATCH', `/admin/users/${id}/can-tasks`, { can_do_tasks }),
    setTaskLimit:  (id, task_limit) => req('PATCH', `/admin/users/${id}/task-limit`, { task_limit }),
    getSummary:    ()        => req('GET',    '/admin/summary'),
    editTask:      (id, data) => req('PATCH',  `/admin/tasks/${id}`, data),
    resetReview:   (id)       => req('PATCH',  `/admin/tasks/${id}/review-reset`),
    getProducts:   ()        => req('GET',    '/admin/products'),
    addProduct:    (name)    => req('POST',   '/admin/products', { name }),
    deleteProduct: (id)      => req('DELETE', `/admin/products/${id}`),
    getTasks:      (filters) => req('GET', `/admin/tasks?${new URLSearchParams(
      Object.fromEntries(Object.entries(filters).filter(([, v]) => v))
    )}`),
    getReviewerTasks: (filters) => req('GET', `/admin/reviewer-tasks?${new URLSearchParams(
      Object.fromEntries(Object.entries(filters).filter(([, v]) => v))
    )}`),
  },

  reviewer: {
    getUsers:    ()           => req('GET', '/reviewer/users'),
    getTasks:    (filters)    => req('GET', `/reviewer/tasks?${new URLSearchParams(
      Object.fromEntries(Object.entries(filters).filter(([, v]) => v))
    )}`),
    startReview: (id)         => req('PATCH', `/reviewer/tasks/${id}/review-start`),
    pauseReview: (id)         => req('PATCH', `/reviewer/tasks/${id}/review-pause`),
    resetReview: (id)         => req('PATCH', `/reviewer/tasks/${id}/review-reset`),
    review:      (id, data)   => req('PATCH', `/reviewer/tasks/${id}/review`, data),
  },
};
