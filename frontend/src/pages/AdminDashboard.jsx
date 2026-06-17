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

const TH = { padding: '8px 12px', border: '1px solid #ccc', background: '#f4f4f4', textAlign: 'left', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' };
const TD = { padding: '7px 12px', border: '1px solid #e8e8e8', fontSize: 13, verticalAlign: 'top' };

const EMPTY_FILTERS = { user_id: '', product: '', qr_no: '', task_status: '', date_from: '', date_to: '' };


export default function AdminDashboard() {
  const [tasks,    setTasks]    = useState([]);
  const [summary,  setSummary]  = useState({ byStatus: [], bySize: [] });
  const [users,    setUsers]    = useState([]);
  const [filters,  setFilters]  = useState(EMPTY_FILTERS);
  const [products, setProducts] = useState([]);
  const [newProduct, setNewProduct] = useState('');
  const [productError, setProductError] = useState('');
  const [productEditMode, setProductEditMode] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [editForm, setEditForm]       = useState({});
  const [editError, setEditError]     = useState('');
  const [editLoading, setEditLoading] = useState(false);
  const [sessionTypes] = useState(['Design', 'Internal Rework', 'External Revision', 'External Rework', 'Help']);
  const [, tick] = useState(0);
  const nav = useNavigate();

  const fetchProducts = useCallback(() =>
    api.admin.getProducts().then(setProducts).catch(console.error), []);

  const fetchData = useCallback(async (f) => {
    try {
      const [t, s] = await Promise.all([api.admin.getTasks(f), api.admin.getSummary()]);
      setTasks(t);
      setSummary(s);
    } catch (err) {
      console.error(err);
    }
  }, []);

  useEffect(() => {
    api.admin.getUsers().then(setUsers).catch(console.error);
    fetchProducts();
    fetchData(EMPTY_FILTERS);
    const timer = setInterval(() => tick(n => n + 1), 30_000);
    return () => clearInterval(timer);
  }, [fetchData, fetchProducts]);

  async function handleAddProduct(e) {
    e.preventDefault();
    setProductError('');
    try {
      await api.admin.addProduct(newProduct);
      setNewProduct('');
      fetchProducts();
    } catch (err) {
      setProductError(err.message);
    }
  }

  async function handleDeleteProduct(id, name) {
    if (!window.confirm(`Delete "${name}"?`)) return;
    try {
      await api.admin.deleteProduct(id);
      fetchProducts();
    } catch (err) {
      alert(err.message);
    }
  }

  function handleChange(e) {
    setFilters(f => ({ ...f, [e.target.name]: e.target.value }));
  }

  function handleApply(e) {
    e.preventDefault();
    fetchData(filters);
  }

  function handleClear() {
    setFilters(EMPTY_FILTERS);
    fetchData(EMPTY_FILTERS);
  }

  function openEdit(task) {
    setEditingTask(task);
    setEditForm({
      product:      task.product,
      qr_no:        task.qr_no,
      status_field: task.status_field,
      task_status:  task.task_status,
      size_category: task.size_category || '',
      bn_reason:    task.bn_reason || '',
      stuck_reason: task.stuck_reason || '',
    });
    setEditError('');
  }

  async function handleEditSave() {
    setEditLoading(true);
    setEditError('');
    try {
      await api.admin.editTask(editingTask.id, {
        ...editForm,
        size_category: editForm.size_category || null,
        bn_reason:     editForm.bn_reason     || null,
        stuck_reason:  editForm.stuck_reason  || null,
      });
      setEditingTask(null);
      fetchData(filters);
    } catch (err) {
      setEditError(err.message);
    } finally {
      setEditLoading(false);
    }
  }

  function handleLogout() {
    localStorage.clear();
    nav('/login', { replace: true });
  }

  function downloadCSV() {
    const headers = ['User', 'Product', 'QR No', 'Session Type', 'State', 'Size', 'BN Reason', 'Started', 'Stopped', 'Active Time', 'Paused Time', 'Auto-paused'];
    const escape = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = tasks.map(t => [
      t.user_name,
      t.product,
      t.qr_no,
      `${t.status_field} S${t.session_number}`,
      t.task_status,
      t.size_category || '',
      t.bn_reason || '',
      t.started_at ? new Date(t.started_at).toLocaleString() : '',
      t.stopped_at ? new Date(t.stopped_at).toLocaleString() : '',
      formatDuration(getLiveSeconds(t)),
      formatDuration(t.total_paused_seconds || 0),
      t.was_auto_paused ? 'Yes' : 'No',
    ].map(escape).join(','));

    const csv = [headers.map(escape).join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `es-qr-tracker-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div style={{ padding: 24, minWidth: 900 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
        <h1>Admin Dashboard</h1>
        <button onClick={handleLogout}>Logout</button>
      </div>

      {/* Summary */}
      <section style={{ marginBottom: 32 }}>
        <h2 style={{ marginBottom: 14 }}>Summary</h2>
        <div style={{ display: 'flex', gap: 40, flexWrap: 'wrap' }}>
          <div>
            <h3 style={{ marginBottom: 8 }}>Tasks by state</h3>
            <table style={{ borderCollapse: 'collapse' }}>
              <thead><tr><th style={TH}>State</th><th style={TH}>Count</th></tr></thead>
              <tbody>
                {summary.byStatus.length === 0 && (
                  <tr><td style={TD} colSpan={2}>—</td></tr>
                )}
                {summary.byStatus.map(r => (
                  <tr key={r.task_status}>
                    <td style={TD}>{r.task_status}</td>
                    <td style={{ ...TD, fontWeight: 600 }}>{r.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div>
            <h3 style={{ marginBottom: 8 }}>Completed by size</h3>
            <table style={{ borderCollapse: 'collapse' }}>
              <thead><tr><th style={TH}>Size</th><th style={TH}>Count</th></tr></thead>
              <tbody>
                {summary.bySize.filter(r => r.size_category).length === 0 && (
                  <tr><td style={TD} colSpan={2}>—</td></tr>
                )}
                {summary.bySize.filter(r => r.size_category).map(r => (
                  <tr key={r.size_category}>
                    <td style={TD}>{r.size_category}</td>
                    <td style={{ ...TD, fontWeight: 600 }}>{r.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

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
            <label style={{ display: 'block', fontSize: 12, marginBottom: 3 }}>State</label>
            <select name="task_status" value={filters.task_status} onChange={handleChange} style={{ width: 130 }}>
              <option value="">All</option>
              <option value="working">Working</option>
              <option value="work in progress">Work In Progress</option>
              <option value="stopped">Stopped</option>
              <option value="uploaded">Uploaded</option>
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

      {/* Products Management */}
      <section style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
          <h2>Products</h2>
          <button
            type="button"
            onClick={() => setProductEditMode(m => !m)}
            style={{ fontSize: 12, padding: '3px 10px' }}
          >
            {productEditMode ? 'Done' : 'Edit'}
          </button>
        </div>

        {productEditMode && (
          <form onSubmit={handleAddProduct} style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <input
              value={newProduct}
              onChange={e => { setNewProduct(e.target.value); setProductError(''); }}
              placeholder="New product name"
              style={{ width: 220 }}
            />
            <button type="submit" disabled={!newProduct.trim()}>Add</button>
          </form>
        )}
        {productError && <p style={{ color: '#b00', fontSize: 13, marginBottom: 8 }}>{productError}</p>}

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {products.map(p => (
            <div key={p.id} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '4px 10px', border: '1px solid #ccc', background: '#fafafa', fontSize: 13,
            }}>
              <span>{p.name}</span>
              {productEditMode && (
                <button
                  onClick={() => handleDeleteProduct(p.id, p.name)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#c00', fontSize: 14, padding: '0 2px', lineHeight: 1 }}
                  title="Delete"
                >×</button>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Tasks table */}
      <section>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h2>Tasks ({tasks.length})</h2>
          <button onClick={downloadCSV} disabled={tasks.length === 0}>Download CSV</button>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
            <thead>
              <tr>
                {[
                  'User', 'Product', 'QR No', 'Session Type', 'State',
                  'Size', 'BN Reason', 'Started', 'Stopped', 'Active Time', 'Paused Time', 'Auto-paused', '',
                ].map((h, i) => <th key={i} style={TH}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {tasks.length === 0 && (
                <tr>
                  <td colSpan={13} style={{ ...TD, color: '#888' }}>No tasks found.</td>
                </tr>
              )}
              {tasks.map(task => (
                <tr key={task.id}>
                  <td style={TD}>{task.user_name}</td>
                  <td style={TD}>{task.product}</td>
                  <td style={TD}>{task.qr_no}</td>
                  <td style={TD}>{task.status_field} S{task.session_number}</td>
                  <td style={TD}>{task.task_status}</td>
                  <td style={TD}>{task.size_category || '—'}</td>
                  <td style={TD}>{task.bn_reason || '—'}</td>
                  <td style={TD}>{task.started_at ? new Date(task.started_at).toLocaleString() : '—'}</td>
                  <td style={TD}>{task.stopped_at ? new Date(task.stopped_at).toLocaleString() : '—'}</td>
                  <td style={{ ...TD, fontWeight: 500 }}>{formatDuration(getLiveSeconds(task))}</td>
                  <td style={TD}>{formatDuration(task.total_paused_seconds || 0)}</td>
                  <td style={TD}>{task.was_auto_paused ? 'Yes' : 'No'}</td>
                  <td style={TD}>
                    <button onClick={() => openEdit(task)} style={{ fontSize: 12, padding: '2px 8px' }}>Edit</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Edit Modal */}
      {editingTask && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }}>
          <div style={{ background: '#fff', padding: 28, width: 440, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 4px 24px rgba(0,0,0,0.15)' }}>
            <h2 style={{ marginBottom: 20 }}>Edit Task #{editingTask.id}</h2>

            {[
              { label: 'Product', key: 'product', type: 'select', options: products.map(p => p.name) },
              { label: 'QR No',   key: 'qr_no',   type: 'text' },
            ].map(({ label, key, type, options }) => (
              <div className="form-group" key={key}>
                <label>{label}</label>
                {type === 'select' ? (
                  <select value={editForm[key]} onChange={e => setEditForm(f => ({ ...f, [key]: e.target.value }))}>
                    {options.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                ) : (
                  <input value={editForm[key]} onChange={e => setEditForm(f => ({ ...f, [key]: e.target.value }))} />
                )}
              </div>
            ))}

            <div className="form-group">
              <label>Session Type</label>
              <select value={editForm.status_field} onChange={e => setEditForm(f => ({ ...f, status_field: e.target.value }))}>
                {sessionTypes.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            <div className="form-group">
              <label>State</label>
              <select value={editForm.task_status} onChange={e => setEditForm(f => ({ ...f, task_status: e.target.value }))}>
                <option value="working">Working</option>
                <option value="work in progress">Work In Progress</option>
                <option value="stopped">Stopped</option>
                <option value="uploaded">Uploaded</option>
              </select>
            </div>

            <div className="form-group">
              <label>Size</label>
              <select value={editForm.size_category} onChange={e => setEditForm(f => ({ ...f, size_category: e.target.value }))}>
                <option value="">— None —</option>
                <option value="BN">BN</option>
                <option value="Medium">Medium</option>
                <option value="Small">Small</option>
              </select>
            </div>

            {editForm.size_category === 'BN' && (
              <div className="form-group">
                <label>BN Reason</label>
                <textarea rows={2} value={editForm.bn_reason} onChange={e => setEditForm(f => ({ ...f, bn_reason: e.target.value }))} />
              </div>
            )}

            <div className="form-group">
              <label>Stuck Reason</label>
              <textarea rows={2} value={editForm.stuck_reason} onChange={e => setEditForm(f => ({ ...f, stuck_reason: e.target.value }))} />
            </div>

            {editError && <p style={{ color: '#b00', fontSize: 13, marginBottom: 12 }}>{editError}</p>}

            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <button onClick={handleEditSave} disabled={editLoading}>{editLoading ? 'Saving…' : 'Save'}</button>
              <button onClick={() => setEditingTask(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
