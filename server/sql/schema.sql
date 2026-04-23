-- Database bootstrap schema for this project.
-- Keep this file limited to DDL that is safe to run inside a transaction.
-- Do not add CREATE INDEX CONCURRENTLY here.

CREATE TABLE IF NOT EXISTS app_users (
  clerk_user_id TEXT PRIMARY KEY,
  email TEXT,
  full_name TEXT,
  avatar_url TEXT,
  points INT NOT NULL DEFAULT 0,
  makeup_cards INT NOT NULL DEFAULT 0,
  new_user_bonus_phase_done BOOLEAN NOT NULL DEFAULT FALSE,
  has_claimed_14_day_makeup_card BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE app_users
  ADD COLUMN IF NOT EXISTS points INT NOT NULL DEFAULT 0;

ALTER TABLE app_users
  ADD COLUMN IF NOT EXISTS makeup_cards INT NOT NULL DEFAULT 0;

ALTER TABLE app_users
  ADD COLUMN IF NOT EXISTS new_user_bonus_phase_done BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE app_users
  ADD COLUMN IF NOT EXISTS has_claimed_14_day_makeup_card BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS app_checkins (
  id BIGSERIAL PRIMARY KEY,
  clerk_user_id TEXT NOT NULL,
  checkin_date DATE NOT NULL,
  next_day_note TEXT,
  next_day_note_updated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (clerk_user_id, checkin_date)
);

ALTER TABLE app_checkins
  ADD COLUMN IF NOT EXISTS next_day_note TEXT;

ALTER TABLE app_checkins
  ADD COLUMN IF NOT EXISTS next_day_note_updated_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS app_canvas_credentials (
  clerk_user_id TEXT PRIMARY KEY REFERENCES app_users (clerk_user_id) ON DELETE CASCADE,
  canvas_school TEXT NOT NULL DEFAULT '',
  canvas_token_ciphertext TEXT,
  canvas_token_iv TEXT,
  canvas_token_tag TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS app_rewards (
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  points_cost INT NOT NULL CHECK (points_cost > 0),
  category TEXT NOT NULL DEFAULT 'coupon',
  image_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT app_rewards_title_key UNIQUE (title)
);

CREATE TABLE IF NOT EXISTS app_reward_orders (
  id BIGSERIAL PRIMARY KEY,
  clerk_user_id TEXT NOT NULL REFERENCES app_users (clerk_user_id) ON DELETE CASCADE,
  reward_id BIGINT NOT NULL REFERENCES app_rewards (id),
  points_cost INT NOT NULL CHECK (points_cost > 0),
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('pending', 'completed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_app_reward_orders_user_created_at
  ON app_reward_orders (clerk_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS app_custom_tasks (
  id BIGSERIAL PRIMARY KEY,
  clerk_user_id TEXT NOT NULL REFERENCES app_users (clerk_user_id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  task_date DATE NOT NULL,
  timing_mode TEXT NOT NULL DEFAULT 'deadline'
    CHECK (timing_mode IN ('deadline', 'range')),
  due_time TIME,
  start_time TIME,
  end_time TIME,
  is_completed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_app_custom_tasks_user_date
  ON app_custom_tasks (clerk_user_id, task_date ASC, created_at ASC);

CREATE TABLE IF NOT EXISTS app_task_reward_events (
  id BIGSERIAL PRIMARY KEY,
  clerk_user_id TEXT NOT NULL REFERENCES app_users (clerk_user_id) ON DELETE CASCADE,
  source_type TEXT NOT NULL CHECK (source_type IN ('custom_task', 'canvas_task')),
  source_id TEXT NOT NULL,
  reward_date DATE NOT NULL,
  points INT NOT NULL CHECK (points > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (clerk_user_id, source_type, source_id)
);

CREATE INDEX IF NOT EXISTS idx_task_reward_daily
  ON app_task_reward_events (clerk_user_id, reward_date, source_type);

CREATE TABLE IF NOT EXISTS app_user_reward_state (
  clerk_user_id TEXT PRIMARY KEY REFERENCES app_users (clerk_user_id) ON DELETE CASCADE,
  milestone_draws INT NOT NULL DEFAULT 0,
  thirty_day_draws INT NOT NULL DEFAULT 0,
  draw_tickets INT NOT NULL DEFAULT 0,
  reroll_tickets INT NOT NULL DEFAULT 0,
  next_checkin_multiplier INT NOT NULL DEFAULT 1,
  next_task_bonus_points INT NOT NULL DEFAULT 0,
  bonus_checkins_remaining INT NOT NULL DEFAULT 0,
  bonus_per_checkin INT NOT NULL DEFAULT 0,
  weekly_custom_bonus_per_task INT NOT NULL DEFAULT 0,
  weekly_custom_bonus_week_key TEXT NOT NULL DEFAULT '',
  pending_reward_source TEXT NOT NULL DEFAULT '',
  pending_reward_code TEXT NOT NULL DEFAULT '',
  pending_reward_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  pending_reward_choices JSONB NOT NULL DEFAULT '[]'::jsonb,
  pending_reward_selected_index INT NOT NULL DEFAULT -1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE app_user_reward_state
  ADD COLUMN IF NOT EXISTS pending_reward_choices JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE app_user_reward_state
  ADD COLUMN IF NOT EXISTS pending_reward_selected_index INT NOT NULL DEFAULT -1;

ALTER TABLE app_user_reward_state
  ADD COLUMN IF NOT EXISTS thirty_day_draws INT NOT NULL DEFAULT 0;
