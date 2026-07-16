const router = require('express').Router();
const pool = require('../db');
const { authenticate, requireUser } = require('../middleware/auth');

router.use(authenticate);
router.use(requireUser);

async function secondsSinceLastResume(client, taskId) {
  const { rows } = await client.query(
    `SELECT created_at FROM task_events
     WHERE task_id = $1 AND event_type IN ('start', 'resume')
     ORDER BY created_at DESC LIMIT 1`,
    [taskId]
  );
  if (!rows.length) return 0;
  return Math.max(0, Math.floor((Date.now() - new Date(rows[0].created_at).getTime()) / 1000));
}

async function secondsSinceLastPause(client, taskId) {
  const { rows } = await client.query(
    `SELECT created_at FROM task_events
     WHERE task_id = $1 AND event_type = 'pause'
     ORDER BY created_at DESC LIMIT 1`,
    [taskId]
  );
  if (!rows.length) return 0;
  return Math.max(0, Math.floor((Date.now() - new Date(rows[0].created_at).getTime()) / 1000));
}

async function pauseTask(client, taskId, isAuto) {
  const elapsed = await secondsSinceLastResume(client, taskId);
  await client.query(
    `UPDATE tasks SET
       task_status = 'work in progress',
       was_auto_paused = (was_auto_paused OR $1),
       total_active_seconds = total_active_seconds + $2,
       updated_at = NOW()
     WHERE id = $3`,
    [isAuto, elapsed, taskId]
  );
  await client.query(
    `INSERT INTO task_events (task_id, event_type, note) VALUES ($1, 'pause', $2)`,
    [taskId, isAuto ? 'Auto-paused' : null]
  );
}

const TASK_WITH_RESUME = `
  SELECT t.*,
    (SELECT created_at FROM task_events
     WHERE task_id = t.id AND event_type IN ('start', 'resume')
     ORDER BY created_at DESC LIMIT 1) AS last_resume_at
  FROM tasks t
`;

// GET /api/tasks
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `${TASK_WITH_RESUME} WHERE t.user_id = $1 ORDER BY t.created_at DESC`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/tasks — create & start; auto-pause any active task
router.post('/', async (req, res) => {
  const { product, qr_no, status_field } = req.body;
  if (!product || !qr_no || !status_field) {
    return res.status(400).json({ error: 'product, qr_no, and status_field are required' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: active } = await client.query(
      `SELECT id FROM tasks WHERE user_id = $1 AND task_status = 'working'`,
      [req.user.id]
    );
    let autoPaused = false;
    if (active.length) {
      await pauseTask(client, active[0].id, true);
      autoPaused = true;
    }

    const { rows: countRows } = await client.query(
      `SELECT COUNT(*) FROM tasks WHERE qr_no = $1 AND status_field = $2`,
      [qr_no, status_field]
    );
    const sessionNumber = parseInt(countRows[0].count) + 1;

    const { rows } = await client.query(
      `INSERT INTO tasks (user_id, product, qr_no, status_field, task_status, session_number, started_at)
       VALUES ($1, $2, $3, $4, 'working', $5, NOW())
       RETURNING *`,
      [req.user.id, product, qr_no, status_field, sessionNumber]
    );
    const task = rows[0];
    await client.query(
      `INSERT INTO task_events (task_id, event_type) VALUES ($1, 'start')`,
      [task.id]
    );

    await client.query('COMMIT');
    res.json({ task: { ...task, last_resume_at: task.started_at }, autoPaused });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

// PATCH /api/tasks/:id/pause
router.patch('/:id/pause', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT id FROM tasks WHERE id = $1 AND user_id = $2 AND task_status = 'working'`,
      [req.params.id, req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Active task not found' });

    await pauseTask(client, req.params.id, false);
    const { rows: updated } = await client.query(
      `${TASK_WITH_RESUME} WHERE t.id = $1`, [req.params.id]
    );
    await client.query('COMMIT');
    res.json(updated[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

// PATCH /api/tasks/:id/resume
router.patch('/:id/resume', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT id FROM tasks WHERE id = $1 AND user_id = $2 AND task_status IN ('work in progress', 'stuck')`,
      [req.params.id, req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Paused task not found' });

    const { rows: active } = await client.query(
      `SELECT id FROM tasks WHERE user_id = $1 AND task_status = 'working'`,
      [req.user.id]
    );
    let autoPaused = false;
    if (active.length) {
      await pauseTask(client, active[0].id, true);
      autoPaused = true;
    }

    const pausedElapsed = await secondsSinceLastPause(client, req.params.id);
    await client.query(
      `UPDATE tasks SET task_status = 'working', total_paused_seconds = total_paused_seconds + $1, updated_at = NOW() WHERE id = $2`,
      [pausedElapsed, req.params.id]
    );
    await client.query(
      `INSERT INTO task_events (task_id, event_type) VALUES ($1, 'resume')`,
      [req.params.id]
    );

    const { rows: updated } = await client.query(
      `${TASK_WITH_RESUME} WHERE t.id = $1`, [req.params.id]
    );
    await client.query('COMMIT');
    res.json({ task: updated[0], autoPaused });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

// PATCH /api/tasks/:id/stuck-reason — logs reason, pauses task awaiting resume
router.patch('/:id/stuck-reason', async (req, res) => {
  const { reason } = req.body;
  if (!reason?.trim()) return res.status(400).json({ error: 'Reason required' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT id FROM tasks WHERE id = $1 AND user_id = $2 AND task_status = 'stopped'`,
      [req.params.id, req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Stopped task not found' });

    await client.query(
      `UPDATE tasks SET stuck_reason = $1, task_status = 'stuck', updated_at = NOW() WHERE id = $2`,
      [reason.trim(), req.params.id]
    );
    await client.query(
      `INSERT INTO task_events (task_id, event_type, note) VALUES ($1, 'stuck_reason', $2)`,
      [req.params.id, reason.trim()]
    );

    const { rows: updated } = await client.query(
      `${TASK_WITH_RESUME} WHERE t.id = $1`, [req.params.id]
    );
    await client.query('COMMIT');
    res.json(updated[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

// PATCH /api/tasks/:id/stop
router.patch('/:id/stop', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT * FROM tasks WHERE id = $1 AND user_id = $2 AND task_status = 'working'`,
      [req.params.id, req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Active task not found' });

    const elapsed = await secondsSinceLastResume(client, req.params.id);
    await client.query(
      `UPDATE tasks SET
         task_status = 'stopped',
         stopped_at = NOW(),
         total_active_seconds = total_active_seconds + $1,
         updated_at = NOW()
       WHERE id = $2`,
      [elapsed, req.params.id]
    );
    await client.query(
      `INSERT INTO task_events (task_id, event_type) VALUES ($1, 'stop')`,
      [req.params.id]
    );

    const { rows: updated } = await client.query(
      `${TASK_WITH_RESUME} WHERE t.id = $1`, [req.params.id]
    );
    await client.query('COMMIT');
    res.json(updated[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

// PATCH /api/tasks/:id/unstop — undo an accidental stop, returns task to working
router.patch('/:id/unstop', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT id FROM tasks WHERE id = $1 AND user_id = $2 AND task_status = 'stopped'`,
      [req.params.id, req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Stopped task not found' });

    await client.query(
      `UPDATE tasks SET task_status = 'working', stopped_at = NULL, updated_at = NOW() WHERE id = $1`,
      [req.params.id]
    );
    await client.query(
      `INSERT INTO task_events (task_id, event_type, note) VALUES ($1, 'resume', 'Resumed after accidental stop')`,
      [req.params.id]
    );

    const { rows: updated } = await client.query(
      `${TASK_WITH_RESUME} WHERE t.id = $1`, [req.params.id]
    );
    await client.query('COMMIT');
    res.json(updated[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

// GET /api/tasks/:id/qc-items — self-QC checklist for this task's product
router.get('/:id/qc-items', async (req, res) => {
  try {
    const { rows: task } = await pool.query(
      'SELECT product FROM tasks WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    if (!task.length) return res.status(404).json({ error: 'Task not found' });
    const { rows } = await pool.query(
      `SELECT qi.id, qi.label
       FROM qc_items qi JOIN products p ON qi.product_id = p.id
       WHERE p.name = $1
       ORDER BY qi.sort_order, qi.id`,
      [task[0].product]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /api/tasks/:id/complete — self-QC gate, then upload
router.patch('/:id/complete', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT id, product, total_active_seconds FROM tasks WHERE id = $1 AND user_id = $2 AND task_status = 'stopped'`,
      [req.params.id, req.user.id]
    );
    if (!rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Stopped task not found' });
    }
    const task = rows[0];

    // Required self-QC items for this product.
    const { rows: items } = await client.query(
      `SELECT qi.id, qi.label
       FROM qc_items qi JOIN products p ON qi.product_id = p.id
       WHERE p.name = $1`,
      [task.product]
    );

    const checked = Array.isArray(req.body.checked_items) ? req.body.checked_items.map(Number) : [];

    let selfQc = parseInt(req.body.self_qc_seconds, 10);
    if (!Number.isFinite(selfQc) || selfQc < 0) selfQc = 0;
    // Full checklist snapshot: every item with its checked/unchecked state.
    const qcSnapshot = items.map(it => ({ label: it.label, checked: checked.includes(it.id) }));
    const checkedCount = qcSnapshot.filter(x => x.checked).length;
    const totalWithQc = (task.total_active_seconds || 0) + selfQc;

    await client.query(
      `UPDATE tasks SET
         task_status = 'uploaded',
         self_qc_seconds = $2,
         self_qc_items = $3::jsonb,
         total_with_qc_seconds = $4,
         size_category = CASE WHEN total_active_seconds > 18000 THEN 'BN' ELSE size_category END,
         updated_at = NOW()
       WHERE id = $1`,
      [req.params.id, selfQc, JSON.stringify(qcSnapshot), totalWithQc]
    );
    if (items.length) {
      await client.query(
        `INSERT INTO task_events (task_id, event_type, note) VALUES ($1, 'self_qc', $2)`,
        [req.params.id, `${checkedCount}/${items.length} checked, ${selfQc}s`]
      );
    }
    await client.query(
      `INSERT INTO task_events (task_id, event_type) VALUES ($1, 'complete')`,
      [req.params.id]
    );

    const { rows: updated } = await client.query(
      `${TASK_WITH_RESUME} WHERE t.id = $1`, [req.params.id]
    );
    await client.query('COMMIT');
    res.json(updated[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

// DELETE /api/tasks/:id
router.delete('/:id', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      'SELECT id FROM tasks WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Task not found' });
    await client.query('DELETE FROM task_events WHERE task_id = $1', [req.params.id]);
    await client.query('DELETE FROM tasks WHERE id = $1', [req.params.id]);
    await client.query('COMMIT');
    res.json({ message: 'Deleted' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

module.exports = router;
