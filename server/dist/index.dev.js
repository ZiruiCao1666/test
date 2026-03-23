"use strict";

require("dotenv/config");

var _express = _interopRequireDefault(require("express"));

var _cors = _interopRequireDefault(require("cors"));

var _nodeCrypto = require("node:crypto");

var _express2 = require("@clerk/express");

var _db = require("./db.js");

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { "default": obj }; }

function _slicedToArray(arr, i) { return _arrayWithHoles(arr) || _iterableToArrayLimit(arr, i) || _nonIterableRest(); }

function _nonIterableRest() { throw new TypeError("Invalid attempt to destructure non-iterable instance"); }

function _iterableToArrayLimit(arr, i) { if (!(Symbol.iterator in Object(arr) || Object.prototype.toString.call(arr) === "[object Arguments]")) { return; } var _arr = []; var _n = true; var _d = false; var _e = undefined; try { for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) { _arr.push(_s.value); if (i && _arr.length === i) break; } } catch (err) { _d = true; _e = err; } finally { try { if (!_n && _i["return"] != null) _i["return"](); } finally { if (_d) throw _e; } } return _arr; }

function _arrayWithHoles(arr) { if (Array.isArray(arr)) return arr; }

function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); if (enumerableOnly) symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; }); keys.push.apply(keys, symbols); } return keys; }

function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i] != null ? arguments[i] : {}; if (i % 2) { ownKeys(source, true).forEach(function (key) { _defineProperty(target, key, source[key]); }); } else if (Object.getOwnPropertyDescriptors) { Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)); } else { ownKeys(source).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } } return target; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

function _toConsumableArray(arr) { return _arrayWithoutHoles(arr) || _iterableToArray(arr) || _nonIterableSpread(); }

function _nonIterableSpread() { throw new TypeError("Invalid attempt to spread non-iterable instance"); }

function _iterableToArray(iter) { if (Symbol.iterator in Object(iter) || Object.prototype.toString.call(iter) === "[object Arguments]") return Array.from(iter); }

function _arrayWithoutHoles(arr) { if (Array.isArray(arr)) { for (var i = 0, arr2 = new Array(arr.length); i < arr.length; i++) { arr2[i] = arr[i]; } return arr2; } }

var app = (0, _express["default"])();
var port = Number(process.env.PORT) || 10000; // 允许前端带 Authorization: Bearer <token> 调用后端。
// 让前端能带 Authorization: Bearer <token>

app.use((0, _cors["default"])({
  origin: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(_express["default"].json()); // 参考 Clerk Express 官方文档：https://clerk.com/docs/reference/express/clerk-middleware
// 官网示例是先 app.use(clerkMiddleware())，之后再在路由里用 getAuth(req) 读取登录态。
// Clerk 中间件：读取 headers/cookies，把 auth 状态挂到 request 上

app.use((0, _express2.clerkMiddleware)()); // Neon：云上建议启用 SSL（更稳）

var databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error('[DB] Missing DATABASE_URL. Set it to your Neon connection string.');
} else if (!databaseUrl.includes('sslmode=')) {
  console.warn('[DB] DATABASE_URL missing sslmode=require. Neon requires SSL.');
}

var CHECKIN_POINTS = 10;
var TRIPLE_REWARD_STREAK = 7;
var TRIPLE_REWARD_MULTIPLIER = 3;
var CANVAS_ENCRYPTION_ALGO = 'aes-256-gcm';
var CANVAS_IV_BYTES = 12;
var CANVAS_TOKEN_SECRET = process.env.CANVAS_TOKEN_SECRET || '';
var TASK_MODE_DEADLINE = 'deadline';
var TASK_MODE_RANGE = 'range';

function mapRewardRow(row) {
  return {
    id: row.id,
    title: row.title,
    pointsCost: row.points_cost,
    category: row.category,
    imageUrl: row.image_url || '',
    isActive: row.is_active
  };
}

function trimTaskTime(value) {
  var safeValue = '';

  if (value !== null && value !== undefined) {
    safeValue = value;
  }

  var safe = String(safeValue).trim();

  if (!safe) {
    return '';
  }

  return safe.slice(0, 5);
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
    updatedAt: row.updated_at
  };
}

function normalizeDateInput(value) {
  var safeValue = '';

  if (value !== null && value !== undefined) {
    safeValue = value;
  }

  var safe = String(safeValue).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(safe)) return '';
  return safe;
}

function normalizeTimeInput(value) {
  var safeValue = '';

  if (value !== null && value !== undefined) {
    safeValue = value;
  }

  var safe = String(safeValue).trim();
  if (!/^([01]\d|2[0-3]):([0-5]\d)$/.test(safe)) return '';
  return safe;
}

function normalizeTaskPayload(body) {
  var safeBody = body || {};
  var titleValue = '';

  if (safeBody.title !== null && safeBody.title !== undefined) {
    titleValue = safeBody.title;
  }

  var title = String(titleValue).trim();
  var taskDate = normalizeDateInput(safeBody.taskDate);
  var timingMode = TASK_MODE_DEADLINE;

  if (safeBody.timingMode === TASK_MODE_RANGE) {
    timingMode = TASK_MODE_RANGE;
  }

  var dueTime = normalizeTimeInput(safeBody.dueTime);
  var startTime = normalizeTimeInput(safeBody.startTime);
  var endTime = normalizeTimeInput(safeBody.endTime);
  var isCompleted = Boolean(safeBody.isCompleted);

  if (!title) {
    return {
      error: 'Task title is required'
    };
  }

  if (title.length > 200) {
    return {
      error: 'Task title is too long'
    };
  }

  if (!taskDate) {
    return {
      error: 'Task date must be YYYY-MM-DD'
    };
  }

  if (timingMode === TASK_MODE_DEADLINE) {
    if (!dueTime) {
      return {
        error: 'Due time must be HH:MM'
      };
    }

    return {
      title: title,
      taskDate: taskDate,
      timingMode: timingMode,
      dueTime: dueTime,
      startTime: '',
      endTime: '',
      isCompleted: isCompleted
    };
  }

  if (!startTime || !endTime) {
    return {
      error: 'Start time and end time must be HH:MM'
    };
  }

  if (endTime <= startTime) {
    return {
      error: 'End time must be later than start time'
    };
  }

  return {
    title: title,
    taskDate: taskDate,
    timingMode: timingMode,
    dueTime: '',
    startTime: startTime,
    endTime: endTime,
    isCompleted: isCompleted
  };
}

function getCanvasSecretKey() {
  if (!CANVAS_TOKEN_SECRET) {
    throw new Error('Missing CANVAS_TOKEN_SECRET');
  }

  return (0, _nodeCrypto.createHash)('sha256').update(CANVAS_TOKEN_SECRET).digest();
}

function encryptCanvasToken(token) {
  var key = getCanvasSecretKey();
  var iv = (0, _nodeCrypto.randomBytes)(CANVAS_IV_BYTES);
  var cipher = (0, _nodeCrypto.createCipheriv)(CANVAS_ENCRYPTION_ALGO, key, iv);
  var encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher["final"]()]);
  var authTag = cipher.getAuthTag();
  return {
    cipherText: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64')
  };
}

function decryptCanvasToken(cipherText, iv, authTag) {
  var key = getCanvasSecretKey();
  var decipher = (0, _nodeCrypto.createDecipheriv)(CANVAS_ENCRYPTION_ALGO, key, Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(authTag, 'base64'));
  var decrypted = Buffer.concat([decipher.update(Buffer.from(cipherText, 'base64')), decipher["final"]()]);
  return decrypted.toString('utf8');
}

function normalizeCanvasBaseUrl(value) {
  var trimmed = String(value || '').trim();
  if (!trimmed) return '';
  var withProtocol = 'https://' + trimmed;

  if (/^https?:\/\//i.test(trimmed)) {
    withProtocol = trimmed;
  }

  return withProtocol.replace(/\/+$/, '');
}

function buildCanvasBaseUrl(value) {
  var trimmed = String(value || '').trim();
  if (!trimmed) return '';

  if (trimmed.includes('.') || /^https?:\/\//i.test(trimmed)) {
    return normalizeCanvasBaseUrl(trimmed);
  }

  return 'https://' + trimmed + '.instructure.com';
}

function buildAbsoluteCanvasUrl(baseUrl, value) {
  var trimmed = String(value || '').trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;

  if (trimmed.startsWith('/')) {
    return baseUrl + trimmed;
  }

  return baseUrl + '/' + trimmed;
}

function parseLinkHeader(header) {
  if (!header) return {};
  return header.split(',').reduce(function (acc, part) {
    var match = part.match(/<([^>]+)>\s*;\s*rel="([^"]+)"/);

    if (match) {
      acc[match[2]] = match[1];
    }

    return acc;
  }, {});
}

function fetchCanvasPage(baseUrl, token, pathOrUrl) {
  var url, response, raw, data, errors, firstError, message, links;
  return regeneratorRuntime.async(function fetchCanvasPage$(_context) {
    while (1) {
      switch (_context.prev = _context.next) {
        case 0:
          url = baseUrl + pathOrUrl;

          if (/^https?:\/\//i.test(pathOrUrl)) {
            url = pathOrUrl;
          }

          _context.next = 4;
          return regeneratorRuntime.awrap(fetch(url, {
            headers: {
              Authorization: 'Bearer ' + token,
              Accept: 'application/json'
            }
          }));

        case 4:
          response = _context.sent;
          _context.next = 7;
          return regeneratorRuntime.awrap(response.text());

        case 7:
          raw = _context.sent;
          data = null;

          if (raw) {
            try {
              data = JSON.parse(raw);
            } catch (_error) {
              data = null;
            }
          }

          if (response.ok) {
            _context.next = 17;
            break;
          }

          errors = [];

          if (data && Array.isArray(data.errors)) {
            errors = data.errors;
          }

          firstError = null;

          if (errors.length > 0) {
            firstError = errors[0];
          }

          message = firstError && firstError.message || data && data.message || response.statusText;
          throw new Error('Canvas ' + String(response.status) + ' ' + message);

        case 17:
          links = parseLinkHeader(response.headers.get('link'));
          return _context.abrupt("return", {
            data: data,
            nextUrl: links.next || ''
          });

        case 19:
        case "end":
          return _context.stop();
      }
    }
  });
}

function fetchCanvasPaged(baseUrl, token, path) {
  var nextUrl, aggregated, visited, _ref, data, newNextUrl;

  return regeneratorRuntime.async(function fetchCanvasPaged$(_context2) {
    while (1) {
      switch (_context2.prev = _context2.next) {
        case 0:
          nextUrl = path;
          aggregated = [];
          visited = new Set();

        case 3:
          if (!nextUrl) {
            _context2.next = 18;
            break;
          }

          if (!visited.has(nextUrl)) {
            _context2.next = 6;
            break;
          }

          return _context2.abrupt("break", 18);

        case 6:
          visited.add(nextUrl);
          _context2.next = 9;
          return regeneratorRuntime.awrap(fetchCanvasPage(baseUrl, token, nextUrl));

        case 9:
          _ref = _context2.sent;
          data = _ref.data;
          newNextUrl = _ref.nextUrl;

          if (Array.isArray(data)) {
            _context2.next = 14;
            break;
          }

          return _context2.abrupt("return", data);

        case 14:
          aggregated.push.apply(aggregated, _toConsumableArray(data));
          nextUrl = newNextUrl;
          _context2.next = 3;
          break;

        case 18:
          return _context2.abrupt("return", aggregated);

        case 19:
        case "end":
          return _context2.stop();
      }
    }
  });
}

function getStoredCanvasCredentials(userId) {
  var result, row, token;
  return regeneratorRuntime.async(function getStoredCanvasCredentials$(_context3) {
    while (1) {
      switch (_context3.prev = _context3.next) {
        case 0:
          _context3.next = 2;
          return regeneratorRuntime.awrap(ensureUserRow(userId));

        case 2:
          _context3.next = 4;
          return regeneratorRuntime.awrap(_db.pool.query("\n    SELECT canvas_school, canvas_token_ciphertext, canvas_token_iv, canvas_token_tag\n    FROM app_canvas_credentials\n    WHERE clerk_user_id = $1\n    ", [userId]));

        case 4:
          result = _context3.sent;

          if (!(result.rowCount === 0)) {
            _context3.next = 7;
            break;
          }

          return _context3.abrupt("return", {
            school: '',
            token: ''
          });

        case 7:
          row = result.rows[0];
          token = '';

          if (row.canvas_token_ciphertext && row.canvas_token_iv && row.canvas_token_tag) {
            token = decryptCanvasToken(row.canvas_token_ciphertext, row.canvas_token_iv, row.canvas_token_tag);
          }

          return _context3.abrupt("return", {
            school: row.canvas_school || '',
            token: token
          });

        case 11:
        case "end":
          return _context3.stop();
      }
    }
  });
}

function buildCustomTaskDateTime(task) {
  var safeTask = task || {};
  var date = String(safeTask.taskDate || '').trim();
  if (!date) return '';

  if (safeTask.timingMode === TASK_MODE_RANGE && trimTaskTime(safeTask.startTime)) {
    return date + 'T' + trimTaskTime(safeTask.startTime) + ':00';
  }

  if (trimTaskTime(safeTask.dueTime)) {
    return date + 'T' + trimTaskTime(safeTask.dueTime) + ':00';
  }

  return date + 'T12:00:00';
}

function formatHomeTaskSchedule(task) {
  // 把自定义任务转换成首页直接展示的时间文案。
  // 例如：
  // - 20 Mar | Due 18:00
  // - 25 Mar | 09:00 - 10:00
  var safeTask = task || {};
  var taskDate = String(safeTask.taskDate || '').trim();
  if (!taskDate) return 'Date not set';
  var parsed = new Date(taskDate + 'T00:00:00');
  var dateLabel = taskDate;

  if (!Number.isNaN(parsed.getTime())) {
    dateLabel = parsed.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short'
    });
  }

  if (safeTask.timingMode === TASK_MODE_RANGE) {
    var start = trimTaskTime(safeTask.startTime);
    var end = trimTaskTime(safeTask.endTime);
    return dateLabel + ' | ' + (start || '--:--') + ' - ' + (end || '--:--');
  }

  return dateLabel + ' | Due ' + (trimTaskTime(safeTask.dueTime) || '--:--');
}

function getCanvasPlanDate(item) {
  // Canvas 不同类型的任务，时间字段不完全一致。
  // 这里按优先级兜底，尽量拿到最准确的截止时间。
  var safeItem = item || {};
  var plannable = safeItem.plannable || {};
  var assignment = safeItem.assignment || {};
  return plannable.due_at || plannable.todo_date || safeItem.plannable_date || assignment.due_at || safeItem.due_at || safeItem.start_at || safeItem.end_at || plannable.all_day_date || safeItem.all_day_date || '';
}

function getCanvasPlanTitle(item) {
  // Canvas 标题字段可能出现在 plannable / assignment / 顶层对象里，
  // 这里统一做一次提取，减少前端重复判断。
  var safeItem = item || {};
  var plannable = safeItem.plannable || {};
  var assignment = safeItem.assignment || {};
  return plannable.name || plannable.title || safeItem.title || safeItem.name || assignment.name || 'Untitled event';
}

function getCanvasPlanType(item) {
  // 把 Canvas 返回的原始类型整理成更适合前端直接显示的文本。
  var safeItem = item || {};
  var assignment = safeItem.assignment || {};
  var rawType = 'event';

  if (safeItem.plannable_type) {
    rawType = safeItem.plannable_type;
  } else if (safeItem.type) {
    rawType = safeItem.type;
  } else if (assignment.type) {
    rawType = assignment.type;
  } else if (safeItem.linked_object_type) {
    rawType = safeItem.linked_object_type;
  }

  return String(rawType).replace(/_/g, ' ');
}

function getCanvasPlanCourse(item, courseNameById) {
  // 先用 course_id 去课程表里找正式课程名，
  // 如果没有，再退回 Canvas 返回对象里的上下文字段。
  var safeItem = item || {};
  var assignment = safeItem.assignment || {};
  var plannable = safeItem.plannable || {};
  var courseId = String(safeItem.course_id || safeItem.context_id || '');

  if (courseId && courseNameById[courseId]) {
    return courseNameById[courseId];
  }

  return safeItem.context_name || safeItem.course_name || assignment.course_name || plannable.context_name || '';
}

function mapCustomTaskToPlanItem(task) {
  // 把数据库里的自定义任务转换成首页 /home/plan 能直接使用的统一结构。
  // 统一后，首页就能把 custom task 和 Canvas task 一起排序展示。
  var safeTask = task || {};
  var date = buildCustomTaskDateTime(safeTask);
  var sortTs = new Date(date).getTime();
  var type = 'due time';

  if (safeTask.timingMode === TASK_MODE_RANGE) {
    type = 'time range';
  }

  var timestampMs = null;

  if (!Number.isNaN(sortTs)) {
    timestampMs = sortTs;
  }

  var safeSortTs = Number.MAX_SAFE_INTEGER;

  if (!Number.isNaN(sortTs)) {
    safeSortTs = sortTs;
  }

  return {
    id: 'custom-' + String(safeTask.id),
    source: 'custom',
    title: safeTask.title || 'Untitled task',
    course: '',
    type: type,
    date: date,
    timestampMs: timestampMs,
    htmlUrl: '',
    isCompleted: Boolean(safeTask.isCompleted),
    taskDate: safeTask.taskDate || '',
    timingMode: safeTask.timingMode || TASK_MODE_DEADLINE,
    dueTime: trimTaskTime(safeTask.dueTime),
    startTime: trimTaskTime(safeTask.startTime),
    endTime: trimTaskTime(safeTask.endTime),
    scheduleText: formatHomeTaskSchedule(safeTask),
    sortTs: safeSortTs
  };
}

function mapCanvasEventToPlanItem(item, index) {
  var options = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : {};
  var _options$baseUrl = options.baseUrl,
      baseUrl = _options$baseUrl === void 0 ? '' : _options$baseUrl,
      _options$courseNameBy = options.courseNameById,
      courseNameById = _options$courseNameBy === void 0 ? {} : _options$courseNameBy;
  var completed = false;

  if (options && options.isCompleted) {
    completed = true;
  }

  var safeItem = item || {};
  var plannable = safeItem.plannable || {};
  var assignment = safeItem.assignment || {};
  var date = getCanvasPlanDate(safeItem);
  if (!date) return null;
  var sortTs = new Date(date).getTime();
  if (Number.isNaN(sortTs)) return null;
  return {
    id: 'canvas-' + String(safeItem.id || safeItem.event_id || safeItem.assignment_id || index),
    source: 'canvas',
    title: getCanvasPlanTitle(safeItem),
    course: getCanvasPlanCourse(safeItem, courseNameById),
    type: getCanvasPlanType(safeItem),
    date: date,
    timestampMs: sortTs,
    htmlUrl: buildAbsoluteCanvasUrl(baseUrl, safeItem.html_url || plannable.html_url || assignment.html_url || ''),
    isCompleted: completed,
    sortTs: sortTs
  };
}

function sortPlanItemsAscending(items) {
  var safeItems = [];

  if (Array.isArray(items)) {
    safeItems = items.slice();
  }

  safeItems.sort(function (left, right) {
    if (left.sortTs !== right.sortTs) {
      return left.sortTs - right.sortTs;
    }

    return String(left.title || '').localeCompare(String(right.title || ''));
  });
  return safeItems;
}

function sortPlanItemsDescending(items) {
  var safeItems = [];

  if (Array.isArray(items)) {
    safeItems = items.slice();
  }

  safeItems.sort(function (left, right) {
    if (left.sortTs !== right.sortTs) {
      return right.sortTs - left.sortTs;
    }

    return String(left.title || '').localeCompare(String(right.title || ''));
  });
  return safeItems;
}

function stripPlanSortTs(items) {
  var safeItems = [];

  if (Array.isArray(items)) {
    safeItems = items;
  }

  return safeItems.map(function (item) {
    var nextItem = _objectSpread({}, item);

    delete nextItem.sortTs;
    return nextItem;
  });
}

function buildReviewSummary(items) {
  var safeItems = [];

  if (Array.isArray(items)) {
    safeItems = items;
  }

  var totalCount = safeItems.length;
  var completedCount = 0;
  safeItems.forEach(function (item) {
    var safeItem = item || {};

    if (safeItem.isCompleted) {
      completedCount += 1;
    }
  });
  return {
    totalCount: totalCount,
    completedCount: completedCount
  };
}

function getStreakDays(db, userId, today) {
  var r, firstRow;
  return regeneratorRuntime.async(function getStreakDays$(_context4) {
    while (1) {
      switch (_context4.prev = _context4.next) {
        case 0:
          _context4.next = 2;
          return regeneratorRuntime.awrap(db.query("\n    WITH ordered AS (\n      SELECT checkin_date,\n             ROW_NUMBER() OVER (ORDER BY checkin_date DESC) AS rn\n      FROM app_checkins\n      WHERE clerk_user_id = $1 AND checkin_date <= $2\n    ),\n    grouped AS (\n      SELECT checkin_date,\n             (checkin_date + rn * INTERVAL '1 day')::date AS grp\n      FROM ordered\n    )\n    SELECT COUNT(*)::int AS streak\n    FROM grouped\n    WHERE grp = (SELECT grp FROM grouped ORDER BY checkin_date DESC LIMIT 1)\n    ", [userId, today]));

        case 2:
          r = _context4.sent;
          firstRow = null;

          if (r.rows && r.rows.length > 0) {
            firstRow = r.rows[0];
          }

          if (!(firstRow && firstRow.streak != null)) {
            _context4.next = 7;
            break;
          }

          return _context4.abrupt("return", firstRow.streak);

        case 7:
          return _context4.abrupt("return", 0);

        case 8:
        case "end":
          return _context4.stop();
      }
    }
  });
}

function initDb() {
  return regeneratorRuntime.async(function initDb$(_context5) {
    while (1) {
      switch (_context5.prev = _context5.next) {
        case 0:
          _context5.next = 2;
          return regeneratorRuntime.awrap(_db.pool.query("\n    CREATE TABLE IF NOT EXISTS app_users (\n      clerk_user_id TEXT PRIMARY KEY,\n      email TEXT,\n      full_name TEXT,\n      avatar_url TEXT,\n      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),\n      last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()\n    );\n\n    ALTER TABLE app_users\n      ADD COLUMN IF NOT EXISTS points INT NOT NULL DEFAULT 0;\n\n    CREATE TABLE IF NOT EXISTS app_checkins (\n      id BIGSERIAL PRIMARY KEY,\n      clerk_user_id TEXT NOT NULL,\n      checkin_date DATE NOT NULL,\n      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),\n      UNIQUE (clerk_user_id, checkin_date)\n    );\n\n    CREATE TABLE IF NOT EXISTS app_canvas_credentials (\n      clerk_user_id TEXT PRIMARY KEY REFERENCES app_users (clerk_user_id) ON DELETE CASCADE,\n      canvas_school TEXT NOT NULL DEFAULT '',\n      canvas_token_ciphertext TEXT,\n      canvas_token_iv TEXT,\n      canvas_token_tag TEXT,\n      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()\n    );\n\n    CREATE TABLE IF NOT EXISTS app_rewards (\n      id BIGSERIAL PRIMARY KEY,\n      title TEXT NOT NULL,\n      points_cost INT NOT NULL CHECK (points_cost > 0),\n      category TEXT NOT NULL DEFAULT 'coupon',\n      image_url TEXT,\n      is_active BOOLEAN NOT NULL DEFAULT TRUE,\n      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()\n    );\n\n    CREATE UNIQUE INDEX IF NOT EXISTS idx_app_rewards_title_unique\n      ON app_rewards (title);\n\n    CREATE TABLE IF NOT EXISTS app_reward_orders (\n      id BIGSERIAL PRIMARY KEY,\n      clerk_user_id TEXT NOT NULL REFERENCES app_users (clerk_user_id) ON DELETE CASCADE,\n      reward_id BIGINT NOT NULL REFERENCES app_rewards (id),\n      points_cost INT NOT NULL CHECK (points_cost > 0),\n      status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('pending', 'completed')),\n      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()\n    );\n\n    CREATE INDEX IF NOT EXISTS idx_app_reward_orders_user_created_at\n      ON app_reward_orders (clerk_user_id, created_at DESC);\n\n    CREATE TABLE IF NOT EXISTS app_custom_tasks (\n      id BIGSERIAL PRIMARY KEY,\n      clerk_user_id TEXT NOT NULL REFERENCES app_users (clerk_user_id) ON DELETE CASCADE,\n      title TEXT NOT NULL,\n      task_date DATE NOT NULL,\n      timing_mode TEXT NOT NULL DEFAULT 'deadline'\n        CHECK (timing_mode IN ('deadline', 'range')),\n      due_time TIME,\n      start_time TIME,\n      end_time TIME,\n      is_completed BOOLEAN NOT NULL DEFAULT FALSE,\n      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),\n      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()\n    );\n\n    CREATE INDEX IF NOT EXISTS idx_app_custom_tasks_user_date\n      ON app_custom_tasks (clerk_user_id, task_date ASC, created_at ASC);\n  "));

        case 2:
          _context5.next = 4;
          return regeneratorRuntime.awrap(_db.pool.query("\n    INSERT INTO app_rewards (title, points_cost, category, image_url, is_active)\n    VALUES\n      ('Coffee Coupon', 120, 'drinks', '', TRUE),\n      ('Latte Coupon', 160, 'drinks', '', TRUE),\n      ('Discount Coupon', 200, 'coupon', '', TRUE),\n      ('Big Discount Coupon', 260, 'coupon', '', TRUE)\n    ON CONFLICT (title) DO NOTHING;\n    "));

        case 4:
        case "end":
          return _context5.stop();
      }
    }
  });
}

initDb()["catch"](function (e) {
  console.error('[DB] init failed:', e); // On hosted platforms, keep the service alive so /health can still report DB problems.
});
app.get('/health', function _callee(_req, res) {
  return regeneratorRuntime.async(function _callee$(_context6) {
    while (1) {
      switch (_context6.prev = _context6.next) {
        case 0:
          _context6.prev = 0;
          _context6.next = 3;
          return regeneratorRuntime.awrap(_db.pool.query('SELECT 1'));

        case 3:
          res.json({
            ok: true
          });
          _context6.next = 9;
          break;

        case 6:
          _context6.prev = 6;
          _context6.t0 = _context6["catch"](0);
          res.status(500).json({
            ok: false,
            error: 'DB not reachable'
          });

        case 9:
        case "end":
          return _context6.stop();
      }
    }
  }, null, null, [[0, 6]]);
}); // 用英国当天日期，避免时区跨天问题
// Use the London calendar date so daily features do not drift across time zones.

function getLondonToday() {
  var r;
  return regeneratorRuntime.async(function getLondonToday$(_context7) {
    while (1) {
      switch (_context7.prev = _context7.next) {
        case 0:
          _context7.next = 2;
          return regeneratorRuntime.awrap(_db.pool.query("SELECT (NOW() AT TIME ZONE 'Europe/London')::date AS today"));

        case 2:
          r = _context7.sent;
          return _context7.abrupt("return", r.rows[0].today);

        case 4:
        case "end":
          return _context7.stop();
      }
    }
  });
} // Make sure app_users always has one row for the current Clerk user.


function ensureUserRow(userId) {
  return regeneratorRuntime.async(function ensureUserRow$(_context8) {
    while (1) {
      switch (_context8.prev = _context8.next) {
        case 0:
          _context8.next = 2;
          return regeneratorRuntime.awrap(_db.pool.query("\n    INSERT INTO app_users (clerk_user_id, last_seen_at)\n    VALUES ($1, NOW())\n    ON CONFLICT (clerk_user_id) DO UPDATE SET last_seen_at = NOW();\n    ", [userId]));

        case 2:
        case "end":
          return _context8.stop();
      }
    }
  });
} // Frontend calls this after sign-in so the backend can sync the current Clerk user into Neon.
// Reference: Clerk Express getAuth(req) and Clerk backend users.getUser(userId).


app.post('/users/sync', function _callee2(req, res) {
  var _getAuth, userId, sessionId, user, primaryEmail, firstEmail, email, fullName, avatarUrl;

  return regeneratorRuntime.async(function _callee2$(_context9) {
    while (1) {
      switch (_context9.prev = _context9.next) {
        case 0:
          _context9.prev = 0;
          _getAuth = (0, _express2.getAuth)(req), userId = _getAuth.userId, sessionId = _getAuth.sessionId;

          if (userId) {
            _context9.next = 4;
            break;
          }

          return _context9.abrupt("return", res.status(401).json({
            error: 'Unauthenticated'
          }));

        case 4:
          _context9.next = 6;
          return regeneratorRuntime.awrap(_express2.clerkClient.users.getUser(userId));

        case 6:
          user = _context9.sent;
          primaryEmail = null;

          if (user.primaryEmailAddress && user.primaryEmailAddress.emailAddress) {
            primaryEmail = user.primaryEmailAddress.emailAddress;
          }

          firstEmail = null;

          if (user.emailAddresses && user.emailAddresses.length > 0 && user.emailAddresses[0] && user.emailAddresses[0].emailAddress) {
            firstEmail = user.emailAddresses[0].emailAddress;
          }

          email = primaryEmail || firstEmail || null;
          fullName = [user.firstName, user.lastName].filter(Boolean).join(' ') || null;
          avatarUrl = user.imageUrl || null;
          _context9.next = 16;
          return regeneratorRuntime.awrap(_db.pool.query("\n      INSERT INTO app_users (clerk_user_id, email, full_name, avatar_url, last_seen_at)\n      VALUES ($1, $2, $3, $4, NOW())\n      ON CONFLICT (clerk_user_id)\n      DO UPDATE SET\n        email = EXCLUDED.email,\n        full_name = EXCLUDED.full_name,\n        avatar_url = EXCLUDED.avatar_url,\n        last_seen_at = NOW();\n      ", [userId, email, fullName, avatarUrl]));

        case 16:
          return _context9.abrupt("return", res.json({
            ok: true,
            userId: userId,
            sessionId: sessionId
          }));

        case 19:
          _context9.prev = 19;
          _context9.t0 = _context9["catch"](0);
          console.error('[BE] /users/sync error:', _context9.t0);
          return _context9.abrupt("return", res.status(500).json({
            error: 'Internal server error'
          }));

        case 23:
        case "end":
          return _context9.stop();
      }
    }
  }, null, null, [[0, 19]]);
});
/**
 * GET /canvas/credentials
 * Return the current user's saved Canvas school+token.
 */

app.get('/canvas/credentials', function _callee3(req, res) {
  var _getAuth2, userId, stored;

  return regeneratorRuntime.async(function _callee3$(_context10) {
    while (1) {
      switch (_context10.prev = _context10.next) {
        case 0:
          _context10.prev = 0;
          _getAuth2 = (0, _express2.getAuth)(req), userId = _getAuth2.userId;

          if (userId) {
            _context10.next = 4;
            break;
          }

          return _context10.abrupt("return", res.status(401).json({
            error: 'Unauthenticated'
          }));

        case 4:
          _context10.prev = 4;
          _context10.next = 7;
          return regeneratorRuntime.awrap(getStoredCanvasCredentials(userId));

        case 7:
          stored = _context10.sent;
          _context10.next = 14;
          break;

        case 10:
          _context10.prev = 10;
          _context10.t0 = _context10["catch"](4);
          console.error('[BE] /canvas/credentials decrypt error:', _context10.t0);
          return _context10.abrupt("return", res.status(500).json({
            error: 'Saved Canvas token cannot be decrypted. Check CANVAS_TOKEN_SECRET is set and unchanged.'
          }));

        case 14:
          return _context10.abrupt("return", res.json({
            ok: true,
            school: stored.school,
            token: stored.token
          }));

        case 17:
          _context10.prev = 17;
          _context10.t1 = _context10["catch"](0);
          console.error('[BE] /canvas/credentials error:', _context10.t1);
          return _context10.abrupt("return", res.status(500).json({
            error: 'Internal server error'
          }));

        case 21:
        case "end":
          return _context10.stop();
      }
    }
  }, null, null, [[0, 17], [4, 10]]);
});
/**
 * PUT /canvas/credentials
 * Save/update the current user's Canvas school+token.
 */

app.put('/canvas/credentials', function _callee4(req, res) {
  var _getAuth3, userId, safeBody, schoolRaw, tokenRaw, safeSchoolRaw, safeTokenRaw, school, token, encrypted;

  return regeneratorRuntime.async(function _callee4$(_context11) {
    while (1) {
      switch (_context11.prev = _context11.next) {
        case 0:
          _context11.prev = 0;
          _getAuth3 = (0, _express2.getAuth)(req), userId = _getAuth3.userId;

          if (userId) {
            _context11.next = 4;
            break;
          }

          return _context11.abrupt("return", res.status(401).json({
            error: 'Unauthenticated'
          }));

        case 4:
          if (CANVAS_TOKEN_SECRET) {
            _context11.next = 6;
            break;
          }

          return _context11.abrupt("return", res.status(500).json({
            error: 'Missing CANVAS_TOKEN_SECRET on server'
          }));

        case 6:
          _context11.next = 8;
          return regeneratorRuntime.awrap(ensureUserRow(userId));

        case 8:
          safeBody = req.body || {};
          schoolRaw = safeBody.school;
          tokenRaw = safeBody.token;
          safeSchoolRaw = '';

          if (schoolRaw !== null && schoolRaw !== undefined) {
            safeSchoolRaw = schoolRaw;
          }

          safeTokenRaw = '';

          if (tokenRaw !== null && tokenRaw !== undefined) {
            safeTokenRaw = tokenRaw;
          }

          school = String(safeSchoolRaw).trim();
          token = String(safeTokenRaw).trim();

          if (!(school.length > 255)) {
            _context11.next = 19;
            break;
          }

          return _context11.abrupt("return", res.status(400).json({
            error: 'School is too long'
          }));

        case 19:
          if (!(token.length > 8192)) {
            _context11.next = 21;
            break;
          }

          return _context11.abrupt("return", res.status(400).json({
            error: 'Token is too long'
          }));

        case 21:
          encrypted = encryptCanvasToken(token);
          _context11.next = 24;
          return regeneratorRuntime.awrap(_db.pool.query("\n      INSERT INTO app_canvas_credentials (\n        clerk_user_id,\n        canvas_school,\n        canvas_token_ciphertext,\n        canvas_token_iv,\n        canvas_token_tag,\n        updated_at\n      )\n      VALUES ($1, $2, $3, $4, $5, NOW())\n      ON CONFLICT (clerk_user_id)\n      DO UPDATE SET\n        canvas_school = EXCLUDED.canvas_school,\n        canvas_token_ciphertext = EXCLUDED.canvas_token_ciphertext,\n        canvas_token_iv = EXCLUDED.canvas_token_iv,\n        canvas_token_tag = EXCLUDED.canvas_token_tag,\n        updated_at = NOW()\n      ", [userId, school, encrypted.cipherText, encrypted.iv, encrypted.authTag]));

        case 24:
          return _context11.abrupt("return", res.json({
            ok: true
          }));

        case 27:
          _context11.prev = 27;
          _context11.t0 = _context11["catch"](0);
          console.error('[BE] /canvas/credentials PUT error:', _context11.t0);
          return _context11.abrupt("return", res.status(500).json({
            error: 'Internal server error'
          }));

        case 31:
        case "end":
          return _context11.stop();
      }
    }
  }, null, null, [[0, 27]]);
});
/**
 * DELETE /canvas/credentials
 * Remove saved Canvas school+token for the current user.
 */

app["delete"]('/canvas/credentials', function _callee5(req, res) {
  var _getAuth4, userId;

  return regeneratorRuntime.async(function _callee5$(_context12) {
    while (1) {
      switch (_context12.prev = _context12.next) {
        case 0:
          _context12.prev = 0;
          _getAuth4 = (0, _express2.getAuth)(req), userId = _getAuth4.userId;

          if (userId) {
            _context12.next = 4;
            break;
          }

          return _context12.abrupt("return", res.status(401).json({
            error: 'Unauthenticated'
          }));

        case 4:
          _context12.next = 6;
          return regeneratorRuntime.awrap(_db.pool.query("DELETE FROM app_canvas_credentials WHERE clerk_user_id = $1", [userId]));

        case 6:
          return _context12.abrupt("return", res.json({
            ok: true
          }));

        case 9:
          _context12.prev = 9;
          _context12.t0 = _context12["catch"](0);
          console.error('[BE] /canvas/credentials DELETE error:', _context12.t0);
          return _context12.abrupt("return", res.status(500).json({
            error: 'Internal server error'
          }));

        case 13:
        case "end":
          return _context12.stop();
      }
    }
  }, null, null, [[0, 9]]);
});
/**
 * GET /home/plan
 * Return the current user's next N days and previous N days of custom tasks + Canvas items.
 */

app.get('/home/plan', function _callee6(req, res) {
  var _getAuth5, userId, safeQuery, rawDays, days, nowTs, futureEndTs, pastStartTs, upcomingTaskResult, recentTaskResult, customUpcomingItems, customRecentItems, canvasUpcomingItems, canvasRecentItems, canvasConnected, canvasError, stored, baseUrl, futureStartIso, futureEndIso, recentStartIso, recentEndIso, _ref2, _ref3, rawCourses, rawUpcomingCanvasItems, rawRecentCompletedCanvasItems, rawRecentIncompleteCanvasItems, safeCourses, courseNameById, safeUpcomingCanvasItems, safeRecentCompletedCanvasItems, safeRecentIncompleteCanvasItems, recentCompletedCanvasItems, recentIncompleteCanvasItems, recentCanvasItemMap, upcomingItems, recentItems, recentSummary;

  return regeneratorRuntime.async(function _callee6$(_context13) {
    while (1) {
      switch (_context13.prev = _context13.next) {
        case 0:
          _context13.prev = 0;
          _getAuth5 = (0, _express2.getAuth)(req), userId = _getAuth5.userId;

          if (userId) {
            _context13.next = 4;
            break;
          }

          return _context13.abrupt("return", res.status(401).json({
            error: 'Unauthenticated'
          }));

        case 4:
          _context13.next = 6;
          return regeneratorRuntime.awrap(ensureUserRow(userId));

        case 6:
          safeQuery = req.query || {};
          rawDays = Number(safeQuery.days);
          days = 7;

          if (Number.isInteger(rawDays)) {
            days = Math.min(Math.max(rawDays, 1), 30);
          }

          nowTs = Date.now();
          futureEndTs = nowTs + days * 24 * 60 * 60 * 1000;
          pastStartTs = nowTs - days * 24 * 60 * 60 * 1000;
          _context13.next = 15;
          return regeneratorRuntime.awrap(_db.pool.query("\n      SELECT\n        id,\n        title,\n        task_date,\n        timing_mode,\n        due_time,\n        start_time,\n        end_time,\n        is_completed,\n        created_at,\n        updated_at\n      FROM app_custom_tasks\n      WHERE clerk_user_id = $1\n        AND is_completed = FALSE\n        AND task_date >= (NOW() AT TIME ZONE 'Europe/London')::date\n        AND task_date < ((NOW() AT TIME ZONE 'Europe/London')::date + $2::int)\n      ORDER BY task_date ASC, COALESCE(start_time, due_time) ASC NULLS LAST, created_at ASC\n      ", [userId, days]));

        case 15:
          upcomingTaskResult = _context13.sent;
          _context13.next = 18;
          return regeneratorRuntime.awrap(_db.pool.query("\n      SELECT\n        id,\n        title,\n        task_date,\n        timing_mode,\n        due_time,\n        start_time,\n        end_time,\n        is_completed,\n        created_at,\n        updated_at\n      FROM app_custom_tasks\n      WHERE clerk_user_id = $1\n        AND task_date >= ((NOW() AT TIME ZONE 'Europe/London')::date - $2::int)\n        AND task_date < (NOW() AT TIME ZONE 'Europe/London')::date\n      ORDER BY task_date DESC, COALESCE(start_time, due_time) DESC NULLS LAST, created_at DESC\n      ", [userId, days]));

        case 18:
          recentTaskResult = _context13.sent;
          customUpcomingItems = upcomingTaskResult.rows.map(mapCustomTaskRow).map(mapCustomTaskToPlanItem);
          customRecentItems = recentTaskResult.rows.map(mapCustomTaskRow).map(mapCustomTaskToPlanItem);
          canvasUpcomingItems = [];
          canvasRecentItems = [];
          canvasConnected = false;
          canvasError = '';
          _context13.prev = 25;
          _context13.next = 28;
          return regeneratorRuntime.awrap(getStoredCanvasCredentials(userId));

        case 28:
          stored = _context13.sent;
          canvasConnected = Boolean(stored.school && stored.token);

          if (!canvasConnected) {
            _context13.next = 60;
            break;
          }

          baseUrl = buildCanvasBaseUrl(stored.school);
          futureStartIso = new Date(nowTs).toISOString();
          futureEndIso = new Date(futureEndTs).toISOString();
          recentStartIso = new Date(pastStartTs).toISOString();
          recentEndIso = new Date(nowTs).toISOString();
          _context13.next = 38;
          return regeneratorRuntime.awrap(Promise.all([fetchCanvasPaged(baseUrl, stored.token, '/api/v1/courses?enrollment_type=student&enrollment_state=active&per_page=100'), fetchCanvasPaged(baseUrl, stored.token, '/api/v1/planner/items?start_date=' + encodeURIComponent(futureStartIso) + '&end_date=' + encodeURIComponent(futureEndIso) + '&filter=incomplete_items&per_page=50'), fetchCanvasPaged(baseUrl, stored.token, '/api/v1/planner/items?start_date=' + encodeURIComponent(recentStartIso) + '&end_date=' + encodeURIComponent(recentEndIso) + '&filter=complete_items&per_page=50'), fetchCanvasPaged(baseUrl, stored.token, '/api/v1/planner/items?start_date=' + encodeURIComponent(recentStartIso) + '&end_date=' + encodeURIComponent(recentEndIso) + '&filter=incomplete_items&per_page=50')]));

        case 38:
          _ref2 = _context13.sent;
          _ref3 = _slicedToArray(_ref2, 4);
          rawCourses = _ref3[0];
          rawUpcomingCanvasItems = _ref3[1];
          rawRecentCompletedCanvasItems = _ref3[2];
          rawRecentIncompleteCanvasItems = _ref3[3];
          safeCourses = [];

          if (Array.isArray(rawCourses)) {
            safeCourses = rawCourses;
          }

          courseNameById = safeCourses.reduce(function (acc, course) {
            var safeCourse = course || {};
            var courseId = String(safeCourse.id || '');

            if (courseId) {
              acc[courseId] = safeCourse.name || safeCourse.course_code || 'Course ' + courseId;
            }

            return acc;
          }, {});
          safeUpcomingCanvasItems = [];

          if (Array.isArray(rawUpcomingCanvasItems)) {
            safeUpcomingCanvasItems = rawUpcomingCanvasItems;
          }

          safeRecentCompletedCanvasItems = [];

          if (Array.isArray(rawRecentCompletedCanvasItems)) {
            safeRecentCompletedCanvasItems = rawRecentCompletedCanvasItems;
          }

          safeRecentIncompleteCanvasItems = [];

          if (Array.isArray(rawRecentIncompleteCanvasItems)) {
            safeRecentIncompleteCanvasItems = rawRecentIncompleteCanvasItems;
          }

          canvasUpcomingItems = safeUpcomingCanvasItems.map(function (item, index) {
            return mapCanvasEventToPlanItem(item, index, {
              baseUrl: baseUrl,
              courseNameById: courseNameById,
              isCompleted: false
            });
          }).filter(function (item) {
            return item && item.sortTs >= nowTs && item.sortTs <= futureEndTs;
          });
          recentCompletedCanvasItems = safeRecentCompletedCanvasItems.map(function (item, index) {
            return mapCanvasEventToPlanItem(item, index, {
              baseUrl: baseUrl,
              courseNameById: courseNameById,
              isCompleted: true
            });
          }).filter(function (item) {
            return item && item.sortTs >= pastStartTs && item.sortTs <= nowTs;
          });
          recentIncompleteCanvasItems = safeRecentIncompleteCanvasItems.map(function (item, index) {
            return mapCanvasEventToPlanItem(item, index, {
              baseUrl: baseUrl,
              courseNameById: courseNameById,
              isCompleted: false
            });
          }).filter(function (item) {
            return item && item.sortTs >= pastStartTs && item.sortTs <= nowTs;
          });
          recentCanvasItemMap = {};
          recentCompletedCanvasItems.forEach(function (item) {
            if (item && item.id) {
              recentCanvasItemMap[item.id] = item;
            }
          });
          recentIncompleteCanvasItems.forEach(function (item) {
            if (item && item.id && !recentCanvasItemMap[item.id]) {
              recentCanvasItemMap[item.id] = item;
            }
          });
          canvasRecentItems = Object.values(recentCanvasItemMap);

        case 60:
          _context13.next = 66;
          break;

        case 62:
          _context13.prev = 62;
          _context13.t0 = _context13["catch"](25);

          if (_context13.t0 instanceof Error) {
            canvasError = _context13.t0.message;
          } else {
            canvasError = 'Failed to load Canvas items';
          }

          console.error('[BE] /home/plan canvas error:', _context13.t0);

        case 66:
          upcomingItems = sortPlanItemsAscending(customUpcomingItems.concat(canvasUpcomingItems));
          recentItems = sortPlanItemsDescending(customRecentItems.concat(canvasRecentItems));
          recentSummary = buildReviewSummary(recentItems);
          return _context13.abrupt("return", res.json({
            ok: true,
            days: days,
            canvasConnected: canvasConnected,
            canvasError: canvasError,
            items: stripPlanSortTs(upcomingItems),
            recentItems: stripPlanSortTs(recentItems),
            recentSummary: recentSummary
          }));

        case 72:
          _context13.prev = 72;
          _context13.t1 = _context13["catch"](0);
          console.error('[BE] /home/plan error:', _context13.t1);
          return _context13.abrupt("return", res.status(500).json({
            error: 'Internal server error'
          }));

        case 76:
        case "end":
          return _context13.stop();
      }
    }
  }, null, null, [[0, 72], [25, 62]]);
});
/**
 * GET /tasks
 * Return the current user's custom tasks.
 */

app.get('/tasks', function _callee7(req, res) {
  var _getAuth6, userId, result;

  return regeneratorRuntime.async(function _callee7$(_context14) {
    while (1) {
      switch (_context14.prev = _context14.next) {
        case 0:
          _context14.prev = 0;
          _getAuth6 = (0, _express2.getAuth)(req), userId = _getAuth6.userId;

          if (userId) {
            _context14.next = 4;
            break;
          }

          return _context14.abrupt("return", res.status(401).json({
            error: 'Unauthenticated'
          }));

        case 4:
          _context14.next = 6;
          return regeneratorRuntime.awrap(ensureUserRow(userId));

        case 6:
          _context14.next = 8;
          return regeneratorRuntime.awrap(_db.pool.query("\n      SELECT\n        id,\n        title,\n        task_date,\n        timing_mode,\n        due_time,\n        start_time,\n        end_time,\n        is_completed,\n        created_at,\n        updated_at\n      FROM app_custom_tasks\n      WHERE clerk_user_id = $1\n      ORDER BY task_date ASC, COALESCE(start_time, due_time) ASC NULLS LAST, created_at ASC\n      ", [userId]));

        case 8:
          result = _context14.sent;
          return _context14.abrupt("return", res.json({
            ok: true,
            items: result.rows.map(mapCustomTaskRow)
          }));

        case 12:
          _context14.prev = 12;
          _context14.t0 = _context14["catch"](0);
          console.error('[BE] /tasks GET error:', _context14.t0);
          return _context14.abrupt("return", res.status(500).json({
            error: 'Internal server error'
          }));

        case 16:
        case "end":
          return _context14.stop();
      }
    }
  }, null, null, [[0, 12]]);
});
/**
 * POST /tasks
 * Create one custom task for the current user.
 */

app.post('/tasks', function _callee8(req, res) {
  var _getAuth7, userId, normalized, result;

  return regeneratorRuntime.async(function _callee8$(_context15) {
    while (1) {
      switch (_context15.prev = _context15.next) {
        case 0:
          _context15.prev = 0;
          _getAuth7 = (0, _express2.getAuth)(req), userId = _getAuth7.userId;

          if (userId) {
            _context15.next = 4;
            break;
          }

          return _context15.abrupt("return", res.status(401).json({
            error: 'Unauthenticated'
          }));

        case 4:
          _context15.next = 6;
          return regeneratorRuntime.awrap(ensureUserRow(userId));

        case 6:
          normalized = normalizeTaskPayload(req.body);

          if (!normalized.error) {
            _context15.next = 9;
            break;
          }

          return _context15.abrupt("return", res.status(400).json({
            error: normalized.error
          }));

        case 9:
          _context15.next = 11;
          return regeneratorRuntime.awrap(_db.pool.query("\n      INSERT INTO app_custom_tasks (\n        clerk_user_id,\n        title,\n        task_date,\n        timing_mode,\n        due_time,\n        start_time,\n        end_time,\n        is_completed,\n        created_at,\n        updated_at\n      )\n      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())\n      RETURNING\n        id,\n        title,\n        task_date,\n        timing_mode,\n        due_time,\n        start_time,\n        end_time,\n        is_completed,\n        created_at,\n        updated_at\n      ", [userId, normalized.title, normalized.taskDate, normalized.timingMode, normalized.dueTime || null, normalized.startTime || null, normalized.endTime || null, normalized.isCompleted]));

        case 11:
          result = _context15.sent;
          return _context15.abrupt("return", res.status(201).json({
            ok: true,
            item: mapCustomTaskRow(result.rows[0])
          }));

        case 15:
          _context15.prev = 15;
          _context15.t0 = _context15["catch"](0);
          console.error('[BE] /tasks POST error:', _context15.t0);
          return _context15.abrupt("return", res.status(500).json({
            error: 'Internal server error'
          }));

        case 19:
        case "end":
          return _context15.stop();
      }
    }
  }, null, null, [[0, 15]]);
});
/**
 * PUT /tasks/:id
 * Update one custom task.
 */

app.put('/tasks/:id', function _callee9(req, res) {
  var _getAuth8, userId, safeParams, taskId, normalized, result;

  return regeneratorRuntime.async(function _callee9$(_context16) {
    while (1) {
      switch (_context16.prev = _context16.next) {
        case 0:
          _context16.prev = 0;
          _getAuth8 = (0, _express2.getAuth)(req), userId = _getAuth8.userId;

          if (userId) {
            _context16.next = 4;
            break;
          }

          return _context16.abrupt("return", res.status(401).json({
            error: 'Unauthenticated'
          }));

        case 4:
          _context16.next = 6;
          return regeneratorRuntime.awrap(ensureUserRow(userId));

        case 6:
          safeParams = req.params || {};
          taskId = Number(safeParams.id);

          if (!(!Number.isInteger(taskId) || taskId <= 0)) {
            _context16.next = 10;
            break;
          }

          return _context16.abrupt("return", res.status(400).json({
            error: 'Invalid task id'
          }));

        case 10:
          normalized = normalizeTaskPayload(req.body);

          if (!normalized.error) {
            _context16.next = 13;
            break;
          }

          return _context16.abrupt("return", res.status(400).json({
            error: normalized.error
          }));

        case 13:
          _context16.next = 15;
          return regeneratorRuntime.awrap(_db.pool.query("\n      UPDATE app_custom_tasks\n      SET\n        title = $3,\n        task_date = $4,\n        timing_mode = $5,\n        due_time = $6,\n        start_time = $7,\n        end_time = $8,\n        is_completed = $9,\n        updated_at = NOW()\n      WHERE id = $1 AND clerk_user_id = $2\n      RETURNING\n        id,\n        title,\n        task_date,\n        timing_mode,\n        due_time,\n        start_time,\n        end_time,\n        is_completed,\n        created_at,\n        updated_at\n      ", [taskId, userId, normalized.title, normalized.taskDate, normalized.timingMode, normalized.dueTime || null, normalized.startTime || null, normalized.endTime || null, normalized.isCompleted]));

        case 15:
          result = _context16.sent;

          if (!(result.rowCount === 0)) {
            _context16.next = 18;
            break;
          }

          return _context16.abrupt("return", res.status(404).json({
            error: 'Task not found'
          }));

        case 18:
          return _context16.abrupt("return", res.json({
            ok: true,
            item: mapCustomTaskRow(result.rows[0])
          }));

        case 21:
          _context16.prev = 21;
          _context16.t0 = _context16["catch"](0);
          console.error('[BE] /tasks PUT error:', _context16.t0);
          return _context16.abrupt("return", res.status(500).json({
            error: 'Internal server error'
          }));

        case 25:
        case "end":
          return _context16.stop();
      }
    }
  }, null, null, [[0, 21]]);
});
/**
 * DELETE /tasks/:id
 * Remove one custom task.
 */

app["delete"]('/tasks/:id', function _callee10(req, res) {
  var _getAuth9, userId, safeParams, taskId, result;

  return regeneratorRuntime.async(function _callee10$(_context17) {
    while (1) {
      switch (_context17.prev = _context17.next) {
        case 0:
          _context17.prev = 0;
          _getAuth9 = (0, _express2.getAuth)(req), userId = _getAuth9.userId;

          if (userId) {
            _context17.next = 4;
            break;
          }

          return _context17.abrupt("return", res.status(401).json({
            error: 'Unauthenticated'
          }));

        case 4:
          safeParams = req.params || {};
          taskId = Number(safeParams.id);

          if (!(!Number.isInteger(taskId) || taskId <= 0)) {
            _context17.next = 8;
            break;
          }

          return _context17.abrupt("return", res.status(400).json({
            error: 'Invalid task id'
          }));

        case 8:
          _context17.next = 10;
          return regeneratorRuntime.awrap(_db.pool.query("\n      DELETE FROM app_custom_tasks\n      WHERE id = $1 AND clerk_user_id = $2\n      RETURNING id\n      ", [taskId, userId]));

        case 10:
          result = _context17.sent;

          if (!(result.rowCount === 0)) {
            _context17.next = 13;
            break;
          }

          return _context17.abrupt("return", res.status(404).json({
            error: 'Task not found'
          }));

        case 13:
          return _context17.abrupt("return", res.json({
            ok: true
          }));

        case 16:
          _context17.prev = 16;
          _context17.t0 = _context17["catch"](0);
          console.error('[BE] /tasks DELETE error:', _context17.t0);
          return _context17.abrupt("return", res.status(500).json({
            error: 'Internal server error'
          }));

        case 20:
        case "end":
          return _context17.stop();
      }
    }
  }, null, null, [[0, 16]]);
});
/**
 * GET /checkins/status
 * 返回：points、totalDays、checkedInToday
 */

app.get('/checkins/status', function _callee11(req, res) {
  var _getAuth10, userId, today, exists, total, points, currentPoints;

  return regeneratorRuntime.async(function _callee11$(_context18) {
    while (1) {
      switch (_context18.prev = _context18.next) {
        case 0:
          _context18.prev = 0;
          _getAuth10 = (0, _express2.getAuth)(req), userId = _getAuth10.userId;

          if (userId) {
            _context18.next = 4;
            break;
          }

          return _context18.abrupt("return", res.status(401).json({
            error: 'Unauthenticated'
          }));

        case 4:
          _context18.next = 6;
          return regeneratorRuntime.awrap(ensureUserRow(userId));

        case 6:
          _context18.next = 8;
          return regeneratorRuntime.awrap(getLondonToday());

        case 8:
          today = _context18.sent;
          _context18.next = 11;
          return regeneratorRuntime.awrap(_db.pool.query("\n      SELECT EXISTS(\n        SELECT 1 FROM app_checkins WHERE clerk_user_id=$1 AND checkin_date=$2\n      ) AS checked_in_today\n      ", [userId, today]));

        case 11:
          exists = _context18.sent;
          _context18.next = 14;
          return regeneratorRuntime.awrap(_db.pool.query("SELECT COUNT(*)::int AS total_days FROM app_checkins WHERE clerk_user_id=$1", [userId]));

        case 14:
          total = _context18.sent;
          _context18.next = 17;
          return regeneratorRuntime.awrap(_db.pool.query("SELECT points FROM app_users WHERE clerk_user_id=$1", [userId]));

        case 17:
          points = _context18.sent;
          currentPoints = 0;

          if (points.rows && points.rows.length > 0 && points.rows[0] && points.rows[0].points != null) {
            currentPoints = points.rows[0].points;
          }

          _context18.t0 = res;
          _context18.t1 = today;
          _context18.t2 = Boolean(exists.rows[0].checked_in_today);
          _context18.t3 = total.rows[0].total_days;
          _context18.next = 26;
          return regeneratorRuntime.awrap(getStreakDays(_db.pool, userId, today));

        case 26:
          _context18.t4 = _context18.sent;
          _context18.t5 = currentPoints;
          _context18.t6 = {
            ok: true,
            today: _context18.t1,
            checkedInToday: _context18.t2,
            totalDays: _context18.t3,
            streakDays: _context18.t4,
            points: _context18.t5
          };
          return _context18.abrupt("return", _context18.t0.json.call(_context18.t0, _context18.t6));

        case 32:
          _context18.prev = 32;
          _context18.t7 = _context18["catch"](0);
          console.error('[BE] /checkins/status error:', _context18.t7);
          return _context18.abrupt("return", res.status(500).json({
            error: 'Internal server error'
          }));

        case 36:
        case "end":
          return _context18.stop();
      }
    }
  }, null, null, [[0, 32]]);
});
/**
 * GET /rewards/catalog
 * Return all active rewards.
 */

app.get('/rewards/catalog', function _callee12(req, res) {
  var _getAuth11, userId, rewards;

  return regeneratorRuntime.async(function _callee12$(_context19) {
    while (1) {
      switch (_context19.prev = _context19.next) {
        case 0:
          _context19.prev = 0;
          _getAuth11 = (0, _express2.getAuth)(req), userId = _getAuth11.userId;

          if (userId) {
            _context19.next = 4;
            break;
          }

          return _context19.abrupt("return", res.status(401).json({
            error: 'Unauthenticated'
          }));

        case 4:
          _context19.next = 6;
          return regeneratorRuntime.awrap(ensureUserRow(userId));

        case 6:
          _context19.next = 8;
          return regeneratorRuntime.awrap(_db.pool.query("\n      SELECT id, title, points_cost, category, image_url, is_active\n      FROM app_rewards\n      WHERE is_active = TRUE\n      ORDER BY points_cost ASC, id ASC\n      "));

        case 8:
          rewards = _context19.sent;
          return _context19.abrupt("return", res.json({
            ok: true,
            items: rewards.rows.map(mapRewardRow)
          }));

        case 12:
          _context19.prev = 12;
          _context19.t0 = _context19["catch"](0);
          console.error('[BE] /rewards/catalog error:', _context19.t0);
          return _context19.abrupt("return", res.status(500).json({
            error: 'Internal server error'
          }));

        case 16:
        case "end":
          return _context19.stop();
      }
    }
  }, null, null, [[0, 12]]);
});
/**
 * POST /rewards/redeem
 * Redeem one reward and deduct points in a DB transaction.
 */

app.post('/rewards/redeem', function _callee13(req, res) {
  var client, _getAuth12, userId, safeBody, rewardId, rewardResult, reward, pointsResult, currentPoints, updatedUser, orderResult, order, remainingPoints;

  return regeneratorRuntime.async(function _callee13$(_context20) {
    while (1) {
      switch (_context20.prev = _context20.next) {
        case 0:
          _context20.next = 2;
          return regeneratorRuntime.awrap(_db.pool.connect());

        case 2:
          client = _context20.sent;
          _context20.prev = 3;
          _getAuth12 = (0, _express2.getAuth)(req), userId = _getAuth12.userId;

          if (userId) {
            _context20.next = 7;
            break;
          }

          return _context20.abrupt("return", res.status(401).json({
            error: 'Unauthenticated'
          }));

        case 7:
          _context20.next = 9;
          return regeneratorRuntime.awrap(ensureUserRow(userId));

        case 9:
          safeBody = req.body || {};
          rewardId = Number(safeBody.rewardId);

          if (!(!Number.isInteger(rewardId) || rewardId <= 0)) {
            _context20.next = 13;
            break;
          }

          return _context20.abrupt("return", res.status(400).json({
            error: 'Invalid rewardId'
          }));

        case 13:
          _context20.next = 15;
          return regeneratorRuntime.awrap(client.query('BEGIN'));

        case 15:
          _context20.next = 17;
          return regeneratorRuntime.awrap(client.query("\n      SELECT id, title, points_cost, category, image_url, is_active\n      FROM app_rewards\n      WHERE id = $1\n      FOR UPDATE\n      ", [rewardId]));

        case 17:
          rewardResult = _context20.sent;

          if (!(rewardResult.rowCount === 0)) {
            _context20.next = 22;
            break;
          }

          _context20.next = 21;
          return regeneratorRuntime.awrap(client.query('ROLLBACK'));

        case 21:
          return _context20.abrupt("return", res.status(404).json({
            error: 'Reward not found'
          }));

        case 22:
          reward = mapRewardRow(rewardResult.rows[0]);

          if (reward.isActive) {
            _context20.next = 27;
            break;
          }

          _context20.next = 26;
          return regeneratorRuntime.awrap(client.query('ROLLBACK'));

        case 26:
          return _context20.abrupt("return", res.status(400).json({
            error: 'Reward is not active'
          }));

        case 27:
          _context20.next = 29;
          return regeneratorRuntime.awrap(client.query("\n      SELECT points\n      FROM app_users\n      WHERE clerk_user_id = $1\n      FOR UPDATE\n      ", [userId]));

        case 29:
          pointsResult = _context20.sent;
          currentPoints = 0;

          if (pointsResult.rows && pointsResult.rows.length > 0 && pointsResult.rows[0]) {
            currentPoints = Number(pointsResult.rows[0].points) || 0;
          }

          if (!(currentPoints < reward.pointsCost)) {
            _context20.next = 36;
            break;
          }

          _context20.next = 35;
          return regeneratorRuntime.awrap(client.query('ROLLBACK'));

        case 35:
          return _context20.abrupt("return", res.status(409).json({
            error: 'INSUFFICIENT_POINTS',
            currentPoints: currentPoints,
            requiredPoints: reward.pointsCost
          }));

        case 36:
          _context20.next = 38;
          return regeneratorRuntime.awrap(client.query("\n      UPDATE app_users\n      SET points = points - $2, last_seen_at = NOW()\n      WHERE clerk_user_id = $1\n      RETURNING points\n      ", [userId, reward.pointsCost]));

        case 38:
          updatedUser = _context20.sent;
          _context20.next = 41;
          return regeneratorRuntime.awrap(client.query("\n      INSERT INTO app_reward_orders (clerk_user_id, reward_id, points_cost, status, created_at)\n      VALUES ($1, $2, $3, 'completed', NOW())\n      RETURNING id, status, created_at\n      ", [userId, reward.id, reward.pointsCost]));

        case 41:
          orderResult = _context20.sent;
          _context20.next = 44;
          return regeneratorRuntime.awrap(client.query('COMMIT'));

        case 44:
          order = orderResult.rows[0];
          remainingPoints = 0;

          if (updatedUser.rows && updatedUser.rows.length > 0 && updatedUser.rows[0]) {
            remainingPoints = Number(updatedUser.rows[0].points) || 0;
          }

          return _context20.abrupt("return", res.json({
            ok: true,
            remainingPoints: remainingPoints,
            order: {
              id: order.id,
              rewardId: reward.id,
              title: reward.title,
              category: reward.category,
              imageUrl: reward.imageUrl,
              pointsCost: reward.pointsCost,
              status: order.status,
              createdAt: order.created_at
            }
          }));

        case 50:
          _context20.prev = 50;
          _context20.t0 = _context20["catch"](3);
          _context20.prev = 52;
          _context20.next = 55;
          return regeneratorRuntime.awrap(client.query('ROLLBACK'));

        case 55:
          _context20.next = 59;
          break;

        case 57:
          _context20.prev = 57;
          _context20.t1 = _context20["catch"](52);

        case 59:
          console.error('[BE] /rewards/redeem error:', _context20.t0);
          return _context20.abrupt("return", res.status(500).json({
            error: 'Internal server error'
          }));

        case 61:
          _context20.prev = 61;
          client.release();
          return _context20.finish(61);

        case 64:
        case "end":
          return _context20.stop();
      }
    }
  }, null, null, [[3, 50, 61, 64], [52, 57]]);
});
/**
 * GET /rewards/orders
 * Return current user's redemption orders.
 */

app.get('/rewards/orders', function _callee14(req, res) {
  var _getAuth13, userId, orders;

  return regeneratorRuntime.async(function _callee14$(_context21) {
    while (1) {
      switch (_context21.prev = _context21.next) {
        case 0:
          _context21.prev = 0;
          _getAuth13 = (0, _express2.getAuth)(req), userId = _getAuth13.userId;

          if (userId) {
            _context21.next = 4;
            break;
          }

          return _context21.abrupt("return", res.status(401).json({
            error: 'Unauthenticated'
          }));

        case 4:
          _context21.next = 6;
          return regeneratorRuntime.awrap(ensureUserRow(userId));

        case 6:
          _context21.next = 8;
          return regeneratorRuntime.awrap(_db.pool.query("\n      SELECT\n        o.id,\n        o.reward_id,\n        o.points_cost,\n        o.status,\n        o.created_at,\n        r.title,\n        r.category,\n        r.image_url\n      FROM app_reward_orders o\n      JOIN app_rewards r ON r.id = o.reward_id\n      WHERE o.clerk_user_id = $1\n      ORDER BY o.created_at DESC\n      LIMIT 200\n      ", [userId]));

        case 8:
          orders = _context21.sent;
          return _context21.abrupt("return", res.json({
            ok: true,
            items: orders.rows.map(function (row) {
              return {
                id: row.id,
                rewardId: row.reward_id,
                title: row.title,
                category: row.category,
                imageUrl: row.image_url || '',
                pointsCost: row.points_cost,
                status: row.status,
                createdAt: row.created_at
              };
            })
          }));

        case 12:
          _context21.prev = 12;
          _context21.t0 = _context21["catch"](0);
          console.error('[BE] /rewards/orders error:', _context21.t0);
          return _context21.abrupt("return", res.status(500).json({
            error: 'Internal server error'
          }));

        case 16:
        case "end":
          return _context21.stop();
      }
    }
  }, null, null, [[0, 12]]);
});
/**
 * POST /checkins/today
 * 规则：同一天重复点不会重复加分
 * 返回：points、totalDays、checkedInToday、gainedPoints
 */

app.post('/checkins/today', function _callee15(req, res) {
  var client, _getAuth14, userId, today, ins, didInsert, streakDays, gainedPoints, multiplier, total, points, returnedGainedPoints, currentPoints;

  return regeneratorRuntime.async(function _callee15$(_context22) {
    while (1) {
      switch (_context22.prev = _context22.next) {
        case 0:
          _context22.next = 2;
          return regeneratorRuntime.awrap(_db.pool.connect());

        case 2:
          client = _context22.sent;
          _context22.prev = 3;
          _getAuth14 = (0, _express2.getAuth)(req), userId = _getAuth14.userId;

          if (userId) {
            _context22.next = 7;
            break;
          }

          return _context22.abrupt("return", res.status(401).json({
            error: 'Unauthenticated'
          }));

        case 7:
          _context22.next = 9;
          return regeneratorRuntime.awrap(ensureUserRow(userId));

        case 9:
          _context22.next = 11;
          return regeneratorRuntime.awrap(getLondonToday());

        case 11:
          today = _context22.sent;
          _context22.next = 14;
          return regeneratorRuntime.awrap(client.query('BEGIN'));

        case 14:
          _context22.next = 16;
          return regeneratorRuntime.awrap(client.query("\n      INSERT INTO app_checkins (clerk_user_id, checkin_date)\n      VALUES ($1, $2)\n      ON CONFLICT (clerk_user_id, checkin_date) DO NOTHING\n      RETURNING id\n      ", [userId, today]));

        case 16:
          ins = _context22.sent;
          didInsert = ins.rowCount === 1;
          streakDays = 0;
          gainedPoints = 0; // 只有今天第一次签到才加分

          if (!didInsert) {
            _context22.next = 31;
            break;
          }

          _context22.next = 23;
          return regeneratorRuntime.awrap(getStreakDays(client, userId, today));

        case 23:
          streakDays = _context22.sent;
          multiplier = 1;

          if (streakDays === TRIPLE_REWARD_STREAK) {
            multiplier = TRIPLE_REWARD_MULTIPLIER;
          }

          gainedPoints = CHECKIN_POINTS * multiplier;
          _context22.next = 29;
          return regeneratorRuntime.awrap(client.query("UPDATE app_users SET points = points + $2, last_seen_at = NOW() WHERE clerk_user_id = $1", [userId, gainedPoints]));

        case 29:
          _context22.next = 34;
          break;

        case 31:
          _context22.next = 33;
          return regeneratorRuntime.awrap(getStreakDays(client, userId, today));

        case 33:
          streakDays = _context22.sent;

        case 34:
          _context22.next = 36;
          return regeneratorRuntime.awrap(client.query("SELECT COUNT(*)::int AS total_days FROM app_checkins WHERE clerk_user_id=$1", [userId]));

        case 36:
          total = _context22.sent;
          _context22.next = 39;
          return regeneratorRuntime.awrap(client.query("SELECT points FROM app_users WHERE clerk_user_id=$1", [userId]));

        case 39:
          points = _context22.sent;
          _context22.next = 42;
          return regeneratorRuntime.awrap(client.query('COMMIT'));

        case 42:
          returnedGainedPoints = 0;

          if (didInsert) {
            returnedGainedPoints = gainedPoints;
          }

          currentPoints = 0;

          if (points.rows && points.rows.length > 0 && points.rows[0] && points.rows[0].points != null) {
            currentPoints = points.rows[0].points;
          }

          return _context22.abrupt("return", res.json({
            ok: true,
            today: today,
            checkedInToday: true,
            gainedPoints: returnedGainedPoints,
            totalDays: total.rows[0].total_days,
            streakDays: streakDays,
            points: currentPoints
          }));

        case 49:
          _context22.prev = 49;
          _context22.t0 = _context22["catch"](3);
          _context22.next = 53;
          return regeneratorRuntime.awrap(client.query('ROLLBACK'));

        case 53:
          console.error('[BE] /checkins/today error:', _context22.t0);
          return _context22.abrupt("return", res.status(500).json({
            error: 'Internal server error'
          }));

        case 55:
          _context22.prev = 55;
          client.release();
          return _context22.finish(55);

        case 58:
        case "end":
          return _context22.stop();
      }
    }
  }, null, null, [[3, 49, 55, 58]]);
}); // Render 必须：绑定 0.0.0.0，并监听 PORT

app.listen(port, '0.0.0.0', function () {
  console.log('Backend listening on port ' + String(port));
});
//# sourceMappingURL=index.dev.js.map
