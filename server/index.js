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
const TASK_MODE_DEADLINE = 'deadline'
const TASK_MODE_RANGE = 'range'

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

function trimTaskTime(value) {
  let safeValue = ''
  if (value !== null && value !== undefined) {
    safeValue = value
  }
  const safe = String(safeValue).trim()
  if (!safe) {
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

function normalizeDateInput(value) {
  let safeValue = ''
  if (value !== null && value !== undefined) {
    safeValue = value
  }
  const safe = String(safeValue).trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(safe)) return ''
  return safe
}

function normalizeTimeInput(value) {
  let safeValue = ''
  if (value !== null && value !== undefined) {
    safeValue = value
  }
  const safe = String(safeValue).trim()
  if (!/^([01]\d|2[0-3]):([0-5]\d)$/.test(safe)) return ''
  return safe
}

function normalizeTaskPayload(body) {
  const safeBody = body || {}
  let titleValue = ''
  if (safeBody.title !== null && safeBody.title !== undefined) {
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

  if (!title) {
    return { error: 'Task title is required' }
  }
  if (title.length > 200) {
    return { error: 'Task title is too long' }
  }
  if (!taskDate) {
    return { error: 'Task date must be YYYY-MM-DD' }
  }

  if (timingMode === TASK_MODE_DEADLINE) {
    if (!dueTime) {
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

  if (!startTime || !endTime) {
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

function normalizeCanvasBaseUrl(value) {
  const trimmed = String(value || '').trim()
  if (!trimmed) return ''
  let withProtocol = 'https://' + trimmed
  if (/^https?:\/\//i.test(trimmed)) {
    withProtocol = trimmed
  }
  return withProtocol.replace(/\/+$/, '')
}

function getKnownCanvasBaseUrl(value) {
  const trimmed = String(value || '').trim()
  if (!trimmed) return ''

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
  const trimmed = String(value || '').trim()
  if (!trimmed) return ''
  const knownBaseUrl = getKnownCanvasBaseUrl(trimmed)
  if (knownBaseUrl) {
    return knownBaseUrl
  }
  if (trimmed.includes('.') || /^https?:\/\//i.test(trimmed)) {
    return normalizeCanvasBaseUrl(trimmed)
  }
  return 'https://' + trimmed + '.instructure.com'
}

function buildAbsoluteCanvasUrl(baseUrl, value) {
  const trimmed = String(value || '').trim()
  if (!trimmed) return ''
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  if (trimmed.startsWith('/')) {
    return baseUrl + trimmed
  }
  return baseUrl + '/' + trimmed
}

function parseLinkHeader(header) {
  if (!header) return {}
  return header.split(',').reduce((acc, part) => {
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

  if (row.canvas_token_ciphertext && row.canvas_token_iv && row.canvas_token_tag) {
    token = decryptCanvasToken(
      row.canvas_token_ciphertext,
      row.canvas_token_iv,
      row.canvas_token_tag,
    )
  }

  return {
    school: row.canvas_school || '',
    token,
  }
}

function buildCustomTaskDateTime(task) {
  const safeTask = task || {}
  const date = String(safeTask.taskDate || '').trim()
  if (!date) return ''

  if (safeTask.timingMode === TASK_MODE_RANGE && trimTaskTime(safeTask.startTime)) {
    return date + 'T' + trimTaskTime(safeTask.startTime) + ':00'
  }

  if (trimTaskTime(safeTask.dueTime)) {
    return date + 'T' + trimTaskTime(safeTask.dueTime) + ':00'
  }

  return date + 'T12:00:00'
}

function formatHomeTaskSchedule(task) {
  // 把自定义任务转换成首页直接展示的时间文案。
  // 例如：
  // - 20 Mar | Due 18:00
  // - 25 Mar | 09:00 - 10:00
  const safeTask = task || {}
  const taskDate = String(safeTask.taskDate || '').trim()
  if (!taskDate) return 'Date not set'

  const parsed = new Date(taskDate + 'T00:00:00')
  let dateLabel = taskDate
  if (!Number.isNaN(parsed.getTime())) {
    dateLabel = parsed.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
    })
  }

  if (safeTask.timingMode === TASK_MODE_RANGE) {
    const start = trimTaskTime(safeTask.startTime)
    const end = trimTaskTime(safeTask.endTime)
    return dateLabel + ' | ' + (start || '--:--') + ' - ' + (end || '--:--')
  }

  return dateLabel + ' | Due ' + (trimTaskTime(safeTask.dueTime) || '--:--')
}

function getCanvasPlanDate(item) {
  // Canvas 不同类型的任务，时间字段不完全一致。
  // 这里按优先级兜底，尽量拿到最准确的截止时间。
  const safeItem = item || {}
  const plannable = safeItem.plannable || {}
  const assignment = safeItem.assignment || {}
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
  const safeItem = item || {}
  const plannable = safeItem.plannable || {}
  const assignment = safeItem.assignment || {}
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
  const safeItem = item || {}
  const assignment = safeItem.assignment || {}
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
  const safeItem = item || {}
  const assignment = safeItem.assignment || {}
  const plannable = safeItem.plannable || {}
  const courseId = String(safeItem.course_id || safeItem.context_id || '')
  if (courseId && courseNameById[courseId]) {
    return courseNameById[courseId]
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
  const safeItem = item || {}
  const assignment = safeItem.assignment || {}
  const plannable = safeItem.plannable || {}
  const courseId =
    safeItem.course_id || safeItem.context_id || assignment.course_id || plannable.course_id || ''
  if (!courseId) {
    return ''
  }
  return String(courseId)
}

function getCanvasPlanAssignmentId(item) {
  const safeItem = item || {}
  const assignment = safeItem.assignment || {}
  const plannable = safeItem.plannable || {}
  let assignmentId = safeItem.assignment_id || assignment.id || ''
  if (!assignmentId && String(safeItem.plannable_type || '').toLowerCase() === 'assignment') {
    assignmentId = plannable.id || ''
  }
  if (!assignmentId) {
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
  const safeSubmission = submission || {}
  let safeComments = []
  if (Array.isArray(safeSubmission.submission_comments)) {
    safeComments = safeSubmission.submission_comments
  }
  const currentUserId = String(safeSubmission.user_id || '')

  return safeComments
    .filter((comment) => {
      const safeComment = comment || {}
      const commentText = String(safeComment.comment || '').trim()
      if (!commentText) {
        return false
      }
      if (!currentUserId) {
        return true
      }
      return String(safeComment.author_id || '') !== currentUserId
    })
    .map((comment, index) => {
      const safeComment = comment || {}
      return {
        id: String(safeComment.id || 'comment-' + String(index)),
        authorName: String(safeComment.author_name || 'Teacher'),
        comment: String(safeComment.comment || '').trim(),
        createdAt: String(safeComment.created_at || ''),
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
    score: null,
    pointsPossible: null,
    teacherComments: [],
    sortTs,
  }
}

async function fetchCanvasSubmissionDetailsForCourse(baseUrl, token, courseId, assignmentIds) {
  let safeAssignmentIds = []
  if (Array.isArray(assignmentIds)) {
    safeAssignmentIds = assignmentIds
      .map((assignmentId) => String(assignmentId || '').trim())
      .filter(Boolean)
  }
  if (!courseId || safeAssignmentIds.length === 0) {
    return []
  }

  const params = new URLSearchParams()
  params.append('student_ids[]', 'self')
  safeAssignmentIds.forEach((assignmentId) => {
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

  safeItems.forEach((item) => {
    const safeItem = item || {}
    if (safeItem.source !== 'canvas' || !safeItem.courseId || !safeItem.assignmentId) {
      return
    }
    if (!assignmentIdsByCourse[safeItem.courseId]) {
      assignmentIdsByCourse[safeItem.courseId] = new Set()
    }
    assignmentIdsByCourse[safeItem.courseId].add(String(safeItem.assignmentId))
  })

  const submissionByKey = {}

  await Promise.all(
    Object.entries(assignmentIdsByCourse).map(async ([courseId, assignmentIdsSet]) => {
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
        safeDetails.forEach((detail) => {
          const safeDetail = detail || {}
          const assignmentId = String(safeDetail.assignment_id || (safeDetail.assignment || {}).id || '')
          if (!assignmentId) {
            return
          }
          submissionByKey[String(courseId) + ':' + assignmentId] = safeDetail
        })
      } catch (detailError) {
        console.error('[BE] /home/plan submission detail error:', detailError)
      }
    }),
  )

  return safeItems.map((item) => {
    const safeItem = item || {}
    if (safeItem.source !== 'canvas' || !safeItem.courseId || !safeItem.assignmentId) {
      return safeItem
    }
    const detailKey = String(safeItem.courseId) + ':' + String(safeItem.assignmentId)
    const detail = submissionByKey[detailKey]
    if (!detail) {
      return safeItem
    }

    const assignment = detail.assignment || {}
    const score = toFiniteNumber(detail.score)
    const pointsPossible =
      toFiniteNumber(assignment.points_possible) ?? toFiniteNumber(detail.points_possible)

    return {
      ...safeItem,
      score,
      pointsPossible,
      teacherComments: normalizeTeacherComments(detail),
    }
  })
}

function sortPlanItemsAscending(items) {
  let safeItems = []
  if (Array.isArray(items)) {
    safeItems = items.slice()
  }
  safeItems.sort((left, right) => {
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
  safeItems.sort((left, right) => {
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
  return safeItems.map((item) => {
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
  safeItems.forEach((item) => {
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

  let firstRow = null
  if (r.rows && r.rows.length > 0) {
    firstRow = r.rows[0]
  }
  if (firstRow && firstRow.streak != null) {
    return firstRow.streak
  }
  return 0
}

async function initDb() {
  // Create the core tables the app needs before any route starts using them.
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
  // On hosted platforms, keep the service alive so /health can still report DB problems.
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
// Use the London calendar date so daily features do not drift across time zones.
async function getLondonToday() {
  const r = await pool.query(`SELECT (NOW() AT TIME ZONE 'Europe/London')::date AS today`)
  return r.rows[0].today
}

// Make sure app_users always has one row for the current Clerk user.
async function ensureUserRow(userId) {
  // Check-ins, rewards, Canvas credentials, and custom tasks all depend on this row.
  await pool.query(
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
app.post('/users/sync', async (req, res) => {
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
 * Return the current user's saved Canvas school+token.
 */
app.get('/canvas/credentials', async (req, res) => {
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
      token: stored.token,
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
 * GET /home/plan
 * Return the current user's next N days and previous M days of custom tasks + Canvas items.
 */
app.get('/home/plan', async (req, res) => {
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

    const nowTs = Date.now()
    const futureEndTs = nowTs + days * 24 * 60 * 60 * 1000
    const pastStartTs = nowTs - recentDays * 24 * 60 * 60 * 1000

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

    const customUpcomingItems = upcomingTaskResult.rows
      .map(mapCustomTaskRow)
      .map(mapCustomTaskToPlanItem)

    const customRecentItems = recentTaskResult.rows
      .map(mapCustomTaskRow)
      .map(mapCustomTaskToPlanItem)

    let canvasUpcomingItems = []
    let canvasRecentItems = []
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

        const [rawCourses, rawUpcomingCanvasItems, rawRecentCompletedCanvasItems, rawRecentIncompleteCanvasItems] = await Promise.all([
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
        ])

        let safeCourses = []
        if (Array.isArray(rawCourses)) {
          safeCourses = rawCourses
        }
        const courseNameById = safeCourses.reduce((acc, course) => {
          const safeCourse = course || {}
          const courseId = String(safeCourse.id || '')
          if (courseId) {
            acc[courseId] = safeCourse.name || safeCourse.course_code || 'Course ' + courseId
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

        canvasUpcomingItems = safeUpcomingCanvasItems
          .map((item, index) =>
            mapCanvasEventToPlanItem(item, index, {
              baseUrl,
              courseNameById,
              isCompleted: false,
            }),
          )
          .filter((item) => item && item.sortTs >= nowTs && item.sortTs <= futureEndTs)

        const recentCompletedCanvasItems = safeRecentCompletedCanvasItems
          .map((item, index) =>
            mapCanvasEventToPlanItem(item, index, {
              baseUrl,
              courseNameById,
              isCompleted: true,
            }),
          )
          .filter((item) => item && item.sortTs >= pastStartTs && item.sortTs <= nowTs)

        const recentIncompleteCanvasItems = safeRecentIncompleteCanvasItems
          .map((item, index) =>
            mapCanvasEventToPlanItem(item, index, {
              baseUrl,
              courseNameById,
              isCompleted: false,
            }),
          )
          .filter((item) => item && item.sortTs >= pastStartTs && item.sortTs <= nowTs)

        const recentCanvasItemMap = {}
        recentCompletedCanvasItems.forEach((item) => {
          if (item && item.id) {
            recentCanvasItemMap[item.id] = item
          }
        })
        recentIncompleteCanvasItems.forEach((item) => {
          if (item && item.id && !recentCanvasItemMap[item.id]) {
            recentCanvasItemMap[item.id] = item
          }
        })
        canvasRecentItems = await enrichPlanItemsWithSubmissionDetails(
          baseUrl,
          stored.token,
          Object.values(recentCanvasItemMap),
        )
      }
    } catch (canvasLoadError) {
      if (canvasLoadError instanceof Error) {
        canvasError = canvasLoadError.message
      } else {
        canvasError = 'Failed to load Canvas items'
      }
      const normalizedCanvasError = String(canvasError || '').toLowerCase()
      if (
        normalizedCanvasError.includes('401') &&
        normalizedCanvasError.includes('invalid access token')
      ) {
        canvasConnected = false
      }
      console.error('[BE] /home/plan canvas error:', canvasLoadError)
    }

    const upcomingItems = sortPlanItemsAscending(customUpcomingItems.concat(canvasUpcomingItems))
    const recentItems = sortPlanItemsDescending(customRecentItems.concat(canvasRecentItems))
    const recentSummary = buildReviewSummary(recentItems)

    return res.json({
      ok: true,
      days,
      recentDays,
      canvasConnected,
      canvasError,
      items: stripPlanSortTs(upcomingItems),
      recentItems: stripPlanSortTs(recentItems),
      recentSummary,
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
app.get('/tasks', async (req, res) => {
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
app.post('/tasks', async (req, res) => {
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
app.put('/tasks/:id', async (req, res) => {
  try {
    const { userId } = getAuth(req)
    if (!userId) return res.status(401).json({ error: 'Unauthenticated' })

    await ensureUserRow(userId)
    const safeParams = req.params || {}
    const taskId = Number(safeParams.id)
    if (!Number.isInteger(taskId) || taskId <= 0) {
      return res.status(400).json({ error: 'Invalid task id' })
    }

    const normalized = normalizeTaskPayload(req.body)
    if (normalized.error) {
      return res.status(400).json({ error: normalized.error })
    }

    const result = await pool.query(
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

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Task not found' })
    }

    return res.json({
      ok: true,
      item: mapCustomTaskRow(result.rows[0]),
    })
  } catch (e) {
    console.error('[BE] /tasks PUT error:', e)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * DELETE /tasks/:id
 * Remove one custom task.
 */
app.delete('/tasks/:id', async (req, res) => {
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

    let currentPoints = 0
    if (
      points.rows &&
      points.rows.length > 0 &&
      points.rows[0] &&
      points.rows[0].points != null
    ) {
      currentPoints = points.rows[0].points
    }

    return res.json({
      ok: true,
      today,
      checkedInToday: Boolean(exists.rows[0].checked_in_today),
      totalDays: total.rows[0].total_days,
      streakDays: await getStreakDays(pool, userId, today),
      points: currentPoints,
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
app.get('/checkins/dates', async (req, res) => {
  try {
    const { userId } = getAuth(req)
    if (!userId) return res.status(401).json({ error: 'Unauthenticated' })

    await ensureUserRow(userId)

    const result = await pool.query(
      `
      SELECT checkin_date
      FROM app_checkins
      WHERE clerk_user_id = $1
      ORDER BY checkin_date ASC
      `,
      [userId],
    )

    return res.json({
      ok: true,
      items: result.rows.map((row) => String(row.checkin_date)),
    })
  } catch (e) {
    console.error('[BE] /checkins/dates error:', e)
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
    let remainingPoints = 0
    if (
      updatedUser.rows &&
      updatedUser.rows.length > 0 &&
      updatedUser.rows[0]
    ) {
      remainingPoints = Number(updatedUser.rows[0].points) || 0
    }

    return res.json({
      ok: true,
      remainingPoints,
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
      let multiplier = 1
      if (streakDays === TRIPLE_REWARD_STREAK) {
        multiplier = TRIPLE_REWARD_MULTIPLIER
      }
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

    return res.json({
      ok: true,
      today,
      checkedInToday: true,
      gainedPoints: returnedGainedPoints,
      totalDays: total.rows[0].total_days,
      streakDays,
      points: currentPoints,
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
  console.log('Backend listening on port ' + String(port))
})
