CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  clerk_user_id TEXT NOT NULL UNIQUE,
  email TEXT,
  full_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 你的 student motivation app 以后肯定要存东西：比如每日记录、目标、打卡
CREATE TABLE IF NOT EXISTS motivation_entries (
  id BIGSERIAL PRIMARY KEY,
  clerk_user_id TEXT NOT NULL,
  entry_date DATE NOT NULL,
  mood INT,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT fk_motivation_user
    FOREIGN KEY (clerk_user_id)
    REFERENCES users (clerk_user_id)
    ON DELETE CASCADE,

  CONSTRAINT uniq_user_day UNIQUE (clerk_user_id, entry_date)
);
