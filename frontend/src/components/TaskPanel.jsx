import React, { useState } from 'react';
import Ring from './Ring';
import { api } from '../api';

const REVIEW_OUTCOME_LABEL = { closed_out: 'Closed Out', stuck: 'Stuck', ier: 'IER' };
const REVIEW_OUTCOME_COLOR = { closed_out: 'var(--signal-ok)', stuck: 'var(--signal-stop)', ier: 'var(--signal-warn)' };

const STATUS_RING = {
  'working':          { color: 'var(--signal-ok)',   fill: 0.5 },
  'work in progress': { color: 'var(--signal-warn)', fill: 0.5 },
  'stopped':          { color: 'var(--alloy-400)',   fill: 0.5 },
  'uploaded':         { color: 'var(--signal-ok)',   fill: 1 },
  'stuck':            { color: 'var(--signal-stop)', fill: 0.5 },
};

export default function TaskPanel({ task, liveSeconds, formatDuration, onAction, loading }) {
  const [showStuck, setShowStuck] = useState(false);
  const [stuckText, setStuckText] = useState('');

  // Self-QC step shown between "Mark Completed" and upload.
  const [qcMode, setQcMode]       = useState(false);
  const [qcItems, setQcItems]     = useState([]);
  const [qcChecked, setQcChecked] = useState(() => new Set());
  const [qcStart, setQcStart]     = useState(null);
  const [qcLoading, setQcLoading] = useState(false);
  const [qcError, setQcError]     = useState('');

  function submitStuck() {
    if (!stuckText.trim()) return;
    onAction('stuck', stuckText.trim());
    setStuckText('');
    setShowStuck(false);
  }

  async function openQc() {
    setQcLoading(true); setQcError('');
    try {
      const items = await api.getTaskQcItems(task.id);
      if (!items.length) {
        // No checklist configured for this product — upload straight through.
        onAction('complete', { self_qc_seconds: 0, checked_items: [] });
        return;
      }
      setQcItems(items);
      setQcChecked(new Set());
      setQcStart(Date.now());
      setQcMode(true);
    } catch (e) {
      setQcError(e.message);
    } finally {
      setQcLoading(false);
    }
  }

  function toggleQc(id) {
    setQcChecked(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

  function submitQc() {
    const secs = Math.max(0, Math.round((Date.now() - qcStart) / 1000));
    onAction('complete', { self_qc_seconds: secs, checked_items: [...qcChecked] });
    setQcMode(false);
  }

  const qcElapsed = qcStart ? Math.max(0, Math.round((Date.now() - qcStart) / 1000)) : 0;
  const qcAllChecked = qcItems.length > 0 && qcItems.every(it => qcChecked.has(it.id));

  const locked = task.task_status === 'uploaded';
  const s = STATUS_RING[task.task_status] || STATUS_RING['working'];

  return (
    <div style={{ maxWidth: 480 }}>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ marginBottom: 4 }}>{task.product}</h2>
        <div style={{ fontSize: 13, color: 'var(--ink-400)', marginBottom: 2 }}>
          QR: <span className="mono" style={{ color: 'var(--ink-900)' }}>{task.qr_no}</span>
        </div>
        <div style={{ fontSize: 13, color: 'var(--ink-400)', marginBottom: 2 }}>Session Type: {task.status_field} S{task.session_number}</div>
        <div style={{ fontSize: 13, marginTop: 6, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            State:
            <Ring size={11} color={s.color} fill={s.fill} />
            <strong style={task.task_status === 'stuck' ? { color: 'var(--signal-stop)' } : {}}>{task.task_status}</strong>
          </span>
          {task.stuck_reason && task.task_status !== 'stuck' && (
            <span style={{
              fontSize: 11,
              padding: '1px 7px',
              border: '1px solid var(--mist-200)',
              color: 'var(--ink-400)',
            }}>
              previously stuck
            </span>
          )}
          {task.was_auto_paused && (
            <span style={{ fontSize: 11, color: 'var(--ink-400)' }}>auto-paused</span>
          )}
        </div>
      </div>

      {/* graphite instrument block — local seam, hard edges */}
      <div className="panel-dark" style={{ padding: '16px 18px', marginBottom: 20, borderLeft: `2px solid ${s.color}` }}>
        <div className="eyebrow" style={{ color: 'var(--alloy-400)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
          User Time
          {task.task_status === 'working' && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--signal-ok)' }}>
              <span className="pulse-dot" /> live
            </span>
          )}
        </div>
        <div className="mono" style={{ fontSize: 38, fontWeight: 500, letterSpacing: '-0.01em', color: 'var(--alloy-100)' }}>
          {formatDuration(liveSeconds)}
        </div>
        {/* BN threshold: quotes over 5h of active time become BN */}
        <div className="bn-bar">
          <div
            className="bn-bar-fill"
            style={{
              width: `${Math.min(100, (liveSeconds / 18000) * 100).toFixed(1)}%`,
              background: liveSeconds > 18000 ? 'var(--signal-stop)' : liveSeconds > 14400 ? 'var(--signal-warn)' : 'var(--signal-ok)',
            }}
          />
        </div>
        <div className="bn-bar-label">
          <span>{liveSeconds > 18000 ? 'BN — over 5h' : 'BN threshold'}</span>
          <span className="mono">05:00:00</span>
        </div>
        {task.self_qc_seconds != null && (
          <div style={{ fontSize: 12, color: 'var(--alloy-400)', marginTop: 4 }}>
            Self QC: <span className="mono">{formatDuration(task.self_qc_seconds)}</span>
          </div>
        )}
        {task.total_with_qc_seconds != null && (
          <div style={{ fontSize: 12, color: 'var(--alloy-100)', marginTop: 2 }}>
            User + QC: <span className="mono">{formatDuration(task.total_with_qc_seconds)}</span>
          </div>
        )}
        {task.total_paused_seconds > 0 && (
          <div style={{ fontSize: 12, color: 'var(--alloy-400)', marginTop: 4 }}>
            Paused: <span className="mono">{formatDuration(task.total_paused_seconds)}</span>
          </div>
        )}
        {task.started_at && (
          <div style={{ fontSize: 12, color: 'var(--alloy-400)', marginTop: 6 }}>
            Started <span className="mono">{new Date(task.started_at).toLocaleString()}</span>
          </div>
        )}
        {task.stopped_at && (
          <div style={{ fontSize: 12, color: 'var(--alloy-400)' }}>
            Stopped <span className="mono">{new Date(task.stopped_at).toLocaleString()}</span>
          </div>
        )}
      </div>

      {task.stuck_reason && (
        <div className="recess" style={{ marginBottom: 16, padding: '8px 12px', fontSize: 13, color: 'var(--ink-400)' }}>
          <span style={{ fontWeight: 500, color: 'var(--ink-900)' }}>Stuck reason: </span>{task.stuck_reason}
        </div>
      )}

      {task.reviewed_at && (
        <div className="recess" style={{ marginBottom: 16, padding: '12px 14px', fontSize: 13, borderLeft: '2px solid var(--signal-ok)' }}>
          <div style={{ fontWeight: 700, marginBottom: 6, color: 'var(--ink-900)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Ring size={11} color="var(--signal-ok)" fill={1} />
            Reviewer Feedback
          </div>
          {task.review_outcome && (
            <div style={{ marginBottom: 3 }}>
              <span style={{ color: 'var(--ink-400)' }}>Status: </span>
              <strong style={{ color: REVIEW_OUTCOME_COLOR[task.review_outcome] || 'var(--signal-ok)' }}>
                {REVIEW_OUTCOME_LABEL[task.review_outcome] || task.review_outcome}
              </strong>
            </div>
          )}
          {task.review_outcome_reason && (
            <div style={{ marginBottom: 3 }}>
              <span style={{ color: 'var(--ink-400)' }}>{task.review_outcome === 'ier' ? 'IER' : 'Stuck'} Reason: </span>{task.review_outcome_reason}
            </div>
          )}
          {task.size_category && (
            <div style={{ marginBottom: 3 }}>
              <span style={{ color: 'var(--ink-400)' }}>Quote Size: </span>
              <strong>{task.size_category}</strong>
            </div>
          )}
          <div style={{ marginBottom: 3 }}>
            <span style={{ color: 'var(--ink-400)' }}>Actual Time: </span>
            <strong className="mono">{formatDuration(task.review_seconds)}</strong>
          </div>
          {task.review_duration_seconds != null && (
            <div style={{ marginBottom: 3 }}>
              <span style={{ color: 'var(--ink-400)' }}>Reviewer Time: </span>
              <strong className="mono">{formatDuration(task.review_duration_seconds)}</strong>
            </div>
          )}
          {task.review_reason && (
            <div style={{ marginBottom: 3 }}>
              <span style={{ color: 'var(--ink-400)' }}>BN Reason: </span>{task.review_reason}
            </div>
          )}
          {task.review_rework_reason && (
            <div style={{ marginBottom: 3 }}>
              <span style={{ color: 'var(--ink-400)' }}>Rework Reason: </span>{task.review_rework_reason}
            </div>
          )}
          <div style={{ fontSize: 12, color: 'var(--ink-400)', marginTop: 4 }}>
            Reviewed by {task.reviewer_name} on {new Date(task.reviewed_at).toLocaleString()}
          </div>
        </div>
      )}

      {task.task_status === 'working' && (
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => onAction('pause')} disabled={loading}>Pause</button>
          <button onClick={() => onAction('stop')}  disabled={loading}>Stop</button>
        </div>
      )}

      {task.task_status === 'work in progress' && (
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-primary" onClick={() => onAction('resume')} disabled={loading}>Resume</button>
        </div>
      )}

      {task.task_status === 'stuck' && (
        <div>
          <div className="recess" style={{ marginBottom: 10, padding: '8px 12px', fontSize: 13, color: 'var(--signal-stop)', borderLeft: '2px solid var(--signal-stop)' }}>
            <strong>Stuck:</strong> {task.stuck_reason}
          </div>
          <button className="btn-primary" onClick={() => onAction('resume')} disabled={loading}>Resume</button>
        </div>
      )}

      {task.task_status === 'stopped' && !showStuck && !qcMode && (
        <div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-primary" onClick={openQc} disabled={loading || qcLoading}>
              {qcLoading ? 'Loading…' : 'Mark Completed'}
            </button>
            <button onClick={() => setShowStuck(true)}  disabled={loading}>Stuck Reason</button>
            <button onClick={() => onAction('unstop')}  disabled={loading}>Resume</button>
          </div>
          {qcError && <p style={{ color: 'var(--signal-stop)', fontSize: 13, marginTop: 8 }}>{qcError}</p>}
        </div>
      )}

      {task.task_status === 'stopped' && qcMode && (
        <div className="panel" style={{ maxWidth: 480 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 2 }}>
            <div className="panel-title" style={{ marginBottom: 0 }}>Self QC</div>
            <span className="mono" style={{ fontSize: 14, color: 'var(--ink-900)' }}>{formatDuration(qcElapsed)}</span>
          </div>
          <div className="panel-sub">Tick every item to upload. Time spent here is recorded.</div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, margin: '10px 0 12px' }}>
            {qcItems.map((it, idx) => {
              const done = qcChecked.has(it.id);
              return (
                <label key={it.id} style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '8px 6px', cursor: 'pointer',
                  borderBottom: '1px solid var(--mist-200)',
                }}>
                  <input type="checkbox" checked={done} onChange={() => toggleQc(it.id)} style={{ width: 16, height: 16, cursor: 'pointer' }} />
                  <span className="mono" style={{ fontSize: 11, color: 'var(--ink-400)', minWidth: 18 }}>{idx + 1}.</span>
                  <span style={{
                    flex: 1, fontSize: 13,
                    textDecoration: done ? 'line-through' : 'none',
                    color: done ? 'var(--ink-400)' : 'var(--ink-900)',
                  }}>{it.label}</span>
                </label>
              );
            })}
          </div>

          <div style={{ fontSize: 12, color: qcAllChecked ? 'var(--signal-ok)' : 'var(--signal-warn)', marginBottom: 12 }}>
            {qcChecked.size}/{qcItems.length} checked
            {!qcAllChecked && ` — ${qcItems.length - qcChecked.size} unchecked will be recorded`}
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-primary" onClick={submitQc} disabled={loading}>Complete &amp; Upload</button>
            <button onClick={() => { setQcMode(false); setQcError(''); }} disabled={loading}>Cancel</button>
          </div>
        </div>
      )}

      {task.task_status === 'stopped' && showStuck && (
        <div>
          <div className="form-group">
            <label>Why is this task stuck?</label>
            <textarea
              rows={3}
              value={stuckText}
              onChange={e => setStuckText(e.target.value)}
              autoFocus
            />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={submitStuck} disabled={loading || !stuckText.trim()}>Submit</button>
            <button onClick={() => { setShowStuck(false); setStuckText(''); }}>Cancel</button>
          </div>
        </div>
      )}

      {locked && (
        <div className="recess" style={{ padding: '12px 14px', fontSize: 13 }}>
          <strong style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Ring size={11} color="var(--signal-ok)" fill={1} />
            Uploaded
          </strong>
          <div style={{ fontSize: 12, color: 'var(--ink-400)', marginTop: 4 }}>Task is locked.</div>
        </div>
      )}

      <div style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid var(--mist-200)' }}>
        <button
          className="btn-danger"
          onClick={() => {
            if (window.confirm('Are you sure you want to delete this session? This action cannot be undone.')) {
              onAction('delete');
            }
          }}
          disabled={loading}
        >
          Delete Session
        </button>
      </div>
    </div>
  );
}
