import React, { useEffect, useState } from 'react';

// Global banner shown when any API call returns 401 (expired/invalid token).
// Replaces silent empty tables with a clear "log in again" prompt.
export default function SessionBanner() {
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    const onExpired = () => setExpired(true);
    window.addEventListener('session-expired', onExpired);
    return () => window.removeEventListener('session-expired', onExpired);
  }, []);

  if (!expired) return null;

  function login() {
    localStorage.clear();
    window.location.href = '/login';
  }

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 2000,
      background: 'var(--graphite-900)', color: 'var(--alloy-100)',
      borderBottom: '2px solid var(--signal-stop)',
      padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14,
      fontSize: 14,
    }}>
      <span>Your session has expired. Please log in again.</span>
      <button onClick={login} style={{ fontWeight: 500 }}>
        Log In
      </button>
    </div>
  );
}
