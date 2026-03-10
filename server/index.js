import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import { clerkMiddleware, getAuth, clerkClient } from '@clerk/express'
import { pool } from './db.js'

const app = express()
const port = Number(process.env.PORT) || 10000

// 允许前端带 Authorization: Bearer <token> 调用后端。

// 让前端能带 Authorization: Bearer <token>
app.use(
  cors({
    origin: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }),
)
app.use(express.json())

// 参考 Clerk Express 官方文档：https://clerk.com/docs/reference/express/clerk-middleware
// 官网示例是先 app.use(clerkMiddleware())，之后再在路由里用 getAuth(req) 读取登录态。

// Clerk 中间件：读取 headers/cookies，把 auth 状态挂到 request 上
app.use(clerkMiddleware())

// Neon：云上建议启用 SSL（更稳）
const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) {
  console.error('[DB] Missing DATABASE_URL. Set it to your Neon connection string.')
} else if (!databaseUrl.includes('sslmode=')) {
  console.warn('[DB] DATABASE_URL missing sslmode=require. Neon requires SSL.')
}

const CHECKIN_POINTS = 10
const TRIPLE_REWARD_STREAK = 7
const TRIPLE_REWARD_MULTIPLIER = 3
const CANVAS_ENCRYPTION_ALGO = 'aes-256-gcm'
const CANVAS_IV_BYTES = 12
const CANVAS_TOKEN_SECRET = process.env.CANVAS_TOKEN_SECRET || ''

function mapRewardRow(row) {
  return {
    id: row.id,
    title: row.title,
    pointsCost: row.points_cost,
    category: row.category,
    imageUrl: row.image_url || '',
    isActive: row.is_active,
  }
}

function getCanvasSecretKey() {
  if (!CANVAS_TOKEN_SECRET) {
    throw new Error('Missing CANVAS_TOKEN_SECRET')
  }
  return createHash('sha256').update(CANVAS_TOKEN_SECRET).digest()
}

function encryptCanvasToken(token) {
  const key = getCanvasSecretKey()
  const iv = randomBytes(CANVAS_IV_BYTES)
  const cipher = createCipheriv(CANVAS_ENCRYPTION_ALGO, key, iv)
  const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return {
    cipherText: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
  }
}

function decryptCanvasToken(cipherText, iv, authTag) {
  const key = getCanvasSecretKey()
  const decipher = createDecipheriv(
    CANVAS_ENCRYPTION_ALGO,
    key,
    Buffer.from(iv, 'base64'),
  )
  decipher.setAuthTag(Buffer.from(authTag, 'base64'))
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(cipherText, 'base64')),
    decipher.final(),
  ])
  return decrypted.toString('utf8')
}

async function getStreakDays(db, userId, today) {
  const r = await db.query(
    `
    WITH ordered AS (
      SELECT checkin_date,
             ROW_NUMBER() OVER (ORDER BY checkin_date DESC) AS rn
      FROM app_checkins
      WHERE clerk_user_id = $1 AND checkin_date <= $2
    ),
    grouped AS (
      SELECT checkin_date,
             (checkin_date + rn * INTERVAL '1 day')::date AS grp
      FROM ordered
    )
    SELECT COUNT(*)::int AS streak
    FROM grouped
    WHERE grp = (SELECT grp FROM grouped ORDER BY checkin_date DESC LIMIT 1)
    `,
    [userId, today],
  )

  return r.rows[0]?.streak ?? 0
}

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
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_app_rewards_title_unique
      ON app_rewards (title);

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
  `)

  await pool.query(
    `
    INSERT INTO app_rewards (title, points_cost, category, image_url, is_active)
    VALUES
      ('Coffee Coupon', 120, 'drinks', '', TRUE),
      ('Latte Coupon', 160, 'drinks', '', TRUE),
      ('Discount Coupon', 200, 'coupon', '', TRUE),
      ('Big Discount Coupon', 260, 'coupon', '', TRUE)
    ON CONFLICT (title) DO NOTHING;
    `,
  )
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
// 参考 Clerk Express getAuth 官方文档：https://clerk.com/docs/reference/express/get-auth
// 官方方式是在路由里调用 getAuth(req) 取出 userId/sessionId，再执行自己的业务逻辑。
app.post('/users/sync', async (req, res) => {
  try {
    const { userId, sessionId } = getAuth(req)
    if (!userId) return res.status(401).json({ error: 'Unauthenticated' })

    // 参考 Clerk Backend Users 文档：https://clerk.com/docs/reference/backend/user/get-user
    // 这里按官方后端模式通过 clerkClient.users.getUser(userId) 回填邮箱、姓名、头像。
    const user = await clerkClient.users.getUser(userId)

    // 更稳：优先 primaryEmailAddress.emailAddress（而不是 primaryEmailAddressId）
    // 优先使用 Clerk primaryEmailAddress.emailAddress，和官方 User 资源字段保持一致。
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
 * GET /canvas/credentials
 * Return the current user's saved Canvas school+token.
 */
app.get('/canvas/credentials', async (req, res) => {
  try {
    const { userId } = getAuth(req)
    if (!userId) return res.status(401).json({ error: 'Unauthenticated' })

    await ensureUserRow(userId)
    const result = await pool.query(
      `
      SELECT canvas_school, canvas_token_ciphertext, canvas_token_iv, canvas_token_tag
      FROM app_canvas_credentials
      WHERE clerk_user_id = $1
      `,
      [userId],
    )

    if (result.rowCount === 0) {
      return res.json({ ok: true, school: '', token: '' })
    }

    const row = result.rows[0]
    let token = ''
    if (row.canvas_token_ciphertext && row.canvas_token_iv && row.canvas_token_tag) {
      try {
        token = decryptCanvasToken(
          row.canvas_token_ciphertext,
          row.canvas_token_iv,
          row.canvas_token_tag,
        )
      } catch (decryptError) {
        console.error('[BE] /canvas/credentials decrypt error:', decryptError)
        return res.status(500).json({
          error:
            'Saved Canvas token cannot be decrypted. Check CANVAS_TOKEN_SECRET is set and unchanged.',
        })
      }
    }

    return res.json({
      ok: true,
      school: row.canvas_school || '',
      token,
    })
  } catch (e) {
    console.error('[BE] /canvas/credentials error:', e)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * PUT /canvas/credentials
 * Save/update the current user's Canvas school+token.
 */
app.put('/canvas/credentials', async (req, res) => {
  try {
    const { userId } = getAuth(req)
    if (!userId) return res.status(401).json({ error: 'Unauthenticated' })
    if (!CANVAS_TOKEN_SECRET) {
      return res.status(500).json({ error: 'Missing CANVAS_TOKEN_SECRET on server' })
    }

    await ensureUserRow(userId)

    const schoolRaw = req.body?.school
    const tokenRaw = req.body?.token
    const school = String(schoolRaw ?? '').trim()
    const token = String(tokenRaw ?? '').trim()

    if (school.length > 255) {
      return res.status(400).json({ error: 'School is too long' })
    }
    if (token.length > 8192) {
      return res.status(400).json({ error: 'Token is too long' })
    }

    const encrypted = encryptCanvasToken(token)
    await pool.query(
      `
      INSERT INTO app_canvas_credentials (
        clerk_user_id,
        canvas_school,
        canvas_token_ciphertext,
        canvas_token_iv,
        canvas_token_tag,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, NOW())
      ON CONFLICT (clerk_user_id)
      DO UPDATE SET
        canvas_school = EXCLUDED.canvas_school,
        canvas_token_ciphertext = EXCLUDED.canvas_token_ciphertext,
        canvas_token_iv = EXCLUDED.canvas_token_iv,
        canvas_token_tag = EXCLUDED.canvas_token_tag,
        updated_at = NOW()
      `,
      [userId, school, encrypted.cipherText, encrypted.iv, encrypted.authTag],
    )

    return res.json({ ok: true })
  } catch (e) {
    console.error('[BE] /canvas/credentials PUT error:', e)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * DELETE /canvas/credentials
 * Remove saved Canvas school+token for the current user.
 */
app.delete('/canvas/credentials', async (req, res) => {
  try {
    const { userId } = getAuth(req)
    if (!userId) return res.status(401).json({ error: 'Unauthenticated' })

    await pool.query(
      `DELETE FROM app_canvas_credentials WHERE clerk_user_id = $1`,
      [userId],
    )

    return res.json({ ok: true })
  } catch (e) {
    console.error('[BE] /canvas/credentials DELETE error:', e)
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
      streakDays: await getStreakDays(pool, userId, today),
      points: points.rows[0]?.points ?? 0,
    })
  } catch (e) {
    console.error('[BE] /checkins/status error:', e)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * GET /rewards/catalog
 * Return all active rewards.
 */
app.get('/rewards/catalog', async (req, res) => {
  try {
    const { userId } = getAuth(req)
    if (!userId) return res.status(401).json({ error: 'Unauthenticated' })

    await ensureUserRow(userId)

    const rewards = await pool.query(
      `
      SELECT id, title, points_cost, category, image_url, is_active
      FROM app_rewards
      WHERE is_active = TRUE
      ORDER BY points_cost ASC, id ASC
      `,
    )

    return res.json({
      ok: true,
      items: rewards.rows.map(mapRewardRow),
    })
  } catch (e) {
    console.error('[BE] /rewards/catalog error:', e)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * POST /rewards/redeem
 * Redeem one reward and deduct points in a DB transaction.
 */
app.post('/rewards/redeem', async (req, res) => {
  const client = await pool.connect()
  try {
    const { userId } = getAuth(req)
    if (!userId) return res.status(401).json({ error: 'Unauthenticated' })

    await ensureUserRow(userId)

    const rewardId = Number(req.body?.rewardId)
    if (!Number.isInteger(rewardId) || rewardId <= 0) {
      return res.status(400).json({ error: 'Invalid rewardId' })
    }

    await client.query('BEGIN')

    const rewardResult = await client.query(
      `
      SELECT id, title, points_cost, category, image_url, is_active
      FROM app_rewards
      WHERE id = $1
      FOR UPDATE
      `,
      [rewardId],
    )

    if (rewardResult.rowCount === 0) {
      await client.query('ROLLBACK')
      return res.status(404).json({ error: 'Reward not found' })
    }

    const reward = mapRewardRow(rewardResult.rows[0])
    if (!reward.isActive) {
      await client.query('ROLLBACK')
      return res.status(400).json({ error: 'Reward is not active' })
    }

    const pointsResult = await client.query(
      `
      SELECT points
      FROM app_users
      WHERE clerk_user_id = $1
      FOR UPDATE
      `,
      [userId],
    )
    const currentPoints = Number(pointsResult.rows[0]?.points) || 0

    if (currentPoints < reward.pointsCost) {
      await client.query('ROLLBACK')
      return res.status(409).json({
        error: 'INSUFFICIENT_POINTS',
        currentPoints,
        requiredPoints: reward.pointsCost,
      })
    }

    const updatedUser = await client.query(
      `
      UPDATE app_users
      SET points = points - $2, last_seen_at = NOW()
      WHERE clerk_user_id = $1
      RETURNING points
      `,
      [userId, reward.pointsCost],
    )

    const orderResult = await client.query(
      `
      INSERT INTO app_reward_orders (clerk_user_id, reward_id, points_cost, status, created_at)
      VALUES ($1, $2, $3, 'completed', NOW())
      RETURNING id, status, created_at
      `,
      [userId, reward.id, reward.pointsCost],
    )

    await client.query('COMMIT')

    const order = orderResult.rows[0]
    return res.json({
      ok: true,
      remainingPoints: Number(updatedUser.rows[0]?.points) || 0,
      order: {
        id: order.id,
        rewardId: reward.id,
        title: reward.title,
        category: reward.category,
        imageUrl: reward.imageUrl,
        pointsCost: reward.pointsCost,
        status: order.status,
        createdAt: order.created_at,
      },
    })
  } catch (e) {
    try {
      await client.query('ROLLBACK')
    } catch (_) {
      // no-op
    }
    console.error('[BE] /rewards/redeem error:', e)
    return res.status(500).json({ error: 'Internal server error' })
  } finally {
    client.release()
  }
})

/**
 * GET /rewards/orders
 * Return current user's redemption orders.
 */
app.get('/rewards/orders', async (req, res) => {
  try {
    const { userId } = getAuth(req)
    if (!userId) return res.status(401).json({ error: 'Unauthenticated' })

    await ensureUserRow(userId)

    const orders = await pool.query(
      `
      SELECT
        o.id,
        o.reward_id,
        o.points_cost,
        o.status,
        o.created_at,
        r.title,
        r.category,
        r.image_url
      FROM app_reward_orders o
      JOIN app_rewards r ON r.id = o.reward_id
      WHERE o.clerk_user_id = $1
      ORDER BY o.created_at DESC
      LIMIT 200
      `,
      [userId],
    )

    return res.json({
      ok: true,
      items: orders.rows.map((row) => ({
        id: row.id,
        rewardId: row.reward_id,
        title: row.title,
        category: row.category,
        imageUrl: row.image_url || '',
        pointsCost: row.points_cost,
        status: row.status,
        createdAt: row.created_at,
      })),
    })
  } catch (e) {
    console.error('[BE] /rewards/orders error:', e)
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

    let streakDays = 0
    let gainedPoints = 0

    // 只有今天第一次签到才加分
    if (didInsert) {
      streakDays = await getStreakDays(client, userId, today)
      const multiplier =
        streakDays === TRIPLE_REWARD_STREAK ? TRIPLE_REWARD_MULTIPLIER : 1
      gainedPoints = CHECKIN_POINTS * multiplier

      await client.query(
        `UPDATE app_users SET points = points + $2, last_seen_at = NOW() WHERE clerk_user_id = $1`,
        [userId, gainedPoints],
      )
    } else {
      streakDays = await getStreakDays(client, userId, today)
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
      gainedPoints: didInsert ? gainedPoints : 0,
      totalDays: total.rows[0].total_days,
      streakDays,
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
