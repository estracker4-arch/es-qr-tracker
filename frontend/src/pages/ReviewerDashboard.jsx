import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import Ring from '../components/Ring';
import Wordmark from '../components/Wordmark';

function formatDuration(secs) {
  const s = Math.max(0, secs || 0);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

function getLiveSeconds(task) {
  const base = task.total_active_seconds || 0;
  if (task.task_status !== 'working' || !task.last_resume_at) return base;
  const elapsed = Math.floor((Date.now() - new Date(task.last_resume_at).getTime()) / 1000);
  return base + Math.max(0, elapsed);
}

const OUTCOME_LABEL = { closed_out: 'Closed Out', stuck: 'Stuck', ier: 'IER' };

function reviewStatus(t) {
  if (t.reviewed_at) return OUTCOME_LABEL[t.review_outcome] || 'Reviewed';
  if (t.review_started_at) return 'In Review';
  if (t.review_duration_seconds > 0) return 'Paused';
  return 'Pending';
}

// ring grammar: hollow = pending, half = in a state, solid = terminal
const REVIEW_STATUS_RING = {
  'Closed Out': { color: 'var(--signal-ok)',   fill: 1 },
  'Stuck':      { color: 'var(--signal-stop)', fill: 1 },
  'IER':        { color: 'var(--signal-warn)', fill: 1 },
  'Reviewed':   { color: 'var(--signal-ok)',   fill: 1 },
  'In Review':  { color: 'var(--signal-warn)', fill: 0.5 },
  'Paused':     { color: 'var(--alloy-400)',   fill: 0.5 },
  'Pending':    { color: 'var(--alloy-400)',   fill: 0 },
};

const REVIEW_STATUS_COLOR = {
  'Closed Out': 'var(--signal-ok)',
  'Stuck':      'var(--signal-stop)',
  'IER':        'var(--signal-warn)',
  'Reviewed':   'var(--signal-ok)',
  'In Review':  'var(--signal-warn)',
  'Paused':     'var(--ink-400)',
  'Pending':    'var(--ink-400)',
};

function fmtDT(iso) {
  return iso ? new Date(iso).toLocaleString() : '—';
}

function hmsToSecs(hms) {
  const p = (hms || '').split(':').map(Number);
  return (p[0] || 0) * 3600 + (p[1] || 0) * 60 + (p[2] || 0);
}

const TH = {
  padding: '8px 12px', borderBottom: '1px solid var(--mist-200)', background: 'var(--mist-050)',
  textAlign: 'left', fontSize: 11, fontWeight: 500, whiteSpace: 'nowrap',
  textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--ink-400)',
};
const TD = { padding: '8px 12px', borderBottom: '1px solid rgba(227,230,235,0.55)', fontSize: 13, verticalAlign: 'top' };
const TD_NUM = { ...TD, textAlign: 'right', fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' };

const EMPTY_FILTERS = { user_id: '', product: '', qr_no: '', task_status: '', reviewed: '', date_from: '', date_to: '' };

export default function ReviewerDashboard() {
  const [tasks,   setTasks]   = useState([]);
  const [users,   setUsers]   = useState([]);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [active,  setActive]  = useState(null);   // task being reviewed
  const [form,    setForm]    = useState({ review_hms: '', review_reason: '' });
  const [error,   setError]   = useState('');
  const [saving,  setSaving]  = useState(false);
  const [starting, setStarting] = useState(false);
  const [outcomeStep, setOutcomeStep] = useState(false); // status prompt after Save
  const [, tick]  = useState(0);
  const nav  = useNavigate();
  const me   = JSON.parse(localStorage.getItem('user') || '{}');

  const fetchTasks = useCallback((f) =>
    api.reviewer.getTasks(f).then(setTasks).catch(console.error), []);

  useEffect(() => {
    api.reviewer.getUsers().then(setUsers).catch(console.error);
    fetchTasks(EMPTY_FILTERS);
    const poll = setInterval(() => tick(n => n + 1), 30_000);
    const live = setInterval(() => tick(n => n + 1), 1_000);   // live review timer
    return () => { clearInterval(poll); clearInterval(live); };
  }, [fetchTasks]);

  // live elapsed seconds = banked duration + current running segment
  function reviewElapsed(task) {
    const base = task?.review_duration_seconds || 0;
    if (task?.review_started_at && !task?.review_ended_at) {
      return base + Math.max(0, Math.floor((Date.now() - new Date(task.review_started_at).getTime()) / 1000));
    }
    return base;
  }

  function handleChange(e) {
    setFilters(f => ({ ...f, [e.target.name]: e.target.value }));
  }
  function handleApply(e) { e.preventDefault(); fetchTasks(filters); }
  function handleClear()  { setFilters(EMPTY_FILTERS); fetchTasks(EMPTY_FILTERS); }
  function handleLogout() { localStorage.clear(); nav('/login', { replace: true }); }

  const lockedByOther = !!(active && active.reviewer_id && active.reviewer_id !== me.id);

  function openReview(task) {
    setActive(task);
    setForm({
      review_hms:    task.review_seconds != null ? formatDuration(task.review_seconds) : formatDuration(getLiveSeconds(task)),
      review_reason: task.review_reason || '',
      review_rework_reason: task.review_rework_reason || '',
      size_category: task.size_category || '',
      review_outcome: task.review_outcome || '',
      review_outcome_reason: task.review_outcome_reason || '',
    });
    setOutcomeStep(false);
    setError('');
  }

  async function startReview() {
    setStarting(true);
    setError('');
    try {
      const updated = await api.reviewer.startReview(active.id);
      setActive(updated);
      fetchTasks(filters);
    } catch (err) {
      setError(err.message);
    } finally {
      setStarting(false);
    }
  }

  async function pauseReview() {
    setStarting(true);
    setError('');
    try {
      const updated = await api.reviewer.pauseReview(active.id);
      setActive(updated);
      fetchTasks(filters);
    } catch (err) {
      setError(err.message);
    } finally {
      setStarting(false);
    }
  }

  async function resetReview() {
    if (!window.confirm('Erase ALL review data for this QR (timer, actual time, reasons, reviewer)? This cannot be undone.')) return;
    setStarting(true);
    setError('');
    try {
      const updated = await api.reviewer.resetReview(active.id);
      setActive(updated);
      setForm({ review_hms: '', review_reason: '', review_rework_reason: '', size_category: '', review_outcome: '', review_outcome_reason: '' });
      setOutcomeStep(false);
      fetchTasks(filters);
    } catch (err) {
      setError(err.message);
    } finally {
      setStarting(false);
    }
  }

  // Step 1: validate the form, then ask for the review status.
  function saveReview() {
    setError('');
    if (!/^\d{1,3}:[0-5]?\d:[0-5]?\d$/.test(form.review_hms.trim())) {
      setError('Time must be in HH:MM:SS format.');
      return;
    }
    const isBN = getLiveSeconds(active) > 18000 || form.size_category === 'BN';
    if (isBN && !form.review_reason.trim()) {
      setError('BN Reason is required.');
      return;
    }
    setForm(f => ({ ...f, review_outcome: '', review_outcome_reason: '' }));
    setOutcomeStep(true);
  }

  // Step 2: submit with the chosen status (+ reason for stuck / IER).
  async function submitReview() {
    setError('');
    if (!form.review_outcome) {
      setError('Choose a review status.');
      return;
    }
    if ((form.review_outcome === 'stuck' || form.review_outcome === 'ier') && !form.review_outcome_reason.trim()) {
      setError('A reason is required for this status.');
      return;
    }
    setSaving(true);
    try {
      await api.reviewer.review(active.id, {
        review_seconds:        hmsToSecs(form.review_hms),
        review_reason:         form.review_reason.trim(),
        review_rework_reason:  form.review_rework_reason.trim() || null,
        size_category:         form.size_category || null,
        review_outcome:        form.review_outcome,
        review_outcome_reason: form.review_outcome === 'closed_out' ? null : form.review_outcome_reason.trim(),
      });
      setOutcomeStep(false);
      setActive(null);
      fetchTasks(filters);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--mist-000)' }}>
      {/* graphite header band — the seam runs along its bottom edge */}
      <header style={{
        background: 'var(--graphite-900)',
        borderBottom: '1px solid var(--alloy-600)',
        padding: '0 24px',
        height: 64,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 16 }}>
          <Wordmark size={17} />
          <h1 style={{ fontSize: 18, color: 'var(--alloy-100)' }}>Reviewer Dashboard</h1>
          <span style={{ color: 'var(--alloy-400)', fontSize: 12 }}>Signed in as {me.name}</span>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12,
            color: 'var(--alloy-100)', border: '1px solid var(--alloy-600)', padding: '3px 10px',
          }}>
            <Ring size={10} color="var(--signal-warn)" fill={0.5} />
            <span className="mono">{tasks.filter(x => !x.reviewed_at).length}</span>
            <span style={{ color: 'var(--alloy-400)' }}>to review</span>
          </span>
          <span className="mono" style={{ color: 'var(--alloy-400)', fontSize: 12 }}>
            {new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {me.can_do_tasks && <button className="btn-dark" onClick={() => nav('/user')}>Switch to My Tasks</button>}
          <button className="btn-dark" onClick={handleLogout}>Logout</button>
        </div>
      </header>

      <div style={{ padding: 24, minWidth: 900 }}>
      {/* Filters */}
      <section className="fade-up" style={{ marginBottom: 24 }}>
        <h2 style={{ marginBottom: 12 }}>Filters</h2>
        <form onSubmit={handleApply} style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <label>User</label>
            <select name="user_id" value={filters.user_id} onChange={handleChange} style={{ width: 160 }}>
              <option value="">All users</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
          <div>
            <label>Product</label>
            <input name="product" value={filters.product} onChange={handleChange} placeholder="Filter…" style={{ width: 150 }} />
          </div>
          <div>
            <label>QR No</label>
            <input name="qr_no" value={filters.qr_no} onChange={handleChange} placeholder="Filter…" style={{ width: 120 }} />
          </div>
          <div>
            <label>Review</label>
            <select name="reviewed" value={filters.reviewed} onChange={handleChange} style={{ width: 130 }}>
              <option value="">All</option>
              <option value="no">Not reviewed</option>
              <option value="yes">Reviewed</option>
            </select>
          </div>
          <div>
            <label>From</label>
            <input type="date" name="date_from" value={filters.date_from} onChange={handleChange} style={{ width: 145 }} />
          </div>
          <div>
            <label>To</label>
            <input type="date" name="date_to" value={filters.date_to} onChange={handleChange} style={{ width: 145 }} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="submit">Apply</button>
            <button type="button" onClick={handleClear}>Clear</button>
          </div>
        </form>
      </section>

      {/* Tasks table */}
      <section className="fade-up" style={{ '--d': '90ms' }}>
        <h2 style={{ marginBottom: 12 }}>Tasks ({tasks.length})</h2>
        <p style={{ fontSize: 12, color: 'var(--ink-400)', marginBottom: 10 }}>Only uploaded (completed) tasks appear here. Click a QR No to review.</p>
        <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 560, border: '1px solid var(--mist-200)' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
            <thead>
              <tr>
                {['User', 'Product', 'QR No', 'Session Type', 'Session No', 'State',
                  'User Time', 'Quote Size', 'Actual Time', 'Reviewer Time', 'Review Status', 'Status Reason', 'Review Start', 'Review End',
                  'Reviewer', ''].map((h, i) => <th key={i} style={{ ...TH, position: 'sticky', top: 0, zIndex: 1 }}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {tasks.length === 0 && (
                <tr><td colSpan={16} style={{ ...TD, color: 'var(--ink-400)' }}>No tasks found.</td></tr>
              )}
              {tasks.map(task => {
                const rs = reviewStatus(task);
                const ring = REVIEW_STATUS_RING[rs] || REVIEW_STATUS_RING['Pending'];
                return (
                <tr key={task.id} className="tbl-row">
                  <td style={TD}>{task.user_name}</td>
                  <td style={TD}>{task.product}</td>
                  <td style={TD}>
                    <button
                      onClick={() => openReview(task)}
                      className="mono"
                      style={{
                        background: 'none', border: 'none', clipPath: 'none', color: 'var(--ink-900)',
                        cursor: 'pointer', textDecoration: 'underline', textDecorationColor: 'var(--sol-500)',
                        textUnderlineOffset: 2, fontSize: 13, padding: 0, fontWeight: 500,
                      }}
                    >
                      {task.qr_no}
                    </button>
                  </td>
                  <td style={TD}>{task.status_field}</td>
                  <td style={TD_NUM}>S{task.session_number}</td>
                  <td style={TD}>{task.task_status}</td>
                  <td style={{ ...TD_NUM, fontWeight: 500 }}>{formatDuration(getLiveSeconds(task))}</td>
                  <td style={TD}>{task.size_category || '—'}</td>
                  <td style={TD_NUM}>{task.review_seconds != null ? formatDuration(task.review_seconds) : '—'}</td>
                  <td style={TD_NUM}>
                    {task.review_ended_at
                      ? formatDuration(task.review_duration_seconds)
                      : task.review_started_at
                        ? <span style={{ color: 'var(--signal-warn)' }}>{formatDuration(reviewElapsed(task))} (running)</span>
                        : task.review_duration_seconds
                          ? <span style={{ color: 'var(--ink-400)' }}>{formatDuration(task.review_duration_seconds)} (paused)</span>
                          : '—'}
                  </td>
                  <td style={{ ...TD, color: REVIEW_STATUS_COLOR[rs], fontWeight: 500, whiteSpace: 'nowrap' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <Ring size={10} color={ring.color} fill={ring.fill} />
                      {rs}
                    </span>
                  </td>
                  <td style={{ ...TD, maxWidth: 200, whiteSpace: 'normal' }}>{task.review_outcome_reason || '—'}</td>
                  <td style={{ ...TD, fontFamily: 'var(--font-mono)', fontSize: 12 }}>{fmtDT(task.review_first_started_at)}</td>
                  <td style={{ ...TD, fontFamily: 'var(--font-mono)', fontSize: 12 }}>{fmtDT(task.review_ended_at)}</td>
                  <td style={TD}>{task.reviewer_name || '—'}</td>
                  <td style={TD}>
                    {task.reviewer_id && task.reviewer_id !== me.id ? (
                      <button onClick={() => openReview(task)} title={`Locked by ${task.reviewer_name}`} className="btn-danger" style={{ fontSize: 12, padding: '2px 8px' }}>
                        🔒 Locked
                      </button>
                    ) : (
                      <button onClick={() => openReview(task)} style={{ fontSize: 12, padding: '2px 8px' }}>
                        {task.reviewed_at ? 'Edit Review' : 'Review'}
                      </button>
                    )}
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
      </div>

      {/* Review Modal */}
      {active && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(12,15,19,0.55)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }}>
          <div style={{
            background: 'var(--mist-000)', width: 460, maxHeight: '90vh', overflowY: 'auto',
            border: '1px solid var(--mist-200)', clipPath: 'var(--chamfer)',
          }}>
            {/* graphite instrument block — local seam against the form below */}
            <div style={{ background: 'var(--graphite-800)', borderBottom: '1px solid var(--alloy-600)', padding: '16px 24px' }}>
              <h2 style={{ marginBottom: 10, color: 'var(--alloy-100)' }}>
                Review — QR <span className="mono">{active.qr_no}</span>
              </h2>
              <div className="eyebrow" style={{ color: 'var(--alloy-400)', marginBottom: 2 }}>
                Reviewer Time
              </div>
              <div className="mono" style={{ fontSize: 30, fontWeight: 500, color: 'var(--alloy-100)', display: 'flex', alignItems: 'center', gap: 10 }}>
                {formatDuration(reviewElapsed(active) || 0)}
                {active.review_started_at && !active.review_ended_at && (
                  <span style={{ fontSize: 12, color: 'var(--signal-warn)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <Ring spinning size={14} color="var(--signal-warn)" />
                    running
                  </span>
                )}
              </div>
              {/* the user's clock against the 5h BN threshold */}
              <div className="bn-bar">
                <div
                  className="bn-bar-fill"
                  style={{
                    width: `${Math.min(100, (getLiveSeconds(active) / 18000) * 100).toFixed(1)}%`,
                    background: getLiveSeconds(active) > 18000 ? 'var(--signal-stop)' : 'var(--signal-ok)',
                  }}
                />
              </div>
              <div className="bn-bar-label">
                <span>{getLiveSeconds(active) > 18000 ? 'User time over 5h — BN' : 'User time vs BN threshold'}</span>
                <span className="mono">05:00:00</span>
              </div>
              <div style={{ marginTop: 10 }}>
                {!active.review_started_at && !active.review_ended_at && !active.review_duration_seconds && (
                  <button className="btn-dark" onClick={startReview} disabled={starting || lockedByOther}>
                    {starting ? 'Starting…' : 'Start Review Timer'}
                  </button>
                )}
                {active.review_started_at && !active.review_ended_at && (
                  <>
                    <button className="btn-dark" onClick={pauseReview} disabled={starting || lockedByOther}>
                      {starting ? 'Pausing…' : 'Pause Timer'}
                    </button>
                    <p style={{ fontSize: 12, color: 'var(--alloy-400)', marginTop: 8 }}>
                      Auto-pauses if you start another QR; stops when you save below.
                    </p>
                  </>
                )}
                {!active.review_started_at && !active.review_ended_at && active.review_duration_seconds > 0 && (
                  <button className="btn-dark" onClick={startReview} disabled={starting || lockedByOther}>
                    {starting ? 'Resuming…' : 'Resume Timer'}
                  </button>
                )}
              </div>
            </div>

            <div style={{ padding: '20px 24px' }}>
            <div className="recess" style={{ padding: '12px 14px', marginBottom: 20, fontSize: 13, lineHeight: 1.7 }}>
              <div><strong>User:</strong> {active.user_name}</div>
              <div><strong>Product:</strong> {active.product}</div>
              <div><strong>QR No:</strong> <span className="mono">{active.qr_no}</span></div>
              <div><strong>Session Type:</strong> {active.status_field} (S{active.session_number})</div>
              <div><strong>State:</strong> {active.task_status}</div>
              <div><strong>Started:</strong> <span className="mono">{active.started_at ? new Date(active.started_at).toLocaleString() : '—'}</span></div>
              <div><strong>Stopped:</strong> <span className="mono">{active.stopped_at ? new Date(active.stopped_at).toLocaleString() : '—'}</span></div>
              <div><strong>User Time:</strong> <span className="mono">{formatDuration(getLiveSeconds(active))}</span></div>
              <div><strong>Paused Time:</strong> <span className="mono">{formatDuration(active.total_paused_seconds || 0)}</span></div>
              {active.stuck_reason && <div><strong>Stuck Reason:</strong> {active.stuck_reason}</div>}
            </div>

            {lockedByOther && (
              <div className="recess" style={{ marginBottom: 18, padding: '10px 14px', color: 'var(--signal-stop)', fontSize: 13, borderLeft: '2px solid var(--signal-stop)' }}>
                🔒 This QR is being reviewed by <strong>{active.reviewer_name}</strong>. You cannot review it.
              </div>
            )}

            <div className="form-group">
              <label>Quote Size</label>
              <select
                value={getLiveSeconds(active) > 18000 ? 'BN' : form.size_category}
                disabled={getLiveSeconds(active) > 18000}
                onChange={e => setForm(f => ({ ...f, size_category: e.target.value }))}
              >
                <option value="">— None —</option>
                <option value="BN">BN</option>
              </select>
              {getLiveSeconds(active) > 18000 && (
                <p style={{ fontSize: 12, color: 'var(--ink-400)', marginTop: 4 }}>
                  Auto-set to BN (User Time over 5 hours).
                </p>
              )}
            </div>

            <div className="form-group">
              <label>Actual Time (HH:MM:SS)</label>
              <input
                className="mono"
                value={form.review_hms}
                onChange={e => setForm(f => ({ ...f, review_hms: e.target.value }))}
                placeholder="00:00:00"
              />
            </div>

            {(getLiveSeconds(active) > 18000 || form.size_category === 'BN') && (
              <div className="form-group">
                <label>BN Reason (visible to the user)</label>
                <textarea
                  rows={3}
                  value={form.review_reason}
                  onChange={e => setForm(f => ({ ...f, review_reason: e.target.value }))}
                />
              </div>
            )}

            <div className="form-group">
              <label>Rework Reason (visible to the user)</label>
              <textarea
                rows={3}
                value={form.review_rework_reason}
                onChange={e => setForm(f => ({ ...f, review_rework_reason: e.target.value }))}
              />
            </div>

            {active.reviewed_at && (
              <p style={{ fontSize: 12, color: 'var(--ink-400)', marginBottom: 12 }}>
                Last reviewed by {active.reviewer_name} on {new Date(active.reviewed_at).toLocaleString()}.
              </p>
            )}

            {error && <p style={{ color: 'var(--signal-stop)', fontSize: 13, marginBottom: 12 }}>{error}</p>}

            {!active.review_started_at && (
              <p style={{ fontSize: 12, color: 'var(--signal-stop)', marginBottom: 10 }}>Start or resume the review timer before saving.</p>
            )}

            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <button className="btn-primary" onClick={saveReview} disabled={saving || !active.review_started_at || lockedByOther}>
                {saving ? 'Saving…' : 'Save Review & Stop Timer'}
              </button>
              <button onClick={() => setActive(null)}>Cancel</button>
              {(active.review_started_at || active.review_ended_at || active.review_duration_seconds > 0) && (
                <button
                  className="btn-danger"
                  onClick={resetReview}
                  disabled={starting || lockedByOther}
                  style={{ marginLeft: 'auto' }}
                >
                  Reset Timer
                </button>
              )}
            </div>
            </div>
          </div>
        </div>
      )}

      {active && outcomeStep && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1100, background: 'rgba(12,15,19,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--mist-000)', padding: 28, width: 400, border: '1px solid var(--mist-200)', clipPath: 'var(--chamfer)' }}>
            <h2 style={{ marginBottom: 6 }}>Review Status</h2>
            <p style={{ fontSize: 13, color: 'var(--ink-400)', marginBottom: 16 }}>
              Select the outcome for QR <span className="mono">{active.qr_no}</span>.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
              {[
                ['closed_out', 'Closed Out', 'var(--signal-ok)'],
                ['stuck', 'Stuck', 'var(--signal-stop)'],
                ['ier', 'IER', 'var(--signal-warn)'],
              ].map(([val, label, color]) => {
                const selected = form.review_outcome === val;
                return (
                  <label key={val} style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px',
                    border: '1px solid', borderColor: selected ? 'var(--sol-500)' : 'var(--mist-200)',
                    cursor: 'pointer', background: selected ? 'var(--sol-tint)' : 'var(--mist-000)',
                    clipPath: 'var(--chamfer)', transition: 'border-color 200ms var(--ease), background 200ms var(--ease)',
                    fontSize: 13, fontWeight: 500, textTransform: 'none', letterSpacing: 0, color: 'var(--ink-900)',
                  }}>
                    <input
                      type="radio" name="review_outcome"
                      checked={selected}
                      onChange={() => setForm(f => ({ ...f, review_outcome: val }))}
                      style={{ width: 'auto', clipPath: 'none' }}
                    />
                    <Ring size={12} color={color} fill={selected ? 1 : 0.5} />
                    {label}
                  </label>
                );
              })}
            </div>

            {(form.review_outcome === 'stuck' || form.review_outcome === 'ier') && (
              <div className="form-group">
                <label>{form.review_outcome === 'stuck' ? 'Stuck' : 'IER'} Reason (required)</label>
                <textarea
                  rows={3}
                  value={form.review_outcome_reason}
                  onChange={e => setForm(f => ({ ...f, review_outcome_reason: e.target.value }))}
                />
              </div>
            )}

            {error && <p style={{ color: 'var(--signal-stop)', fontSize: 13, marginBottom: 10 }}>{error}</p>}

            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button className="btn-primary" onClick={submitReview} disabled={saving}>
                {saving ? 'Saving…' : 'Confirm & Save'}
              </button>
              <button onClick={() => { setOutcomeStep(false); setError(''); }} disabled={saving}>Back</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
