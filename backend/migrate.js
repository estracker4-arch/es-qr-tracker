const pool = require('./db');

// Idempotent schema migrations for existing databases.
// schema.sql only runs on a fresh docker volume, so changes to existing
// installs must be applied here on every server start.
async function migrate() {
  const client = await pool.connect();
  try {
    // Allow the 'reviewer' role.
    await client.query(`ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check`);
    await client.query(
      `ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('user', 'admin', 'reviewer'))`
    );

    // Per-reviewer flag: may this reviewer also perform user tasks? Off by default.
    await client.query(
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS can_do_tasks BOOLEAN NOT NULL DEFAULT false`
    );

    // Max concurrent open reviews a reviewer may hold (claimed, not finalized). NULL = unlimited.
    await client.query(
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS task_limit INTEGER`
    );

    // Review columns on tasks.
    await client.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS review_seconds INTEGER`);
    await client.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS review_reason TEXT`);
    await client.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS review_rework_reason TEXT`);
    await client.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS reviewer_id INTEGER REFERENCES users(id)`);
    await client.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS reviewer_name TEXT`);
    await client.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ`);
    await client.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS review_started_at TIMESTAMPTZ`);
    await client.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS review_first_started_at TIMESTAMPTZ`);
    await client.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS review_ended_at TIMESTAMPTZ`);
    await client.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS review_duration_seconds INTEGER`);
    await client.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS review_paused_seconds INTEGER`);

    // Review outcome chosen on save: closed_out | stuck | ier (+ reason for stuck/ier).
    await client.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS review_outcome TEXT`);
    await client.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS review_outcome_reason TEXT`);

    // Self-QC: per-product checklist the user ticks off before a task uploads.
    await client.query(`
      CREATE TABLE IF NOT EXISTS qc_items (
        id SERIAL PRIMARY KEY,
        product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        label TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    // Time spent on the self-QC step, the checked items, and user time + self-QC time.
    await client.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS self_qc_seconds INTEGER`);
    await client.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS self_qc_items JSONB`);
    await client.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS total_with_qc_seconds INTEGER`);

    // Allow the 'review' and 'self_qc' event types.
    await client.query(`ALTER TABLE task_events DROP CONSTRAINT IF EXISTS task_events_event_type_check`);
    await client.query(
      `ALTER TABLE task_events ADD CONSTRAINT task_events_event_type_check
       CHECK (event_type IN ('start', 'pause', 'resume', 'stuck_reason', 'stop', 'complete', 'size_selected', 'review', 'self_qc'))`
    );
  } finally {
    client.release();
  }
}

module.exports = migrate;
