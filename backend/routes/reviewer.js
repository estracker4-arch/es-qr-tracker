const router = require('express').Router();
const pool = require('../db');
const { authenticate, requireReviewer } = require('../middleware/auth');

router.use(authenticate, requireReviewer);

// GET /api/reviewer/users — people whose tasks can be reviewed (not the reviewer themselves)
router.get('/users', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name FROM users WHERE role IN ('user', 'reviewer') AND id <> $1 ORDER BY name`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/reviewer/tasks — all users' tasks, with reviewer + live-time info
router.get('/tasks', async (req, res) => {
  const { user_id, product, qr_no, reviewed, date_from, date_to } = req.query;
  // Reviewers can only see/review uploaded (completed) tasks — and never their own.
  const conditions = [`t.task_status = 'uploaded'`, `t.user_id <> $1`];
  const params = [req.user.id];
  let i = 2;

  if (user_id)     { conditions.push(`t.user_id = $${i++}`);                          params.push(user_id); }
  if (product)     { conditions.push(`t.product ILIKE $${i++}`);                       params.push(`%${product}%`); }
  if (qr_no)       { conditions.push(`t.qr_no ILIKE $${i++}`);                         params.push(`%${qr_no}%`); }
  if (reviewed === 'yes') { conditions.push(`t.reviewed_at IS NOT NULL`); }
  if (reviewed === 'no')  { conditions.push(`t.reviewed_at IS NULL`); }
  if (date_from)   { conditions.push(`t.created_at >= $${i++}::date`);                 params.push(date_from); }
  if (date_to)     { conditions.push(`t.created_at < $${i++}::date + interval '1 day'`); params.push(date_to); }

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

  try {
    const { rows } = await pool.query(
      `SELECT t.*, u.name AS user_name,
         (SELECT created_at FROM task_events
          WHERE task_id = t.id AND event_type IN ('start', 'resume')
          ORDER BY created_at DESC LIMIT 1) AS last_resume_at
       FROM tasks t
       JOIN users u ON t.user_id = u.id
       ${where}
       ORDER BY t.created_at DESC`,
      params
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /api/reviewer/tasks/:id/review-start — start/resume timer; pauses any other
// running review by this reviewer (one active review at a time).
router.patch('/tasks/:id/review-start', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: existing } = await client.query(
      'SELECT id, user_id, task_status, reviewer_id, reviewer_name FROM tasks WHERE id = $1', [req.params.id]);
    if (!existing.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Task not found' });
    }
    if (existing[0].user_id === req.user.id) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'You cannot review your own task' });
    }
    if (existing[0].task_status !== 'uploaded') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Only uploaded tasks can be reviewed' });
    }
    if (existing[0].reviewer_id && existing[0].reviewer_id !== req.user.id) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: `Already claimed by ${existing[0].reviewer_name}` });
    }

    // Enforce the reviewer's concurrent open-review limit (NULL = unlimited).
    // Only a NEW claim (task not already held by this reviewer) adds to the count.
    if (existing[0].reviewer_id !== req.user.id) {
      const { rows: limRows } = await client.query('SELECT task_limit FROM users WHERE id = $1', [req.user.id]);
      const limit = limRows[0]?.task_limit;
      if (limit != null) {
        const { rows: heldRows } = await client.query(
          `SELECT COUNT(*)::int AS c FROM tasks WHERE reviewer_id = $1 AND reviewed_at IS NULL`,
          [req.user.id]
        );
        if (heldRows[0].c >= limit) {
          await client.query('ROLLBACK');
          return res.status(400).json({
            error: `Review limit reached (${limit}). Finish an open review before claiming another.`,
          });
        }
      }
    }

    // Bank + pause every currently-running review by this reviewer (including this
    // task if it was already running). Accumulates elapsed into the duration.
    await client.query(
      `UPDATE tasks SET
         review_duration_seconds = COALESCE(review_duration_seconds, 0)
           + FLOOR(EXTRACT(EPOCH FROM (NOW() - review_started_at)))::int,
         review_started_at = NULL,
         updated_at = NOW()
       WHERE reviewer_id = $1 AND review_started_at IS NOT NULL AND review_ended_at IS NULL`,
      [req.user.id]
    );

    // Start a fresh run segment on the target task.
    const { rows } = await client.query(
      `UPDATE tasks SET
         review_started_at       = NOW(),
         review_first_started_at = COALESCE(review_first_started_at, NOW()),
         review_ended_at         = NULL,
         reviewer_id             = $1,
         reviewer_name           = $2,
         updated_at              = NOW()
       WHERE id = $3
       RETURNING *`,
      [req.user.id, req.user.name, req.params.id]
    );
    await client.query('COMMIT');
    res.json(rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

// PATCH /api/reviewer/tasks/:id/review-pause — bank current run, pause (resume later)
router.patch('/tasks/:id/review-pause', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `UPDATE tasks SET
         review_duration_seconds = COALESCE(review_duration_seconds, 0)
           + FLOOR(EXTRACT(EPOCH FROM (NOW() - review_started_at)))::int,
         review_started_at = NULL,
         updated_at = NOW()
       WHERE id = $1 AND reviewer_id = $2 AND task_status = 'uploaded'
         AND review_started_at IS NOT NULL AND review_ended_at IS NULL
       RETURNING *`,
      [req.params.id, req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'No running review timer' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /api/reviewer/tasks/:id/review-reset — erase ALL review data (mistaken start)
router.patch('/tasks/:id/review-reset', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `UPDATE tasks SET
         review_seconds          = NULL,
         review_reason           = NULL,
         review_rework_reason    = NULL,
         size_category           = NULL,
         reviewer_id             = NULL,
         reviewer_name           = NULL,
         reviewed_at             = NULL,
         review_started_at       = NULL,
         review_first_started_at = NULL,
         review_ended_at         = NULL,
         review_duration_seconds = NULL,
         review_paused_seconds   = NULL,
         updated_at = NOW()
       WHERE id = $1 AND task_status = 'uploaded' AND (reviewer_id = $2 OR reviewer_id IS NULL)
       RETURNING *`,
      [req.params.id, req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Task not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /api/reviewer/tasks/:id/review — record actual time + reason; ends review timer
router.patch('/tasks/:id/review', async (req, res) => {
  const { review_seconds, review_reason, review_rework_reason, size_category } = req.body;
  const secs = parseInt(review_seconds, 10);
  if (!Number.isFinite(secs) || secs < 0) {
    return res.status(400).json({ error: 'Valid review time required' });
  }
  if (size_category && size_category !== 'BN') {
    return res.status(400).json({ error: 'Invalid size' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: existing } = await client.query('SELECT * FROM tasks WHERE id = $1', [req.params.id]);
    if (!existing.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Task not found' });
    }
    if (existing[0].user_id === req.user.id) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'You cannot review your own task' });
    }
    if (existing[0].task_status !== 'uploaded') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Only uploaded tasks can be reviewed' });
    }
    if (existing[0].reviewer_id && existing[0].reviewer_id !== req.user.id) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: `Already claimed by ${existing[0].reviewer_name}` });
    }

    // User Time over 5h is automatically BN, regardless of selection.
    const effectiveSize = (existing[0].total_active_seconds > 18000) ? 'BN' : (size_category || null);

    // BN reason is required only when the quote is BN.
    if (effectiveSize === 'BN' && !review_reason?.trim()) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'BN reason required' });
    }

    // Bank the current run segment into the accumulated duration, then end.
    const startedAt = existing[0].review_started_at;
    const base = existing[0].review_duration_seconds || 0;
    const durationSecs = startedAt
      ? base + Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000))
      : base;

    const { rows } = await client.query(
      `UPDATE tasks SET
         review_seconds          = $1,
         review_reason           = $2,
         review_rework_reason    = $3,
         size_category           = $4,
         reviewer_id             = $5,
         reviewer_name           = $6,
         reviewed_at             = NOW(),
         review_started_at       = NULL,
         review_ended_at         = NOW(),
         review_duration_seconds = $7,
         updated_at              = NOW()
       WHERE id = $8
       RETURNING *`,
      [secs, review_reason?.trim() || null, review_rework_reason?.trim() || null, effectiveSize, req.user.id, req.user.name, durationSecs, req.params.id]
    );
    await client.query(
      `INSERT INTO task_events (task_id, event_type, note) VALUES ($1, 'review', $2)`,
      [req.params.id, review_reason?.trim() || null]
    );
    await client.query('COMMIT');
    res.json(rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

module.exports = router;
