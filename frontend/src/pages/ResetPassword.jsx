import React, { useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { api } from '../api';
import Ring from '../components/Ring';
import Wordmark from '../components/Wordmark';

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
      <div className="login-split">
        <div className="login-dark">
          <Ring rays size={96} color="var(--sol-500)" style={{ position: 'relative' }} />
          <div style={{ textAlign: 'center', position: 'relative' }}>
            <Wordmark size={26} />
          </div>
        </div>
        <div className="login-light">
          <div style={{ width: '100%', maxWidth: 360 }}>
            <p style={{ color: 'var(--signal-stop)', marginBottom: 10 }}>Invalid reset link.</p>
            <Link to="/login" style={{ fontSize: 13 }}>Back to Sign In</Link>
          </div>
        </div>
      </div>
    );
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
          <h2 style={{ marginBottom: 20 }}>Set new password</h2>

          {message ? (
            <div className="recess" style={{ padding: '12px 14px', fontSize: 13, marginBottom: 16, color: 'var(--ink-400)' }}>
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
              {error && <p style={{ color: 'var(--signal-stop)', fontSize: 13, marginBottom: 12 }}>{error}</p>}
              <button type="submit" disabled={loading} className="btn-primary"
                style={{ width: '100%', padding: '9px 14px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                {loading && <Ring spinning size={14} color="#fff" />}
                {loading ? 'Updating' : 'Update Password'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
