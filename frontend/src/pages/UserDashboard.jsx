import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import Sidebar from '../components/Sidebar';
import TaskPanel from '../components/TaskPanel';

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

export default function UserDashboard() {
  const [tasks, setTasks]           = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [options, setOptions]       = useState({ products: [], qrCodes: [], statuses: [] });
  const [form, setForm]             = useState({ product: '', qr_no: '', status_field: '' });
  const [autoPauseMsg, setAutoPauseMsg] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [, tick] = useState(0);
  const nav  = useNavigate();
  const user = JSON.parse(localStorage.getItem('user') || '{}');

  const fetchTasks = useCallback(async () => {
    try { setTasks(await api.getTasks()); } catch {}
  }, []);

  useEffect(() => {
    api.getOptions().then(setOptions).catch(console.error);
    fetchTasks();
  }, [fetchTasks]);

  useEffect(() => {
    const poll  = setInterval(fetchTasks, 30_000);
    const timer = setInterval(() => tick(n => n + 1), 1_000);
    return () => { clearInterval(poll); clearInterval(timer); };
  }, [fetchTasks]);

  const selectedTask = tasks.find(t => t.id === selectedId) ?? null;

  async function handleStart() {
    const { product, qr_no, status_field } = form;
    if (!product || !qr_no || !status_field) return;
    setActionLoading(true);
    setAutoPauseMsg('');
    try {
      const { task, autoPaused } = await api.startTask(product, qr_no, status_field);
      if (autoPaused) setAutoPauseMsg('Previous task paused automatically.');
      await fetchTasks();
      setSelectedId(task.id);
      setForm({ product: '', qr_no: '', status_field: '' });
    } catch (err) {
      alert(err.message);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleAction(action, payload) {
    setActionLoading(true);
    setAutoPauseMsg('');
    try {
      let result;
      switch (action) {
        case 'pause':    result = await api.pauseTask(selectedId);          break;
        case 'resume':   result = await api.resumeTask(selectedId);         break;
        case 'stop':     result = await api.stopTask(selectedId);           break;
        case 'unstop':   result = await api.unstopTask(selectedId);         break;
        case 'complete': result = await api.completeTask(selectedId, payload); break;
        case 'stuck':    result = await api.setStuckReason(selectedId, payload); break;
        case 'delete':
          await api.deleteTask(selectedId);
          setSelectedId(null);
          await fetchTasks();
          setActionLoading(false);
          return;
      }
      if (action === 'resume' && result?.autoPaused) {
        setAutoPauseMsg('Previous task paused automatically.');
      }
      await fetchTasks();
    } catch (err) {
      alert(err.message);
    } finally {
      setActionLoading(false);
    }
  }

  function handleLogout() {
    localStorage.clear();
    nav('/login', { replace: true });
  }

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <Sidebar
        tasks={tasks}
        selectedId={selectedId}
        onSelect={id => { setSelectedId(id); setAutoPauseMsg(''); }}
        onNewTask={() => { setSelectedId(null); setAutoPauseMsg(''); }}
        getLiveSeconds={getLiveSeconds}
        formatDuration={formatDuration}
      />

      <main style={{ flex: 1, padding: 24, overflowY: 'auto' }}>
        <div className="fade-up" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
          <div>
            <h1>Welcome, {user.name}</h1>
            <div style={{ fontSize: 12, color: 'var(--ink-400)', marginTop: 3 }}>
              {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'short', year: 'numeric' })}
              <span className="mono" style={{ marginLeft: 10, color: 'var(--ink-900)' }}>
                {new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {user.role === 'reviewer' && (
              <button onClick={() => nav('/reviewer')}>Switch to Reviewer</button>
            )}
            <button onClick={handleLogout}>Logout</button>
          </div>
        </div>

        {autoPauseMsg && (
          <div className="recess" style={{
            padding: '8px 12px',
            fontSize: 13,
            marginBottom: 20,
            color: 'var(--ink-400)',
            borderLeft: '2px solid var(--signal-warn)',
          }}>
            {autoPauseMsg}
          </div>
        )}

        {!selectedTask ? (
          <div className="panel fade-up" style={{ maxWidth: 420, '--d': '80ms' }}>
            <div className="panel-title">Start new task</div>
            <div className="panel-sub">The running task pauses automatically when a new one starts.</div>

            <div className="form-group">
              <label>User</label>
              <input value={user.name || ''} disabled />
            </div>

            <div className="form-group">
              <label>Product</label>
              <select value={form.product} onChange={e => setForm(f => ({ ...f, product: e.target.value }))}>
                <option value="">— Select Product —</option>
                {options.products.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>

            <div className="form-group">
              <label>QR No</label>
              <input
                type="number"
                min="1"
                value={form.qr_no}
                onChange={e => setForm(f => ({ ...f, qr_no: e.target.value }))}
                placeholder="Enter QR number"
              />
            </div>

            <div className="form-group">
              <label>Session Type</label>
              <select value={form.status_field} onChange={e => setForm(f => ({ ...f, status_field: e.target.value }))}>
                <option value="">— Select Session Type —</option>
                {options.statuses.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            <button
              className="btn-primary"
              onClick={handleStart}
              disabled={actionLoading || !form.product || !form.qr_no || !form.status_field}
              style={{ marginTop: 4, minWidth: 96 }}
            >
              {actionLoading ? 'Starting…' : 'Start'}
            </button>
          </div>
        ) : (
          <TaskPanel
            task={selectedTask}
            liveSeconds={getLiveSeconds(selectedTask)}
            formatDuration={formatDuration}
            onAction={handleAction}
            loading={actionLoading}
          />
        )}
      </main>
    </div>
  );
}
