CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin', 'reviewer')),
  can_do_tasks BOOLEAN NOT NULL DEFAULT false,
  task_limit INTEGER,
  reset_token TEXT,
  reset_expires TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS qr_codes (
  id SERIAL PRIMARY KEY,
  qr_no TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS status_options (
  id SERIAL PRIMARY KEY,
  value TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS tasks (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  product TEXT NOT NULL,
  qr_no TEXT NOT NULL,
  status_field TEXT NOT NULL,
  session_number INTEGER NOT NULL DEFAULT 1,
  task_status TEXT NOT NULL DEFAULT 'working' CHECK (task_status IN ('working', 'work in progress', 'stopped', 'uploaded', 'stuck')),
  stuck_reason TEXT,
  was_auto_paused BOOLEAN NOT NULL DEFAULT FALSE,
  size_category TEXT CHECK (size_category IN ('BN', 'Medium', 'Small')),
  bn_reason TEXT,
  started_at TIMESTAMPTZ,
  stopped_at TIMESTAMPTZ,
  total_active_seconds INTEGER NOT NULL DEFAULT 0,
  total_paused_seconds INTEGER NOT NULL DEFAULT 0,
  review_seconds INTEGER,
  review_reason TEXT,
  review_rework_reason TEXT,
  reviewer_id INTEGER REFERENCES users(id),
  reviewer_name TEXT,
  reviewed_at TIMESTAMPTZ,
  review_started_at TIMESTAMPTZ,
  review_first_started_at TIMESTAMPTZ,
  review_ended_at TIMESTAMPTZ,
  review_duration_seconds INTEGER,
  review_paused_seconds INTEGER,
  review_outcome TEXT,
  review_outcome_reason TEXT,
  self_qc_seconds INTEGER,
  self_qc_items JSONB,
  total_with_qc_seconds INTEGER,
  active_time TEXT GENERATED ALWAYS AS (
    lpad(floor(total_active_seconds / 3600)::text, 2, '0') || ':' ||
    lpad(floor((total_active_seconds % 3600) / 60)::text, 2, '0') || ':' ||
    lpad((total_active_seconds % 60)::text, 2, '0')
  ) STORED,
  paused_time TEXT GENERATED ALWAYS AS (
    lpad(floor(total_paused_seconds / 3600)::text, 2, '0') || ':' ||
    lpad(floor((total_paused_seconds % 3600) / 60)::text, 2, '0') || ':' ||
    lpad((total_paused_seconds % 60)::text, 2, '0')
  ) STORED,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS task_events (
  id SERIAL PRIMARY KEY,
  task_id INTEGER REFERENCES tasks(id),
  event_type TEXT NOT NULL CHECK (event_type IN ('start', 'pause', 'resume', 'stuck_reason', 'stop', 'complete', 'size_selected', 'review', 'self_qc')),
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS qc_items (
  id SERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
