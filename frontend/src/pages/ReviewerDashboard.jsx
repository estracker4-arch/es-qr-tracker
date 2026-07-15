import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';

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

function reviewStatus(t) {
  if (t.reviewed_at) return 'Reviewed';
  if (t.review_started_at) return 'In Review';
  if (t.review_duration_seconds > 0) return 'Paused';
  return 'Pending';
}

const REVIEW_STATUS_COLOR = {
  'Reviewed':  '#276749',
  'In Review': '#d69e2e',
  'Paused':    '#3182ce',
  'Pending':   '#888',
};

function fmtDT(iso) {
  return iso ? new Date(iso).toLocaleString() : '—';
}

function hmsToSecs(hms) {
  const p = (hms || '').split(':').map(Number);
  return (p[0] || 0) * 3600 + (p[1] || 0) * 60 + (p[2] || 0);
}

const TH = { padding: '8px 12px', border: '1px solid #ccc', background: '#f4f4f4', textAlign: 'left', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' };
const TD = { padding: '7px 12px', border: '1px solid #e8e8e8', fontSize: 13, verticalAlign: 'top' };

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
    });
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
      setForm({ review_hms: '', review_reason: '', review_rework_reason: '' });
      fetchTasks(filters);
    } catch (err) {
      setError(err.message);
    } finally {
      setStarting(false);
    }
  }

  async function saveReview() {
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
    if (!window.confirm('Save this review and stop the timer? This finalizes the review.')) return;
    setSaving(true);
    try {
      await api.reviewer.review(active.id, {
        review_seconds:       hmsToSecs(form.review_hms),
        review_reason:        form.review_reason.trim(),
        review_rework_reason: form.review_rework_reason.trim() || null,
        size_category:        form.size_category || null,
      });
      setActive(null);
      fetchTasks(filters);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ padding: 24, minWidth: 900 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
        <div>
          <h1>Reviewer Dashboard</h1>
          <p style={{ color: '#666', fontSize: 13, marginTop: 4 }}>Signed in as {me.name}</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {me.can_do_tasks && <button onClick={() => nav('/user')}>Switch to My Tasks</button>}
          <button onClick={handleLogout}>Logout</button>
        </div>
      </div>

      {/* Filters */}
      <section style={{ marginBottom: 24 }}>
        <h2 style={{ marginBottom: 12 }}>Filters</h2>
        <form onSubmit={handleApply} style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, marginBottom: 3 }}>User</label>
            <select name="user_id" value={filters.user_id} onChange={handleChange} style={{ width: 160 }}>
              <option value="">All users</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, marginBottom: 3 }}>Product</label>
            <input name="product" value={filters.product} onChange={handleChange} placeholder="Filter…" style={{ width: 150 }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, marginBottom: 3 }}>QR No</label>
            <input name="qr_no" value={filters.qr_no} onChange={handleChange} placeholder="Filter…" style={{ width: 120 }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, marginBottom: 3 }}>Review</label>
            <select name="reviewed" value={filters.reviewed} onChange={handleChange} style={{ width: 130 }}>
              <option value="">All</option>
              <option value="no">Not reviewed</option>
              <option value="yes">Reviewed</option>
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, marginBottom: 3 }}>From</label>
            <input type="date" name="date_from" value={filters.date_from} onChange={handleChange} style={{ width: 145 }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, marginBottom: 3 }}>To</label>
            <input type="date" name="date_to" value={filters.date_to} onChange={handleChange} style={{ width: 145 }} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="submit">Apply</button>
            <button type="button" onClick={handleClear}>Clear</button>
          </div>
        </form>
      </section>

      {/* Tasks table */}
      <section>
        <h2 style={{ marginBottom: 12 }}>Tasks ({tasks.length})</h2>
        <p style={{ fontSize: 12, color: '#777', marginBottom: 10 }}>Only uploaded (completed) tasks appear here. Click a QR No to review.</p>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
            <thead>
              <tr>
                {['User', 'Product', 'QR No', 'Session Type', 'Session No', 'State',
                  'User Time', 'Quote Size', 'Actual Time', 'Reviewer Time', 'Review Status', 'Review Start', 'Review End',
                  'Reviewer', ''].map((h, i) => <th key={i} style={TH}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {tasks.length === 0 && (
                <tr><td colSpan={15} style={{ ...TD, color: '#888' }}>No tasks found.</td></tr>
              )}
              {tasks.map(task => (
                <tr key={task.id}>
                  <td style={TD}>{task.user_name}</td>
                  <td style={TD}>{task.product}</td>
                  <td style={TD}>
                    <button
                      onClick={() => openReview(task)}
                      style={{ background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', textDecoration: 'underline', fontSize: 13, padding: 0 }}
                    >
                      {task.qr_no}
                    </button>
                  </td>
                  <td style={TD}>{task.status_field}</td>
                  <td style={TD}>S{task.session_number}</td>
                  <td style={TD}>{task.task_status}</td>
                  <td style={{ ...TD, fontWeight: 500 }}>{formatDuration(getLiveSeconds(task))}</td>
                  <td style={TD}>{task.size_category || '—'}</td>
                  <td style={TD}>{task.review_seconds != null ? formatDuration(task.review_seconds) : '—'}</td>
                  <td style={TD}>
                    {task.review_ended_at
                      ? formatDuration(task.review_duration_seconds)
                      : task.review_started_at
                        ? <span style={{ color: '#d69e2e' }}>{formatDuration(reviewElapsed(task))} (running)</span>
                        : task.review_duration_seconds
                          ? <span style={{ color: '#3182ce' }}>{formatDuration(task.review_duration_seconds)} (paused)</span>
                          : '—'}
                  </td>
                  <td style={{ ...TD, color: REVIEW_STATUS_COLOR[reviewStatus(task)], fontWeight: 500 }}>{reviewStatus(task)}</td>
                  <td style={TD}>{fmtDT(task.review_first_started_at)}</td>
                  <td style={TD}>{fmtDT(task.review_ended_at)}</td>
                  <td style={TD}>{task.reviewer_name || '—'}</td>
                  <td style={TD}>
                    {task.reviewer_id && task.reviewer_id !== me.id ? (
                      <button onClick={() => openReview(task)} title={`Locked by ${task.reviewer_name}`} style={{ fontSize: 12, padding: '2px 8px', color: '#c53030' }}>
                        🔒 Locked
                      </button>
                    ) : (
                      <button onClick={() => openReview(task)} style={{ fontSize: 12, padding: '2px 8px' }}>
                        {task.reviewed_at ? 'Edit Review' : 'Review'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Review Modal */}
      {active && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }}>
          <div style={{ background: '#fff', padding: 28, width: 460, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 4px 24px rgba(0,0,0,0.15)' }}>
            <h2 style={{ marginBottom: 16 }}>Review — QR {active.qr_no}</h2>

            <div style={{ border: '1px solid #e2e2e2', padding: '12px 14px', marginBottom: 20, fontSize: 13, lineHeight: 1.7 }}>
              <div><strong>User:</strong> {active.user_name}</div>
              <div><strong>Product:</strong> {active.product}</div>
              <div><strong>QR No:</strong> {active.qr_no}</div>
              <div><strong>Session Type:</strong> {active.status_field} (S{active.session_number})</div>
              <div><strong>State:</strong> {active.task_status}</div>
              <div><strong>Started:</strong> {active.started_at ? new Date(active.started_at).toLocaleString() : '—'}</div>
              <div><strong>Stopped:</strong> {active.stopped_at ? new Date(active.stopped_at).toLocaleString() : '—'}</div>
              <div><strong>User Time:</strong> {formatDuration(getLiveSeconds(active))}</div>
              <div><strong>Paused Time:</strong> {formatDuration(active.total_paused_seconds || 0)}</div>
              {active.stuck_reason && <div><strong>Stuck Reason:</strong> {active.stuck_reason}</div>}
            </div>

            {lockedByOther && (
              <div style={{ marginBottom: 18, padding: '10px 14px', border: '1px solid #fc8181', background: '#fff5f5', color: '#c53030', fontSize: 13 }}>
                🔒 This QR is being reviewed by <strong>{active.reviewer_name}</strong>. You cannot review it.
              </div>
            )}

            {/* Review timer */}
            <div style={{ border: '1px solid #ccc', padding: '12px 14px', marginBottom: 18 }}>
              <div style={{ fontSize: 11, color: '#777', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Reviewer Time
              </div>
              <div style={{ fontSize: 28, fontWeight: 600 }}>
                {formatDuration(reviewElapsed(active) || 0)}
                {active.review_started_at && !active.review_ended_at && (
                  <span style={{ fontSize: 12, color: '#d69e2e', marginLeft: 8 }}>running…</span>
                )}
              </div>
              {/* not started, running, paused, ended */}
              {!active.review_started_at && !active.review_ended_at && !active.review_duration_seconds && (
                <button onClick={startReview} disabled={starting || lockedByOther} style={{ marginTop: 10 }}>
                  {starting ? 'Starting…' : 'Start Review Timer'}
                </button>
              )}
              {active.review_started_at && !active.review_ended_at && (
                <>
                  <button onClick={pauseReview} disabled={starting || lockedByOther} style={{ marginTop: 10 }}>
                    {starting ? 'Pausing…' : 'Pause Timer'}
                  </button>
                  <p style={{ fontSize: 12, color: '#666', marginTop: 8 }}>
                    Auto-pauses if you start another QR; stops when you save below.
                  </p>
                </>
              )}
              {!active.review_started_at && !active.review_ended_at && active.review_duration_seconds > 0 && (
                <button onClick={startReview} disabled={starting || lockedByOther} style={{ marginTop: 10 }}>
                  {starting ? 'Resuming…' : 'Resume Timer'}
                </button>
              )}
            </div>

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
                <p style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
                  Auto-set to BN (User Time over 5 hours).
                </p>
              )}
            </div>

            <div className="form-group">
              <label>Actual Time (HH:MM:SS)</label>
              <input
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
              <p style={{ fontSize: 12, color: '#666', marginBottom: 12 }}>
                Last reviewed by {active.reviewer_name} on {new Date(active.reviewed_at).toLocaleString()}.
              </p>
            )}

            {error && <p style={{ color: '#b00', fontSize: 13, marginBottom: 12 }}>{error}</p>}

            {!active.review_started_at && (
              <p style={{ fontSize: 12, color: '#b00', marginBottom: 10 }}>Start or resume the review timer before saving.</p>
            )}

            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <button onClick={saveReview} disabled={saving || !active.review_started_at || lockedByOther}>
                {saving ? 'Saving…' : 'Save Review & Stop Timer'}
              </button>
              <button onClick={() => setActive(null)}>Cancel</button>
              {(active.review_started_at || active.review_ended_at || active.review_duration_seconds > 0) && (
                <button
                  onClick={resetReview}
                  disabled={starting || lockedByOther}
                  style={{ marginLeft: 'auto', color: '#c53030' }}
                >
                  Reset Timer
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
