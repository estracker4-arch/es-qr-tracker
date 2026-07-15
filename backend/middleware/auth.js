const jwt = require('jsonwebtoken');
const pool = require('../db');

function authenticate(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    req.user = jwt.verify(auth.slice(7), process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  next();
}

function requireReviewer(req, res, next) {
  if (req.user.role !== 'reviewer') return res.status(403).json({ error: 'Forbidden' });
  next();
}

// May perform user tasks: plain users always; reviewers only if admin granted
// the can_do_tasks flag. Checked live against the DB so grants/revokes take
// effect without the reviewer re-logging in.
async function requireUser(req, res, next) {
  if (req.user.role === 'user') return next();
  if (req.user.role === 'reviewer') {
    try {
      const { rows } = await pool.query('SELECT can_do_tasks FROM users WHERE id = $1', [req.user.id]);
      if (rows.length && rows[0].can_do_tasks) return next();
    } catch (err) {
      console.error(err);
    }
  }
  return res.status(403).json({ error: 'Forbidden' });
}

module.exports = { authenticate, requireAdmin, requireReviewer, requireUser };
