import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import Ring from '../components/Ring';
import Wordmark from '../components/Wordmark';

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
    <div className="login-split">
      <div className="login-dark">
        <Ring rays size={96} color="var(--sol-500)" style={{ position: 'relative' }} />
        <div style={{ textAlign: 'center', position: 'relative' }}>
          <Wordmark size={26} />
          <div style={{ marginTop: 10, color: 'var(--alloy-100)', fontSize: 15, fontWeight: 500 }}>
            ES QR Tracker
          </div>
          <div className="eyebrow" style={{ marginTop: 4, color: 'var(--alloy-400)' }}>
            Nuevosol Energy
          </div>
        </div>
      </div>

      <div className="login-light">
        <div style={{ width: '100%', maxWidth: 360 }}>
          <h2 style={{ marginBottom: 20 }}>Reset password</h2>

          {message ? (
            <div className="recess" style={{ padding: '12px 14px', fontSize: 13, marginBottom: 16, color: 'var(--ink-400)' }}>
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
              {error && <p style={{ color: 'var(--signal-stop)', fontSize: 13, marginBottom: 12 }}>{error}</p>}
              <button type="submit" disabled={loading} className="btn-primary"
                style={{ width: '100%', padding: '9px 14px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                {loading && <Ring spinning size={14} color="#fff" />}
                {loading ? 'Sending' : 'Send Reset Link'}
              </button>
            </form>
          )}

          <div style={{ marginTop: 16, textAlign: 'center' }}>
            <Link to="/login" style={{ fontSize: 13, color: 'var(--ink-400)' }}>Back to Sign In</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
