import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api } from '../api';

export default function Login() {
  const [mode, setMode]         = useState('login');
  const [name, setName]         = useState('');
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);
  const nav = useNavigate();

  function switchMode(m) {
    setMode(m);
    setError('');
    setName('');
    setEmail('');
    setPassword('');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      let token, user;
      if (mode === 'login') {
        ({ token, user } = await api.login(email, password));
      } else {
        ({ token, user } = await api.register(name, email, password));
      }
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));
      nav(user.role === 'admin' ? '/admin' : user.role === 'reviewer' ? '/reviewer' : '/user', { replace: true });
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

      <div style={{ display: 'flex', marginBottom: 24, borderBottom: '1px solid #ddd' }}>
        {['login', 'register'].map(m => (
          <button
            key={m}
            type="button"
            onClick={() => switchMode(m)}
            style={{
              flex: 1,
              padding: '8px 0',
              background: 'none',
              border: 'none',
              borderBottom: mode === m ? '2px solid #111' : '2px solid transparent',
              fontWeight: mode === m ? 600 : 400,
              cursor: 'pointer',
              fontSize: 14,
              textTransform: 'capitalize',
            }}
          >
            {m === 'login' ? 'Sign In' : 'Register'}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit}>
        {mode === 'register' && (
          <div className="form-group">
            <label>Name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              required
              autoFocus
            />
          </div>
        )}

        <div className="form-group">
          <label>Email</label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            autoFocus={mode === 'login'}
          />
        </div>

        <div className="form-group">
          <label>Password</label>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
          />
        </div>

        {error && (
          <p style={{ color: '#b00', fontSize: 13, marginBottom: 12 }}>{error}</p>
        )}

        <button type="submit" disabled={loading} style={{ width: '100%', padding: '8px 14px' }}>
          {loading
            ? (mode === 'login' ? 'Signing in…' : 'Registering…')
            : (mode === 'login' ? 'Sign In' : 'Register')}
        </button>

        {mode === 'login' && (
          <div style={{ marginTop: 14, textAlign: 'center' }}>
            <Link to="/forgot-password" style={{ fontSize: 13, color: '#555' }}>
              Forgot password?
            </Link>
          </div>
        )}
      </form>
    </div>
  );
}
