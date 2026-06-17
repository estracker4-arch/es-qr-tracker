const router = require('express').Router();
const pool = require('../db');
const { authenticate, requireAdmin } = require('../middleware/auth');

router.use(authenticate, requireAdmin);

// GET /api/admin/users
router.get('/users', async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT id, name FROM users WHERE role = 'user' ORDER BY name`);
    res.json(rows);
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
  if (qr_no)        { conditions.push(`t.qr_no ILIKE $${i++}`);                            params.push(`%${qr_no}%`); }
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

// GET /api/admin/summary
router.get('/summary', async (req, res) => {
  try {
    const [byStatus, bySize] = await Promise.all([
      pool.query(`SELECT task_status, COUNT(*)::int AS count FROM tasks GROUP BY task_status ORDER BY task_status`),
      pool.query(`SELECT size_category, COUNT(*)::int AS count FROM tasks WHERE task_status = 'uploaded' GROUP BY size_category ORDER BY size_category`),
    ]);
    res.json({ byStatus: byStatus.rows, bySize: bySize.rows });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /api/admin/tasks/:id
router.patch('/tasks/:id', async (req, res) => {
  const { product, qr_no, status_field, task_status, size_category, bn_reason, stuck_reason, started_at, stopped_at } = req.body;
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

    let recalcClause = '';
    let recalcParams = [];
    let paramOffset  = 10; // $1–$9 already used in SET clause

    if (timesChanged && resolvedStart && resolvedStop) {
      const diffSecs    = Math.max(0, Math.floor((resolvedStop - resolvedStart) / 1000));
      const activeSecs  = Math.max(0, diffSecs - (current[0].total_paused_seconds || 0));
      recalcClause = `, total_active_seconds = $${paramOffset++}`;
      recalcParams.push(activeSecs);
    }

    const { rows } = await pool.query(
      `UPDATE tasks SET
        product       = COALESCE($1, product),
        qr_no         = COALESCE($2, qr_no),
        status_field  = COALESCE($3, status_field),
        task_status   = COALESCE($4, task_status),
        size_category = $5,
        bn_reason     = $6,
        stuck_reason  = $7,
        started_at    = COALESCE($8::timestamptz, started_at),
        stopped_at    = $9::timestamptz
        ${recalcClause},
        updated_at    = NOW()
       WHERE id = $${paramOffset}
       RETURNING *`,
      [
        product || null, qr_no || null, status_field || null, task_status || null,
        size_category || null, bn_reason || null, stuck_reason || null,
        started_at || null, stopped_at || null,
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
    const { rowCount } = await pool.query('DELETE FROM products WHERE id = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'Product not found' });
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
