import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import pg from 'pg'
import { clerkMiddleware, getAuth, clerkClient } from '@clerk/express'

const { Pool } = pg

const app = express()
const port = process.env.PORT || 4000

// 让前端能带 Authorization: Bearer <token>
app.use(
  cors({
    origin: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }),
)
app.use(express.json())

// Clerk 中间件：读取 headers/cookies，把 auth 状态挂到 request 上
app.use(clerkMiddleware())

// Neon：云上建议启用 SSL（更稳）
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
})

const CHECKIN_POINTS = 10

async function initDb() {
  // 1) 用户表：新增 points 字段
  // 2) 签到表：一人一天只能有一条（UNIQUE），防止重复加分
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_users (
      clerk_user_id TEXT PRIMARY KEY,
      email TEXT,
      full_name TEXT,
      avatar_url TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    ALTER TABLE app_users
      ADD COLUMN IF NOT EXISTS points INT NOT NULL DEFAULT 0;

    CREATE TABLE IF NOT EXISTS app_checkins (
      id BIGSERIAL PRIMARY KEY,
      clerk_user_id TEXT NOT NULL,
      checkin_date DATE NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (clerk_user_id, checkin_date)
    );
  `)
}

initDb().catch((e) => {
  console.error('[DB] init failed:', e)
  // 云上不建议直接 process.exit(1)，先让服务起来，方便 /health 看错误
})

app.get('/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1')
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ ok: false, error: 'DB not reachable' })
  }
})

// 用英国当天日期，避免时区跨天问题
async function getLondonToday() {
  const r = await pool.query(`SELECT (NOW() AT TIME ZONE 'Europe/London')::date AS today`)
  return r.rows[0].today // 例如 '2026-01-27'
}

// 确保 users 表里至少有一行（避免用户没 sync 也能签到报错）
async function ensureUserRow(userId) {
  await pool.query(
    `
    INSERT INTO app_users (clerk_user_id, last_seen_at)
    VALUES ($1, NOW())
    ON CONFLICT (clerk_user_id) DO UPDATE SET last_seen_at = NOW();
    `,
    [userId],
  )
}

// 前端登录成功后调用：验证 session token，并把用户写入 Neon
app.post('/users/sync', async (req, res) => {
  try {
    const { userId, sessionId } = getAuth(req)
    if (!userId) return res.status(401).json({ error: 'Unauthenticated' })

    const user = await clerkClient.users.getUser(userId)

    // 更稳：优先 primaryEmailAddress.emailAddress（而不是 primaryEmailAddressId）
    const email =
      user.primaryEmailAddress?.emailAddress ||
      user.emailAddresses?.[0]?.emailAddress ||
      null

    const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ') || null
    const avatarUrl = user.imageUrl || null

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
    )

    return res.json({ ok: true, userId, sessionId })
  } catch (err) {
    console.error('[BE] /users/sync error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * GET /checkins/status
 * 返回：points、totalDays、checkedInToday
 */
app.get('/checkins/status', async (req, res) => {
  try {
    const { userId } = getAuth(req)
    if (!userId) return res.status(401).json({ error: 'Unauthenticated' })

    await ensureUserRow(userId)
    const today = await getLondonToday()

    const exists = await pool.query(
      `
      SELECT EXISTS(
        SELECT 1 FROM app_checkins WHERE clerk_user_id=$1 AND checkin_date=$2
      ) AS checked_in_today
      `,
      [userId, today],
    )

    const total = await pool.query(
      `SELECT COUNT(*)::int AS total_days FROM app_checkins WHERE clerk_user_id=$1`,
      [userId],
    )

    const points = await pool.query(
      `SELECT points FROM app_users WHERE clerk_user_id=$1`,
      [userId],
    )

    return res.json({
      ok: true,
      today,
      checkedInToday: Boolean(exists.rows[0].checked_in_today),
      totalDays: total.rows[0].total_days,
      points: points.rows[0]?.points ?? 0,
    })
  } catch (e) {
    console.error('[BE] /checkins/status error:', e)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * POST /checkins/today
 * 规则：同一天重复点不会重复加分
 * 返回：points、totalDays、checkedInToday、gainedPoints
 */
app.post('/checkins/today', async (req, res) => {
  const client = await pool.connect()
  try {
    const { userId } = getAuth(req)
    if (!userId) return res.status(401).json({ error: 'Unauthenticated' })

    await ensureUserRow(userId)
    const today = await getLondonToday()

    await client.query('BEGIN')

    // 插入签到记录：如果今天已签，rowCount=0
    const ins = await client.query(
      `
      INSERT INTO app_checkins (clerk_user_id, checkin_date)
      VALUES ($1, $2)
      ON CONFLICT (clerk_user_id, checkin_date) DO NOTHING
      RETURNING id
      `,
      [userId, today],
    )

    const didInsert = ins.rowCount === 1

    // 只有今天第一次签到才加分
    if (didInsert) {
      await client.query(
        `UPDATE app_users SET points = points + $2, last_seen_at = NOW() WHERE clerk_user_id = $1`,
        [userId, CHECKIN_POINTS],
      )
    }

    const total = await client.query(
      `SELECT COUNT(*)::int AS total_days FROM app_checkins WHERE clerk_user_id=$1`,
      [userId],
    )

    const points = await client.query(
      `SELECT points FROM app_users WHERE clerk_user_id=$1`,
      [userId],
    )

    await client.query('COMMIT')

    return res.json({
      ok: true,
      today,
      checkedInToday: true,
      gainedPoints: didInsert ? CHECKIN_POINTS : 0,
      totalDays: total.rows[0].total_days,
      points: points.rows[0]?.points ?? 0,
    })
  } catch (e) {
    await client.query('ROLLBACK')
    console.error('[BE] /checkins/today error:', e)
    return res.status(500).json({ error: 'Internal server error' })
  } finally {
    client.release()
  }
})

// Render 必须：绑定 0.0.0.0，并监听 PORT
app.listen(port, '0.0.0.0', () => {
  console.log(`Backend listening on port ${port}`)
})
