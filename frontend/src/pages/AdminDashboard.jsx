import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
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

const OUTCOME_LABEL = { closed_out: 'Closed Out', stuck: 'Stuck', ier: 'IER' };

function reviewStatus(t) {
  if (t.reviewed_at) return OUTCOME_LABEL[t.review_outcome] || 'Reviewed';
  if (t.review_started_at) return 'In Review';
  if (t.review_duration_seconds > 0) return 'Paused';
  return 'Pending';
}

const REVIEW_STATUS_COLOR = {
  'Closed Out': '#276749', 'Stuck': '#c53030', 'IER': '#d69e2e',
  'Reviewed': '#276749', 'In Review': '#d69e2e', 'Paused': '#3182ce', 'Pending': '#888',
};

function fmtDT(iso) {
  return iso ? new Date(iso).toLocaleString() : '—';
}

const TH = { padding: '8px 12px', border: '1px solid #ccc', background: '#f4f4f4', textAlign: 'left', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' };
const TH_STICKY = { ...TH, position: 'sticky', top: 0, zIndex: 1 };
const TD = { padding: '7px 12px', border: '1px solid #e8e8e8', fontSize: 13, verticalAlign: 'top' };
// ~15 rows then vertical scroll for the rest.
const SCROLL_BOX = { overflowX: 'auto', overflowY: 'auto', maxHeight: 520 };

const STATE_COLORS = {
  'stopped':          '#f59e0b',
  'stuck':            '#ef4444',
  'uploaded':         '#10b981',
  'work in progress': '#6366f1',
};

function lighten(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  r = Math.round(r + (255 - r) * amt);
  g = Math.round(g + (255 - g) * amt);
  b = Math.round(b + (255 - b) * amt);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

function polar(cx, cy, r, angle) {
  const a = (angle - 90) * Math.PI / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}

function slicePath(cx, cy, r, start, end) {
  const [sx, sy] = polar(cx, cy, r, end);
  const [ex, ey] = polar(cx, cy, r, start);
  const large = end - start > 180 ? 1 : 0;
  return `M ${cx} ${cy} L ${sx} ${sy} A ${r} ${r} 0 ${large} 0 ${ex} ${ey} Z`;
}

function StatePie({ data }) {
  const [hover, setHover] = useState(null);
  const total = data.reduce((s, d) => s + d.value, 0);
  if (!total) return <div style={{ fontSize: 13, color: '#888' }}>No tasks in these states.</div>;

  const SZ = 200, cx = 100, cy = 100, r = 88, inner = 58;
  let acc = 0;
  const slices = data.map((d, i) => {
    const start = acc / total * 360;
    acc += d.value;
    const end = acc / total * 360;
    return { ...d, i, start, end, mid: (start + end) / 2 };
  });
  const nonzero = slices.filter(s => s.value > 0);
  const pct = v => Math.round(v / total * 100);
  const active = hover !== null ? data[hover] : null;

  return (
    <div style={{ display: 'flex', gap: 36, alignItems: 'center', flexWrap: 'wrap' }}>
      <svg width={SZ} height={SZ} viewBox={`0 0 ${SZ} ${SZ}`} style={{ overflow: 'visible' }}>
        <defs>
          {data.map(d => (
            <linearGradient key={d.label} id={`pieGrad-${d.label.replace(/\s+/g, '-')}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={lighten(d.color, 0.22)} />
              <stop offset="100%" stopColor={d.color} />
            </linearGradient>
          ))}
          <filter id="pieShadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="3" stdDeviation="4" floodColor="#1e293b" floodOpacity="0.22" />
          </filter>
        </defs>

        <g filter="url(#pieShadow)">
          {nonzero.length === 1 ? (
            <circle
              cx={cx} cy={cy} r={r} fill={`url(#pieGrad-${nonzero[0].label.replace(/\s+/g, '-')})`}
              style={{ cursor: 'pointer' }}
              onMouseEnter={() => setHover(nonzero[0].i)}
              onMouseLeave={() => setHover(null)}
            />
          ) : slices.map(s => {
            if (!s.value) return null;
            const off = hover === s.i ? 10 : 0;
            const [dx, dy] = off ? polar(0, 0, off, s.mid) : [0, 0];
            return (
              <path
                key={s.label}
                d={slicePath(cx, cy, r, s.start, s.end)}
                fill={`url(#pieGrad-${s.label.replace(/\s+/g, '-')})`}
                stroke="#fff"
                strokeWidth={2.5}
                strokeLinejoin="round"
                transform={`translate(${dx} ${dy})`}
                style={{ cursor: 'pointer', transition: 'transform 0.15s ease', opacity: hover === null || hover === s.i ? 1 : 0.45 }}
                onMouseEnter={() => setHover(s.i)}
                onMouseLeave={() => setHover(null)}
              />
            );
          })}
        </g>

        {/* Donut hole + center label */}
        <circle cx={cx} cy={cy} r={inner} fill="#fff" />
        <text x={cx} y={active ? cy - 6 : cy - 2} textAnchor="middle"
          style={{ fontSize: 30, fontWeight: 700, fill: active ? active.color : '#1e293b' }}>
          {active ? active.value : total}
        </text>
        <text x={cx} y={active ? cy + 15 : cy + 18} textAnchor="middle"
          style={{ fontSize: 11, fill: '#64748b', textTransform: 'capitalize' }}>
          {active ? `${active.label} · ${pct(active.value)}%` : 'Total tasks'}
        </text>
      </svg>

      <div style={{ fontSize: 13, minWidth: 220 }}>
        {slices.map(s => (
          <div
            key={s.label}
            onMouseEnter={() => setHover(s.i)}
            onMouseLeave={() => setHover(null)}
            style={{
              display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6,
              padding: '7px 10px', borderRadius: 8, cursor: 'pointer',
              border: '1px solid', borderColor: hover === s.i ? s.color : '#eef2f7',
              background: hover === s.i ? lighten(s.color, 0.9) : '#fafbfc',
              transition: 'all 0.12s ease',
            }}
          >
            <span style={{ width: 12, height: 12, background: s.color, display: 'inline-block', borderRadius: '50%', flexShrink: 0 }} />
            <span style={{ textTransform: 'capitalize', flex: 1, fontWeight: 500, color: '#334155' }}>{s.label}</span>
            <span style={{ fontWeight: 700, color: '#1e293b' }}>{s.value}</span>
            <span style={{
              color: s.color, fontWeight: 600, fontSize: 12,
              background: lighten(s.color, 0.85), padding: '1px 7px', borderRadius: 10, minWidth: 42, textAlign: 'center',
            }}>{pct(s.value)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const EMPTY_FILTERS = { user_id: '', product: '', qr_no: '', task_status: '', date_from: '', date_to: '' };
const EMPTY_REVIEWER_FILTERS = { reviewer_id: '', product: '', qr_no: '', reviewed: '', date_from: '', date_to: '' };


export default function AdminDashboard() {
  const [tasks,    setTasks]    = useState([]);
  const [summary,  setSummary]  = useState({ byStatus: [] });
  const [users,    setUsers]    = useState([]);
  const [filters,  setFilters]  = useState(EMPTY_FILTERS);
  const [reviewerTasks, setReviewerTasks] = useState([]);
  const [reviewerFilters, setReviewerFilters] = useState(EMPTY_REVIEWER_FILTERS);
  const [products, setProducts] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [roleBusy, setRoleBusy] = useState(null);
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

  // Per-user summary over the currently filtered task set.
  const summaryRows = useMemo(() => {
    const map = new Map();
    for (const t of tasks) {
      const k = t.user_name || '—';
      if (!map.has(k)) map.set(k, { user: k, count: 0, userSecs: 0, actualSecs: 0, reviewerSecs: 0, bn: 0, reviewed: 0 });
      const r = map.get(k);
      r.count++;
      r.userSecs += getLiveSeconds(t);
      r.actualSecs += t.review_seconds || 0;
      r.reviewerSecs += t.review_duration_seconds || 0;
      if (t.size_category === 'BN') r.bn++;
      if (t.reviewed_at) r.reviewed++;
    }
    return [...map.values()].sort((a, b) => a.user.localeCompare(b.user));
  }, [tasks]);

  // Task-state distribution over the filtered user tasks (for the pie chart).
  const statePieData = useMemo(() => {
    const c = { 'stopped': 0, 'stuck': 0, 'uploaded': 0, 'work in progress': 0 };
    for (const t of tasks) if (t.task_status in c) c[t.task_status]++;
    return Object.keys(c).map(k => ({ label: k, value: c[k], color: STATE_COLORS[k] }));
  }, [tasks]);

  const summaryTotals = useMemo(() => summaryRows.reduce((a, r) => ({
    count: a.count + r.count,
    userSecs: a.userSecs + r.userSecs,
    actualSecs: a.actualSecs + r.actualSecs,
    reviewerSecs: a.reviewerSecs + r.reviewerSecs,
    bn: a.bn + r.bn,
    reviewed: a.reviewed + r.reviewed,
  }), { count: 0, userSecs: 0, actualSecs: 0, reviewerSecs: 0, bn: 0, reviewed: 0 }), [summaryRows]);

  // Per-reviewer summary over the separately-filtered reviewer task set.
  const reviewerRows = useMemo(() => {
    const map = new Map();
    for (const t of reviewerTasks) {
      if (!t.reviewer_name) continue;
      const k = t.reviewer_name;
      if (!map.has(k)) map.set(k, { reviewer: k, count: 0, reviewerSecs: 0, actualSecs: 0, bn: 0, reviewed: 0 });
      const r = map.get(k);
      r.count++;
      r.reviewerSecs += t.review_duration_seconds || 0;
      r.actualSecs += t.review_seconds || 0;
      if (t.size_category === 'BN') r.bn++;
      if (t.reviewed_at) r.reviewed++;
    }
    return [...map.values()].sort((a, b) => a.reviewer.localeCompare(b.reviewer));
  }, [reviewerTasks]);

  // Reviewers available for the reviewer filter dropdown.
  const reviewerOptions = useMemo(
    () => allUsers.filter(u => u.role === 'reviewer'),
    [allUsers],
  );

  // Review-outcome distribution over the filtered reviewer task set (for the pie chart).
  const outcomePieData = useMemo(() => {
    const c = { closed_out: 0, stuck: 0, ier: 0 };
    for (const t of reviewerTasks) if (t.review_outcome in c) c[t.review_outcome]++;
    return [
      { label: 'Closed Out', value: c.closed_out, color: '#10b981' },
      { label: 'Stuck',      value: c.stuck,      color: '#ef4444' },
      { label: 'IER',        value: c.ier,        color: '#f59e0b' },
    ];
  }, [reviewerTasks]);

  const reviewerTotals = useMemo(() => reviewerRows.reduce((a, r) => ({
    count: a.count + r.count,
    reviewerSecs: a.reviewerSecs + r.reviewerSecs,
    actualSecs: a.actualSecs + r.actualSecs,
    bn: a.bn + r.bn,
    reviewed: a.reviewed + r.reviewed,
  }), { count: 0, reviewerSecs: 0, actualSecs: 0, bn: 0, reviewed: 0 }), [reviewerRows]);

  const fetchProducts = useCallback(() =>
    api.admin.getProducts().then(setProducts).catch(console.error), []);

  const fetchAllUsers = useCallback(() =>
    api.admin.getAllUsers().then(setAllUsers).catch(console.error), []);

  const fetchData = useCallback(async (f) => {
    try {
      const [t, s] = await Promise.all([api.admin.getTasks(f), api.admin.getSummary()]);
      setTasks(t);
      setSummary(s);
    } catch (err) {
      console.error(err);
    }
  }, []);

  const fetchReviewerData = useCallback(async (f) => {
    try {
      setReviewerTasks(await api.admin.getReviewerTasks(f));
    } catch (err) {
      console.error(err);
    }
  }, []);

  useEffect(() => {
    api.admin.getUsers().then(setUsers).catch(console.error);
    fetchProducts();
    fetchAllUsers();
    fetchData(EMPTY_FILTERS);
    fetchReviewerData(EMPTY_REVIEWER_FILTERS);
    const timer = setInterval(() => tick(n => n + 1), 30_000);
    return () => clearInterval(timer);
  }, [fetchData, fetchReviewerData, fetchProducts, fetchAllUsers]);

  async function handleSetRole(id, role) {
    setRoleBusy(id);
    try {
      await api.admin.setUserRole(id, role);
      await fetchAllUsers();
    } catch (err) {
      alert(err.message);
    } finally {
      setRoleBusy(null);
    }
  }

  async function handleSetCanTasks(id, can_do_tasks) {
    setRoleBusy(id);
    try {
      await api.admin.setCanTasks(id, can_do_tasks);
      await fetchAllUsers();
    } catch (err) {
      alert(err.message);
    } finally {
      setRoleBusy(null);
    }
  }

  async function handleDeleteUser(id, name) {
    if (!window.confirm(`Delete user "${name}"? This permanently removes the account and cannot be undone.`)) return;
    setRoleBusy(id);
    try {
      await api.admin.deleteUser(id);
      await fetchAllUsers();
      api.admin.getUsers().then(setUsers).catch(console.error);
    } catch (err) {
      alert(err.message);
    } finally {
      setRoleBusy(null);
    }
  }

  async function handleSetTaskLimit(id, value) {
    setRoleBusy(id);
    try {
      await api.admin.setTaskLimit(id, value === '' ? null : Number(value));
      await fetchAllUsers();
    } catch (err) {
      alert(err.message);
    } finally {
      setRoleBusy(null);
    }
  }

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

  function handleReviewerChange(e) {
    setReviewerFilters(f => ({ ...f, [e.target.name]: e.target.value }));
  }

  function handleReviewerApply(e) {
    e.preventDefault();
    fetchReviewerData(reviewerFilters);
  }

  function handleReviewerClear() {
    setReviewerFilters(EMPTY_REVIEWER_FILTERS);
    fetchReviewerData(EMPTY_REVIEWER_FILTERS);
  }

  function toLocalInput(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function openEdit(task) {
    setEditingTask(task);
    setEditForm({
      product:       task.product,
      qr_no:         task.qr_no,
      status_field:  task.status_field,
      task_status:   task.task_status,
      stuck_reason:  task.stuck_reason || '',
      started_at:    toLocalInput(task.started_at),
      stopped_at:    toLocalInput(task.stopped_at),
      paused_hms:    task.paused_time || '00:00:00',
      size_category: task.size_category || '',
      review_hms:    task.review_seconds != null ? formatDuration(task.review_seconds) : '',
      reviewer_name: task.reviewer_name || '',
      review_started_at: toLocalInput(task.review_first_started_at),
      review_ended_at:   toLocalInput(task.review_ended_at),
      review_paused_hms: formatDuration(task.review_paused_seconds || 0),
      review_reason: task.review_reason || '',
      review_rework_reason: task.review_rework_reason || '',
    });
    setEditError('');
  }

  async function handleEditSave() {
    setEditLoading(true);
    setEditError('');
    try {
      const toISO = val => val ? new Date(val).toISOString() : null;
      const startISO = toISO(editForm.started_at);
      const stopISO  = toISO(editForm.stopped_at);
      if (startISO && stopISO && new Date(startISO) > new Date(stopISO)) {
        setEditError('Start time must be earlier than or equal to end time.');
        setEditLoading(false);
        return;
      }
      const hmsToSecs = hms => {
        const p = (hms || '').split(':').map(Number);
        return (p[0] || 0) * 3600 + (p[1] || 0) * 60 + (p[2] || 0);
      };
      const pausedSecs = hmsToSecs(editForm.paused_hms);
      if (startISO && stopISO) {
        const totalSecs = Math.floor((new Date(stopISO) - new Date(startISO)) / 1000);
        if (pausedSecs > totalSecs) {
          const fmt = s => `${String(Math.floor(s/3600)).padStart(2,'0')}:${String(Math.floor((s%3600)/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
          setEditError(`Pause time (${editForm.paused_hms}) exceeds total duration (${fmt(totalSecs)}). Pause must be less than or equal to end − start.`);
          setEditLoading(false);
          return;
        }
      }
      if (editForm.review_started_at && editForm.review_ended_at &&
          new Date(editForm.review_started_at) > new Date(editForm.review_ended_at)) {
        setEditError('Review start time must be earlier than or equal to review end time.');
        setEditLoading(false);
        return;
      }
      await api.admin.editTask(editingTask.id, {
        ...editForm,
        stuck_reason:         editForm.stuck_reason  || null,
        started_at:           startISO,
        stopped_at:           stopISO,
        total_paused_seconds: hmsToSecs(editForm.paused_hms),
        review_seconds:          editForm.review_hms?.trim()   ? hmsToSecs(editForm.review_hms)   : null,
        review_reason:           editForm.review_reason?.trim() || null,
        review_rework_reason:    editForm.review_rework_reason?.trim() || null,
        reviewer_name:           editForm.reviewer_name?.trim() || null,
        review_started_at:       editForm.review_started_at ? new Date(editForm.review_started_at).toISOString() : null,
        review_ended_at:         editForm.review_ended_at   ? new Date(editForm.review_ended_at).toISOString()   : null,
        review_paused_seconds:   hmsToSecs(editForm.review_paused_hms || '00:00:00'),
      });
      setEditingTask(null);
      fetchData(filters);
    } catch (err) {
      setEditError(err.message);
    } finally {
      setEditLoading(false);
    }
  }

  async function handleResetReview() {
    if (!window.confirm('Reset all review data (times, reasons, reviewer) for this task?')) return;
    setEditLoading(true);
    setEditError('');
    try {
      await api.admin.resetReview(editingTask.id);
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

  function downloadExcel() {
    const taskHeaders = ['User', 'Product', 'QR No', 'Session Type', 'Session No', 'State', 'Started', 'Stopped', 'User Time', 'Paused Time', 'Auto-paused', 'Quote Size', 'Actual Time', 'Reviewer Time', 'Review Status', 'Status Reason', 'Review Start', 'Review End', 'BN Reason', 'Rework Reason', 'Reviewer'];
    const taskRows = tasks.map(t => [
      t.user_name,
      t.product,
      t.qr_no,
      t.status_field,
      `S${t.session_number}`,
      t.task_status,
      t.started_at ? new Date(t.started_at).toLocaleString() : '',
      t.stopped_at ? new Date(t.stopped_at).toLocaleString() : '',
      formatDuration(getLiveSeconds(t)),
      formatDuration(t.total_paused_seconds || 0),
      t.was_auto_paused ? 'Yes' : 'No',
      t.size_category || '',
      t.review_seconds != null ? formatDuration(t.review_seconds) : '',
      t.review_duration_seconds != null ? formatDuration(t.review_duration_seconds) : '',
      reviewStatus(t),
      t.review_outcome_reason || '',
      t.review_first_started_at ? new Date(t.review_first_started_at).toLocaleString() : '',
      t.review_ended_at ? new Date(t.review_ended_at).toLocaleString() : '',
      t.review_reason || '',
      t.review_rework_reason || '',
      t.reviewer_name || '',
    ]);

    const sumHeaders = ['User', 'Tasks', 'User Time', 'Actual Time', 'Reviewer Time', 'BN', 'Reviewed'];
    const sumBody = summaryRows.map(r => [
      r.user, r.count, formatDuration(r.userSecs), formatDuration(r.actualSecs), formatDuration(r.reviewerSecs), r.bn, r.reviewed,
    ]);
    const totalRow = ['Total', summaryTotals.count, formatDuration(summaryTotals.userSecs), formatDuration(summaryTotals.actualSecs), formatDuration(summaryTotals.reviewerSecs), summaryTotals.bn, summaryTotals.reviewed];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([taskHeaders, ...taskRows]), 'Tasks');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([sumHeaders, ...sumBody, totalRow]), 'Summary');
    XLSX.writeFile(wb, `es-qr-tracker-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  function downloadReviewerExcel() {
    // Per-review detail rows from the separately-filtered reviewer task set.
    const detailHeaders = ['Reviewer', 'User', 'Product', 'QR No', 'Session Type', 'State', 'Reviewer Time', 'Actual Time', 'Quote Size', 'Review Status', 'Status Reason', 'Review Start', 'Review End', 'BN Reason', 'Rework Reason', 'Reviewed At'];
    const detailRows = reviewerTasks.map(t => [
      t.reviewer_name,
      t.user_name,
      t.product,
      t.qr_no,
      t.status_field,
      t.task_status,
      t.review_duration_seconds != null ? formatDuration(t.review_duration_seconds) : '',
      t.review_seconds != null ? formatDuration(t.review_seconds) : '',
      t.size_category || '',
      reviewStatus(t),
      t.review_outcome_reason || '',
      t.review_first_started_at ? new Date(t.review_first_started_at).toLocaleString() : '',
      t.review_ended_at ? new Date(t.review_ended_at).toLocaleString() : '',
      t.review_reason || '',
      t.review_rework_reason || '',
      t.reviewed_at ? new Date(t.reviewed_at).toLocaleString() : '',
    ]);

    const sumHeaders = ['Reviewer', 'Reviews', 'Reviewer Time', 'Actual Time', 'BN', 'Reviewed'];
    const sumBody = reviewerRows.map(r => [
      r.reviewer, r.count, formatDuration(r.reviewerSecs), formatDuration(r.actualSecs), r.bn, r.reviewed,
    ]);
    const totalRow = ['Total', reviewerTotals.count, formatDuration(reviewerTotals.reviewerSecs), formatDuration(reviewerTotals.actualSecs), reviewerTotals.bn, reviewerTotals.reviewed];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([detailHeaders, ...detailRows]), 'Reviews');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([sumHeaders, ...sumBody, totalRow]), 'Reviewer Summary');
    XLSX.writeFile(wb, `es-qr-reviewers-${new Date().toISOString().slice(0, 10)}.xlsx`);
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
            <h3 style={{ marginBottom: 8 }}>Reviews by reviewer</h3>
            <table style={{ borderCollapse: 'collapse' }}>
              <thead><tr><th style={TH}>Reviewer</th><th style={TH}>Count</th></tr></thead>
              <tbody>
                {(summary.byReviewer ?? []).length === 0 && (
                  <tr><td style={TD} colSpan={2}>—</td></tr>
                )}
                {(summary.byReviewer ?? []).map(r => (
                  <tr key={r.reviewer_name}>
                    <td style={TD}>{r.reviewer_name}</td>
                    <td style={{ ...TD, fontWeight: 600 }}>{r.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

        </div>
      </section>

      {/* Users & Roles */}
      <section style={{ marginBottom: 32 }}>
        <h2 style={{ marginBottom: 12 }}>Users &amp; Roles</h2>
        <p style={{ fontSize: 12, color: '#777', marginBottom: 10 }}>
          Grant a user reviewer access, or revoke it. Reviewers can review every user's tasks.
        </p>
        <table style={{ borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr>{['Name', 'Email', 'Role', ''].map((h, i) => <th key={i} style={TH}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {allUsers.map(u => (
              <tr key={u.id}>
                <td style={TD}>{u.name}</td>
                <td style={TD}>{u.email}</td>
                <td style={{ ...TD, textTransform: 'capitalize' }}>{u.role}</td>
                <td style={TD}>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                    {u.role === 'admin' ? (
                      <span style={{ color: '#999', fontSize: 12 }}>—</span>
                    ) : u.role === 'reviewer' ? (
                      <>
                        <button
                          onClick={() => handleSetRole(u.id, 'user')}
                          disabled={roleBusy === u.id}
                          style={{ fontSize: 12, padding: '2px 8px' }}
                        >
                          {roleBusy === u.id ? '…' : 'Make User'}
                        </button>
                        <button
                          onClick={() => handleSetCanTasks(u.id, !u.can_do_tasks)}
                          disabled={roleBusy === u.id}
                          style={{ fontSize: 12, padding: '2px 8px' }}
                          title="Allow this reviewer to also perform user tasks"
                        >
                          {roleBusy === u.id ? '…' : u.can_do_tasks ? '✓ Can do tasks' : 'Allow tasks'}
                        </button>
                        <select
                          value={u.task_limit ?? ''}
                          onChange={e => handleSetTaskLimit(u.id, e.target.value)}
                          disabled={roleBusy === u.id}
                          style={{ fontSize: 12, padding: '2px 4px' }}
                          title="Max concurrent open reviews this reviewer can hold"
                        >
                          <option value="">No review limit</option>
                          {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>Review limit {n}</option>)}
                        </select>
                      </>
                    ) : (
                      <button
                        onClick={() => handleSetRole(u.id, 'reviewer')}
                        disabled={roleBusy === u.id}
                        style={{ fontSize: 12, padding: '2px 8px' }}
                      >
                        {roleBusy === u.id ? '…' : 'Make Reviewer'}
                      </button>
                    )}
                    {u.role !== 'admin' && (
                      <button
                        onClick={() => handleDeleteUser(u.id, u.name)}
                        disabled={roleBusy === u.id}
                        style={{ fontSize: 12, padding: '2px 8px', color: '#c53030', marginLeft: 4 }}
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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
              <option value="stuck">Stuck</option>
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

      {/* Filtered summary */}
      <section style={{ marginBottom: 28 }}>
        <h2 style={{ marginBottom: 12 }}>Users — Summary (filtered)</h2>
        <h3 style={{ margin: '0 0 8px', fontSize: 14, color: '#555' }}>Tasks by state</h3>
        <div style={{ marginBottom: 20 }}>
          <StatePie data={statePieData} />
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>{['User', 'Tasks', 'User Time', 'Actual Time', 'Reviewer Time', 'BN', 'Reviewed'].map((h, i) =>
                <th key={i} style={TH}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {summaryRows.length === 0 && (
                <tr><td colSpan={7} style={{ ...TD, color: '#888' }}>No tasks.</td></tr>
              )}
              {summaryRows.map(r => (
                <tr key={r.user}>
                  <td style={TD}>{r.user}</td>
                  <td style={TD}>{r.count}</td>
                  <td style={TD}>{formatDuration(r.userSecs)}</td>
                  <td style={TD}>{formatDuration(r.actualSecs)}</td>
                  <td style={TD}>{formatDuration(r.reviewerSecs)}</td>
                  <td style={TD}>{r.bn}</td>
                  <td style={TD}>{r.reviewed}</td>
                </tr>
              ))}
              {summaryRows.length > 0 && (
                <tr style={{ fontWeight: 600, background: '#f4f4f4' }}>
                  <td style={TD}>Total</td>
                  <td style={TD}>{summaryTotals.count}</td>
                  <td style={TD}>{formatDuration(summaryTotals.userSecs)}</td>
                  <td style={TD}>{formatDuration(summaryTotals.actualSecs)}</td>
                  <td style={TD}>{formatDuration(summaryTotals.reviewerSecs)}</td>
                  <td style={TD}>{summaryTotals.bn}</td>
                  <td style={TD}>{summaryTotals.reviewed}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Tasks table */}
      <section>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h2>Tasks ({tasks.length})</h2>
          <button onClick={downloadExcel} disabled={tasks.length === 0}>Download Excel</button>
        </div>
        <div style={SCROLL_BOX}>
          <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
            <thead>
              <tr>
                {[
                  'User', 'Product', 'QR No', 'Session Type', 'Session No', 'State',
                  'Started', 'Stopped', 'User Time', 'Paused Time', 'Auto-paused',
                  'Quote Size', 'Actual Time', 'Reviewer Time', 'Review Status', 'Status Reason', 'Review Start', 'Review End',
                  'BN Reason', 'Rework Reason', 'Reviewer', '',
                ].map((h, i) => <th key={i} style={TH_STICKY}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {tasks.length === 0 && (
                <tr>
                  <td colSpan={22} style={{ ...TD, color: '#888' }}>No tasks found.</td>
                </tr>
              )}
              {tasks.map(task => (
                <tr key={task.id}>
                  <td style={TD}>{task.user_name}</td>
                  <td style={TD}>{task.product}</td>
                  <td style={TD}>{task.qr_no}</td>
                  <td style={TD}>{task.status_field}</td>
                  <td style={TD}>S{task.session_number}</td>
                  <td style={TD}>{task.task_status}</td>
                  <td style={TD}>{task.started_at ? new Date(task.started_at).toLocaleString() : '—'}</td>
                  <td style={TD}>{task.stopped_at ? new Date(task.stopped_at).toLocaleString() : '—'}</td>
                  <td style={{ ...TD, fontWeight: 500 }}>{formatDuration(getLiveSeconds(task))}</td>
                  <td style={TD}>{formatDuration(task.total_paused_seconds || 0)}</td>
                  <td style={TD}>{task.was_auto_paused ? 'Yes' : 'No'}</td>
                  <td style={TD}>{task.size_category || '—'}</td>
                  <td style={TD}>{task.review_seconds != null ? formatDuration(task.review_seconds) : '—'}</td>
                  <td style={TD}>{task.review_duration_seconds != null ? formatDuration(task.review_duration_seconds) : '—'}</td>
                  <td style={{ ...TD, color: REVIEW_STATUS_COLOR[reviewStatus(task)], fontWeight: 500 }}>{reviewStatus(task)}</td>
                  <td style={{ ...TD, maxWidth: 200, whiteSpace: 'normal' }}>{task.review_outcome_reason || '—'}</td>
                  <td style={TD}>{fmtDT(task.review_first_started_at)}</td>
                  <td style={TD}>{fmtDT(task.review_ended_at)}</td>
                  <td style={{ ...TD, maxWidth: 200, whiteSpace: 'normal' }}>{task.review_reason || '—'}</td>
                  <td style={{ ...TD, maxWidth: 200, whiteSpace: 'normal' }}>{task.review_rework_reason || '—'}</td>
                  <td style={TD}>{task.reviewer_name || '—'}</td>
                  <td style={TD}>
                    <button onClick={() => openEdit(task)} style={{ fontSize: 12, padding: '2px 8px' }}>Edit</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Reviewers — separate filters + table */}
      <section style={{ marginTop: 40 }}>
        <h2 style={{ marginBottom: 12 }}>Reviewers</h2>

        <form onSubmit={handleReviewerApply} style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 16 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, marginBottom: 3 }}>Reviewer</label>
            <select name="reviewer_id" value={reviewerFilters.reviewer_id} onChange={handleReviewerChange} style={{ width: 160 }}>
              <option value="">All reviewers</option>
              {reviewerOptions.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, marginBottom: 3 }}>Product</label>
            <input name="product" value={reviewerFilters.product} onChange={handleReviewerChange} placeholder="Filter…" style={{ width: 150 }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, marginBottom: 3 }}>QR No</label>
            <input name="qr_no" value={reviewerFilters.qr_no} onChange={handleReviewerChange} placeholder="Filter…" style={{ width: 120 }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, marginBottom: 3 }}>Reviewed</label>
            <select name="reviewed" value={reviewerFilters.reviewed} onChange={handleReviewerChange} style={{ width: 120 }}>
              <option value="">All</option>
              <option value="yes">Reviewed</option>
              <option value="no">Not reviewed</option>
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, marginBottom: 3 }}>From</label>
            <input type="date" name="date_from" value={reviewerFilters.date_from} onChange={handleReviewerChange} style={{ width: 145 }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, marginBottom: 3 }}>To</label>
            <input type="date" name="date_to" value={reviewerFilters.date_to} onChange={handleReviewerChange} style={{ width: 145 }} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="submit">Apply</button>
            <button type="button" onClick={handleReviewerClear}>Clear</button>
          </div>
        </form>

        <h3 style={{ margin: '0 0 8px', fontSize: 14, color: '#555' }}>Review outcomes</h3>
        <div style={{ marginBottom: 20 }}>
          <StatePie data={outcomePieData} />
        </div>

        <h3 style={{ margin: '0 0 8px', fontSize: 14, color: '#555' }}>Reviewer Summary</h3>
        <div style={{ overflowX: 'auto', marginBottom: 20 }}>
          <table style={{ borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>{['Reviewer', 'Reviews', 'Reviewer Time', 'Actual Time', 'BN', 'Reviewed'].map((h, i) =>
                <th key={i} style={TH}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {reviewerRows.length === 0 && (
                <tr><td colSpan={6} style={{ ...TD, color: '#888' }}>No reviewer tasks.</td></tr>
              )}
              {reviewerRows.map(r => (
                <tr key={r.reviewer}>
                  <td style={TD}>{r.reviewer}</td>
                  <td style={TD}>{r.count}</td>
                  <td style={TD}>{formatDuration(r.reviewerSecs)}</td>
                  <td style={TD}>{formatDuration(r.actualSecs)}</td>
                  <td style={TD}>{r.bn}</td>
                  <td style={TD}>{r.reviewed}</td>
                </tr>
              ))}
              {reviewerRows.length > 0 && (
                <tr style={{ fontWeight: 600, background: '#f4f4f4' }}>
                  <td style={TD}>Total</td>
                  <td style={TD}>{reviewerTotals.count}</td>
                  <td style={TD}>{formatDuration(reviewerTotals.reviewerSecs)}</td>
                  <td style={TD}>{formatDuration(reviewerTotals.actualSecs)}</td>
                  <td style={TD}>{reviewerTotals.bn}</td>
                  <td style={TD}>{reviewerTotals.reviewed}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h3 style={{ fontSize: 14, color: '#555' }}>Reviewed Tasks ({reviewerTasks.length})</h3>
          <button onClick={downloadReviewerExcel} disabled={reviewerTasks.length === 0}>Download Reviewer Data</button>
        </div>
        <div style={SCROLL_BOX}>
          <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
            <thead>
              <tr>
                {[
                  'Reviewer', 'User', 'Product', 'QR No', 'Session Type', 'State',
                  'Reviewer Time', 'Actual Time', 'Quote Size', 'Review Status', 'Status Reason',
                  'Review Start', 'Review End', 'BN Reason', 'Rework Reason', 'Reviewed At',
                ].map((h, i) => <th key={i} style={TH_STICKY}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {reviewerTasks.length === 0 && (
                <tr><td colSpan={16} style={{ ...TD, color: '#888' }}>No reviewer tasks found.</td></tr>
              )}
              {reviewerTasks.map(task => (
                <tr key={task.id}>
                  <td style={TD}>{task.reviewer_name}</td>
                  <td style={TD}>{task.user_name}</td>
                  <td style={TD}>{task.product}</td>
                  <td style={TD}>{task.qr_no}</td>
                  <td style={TD}>{task.status_field}</td>
                  <td style={TD}>{task.task_status}</td>
                  <td style={TD}>{task.review_duration_seconds != null ? formatDuration(task.review_duration_seconds) : '—'}</td>
                  <td style={TD}>{task.review_seconds != null ? formatDuration(task.review_seconds) : '—'}</td>
                  <td style={TD}>{task.size_category || '—'}</td>
                  <td style={{ ...TD, color: REVIEW_STATUS_COLOR[reviewStatus(task)], fontWeight: 500 }}>{reviewStatus(task)}</td>
                  <td style={{ ...TD, maxWidth: 200, whiteSpace: 'normal' }}>{task.review_outcome_reason || '—'}</td>
                  <td style={TD}>{fmtDT(task.review_first_started_at)}</td>
                  <td style={TD}>{fmtDT(task.review_ended_at)}</td>
                  <td style={{ ...TD, maxWidth: 200, whiteSpace: 'normal' }}>{task.review_reason || '—'}</td>
                  <td style={{ ...TD, maxWidth: 200, whiteSpace: 'normal' }}>{task.review_rework_reason || '—'}</td>
                  <td style={TD}>{fmtDT(task.reviewed_at)}</td>
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
                <option value="stuck">Stuck</option>
                <option value="stopped">Stopped</option>
                <option value="uploaded">Uploaded</option>
              </select>
            </div>

            <div className="form-group">
              <label>Stuck Reason</label>
              <textarea rows={2} value={editForm.stuck_reason} onChange={e => setEditForm(f => ({ ...f, stuck_reason: e.target.value }))} />
            </div>

            <div className="form-group">
              <label>Start Time</label>
              <input
                type="datetime-local"
                value={editForm.started_at}
                onChange={e => setEditForm(f => ({ ...f, started_at: e.target.value }))}
              />
            </div>

            <div className="form-group">
              <label>End Time</label>
              <input
                type="datetime-local"
                value={editForm.stopped_at}
                onChange={e => setEditForm(f => ({ ...f, stopped_at: e.target.value }))}
              />
            </div>

            <div className="form-group">
              <label>Pause Time (HH:MM:SS)</label>
              <input
                value={editForm.paused_hms}
                onChange={e => setEditForm(f => ({ ...f, paused_hms: e.target.value }))}
                placeholder="00:00:00"
              />
            </div>

            {(editForm.started_at && editForm.stopped_at) && (
              <p style={{ fontSize: 12, color: '#666', marginBottom: 12 }}>
                Active time = (end − start) − pause time.
              </p>
            )}

            <div style={{ borderTop: '1px solid #eee', margin: '8px 0 14px', paddingTop: 12 }}>
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10 }}>Review</div>

              <div className="form-group">
                <label>Quote Size</label>
                <select
                  value={editForm.size_category}
                  onChange={e => setEditForm(f => ({ ...f, size_category: e.target.value }))}
                >
                  <option value="">— None —</option>
                  <option value="BN">BN</option>
                </select>
              </div>

              <div className="form-group">
                <label>Reviewer Name</label>
                <input
                  value={editForm.reviewer_name}
                  onChange={e => setEditForm(f => ({ ...f, reviewer_name: e.target.value }))}
                  placeholder="—"
                />
              </div>

              <div className="form-group">
                <label>Actual Time (HH:MM:SS)</label>
                <input
                  value={editForm.review_hms}
                  onChange={e => setEditForm(f => ({ ...f, review_hms: e.target.value }))}
                  placeholder="—"
                />
              </div>

              <div className="form-group">
                <label>Review Start Time</label>
                <input
                  type="datetime-local"
                  value={editForm.review_started_at}
                  onChange={e => setEditForm(f => ({ ...f, review_started_at: e.target.value }))}
                />
              </div>

              <div className="form-group">
                <label>Review End Time</label>
                <input
                  type="datetime-local"
                  value={editForm.review_ended_at}
                  onChange={e => setEditForm(f => ({ ...f, review_ended_at: e.target.value }))}
                />
              </div>

              <div className="form-group">
                <label>Review Pause Time (HH:MM:SS)</label>
                <input
                  value={editForm.review_paused_hms}
                  onChange={e => setEditForm(f => ({ ...f, review_paused_hms: e.target.value }))}
                  placeholder="00:00:00"
                />
              </div>

              {(editForm.review_started_at && editForm.review_ended_at) && (
                <p style={{ fontSize: 12, color: '#666', marginBottom: 12 }}>
                  Reviewer Time = (end − start) − pause time.
                </p>
              )}

              <div className="form-group">
                <label>BN Reason</label>
                <textarea
                  rows={2}
                  value={editForm.review_reason}
                  onChange={e => setEditForm(f => ({ ...f, review_reason: e.target.value }))}
                />
              </div>

              <div className="form-group">
                <label>Rework Reason</label>
                <textarea
                  rows={2}
                  value={editForm.review_rework_reason}
                  onChange={e => setEditForm(f => ({ ...f, review_rework_reason: e.target.value }))}
                />
              </div>
            </div>

            {editError && <p style={{ color: '#b00', fontSize: 13, marginBottom: 12 }}>{editError}</p>}

            <div style={{ display: 'flex', gap: 8, marginTop: 4, alignItems: 'center' }}>
              <button onClick={handleEditSave} disabled={editLoading}>{editLoading ? 'Saving…' : 'Save'}</button>
              <button onClick={() => setEditingTask(null)}>Cancel</button>
              <button
                onClick={handleResetReview}
                disabled={editLoading}
                style={{ marginLeft: 'auto', color: '#c53030' }}
              >
                Reset Review
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
