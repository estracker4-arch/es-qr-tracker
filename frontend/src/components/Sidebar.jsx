import React from 'react';
import Ring from './Ring';
import Wordmark from './Wordmark';

function fmt(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  const date = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  return `${date}, ${time}`;
}

// Ring grammar: hollow = pending, half = in a state, solid = terminal.
const STATUS_RING = {
  'working':          { color: 'var(--signal-ok)',   fill: 0.5 },
  'work in progress': { color: 'var(--signal-warn)', fill: 0.5 },
  'stopped':          { color: 'var(--alloy-400)',   fill: 0.5 },
  'uploaded':         { color: 'var(--signal-ok)',   fill: 1 },
  'stuck':            { color: 'var(--signal-stop)', fill: 0.5 },
};

const REVIEW_OUTCOME_LABEL = { closed_out: 'Closed Out', stuck: 'Stuck', ier: 'IER' };
const REVIEW_OUTCOME_COLOR = { closed_out: 'var(--signal-ok)', stuck: 'var(--signal-stop)', ier: 'var(--signal-warn)' };

export default function Sidebar({ tasks, selectedId, onSelect, onNewTask, getLiveSeconds, formatDuration }) {
  return (
    <aside style={{
      width: 264,
      minWidth: 264,
      background: 'var(--graphite-900)',
      borderRight: '1px solid var(--alloy-600)', /* the seam */
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      overflow: 'hidden',
    }}>
      <div style={{ padding: '14px 14px 12px', borderBottom: '1px solid var(--alloy-600)' }}>
        <Wordmark size={17} style={{ marginBottom: 12, display: 'inline-flex' }} />
        <button onClick={onNewTask} className="btn-dark" style={{ width: '100%' }}>+ New Task</button>
      </div>

      <div className="scroll-dark" style={{ flex: 1, overflowY: 'auto' }}>
        {tasks.length === 0 && (
          <p style={{ padding: '16px 14px', color: 'var(--alloy-400)', fontSize: 13 }}>No tasks yet.</p>
        )}
        {tasks.map(task => {
          const isSelected = task.id === selectedId;
          const s = STATUS_RING[task.task_status] || STATUS_RING['working'];
          return (
            <div
              key={task.id}
              onClick={() => onSelect(task.id)}
              style={{
                padding: '10px 14px 10px 12px',
                borderBottom: '1px solid rgba(43,51,62,0.6)',
                borderLeft: isSelected ? '2px solid var(--sol-500)' : '2px solid transparent',
                cursor: 'pointer',
                background: isSelected ? 'var(--sol-tint)' : 'transparent',
                transition: 'background 200ms var(--ease), padding-left 200ms var(--ease)',
              }}
              onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'rgba(43,51,62,0.35)'; }}
              onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 3 }}>
                <span style={{ fontWeight: 500, fontSize: 13, lineHeight: 1.3, color: 'var(--alloy-100)' }}>
                  {task.product}
                </span>
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  fontSize: 11, whiteSpace: 'nowrap', flexShrink: 0,
                  color: task.task_status === 'working' ? 'var(--signal-ok)' : 'var(--alloy-400)',
                }}>
                  {task.task_status === 'working'
                    ? <span className="pulse-dot" />
                    : <Ring size={10} color={s.color} fill={isSelected ? 1 : s.fill} />}
                  {task.task_status}
                </span>
              </div>

              <div className="mono" style={{ fontSize: 12, color: 'var(--alloy-100)', marginBottom: 2 }}>{task.qr_no}</div>
              <div style={{ fontSize: 11, color: 'var(--alloy-400)', marginBottom: 4 }}>{task.status_field} S{task.session_number}</div>

              <div style={{ fontSize: 11, color: 'var(--alloy-400)', marginBottom: 2 }}>
                <span style={{ opacity: 0.7 }}>Start: </span>
                <span className="mono">{fmt(task.started_at)}</span>
              </div>
              {task.stopped_at && (
                <div style={{ fontSize: 11, color: 'var(--alloy-400)', marginBottom: 2 }}>
                  <span style={{ opacity: 0.7 }}>End: </span>
                  <span className="mono">{fmt(task.stopped_at)}</span>
                </div>
              )}

              <div className="mono" style={{ marginTop: 4, fontSize: 11, color: 'var(--alloy-400)' }}>
                {formatDuration(getLiveSeconds(task))} active
              </div>

              {task.stuck_reason && (
                <div style={{ marginTop: 4, fontSize: 11, color: 'var(--alloy-400)', fontStyle: 'italic' }}>
                  previously stuck
                </div>
              )}

              {task.reviewed_at && (
                <div style={{
                  marginTop: 4, fontSize: 11, fontWeight: 500,
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  color: REVIEW_OUTCOME_COLOR[task.review_outcome] || 'var(--signal-ok)',
                }}>
                  <Ring size={10} color={REVIEW_OUTCOME_COLOR[task.review_outcome] || 'var(--signal-ok)'} fill={1} />
                  {REVIEW_OUTCOME_LABEL[task.review_outcome] || 'reviewed'}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </aside>
  );
}
