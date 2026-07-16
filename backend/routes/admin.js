const router = require('express').Router();
const pool = require('../db');
const { authenticate, requireAdmin } = require('../middleware/auth');

router.use(authenticate, requireAdmin);

// GET /api/admin/users
router.get('/users', async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT id, name FROM users WHERE role IN ('user', 'reviewer') ORDER BY name`);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/admin/all-users — every account with its role (for role management)
router.get('/all-users', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, email, role, can_do_tasks, task_limit FROM users ORDER BY role, name`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /api/admin/users/:id/role — grant/revoke reviewer access
router.patch('/users/:id/role', async (req, res) => {
  const { role } = req.body;
  if (!['user', 'reviewer'].includes(role)) {
    return res.status(400).json({ error: 'Role must be user or reviewer' });
  }
  try {
    const { rows: target } = await pool.query('SELECT role FROM users WHERE id = $1', [req.params.id]);
    if (!target.length) return res.status(404).json({ error: 'User not found' });
    if (target[0].role === 'admin') {
      return res.status(400).json({ error: 'Cannot change an admin account' });
    }
    // Reset the task-access flag on any role change so a fresh reviewer starts
    // without user-task access and a demoted user carries no stale grant.
    const { rows } = await pool.query(
      `UPDATE users SET role = $1, can_do_tasks = false WHERE id = $2 RETURNING id, name, email, role, can_do_tasks`,
      [role, req.params.id]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/admin/users/:id — remove a user account (blocked for admins, self, or users with data)
router.delete('/users/:id', async (req, res) => {
  if (String(req.params.id) === String(req.user.id)) {
    return res.status(400).json({ error: 'You cannot delete your own account' });
  }
  try {
    const { rows: target } = await pool.query('SELECT role FROM users WHERE id = $1', [req.params.id]);
    if (!target.length) return res.status(404).json({ error: 'User not found' });
    if (target[0].role === 'admin') {
      return res.status(400).json({ error: 'Cannot delete an admin account' });
    }
    const { rows: cnt } = await pool.query(
      'SELECT COUNT(*)::int AS c FROM tasks WHERE user_id = $1 OR reviewer_id = $1',
      [req.params.id]
    );
    if (cnt[0].c > 0) {
      return res.status(400).json({ error: `User has ${cnt[0].c} task(s)/review(s); reassign or delete those first` });
    }
    await pool.query('DELETE FROM users WHERE id = $1', [req.params.id]);
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /api/admin/users/:id/can-tasks — grant/revoke a reviewer's ability to perform user tasks
router.patch('/users/:id/can-tasks', async (req, res) => {
  const { can_do_tasks } = req.body;
  if (typeof can_do_tasks !== 'boolean') {
    return res.status(400).json({ error: 'can_do_tasks must be a boolean' });
  }
  try {
    const { rows: target } = await pool.query('SELECT role FROM users WHERE id = $1', [req.params.id]);
    if (!target.length) return res.status(404).json({ error: 'User not found' });
    if (target[0].role !== 'reviewer') {
      return res.status(400).json({ error: 'Only reviewers can be granted task access' });
    }
    const { rows } = await pool.query(
      `UPDATE users SET can_do_tasks = $1 WHERE id = $2 RETURNING id, name, email, role, can_do_tasks, task_limit`,
      [can_do_tasks, req.params.id]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /api/admin/users/:id/task-limit — max concurrent open tasks (null = unlimited)
router.patch('/users/:id/task-limit', async (req, res) => {
  let { task_limit } = req.body;
  if (task_limit === '' || task_limit === undefined) task_limit = null;
  if (task_limit !== null) {
    task_limit = Number(task_limit);
    if (!Number.isInteger(task_limit) || task_limit < 1) {
      return res.status(400).json({ error: 'task_limit must be a positive integer or null' });
    }
  }
  try {
    const { rows: target } = await pool.query('SELECT role FROM users WHERE id = $1', [req.params.id]);
    if (!target.length) return res.status(404).json({ error: 'User not found' });
    if (target[0].role === 'admin') {
      return res.status(400).json({ error: 'Cannot set a limit on an admin account' });
    }
    const { rows } = await pool.query(
      `UPDATE users SET task_limit = $1 WHERE id = $2 RETURNING id, name, email, role, can_do_tasks, task_limit`,
      [task_limit, req.params.id]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/admin/tasks
router.get('/tasks', async (req, res) => {
  const { user_id, product, qr_no, task_status, date_from, date_to } = req.query;
  const conditions = [];
  const params = [];
  let i = 1;

  if (user_id)      { conditions.push(`t.user_id = $${i++}`);                              params.push(user_id); }
  if (product)      { conditions.push(`t.product ILIKE $${i++}`);                          params.push(`%${product}%`); }
  if (qr_no)        { conditions.push(`t.qr_no = $${i++}`);                                 params.push(qr_no); }
  if (task_status)  { conditions.push(`t.task_status = $${i++}`);                          params.push(task_status); }
  if (date_from)    { conditions.push(`t.created_at >= $${i++}::date`);                    params.push(date_from); }
  if (date_to)      { conditions.push(`t.created_at < $${i++}::date + interval '1 day'`); params.push(date_to); }

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

// GET /api/admin/reviewer-tasks — reviewer-oriented view with its own filters
router.get('/reviewer-tasks', async (req, res) => {
  const { reviewer_id, product, qr_no, reviewed, date_from, date_to } = req.query;
  const conditions = ['t.reviewer_id IS NOT NULL'];
  const params = [];
  let i = 1;

  if (reviewer_id) { conditions.push(`t.reviewer_id = $${i++}`);                          params.push(reviewer_id); }
  if (product)     { conditions.push(`t.product ILIKE $${i++}`);                          params.push(`%${product}%`); }
  if (qr_no)       { conditions.push(`t.qr_no = $${i++}`);                                 params.push(qr_no); }
  if (reviewed === 'yes') { conditions.push(`t.reviewed_at IS NOT NULL`); }
  if (reviewed === 'no')  { conditions.push(`t.reviewed_at IS NULL`); }
  if (date_from)   { conditions.push(`t.created_at >= $${i++}::date`);                    params.push(date_from); }
  if (date_to)     { conditions.push(`t.created_at < $${i++}::date + interval '1 day'`); params.push(date_to); }

  const where = 'WHERE ' + conditions.join(' AND ');

  try {
    const { rows } = await pool.query(
      `SELECT t.*, u.name AS user_name
       FROM tasks t
       JOIN users u ON t.user_id = u.id
       ${where}
       ORDER BY t.reviewed_at DESC NULLS LAST, t.created_at DESC`,
      params
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/admin/summary
router.get('/summary', async (req, res) => {
  try {
    const [byStatus, bySize, byReviewer] = await Promise.all([
      pool.query(`SELECT task_status, COUNT(*)::int AS count FROM tasks GROUP BY task_status ORDER BY task_status`),
      pool.query(`SELECT size_category, COUNT(*)::int AS count FROM tasks WHERE task_status = 'uploaded' GROUP BY size_category ORDER BY size_category`),
      pool.query(`SELECT reviewer_name, COUNT(*)::int AS count FROM tasks WHERE reviewer_name IS NOT NULL GROUP BY reviewer_name ORDER BY reviewer_name`),
    ]);
    res.json({ byStatus: byStatus.rows, bySize: bySize.rows, byReviewer: byReviewer.rows });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /api/admin/tasks/:id
router.patch('/tasks/:id', async (req, res) => {
  const { product, qr_no, status_field, task_status, size_category, bn_reason, stuck_reason, started_at, stopped_at, total_paused_seconds,
          review_seconds, review_reason, review_rework_reason, reviewer_name, review_started_at, review_ended_at, review_paused_seconds } = req.body;
  const allowed = ['working', 'work in progress', 'stopped', 'uploaded'];
  if (task_status && !allowed.includes(task_status)) {
    return res.status(400).json({ error: 'Invalid task_status' });
  }
  try {
    const { rows: current } = await pool.query('SELECT * FROM tasks WHERE id = $1', [req.params.id]);
    if (!current.length) return res.status(404).json({ error: 'Task not found' });

    const resolvedStart  = started_at  ? new Date(started_at)  : current[0].started_at;
    const resolvedStop   = stopped_at  ? new Date(stopped_at)  : current[0].stopped_at;
    const timesChanged   = started_at || stopped_at;
    const resolvedPaused = (total_paused_seconds !== undefined && total_paused_seconds !== null)
      ? parseInt(total_paused_seconds)
      : (current[0].total_paused_seconds || 0);

    // Reviewer time = (review end − review start) − review pause.
    const resolvedRStart  = review_started_at ? new Date(review_started_at) : current[0].review_first_started_at;
    const resolvedREnd    = review_ended_at   ? new Date(review_ended_at)   : current[0].review_ended_at;
    const reviewTimesChanged = review_started_at || review_ended_at ||
      (review_paused_seconds !== undefined && review_paused_seconds !== null);
    const resolvedRPaused = (review_paused_seconds !== undefined && review_paused_seconds !== null)
      ? parseInt(review_paused_seconds)
      : (current[0].review_paused_seconds || 0);

    let recalcClause = '';
    let recalcParams = [];
    let paramOffset  = 18; // $1–$17 already used in SET clause

    if (timesChanged && resolvedStart && resolvedStop) {
      const diffSecs   = Math.max(0, Math.floor((resolvedStop - resolvedStart) / 1000));
      const activeSecs = Math.max(0, diffSecs - resolvedPaused);
      recalcClause += `, total_active_seconds = $${paramOffset++}`;
      recalcParams.push(activeSecs);
    }

    if (reviewTimesChanged && resolvedRStart && resolvedREnd) {
      const diffSecs    = Math.max(0, Math.floor((new Date(resolvedREnd) - new Date(resolvedRStart)) / 1000));
      const reviewSecs  = Math.max(0, diffSecs - resolvedRPaused);
      recalcClause += `, review_duration_seconds = $${paramOffset++}`;
      recalcParams.push(reviewSecs);
    }

    const { rows } = await pool.query(
      `UPDATE tasks SET
        product              = COALESCE($1, product),
        qr_no                = COALESCE($2, qr_no),
        status_field         = COALESCE($3, status_field),
        task_status          = COALESCE($4, task_status),
        size_category        = $5,
        bn_reason            = $6,
        stuck_reason         = $7,
        started_at           = COALESCE($8::timestamptz, started_at),
        stopped_at           = $9::timestamptz,
        total_paused_seconds = COALESCE($10, total_paused_seconds),
        review_seconds          = COALESCE($11, review_seconds),
        review_reason           = COALESCE($12, review_reason),
        review_rework_reason    = COALESCE($13, review_rework_reason),
        reviewer_name           = COALESCE($14, reviewer_name),
        review_first_started_at = COALESCE($15::timestamptz, review_first_started_at),
        review_ended_at         = COALESCE($16::timestamptz, review_ended_at),
        review_paused_seconds   = COALESCE($17, review_paused_seconds),
        reviewed_at             = CASE WHEN ($11 IS NOT NULL OR $16 IS NOT NULL) AND reviewed_at IS NULL THEN NOW() ELSE reviewed_at END
        ${recalcClause},
        updated_at           = NOW()
       WHERE id = $${paramOffset}
       RETURNING *`,
      [
        product || null, qr_no || null, status_field || null, task_status || null,
        size_category || null, bn_reason || null, stuck_reason || null,
        started_at || null, stopped_at || null,
        (total_paused_seconds !== undefined && total_paused_seconds !== null) ? resolvedPaused : null,
        (review_seconds !== undefined && review_seconds !== null) ? parseInt(review_seconds) : null,
        review_reason || null,
        review_rework_reason || null,
        reviewer_name || null,
        review_started_at || null,
        review_ended_at || null,
        (review_paused_seconds !== undefined && review_paused_seconds !== null) ? resolvedRPaused : null,
        ...recalcParams,
        req.params.id,
      ]
    );
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /api/admin/tasks/:id/review-reset — clear all review data + reviewer lock
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
         updated_at              = NOW()
       WHERE id = $1
       RETURNING *`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Task not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/admin/products
router.get('/products', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT id, name FROM products ORDER BY name');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/admin/products
router.post('/products', async (req, res) => {
  const { name } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Name required' });
  try {
    const { rows } = await pool.query(
      'INSERT INTO products (name) VALUES ($1) RETURNING id, name',
      [name.trim()]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Product already exists' });
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/admin/products/:id
router.delete('/products/:id', async (req, res) => {
  try {
    // qc_items cascade-delete via FK ON DELETE CASCADE.
    const { rowCount } = await pool.query('DELETE FROM products WHERE id = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'Product not found' });
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/admin/products/:id/qc-items — self-QC checklist for a product
router.get('/products/:id/qc-items', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, label, sort_order FROM qc_items WHERE product_id = $1 ORDER BY sort_order, id',
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/admin/products/:id/qc-items — add a checklist item
router.post('/products/:id/qc-items', async (req, res) => {
  const { label } = req.body;
  if (!label?.trim()) return res.status(400).json({ error: 'Label required' });
  try {
    const { rows: prod } = await pool.query('SELECT id FROM products WHERE id = $1', [req.params.id]);
    if (!prod.length) return res.status(404).json({ error: 'Product not found' });
    const { rows } = await pool.query(
      `INSERT INTO qc_items (product_id, label, sort_order)
       VALUES ($1, $2, COALESCE((SELECT MAX(sort_order) + 1 FROM qc_items WHERE product_id = $1), 0))
       RETURNING id, label, sort_order`,
      [req.params.id, label.trim()]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/admin/qc-items/:id — remove a checklist item
router.delete('/qc-items/:id', async (req, res) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM qc_items WHERE id = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'Item not found' });
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
