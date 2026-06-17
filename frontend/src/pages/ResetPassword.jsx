import React, { useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { api } from '../api';

export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';

  const [password, setPassword]   = useState('');
  const [confirm, setConfirm]     = useState('');
  const [message, setMessage]     = useState('');
  const [error, setError]         = useState('');
  const [loading, setLoading]     = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (password !== confirm) { setError('Passwords do not match'); return; }
    setLoading(true);
    try {
      const { message: msg } = await api.resetPassword(token, password);
      setMessage(msg);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <div style={{ maxWidth: 360, margin: '80px auto', padding: '0 20px' }}>
        <p style={{ color: '#b00' }}>Invalid reset link.</p>
        <Link to="/login" style={{ fontSize: 13 }}>Back to Sign In</Link>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 360, margin: '80px auto', padding: '0 20px' }}>
      <h1 style={{ marginBottom: 6 }}>ES QR Tracker</h1>
      <p style={{ color: '#555', marginBottom: 28, fontSize: 13 }}>Nuevosol Energy</p>
      <h2 style={{ marginBottom: 20, fontSize: 18 }}>Set New Password</h2>

      {message ? (
        <div style={{ padding: '12px 14px', border: '1px solid #bbb', background: '#f5f5f5', fontSize: 13, marginBottom: 16 }}>
          {message}
          <div style={{ marginTop: 10 }}>
            <Link to="/login" style={{ fontSize: 13 }}>Sign In</Link>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>New Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              minLength={6}
              autoFocus
            />
          </div>
          <div className="form-group">
            <label>Confirm Password</label>
            <input
              type="password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              required
            />
          </div>
          {error && <p style={{ color: '#b00', fontSize: 13, marginBottom: 12 }}>{error}</p>}
          <button type="submit" disabled={loading} style={{ width: '100%', padding: '8px 14px' }}>
            {loading ? 'Updating…' : 'Update Password'}
          </button>
        </form>
      )}
    </div>
  );
}
