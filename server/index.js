import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import path from 'node:path'
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { clerkMiddleware, getAuth, clerkClient } from '@clerk/express'
import { pool } from './db.js'
import { runDbInit } from './scripts/db-init.js'

const app = express()
let port = 10000
const parsedPort = Number(process.env.PORT)
if (Number.isFinite(parsedPort) && parsedPort > 0) {
  port = parsedPort
}
const currentFilePath = fileURLToPath(import.meta.url)
const currentDir = path.dirname(currentFilePath)
const photosDir = path.join(currentDir, '..', 'photos')

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
app.use('/photos', express.static(photosDir))

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

function getAutoDbInitOnStart() {
  const rawValue = process.env.AUTO_DB_INIT_ON_START
  if (rawValue === undefined || rawValue === null || String(rawValue).trim() === '') {
    return process.env.NODE_ENV !== 'production'
  }

  const normalized = String(rawValue).trim().toLowerCase()
  if (normalized === 'true') {
    return true
  }
  if (normalized === 'false') {
    return false
  }

  console.warn('[DB] Invalid AUTO_DB_INIT_ON_START value. Falling back to environment default.')
  return process.env.NODE_ENV !== 'production'
}

const autoDbInitOnStart = getAutoDbInitOnStart()
const dbInitMode = autoDbInitOnStart ? 'auto' : 'manual'

const CHECKIN_POINTS = 5
const NEW_USER_FIRST_WEEK_REWARDS = [1, 2, 3, 5, 8, 10, 10]
const RESTART_STREAK_REWARDS = [1, 2, 3, 4, 5, 5, 5]
const CUSTOM_TASK_REWARD_POINTS = 1
const CUSTOM_TASK_DAILY_REWARD_LIMIT = 2
const CANVAS_TASK_REWARD_POINTS = 10
const CANVAS_TASK_DAILY_REWARD_LIMIT = 1
const MAKEUP_CARD_REWARD_TITLE = 'Make-up Card'
const MAKEUP_CARD_REWARD_CATEGORY = 'makeup_card'
const EXTRA_DRAW_TICKET_REWARD_TITLE = 'Extra Draw Ticket'
const REROLL_TICKET_REWARD_TITLE = 'Reroll Ticket'
const DRAW_SOURCE_MILESTONE = 'milestone'
const DRAW_SOURCE_TICKET = 'ticket'
const DRAW_REWARD_POINTS_10 = 'points_10'
const DRAW_REWARD_POINTS_20 = 'points_20'
const DRAW_REWARD_POINTS_30 = 'points_30'
const DRAW_REWARD_POINTS_50 = 'points_50'
const DRAW_REWARD_POINTS_100 = 'points_100'
const DRAW_REWARD_DRAW_TICKET = 'draw_ticket'
const DRAW_REWARD_MAKEUP_CARD = 'makeup_card'
const DRAW_REWARD_CHECKIN_X2 = 'checkin_x2'
const DRAW_REWARD_CHECKIN_X3 = 'checkin_x3'
const DRAW_REWARD_NEXT_TASK_10 = 'next_task_bonus_10'
const DRAW_REWARD_NEXT_3_CHECKINS_5 = 'next_3_checkins_bonus_5'
const DRAW_REWARD_WEEKLY_CUSTOM_1 = 'weekly_custom_bonus_1'
const DRAW_REWARD_REROLL_TICKET = 'reroll_ticket'
const THIRTY_DAY_STREAK_POOL_THRESHOLD = 30
const STREAK_DRAW_REWARD_POOL = [
  { code: DRAW_REWARD_POINTS_10, weight: 25.42 },
  { code: DRAW_REWARD_POINTS_20, weight: 19.07 },
  { code: DRAW_REWARD_POINTS_30, weight: 8.47 },
  { code: DRAW_REWARD_DRAW_TICKET, weight: 10.59 },
  { code: DRAW_REWARD_MAKEUP_CARD, weight: 2 },
  { code: DRAW_REWARD_CHECKIN_X2, weight: 10.59 },
  { code: DRAW_REWARD_CHECKIN_X3, weight: 4.24 },
  { code: DRAW_REWARD_NEXT_TASK_10, weight: 8.47 },
  { code: DRAW_REWARD_NEXT_3_CHECKINS_5, weight: 6.36 },
  { code: DRAW_REWARD_WEEKLY_CUSTOM_1, weight: 2.12 },
  { code: DRAW_REWARD_REROLL_TICKET, weight: 2.12 },
  { code: DRAW_REWARD_POINTS_50, weight: 0.5 },
  { code: DRAW_REWARD_POINTS_100, weight: 0.05 },
]
const STREAK_DRAW_REWARD_POOL_30_DAY = [
  { code: DRAW_REWARD_POINTS_20, weight: 20 },
  { code: DRAW_REWARD_POINTS_30, weight: 15 },
  { code: DRAW_REWARD_POINTS_50, weight: 1 },
  { code: DRAW_REWARD_POINTS_100, weight: 0.5 },
  { code: DRAW_REWARD_DRAW_TICKET, weight: 12 },
  { code: DRAW_REWARD_MAKEUP_CARD, weight: 5 },
  { code: DRAW_REWARD_CHECKIN_X2, weight: 13 },
  { code: DRAW_REWARD_CHECKIN_X3, weight: 8 },
  { code: DRAW_REWARD_NEXT_TASK_10, weight: 10 },
  { code: DRAW_REWARD_NEXT_3_CHECKINS_5, weight: 7 },
  { code: DRAW_REWARD_WEEKLY_CUSTOM_1, weight: 3.5 },
  { code: DRAW_REWARD_REROLL_TICKET, weight: 5 },
]
const CANVAS_ENCRYPTION_ALGO = 'aes-256-gcm'
const CANVAS_IV_BYTES = 12
let CANVAS_TOKEN_SECRET = ''
if (process.env.CANVAS_TOKEN_SECRET) {
  CANVAS_TOKEN_SECRET = process.env.CANVAS_TOKEN_SECRET
}
const TASK_MODE_DEADLINE = 'deadline'
const TASK_MODE_RANGE = 'range'
const NEXT_DAY_NOTE_MAX_LENGTH = 200

function normalizeNextDayNote(value) {
  let safeValue = ''
  if (value === null) {
  } else if (value === undefined) {
  } else {
    safeValue = value
  }

  let safeNote = String(safeValue).trim()
  if (!safeNote) {
    return ''
  }

  if (safeNote.length > NEXT_DAY_NOTE_MAX_LENGTH) {
    safeNote = safeNote.slice(0, NEXT_DAY_NOTE_MAX_LENGTH)
  }

  return safeNote
}

function getDateText(value) {
  if (typeof value === 'string') {
    const safeValue = value.trim()
    if (/^\d{4}-\d{2}-\d{2}$/.test(safeValue)) {
      return safeValue
    }
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return ''
  }

  const utcDate = new Date(
    Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()),
  )
  return utcDate.toISOString().slice(0, 10)
}

function getDateTextWithOffset(value, offsetDays) {
  const baseDateText = getDateText(value)
  if (!baseDateText) {
    return ''
  }

  const date = new Date(baseDateText + 'T00:00:00Z')
  date.setUTCDate(date.getUTCDate() + offsetDays)
  return date.toISOString().slice(0, 10)
}

function getWeekWindowFromDateText(dateText) {
  const safeDateText = getDateText(dateText)
  if (safeDateText === '') {
    return {
      weekStart: '',
      weekEndExclusive: '',
    }
  }

  const baseDate = new Date(safeDateText + 'T00:00:00Z')
  const utcDay = baseDate.getUTCDay()
  let daysFromMonday = utcDay - 1
  if (utcDay === 0) {
    daysFromMonday = 6
  }

  const weekStartDate = new Date(baseDate)
  weekStartDate.setUTCDate(baseDate.getUTCDate() - daysFromMonday)

  const weekEndExclusiveDate = new Date(weekStartDate)
  weekEndExclusiveDate.setUTCDate(weekStartDate.getUTCDate() + 7)

  return {
    weekStart: weekStartDate.toISOString().slice(0, 10),
    weekEndExclusive: weekEndExclusiveDate.toISOString().slice(0, 10),
  }
}

function buildCanvasTaskRewardSourceId(courseId, assignmentId) {
  let safeCourseId = ''
  if (courseId !== null && courseId !== undefined) {
    safeCourseId = String(courseId).trim()
  }
  let safeAssignmentId = ''
  if (assignmentId !== null && assignmentId !== undefined) {
    safeAssignmentId = String(assignmentId).trim()
  }
  if (safeCourseId === '' || safeAssignmentId === '') {
    return ''
  }
  return 'canvas:' + safeCourseId + ':' + safeAssignmentId
}

function mapRewardRow(row) {
  let imageUrl = ''
  if (row.image_url) {
    imageUrl = row.image_url
  }
  return {
    id: row.id,
    title: row.title,
    pointsCost: row.points_cost,
    category: row.category,
    imageUrl,
    isActive: row.is_active,
  }
}

function isMakeupCardReward(reward) {
  let safeReward = {}
  if (reward) {
    safeReward = reward
  }

  if (safeReward.category === MAKEUP_CARD_REWARD_CATEGORY) {
    return true
  }
  if (safeReward.title === MAKEUP_CARD_REWARD_TITLE) {
    return true
  }
  return false
}

function isExtraDrawTicketReward(reward) {
  let safeReward = {}
  if (reward) {
    safeReward = reward
  }
  return safeReward.title === EXTRA_DRAW_TICKET_REWARD_TITLE
}

function isRerollTicketReward(reward) {
  let safeReward = {}
  if (reward) {
    safeReward = reward
  }
  return safeReward.title === REROLL_TICKET_REWARD_TITLE
}

function trimTaskTime(value) {
  let safeValue = ''
  if (value === null) {
  } else if (value === undefined) {
  } else {
    safeValue = value
  }
  const safe = String(safeValue).trim()
  if (safe === '') {
    return ''
  }
  return safe.slice(0, 5)
}

function mapCustomTaskRow(row) {
  return {
    id: row.id,
    title: row.title,
    taskDate: row.task_date,
    timingMode: row.timing_mode,
    dueTime: trimTaskTime(row.due_time),
    startTime: trimTaskTime(row.start_time),
    endTime: trimTaskTime(row.end_time),
    isCompleted: Boolean(row.is_completed),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

async function tryGrantTaskReward(
  client,
  { userId, sourceType, sourceId, rewardDate, points, dailyLimit },
) {
  const userResult = await client.query(
    `
    SELECT points
    FROM app_users
    WHERE clerk_user_id = $1
    FOR UPDATE
    `,
    [userId],
  )

  if (userResult.rowCount === 0) {
    return {
      granted: false,
      reason: 'user_not_found',
      gainedPoints: 0,
      totalPoints: 0,
      dailyCountAfterGrant: 0,
      dailyLimit,
    }
  }

  let currentPoints = 0
  if (userResult.rows[0] && userResult.rows[0].points != null) {
    currentPoints = Number(userResult.rows[0].points) || 0
  }

  const existing = await client.query(
    `
    SELECT 1
    FROM app_task_reward_events
    WHERE clerk_user_id = $1
      AND source_type = $2
      AND source_id = $3
    `,
    [userId, sourceType, sourceId],
  )

  if (existing.rowCount > 0) {
    return {
      granted: false,
      reason: 'already_rewarded',
      gainedPoints: 0,
      totalPoints: currentPoints,
      dailyCountAfterGrant: 0,
      dailyLimit,
    }
  }

  const daily = await client.query(
    `
    SELECT COUNT(*)::int AS count
    FROM app_task_reward_events
    WHERE clerk_user_id = $1
      AND reward_date = $2
      AND source_type = $3
    `,
    [userId, rewardDate, sourceType],
  )

  let dailyCount = 0
  if (daily.rows[0] && daily.rows[0].count != null) {
    dailyCount = Number(daily.rows[0].count) || 0
  }
  if (dailyCount >= dailyLimit) {
    return {
      granted: false,
      reason: 'daily_cap_reached',
      gainedPoints: 0,
      totalPoints: currentPoints,
      dailyCountAfterGrant: dailyCount,
      dailyLimit,
    }
  }

  const insertResult = await client.query(
    `
    INSERT INTO app_task_reward_events (
      clerk_user_id,
      source_type,
      source_id,
      reward_date,
      points
    )
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (clerk_user_id, source_type, source_id) DO NOTHING
    RETURNING id
    `,
    [userId, sourceType, sourceId, rewardDate, points],
  )

  if (insertResult.rowCount === 0) {
    return {
      granted: false,
      reason: 'already_rewarded',
      gainedPoints: 0,
      totalPoints: currentPoints,
      dailyCountAfterGrant: dailyCount,
      dailyLimit,
    }
  }

  const updatedUser = await client.query(
    `
    UPDATE app_users
    SET points = points + $2, last_seen_at = NOW()
    WHERE clerk_user_id = $1
    RETURNING points
    `,
    [userId, points],
  )

  let totalPoints = currentPoints + points
  if (updatedUser.rows[0] && updatedUser.rows[0].points != null) {
    totalPoints = Number(updatedUser.rows[0].points) || totalPoints
  }

  return {
    granted: true,
    reason: 'ok',
    gainedPoints: points,
    totalPoints,
    dailyCountAfterGrant: dailyCount + 1,
    dailyLimit,
  }
}

function normalizeDateInput(value) {
  let safeValue = ''
  if (value === null) {
  } else if (value === undefined) {
  } else {
    safeValue = value
  }
  const safe = String(safeValue).trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(safe)) {
    return ''
  }
  return safe
}

function normalizeTimeInput(value) {
  let safeValue = ''
  if (value === null) {
  } else if (value === undefined) {
  } else {
    safeValue = value
  }
  const safe = String(safeValue).trim()
  if (!/^([01]\d|2[0-3]):([0-5]\d)$/.test(safe)) {
    return ''
  }
  return safe
}

function normalizeTaskPayload(body) {
  let safeBody = {}
  if (body) {
    safeBody = body
  }
  let titleValue = ''
  if (safeBody.title === null) {
  } else if (safeBody.title === undefined) {
  } else {
    titleValue = safeBody.title
  }
  const title = String(titleValue).trim()
  const taskDate = normalizeDateInput(safeBody.taskDate)
  let timingMode = TASK_MODE_DEADLINE
  if (safeBody.timingMode === TASK_MODE_RANGE) {
    timingMode = TASK_MODE_RANGE
  }
  const dueTime = normalizeTimeInput(safeBody.dueTime)
  const startTime = normalizeTimeInput(safeBody.startTime)
  const endTime = normalizeTimeInput(safeBody.endTime)
  const isCompleted = Boolean(safeBody.isCompleted)

  if (title === '') {
    return { error: 'Task title is required' }
  }
  if (title.length > 200) {
    return { error: 'Task title is too long' }
  }
  if (taskDate === '') {
    return { error: 'Task date must be YYYY-MM-DD' }
  }

  if (timingMode === TASK_MODE_DEADLINE) {
    if (dueTime === '') {
      return { error: 'Due time must be HH:MM' }
    }
    return {
      title,
      taskDate,
      timingMode,
      dueTime,
      startTime: '',
      endTime: '',
      isCompleted,
    }
  }

  if (startTime === '') {
    return { error: 'Start time and end time must be HH:MM' }
  }
  if (endTime === '') {
    return { error: 'Start time and end time must be HH:MM' }
  }
  if (endTime <= startTime) {
    return { error: 'End time must be later than start time' }
  }

  return {
    title,
    taskDate,
    timingMode,
    dueTime: '',
    startTime,
    endTime,
    isCompleted,
  }
}

function getCanvasSecretKey() {
  if (CANVAS_TOKEN_SECRET === '') {
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

function normalizeCanvasBaseUrl(value) {
  let safeValue = ''
  if (value !== null && value !== undefined) {
    safeValue = value
  }
  const trimmed = String(safeValue).trim()
  if (trimmed === '') {
    return ''
  }
  let withProtocol = 'https://' + trimmed
  if (/^https?:\/\//i.test(trimmed)) {
    withProtocol = trimmed
  }
  return withProtocol.replace(/\/+$/, '')
}

function getKnownCanvasBaseUrl(value) {
  let safeValue = ''
  if (value !== null && value !== undefined) {
    safeValue = value
  }
  const trimmed = String(safeValue).trim()
  if (trimmed === '') {
    return ''
  }

  const normalized = normalizeCanvasBaseUrl(trimmed).toLowerCase()
  if (normalized === 'https://canvas.hull.ac.uk') {
    return 'https://canvas.hull.ac.uk'
  }

  const lower = trimmed.toLowerCase()
  if (lower === 'hull') {
    return 'https://canvas.hull.ac.uk'
  }
  if (lower === 'hull.ac.uk') {
    return 'https://canvas.hull.ac.uk'
  }
  if (lower === 'canvas.hull.ac.uk') {
    return 'https://canvas.hull.ac.uk'
  }

  return ''
}

function buildCanvasBaseUrl(value) {
  let safeValue = ''
  if (value !== null && value !== undefined) {
    safeValue = value
  }
  const trimmed = String(safeValue).trim()
  if (trimmed === '') {
    return ''
  }
  const knownBaseUrl = getKnownCanvasBaseUrl(trimmed)
  if (knownBaseUrl !== '') {
    return knownBaseUrl
  }
  let looksLikeDomain = false
  if (trimmed.includes('.')) {
    looksLikeDomain = true
  } else if (/^https?:\/\//i.test(trimmed)) {
    looksLikeDomain = true
  }
  if (looksLikeDomain) {
    return normalizeCanvasBaseUrl(trimmed)
  }
  return 'https://' + trimmed + '.instructure.com'
}

function buildAbsoluteCanvasUrl(baseUrl, value) {
  let safeValue = ''
  if (value !== null && value !== undefined) {
    safeValue = value
  }
  const trimmed = String(safeValue).trim()
  if (trimmed === '') {
    return ''
  }
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed
  }
  if (trimmed.startsWith('/')) {
    return baseUrl + trimmed
  }
  return baseUrl + '/' + trimmed
}

function parseLinkHeader(header) {
  if (header === null || header === undefined || header === '') {
    return {}
  }
  return header.split(',').reduce(function (acc, part) {
    const match = part.match(/<([^>]+)>\s*;\s*rel="([^"]+)"/)
    if (match) {
      acc[match[2]] = match[1]
    }
    return acc
  }, {})
}

async function fetchCanvasPage(baseUrl, token, pathOrUrl) {
  let url = baseUrl + pathOrUrl
  if (/^https?:\/\//i.test(pathOrUrl)) {
    url = pathOrUrl
  }
  const response = await fetch(url, {
    headers: {
      Authorization: 'Bearer ' + token,
      Accept: 'application/json',
    },
  })

  const raw = await response.text()
  let data = null
  if (raw) {
    try {
      data = JSON.parse(raw)
    } catch (_error) {
      data = null
    }
  }

  if (!response.ok) {
    let errors = []
    if (data && Array.isArray(data.errors)) {
      errors = data.errors
    }
    let firstError = null
    if (errors.length > 0) {
      firstError = errors[0]
    }
    const message =
      (firstError && firstError.message) ||
      (data && data.message) ||
      response.statusText
    throw new Error('Canvas ' + String(response.status) + ' ' + message)
  }

  const links = parseLinkHeader(response.headers.get('link'))
  return {
    data,
    nextUrl: links.next || '',
  }
}

async function fetchCanvasPaged(baseUrl, token, path) {
  let nextUrl = path
  const aggregated = []
  const visited = new Set()

  while (nextUrl) {
    if (visited.has(nextUrl)) break
    visited.add(nextUrl)

    const { data, nextUrl: newNextUrl } = await fetchCanvasPage(baseUrl, token, nextUrl)
    if (!Array.isArray(data)) return data

    aggregated.push(...data)
    nextUrl = newNextUrl
  }

  return aggregated
}
async function getStoredCanvasCredentials(userId) {
  // Make sure the current user already exists in app_users.
  // This avoids missing-user problems before reading saved Canvas credentials.
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
    return { school: '', token: '' }
  }

  const row = result.rows[0]
  let token = ''

  let hasEncryptedToken = false
  if (row.canvas_token_ciphertext) {
    if (row.canvas_token_iv) {
      if (row.canvas_token_tag) {
        hasEncryptedToken = true
      }
    }
  }
  if (hasEncryptedToken) {
    token = decryptCanvasToken(
      row.canvas_token_ciphertext,
      row.canvas_token_iv,
      row.canvas_token_tag,
    )
  }

  return {
    school: row.canvas_school ? row.canvas_school : '',
    token,
  }
}

function sortCanvasAssignmentsByDueAt(a, b) {
  const left = a || {}
  const right = b || {}
  const leftMissing = !left.due_at
  const rightMissing = !right.due_at
  if (leftMissing && rightMissing) {
    return 0
  }
  if (leftMissing) {
    return 1
  }
  if (rightMissing) {
    return -1
  }
  return new Date(left.due_at).getTime() - new Date(right.due_at).getTime()
}

function getCanvasSubmissionOrderKey(submission) {
  const safeSubmission = submission || {}
  const attempt = Number(safeSubmission.attempt || 0)
  const updated = new Date(
    safeSubmission.graded_at || safeSubmission.submitted_at || safeSubmission.updated_at || 0,
  ).getTime()
  return {
    attempt,
    updated,
  }
}

function pickLatestCanvasSubmissions(submissions) {
  let safeSubmissions = []
  if (Array.isArray(submissions)) {
    safeSubmissions = submissions.slice()
  }

  return safeSubmissions.reduce(function (acc, submission, index) {
    const safeSubmission = submission || {}
    const assignment = safeSubmission.assignment || {}
    let assignmentId = safeSubmission.assignment_id
    if (assignmentId === null || assignmentId === undefined || assignmentId === '') {
      assignmentId = assignment.id
    }
    if (assignmentId === null || assignmentId === undefined || assignmentId === '') {
      assignmentId = 'idx_' + String(index)
    }
    const assignmentKey = String(assignmentId)
    const current = acc[assignmentKey]
    if (!current) {
      acc[assignmentKey] = submission
      return acc
    }

    const nextOrder = getCanvasSubmissionOrderKey(submission)
    const currentOrder = getCanvasSubmissionOrderKey(current)
    if (nextOrder.attempt > currentOrder.attempt) {
      acc[assignmentKey] = submission
      return acc
    }
    if (nextOrder.attempt === currentOrder.attempt && nextOrder.updated > currentOrder.updated) {
      acc[assignmentKey] = submission
    }
    return acc
  }, {})
}

function isCanvasSubmissionSubmitted(submission) {
  const safeSubmission = submission || {}
  return Boolean(safeSubmission.submitted_at)
}

function isCanvasSubmissionOnTime(submission) {
  const safeSubmission = submission || {}
  if (!safeSubmission.submitted_at) {
    return false
  }
  if (safeSubmission.late) {
    return false
  }
  return true
}

function normalizeCanvasUpcomingEvent(baseUrl, item, index) {
  const safeItem = item || {}
  const assignment = safeItem.assignment || {}
  const date = safeItem.due_at || safeItem.start_at || safeItem.end_at || null
  let rawId = safeItem.id
  if (rawId === null || rawId === undefined || rawId === '') {
    rawId = safeItem.event_id
  }
  if (rawId === null || rawId === undefined || rawId === '') {
    rawId = safeItem.assignment_id
  }
  if (rawId === null || rawId === undefined || rawId === '') {
    rawId = index
  }
  return {
    id: String(rawId),
    title: safeItem.title || safeItem.name || 'Untitled event',
    course: safeItem.context_name || assignment.course_name || '',
    type: safeItem.type || assignment.type || 'event',
    date,
    htmlUrl: buildAbsoluteCanvasUrl(baseUrl, safeItem.html_url || assignment.html_url || ''),
  }
}

function sortCanvasUpcomingEvents(events) {
  let safeEvents = []
  if (Array.isArray(events)) {
    safeEvents = events.slice()
  }

  return safeEvents.sort(function (left, right) {
    const leftMissing = !left.date
    const rightMissing = !right.date
    if (leftMissing && rightMissing) {
      return 0
    }
    if (leftMissing) {
      return 1
    }
    if (rightMissing) {
      return -1
    }
    const leftTime = new Date(left.date).getTime()
    const rightTime = new Date(right.date).getTime()
    if (leftTime < rightTime) {
      return -1
    }
    if (leftTime > rightTime) {
      return 1
    }
    return 0
  })
}

function buildCanvasCourseDataMap(entries) {
  const assignmentsByCourse = {}
  const enrollmentsByCourse = {}
  const submissionsByCourse = {}

  let safeEntries = []
  if (Array.isArray(entries)) {
    safeEntries = entries
  }

  safeEntries.forEach(function (entry) {
    const safeEntry = entry || {}
    const courseId = String(safeEntry.courseId || '').trim()
    if (courseId === '') {
      return
    }

    let assignments = []
    if (Array.isArray(safeEntry.assignments)) {
      assignments = safeEntry.assignments.slice().sort(sortCanvasAssignmentsByDueAt)
    }
    assignmentsByCourse[courseId] = {
      items: assignments,
    }

    let enrollments = []
    if (Array.isArray(safeEntry.enrollments)) {
      enrollments = safeEntry.enrollments
    }
    enrollmentsByCourse[courseId] = enrollments[0] || null

    const latestByAssignment = pickLatestCanvasSubmissions(safeEntry.submissions)
    const latestSubmissions = Object.values(latestByAssignment)
    const assignmentCount = assignments.length
    const submittedCount = latestSubmissions.filter(isCanvasSubmissionSubmitted).length
    const onTimeCount = latestSubmissions.filter(isCanvasSubmissionOnTime).length

    let completionRate = null
    if (assignmentCount > 0) {
      completionRate = submittedCount / assignmentCount
    }
    let onTimeRate = null
    if (submittedCount > 0) {
      onTimeRate = onTimeCount / submittedCount
    }

    submissionsByCourse[courseId] = {
      items: latestSubmissions,
      byAssignment: latestByAssignment,
      summary: {
        assignmentCount,
        submittedCount,
        completionRate,
        onTimeRate,
      },
    }
  })

  return {
    assignmentsByCourse,
    enrollmentsByCourse,
    submissionsByCourse,
  }
}

async function loadCanvasSnapshot(baseUrl, token) {
  const [profileResult, rawCourses, rawEvents] = await Promise.all([
    fetchCanvasPage(baseUrl, token, '/api/v1/users/self/profile'),
    fetchCanvasPaged(
      baseUrl,
      token,
      '/api/v1/courses?enrollment_type=student&enrollment_state=active&include[]=term&per_page=50',
    ),
    fetchCanvasPaged(baseUrl, token, '/api/v1/users/self/upcoming_events?per_page=50'),
  ])

  let safeCourses = []
  if (Array.isArray(rawCourses)) {
    safeCourses = rawCourses
  }

  let safeEvents = []
  if (Array.isArray(rawEvents)) {
    safeEvents = rawEvents
  }

  const perCourseEntries = await Promise.all(
    safeCourses.map(async function (course) {
      const safeCourse = course || {}
      const courseId = String(safeCourse.id || '').trim()
      if (courseId === '') {
        return null
      }

      try {
        const [rawEnrollments, rawAssignments, rawSubmissions] = await Promise.all([
          fetchCanvasPaged(
            baseUrl,
            token,
            '/api/v1/courses/' +
              encodeURIComponent(courseId) +
              '/enrollments?user_id=self&type[]=StudentEnrollment&state[]=active&include[]=current_points&per_page=50',
          ),
          fetchCanvasPaged(
            baseUrl,
            token,
            '/api/v1/courses/' + encodeURIComponent(courseId) + '/assignments?per_page=50',
          ),
          fetchCanvasPaged(
            baseUrl,
            token,
            '/api/v1/courses/' +
              encodeURIComponent(courseId) +
              '/students/submissions?student_ids[]=self&include[]=assignment&per_page=50',
          ),
        ])

        return {
          courseId,
          enrollments: Array.isArray(rawEnrollments) ? rawEnrollments : [],
          assignments: Array.isArray(rawAssignments) ? rawAssignments : [],
          submissions: Array.isArray(rawSubmissions) ? rawSubmissions : [],
        }
      } catch (_courseError) {
        return {
          courseId,
          enrollments: [],
          assignments: [],
          submissions: [],
        }
      }
    }),
  )

  const courseData = buildCanvasCourseDataMap(
    perCourseEntries.filter(function (entry) {
      return Boolean(entry)
    }),
  )

  return {
    profile: profileResult.data || null,
    courses: safeCourses,
    events: sortCanvasUpcomingEvents(
      safeEvents.map(function (item, index) {
        return normalizeCanvasUpcomingEvent(baseUrl, item, index)
      }),
    ),
    assignmentsByCourse: courseData.assignmentsByCourse,
    enrollmentsByCourse: courseData.enrollmentsByCourse,
    submissionsByCourse: courseData.submissionsByCourse,
  }
}

async function clearStoredCanvasCredentials(userId) {
  await pool.query(`DELETE FROM app_canvas_credentials WHERE clerk_user_id = $1`, [userId])
}

function isInvalidCanvasTokenError(error) {
  if (!(error instanceof Error)) {
    return false
  }
  const normalizedMessage = String(error.message || '').toLowerCase()
  return normalizedMessage.includes('401') && normalizedMessage.includes('invalid access token')
}

async function clearStoredCanvasCredentialsIfTokenInvalid(userId, error) {
  if (!isInvalidCanvasTokenError(error)) {
    return false
  }
  try {
    await clearStoredCanvasCredentials(userId)
  } catch (_clearError) {
    // Best effort only.
  }
  return true
}

async function fetchStoredCanvasSubmissionDetail(userId, courseId, assignmentId) {
  const stored = await getStoredCanvasCredentials(userId)
  if (!stored.school || !stored.token) {
    throw new Error('Connect Canvas first.')
  }

  const params = new URLSearchParams()
  params.append('include[]', 'submission_comments')
  params.append('include[]', 'submission_history')

  const baseUrl = buildCanvasBaseUrl(stored.school)
  const result = await fetchCanvasPage(
    baseUrl,
    stored.token,
    '/api/v1/courses/' +
      encodeURIComponent(courseId) +
      '/assignments/' +
      encodeURIComponent(assignmentId) +
      '/submissions/self?' +
      params.toString(),
  )

  return result.data || null
}

function buildCustomTaskDateTime(task) {
  let safeTask = {}
  if (task) {
    safeTask = task
  }
  let rawTaskDate = ''
  if (safeTask.taskDate) {
    rawTaskDate = safeTask.taskDate
  }
  const date = String(rawTaskDate).trim()
  if (date === '') {
    return ''
  }

  const startTime = trimTaskTime(safeTask.startTime)
  if (safeTask.timingMode === TASK_MODE_RANGE) {
    if (startTime !== '') {
      return date + 'T' + startTime + ':00'
    }
  }

  const dueTime = trimTaskTime(safeTask.dueTime)
  if (dueTime !== '') {
    return date + 'T' + dueTime + ':00'
  }

  return date + 'T12:00:00'
}

function formatHomeTaskSchedule(task) {
  // 把自定义任务转换成首页直接展示的时间文案。
  // 例如：
  // - 20 Mar | Due 18:00
  // - 25 Mar | 09:00 - 10:00
  let safeTask = {}
  if (task) {
    safeTask = task
  }
  let rawTaskDate = ''
  if (safeTask.taskDate) {
    rawTaskDate = safeTask.taskDate
  }
  const taskDate = String(rawTaskDate).trim()
  if (taskDate === '') {
    return 'Date not set'
  }

  const parsed = new Date(taskDate + 'T00:00:00')
  let dateLabel = taskDate
  if (Number.isNaN(parsed.getTime()) === false) {
    dateLabel = parsed.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
    })
  }

  if (safeTask.timingMode === TASK_MODE_RANGE) {
    const start = trimTaskTime(safeTask.startTime)
    const end = trimTaskTime(safeTask.endTime)
    let safeStart = '--:--'
    if (start !== '') {
      safeStart = start
    }
    let safeEnd = '--:--'
    if (end !== '') {
      safeEnd = end
    }
    return dateLabel + ' | ' + safeStart + ' - ' + safeEnd
  }

  let dueLabel = '--:--'
  const dueTime = trimTaskTime(safeTask.dueTime)
  if (dueTime !== '') {
    dueLabel = dueTime
  }
  return dateLabel + ' | Due ' + dueLabel
}

function getCanvasPlanDate(item) {
  // Canvas 不同类型的任务，时间字段不完全一致。
  // 这里按优先级兜底，尽量拿到最准确的截止时间。
  let safeItem = {}
  if (item) {
    safeItem = item
  }
  let plannable = {}
  if (safeItem.plannable) {
    plannable = safeItem.plannable
  }
  let assignment = {}
  if (safeItem.assignment) {
    assignment = safeItem.assignment
  }
  return (
    plannable.due_at ||
    plannable.todo_date ||
    safeItem.plannable_date ||
    assignment.due_at ||
    safeItem.due_at ||
    safeItem.start_at ||
    safeItem.end_at ||
    plannable.all_day_date ||
    safeItem.all_day_date ||
    ''
  )
}

function getCanvasPlanTitle(item) {
  // Canvas 标题字段可能出现在 plannable / assignment / 顶层对象里，
  // 这里统一做一次提取，减少前端重复判断。
  let safeItem = {}
  if (item) {
    safeItem = item
  }
  let plannable = {}
  if (safeItem.plannable) {
    plannable = safeItem.plannable
  }
  let assignment = {}
  if (safeItem.assignment) {
    assignment = safeItem.assignment
  }
  return (
    plannable.name ||
    plannable.title ||
    safeItem.title ||
    safeItem.name ||
    assignment.name ||
    'Untitled event'
  )
}

function getCanvasPlanType(item) {
  // 把 Canvas 返回的原始类型整理成更适合前端直接显示的文本。
  let safeItem = {}
  if (item) {
    safeItem = item
  }
  let assignment = {}
  if (safeItem.assignment) {
    assignment = safeItem.assignment
  }
  let rawType = 'event'
  if (safeItem.plannable_type) {
    rawType = safeItem.plannable_type
  } else if (safeItem.type) {
    rawType = safeItem.type
  } else if (assignment.type) {
    rawType = assignment.type
  } else if (safeItem.linked_object_type) {
    rawType = safeItem.linked_object_type
  }
  return String(rawType).replace(/_/g, ' ')
}

function getCanvasPlanCourse(item, courseNameById) {
  // 先用 course_id 去课程表里找正式课程名，
  // 如果没有，再退回 Canvas 返回对象里的上下文字段。
  let safeItem = {}
  if (item) {
    safeItem = item
  }
  let assignment = {}
  if (safeItem.assignment) {
    assignment = safeItem.assignment
  }
  let plannable = {}
  if (safeItem.plannable) {
    plannable = safeItem.plannable
  }
  let rawCourseId = ''
  if (safeItem.course_id) {
    rawCourseId = safeItem.course_id
  } else if (safeItem.context_id) {
    rawCourseId = safeItem.context_id
  }
  const courseId = String(rawCourseId)
  if (courseId !== '') {
    if (courseNameById[courseId]) {
      return courseNameById[courseId]
    }
  }

  return (
    safeItem.context_name ||
    safeItem.course_name ||
    assignment.course_name ||
    plannable.context_name ||
    ''
  )
}

function getCanvasPlanCourseId(item) {
  let safeItem = {}
  if (item) {
    safeItem = item
  }
  let assignment = {}
  if (safeItem.assignment) {
    assignment = safeItem.assignment
  }
  let plannable = {}
  if (safeItem.plannable) {
    plannable = safeItem.plannable
  }
  let courseId = ''
  if (safeItem.course_id) {
    courseId = safeItem.course_id
  } else if (safeItem.context_id) {
    courseId = safeItem.context_id
  } else if (assignment.course_id) {
    courseId = assignment.course_id
  } else if (plannable.course_id) {
    courseId = plannable.course_id
  }
  if (courseId === '') {
    return ''
  }
  return String(courseId)
}

function getCanvasPlanAssignmentId(item) {
  let safeItem = {}
  if (item) {
    safeItem = item
  }
  let assignment = {}
  if (safeItem.assignment) {
    assignment = safeItem.assignment
  }
  let plannable = {}
  if (safeItem.plannable) {
    plannable = safeItem.plannable
  }
  let assignmentId = ''
  if (safeItem.assignment_id) {
    assignmentId = safeItem.assignment_id
  } else if (assignment.id) {
    assignmentId = assignment.id
  }
  let safePlannableType = ''
  if (safeItem.plannable_type) {
    safePlannableType = safeItem.plannable_type
  }
  if (assignmentId === '') {
    if (String(safePlannableType).toLowerCase() === 'assignment') {
      if (plannable.id) {
        assignmentId = plannable.id
      }
    }
  }
  if (assignmentId === '') {
    return ''
  }
  return String(assignmentId)
}

function toFiniteNumber(value) {
  const parsed = Number(value)
  if (Number.isFinite(parsed)) {
    return parsed
  }
  return null
}

function normalizeTeacherComments(submission) {
  let safeSubmission = {}
  if (submission) {
    safeSubmission = submission
  }
  let safeComments = []
  if (Array.isArray(safeSubmission.submission_comments)) {
    safeComments = safeSubmission.submission_comments
  }
  let rawUserId = ''
  if (safeSubmission.user_id) {
    rawUserId = safeSubmission.user_id
  }
  const currentUserId = String(rawUserId)

  return safeComments
    .filter(function (comment) {
      let safeComment = {}
      if (comment) {
        safeComment = comment
      }
      let rawCommentText = ''
      if (safeComment.comment) {
        rawCommentText = safeComment.comment
      }
      const commentText = String(rawCommentText).trim()
      if (commentText === '') {
        return false
      }
      if (currentUserId === '') {
        return true
      }
      let rawAuthorId = ''
      if (safeComment.author_id) {
        rawAuthorId = safeComment.author_id
      }
      const authorId = String(rawAuthorId)
      if (authorId === currentUserId) {
        return false
      }
      return true
    })
    .map(function (comment, index) {
      let safeComment = {}
      if (comment) {
        safeComment = comment
      }
      let commentId = 'comment-' + String(index)
      if (safeComment.id) {
        commentId = String(safeComment.id)
      }
      let authorName = 'Teacher'
      if (safeComment.author_name) {
        authorName = String(safeComment.author_name)
      }
      let commentText = ''
      if (safeComment.comment) {
        commentText = String(safeComment.comment).trim()
      }
      let createdAt = ''
      if (safeComment.created_at) {
        createdAt = String(safeComment.created_at)
      }
      return {
        id: commentId,
        authorName,
        comment: commentText,
        createdAt,
      }
    })
}

function mapCustomTaskToPlanItem(task) {
  // 把数据库里的自定义任务转换成首页 /home/plan 能直接使用的统一结构。
  // 统一后，首页就能把 custom task 和 Canvas task 一起排序展示。
  const safeTask = task || {}
  const date = buildCustomTaskDateTime(safeTask)
  const sortTs = new Date(date).getTime()
  let type = 'due time'
  if (safeTask.timingMode === TASK_MODE_RANGE) {
    type = 'time range'
  }
  let timestampMs = null
  if (!Number.isNaN(sortTs)) {
    timestampMs = sortTs
  }
  let safeSortTs = Number.MAX_SAFE_INTEGER
  if (!Number.isNaN(sortTs)) {
    safeSortTs = sortTs
  }

  return {
    id: 'custom-' + String(safeTask.id),
    source: 'custom',
    title: safeTask.title || 'Untitled task',
    course: '',
    type,
    date,
    timestampMs,
    htmlUrl: '',
    isCompleted: Boolean(safeTask.isCompleted),
    taskDate: safeTask.taskDate || '',
    timingMode: safeTask.timingMode || TASK_MODE_DEADLINE,
    dueTime: trimTaskTime(safeTask.dueTime),
    startTime: trimTaskTime(safeTask.startTime),
    endTime: trimTaskTime(safeTask.endTime),
    scheduleText: formatHomeTaskSchedule(safeTask),
    sortTs: safeSortTs,
  }
}

function mapCanvasEventToPlanItem(item, index, options = {}) {
  const { baseUrl = '', courseNameById = {} } = options
  let completed = false
  if (options && options.isCompleted) {
    completed = true
  }
  const safeItem = item || {}
  const plannable = safeItem.plannable || {}
  const assignment = safeItem.assignment || {}
  const date = getCanvasPlanDate(safeItem)
  if (!date) return null

  const sortTs = new Date(date).getTime()
  if (Number.isNaN(sortTs)) return null

  return {
    id: 'canvas-' + String(safeItem.id || safeItem.event_id || safeItem.assignment_id || index),
    source: 'canvas',
    title: getCanvasPlanTitle(safeItem),
    course: getCanvasPlanCourse(safeItem, courseNameById),
    courseId: getCanvasPlanCourseId(safeItem),
    assignmentId: getCanvasPlanAssignmentId(safeItem),
    type: getCanvasPlanType(safeItem),
    date,
    timestampMs: sortTs,
    htmlUrl: buildAbsoluteCanvasUrl(
      baseUrl,
      safeItem.html_url || plannable.html_url || assignment.html_url || '',
    ),
    isCompleted: completed,
    grade: '',
    score: null,
    pointsPossible: null,
    submittedAt: '',
    teacherComments: [],
    rewardSourceId: '',
    rewardEligible: false,
    rewardAlreadyClaimed: false,
    rewardDailyCapReached: false,
    sortTs,
  }
}

async function fetchCanvasSubmissionDetailsForCourse(baseUrl, token, courseId, assignmentIds) {
  let safeAssignmentIds = []
  if (Array.isArray(assignmentIds)) {
    safeAssignmentIds = assignmentIds
      .map(function (assignmentId) {
        let safeAssignmentId = ''
        if (assignmentId) {
          safeAssignmentId = assignmentId
        }
        return String(safeAssignmentId).trim()
      })
      .filter(Boolean)
  }
  if (courseId === '' || courseId === null || courseId === undefined) {
    return []
  }
  if (safeAssignmentIds.length === 0) {
    return []
  }

  const params = new URLSearchParams()
  params.append('student_ids[]', 'self')
  safeAssignmentIds.forEach(function (assignmentId) {
    params.append('assignment_ids[]', assignmentId)
  })
  params.append('include[]', 'submission_comments')
  params.append('include[]', 'assignment')
  params.append('per_page', String(Math.max(50, safeAssignmentIds.length)))

  const path =
    '/api/v1/courses/' + encodeURIComponent(courseId) + '/students/submissions?' + params.toString()

  return fetchCanvasPaged(baseUrl, token, path)
}

async function enrichPlanItemsWithSubmissionDetails(baseUrl, token, items) {
  let safeItems = []
  if (Array.isArray(items)) {
    safeItems = items.slice()
  }
  const assignmentIdsByCourse = {}

  safeItems.forEach(function (item) {
    const safeItem = item || {}
    if (safeItem.source !== 'canvas') {
      return
    }
    if (!safeItem.courseId) {
      return
    }
    if (!safeItem.assignmentId) {
      return
    }
    if (!assignmentIdsByCourse[safeItem.courseId]) {
      assignmentIdsByCourse[safeItem.courseId] = new Set()
    }
    assignmentIdsByCourse[safeItem.courseId].add(String(safeItem.assignmentId))
  })

  const submissionByKey = {}

  await Promise.all(
    Object.entries(assignmentIdsByCourse).map(async function ([courseId, assignmentIdsSet]) {
      try {
        const details = await fetchCanvasSubmissionDetailsForCourse(
          baseUrl,
          token,
          courseId,
          Array.from(assignmentIdsSet),
        )
        let safeDetails = []
        if (Array.isArray(details)) {
          safeDetails = details
        }
        safeDetails.forEach(function (detail) {
          const safeDetail = detail || {}
          let rawAssignmentId = ''
          if (safeDetail.assignment_id) {
            rawAssignmentId = safeDetail.assignment_id
          } else if (safeDetail.assignment) {
            if (safeDetail.assignment.id) {
              rawAssignmentId = safeDetail.assignment.id
            }
          }
          const assignmentId = String(rawAssignmentId)
          if (assignmentId === '') {
            return
          }
          submissionByKey[String(courseId) + ':' + assignmentId] = safeDetail
        })
      } catch (detailError) {
        console.error('[BE] /home/plan submission detail error:', detailError)
      }
    }),
  )

  return safeItems.map(function (item) {
    const safeItem = item || {}
    if (safeItem.source !== 'canvas') {
      return safeItem
    }
    if (!safeItem.courseId) {
      return safeItem
    }
    if (!safeItem.assignmentId) {
      return safeItem
    }
    const detailKey = String(safeItem.courseId) + ':' + String(safeItem.assignmentId)
    const detail = submissionByKey[detailKey]
    if (!detail) {
      return safeItem
    }

    const assignment = detail.assignment || {}
    const score = toFiniteNumber(detail.score)
    let pointsPossible = toFiniteNumber(assignment.points_possible)
    if (pointsPossible === null) {
      pointsPossible = toFiniteNumber(detail.points_possible)
    }

    return {
      ...safeItem,
      grade: detail.grade ? String(detail.grade) : '',
      score,
      pointsPossible,
      submittedAt: detail.submitted_at ? String(detail.submitted_at) : '',
      teacherComments: normalizeTeacherComments(detail),
    }
  })
}

async function annotateCanvasRewardStateForPlanItems(userId, items) {
  let safeItems = []
  if (Array.isArray(items)) {
    safeItems = items.slice()
  }

  const sourceIds = []
  safeItems.forEach(function (item) {
    const safeItem = item || {}
    const rewardSourceId = buildCanvasTaskRewardSourceId(
      safeItem.courseId,
      safeItem.assignmentId,
    )
    if (rewardSourceId !== '') {
      sourceIds.push(rewardSourceId)
    }
  })

  if (sourceIds.length === 0) {
    return safeItems
  }

  const uniqueSourceIds = Array.from(new Set(sourceIds))
  const rewardedResult = await pool.query(
    `
    SELECT source_id
    FROM app_task_reward_events
    WHERE clerk_user_id = $1
      AND source_type = 'canvas_task'
      AND source_id = ANY($2::text[])
    `,
    [userId, uniqueSourceIds],
  )
  const rewardedSourceIds = new Set(
    rewardedResult.rows.map(function (row) {
      return String(row.source_id)
    }),
  )

  const today = await getLondonToday()
  const dailyResult = await pool.query(
    `
    SELECT COUNT(*)::int AS count
    FROM app_task_reward_events
    WHERE clerk_user_id = $1
      AND reward_date = $2
      AND source_type = 'canvas_task'
    `,
    [userId, today],
  )

  let dailyCount = 0
  if (dailyResult.rows[0] && dailyResult.rows[0].count != null) {
    dailyCount = Number(dailyResult.rows[0].count) || 0
  }
  const dailyCapReached = dailyCount >= CANVAS_TASK_DAILY_REWARD_LIMIT

  return safeItems.map(function (item) {
    const safeItem = item || {}
    const rewardSourceId = buildCanvasTaskRewardSourceId(
      safeItem.courseId,
      safeItem.assignmentId,
    )
    if (rewardSourceId === '') {
      return safeItem
    }

    const rewardEligible = Boolean(safeItem.isCompleted && safeItem.submittedAt)
    const rewardAlreadyClaimed = rewardedSourceIds.has(rewardSourceId)
    let rewardDailyCapReached = false
    if (rewardEligible && !rewardAlreadyClaimed && dailyCapReached) {
      rewardDailyCapReached = true
    }

    return {
      ...safeItem,
      rewardSourceId,
      rewardEligible,
      rewardAlreadyClaimed,
      rewardDailyCapReached,
    }
  })
}

function sortPlanItemsAscending(items) {
  let safeItems = []
  if (Array.isArray(items)) {
    safeItems = items.slice()
  }
  safeItems.sort(function (left, right) {
    if (left.sortTs !== right.sortTs) {
      return left.sortTs - right.sortTs
    }
    return String(left.title || '').localeCompare(String(right.title || ''))
  })
  return safeItems
}

function sortPlanItemsDescending(items) {
  let safeItems = []
  if (Array.isArray(items)) {
    safeItems = items.slice()
  }
  safeItems.sort(function (left, right) {
    if (left.sortTs !== right.sortTs) {
      return right.sortTs - left.sortTs
    }
    return String(left.title || '').localeCompare(String(right.title || ''))
  })
  return safeItems
}

function stripPlanSortTs(items) {
  let safeItems = []
  if (Array.isArray(items)) {
    safeItems = items
  }
  return safeItems.map(function (item) {
    const nextItem = { ...item }
    delete nextItem.sortTs
    return nextItem
  })
}

function buildReviewSummary(items) {
  let safeItems = []
  if (Array.isArray(items)) {
    safeItems = items
  }
  const totalCount = safeItems.length
  let completedCount = 0
  safeItems.forEach(function (item) {
    const safeItem = item || {}
    if (safeItem.isCompleted) {
      completedCount += 1
    }
  })
  return {
    totalCount,
    completedCount,
  }
}

async function getStreakDays(db, userId, today) {
  const todayText = getDateText(today)
  const yesterdayText = getDateTextWithOffset(today, -1)

  if (!todayText || !yesterdayText) {
    return 0
  }

  let anchorDate = ''
  const anchorResult = await db.query(
    `
    SELECT checkin_date::text AS checkin_date
    FROM app_checkins
    WHERE clerk_user_id = $1
      AND checkin_date IN ($2::date, $3::date)
    ORDER BY checkin_date DESC
    LIMIT 1
    `,
    [userId, todayText, yesterdayText],
  )

  if (anchorResult.rows && anchorResult.rows.length > 0) {
    if (anchorResult.rows[0] && anchorResult.rows[0].checkin_date) {
      anchorDate = String(anchorResult.rows[0].checkin_date)
    }
  }

  if (!anchorDate) {
    return 0
  }

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
    [userId, anchorDate],
  )

  let firstRow = null
  if (r.rows && r.rows.length > 0) {
    firstRow = r.rows[0]
  }
  if (firstRow && firstRow.streak != null) {
    return firstRow.streak
  }
  return 0
}

async function getMakeupCardStatus(db, userId, today) {
  const yesterday = getDateTextWithOffset(today, -1)
  if (!yesterday) {
    throw new Error('Cannot resolve yesterday date')
  }

  const userResult = await db.query(
    `
    SELECT COALESCE(makeup_cards, 0)::int AS makeup_cards
    FROM app_users
    WHERE clerk_user_id = $1
    LIMIT 1
    `,
    [userId],
  )

  let makeupCards = 0
  if (userResult.rows && userResult.rows.length > 0) {
    if (userResult.rows[0] && userResult.rows[0].makeup_cards != null) {
      makeupCards = Number(userResult.rows[0].makeup_cards) || 0
    }
  }

  const yesterdayCheckinResult = await db.query(
    `
    SELECT id
    FROM app_checkins
    WHERE clerk_user_id = $1 AND checkin_date = $2
    LIMIT 1
    `,
    [userId, yesterday],
  )

  let yesterdayCheckedIn = false
  if (yesterdayCheckinResult.rows && yesterdayCheckinResult.rows.length > 0) {
    yesterdayCheckedIn = true
  }

  let canUse = false
  if (makeupCards > 0) {
    if (!yesterdayCheckedIn) {
      canUse = true
    }
  }

  return {
    today,
    yesterday,
    makeupCards,
    yesterdayCheckedIn,
    canUse,
  }
}

function getRewardPointsFromSequence(streakDays, rewards) {
  let safeStreakDays = Number(streakDays)
  if (!Number.isFinite(safeStreakDays)) {
    safeStreakDays = 0
  }

  if (safeStreakDays >= 1 && safeStreakDays <= rewards.length) {
    return rewards[safeStreakDays - 1]
  }
  return CHECKIN_POINTS
}

function getCheckinRewardPoints(streakDays, useNewUserBonusPhase) {
  if (useNewUserBonusPhase) {
    return getRewardPointsFromSequence(streakDays, NEW_USER_FIRST_WEEK_REWARDS)
  }
  return getRewardPointsFromSequence(streakDays, RESTART_STREAK_REWARDS)
}

async function ensureRewardStateRow(userId, db = pool) {
  await db.query(
    `
    INSERT INTO app_user_reward_state (clerk_user_id, updated_at)
    VALUES ($1, NOW())
    ON CONFLICT (clerk_user_id) DO UPDATE SET updated_at = NOW()
    `,
    [userId],
  )
}

function getCurrentWeekKey(today) {
  const weeklyWindow = getWeekWindowFromDateText(today)
  return weeklyWindow.weekStart
}

function getDrawRewardDefinition(code) {
  switch (code) {
    case DRAW_REWARD_POINTS_10:
      return {
        code,
        title: '+10 points',
        description: 'Add 10 points right now.',
      }
    case DRAW_REWARD_POINTS_20:
      return {
        code,
        title: '+20 points',
        description: 'Add 20 points right now.',
      }
    case DRAW_REWARD_POINTS_30:
      return {
        code,
        title: '+30 points',
        description: 'Add 30 points right now.',
      }
    case DRAW_REWARD_POINTS_50:
      return {
        code,
        title: '+50 points',
        description: 'Add 50 points right now.',
      }
    case DRAW_REWARD_POINTS_100:
      return {
        code,
        title: '+100 points',
        description: 'Add 100 points right now.',
      }
    case DRAW_REWARD_DRAW_TICKET:
      return {
        code,
        title: 'Extra draw ticket',
        description: 'Use one extra ticket for another draw.',
      }
    case DRAW_REWARD_MAKEUP_CARD:
      return {
        code,
        title: 'Make-up card',
        description: 'Repair yesterday once when you miss a check-in.',
      }
    case DRAW_REWARD_CHECKIN_X2:
      return {
        code,
        title: 'Tomorrow check-in x2',
        description: 'Your next check-in reward is doubled once.',
      }
    case DRAW_REWARD_CHECKIN_X3:
      return {
        code,
        title: 'Tomorrow check-in x3',
        description: 'Your next check-in reward is tripled once.',
      }
    case DRAW_REWARD_NEXT_TASK_10:
      return {
        code,
        title: 'Next task +10',
        description: 'The next rewarded task gives 10 extra points.',
      }
    case DRAW_REWARD_NEXT_3_CHECKINS_5:
      return {
        code,
        title: 'Next 3 check-ins +5',
        description: 'Each of your next 3 check-ins gets +5.',
      }
    case DRAW_REWARD_WEEKLY_CUSTOM_1:
      return {
        code,
        title: 'This week custom task +1',
        description: 'Each rewarded custom task gets +1 for this week.',
      }
    case DRAW_REWARD_REROLL_TICKET:
      return {
        code,
        title: 'Reroll ticket',
        description: 'Use one reroll to redraw the current result.',
      }
    default:
      return {
        code: '',
        title: '',
        description: '',
      }
  }
}

function buildDrawRewardPayload(code) {
  switch (code) {
    case DRAW_REWARD_POINTS_10:
      return { points: 10 }
    case DRAW_REWARD_POINTS_20:
      return { points: 20 }
    case DRAW_REWARD_POINTS_30:
      return { points: 30 }
    case DRAW_REWARD_POINTS_50:
      return { points: 50 }
    case DRAW_REWARD_POINTS_100:
      return { points: 100 }
    case DRAW_REWARD_CHECKIN_X2:
      return { multiplier: 2 }
    case DRAW_REWARD_CHECKIN_X3:
      return { multiplier: 3 }
    case DRAW_REWARD_NEXT_TASK_10:
      return { bonusPoints: 10 }
    case DRAW_REWARD_NEXT_3_CHECKINS_5:
      return { remaining: 3, bonusPerCheckin: 5 }
    case DRAW_REWARD_WEEKLY_CUSTOM_1:
      return { bonusPerTask: 1 }
    default:
      return {}
  }
}

function rollStreakDrawReward(pool = STREAK_DRAW_REWARD_POOL) {
  const safePool =
    Array.isArray(pool) && pool.length > 0 ? pool : STREAK_DRAW_REWARD_POOL

  let totalWeight = 0
  safePool.forEach(function (item) {
    totalWeight += item.weight
  })

  let roll = Math.random() * totalWeight
  for (const item of safePool) {
    roll -= item.weight
    if (roll < 0) {
      return {
        code: item.code,
        payload: buildDrawRewardPayload(item.code),
      }
    }
  }

  const fallback = safePool[0]
  return {
    code: fallback.code,
    payload: buildDrawRewardPayload(fallback.code),
  }
}

function rollStreakDrawChoices(count = 3, pool = STREAK_DRAW_REWARD_POOL) {
  const choices = []
  const usedCodes = new Set()
  let guard = 0

  while (choices.length < count && guard < 100) {
    guard += 1
    const rolledReward = rollStreakDrawReward(pool)
    if (usedCodes.has(rolledReward.code)) {
      continue
    }

    usedCodes.add(rolledReward.code)
    choices.push(rolledReward)
  }

  return choices
}

function getStreakDrawPoolByContext(source, streakDays) {
  if (source !== DRAW_SOURCE_MILESTONE) {
    return STREAK_DRAW_REWARD_POOL
  }

  const safeStreakDays = Number(streakDays) || 0
  if (safeStreakDays >= THIRTY_DAY_STREAK_POOL_THRESHOLD) {
    return STREAK_DRAW_REWARD_POOL_30_DAY
  }
  return STREAK_DRAW_REWARD_POOL
}

function parsePendingRewardPayload(value) {
  if (!value) {
    return {}
  }
  if (typeof value === 'object') {
    return value
  }
  try {
    const parsed = JSON.parse(String(value))
    if (parsed && typeof parsed === 'object') {
      return parsed
    }
  } catch (_error) {
    // no-op
  }
  return {}
}

function parsePendingRewardChoices(value) {
  let safeValue = value
  if (!safeValue) {
    return []
  }

  if (typeof safeValue === 'string') {
    try {
      safeValue = JSON.parse(safeValue)
    } catch (_error) {
      return []
    }
  }

  if (!Array.isArray(safeValue)) {
    return []
  }

  return safeValue
    .map(function (item) {
      const safeItem = item || {}
      const code = String(safeItem.code || '').trim()
      if (code === '') {
        return null
      }
      return {
        code,
        payload: parsePendingRewardPayload(safeItem.payload),
      }
    })
    .filter(Boolean)
}

function mapPendingReward(code, payload) {
  const definition = getDrawRewardDefinition(code)
  if (!definition.code) {
    return null
  }
  return {
    code: definition.code,
    title: definition.title,
    description: definition.description,
    payload: payload || {},
  }
}

function mapPendingDraw(choices, selectedIndex, source) {
  const safeChoices = Array.isArray(choices) ? choices : []
  if (safeChoices.length === 0) {
    return null
  }

  const safeSelectedIndex = Number.isInteger(selectedIndex) ? selectedIndex : -1
  const revealed = safeSelectedIndex >= 0 && safeSelectedIndex < safeChoices.length

  return {
    source: String(source || '').trim(),
    revealed,
    selectedIndex: revealed ? safeSelectedIndex : -1,
    choices: safeChoices.map(function (choice, index) {
      if (!revealed) {
        return {
          index,
          selected: false,
          revealed: false,
        }
      }

      const mappedChoice = mapPendingReward(choice.code, choice.payload)
      if (!mappedChoice) {
        return {
          index,
          selected: index === safeSelectedIndex,
          revealed: true,
          title: 'Unknown reward',
          description: '',
          code: '',
          payload: {},
        }
      }

      return {
        ...mappedChoice,
        index,
        selected: index === safeSelectedIndex,
        revealed: true,
      }
    }),
  }
}

function mapRewardStateRow(row, today, makeupCards = 0) {
  const safeRow = row || {}
  const currentWeekKey = getCurrentWeekKey(today)
  let weeklyCustomBonusPerTask = Number(safeRow.weekly_custom_bonus_per_task) || 0
  let weeklyCustomBonusWeekKey = String(safeRow.weekly_custom_bonus_week_key || '').trim()
  if (weeklyCustomBonusWeekKey !== currentWeekKey) {
    weeklyCustomBonusPerTask = 0
    weeklyCustomBonusWeekKey = ''
  }

  const pendingRewardCode = String(safeRow.pending_reward_code || '').trim()
  const pendingRewardPayload = parsePendingRewardPayload(safeRow.pending_reward_payload)
  let pendingRewardChoices = parsePendingRewardChoices(safeRow.pending_reward_choices)
  let pendingRewardSelectedIndex = Number(safeRow.pending_reward_selected_index)
  if (!Number.isInteger(pendingRewardSelectedIndex)) {
    pendingRewardSelectedIndex = -1
  }

  if (pendingRewardChoices.length === 0 && pendingRewardCode !== '') {
    pendingRewardChoices = [
      {
        code: pendingRewardCode,
        payload: pendingRewardPayload,
      },
    ]
    pendingRewardSelectedIndex = 0
  }

  const pendingDraw = mapPendingDraw(
    pendingRewardChoices,
    pendingRewardSelectedIndex,
    safeRow.pending_reward_source,
  )
  let pendingReward = null
  if (pendingDraw && pendingDraw.revealed) {
    pendingReward = pendingDraw.choices[pendingDraw.selectedIndex] || null
  }

  return {
    milestoneDraws: Number(safeRow.milestone_draws) || 0,
    drawTickets: Number(safeRow.draw_tickets) || 0,
    rerollTickets: Number(safeRow.reroll_tickets) || 0,
    nextCheckinMultiplier: Math.max(1, Number(safeRow.next_checkin_multiplier) || 1),
    nextTaskBonusPoints: Number(safeRow.next_task_bonus_points) || 0,
    bonusCheckinsRemaining: Number(safeRow.bonus_checkins_remaining) || 0,
    bonusPerCheckin: Number(safeRow.bonus_per_checkin) || 0,
    weeklyCustomBonusPerTask,
    weeklyCustomBonusWeekKey,
    makeupCards,
    pendingRewardSource: String(safeRow.pending_reward_source || '').trim(),
    pendingRewardChoices,
    pendingRewardSelectedIndex,
    pendingDraw,
    pendingReward,
  }
}

function applyCheckinRewardBonuses(basePoints, rewardState) {
  const nextState = {
    ...rewardState,
  }

  let multiplierApplied = 1
  if (nextState.nextCheckinMultiplier > 1) {
    multiplierApplied = nextState.nextCheckinMultiplier
  }

  let grantedPoints = basePoints * multiplierApplied
  let extraCheckinBonus = 0
  if (nextState.bonusCheckinsRemaining > 0 && nextState.bonusPerCheckin > 0) {
    extraCheckinBonus = nextState.bonusPerCheckin
    grantedPoints += extraCheckinBonus
    nextState.bonusCheckinsRemaining -= 1
    if (nextState.bonusCheckinsRemaining <= 0) {
      nextState.bonusCheckinsRemaining = 0
      nextState.bonusPerCheckin = 0
    }
  }

  nextState.nextCheckinMultiplier = 1

  return {
    nextState,
    grantedPoints,
    multiplierApplied,
    extraCheckinBonus,
  }
}

function applyTaskRewardBonuses(rewardState, today, options = {}) {
  const nextState = {
    ...rewardState,
  }
  const currentWeekKey = getCurrentWeekKey(today)

  let bonusPoints = 0
  let nextTaskBonusApplied = 0
  if (options.includeNextTaskBonus && nextState.nextTaskBonusPoints > 0) {
    nextTaskBonusApplied = nextState.nextTaskBonusPoints
    bonusPoints += nextTaskBonusApplied
    nextState.nextTaskBonusPoints = 0
  }

  let weeklyCustomBonusApplied = 0
  if (
    options.includeWeeklyCustomBonus &&
    nextState.weeklyCustomBonusWeekKey === currentWeekKey &&
    nextState.weeklyCustomBonusPerTask > 0
  ) {
    weeklyCustomBonusApplied = nextState.weeklyCustomBonusPerTask
    bonusPoints += weeklyCustomBonusApplied
  }

  return {
    nextState,
    bonusPoints,
    nextTaskBonusApplied,
    weeklyCustomBonusApplied,
  }
}

function applyAcceptedDrawReward(rewardState, rewardCode, rewardPayload, today) {
  const nextState = {
    ...rewardState,
  }
  const currentWeekKey = getCurrentWeekKey(today)
  let grantedPoints = 0
  let makeupCardIncrement = 0

  switch (rewardCode) {
    case DRAW_REWARD_POINTS_10:
    case DRAW_REWARD_POINTS_20:
    case DRAW_REWARD_POINTS_30:
    case DRAW_REWARD_POINTS_50:
    case DRAW_REWARD_POINTS_100:
      grantedPoints = Number(rewardPayload.points) || 0
      break
    case DRAW_REWARD_DRAW_TICKET:
      nextState.drawTickets += 1
      break
    case DRAW_REWARD_MAKEUP_CARD:
      makeupCardIncrement = 1
      break
    case DRAW_REWARD_CHECKIN_X2:
    case DRAW_REWARD_CHECKIN_X3:
      nextState.nextCheckinMultiplier = Math.max(
        nextState.nextCheckinMultiplier,
        Number(rewardPayload.multiplier) || 1,
      )
      break
    case DRAW_REWARD_NEXT_TASK_10:
      nextState.nextTaskBonusPoints = Math.max(
        nextState.nextTaskBonusPoints,
        Number(rewardPayload.bonusPoints) || 0,
      )
      break
    case DRAW_REWARD_NEXT_3_CHECKINS_5:
      nextState.bonusPerCheckin = Math.max(
        nextState.bonusPerCheckin,
        Number(rewardPayload.bonusPerCheckin) || 0,
      )
      nextState.bonusCheckinsRemaining += Number(rewardPayload.remaining) || 0
      break
    case DRAW_REWARD_WEEKLY_CUSTOM_1:
      nextState.weeklyCustomBonusPerTask = Math.max(
        nextState.weeklyCustomBonusPerTask,
        Number(rewardPayload.bonusPerTask) || 0,
      )
      nextState.weeklyCustomBonusWeekKey = currentWeekKey
      break
    case DRAW_REWARD_REROLL_TICKET:
      nextState.rerollTickets += 1
      break
    default:
      break
  }

  nextState.pendingRewardSource = ''
  nextState.pendingRewardChoices = []
  nextState.pendingRewardSelectedIndex = -1
  nextState.pendingDraw = null
  nextState.pendingReward = null

  return {
    nextState,
    grantedPoints,
    makeupCardIncrement,
  }
}

app.get('/health', async function (_req, res) {
  try {
    await pool.query('SELECT 1')
    return res.json({
      ok: true,
      dbReachable: true,
      autoDbInitOnStart,
      dbInitMode,
    })
  } catch (e) {
    return res.status(500).json({
      ok: false,
      dbReachable: false,
      autoDbInitOnStart,
      dbInitMode,
      error: 'DB not reachable',
    })
  }
})

// 用英国当天日期，避免时区跨天问题
// Use the London calendar date so daily features do not drift across time zones.
async function getLondonToday(db = pool) {
  const r = await db.query(`SELECT (NOW() AT TIME ZONE 'Europe/London')::date AS today`)
  return r.rows[0].today
}

async function getLondonNowInfo(db = pool) {
  const r = await db.query(`
    SELECT
      (NOW() AT TIME ZONE 'Europe/London')::date AS today,
      TO_CHAR((NOW() AT TIME ZONE 'Europe/London'), 'HH24:MI') AS current_time
  `)
  return {
    today: r.rows[0].today,
    currentTime: String(r.rows[0].current_time || '').trim(),
  }
}

function canGrantCustomTaskReward(task, londonToday, londonCurrentTime) {
  const safeTask = task || {}
  const taskDate = String(safeTask.taskDate || '').trim()
  if (taskDate === '') {
    return false
  }

  if (taskDate > londonToday) {
    return true
  }
  if (taskDate < londonToday) {
    return false
  }

  let deadlineTime = ''
  if (safeTask.timingMode === TASK_MODE_RANGE) {
    deadlineTime = String(safeTask.endTime || '').trim()
  } else {
    deadlineTime = String(safeTask.dueTime || '').trim()
  }

  if (deadlineTime === '') {
    return false
  }
  return deadlineTime >= londonCurrentTime
}

// Make sure app_users always has one row for the current Clerk user.
async function ensureUserRow(userId, db = pool) {
  // Check-ins, rewards, Canvas credentials, and custom tasks all depend on this row.
  await db.query(
    `
    INSERT INTO app_users (clerk_user_id, last_seen_at)
    VALUES ($1, NOW())
    ON CONFLICT (clerk_user_id) DO UPDATE SET last_seen_at = NOW();
    `,
    [userId],
  )
}

// Frontend calls this after sign-in so the backend can sync the current Clerk user into Neon.
// Reference: Clerk Express getAuth(req) and Clerk backend users.getUser(userId).
app.post('/users/sync', async function (req, res) {
  try {
    const { userId, sessionId } = getAuth(req)
    if (!userId) return res.status(401).json({ error: 'Unauthenticated' })

    const user = await clerkClient.users.getUser(userId)

    let primaryEmail = null
    if (user.primaryEmailAddress && user.primaryEmailAddress.emailAddress) {
      primaryEmail = user.primaryEmailAddress.emailAddress
    }
    let firstEmail = null
    if (
      user.emailAddresses &&
      user.emailAddresses.length > 0 &&
      user.emailAddresses[0] &&
      user.emailAddresses[0].emailAddress
    ) {
      firstEmail = user.emailAddresses[0].emailAddress
    }
    const email = primaryEmail || firstEmail || null

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
 * Return the current user's saved Canvas school and whether a token exists on the server.
 */
app.get('/canvas/credentials', async function (req, res) {
  try {
    const { userId } = getAuth(req)
    if (!userId) return res.status(401).json({ error: 'Unauthenticated' })

    let stored
    try {
      stored = await getStoredCanvasCredentials(userId)
    } catch (decryptError) {
      console.error('[BE] /canvas/credentials decrypt error:', decryptError)
      return res.status(500).json({
        error:
          'Saved Canvas token cannot be decrypted. Check CANVAS_TOKEN_SECRET is set and unchanged.',
      })
    }

    return res.json({
      ok: true,
      school: stored.school,
      connected: Boolean(stored.school && stored.token),
      hasSavedToken: Boolean(stored.token),
    })
  } catch (e) {
    console.error('[BE] /canvas/credentials error:', e)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * PUT /canvas/credentials
 * Save/update the current user's Canvas school+token, then return a fresh Canvas snapshot.
 */
app.put('/canvas/credentials', async function (req, res) {
  try {
    const { userId } = getAuth(req)
    if (!userId) return res.status(401).json({ error: 'Unauthenticated' })
    if (!CANVAS_TOKEN_SECRET) {
      return res.status(500).json({ error: 'Missing CANVAS_TOKEN_SECRET on server' })
    }

    await ensureUserRow(userId)

    const safeBody = req.body || {}
    const schoolRaw = safeBody.school
    const tokenRaw = safeBody.token
    let safeSchoolRaw = ''
    if (schoolRaw !== null && schoolRaw !== undefined) {
      safeSchoolRaw = schoolRaw
    }
    let safeTokenRaw = ''
    if (tokenRaw !== null && tokenRaw !== undefined) {
      safeTokenRaw = tokenRaw
    }
    const school = String(safeSchoolRaw).trim()
    const token = String(safeTokenRaw).trim()

    if (school.length > 255) {
      return res.status(400).json({ error: 'School is too long' })
    }
    if (token.length > 8192) {
      return res.status(400).json({ error: 'Token is too long' })
    }
    if (school === '' || token === '') {
      return res.status(400).json({ error: 'School and token are required' })
    }

    const baseUrl = buildCanvasBaseUrl(school)
    const snapshot = await loadCanvasSnapshot(baseUrl, token)

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

    return res.json({
      ok: true,
      school,
      connected: true,
      hasSavedToken: true,
      snapshot,
    })
  } catch (e) {
    if (isInvalidCanvasTokenError(e)) {
      return res.status(401).json({ error: e.message })
    }
    console.error('[BE] /canvas/credentials PUT error:', e)
    return res.status(500).json({ error: e instanceof Error ? e.message : 'Internal server error' })
  }
})

/**
 * GET /canvas/snapshot
 * Load the current user's current Canvas data through the backend.
 */
app.get('/canvas/snapshot', async function (req, res) {
  try {
    const { userId } = getAuth(req)
    if (!userId) return res.status(401).json({ error: 'Unauthenticated' })

    const stored = await getStoredCanvasCredentials(userId)
    if (!stored.school || !stored.token) {
      return res.status(409).json({ error: 'Connect Canvas first.' })
    }

    const snapshot = await loadCanvasSnapshot(buildCanvasBaseUrl(stored.school), stored.token)
    return res.json({
      ok: true,
      school: stored.school,
      connected: true,
      hasSavedToken: true,
      snapshot,
    })
  } catch (e) {
    if (e instanceof Error && e.message === 'Connect Canvas first.') {
      return res.status(409).json({ error: e.message })
    }
    const { userId } = getAuth(req)
    if (userId && (await clearStoredCanvasCredentialsIfTokenInvalid(userId, e))) {
      return res.status(401).json({
        error: e instanceof Error ? e.message : 'Canvas token is no longer valid',
        clearedSavedToken: true,
      })
    }
    console.error('[BE] /canvas/snapshot GET error:', e)
    return res.status(500).json({ error: e instanceof Error ? e.message : 'Internal server error' })
  }
})

/**
 * GET /canvas/submissions/:courseId/:assignmentId
 * Return one Canvas submission detail using the stored server-side token.
 */
app.get('/canvas/submissions/:courseId/:assignmentId', async function (req, res) {
  try {
    const { userId } = getAuth(req)
    if (!userId) return res.status(401).json({ error: 'Unauthenticated' })

    const safeParams = req.params || {}
    const courseId = String(safeParams.courseId || '').trim()
    const assignmentId = String(safeParams.assignmentId || '').trim()
    if (courseId === '' || assignmentId === '') {
      return res.status(400).json({ error: 'Missing courseId or assignmentId' })
    }

    const item = await fetchStoredCanvasSubmissionDetail(userId, courseId, assignmentId)
    return res.json({
      ok: true,
      item,
    })
  } catch (e) {
    const { userId } = getAuth(req)
    if (userId && (await clearStoredCanvasCredentialsIfTokenInvalid(userId, e))) {
      return res.status(401).json({
        error: e instanceof Error ? e.message : 'Canvas token is no longer valid',
        clearedSavedToken: true,
      })
    }
    console.error('[BE] /canvas/submissions GET error:', e)
    return res.status(500).json({ error: e instanceof Error ? e.message : 'Internal server error' })
  }
})

/**
 * DELETE /canvas/credentials
 * Remove saved Canvas school+token for the current user.
 */
app.delete('/canvas/credentials', async function (req, res) {
  try {
    const { userId } = getAuth(req)
    if (!userId) return res.status(401).json({ error: 'Unauthenticated' })

    await clearStoredCanvasCredentials(userId)

    return res.json({ ok: true })
  } catch (e) {
    console.error('[BE] /canvas/credentials DELETE error:', e)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * GET /home/plan
 * Return the current user's next N days and previous M days of custom tasks + Canvas items.
 */
app.get('/home/plan', async function (req, res) {
  try {
    const { userId } = getAuth(req)
    if (!userId) return res.status(401).json({ error: 'Unauthenticated' })

    await ensureUserRow(userId)

    const safeQuery = req.query || {}
    const rawDays = Number(safeQuery.days)
    const rawRecentDays = Number(safeQuery.recentDays)
    let days = 7
    if (Number.isInteger(rawDays)) {
      days = Math.min(Math.max(rawDays, 1), 30)
    }
    let recentDays = days
    if (Number.isInteger(rawRecentDays)) {
      recentDays = Math.min(Math.max(rawRecentDays, 1), 365)
    }

    const today = await getLondonToday()
    const weeklyWindow = getWeekWindowFromDateText(today)
    const nowTs = Date.now()
    const futureEndTs = nowTs + days * 24 * 60 * 60 * 1000
    const pastStartTs = nowTs - recentDays * 24 * 60 * 60 * 1000
    const weekStartTs = new Date(weeklyWindow.weekStart + 'T00:00:00Z').getTime()
    const weekEndExclusiveTs = new Date(weeklyWindow.weekEndExclusive + 'T00:00:00Z').getTime()
    const weekStartIso = weeklyWindow.weekStart + 'T00:00:00Z'
    const weekEndExclusiveIso = weeklyWindow.weekEndExclusive + 'T00:00:00Z'

    const upcomingTaskResult = await pool.query(
      `
      SELECT
        id,
        title,
        task_date,
        timing_mode,
        due_time,
        start_time,
        end_time,
        is_completed,
        created_at,
        updated_at
      FROM app_custom_tasks
      WHERE clerk_user_id = $1
        AND is_completed = FALSE
        AND task_date >= (NOW() AT TIME ZONE 'Europe/London')::date
        AND task_date < ((NOW() AT TIME ZONE 'Europe/London')::date + $2::int)
      ORDER BY task_date ASC, COALESCE(start_time, due_time) ASC NULLS LAST, created_at ASC
      `,
      [userId, days],
    )

    const recentTaskResult = await pool.query(
      `
      SELECT
        id,
        title,
        task_date,
        timing_mode,
        due_time,
        start_time,
        end_time,
        is_completed,
        created_at,
        updated_at
      FROM app_custom_tasks
      WHERE clerk_user_id = $1
        AND task_date >= ((NOW() AT TIME ZONE 'Europe/London')::date - $2::int)
        AND task_date < (NOW() AT TIME ZONE 'Europe/London')::date
      ORDER BY task_date DESC, COALESCE(start_time, due_time) DESC NULLS LAST, created_at DESC
      `,
      [userId, recentDays],
    )

    const weeklyTaskResult = await pool.query(
      `
      SELECT
        id,
        title,
        task_date,
        timing_mode,
        due_time,
        start_time,
        end_time,
        is_completed,
        created_at,
        updated_at
      FROM app_custom_tasks
      WHERE clerk_user_id = $1
        AND task_date >= $2
        AND task_date < $3
      ORDER BY task_date ASC, COALESCE(start_time, due_time) ASC NULLS LAST, created_at ASC
      `,
      [userId, weeklyWindow.weekStart, weeklyWindow.weekEndExclusive],
    )

    const customUpcomingItems = upcomingTaskResult.rows
      .map(mapCustomTaskRow)
      .map(mapCustomTaskToPlanItem)

    const customRecentItems = recentTaskResult.rows
      .map(mapCustomTaskRow)
      .map(mapCustomTaskToPlanItem)

    const customWeeklyItems = weeklyTaskResult.rows
      .map(mapCustomTaskRow)
      .map(mapCustomTaskToPlanItem)

    let canvasUpcomingItems = []
    let canvasRecentItems = []
    let canvasWeeklyItems = []
    let canvasConnected = false
    let canvasError = ''

    try {
      const stored = await getStoredCanvasCredentials(userId)
      canvasConnected = Boolean(stored.school && stored.token)

      if (canvasConnected) {
        const baseUrl = buildCanvasBaseUrl(stored.school)
        const futureStartIso = new Date(nowTs).toISOString()
        const futureEndIso = new Date(futureEndTs).toISOString()
        const recentStartIso = new Date(pastStartTs).toISOString()
        const recentEndIso = new Date(nowTs).toISOString()

        const [
          rawCourses,
          rawUpcomingCanvasItems,
          rawRecentCompletedCanvasItems,
          rawRecentIncompleteCanvasItems,
          rawWeeklyCompletedCanvasItems,
          rawWeeklyIncompleteCanvasItems,
        ] = await Promise.all([
          fetchCanvasPaged(
            baseUrl,
            stored.token,
            '/api/v1/courses?enrollment_type=student&enrollment_state=active&per_page=100',
          ),
          fetchCanvasPaged(
            baseUrl,
            stored.token,
            '/api/v1/planner/items?start_date=' +
              encodeURIComponent(futureStartIso) +
              '&end_date=' +
              encodeURIComponent(futureEndIso) +
              '&filter=incomplete_items&per_page=50',
          ),
          fetchCanvasPaged(
            baseUrl,
            stored.token,
            '/api/v1/planner/items?start_date=' +
              encodeURIComponent(recentStartIso) +
              '&end_date=' +
              encodeURIComponent(recentEndIso) +
              '&filter=complete_items&per_page=50',
          ),
          fetchCanvasPaged(
            baseUrl,
            stored.token,
            '/api/v1/planner/items?start_date=' +
              encodeURIComponent(recentStartIso) +
              '&end_date=' +
              encodeURIComponent(recentEndIso) +
              '&filter=incomplete_items&per_page=50',
          ),
          fetchCanvasPaged(
            baseUrl,
            stored.token,
            '/api/v1/planner/items?start_date=' +
              encodeURIComponent(weekStartIso) +
              '&end_date=' +
              encodeURIComponent(weekEndExclusiveIso) +
              '&filter=complete_items&per_page=50',
          ),
          fetchCanvasPaged(
            baseUrl,
            stored.token,
            '/api/v1/planner/items?start_date=' +
              encodeURIComponent(weekStartIso) +
              '&end_date=' +
              encodeURIComponent(weekEndExclusiveIso) +
              '&filter=incomplete_items&per_page=50',
          ),
        ])

        let safeCourses = []
        if (Array.isArray(rawCourses)) {
          safeCourses = rawCourses
        }
        const courseNameById = safeCourses.reduce(function (acc, course) {
          let safeCourse = {}
          if (course) {
            safeCourse = course
          }
          let rawCourseId = ''
          if (safeCourse.id) {
            rawCourseId = safeCourse.id
          }
          const courseId = String(rawCourseId)
          if (courseId) {
            let courseName = 'Course ' + courseId
            if (safeCourse.name) {
              courseName = safeCourse.name
            } else if (safeCourse.course_code) {
              courseName = safeCourse.course_code
            }
            acc[courseId] = courseName
          }
          return acc
        }, {})

        let safeUpcomingCanvasItems = []
        if (Array.isArray(rawUpcomingCanvasItems)) {
          safeUpcomingCanvasItems = rawUpcomingCanvasItems
        }
        let safeRecentCompletedCanvasItems = []
        if (Array.isArray(rawRecentCompletedCanvasItems)) {
          safeRecentCompletedCanvasItems = rawRecentCompletedCanvasItems
        }
        let safeRecentIncompleteCanvasItems = []
        if (Array.isArray(rawRecentIncompleteCanvasItems)) {
          safeRecentIncompleteCanvasItems = rawRecentIncompleteCanvasItems
        }
        let safeWeeklyCompletedCanvasItems = []
        if (Array.isArray(rawWeeklyCompletedCanvasItems)) {
          safeWeeklyCompletedCanvasItems = rawWeeklyCompletedCanvasItems
        }
        let safeWeeklyIncompleteCanvasItems = []
        if (Array.isArray(rawWeeklyIncompleteCanvasItems)) {
          safeWeeklyIncompleteCanvasItems = rawWeeklyIncompleteCanvasItems
        }

        canvasUpcomingItems = safeUpcomingCanvasItems
          .map(function (item, index) {
            return mapCanvasEventToPlanItem(item, index, {
              baseUrl,
              courseNameById,
              isCompleted: false,
            })
          })
          .filter(function (item) {
            if (!item) {
              return false
            }
            if (item.sortTs < nowTs) {
              return false
            }
            if (item.sortTs > futureEndTs) {
              return false
            }
            return true
          })

        const recentCompletedCanvasItems = safeRecentCompletedCanvasItems
          .map(function (item, index) {
            return mapCanvasEventToPlanItem(item, index, {
              baseUrl,
              courseNameById,
              isCompleted: true,
            })
          })
          .filter(function (item) {
            if (!item) {
              return false
            }
            if (item.sortTs < pastStartTs) {
              return false
            }
            if (item.sortTs > nowTs) {
              return false
            }
            return true
          })

        const recentIncompleteCanvasItems = safeRecentIncompleteCanvasItems
          .map(function (item, index) {
            return mapCanvasEventToPlanItem(item, index, {
              baseUrl,
              courseNameById,
              isCompleted: false,
            })
          })
          .filter(function (item) {
            if (!item) {
              return false
            }
            if (item.sortTs < pastStartTs) {
              return false
            }
            if (item.sortTs > nowTs) {
              return false
            }
            return true
          })

        const weeklyCompletedCanvasItems = safeWeeklyCompletedCanvasItems
          .map(function (item, index) {
            return mapCanvasEventToPlanItem(item, index, {
              baseUrl,
              courseNameById,
              isCompleted: true,
            })
          })
          .filter(function (item) {
            if (!item) {
              return false
            }
            if (item.sortTs < weekStartTs) {
              return false
            }
            if (item.sortTs >= weekEndExclusiveTs) {
              return false
            }
            return true
          })

        const weeklyIncompleteCanvasItems = safeWeeklyIncompleteCanvasItems
          .map(function (item, index) {
            return mapCanvasEventToPlanItem(item, index, {
              baseUrl,
              courseNameById,
              isCompleted: false,
            })
          })
          .filter(function (item) {
            if (!item) {
              return false
            }
            if (item.sortTs < weekStartTs) {
              return false
            }
            if (item.sortTs >= weekEndExclusiveTs) {
              return false
            }
            return true
          })

        const recentCanvasItemMap = {}
        recentCompletedCanvasItems.forEach(function (item) {
          if (item) {
            if (item.id) {
              recentCanvasItemMap[item.id] = item
            }
          }
        })
        recentIncompleteCanvasItems.forEach(function (item) {
          if (item) {
            if (item.id) {
              if (!recentCanvasItemMap[item.id]) {
                recentCanvasItemMap[item.id] = item
              }
            }
          }
        })
        canvasRecentItems = await enrichPlanItemsWithSubmissionDetails(
          baseUrl,
          stored.token,
          Object.values(recentCanvasItemMap),
        )

        const weeklyCanvasItemMap = {}
        weeklyCompletedCanvasItems.forEach(function (item) {
          if (item && item.id) {
            weeklyCanvasItemMap[item.id] = item
          }
        })
        weeklyIncompleteCanvasItems.forEach(function (item) {
          if (item && item.id) {
            if (!weeklyCanvasItemMap[item.id]) {
              weeklyCanvasItemMap[item.id] = item
            }
          }
        })
        canvasWeeklyItems = Object.values(weeklyCanvasItemMap)
      }
    } catch (canvasLoadError) {
      if (canvasLoadError instanceof Error) {
        canvasError = canvasLoadError.message
      } else {
        canvasError = 'Failed to load Canvas items'
      }
      if (await clearStoredCanvasCredentialsIfTokenInvalid(userId, canvasLoadError)) {
        canvasConnected = false
      }
      console.error('[BE] /home/plan canvas error:', canvasLoadError)
    }

    const upcomingItems = sortPlanItemsAscending(customUpcomingItems.concat(canvasUpcomingItems))
    let recentItems = sortPlanItemsDescending(customRecentItems.concat(canvasRecentItems))
    recentItems = await annotateCanvasRewardStateForPlanItems(userId, recentItems)
    const recentSummary = buildReviewSummary(recentItems)
    const weeklyItems = sortPlanItemsAscending(customWeeklyItems.concat(canvasWeeklyItems))
    const weeklySummary = buildReviewSummary(weeklyItems)

    return res.json({
      ok: true,
      days,
      recentDays,
      canvasConnected,
      canvasError,
      items: stripPlanSortTs(upcomingItems),
      recentItems: stripPlanSortTs(recentItems),
      recentSummary,
      weeklySummary,
    })
  } catch (e) {
    console.error('[BE] /home/plan error:', e)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * GET /tasks
 * Return the current user's custom tasks.
 */
app.get('/tasks', async function (req, res) {
  try {
    const { userId } = getAuth(req)
    if (!userId) return res.status(401).json({ error: 'Unauthenticated' })

    await ensureUserRow(userId)
    const result = await pool.query(
      `
      SELECT
        id,
        title,
        task_date,
        timing_mode,
        due_time,
        start_time,
        end_time,
        is_completed,
        created_at,
        updated_at
      FROM app_custom_tasks
      WHERE clerk_user_id = $1
      ORDER BY task_date ASC, COALESCE(start_time, due_time) ASC NULLS LAST, created_at ASC
      `,
      [userId],
    )

    return res.json({
      ok: true,
      items: result.rows.map(mapCustomTaskRow),
    })
  } catch (e) {
    console.error('[BE] /tasks GET error:', e)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * POST /tasks
 * Create one custom task for the current user.
 */
app.post('/tasks', async function (req, res) {
  try {
    const { userId } = getAuth(req)
    if (!userId) return res.status(401).json({ error: 'Unauthenticated' })

    await ensureUserRow(userId)
    const normalized = normalizeTaskPayload(req.body)
    if (normalized.error) {
      return res.status(400).json({ error: normalized.error })
    }

    const result = await pool.query(
      `
      INSERT INTO app_custom_tasks (
        clerk_user_id,
        title,
        task_date,
        timing_mode,
        due_time,
        start_time,
        end_time,
        is_completed,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
      RETURNING
        id,
        title,
        task_date,
        timing_mode,
        due_time,
        start_time,
        end_time,
        is_completed,
        created_at,
        updated_at
      `,
      [
        userId,
        normalized.title,
        normalized.taskDate,
        normalized.timingMode,
        normalized.dueTime || null,
        normalized.startTime || null,
        normalized.endTime || null,
        normalized.isCompleted,
      ],
    )

    return res.status(201).json({
      ok: true,
      item: mapCustomTaskRow(result.rows[0]),
    })
  } catch (e) {
    console.error('[BE] /tasks POST error:', e)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * PUT /tasks/:id
 * Update one custom task.
 */
app.put('/tasks/:id', async function (req, res) {
  const client = await pool.connect()
  try {
    const { userId } = getAuth(req)
    if (!userId) return res.status(401).json({ error: 'Unauthenticated' })

    await ensureUserRow(userId, client)
    await ensureRewardStateRow(userId, client)
    const safeParams = req.params || {}
    const taskId = Number(safeParams.id)
    if (!Number.isInteger(taskId) || taskId <= 0) {
      return res.status(400).json({ error: 'Invalid task id' })
    }

    const normalized = normalizeTaskPayload(req.body)
    if (normalized.error) {
      return res.status(400).json({ error: normalized.error })
    }

    const londonNow = await getLondonNowInfo(client)
    const today = londonNow.today

    await client.query('BEGIN')

    const existingTaskResult = await client.query(
      `
      SELECT
        id,
        title,
        task_date,
        timing_mode,
        due_time,
        start_time,
        end_time,
        is_completed,
        created_at,
        updated_at
      FROM app_custom_tasks
      WHERE id = $1 AND clerk_user_id = $2
      FOR UPDATE
      `,
      [taskId, userId],
    )

    if (existingTaskResult.rowCount === 0) {
      await client.query('ROLLBACK')
      return res.status(404).json({ error: 'Task not found' })
    }

    const existingTask = existingTaskResult.rows[0]
    const result = await client.query(
      `
      UPDATE app_custom_tasks
      SET
        title = $3,
        task_date = $4,
        timing_mode = $5,
        due_time = $6,
        start_time = $7,
        end_time = $8,
        is_completed = $9,
        updated_at = NOW()
      WHERE id = $1 AND clerk_user_id = $2
      RETURNING
        id,
        title,
        task_date,
        timing_mode,
        due_time,
        start_time,
        end_time,
        is_completed,
        created_at,
        updated_at
      `,
      [
        taskId,
        userId,
        normalized.title,
        normalized.taskDate,
        normalized.timingMode,
        normalized.dueTime || null,
        normalized.startTime || null,
        normalized.endTime || null,
        normalized.isCompleted,
      ],
    )

    let rewardResult = {
      granted: false,
      reason: 'not_eligible',
      gainedPoints: 0,
      bonusPointsApplied: 0,
      totalPointsAwarded: 0,
    }

    const wasCompleted = Boolean(existingTask.is_completed)
    if (!wasCompleted && normalized.isCompleted) {
      if (canGrantCustomTaskReward(normalized, today, londonNow.currentTime)) {
        rewardResult = await tryGrantTaskReward(client, {
          userId,
          sourceType: 'custom_task',
          sourceId: 'custom:' + String(taskId),
          rewardDate: today,
          points: CUSTOM_TASK_REWARD_POINTS,
          dailyLimit: CUSTOM_TASK_DAILY_REWARD_LIMIT,
        })
        if (rewardResult.granted) {
          const rewardStateResult = await client.query(
            `
            SELECT
              milestone_draws,
              draw_tickets,
              reroll_tickets,
              next_checkin_multiplier,
              next_task_bonus_points,
              bonus_checkins_remaining,
              bonus_per_checkin,
              weekly_custom_bonus_per_task,
              weekly_custom_bonus_week_key,
              pending_reward_source,
              pending_reward_code,
              pending_reward_payload,
              pending_reward_choices,
              pending_reward_selected_index
            FROM app_user_reward_state
            WHERE clerk_user_id = $1
            FOR UPDATE
            `,
            [userId],
          )

          const rewardState = mapRewardStateRow(rewardStateResult.rows[0], today, 0)
          const bonusApplyResult = applyTaskRewardBonuses(rewardState, today, {
            includeNextTaskBonus: true,
            includeWeeklyCustomBonus: true,
          })

          if (bonusApplyResult.bonusPoints > 0) {
            const updatedUser = await client.query(
              `
              UPDATE app_users
              SET points = points + $2, last_seen_at = NOW()
              WHERE clerk_user_id = $1
              RETURNING points
              `,
              [userId, bonusApplyResult.bonusPoints],
            )
            let totalPointsAwarded = rewardResult.gainedPoints + bonusApplyResult.bonusPoints
            let totalPoints = rewardResult.totalPoints + bonusApplyResult.bonusPoints
            if (updatedUser.rows && updatedUser.rows.length > 0 && updatedUser.rows[0]) {
              totalPoints = Number(updatedUser.rows[0].points) || totalPoints
            }

            await client.query(
              `
              UPDATE app_user_reward_state
              SET
                next_task_bonus_points = $2,
                bonus_checkins_remaining = $3,
                bonus_per_checkin = $4,
                weekly_custom_bonus_per_task = $5,
                weekly_custom_bonus_week_key = $6,
                updated_at = NOW()
              WHERE clerk_user_id = $1
              `,
              [
                userId,
                bonusApplyResult.nextState.nextTaskBonusPoints,
                bonusApplyResult.nextState.bonusCheckinsRemaining,
                bonusApplyResult.nextState.bonusPerCheckin,
                bonusApplyResult.nextState.weeklyCustomBonusPerTask,
                bonusApplyResult.nextState.weeklyCustomBonusWeekKey,
              ],
            )

            rewardResult = {
              ...rewardResult,
              gainedPoints: totalPointsAwarded,
              bonusPointsApplied: bonusApplyResult.bonusPoints,
              totalPointsAwarded,
              totalPoints,
              nextTaskBonusApplied: bonusApplyResult.nextTaskBonusApplied,
              weeklyCustomBonusApplied: bonusApplyResult.weeklyCustomBonusApplied,
            }
          } else {
            rewardResult = {
              ...rewardResult,
              bonusPointsApplied: 0,
              totalPointsAwarded: rewardResult.gainedPoints,
              nextTaskBonusApplied: 0,
              weeklyCustomBonusApplied: 0,
            }
          }
        }
      } else {
        rewardResult = {
          granted: false,
          reason: 'deadline_passed',
          gainedPoints: 0,
          bonusPointsApplied: 0,
          totalPointsAwarded: 0,
        }
      }
    }

    await client.query('COMMIT')

    return res.json({
      ok: true,
      item: mapCustomTaskRow(result.rows[0]),
      rewardResult,
    })
  } catch (e) {
    try {
      await client.query('ROLLBACK')
    } catch (_) {
      // no-op
    }
    console.error('[BE] /tasks PUT error:', e)
    return res.status(500).json({ error: 'Internal server error' })
  } finally {
    client.release()
  }
})

/**
 * POST /task-rewards/canvas/claim
 * Manually claim one daily Canvas completion reward after server-side submission verification.
 */
app.post('/task-rewards/canvas/claim', async function (req, res) {
  const client = await pool.connect()
  try {
    const { userId } = getAuth(req)
    if (!userId) return res.status(401).json({ error: 'Unauthenticated' })

    await ensureUserRow(userId, client)
    await ensureRewardStateRow(userId, client)

    const safeBody = req.body || {}
    let courseId = ''
    if (safeBody.courseId !== null && safeBody.courseId !== undefined) {
      courseId = String(safeBody.courseId).trim()
    }
    let assignmentId = ''
    if (safeBody.assignmentId !== null && safeBody.assignmentId !== undefined) {
      assignmentId = String(safeBody.assignmentId).trim()
    }
    if (courseId === '' || assignmentId === '') {
      return res.status(400).json({ error: 'Missing courseId or assignmentId' })
    }

    const stored = await getStoredCanvasCredentials(userId)
    if (!stored.school || !stored.token) {
      return res.status(409).json({ error: 'Connect Canvas before claiming this reward.' })
    }

    const baseUrl = buildCanvasBaseUrl(stored.school)
    const submissionDetails = await fetchCanvasSubmissionDetailsForCourse(
      baseUrl,
      stored.token,
      courseId,
      [assignmentId],
    )

    let matchingSubmission = null
    if (Array.isArray(submissionDetails)) {
      matchingSubmission = submissionDetails.find(function (detail) {
        const safeDetail = detail || {}
        let detailAssignmentId = ''
        if (safeDetail.assignment_id) {
          detailAssignmentId = String(safeDetail.assignment_id).trim()
        } else if (safeDetail.assignment && safeDetail.assignment.id) {
          detailAssignmentId = String(safeDetail.assignment.id).trim()
        }
        return detailAssignmentId === assignmentId
      }) || null
    }

    let submittedAt = ''
    if (matchingSubmission && matchingSubmission.submitted_at) {
      submittedAt = String(matchingSubmission.submitted_at).trim()
    }
    if (submittedAt === '') {
      return res.json({
        ok: true,
        rewardResult: {
          granted: false,
          reason: 'not_submitted',
          gainedPoints: 0,
        },
      })
    }

    const rewardDate = await getLondonToday(client)
    await client.query('BEGIN')

    let rewardResult = await tryGrantTaskReward(client, {
      userId,
      sourceType: 'canvas_task',
      sourceId: buildCanvasTaskRewardSourceId(courseId, assignmentId),
      rewardDate,
      points: CANVAS_TASK_REWARD_POINTS,
      dailyLimit: CANVAS_TASK_DAILY_REWARD_LIMIT,
    })

    if (rewardResult.granted) {
      const rewardStateResult = await client.query(
        `
        SELECT
          milestone_draws,
          draw_tickets,
          reroll_tickets,
          next_checkin_multiplier,
          next_task_bonus_points,
          bonus_checkins_remaining,
          bonus_per_checkin,
          weekly_custom_bonus_per_task,
          weekly_custom_bonus_week_key,
          pending_reward_source,
          pending_reward_code,
          pending_reward_payload,
          pending_reward_choices,
          pending_reward_selected_index
        FROM app_user_reward_state
        WHERE clerk_user_id = $1
        FOR UPDATE
        `,
        [userId],
      )

      const rewardState = mapRewardStateRow(rewardStateResult.rows[0], rewardDate, 0)
      const bonusApplyResult = applyTaskRewardBonuses(rewardState, rewardDate, {
        includeNextTaskBonus: true,
        includeWeeklyCustomBonus: false,
      })

      if (bonusApplyResult.bonusPoints > 0) {
        const updatedUser = await client.query(
          `
          UPDATE app_users
          SET points = points + $2, last_seen_at = NOW()
          WHERE clerk_user_id = $1
          RETURNING points
          `,
          [userId, bonusApplyResult.bonusPoints],
        )

        let totalPointsAwarded = rewardResult.gainedPoints + bonusApplyResult.bonusPoints
        let totalPoints = rewardResult.totalPoints + bonusApplyResult.bonusPoints
        if (updatedUser.rows && updatedUser.rows.length > 0 && updatedUser.rows[0]) {
          totalPoints = Number(updatedUser.rows[0].points) || totalPoints
        }

        await client.query(
          `
          UPDATE app_user_reward_state
          SET
            next_task_bonus_points = $2,
            bonus_checkins_remaining = $3,
            bonus_per_checkin = $4,
            weekly_custom_bonus_per_task = $5,
            weekly_custom_bonus_week_key = $6,
            updated_at = NOW()
          WHERE clerk_user_id = $1
          `,
          [
            userId,
            bonusApplyResult.nextState.nextTaskBonusPoints,
            bonusApplyResult.nextState.bonusCheckinsRemaining,
            bonusApplyResult.nextState.bonusPerCheckin,
            bonusApplyResult.nextState.weeklyCustomBonusPerTask,
            bonusApplyResult.nextState.weeklyCustomBonusWeekKey,
          ],
        )

        rewardResult = {
          ...rewardResult,
          gainedPoints: totalPointsAwarded,
          bonusPointsApplied: bonusApplyResult.bonusPoints,
          totalPointsAwarded,
          totalPoints,
          nextTaskBonusApplied: bonusApplyResult.nextTaskBonusApplied,
        }
      } else {
        rewardResult = {
          ...rewardResult,
          bonusPointsApplied: 0,
          totalPointsAwarded: rewardResult.gainedPoints,
          nextTaskBonusApplied: 0,
        }
      }
    }

    await client.query('COMMIT')

    return res.json({
      ok: true,
      rewardResult,
    })
  } catch (e) {
    try {
      await client.query('ROLLBACK')
    } catch (_) {
      // no-op
    }
    const { userId } = getAuth(req)
    if (userId && (await clearStoredCanvasCredentialsIfTokenInvalid(userId, e))) {
      return res.status(401).json({
        error: e instanceof Error ? e.message : 'Canvas token is no longer valid',
        clearedSavedToken: true,
      })
    }
    console.error('[BE] /task-rewards/canvas/claim error:', e)
    return res.status(500).json({ error: e instanceof Error ? e.message : 'Internal server error' })
  } finally {
    client.release()
  }
})

/**
 * DELETE /tasks/:id
 * Remove one custom task.
 */
app.delete('/tasks/:id', async function (req, res) {
  try {
    const { userId } = getAuth(req)
    if (!userId) return res.status(401).json({ error: 'Unauthenticated' })

    const safeParams = req.params || {}
    const taskId = Number(safeParams.id)
    if (!Number.isInteger(taskId) || taskId <= 0) {
      return res.status(400).json({ error: 'Invalid task id' })
    }

    const result = await pool.query(
      `
      DELETE FROM app_custom_tasks
      WHERE id = $1 AND clerk_user_id = $2
      RETURNING id
      `,
      [taskId, userId],
    )

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Task not found' })
    }

    return res.json({ ok: true })
  } catch (e) {
    console.error('[BE] /tasks DELETE error:', e)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * GET /checkins/status
 * 返回：points、totalDays、checkedInToday
 */
app.get('/checkins/status', async function (req, res) {
  try {
    const { userId } = getAuth(req)
    if (!userId) return res.status(401).json({ error: 'Unauthenticated' })

    await ensureUserRow(userId)
    const today = await getLondonToday()
    const yesterday = getDateTextWithOffset(today, -1)

    const todayCheckin = await pool.query(
      `
      SELECT next_day_note
      FROM app_checkins
      WHERE clerk_user_id=$1 AND checkin_date=$2
      LIMIT 1
      `,
      [userId, today],
    )

    const yesterdayCheckin = await pool.query(
      `
      SELECT next_day_note
      FROM app_checkins
      WHERE clerk_user_id=$1 AND checkin_date=$2
      LIMIT 1
      `,
      [userId, yesterday],
    )

    const total = await pool.query(
      `SELECT COUNT(*)::int AS total_days FROM app_checkins WHERE clerk_user_id=$1`,
      [userId],
    )

    const points = await pool.query(
      `SELECT points FROM app_users WHERE clerk_user_id=$1`,
      [userId],
    )

    let currentPoints = 0
    if (
      points.rows &&
      points.rows.length > 0 &&
      points.rows[0] &&
      points.rows[0].points != null
    ) {
      currentPoints = points.rows[0].points
    }

    let checkedInToday = false
    let todayNote = ''
    let yesterdayNote = ''
    if (todayCheckin.rows && todayCheckin.rows.length > 0) {
      checkedInToday = true
      if (
        todayCheckin.rows[0] &&
        todayCheckin.rows[0].next_day_note !== null &&
        todayCheckin.rows[0].next_day_note !== undefined
      ) {
        todayNote = String(todayCheckin.rows[0].next_day_note)
      }
    }

    if (
      yesterdayCheckin.rows &&
      yesterdayCheckin.rows.length > 0 &&
      yesterdayCheckin.rows[0] &&
      yesterdayCheckin.rows[0].next_day_note !== null &&
      yesterdayCheckin.rows[0].next_day_note !== undefined
    ) {
      yesterdayNote = String(yesterdayCheckin.rows[0].next_day_note)
    }

    return res.json({
      ok: true,
      today,
      checkedInToday,
      totalDays: total.rows[0].total_days,
      streakDays: await getStreakDays(pool, userId, today),
      points: currentPoints,
      yesterdayNote,
      todayNote,
    })
  } catch (e) {
    console.error('[BE] /checkins/status error:', e)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * GET /checkins/dates
 * Return all check-in dates for the current user.
 */
app.get('/checkins/dates', async function (req, res) {
  try {
    const { userId } = getAuth(req)
    if (!userId) return res.status(401).json({ error: 'Unauthenticated' })

    await ensureUserRow(userId)

    const result = await pool.query(
      `
      SELECT checkin_date::text AS checkin_date
      FROM app_checkins
      WHERE clerk_user_id = $1
      ORDER BY checkin_date ASC
      `,
      [userId],
    )

    return res.json({
      ok: true,
      items: result.rows.map(function (row) {
        let checkinDate = ''
        if (row.checkin_date) {
          checkinDate = row.checkin_date
        }
        return String(checkinDate)
      }),
    })
  } catch (e) {
    console.error('[BE] /checkins/dates error:', e)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * GET /streak-draw/state
 * Return the current user's draw inventory, pending reward, and active reward buffs.
 */
app.get('/streak-draw/state', async function (req, res) {
  try {
    const { userId } = getAuth(req)
    if (!userId) return res.status(401).json({ error: 'Unauthenticated' })

    await ensureUserRow(userId)
    await ensureRewardStateRow(userId)

    const today = await getLondonToday()
    const userResult = await pool.query(
      `
      SELECT makeup_cards
      FROM app_users
      WHERE clerk_user_id = $1
      `,
      [userId],
    )
    const rewardStateResult = await pool.query(
      `
      SELECT
        milestone_draws,
        draw_tickets,
        reroll_tickets,
        next_checkin_multiplier,
        next_task_bonus_points,
        bonus_checkins_remaining,
        bonus_per_checkin,
        weekly_custom_bonus_per_task,
        weekly_custom_bonus_week_key,
        pending_reward_source,
        pending_reward_code,
        pending_reward_payload,
        pending_reward_choices,
        pending_reward_selected_index
      FROM app_user_reward_state
      WHERE clerk_user_id = $1
      `,
      [userId],
    )

    let makeupCards = 0
    if (userResult.rows && userResult.rows.length > 0 && userResult.rows[0]) {
      makeupCards = Number(userResult.rows[0].makeup_cards) || 0
    }

    const rewardState = mapRewardStateRow(rewardStateResult.rows[0], today, makeupCards)

    return res.json({
      ok: true,
      state: rewardState,
    })
  } catch (e) {
    console.error('[BE] /streak-draw/state error:', e)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * POST /streak-draw/open
 * Spend one milestone draw or one draw ticket to generate a pending reward.
 */
app.post('/streak-draw/open', async function (req, res) {
  const client = await pool.connect()
  try {
    const { userId } = getAuth(req)
    if (!userId) return res.status(401).json({ error: 'Unauthenticated' })

    await ensureUserRow(userId, client)
    await ensureRewardStateRow(userId, client)

    const safeBody = req.body || {}
    const source = String(safeBody.source || '').trim()
    if (source !== DRAW_SOURCE_MILESTONE && source !== DRAW_SOURCE_TICKET) {
      return res.status(400).json({ error: 'Invalid draw source' })
    }

    const today = await getLondonToday(client)

    await client.query('BEGIN')

    const rewardStateResult = await client.query(
      `
      SELECT
        milestone_draws,
        draw_tickets,
        reroll_tickets,
        next_checkin_multiplier,
        next_task_bonus_points,
        bonus_checkins_remaining,
        bonus_per_checkin,
        weekly_custom_bonus_per_task,
        weekly_custom_bonus_week_key,
        pending_reward_source,
        pending_reward_code,
        pending_reward_payload,
        pending_reward_choices,
        pending_reward_selected_index
      FROM app_user_reward_state
      WHERE clerk_user_id = $1
      FOR UPDATE
      `,
      [userId],
    )

    const userResult = await client.query(
      `
      SELECT makeup_cards
      FROM app_users
      WHERE clerk_user_id = $1
      FOR UPDATE
      `,
      [userId],
    )

    let makeupCards = 0
    if (userResult.rows && userResult.rows.length > 0 && userResult.rows[0]) {
      makeupCards = Number(userResult.rows[0].makeup_cards) || 0
    }

    const rewardState = mapRewardStateRow(rewardStateResult.rows[0], today, makeupCards)
    if (rewardState.pendingDraw) {
      await client.query('ROLLBACK')
      return res.status(409).json({ error: 'Finish the current draw before opening another one.' })
    }

    if (source === DRAW_SOURCE_MILESTONE && rewardState.milestoneDraws <= 0) {
      await client.query('ROLLBACK')
      return res.status(409).json({ error: 'No milestone draw is available.' })
    }
    if (source === DRAW_SOURCE_TICKET && rewardState.drawTickets <= 0) {
      await client.query('ROLLBACK')
      return res.status(409).json({ error: 'No extra draw ticket is available.' })
    }

    let currentStreakDays = 0
    if (source === DRAW_SOURCE_MILESTONE) {
      currentStreakDays = await getStreakDays(client, userId, today)
    }
    const drawPool = getStreakDrawPoolByContext(source, currentStreakDays)
    const rolledChoices = rollStreakDrawChoices(3, drawPool)
    const nextMilestoneDraws =
      source === DRAW_SOURCE_MILESTONE ? rewardState.milestoneDraws - 1 : rewardState.milestoneDraws
    const nextDrawTickets =
      source === DRAW_SOURCE_TICKET ? rewardState.drawTickets - 1 : rewardState.drawTickets

    await client.query(
      `
      UPDATE app_user_reward_state
      SET
        milestone_draws = $2,
        draw_tickets = $3,
        pending_reward_source = $4,
        pending_reward_code = '',
        pending_reward_payload = '{}'::jsonb,
        pending_reward_choices = $5::jsonb,
        pending_reward_selected_index = -1,
        updated_at = NOW()
      WHERE clerk_user_id = $1
      `,
      [
        userId,
        nextMilestoneDraws,
        nextDrawTickets,
        source,
        JSON.stringify(rolledChoices),
      ],
    )

    await client.query('COMMIT')

    return res.json({
      ok: true,
      state: {
        ...rewardState,
        milestoneDraws: nextMilestoneDraws,
        drawTickets: nextDrawTickets,
        pendingRewardSource: source,
        pendingRewardChoices: rolledChoices,
        pendingRewardSelectedIndex: -1,
        pendingDraw: mapPendingDraw(rolledChoices, -1, source),
        pendingReward: null,
      },
    })
  } catch (e) {
    try {
      await client.query('ROLLBACK')
    } catch (_rollbackError) {
      // no-op
    }
    console.error('[BE] /streak-draw/open error:', e)
    return res.status(500).json({ error: 'Internal server error' })
  } finally {
    client.release()
  }
})

/**
 * POST /streak-draw/select
 * Pick one hidden reward card from the current three-card draw.
 */
app.post('/streak-draw/select', async function (req, res) {
  const client = await pool.connect()
  try {
    const { userId } = getAuth(req)
    if (!userId) return res.status(401).json({ error: 'Unauthenticated' })

    await ensureUserRow(userId, client)
    await ensureRewardStateRow(userId, client)

    const safeBody = req.body || {}
    const selectedIndex = Number(safeBody.index)
    if (!Number.isInteger(selectedIndex) || selectedIndex < 0 || selectedIndex > 2) {
      return res.status(400).json({ error: 'Invalid card index' })
    }

    const today = await getLondonToday(client)

    await client.query('BEGIN')

    const rewardStateResult = await client.query(
      `
      SELECT
        milestone_draws,
        draw_tickets,
        reroll_tickets,
        next_checkin_multiplier,
        next_task_bonus_points,
        bonus_checkins_remaining,
        bonus_per_checkin,
        weekly_custom_bonus_per_task,
        weekly_custom_bonus_week_key,
        pending_reward_source,
        pending_reward_code,
        pending_reward_payload,
        pending_reward_choices,
        pending_reward_selected_index
      FROM app_user_reward_state
      WHERE clerk_user_id = $1
      FOR UPDATE
      `,
      [userId],
    )

    const userResult = await client.query(
      `
      SELECT makeup_cards
      FROM app_users
      WHERE clerk_user_id = $1
      FOR UPDATE
      `,
      [userId],
    )

    let makeupCards = 0
    if (userResult.rows && userResult.rows.length > 0 && userResult.rows[0]) {
      makeupCards = Number(userResult.rows[0].makeup_cards) || 0
    }

    const rewardState = mapRewardStateRow(rewardStateResult.rows[0], today, makeupCards)
    if (!rewardState.pendingDraw) {
      await client.query('ROLLBACK')
      return res.status(409).json({ error: 'No draw is waiting for a selection.' })
    }
    if (rewardState.pendingDraw.revealed) {
      await client.query('ROLLBACK')
      return res.status(409).json({ error: 'The current draw is already selected.' })
    }
    if (selectedIndex >= rewardState.pendingRewardChoices.length) {
      await client.query('ROLLBACK')
      return res.status(400).json({ error: 'Invalid card index' })
    }

    const selectedReward = rewardState.pendingRewardChoices[selectedIndex]

    await client.query(
      `
      UPDATE app_user_reward_state
      SET
        pending_reward_code = $2,
        pending_reward_payload = $3::jsonb,
        pending_reward_selected_index = $4,
        updated_at = NOW()
      WHERE clerk_user_id = $1
      `,
      [
        userId,
        selectedReward.code,
        JSON.stringify(selectedReward.payload || {}),
        selectedIndex,
      ],
    )

    await client.query('COMMIT')

    return res.json({
      ok: true,
      state: {
        ...rewardState,
        pendingRewardSelectedIndex: selectedIndex,
        pendingDraw: mapPendingDraw(
          rewardState.pendingRewardChoices,
          selectedIndex,
          rewardState.pendingRewardSource,
        ),
        pendingReward: mapPendingReward(selectedReward.code, selectedReward.payload),
      },
    })
  } catch (e) {
    try {
      await client.query('ROLLBACK')
    } catch (_rollbackError) {
      // no-op
    }
    console.error('[BE] /streak-draw/select error:', e)
    return res.status(500).json({ error: 'Internal server error' })
  } finally {
    client.release()
  }
})

/**
 * POST /streak-draw/reroll
 * Spend one reroll ticket to replace the current three-card draw.
 */
app.post('/streak-draw/reroll', async function (req, res) {
  const client = await pool.connect()
  try {
    const { userId } = getAuth(req)
    if (!userId) return res.status(401).json({ error: 'Unauthenticated' })

    await ensureUserRow(userId, client)
    await ensureRewardStateRow(userId, client)

    const today = await getLondonToday(client)

    await client.query('BEGIN')

    const rewardStateResult = await client.query(
      `
      SELECT
        milestone_draws,
        draw_tickets,
        reroll_tickets,
        next_checkin_multiplier,
        next_task_bonus_points,
        bonus_checkins_remaining,
        bonus_per_checkin,
        weekly_custom_bonus_per_task,
        weekly_custom_bonus_week_key,
        pending_reward_source,
        pending_reward_code,
        pending_reward_payload,
        pending_reward_choices,
        pending_reward_selected_index
      FROM app_user_reward_state
      WHERE clerk_user_id = $1
      FOR UPDATE
      `,
      [userId],
    )

    const userResult = await client.query(
      `
      SELECT makeup_cards
      FROM app_users
      WHERE clerk_user_id = $1
      FOR UPDATE
      `,
      [userId],
    )

    let makeupCards = 0
    if (userResult.rows && userResult.rows.length > 0 && userResult.rows[0]) {
      makeupCards = Number(userResult.rows[0].makeup_cards) || 0
    }

    const rewardState = mapRewardStateRow(rewardStateResult.rows[0], today, makeupCards)
    if (!rewardState.pendingDraw) {
      await client.query('ROLLBACK')
      return res.status(409).json({ error: 'No pending reward to reroll.' })
    }
    if (!rewardState.pendingDraw.revealed) {
      await client.query('ROLLBACK')
      return res.status(409).json({ error: 'Pick one card before using reroll.' })
    }
    if (rewardState.rerollTickets <= 0) {
      await client.query('ROLLBACK')
      return res.status(409).json({ error: 'No reroll ticket is available.' })
    }

    const rerolledChoices = rollStreakDrawChoices(3)
    const nextRerollTickets = rewardState.rerollTickets - 1

    await client.query(
      `
      UPDATE app_user_reward_state
      SET
        reroll_tickets = $2,
        pending_reward_code = '',
        pending_reward_payload = '{}'::jsonb,
        pending_reward_choices = $3::jsonb,
        pending_reward_selected_index = -1,
        updated_at = NOW()
      WHERE clerk_user_id = $1
      `,
      [
        userId,
        nextRerollTickets,
        JSON.stringify(rerolledChoices),
      ],
    )

    await client.query('COMMIT')

    return res.json({
      ok: true,
      state: {
        ...rewardState,
        rerollTickets: nextRerollTickets,
        pendingRewardChoices: rerolledChoices,
        pendingRewardSelectedIndex: -1,
        pendingDraw: mapPendingDraw(rerolledChoices, -1, rewardState.pendingRewardSource),
        pendingReward: null,
      },
    })
  } catch (e) {
    try {
      await client.query('ROLLBACK')
    } catch (_rollbackError) {
      // no-op
    }
    console.error('[BE] /streak-draw/reroll error:', e)
    return res.status(500).json({ error: 'Internal server error' })
  } finally {
    client.release()
  }
})

/**
 * POST /streak-draw/accept
 * Accept the current pending reward and apply it to points, inventory, or active buffs.
 */
app.post('/streak-draw/accept', async function (req, res) {
  const client = await pool.connect()
  try {
    const { userId } = getAuth(req)
    if (!userId) return res.status(401).json({ error: 'Unauthenticated' })

    await ensureUserRow(userId, client)
    await ensureRewardStateRow(userId, client)

    const today = await getLondonToday(client)

    await client.query('BEGIN')

    const rewardStateResult = await client.query(
      `
      SELECT
        milestone_draws,
        draw_tickets,
        reroll_tickets,
        next_checkin_multiplier,
        next_task_bonus_points,
        bonus_checkins_remaining,
        bonus_per_checkin,
        weekly_custom_bonus_per_task,
        weekly_custom_bonus_week_key,
        pending_reward_source,
        pending_reward_code,
        pending_reward_payload,
        pending_reward_choices,
        pending_reward_selected_index
      FROM app_user_reward_state
      WHERE clerk_user_id = $1
      FOR UPDATE
      `,
      [userId],
    )

    const userResult = await client.query(
      `
      SELECT points, makeup_cards
      FROM app_users
      WHERE clerk_user_id = $1
      FOR UPDATE
      `,
      [userId],
    )

    let currentPoints = 0
    let makeupCards = 0
    if (userResult.rows && userResult.rows.length > 0 && userResult.rows[0]) {
      currentPoints = Number(userResult.rows[0].points) || 0
      makeupCards = Number(userResult.rows[0].makeup_cards) || 0
    }

    const rewardState = mapRewardStateRow(rewardStateResult.rows[0], today, makeupCards)
    if (!rewardState.pendingDraw) {
      await client.query('ROLLBACK')
      return res.status(409).json({ error: 'No pending reward to accept.' })
    }
    if (!rewardState.pendingDraw.revealed || !rewardState.pendingReward) {
      await client.query('ROLLBACK')
      return res.status(409).json({ error: 'Pick one card before accepting the reward.' })
    }

    const acceptedReward = rewardState.pendingReward
    const applyResult = applyAcceptedDrawReward(
      rewardState,
      acceptedReward.code,
      acceptedReward.payload,
      today,
    )

    const nextRewardState = applyResult.nextState
    const nextPoints = currentPoints + applyResult.grantedPoints
    const nextMakeupCards = makeupCards + applyResult.makeupCardIncrement

    await client.query(
      `
      UPDATE app_users
      SET
        points = $2,
        makeup_cards = $3,
        last_seen_at = NOW()
      WHERE clerk_user_id = $1
      `,
      [userId, nextPoints, nextMakeupCards],
    )

    await client.query(
      `
      UPDATE app_user_reward_state
      SET
        milestone_draws = $2,
        draw_tickets = $3,
        reroll_tickets = $4,
        next_checkin_multiplier = $5,
        next_task_bonus_points = $6,
        bonus_checkins_remaining = $7,
        bonus_per_checkin = $8,
        weekly_custom_bonus_per_task = $9,
        weekly_custom_bonus_week_key = $10,
        pending_reward_source = '',
        pending_reward_code = '',
        pending_reward_payload = '{}'::jsonb,
        pending_reward_choices = '[]'::jsonb,
        pending_reward_selected_index = -1,
        updated_at = NOW()
      WHERE clerk_user_id = $1
      `,
      [
        userId,
        nextRewardState.milestoneDraws,
        nextRewardState.drawTickets,
        nextRewardState.rerollTickets,
        nextRewardState.nextCheckinMultiplier,
        nextRewardState.nextTaskBonusPoints,
        nextRewardState.bonusCheckinsRemaining,
        nextRewardState.bonusPerCheckin,
        nextRewardState.weeklyCustomBonusPerTask,
        nextRewardState.weeklyCustomBonusWeekKey,
      ],
    )

    await client.query('COMMIT')

    return res.json({
      ok: true,
      acceptedReward: {
        ...acceptedReward,
        pointsGranted: applyResult.grantedPoints,
      },
      totalPoints: nextPoints,
      state: {
        ...nextRewardState,
        makeupCards: nextMakeupCards,
      },
    })
  } catch (e) {
    try {
      await client.query('ROLLBACK')
    } catch (_rollbackError) {
      // no-op
    }
    console.error('[BE] /streak-draw/accept error:', e)
    return res.status(500).json({ error: 'Internal server error' })
  } finally {
    client.release()
  }
})

/**
 * PUT /checkins/today-note
 * Save or update the current user's note for tomorrow on today's check-in record.
 */
app.put('/checkins/today-note', async function (req, res) {
  try {
    const { userId } = getAuth(req)
    if (!userId) return res.status(401).json({ error: 'Unauthenticated' })

    await ensureUserRow(userId)
    const today = await getLondonToday()
    const safeBody = req.body || {}
    const nextDayNote = normalizeNextDayNote(safeBody.note)

    const result = await pool.query(
      `
      UPDATE app_checkins
      SET
        next_day_note = $3,
        next_day_note_updated_at = NOW()
      WHERE clerk_user_id = $1 AND checkin_date = $2
      RETURNING next_day_note
      `,
      [userId, today, nextDayNote || null],
    )

    if (result.rowCount === 0) {
      return res.status(400).json({ error: 'Check in today before saving a note.' })
    }

    let savedNote = ''
    if (
      result.rows &&
      result.rows.length > 0 &&
      result.rows[0] &&
      result.rows[0].next_day_note !== null &&
      result.rows[0].next_day_note !== undefined
    ) {
      savedNote = String(result.rows[0].next_day_note)
    }

    return res.json({
      ok: true,
      today,
      todayNote: savedNote,
    })
  } catch (e) {
    console.error('[BE] /checkins/today-note error:', e)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * GET /makeup-card/status
 * Return the current user's make-up card inventory and whether yesterday can be repaired.
 */
app.get('/makeup-card/status', async function (req, res) {
  try {
    const { userId } = getAuth(req)
    if (!userId) return res.status(401).json({ error: 'Unauthenticated' })

    await ensureUserRow(userId)
    const today = await getLondonToday()
    const status = await getMakeupCardStatus(pool, userId, today)

    return res.json({
      ok: true,
      makeupCards: status.makeupCards,
      yesterdayMissed: !status.yesterdayCheckedIn,
      canUse: status.canUse,
    })
  } catch (e) {
    console.error('[BE] /makeup-card/status error:', e)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * POST /makeup-card/use
 * Spend one make-up card to create yesterday's check-in without normal daily points.
 */
app.post('/makeup-card/use', async function (req, res) {
  const client = await pool.connect()
  try {
    const { userId } = getAuth(req)
    if (!userId) return res.status(401).json({ error: 'Unauthenticated' })

    await ensureUserRow(userId, client)
    const today = await getLondonToday(client)

    await client.query('BEGIN')

    const status = await getMakeupCardStatus(client, userId, today)

    if (status.makeupCards <= 0) {
      await client.query('ROLLBACK')
      return res.status(409).json({ error: 'No make-up cards available.' })
    }
    if (status.yesterdayCheckedIn) {
      await client.query('ROLLBACK')
      return res.status(409).json({ error: 'Yesterday is already checked in.' })
    }

    const inserted = await client.query(
      `
      INSERT INTO app_checkins (clerk_user_id, checkin_date)
      VALUES ($1, $2)
      ON CONFLICT (clerk_user_id, checkin_date) DO NOTHING
      RETURNING id
      `,
      [userId, status.yesterday],
    )

    if (inserted.rowCount === 0) {
      await client.query('ROLLBACK')
      return res.status(409).json({ error: 'Yesterday is already checked in.' })
    }

    const updatedUser = await client.query(
      `
      UPDATE app_users
      SET makeup_cards = makeup_cards - 1, last_seen_at = NOW()
      WHERE clerk_user_id = $1 AND makeup_cards > 0
      RETURNING points, makeup_cards
      `,
      [userId],
    )

    if (updatedUser.rowCount === 0) {
      await client.query('ROLLBACK')
      return res.status(409).json({ error: 'No make-up cards available.' })
    }

    const totalResult = await client.query(
      `
      SELECT COUNT(*)::int AS total_days
      FROM app_checkins
      WHERE clerk_user_id = $1
      `,
      [userId],
    )

    await client.query('COMMIT')

    let makeupCards = 0
    if (updatedUser.rows && updatedUser.rows.length > 0) {
      if (updatedUser.rows[0]) {
        if (updatedUser.rows[0].makeup_cards != null) {
          makeupCards = Number(updatedUser.rows[0].makeup_cards) || 0
        }
      }
    }

    let totalDays = 0
    if (totalResult.rows && totalResult.rows.length > 0) {
      if (totalResult.rows[0] && totalResult.rows[0].total_days != null) {
        totalDays = Number(totalResult.rows[0].total_days) || 0
      }
    }

    return res.json({
      ok: true,
      makeupCards,
      totalDays,
    })
  } catch (e) {
    try {
      await client.query('ROLLBACK')
    } catch (_) {
      // no-op
    }
    console.error('[BE] /makeup-card/use error:', e)
    return res.status(500).json({ error: 'Internal server error' })
  } finally {
    client.release()
  }
})

/**
 * GET /rewards/catalog
 * Return all active rewards.
 */
app.get('/rewards/catalog', async function (req, res) {
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
app.post('/rewards/redeem', async function (req, res) {
  const client = await pool.connect()
  try {
    const { userId } = getAuth(req)
    if (!userId) return res.status(401).json({ error: 'Unauthenticated' })

    await ensureUserRow(userId, client)
    await ensureRewardStateRow(userId, client)

    const safeBody = req.body || {}
    const rewardId = Number(safeBody.rewardId)
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

    const makeupCardReward = isMakeupCardReward(reward)
    const extraDrawTicketReward = isExtraDrawTicketReward(reward)
    const rerollTicketReward = isRerollTicketReward(reward)

    const pointsResult = await client.query(
      `
      SELECT points
      FROM app_users
      WHERE clerk_user_id = $1
      FOR UPDATE
      `,
      [userId],
    )
    let currentPoints = 0
    if (
      pointsResult.rows &&
      pointsResult.rows.length > 0 &&
      pointsResult.rows[0]
    ) {
      currentPoints = Number(pointsResult.rows[0].points) || 0
    }

    if (currentPoints < reward.pointsCost) {
      await client.query('ROLLBACK')
      return res.status(409).json({
        error: 'INSUFFICIENT_POINTS',
        currentPoints,
        requiredPoints: reward.pointsCost,
      })
    }

    let updatedUser = null
    if (makeupCardReward) {
      updatedUser = await client.query(
        `
        UPDATE app_users
        SET points = points - $2, makeup_cards = makeup_cards + 1, last_seen_at = NOW()
        WHERE clerk_user_id = $1
        RETURNING points, makeup_cards
        `,
        [userId, reward.pointsCost],
      )
    } else {
      updatedUser = await client.query(
        `
        UPDATE app_users
        SET points = points - $2, last_seen_at = NOW()
        WHERE clerk_user_id = $1
        RETURNING points, makeup_cards
        `,
        [userId, reward.pointsCost],
      )
    }

    let updatedRewardState = null
    if (extraDrawTicketReward || rerollTicketReward) {
      updatedRewardState = await client.query(
        `
        UPDATE app_user_reward_state
        SET
          draw_tickets = draw_tickets + $2,
          reroll_tickets = reroll_tickets + $3,
          updated_at = NOW()
        WHERE clerk_user_id = $1
        RETURNING draw_tickets, reroll_tickets
        `,
        [
          userId,
          extraDrawTicketReward ? 1 : 0,
          rerollTicketReward ? 1 : 0,
        ],
      )
    }

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
    let remainingPoints = 0
    let makeupCards = 0
    let drawTickets = 0
    let rerollTickets = 0
    if (
      updatedUser.rows &&
      updatedUser.rows.length > 0 &&
      updatedUser.rows[0]
    ) {
      remainingPoints = Number(updatedUser.rows[0].points) || 0
      if (updatedUser.rows[0].makeup_cards != null) {
        makeupCards = Number(updatedUser.rows[0].makeup_cards) || 0
      }
    }
    if (
      updatedRewardState &&
      updatedRewardState.rows &&
      updatedRewardState.rows.length > 0 &&
      updatedRewardState.rows[0]
    ) {
      if (updatedRewardState.rows[0].draw_tickets != null) {
        drawTickets = Number(updatedRewardState.rows[0].draw_tickets) || 0
      }
      if (updatedRewardState.rows[0].reroll_tickets != null) {
        rerollTickets = Number(updatedRewardState.rows[0].reroll_tickets) || 0
      }
    }

    return res.json({
      ok: true,
      remainingPoints,
      makeupCards,
      drawTickets,
      rerollTickets,
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
app.get('/rewards/orders', async function (req, res) {
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
      items: orders.rows.map(function (row) {
        let imageUrl = ''
        if (row.image_url) {
          imageUrl = row.image_url
        }
        return {
          id: row.id,
          rewardId: row.reward_id,
          title: row.title,
          category: row.category,
          imageUrl,
          pointsCost: row.points_cost,
          status: row.status,
          createdAt: row.created_at,
        }
      }),
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
app.post('/checkins/today', async function (req, res) {
  const client = await pool.connect()
  try {
    const { userId } = getAuth(req)
    if (!userId) return res.status(401).json({ error: 'Unauthenticated' })

    await ensureUserRow(userId, client)
    await ensureRewardStateRow(userId, client)
    const today = await getLondonToday(client)

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
    let totalDays = 0
    let yesterdayNote = ''
    let todayNote = ''
    let awardedMakeupCard = false
    let makeupCards = 0
    let awardedMilestoneDraw = false
    let milestoneDraws = 0

    // Only the first check-in for the current day should grant points.
    if (didInsert) {
      const totalAfterInsert = await client.query(
        `SELECT COUNT(*)::int AS total_days FROM app_checkins WHERE clerk_user_id=$1`,
        [userId],
      )
      if (
        totalAfterInsert.rows &&
        totalAfterInsert.rows.length > 0 &&
        totalAfterInsert.rows[0] &&
        totalAfterInsert.rows[0].total_days != null
      ) {
        totalDays = Number(totalAfterInsert.rows[0].total_days) || 0
      }

      streakDays = await getStreakDays(client, userId, today)

      const rewardStateResult = await client.query(
        `
        SELECT
          points,
          makeup_cards,
          new_user_bonus_phase_done,
          has_claimed_14_day_makeup_card
        FROM app_users
        WHERE clerk_user_id = $1
        FOR UPDATE
        `,
        [userId],
      )

      const userRewardStateResult = await client.query(
        `
        SELECT
          milestone_draws,
          draw_tickets,
          reroll_tickets,
          next_checkin_multiplier,
          next_task_bonus_points,
          bonus_checkins_remaining,
          bonus_per_checkin,
          weekly_custom_bonus_per_task,
          weekly_custom_bonus_week_key,
          pending_reward_source,
          pending_reward_code,
          pending_reward_payload,
          pending_reward_choices,
          pending_reward_selected_index
        FROM app_user_reward_state
        WHERE clerk_user_id = $1
        FOR UPDATE
        `,
        [userId],
      )

      let currentPointsBeforeUpdate = 0
      let currentMakeupCards = 0
      let newUserBonusPhaseDone = false
      let hasClaimed14DayMakeupCard = false
      if (
        rewardStateResult.rows &&
        rewardStateResult.rows.length > 0 &&
        rewardStateResult.rows[0]
      ) {
        const rewardStateRow = rewardStateResult.rows[0]
        if (rewardStateRow.points != null) {
          currentPointsBeforeUpdate = Number(rewardStateRow.points) || 0
        }
        if (rewardStateRow.makeup_cards != null) {
          currentMakeupCards = Number(rewardStateRow.makeup_cards) || 0
        }
        if (rewardStateRow.new_user_bonus_phase_done) {
          newUserBonusPhaseDone = true
        }
        if (rewardStateRow.has_claimed_14_day_makeup_card) {
          hasClaimed14DayMakeupCard = true
        }
      }

      const currentRewardState = mapRewardStateRow(userRewardStateResult.rows[0], today, currentMakeupCards)

      let restartedStreak = false
      if (streakDays === 1 && totalDays > 1) {
        restartedStreak = true
      }
      const hasHistoricalBreak = totalDays > streakDays

      let useNewUserBonusPhase = !newUserBonusPhaseDone
      if (restartedStreak || hasHistoricalBreak) {
        useNewUserBonusPhase = false
      }

      const baseCheckinPoints = getCheckinRewardPoints(streakDays, useNewUserBonusPhase)
      const checkinBonusResult = applyCheckinRewardBonuses(baseCheckinPoints, currentRewardState)
      gainedPoints = checkinBonusResult.grantedPoints

      let nextNewUserBonusPhaseDone = newUserBonusPhaseDone
      if (!nextNewUserBonusPhaseDone) {
        if (restartedStreak || hasHistoricalBreak) {
          nextNewUserBonusPhaseDone = true
        } else if (streakDays >= NEW_USER_FIRST_WEEK_REWARDS.length) {
          nextNewUserBonusPhaseDone = true
        }
      }

      let nextClaimed14DayMakeupCard = hasClaimed14DayMakeupCard
      let makeupCardIncrement = 0
      if (!nextClaimed14DayMakeupCard && streakDays >= 14) {
        awardedMakeupCard = true
        nextClaimed14DayMakeupCard = true
        makeupCardIncrement = 1
      }

      let nextMilestoneDraws = checkinBonusResult.nextState.milestoneDraws
      if (streakDays > 0 && streakDays % 7 === 0) {
        nextMilestoneDraws += 1
        awardedMilestoneDraw = true
      }

      const yesterdayNoteResult = await client.query(
        `
        SELECT next_day_note
        FROM app_checkins
        WHERE clerk_user_id = $1 AND checkin_date = ($2::date - INTERVAL '1 day')::date
        LIMIT 1
        `,
        [userId, today],
      )
      if (
        yesterdayNoteResult.rows &&
        yesterdayNoteResult.rows.length > 0 &&
        yesterdayNoteResult.rows[0] &&
        yesterdayNoteResult.rows[0].next_day_note !== null &&
        yesterdayNoteResult.rows[0].next_day_note !== undefined
      ) {
        yesterdayNote = String(yesterdayNoteResult.rows[0].next_day_note)
      }

      const updatedUserResult = await client.query(
        `
        UPDATE app_users
        SET
          points = $2,
          makeup_cards = $3,
          new_user_bonus_phase_done = $4,
          has_claimed_14_day_makeup_card = $5,
          last_seen_at = NOW()
        WHERE clerk_user_id = $1
        RETURNING points, makeup_cards
        `,
        [
          userId,
          currentPointsBeforeUpdate + gainedPoints,
          currentMakeupCards + makeupCardIncrement,
          nextNewUserBonusPhaseDone,
          nextClaimed14DayMakeupCard,
        ],
      )
      if (
        updatedUserResult.rows &&
        updatedUserResult.rows.length > 0 &&
        updatedUserResult.rows[0]
      ) {
        if (updatedUserResult.rows[0].makeup_cards != null) {
          makeupCards = Number(updatedUserResult.rows[0].makeup_cards) || 0
        }
      }

      await client.query(
        `
        UPDATE app_user_reward_state
        SET
          milestone_draws = $2,
          draw_tickets = $3,
          reroll_tickets = $4,
          next_checkin_multiplier = $5,
          next_task_bonus_points = $6,
          bonus_checkins_remaining = $7,
          bonus_per_checkin = $8,
          weekly_custom_bonus_per_task = $9,
          weekly_custom_bonus_week_key = $10,
          pending_reward_source = $11,
          pending_reward_code = $12,
          pending_reward_payload = $13::jsonb,
          pending_reward_choices = $14::jsonb,
          pending_reward_selected_index = $15,
          updated_at = NOW()
        WHERE clerk_user_id = $1
        `,
        [
          userId,
          nextMilestoneDraws,
          checkinBonusResult.nextState.drawTickets,
          checkinBonusResult.nextState.rerollTickets,
          checkinBonusResult.nextState.nextCheckinMultiplier,
          checkinBonusResult.nextState.nextTaskBonusPoints,
          checkinBonusResult.nextState.bonusCheckinsRemaining,
          checkinBonusResult.nextState.bonusPerCheckin,
          checkinBonusResult.nextState.weeklyCustomBonusPerTask,
          checkinBonusResult.nextState.weeklyCustomBonusWeekKey,
          checkinBonusResult.nextState.pendingRewardSource,
          checkinBonusResult.nextState.pendingReward ? checkinBonusResult.nextState.pendingReward.code : '',
          JSON.stringify(
            checkinBonusResult.nextState.pendingReward
              ? (checkinBonusResult.nextState.pendingReward.payload || {})
              : {},
          ),
          JSON.stringify(checkinBonusResult.nextState.pendingRewardChoices || []),
          Number.isInteger(checkinBonusResult.nextState.pendingRewardSelectedIndex)
            ? checkinBonusResult.nextState.pendingRewardSelectedIndex
            : -1,
        ],
      )

      milestoneDraws = nextMilestoneDraws
    } else {
      streakDays = await getStreakDays(client, userId, today)

      const totalExisting = await client.query(
        `SELECT COUNT(*)::int AS total_days FROM app_checkins WHERE clerk_user_id=$1`,
        [userId],
      )
      if (
        totalExisting.rows &&
        totalExisting.rows.length > 0 &&
        totalExisting.rows[0] &&
        totalExisting.rows[0].total_days != null
      ) {
        totalDays = Number(totalExisting.rows[0].total_days) || 0
      }

      const currentNoteResult = await client.query(
        `
        SELECT next_day_note
        FROM app_checkins
        WHERE clerk_user_id = $1 AND checkin_date = $2
        LIMIT 1
        `,
        [userId, today],
      )
      if (
        currentNoteResult.rows &&
        currentNoteResult.rows.length > 0 &&
        currentNoteResult.rows[0] &&
        currentNoteResult.rows[0].next_day_note !== null &&
        currentNoteResult.rows[0].next_day_note !== undefined
      ) {
        todayNote = String(currentNoteResult.rows[0].next_day_note)
      }

      const yesterdayNoteResult = await client.query(
        `
        SELECT next_day_note
        FROM app_checkins
        WHERE clerk_user_id = $1 AND checkin_date = ($2::date - INTERVAL '1 day')::date
        LIMIT 1
        `,
        [userId, today],
      )
      if (
        yesterdayNoteResult.rows &&
        yesterdayNoteResult.rows.length > 0 &&
        yesterdayNoteResult.rows[0] &&
        yesterdayNoteResult.rows[0].next_day_note !== null &&
        yesterdayNoteResult.rows[0].next_day_note !== undefined
      ) {
        yesterdayNote = String(yesterdayNoteResult.rows[0].next_day_note)
      }

      const rewardStateResult = await client.query(
        `
        SELECT milestone_draws
        FROM app_user_reward_state
        WHERE clerk_user_id = $1
        `,
        [userId],
      )
      if (rewardStateResult.rows && rewardStateResult.rows.length > 0 && rewardStateResult.rows[0]) {
        milestoneDraws = Number(rewardStateResult.rows[0].milestone_draws) || 0
      }
    }

    const points = await client.query(
      `SELECT points, makeup_cards FROM app_users WHERE clerk_user_id=$1`,
      [userId],
    )

    await client.query('COMMIT')

    let returnedGainedPoints = 0
    if (didInsert) {
      returnedGainedPoints = gainedPoints
    }
    let currentPoints = 0
    if (
      points.rows &&
      points.rows.length > 0 &&
      points.rows[0] &&
      points.rows[0].points != null
    ) {
      currentPoints = points.rows[0].points
    }
    if (makeupCards <= 0) {
      if (
        points.rows &&
        points.rows.length > 0 &&
        points.rows[0] &&
        points.rows[0].makeup_cards != null
      ) {
        makeupCards = Number(points.rows[0].makeup_cards) || 0
      }
    }

    return res.json({
      ok: true,
      today,
      checkedInToday: true,
      gainedPoints: returnedGainedPoints,
      totalDays,
      streakDays,
      points: currentPoints,
      makeupCards,
      awardedMakeupCard,
      awardedMilestoneDraw,
      milestoneDraws,
      yesterdayNote,
      todayNote,
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
async function startServer() {
  if (autoDbInitOnStart) {
    await runDbInit()
  } else {
    console.log('[DB] auto init disabled; expecting schema to be pre-initialized')
  }

  app.listen(port, '0.0.0.0', function () {
    console.log('Backend listening on port ' + String(port))
  })
}

startServer().catch(function (e) {
  console.error('[DB] init failed:', e)
  process.exit(1)
})
