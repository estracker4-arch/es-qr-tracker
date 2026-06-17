const router = require('express').Router();
const pool = require('../db');
const { authenticate } = require('../middleware/auth');

router.get('/', authenticate, async (req, res) => {
  try {
    const [products, qrCodes, statuses] = await Promise.all([
      pool.query('SELECT name FROM products ORDER BY name'),
      pool.query('SELECT qr_no FROM qr_codes ORDER BY qr_no'),
      pool.query('SELECT value FROM status_options ORDER BY id'),
    ]);
    res.json({
      products: products.rows.map(r => r.name),
      qrCodes: qrCodes.rows.map(r => r.qr_no),
      statuses: statuses.rows.map(r => r.value),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
