import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import pg from 'pg';
import { clerkMiddleware, getAuth, clerkClient } from '@clerk/express';

const { Pool } = pg;

const app = express();
const port = process.env.PORT || 4000;

app.use(cors({
  origin: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json());

// Clerk 中间件：会读取 headers/cookies 并把 auth 状态挂到 request 上
app.use(clerkMiddleware());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});


async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_users (
      clerk_user_id TEXT PRIMARY KEY,
      email TEXT,
      full_name TEXT,
      avatar_url TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

initDb().catch((e) => {
  console.error('[DB] init failed:', e);
  process.exit(1);
});

app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: 'DB not reachable' });
  }
});

// 前端登录成功后调用：验证 session token，并把用户写入 Neon
app.post('/users/sync', async (req, res) => {
  try {
    const { userId, sessionId } = getAuth(req);

    if (!userId) {
      return res.status(401).json({ error: 'Unauthenticated' });
    }

    const user = await clerkClient.users.getUser(userId);

    const email =
      user.emailAddresses?.[0]?.emailAddress ||
      user.primaryEmailAddressId ||
      null;

    const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ') || null;
    const avatarUrl = user.imageUrl || null;

    await pool.query(
      `
      INSERT INTO app_users (clerk_user_id, email, full_name, avatar_url, last_seen_at)
      VALUES ($1, $2, $3, $4, NOW())
      ON CONFLICT (clerk_user_id)
      DO UPDATE SET
        email = EXCLUDED.email,
        full_name = EXCLUDED.full_name,
        avatar_url = EXCLUDED.avatar_url,
        last_seen_at = NOW();
      `,
      [userId, email, fullName, avatarUrl],
    );

    return res.json({
      ok: true,
      userId,
      sessionId,
    });
  } catch (err) {
    console.error('[BE] /users/sync error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Backend listening on port ${port}`);
});

