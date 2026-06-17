import React, { useState } from 'react';

export default function TaskPanel({ task, liveSeconds, formatDuration, onAction, loading }) {
  const [showStuck, setShowStuck] = useState(false);
  const [stuckText, setStuckText] = useState('');
  const [showBnReason, setShowBnReason] = useState(false);
  const [bnReason, setBnReason] = useState('');

  function submitBn() {
    if (!bnReason.trim()) return;
    onAction('size', { size: 'BN', reason: bnReason.trim() });
    setBnReason('');
    setShowBnReason(false);
  }

  function submitStuck() {
    if (!stuckText.trim()) return;
    onAction('stuck', stuckText.trim());
    setStuckText('');
    setShowStuck(false);
  }

  const locked = task.task_status === 'uploaded' && task.size_category;

  return (
    <div style={{ maxWidth: 480 }}>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ marginBottom: 4 }}>{task.product}</h2>
        <div style={{ fontSize: 13, color: '#444', marginBottom: 2 }}>QR: {task.qr_no}</div>
        <div style={{ fontSize: 13, color: '#444', marginBottom: 2 }}>Session Type: {task.status_field} S{task.session_number}</div>
        <div style={{ fontSize: 13, marginTop: 6, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span>State: <strong>{task.task_status}</strong></span>
          {task.stuck_reason && (
            <span style={{
              fontSize: 11,
              padding: '1px 7px',
              border: '1px solid #999',
              color: '#555',
            }}>
              previously stuck
            </span>
          )}
          {task.was_auto_paused && (
            <span style={{ fontSize: 11, color: '#888' }}>auto-paused</span>
          )}
        </div>
      </div>

      <div style={{
        padding: '14px 16px',
        border: '1px solid #ccc',
        marginBottom: 20,
      }}>
        <div style={{ fontSize: 11, color: '#777', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Active time
        </div>
        <div style={{ fontSize: 32, fontWeight: 600, letterSpacing: '-0.02em' }}>
          {formatDuration(liveSeconds)}
        </div>
        {task.total_paused_seconds > 0 && (
          <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>
            Paused: {formatDuration(task.total_paused_seconds)}
          </div>
        )}
        {task.started_at && (
          <div style={{ fontSize: 12, color: '#888', marginTop: 6 }}>
            Started {new Date(task.started_at).toLocaleString()}
          </div>
        )}
        {task.stopped_at && (
          <div style={{ fontSize: 12, color: '#888' }}>
            Stopped {new Date(task.stopped_at).toLocaleString()}
          </div>
        )}
      </div>

      {task.stuck_reason && (
        <div style={{ marginBottom: 16, padding: '8px 12px', border: '1px solid #ddd', fontSize: 13, color: '#555' }}>
          <span style={{ fontWeight: 500 }}>Stuck reason: </span>{task.stuck_reason}
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
          <button onClick={() => onAction('resume')} disabled={loading}>Resume</button>
        </div>
      )}

      {task.task_status === 'stopped' && !showStuck && (
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => onAction('complete')} disabled={loading}>Mark Completed</button>
          <button onClick={() => setShowStuck(true)}  disabled={loading}>Stuck Reason</button>
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

      {task.task_status === 'uploaded' && !task.size_category && !showBnReason && (
        <div>
          <p style={{ marginBottom: 10, fontSize: 13 }}>Select size category to lock task:</p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setShowBnReason(true)} disabled={loading}>BN</button>
            {['Medium', 'Small'].map(s => (
              <button key={s} onClick={() => onAction('size', { size: s })} disabled={loading}>{s}</button>
            ))}
          </div>
        </div>
      )}

      {task.task_status === 'uploaded' && !task.size_category && showBnReason && (
        <div>
          <div className="form-group">
            <label>Reason for BN</label>
            <textarea
              rows={3}
              value={bnReason}
              onChange={e => setBnReason(e.target.value)}
              autoFocus
            />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={submitBn} disabled={loading || !bnReason.trim()}>Submit</button>
            <button onClick={() => { setShowBnReason(false); setBnReason(''); }}>Cancel</button>
          </div>
        </div>
      )}

      {locked && (
        <div style={{ padding: '12px 14px', border: '1px solid #ccc', background: '#f8f8f8', fontSize: 13 }}>
          <strong>Uploaded</strong> — size: {task.size_category}
          {task.bn_reason && (
            <div style={{ marginTop: 6 }}>
              <span style={{ fontWeight: 500 }}>BN Reason: </span>{task.bn_reason}
            </div>
          )}
          <div style={{ fontSize: 12, color: '#777', marginTop: 4 }}>Task is locked.</div>
        </div>
      )}
    </div>
  );
}
