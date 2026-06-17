import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';

export default function ForgotPassword() {
  const [email, setEmail]     = useState('');
  const [message, setMessage] = useState('');
  const [error, setError]     = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);
    try {
      const { message: msg } = await api.forgotPassword(email);
      setMessage(msg);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 360, margin: '80px auto', padding: '0 20px' }}>
      <h1 style={{ marginBottom: 6 }}>ES QR Tracker</h1>
      <p style={{ color: '#555', marginBottom: 28, fontSize: 13 }}>Nuevosol Energy</p>
      <h2 style={{ marginBottom: 20, fontSize: 18 }}>Reset Password</h2>

      {message ? (
        <div style={{ padding: '12px 14px', border: '1px solid #bbb', background: '#f5f5f5', fontSize: 13, marginBottom: 16 }}>
          {message}
        </div>
      ) : (
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoFocus
            />
          </div>
          {error && <p style={{ color: '#b00', fontSize: 13, marginBottom: 12 }}>{error}</p>}
          <button type="submit" disabled={loading} style={{ width: '100%', padding: '8px 14px' }}>
            {loading ? 'Sending…' : 'Send Reset Link'}
          </button>
        </form>
      )}

      <div style={{ marginTop: 16, textAlign: 'center' }}>
        <Link to="/login" style={{ fontSize: 13, color: '#555' }}>Back to Sign In</Link>
      </div>
    </div>
  );
}
