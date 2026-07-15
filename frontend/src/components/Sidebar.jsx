import React from 'react';

function fmt(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  const date = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  return `${date}, ${time}`;
}

const STATUS_BG = {
  'working':          { bg: '#fff5f5', border: '#feb2b2', badge: '#e53e3e' },
  'work in progress': { bg: '#fffff0', border: '#faf089', badge: '#d69e2e' },
  'stopped':          { bg: '#ebf8ff', border: '#bee3f8', badge: '#3182ce' },
  'uploaded':         { bg: '#f0fff4', border: '#9ae6b4', badge: '#38a169' },
  'stuck':            { bg: '#fff5f5', border: '#fc8181', badge: '#c53030' },
};

export default function Sidebar({ tasks, selectedId, onSelect, onNewTask, getLiveSeconds, formatDuration }) {
  return (
    <aside style={{
      width: 256,
      minWidth: 256,
      borderRight: '1px solid #ccc',
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      overflow: 'hidden',
    }}>
      <div style={{ padding: '12px 12px', borderBottom: '1px solid #ccc' }}>
        <button onClick={onNewTask} style={{ width: '100%' }}>+ New Task</button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {tasks.length === 0 && (
          <p style={{ padding: '16px 12px', color: '#777', fontSize: 13 }}>No tasks yet.</p>
        )}
        {tasks.map(task => {
          const isSelected = task.id === selectedId;
          const s = STATUS_BG[task.task_status] || STATUS_BG['working'];
          return (
            <div
              key={task.id}
              onClick={() => onSelect(task.id)}
              style={{
                padding: '10px 12px',
                borderBottom: `1px solid ${s.border}`,
                borderLeft: `4px solid ${s.badge}`,
                cursor: 'pointer',
                background: isSelected ? s.border : s.bg,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 6, marginBottom: 3 }}>
                <span style={{ fontWeight: 500, fontSize: 13, lineHeight: 1.3 }}>
                  {task.product}
                </span>
                <span style={{
                  fontSize: 10,
                  padding: '2px 6px',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                  background: s.badge,
                  color: '#fff',
                }}>
                  {task.task_status}
                </span>
              </div>

              <div style={{ fontSize: 12, color: '#444', marginBottom: 2 }}>{task.qr_no}</div>
              <div style={{ fontSize: 11, color: '#666', marginBottom: 4 }}>{task.status_field} S{task.session_number}</div>

              <div style={{ fontSize: 11, color: '#666', marginBottom: 2 }}>
                <span style={{ color: '#999' }}>Start: </span>{fmt(task.started_at)}
              </div>
              {task.stopped_at && (
                <div style={{ fontSize: 11, color: '#666', marginBottom: 2 }}>
                  <span style={{ color: '#999' }}>End: </span>{fmt(task.stopped_at)}
                </div>
              )}

              <div style={{ marginTop: 4, fontSize: 11, color: '#888' }}>
                {formatDuration(getLiveSeconds(task))} active
              </div>

              {task.stuck_reason && (
                <div style={{ marginTop: 4, fontSize: 11, color: '#666', fontStyle: 'italic' }}>
                  previously stuck
                </div>
              )}

              {task.reviewed_at && (
                <div style={{ marginTop: 4, fontSize: 11, color: '#276749', fontWeight: 500 }}>
                  ✓ reviewed
                </div>
              )}
            </div>
          );
        })}
      </div>
    </aside>
  );
}
