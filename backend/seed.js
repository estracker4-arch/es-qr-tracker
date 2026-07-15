const pool = require('./db');
const bcrypt = require('bcrypt');

async function seed() {
  const client = await pool.connect();
  try {
    const { rows } = await client.query('SELECT COUNT(*) FROM users');
    if (parseInt(rows[0].count) > 0) return;

    const products = [
      'EcoFoot 2t', 'GridFlex 10', 'SM Tilt', 'EcoFoot 5D', 'GridFlex 5D',
      'NXT', 'RM10EVO', 'RMDT', 'NXT Tilt', 'RM10', 'RM5', 'GFT',
      'GridFlex 5', 'MetalX', 'ULA', 'ECOX', 'SM', 'Ascender', 'SFM',
    ];
    for (const name of products) {
      await client.query('INSERT INTO products (name) VALUES ($1) ON CONFLICT DO NOTHING', [name]);
    }

    const qrCodes = ['QR-001', 'QR-002', 'QR-003', 'QR-004', 'QR-005', 'QR-006', 'QR-007', 'QR-008'];
    for (const qr of qrCodes) {
      await client.query('INSERT INTO qr_codes (qr_no) VALUES ($1) ON CONFLICT DO NOTHING', [qr]);
    }

    const statuses = ['Design', 'Internal Rework', 'External Revision', 'External Rework', 'Help'];
    for (const value of statuses) {
      await client.query('INSERT INTO status_options (value) VALUES ($1) ON CONFLICT DO NOTHING', [value]);
    }

    const users = [
      { name: 'Admin User',   email: 'admin@nuevosol.com', password: 'admin123',  role: 'admin' },
      { name: 'Rita Reviewer', email: 'reviewer@nuevosol.com', password: 'review123', role: 'reviewer' },
      { name: 'Alice Johnson', email: 'alice@nuevosol.com', password: 'alice123', role: 'user'  },
      { name: 'Bob Smith',     email: 'bob@nuevosol.com',   password: 'bob123',   role: 'user'  },
      { name: 'Carol Davis',   email: 'carol@nuevosol.com', password: 'carol123', role: 'user'  },
    ];

    console.log('\n=== Seeded Login Credentials ===');
    for (const u of users) {
      const hash = await bcrypt.hash(u.password, 10);
      await client.query(
        'INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4)',
        [u.name, u.email, hash, u.role]
      );
      console.log(`  [${u.role.toUpperCase()}] ${u.email}  /  ${u.password}`);
    }
    console.log('================================\n');
  } finally {
    client.release();
  }
}

module.exports = seed;
