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

    // Allow the 'review' event type.
    await client.query(`ALTER TABLE task_events DROP CONSTRAINT IF EXISTS task_events_event_type_check`);
    await client.query(
      `ALTER TABLE task_events ADD CONSTRAINT task_events_event_type_check
       CHECK (event_type IN ('start', 'pause', 'resume', 'stuck_reason', 'stop', 'complete', 'size_selected', 'review'))`
    );
  } finally {
    client.release();
  }
}

module.exports = migrate;
