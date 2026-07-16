import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api } from '../api';
import Ring from '../components/Ring';
import Wordmark from '../components/Wordmark';

/*
 * Cinematic login. Scroll is the reveal:
 *   act 1 (t 0.00-0.50)  two solar panels part like hangar doors; the sun
 *                        blooms through the gap; dust hangs in the shaft
 *   act 2 (t 0.30-0.70)  the Nuevosol mark lands in the light
 *   act 3 (t 0.70-1.00)  the mark lifts, the sign-in card rises
 * WebGL scene (three.js, lazy chunk) when available; CSS curtain otherwise;
 * prefers-reduced-motion goes straight to the card.
 */

const clamp01 = v => Math.min(1, Math.max(0, v));

function webglOK() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch { return false; }
}

function useSparks(count = 12) {
  return useMemo(() => Array.from({ length: count }, (_, i) => ({
    id: i,
    left: `${Math.random() * 92 + 4}%`,
    top: `${Math.random() * 80 + 12}%`,
    dur: `${10 + Math.random() * 14}s`,
    delay: `${Math.random() * 12}s`,
    dx: `${(Math.random() - 0.5) * 40}px`,
    peak: (Math.random() * 0.3 + 0.12).toFixed(2),
    color: Math.random() < 0.3 ? 'var(--sol-400)' : 'var(--alloy-400)',
  })), [count]);
}

export default function Login() {
  const [mode, setMode]         = useState('login');
  const [name, setName]         = useState('');
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);
  const nav = useNavigate();
  const sparks = useSparks();

  const reduced = useMemo(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    []
  );
  const gl = useMemo(() => !reduced && webglOK(), [reduced]);

  const canvasRef = useRef(null);
  const logoRef  = useRef(null);
  const formRef  = useRef(null);
  const hintRef  = useRef(null);
  const skipRef  = useRef(null);
  const leftRef  = useRef(null);   // CSS fallback curtain
  const rightRef = useRef(null);
  const barTRef  = useRef(null);   // letterbox
  const barBRef  = useRef(null);
  const vigRef   = useRef(null);
  const progRef  = useRef(null);   // scroll hairline
  const tRef     = useRef(0);
  const focusedRef = useRef(false);
  const emailRef = useRef(null);

  useEffect(() => {
    if (reduced) return;

    let disposed = false;
    let world = null;
    let target = 0, t = 0, raf = null;
    let mx = 0, my = 0;
    const maxScroll = () => Math.max(1, document.documentElement.scrollHeight - window.innerHeight);

    const overlays = v => {
      tRef.current = v;

      const lin  = clamp01((v - 0.30) / 0.20);
      const lift = clamp01((v - 0.70) / 0.28);
      if (logoRef.current) {
        logoRef.current.style.opacity = lin.toFixed(2);
        logoRef.current.style.filter = `blur(${((1 - lin) * 9).toFixed(1)}px)`;
        logoRef.current.style.transform = `translateY(${(-lift * 30).toFixed(2)}vh) scale(${(0.94 + lin * 0.06 - lift * 0.42).toFixed(3)})`;
      }
      if (progRef.current) progRef.current.style.width = `${(v * 100).toFixed(2)}%`;

      const fo = clamp01((v - 0.74) / 0.2);
      if (formRef.current) {
        formRef.current.style.opacity = fo.toFixed(2);
        formRef.current.style.transform = `translateY(${((1 - fo) * 48).toFixed(1)}px)`;
        formRef.current.style.pointerEvents = fo > 0.55 ? 'auto' : 'none';
      }
      if (fo > 0.9 && !focusedRef.current) {
        focusedRef.current = true;
        emailRef.current?.focus({ preventScroll: true });
      }

      const hide = 1 - clamp01(v / 0.1);
      if (hintRef.current) hintRef.current.style.opacity = hide.toFixed(2);
      if (skipRef.current) skipRef.current.style.opacity = (v > 0.8 ? 0 : 1).toFixed(2);

      // letterbox holds through the film, opens for the product
      const bars = 1 - clamp01((v - 0.62) / 0.18);
      if (barTRef.current) barTRef.current.style.transform = `scaleY(${bars.toFixed(3)})`;
      if (barBRef.current) barBRef.current.style.transform = `scaleY(${bars.toFixed(3)})`;
      if (vigRef.current) vigRef.current.style.opacity = (1 - fo * 0.45).toFixed(2);

      // CSS curtain fallback
      if (!gl && leftRef.current && rightRef.current) {
        const part = clamp01(v / 0.45);
        const ease = part * part * (3 - 2 * part);
        leftRef.current.style.transform  = `translateX(${(-ease * 114).toFixed(2)}%) rotateY(${(ease * 16).toFixed(2)}deg)`;
        rightRef.current.style.transform = `translateX(${(ease * 114).toFixed(2)}%) rotateY(${(-ease * 16).toFixed(2)}deg)`;
      }
    };

    const frame = () => {
      if (disposed) return;
      const d = target - t;
      t += d * 0.09;
      if (Math.abs(d) < 0.0004) t = target;
      overlays(t);
      if (world) world.update(t, mx, my);
      raf = requestAnimationFrame(frame); // scene breathes even at rest
    };

    const onScroll = () => { target = clamp01(window.scrollY / maxScroll()); };
    const onMove = e => {
      mx = (e.clientX / window.innerWidth) * 2 - 1;
      my = -((e.clientY / window.innerHeight) * 2 - 1);
    };
    const onKey = e => {
      if (e.key !== 'Enter') return;
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'BUTTON') return;
      window.scrollTo({ top: maxScroll(), behavior: 'smooth' });
    };
    const onResize = () => { world?.resize(); onScroll(); };

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', onResize);
    window.scrollTo(0, 0);
    onScroll();
    raf = requestAnimationFrame(frame);

    if (gl) {
      import('./LoginScene.js').then(({ initLoginScene }) => {
        if (disposed || !canvasRef.current) return;
        world = initLoginScene(canvasRef.current);
        world.resize();
      }).catch(() => { /* scene failed: overlays still run on the void */ });
    }

    return () => {
      disposed = true;
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onResize);
      if (raf) cancelAnimationFrame(raf);
      world?.dispose();
    };
  }, [reduced, gl]);

  function skip() {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    window.scrollTo({ top: max, behavior: 'smooth' });
  }

  function stageClick() {
    if (!reduced && tRef.current < 0.65) skip();
  }

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
      window.scrollTo(0, 0);
      nav(user.role === 'admin' ? '/admin' : user.role === 'reviewer' ? '/reviewer' : '/user', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const card = (
    <div className="cine-card cine-card-dark">
      <div style={{ display: 'flex', marginBottom: 24, borderBottom: '1px solid rgba(138,144,153,0.25)' }}>
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
              clipPath: 'none',
              borderBottom: mode === m ? '2px solid var(--sol-500)' : '2px solid transparent',
              fontWeight: mode === m ? 700 : 400,
              color: mode === m ? 'var(--alloy-100)' : 'var(--alloy-400)',
              cursor: 'pointer',
              fontSize: 14,
            }}
          >
            {m === 'login' ? 'Sign In' : 'Register'}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} key={mode} className="form-swap">
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
            ref={emailRef}
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            autoFocus={reduced && mode === 'login'}
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
          <p style={{ color: '#ff7a70', fontSize: 13, marginBottom: 12 }}>{error}</p>
        )}

        <button type="submit" disabled={loading} className="btn-primary"
          style={{ width: '100%', padding: '9px 14px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          {loading && <Ring spinning size={14} color="#fff" />}
          {loading
            ? (mode === 'login' ? 'Signing in' : 'Registering')
            : (mode === 'login' ? 'Sign In' : 'Register')}
        </button>

        {mode === 'login' && (
          <div style={{ marginTop: 14, textAlign: 'center' }}>
            <Link to="/forgot-password" style={{ fontSize: 13 }}>
              Forgot password?
            </Link>
          </div>
        )}
      </form>
    </div>
  );

  // Reduced motion: the mark and the card, no ceremony.
  if (reduced) {
    return (
      <div className="cine-wrap cine-static">
        <div className="cine-stage" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 26, padding: 24 }}>
          <div style={{ textAlign: 'center' }}>
            <Ring rays size={84} color="var(--sol-500)" style={{ display: 'block', margin: '0 auto 14px' }} />
            <Wordmark size={24} />
            <div style={{ marginTop: 8, color: 'var(--alloy-100)', fontSize: 14, fontWeight: 500 }}>ES QR Tracker</div>
          </div>
          {card}
        </div>
      </div>
    );
  }

  return (
    <div className="cine-wrap">
      <div className="cine-stage" onClick={stageClick}>
        {gl ? (
          <canvas ref={canvasRef} className="cine-canvas" />
        ) : (
          <>
            {sparks.map(s => (
              <span
                key={s.id}
                className="fx-dot"
                style={{
                  left: s.left, top: s.top, background: s.color,
                  '--dur': s.dur, '--delay': s.delay, '--dx': s.dx, '--peak': s.peak,
                }}
              />
            ))}
            <div className="cine-glow" style={{ opacity: 1 }} />
            <div ref={leftRef} className="cine-panel cine-panel-l"><div className="cine-cells" /></div>
            <div ref={rightRef} className="cine-panel cine-panel-r"><div className="cine-cells" /></div>
          </>
        )}

        {/* the logo moment */}
        <div ref={logoRef} className="cine-logo">
          <div className="cine-logo-glow" />
          <Ring rays size={110} color="var(--sol-500)" className="origin-slow" style={{ display: 'block' }} />
          <Wordmark size={30} />
          <div style={{ textAlign: 'center' }}>
            <div className="cine-sub">ES QR Tracker</div>
            <div className="eyebrow cine-org" style={{ marginTop: 4 }}>Nuevosol Energy</div>
          </div>
        </div>

        {/* the sign-in card */}
        <div ref={formRef} className="cine-form">
          {card}
        </div>

        <div ref={vigRef} className="cine-vignette" />
        <div className="cine-grain" />
        <div ref={barTRef} className="cine-bar cine-bar-t" />
        <div ref={barBRef} className="cine-bar cine-bar-b" />
        <div ref={progRef} className="cine-progress" />

        <div ref={hintRef} className="cine-hint">Scroll to enter</div>
        <button ref={skipRef} type="button" className="cine-skip" onClick={skip}>Skip</button>
      </div>
    </div>
  );
}
