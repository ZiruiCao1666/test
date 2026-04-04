"use strict";

require("dotenv/config");

var _express = _interopRequireDefault(require("express"));

var _cors = _interopRequireDefault(require("cors"));

var _nodeCrypto = require("node:crypto");

var _express2 = require("@clerk/express");

var _db = require("./db.js");

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { "default": obj }; }

function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); if (enumerableOnly) symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; }); keys.push.apply(keys, symbols); } return keys; }

function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i] != null ? arguments[i] : {}; if (i % 2) { ownKeys(source, true).forEach(function (key) { _defineProperty(target, key, source[key]); }); } else if (Object.getOwnPropertyDescriptors) { Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)); } else { ownKeys(source).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } } return target; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

function _slicedToArray(arr, i) { return _arrayWithHoles(arr) || _iterableToArrayLimit(arr, i) || _nonIterableRest(); }

function _nonIterableRest() { throw new TypeError("Invalid attempt to destructure non-iterable instance"); }

function _iterableToArrayLimit(arr, i) { if (!(Symbol.iterator in Object(arr) || Object.prototype.toString.call(arr) === "[object Arguments]")) { return; } var _arr = []; var _n = true; var _d = false; var _e = undefined; try { for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) { _arr.push(_s.value); if (i && _arr.length === i) break; } } catch (err) { _d = true; _e = err; } finally { try { if (!_n && _i["return"] != null) _i["return"](); } finally { if (_d) throw _e; } } return _arr; }

function _arrayWithHoles(arr) { if (Array.isArray(arr)) return arr; }

function _toConsumableArray(arr) { return _arrayWithoutHoles(arr) || _iterableToArray(arr) || _nonIterableSpread(); }

function _nonIterableSpread() { throw new TypeError("Invalid attempt to spread non-iterable instance"); }

function _iterableToArray(iter) { if (Symbol.iterator in Object(iter) || Object.prototype.toString.call(iter) === "[object Arguments]") return Array.from(iter); }

function _arrayWithoutHoles(arr) { if (Array.isArray(arr)) { for (var i = 0, arr2 = new Array(arr.length); i < arr.length; i++) { arr2[i] = arr[i]; } return arr2; } }

var app = (0, _express["default"])();
var port = 10000;
var parsedPort = Number(process.env.PORT);

if (Number.isFinite(parsedPort) && parsedPort > 0) {
  port = parsedPort;
} // 允许前端带 Authorization: Bearer <token> 调用后端。
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

var CHECKIN_POINTS = 5;
var NEW_USER_FIRST_WEEK_REWARDS = [1, 2, 3, 5, 8, 10, 10];
var MAKEUP_CARD_REWARD_TITLE = 'Make-up Card';
var MAKEUP_CARD_REWARD_CATEGORY = 'makeup_card';
var CANVAS_ENCRYPTION_ALGO = 'aes-256-gcm';
var CANVAS_IV_BYTES = 12;
var CANVAS_TOKEN_SECRET = '';

if (process.env.CANVAS_TOKEN_SECRET) {
  CANVAS_TOKEN_SECRET = process.env.CANVAS_TOKEN_SECRET;
}

var TASK_MODE_DEADLINE = 'deadline';
var TASK_MODE_RANGE = 'range';
var NEXT_DAY_NOTE_MAX_LENGTH = 200;

function normalizeNextDayNote(value) {
  var safeValue = '';

  if (value === null) {} else if (value === undefined) {} else {
    safeValue = value;
  }

  var safeNote = String(safeValue).trim();

  if (!safeNote) {
    return '';
  }

  if (safeNote.length > NEXT_DAY_NOTE_MAX_LENGTH) {
    safeNote = safeNote.slice(0, NEXT_DAY_NOTE_MAX_LENGTH);
  }

  return safeNote;
}

function ensureMakeupCardUserColumn(db) {
  return regeneratorRuntime.async(function ensureMakeupCardUserColumn$(_context) {
    while (1) {
      switch (_context.prev = _context.next) {
        case 0:
          _context.next = 2;
          return regeneratorRuntime.awrap(db.query("\n    ALTER TABLE app_users\n      ADD COLUMN IF NOT EXISTS makeup_cards INT NOT NULL DEFAULT 0;\n  "));

        case 2:
        case "end":
          return _context.stop();
      }
    }
  });
}

function getDateText(value) {
  if (typeof value === 'string') {
    var safeValue = value.trim();

    if (/^\d{4}-\d{2}-\d{2}$/.test(safeValue)) {
      return safeValue;
    }
  }

  var parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return '';
  }

  var utcDate = new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()));
  return utcDate.toISOString().slice(0, 10);
}

function getDateTextWithOffset(value, offsetDays) {
  var baseDateText = getDateText(value);

  if (!baseDateText) {
    return '';
  }

  var date = new Date(baseDateText + 'T00:00:00Z');
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

function mapRewardRow(row) {
  var imageUrl = '';

  if (row.image_url) {
    imageUrl = row.image_url;
  }

  return {
    id: row.id,
    title: row.title,
    pointsCost: row.points_cost,
    category: row.category,
    imageUrl: imageUrl,
    isActive: row.is_active
  };
}

function isMakeupCardReward(reward) {
  var safeReward = {};

  if (reward) {
    safeReward = reward;
  }

  if (safeReward.category === MAKEUP_CARD_REWARD_CATEGORY) {
    return true;
  }

  if (safeReward.title === MAKEUP_CARD_REWARD_TITLE) {
    return true;
  }

  return false;
}

function trimTaskTime(value) {
  var safeValue = '';

  if (value === null) {} else if (value === undefined) {} else {
    safeValue = value;
  }

  var safe = String(safeValue).trim();

  if (safe === '') {
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

  if (value === null) {} else if (value === undefined) {} else {
    safeValue = value;
  }

  var safe = String(safeValue).trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(safe)) {
    return '';
  }

  return safe;
}

function normalizeTimeInput(value) {
  var safeValue = '';

  if (value === null) {} else if (value === undefined) {} else {
    safeValue = value;
  }

  var safe = String(safeValue).trim();

  if (!/^([01]\d|2[0-3]):([0-5]\d)$/.test(safe)) {
    return '';
  }

  return safe;
}

function normalizeTaskPayload(body) {
  var safeBody = {};

  if (body) {
    safeBody = body;
  }

  var titleValue = '';

  if (safeBody.title === null) {} else if (safeBody.title === undefined) {} else {
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

  if (title === '') {
    return {
      error: 'Task title is required'
    };
  }

  if (title.length > 200) {
    return {
      error: 'Task title is too long'
    };
  }

  if (taskDate === '') {
    return {
      error: 'Task date must be YYYY-MM-DD'
    };
  }

  if (timingMode === TASK_MODE_DEADLINE) {
    if (dueTime === '') {
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

  if (startTime === '') {
    return {
      error: 'Start time and end time must be HH:MM'
    };
  }

  if (endTime === '') {
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
  if (CANVAS_TOKEN_SECRET === '') {
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
  var safeValue = '';

  if (value !== null && value !== undefined) {
    safeValue = value;
  }

  var trimmed = String(safeValue).trim();

  if (trimmed === '') {
    return '';
  }

  var withProtocol = 'https://' + trimmed;

  if (/^https?:\/\//i.test(trimmed)) {
    withProtocol = trimmed;
  }

  return withProtocol.replace(/\/+$/, '');
}

function getKnownCanvasBaseUrl(value) {
  var safeValue = '';

  if (value !== null && value !== undefined) {
    safeValue = value;
  }

  var trimmed = String(safeValue).trim();

  if (trimmed === '') {
    return '';
  }

  var normalized = normalizeCanvasBaseUrl(trimmed).toLowerCase();

  if (normalized === 'https://canvas.hull.ac.uk') {
    return 'https://canvas.hull.ac.uk';
  }

  var lower = trimmed.toLowerCase();

  if (lower === 'hull') {
    return 'https://canvas.hull.ac.uk';
  }

  if (lower === 'hull.ac.uk') {
    return 'https://canvas.hull.ac.uk';
  }

  if (lower === 'canvas.hull.ac.uk') {
    return 'https://canvas.hull.ac.uk';
  }

  return '';
}

function buildCanvasBaseUrl(value) {
  var safeValue = '';

  if (value !== null && value !== undefined) {
    safeValue = value;
  }

  var trimmed = String(safeValue).trim();

  if (trimmed === '') {
    return '';
  }

  var knownBaseUrl = getKnownCanvasBaseUrl(trimmed);

  if (knownBaseUrl !== '') {
    return knownBaseUrl;
  }

  var looksLikeDomain = false;

  if (trimmed.includes('.')) {
    looksLikeDomain = true;
  } else if (/^https?:\/\//i.test(trimmed)) {
    looksLikeDomain = true;
  }

  if (looksLikeDomain) {
    return normalizeCanvasBaseUrl(trimmed);
  }

  return 'https://' + trimmed + '.instructure.com';
}

function buildAbsoluteCanvasUrl(baseUrl, value) {
  var safeValue = '';

  if (value !== null && value !== undefined) {
    safeValue = value;
  }

  var trimmed = String(safeValue).trim();

  if (trimmed === '') {
    return '';
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  if (trimmed.startsWith('/')) {
    return baseUrl + trimmed;
  }

  return baseUrl + '/' + trimmed;
}

function parseLinkHeader(header) {
  if (header === null || header === undefined || header === '') {
    return {};
  }

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
  return regeneratorRuntime.async(function fetchCanvasPage$(_context2) {
    while (1) {
      switch (_context2.prev = _context2.next) {
        case 0:
          url = baseUrl + pathOrUrl;

          if (/^https?:\/\//i.test(pathOrUrl)) {
            url = pathOrUrl;
          }

          _context2.next = 4;
          return regeneratorRuntime.awrap(fetch(url, {
            headers: {
              Authorization: 'Bearer ' + token,
              Accept: 'application/json'
            }
          }));

        case 4:
          response = _context2.sent;
          _context2.next = 7;
          return regeneratorRuntime.awrap(response.text());

        case 7:
          raw = _context2.sent;
          data = null;

          if (raw) {
            try {
              data = JSON.parse(raw);
            } catch (_error) {
              data = null;
            }
          }

          if (response.ok) {
            _context2.next = 17;
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
          return _context2.abrupt("return", {
            data: data,
            nextUrl: links.next || ''
          });

        case 19:
        case "end":
          return _context2.stop();
      }
    }
  });
}

function fetchCanvasPaged(baseUrl, token, path) {
  var nextUrl, aggregated, visited, _ref, data, newNextUrl;

  return regeneratorRuntime.async(function fetchCanvasPaged$(_context3) {
    while (1) {
      switch (_context3.prev = _context3.next) {
        case 0:
          nextUrl = path;
          aggregated = [];
          visited = new Set();

        case 3:
          if (!nextUrl) {
            _context3.next = 18;
            break;
          }

          if (!visited.has(nextUrl)) {
            _context3.next = 6;
            break;
          }

          return _context3.abrupt("break", 18);

        case 6:
          visited.add(nextUrl);
          _context3.next = 9;
          return regeneratorRuntime.awrap(fetchCanvasPage(baseUrl, token, nextUrl));

        case 9:
          _ref = _context3.sent;
          data = _ref.data;
          newNextUrl = _ref.nextUrl;

          if (Array.isArray(data)) {
            _context3.next = 14;
            break;
          }

          return _context3.abrupt("return", data);

        case 14:
          aggregated.push.apply(aggregated, _toConsumableArray(data));
          nextUrl = newNextUrl;
          _context3.next = 3;
          break;

        case 18:
          return _context3.abrupt("return", aggregated);

        case 19:
        case "end":
          return _context3.stop();
      }
    }
  });
}

function getStoredCanvasCredentials(userId) {
  var result, row, token, hasEncryptedToken;
  return regeneratorRuntime.async(function getStoredCanvasCredentials$(_context4) {
    while (1) {
      switch (_context4.prev = _context4.next) {
        case 0:
          _context4.next = 2;
          return regeneratorRuntime.awrap(ensureUserRow(userId));

        case 2:
          _context4.next = 4;
          return regeneratorRuntime.awrap(_db.pool.query("\n    SELECT canvas_school, canvas_token_ciphertext, canvas_token_iv, canvas_token_tag\n    FROM app_canvas_credentials\n    WHERE clerk_user_id = $1\n    ", [userId]));

        case 4:
          result = _context4.sent;

          if (!(result.rowCount === 0)) {
            _context4.next = 7;
            break;
          }

          return _context4.abrupt("return", {
            school: '',
            token: ''
          });

        case 7:
          row = result.rows[0];
          token = '';
          hasEncryptedToken = false;

          if (row.canvas_token_ciphertext) {
            if (row.canvas_token_iv) {
              if (row.canvas_token_tag) {
                hasEncryptedToken = true;
              }
            }
          }

          if (hasEncryptedToken) {
            token = decryptCanvasToken(row.canvas_token_ciphertext, row.canvas_token_iv, row.canvas_token_tag);
          }

          return _context4.abrupt("return", {
            school: row.canvas_school ? row.canvas_school : '',
            token: token
          });

        case 13:
        case "end":
          return _context4.stop();
      }
    }
  });
}

function buildCustomTaskDateTime(task) {
  var safeTask = {};

  if (task) {
    safeTask = task;
  }

  var rawTaskDate = '';

  if (safeTask.taskDate) {
    rawTaskDate = safeTask.taskDate;
  }

  var date = String(rawTaskDate).trim();

  if (date === '') {
    return '';
  }

  var startTime = trimTaskTime(safeTask.startTime);

  if (safeTask.timingMode === TASK_MODE_RANGE) {
    if (startTime !== '') {
      return date + 'T' + startTime + ':00';
    }
  }

  var dueTime = trimTaskTime(safeTask.dueTime);

  if (dueTime !== '') {
    return date + 'T' + dueTime + ':00';
  }

  return date + 'T12:00:00';
}

function formatHomeTaskSchedule(task) {
  // 把自定义任务转换成首页直接展示的时间文案。
  // 例如：
  // - 20 Mar | Due 18:00
  // - 25 Mar | 09:00 - 10:00
  var safeTask = {};

  if (task) {
    safeTask = task;
  }

  var rawTaskDate = '';

  if (safeTask.taskDate) {
    rawTaskDate = safeTask.taskDate;
  }

  var taskDate = String(rawTaskDate).trim();

  if (taskDate === '') {
    return 'Date not set';
  }

  var parsed = new Date(taskDate + 'T00:00:00');
  var dateLabel = taskDate;

  if (Number.isNaN(parsed.getTime()) === false) {
    dateLabel = parsed.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short'
    });
  }

  if (safeTask.timingMode === TASK_MODE_RANGE) {
    var start = trimTaskTime(safeTask.startTime);
    var end = trimTaskTime(safeTask.endTime);
    var safeStart = '--:--';

    if (start !== '') {
      safeStart = start;
    }

    var safeEnd = '--:--';

    if (end !== '') {
      safeEnd = end;
    }

    return dateLabel + ' | ' + safeStart + ' - ' + safeEnd;
  }

  var dueLabel = '--:--';
  var dueTime = trimTaskTime(safeTask.dueTime);

  if (dueTime !== '') {
    dueLabel = dueTime;
  }

  return dateLabel + ' | Due ' + dueLabel;
}

function getCanvasPlanDate(item) {
  // Canvas 不同类型的任务，时间字段不完全一致。
  // 这里按优先级兜底，尽量拿到最准确的截止时间。
  var safeItem = {};

  if (item) {
    safeItem = item;
  }

  var plannable = {};

  if (safeItem.plannable) {
    plannable = safeItem.plannable;
  }

  var assignment = {};

  if (safeItem.assignment) {
    assignment = safeItem.assignment;
  }

  return plannable.due_at || plannable.todo_date || safeItem.plannable_date || assignment.due_at || safeItem.due_at || safeItem.start_at || safeItem.end_at || plannable.all_day_date || safeItem.all_day_date || '';
}

function getCanvasPlanTitle(item) {
  // Canvas 标题字段可能出现在 plannable / assignment / 顶层对象里，
  // 这里统一做一次提取，减少前端重复判断。
  var safeItem = {};

  if (item) {
    safeItem = item;
  }

  var plannable = {};

  if (safeItem.plannable) {
    plannable = safeItem.plannable;
  }

  var assignment = {};

  if (safeItem.assignment) {
    assignment = safeItem.assignment;
  }

  return plannable.name || plannable.title || safeItem.title || safeItem.name || assignment.name || 'Untitled event';
}

function getCanvasPlanType(item) {
  // 把 Canvas 返回的原始类型整理成更适合前端直接显示的文本。
  var safeItem = {};

  if (item) {
    safeItem = item;
  }

  var assignment = {};

  if (safeItem.assignment) {
    assignment = safeItem.assignment;
  }

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
  var safeItem = {};

  if (item) {
    safeItem = item;
  }

  var assignment = {};

  if (safeItem.assignment) {
    assignment = safeItem.assignment;
  }

  var plannable = {};

  if (safeItem.plannable) {
    plannable = safeItem.plannable;
  }

  var rawCourseId = '';

  if (safeItem.course_id) {
    rawCourseId = safeItem.course_id;
  } else if (safeItem.context_id) {
    rawCourseId = safeItem.context_id;
  }

  var courseId = String(rawCourseId);

  if (courseId !== '') {
    if (courseNameById[courseId]) {
      return courseNameById[courseId];
    }
  }

  return safeItem.context_name || safeItem.course_name || assignment.course_name || plannable.context_name || '';
}

function getCanvasPlanCourseId(item) {
  var safeItem = {};

  if (item) {
    safeItem = item;
  }

  var assignment = {};

  if (safeItem.assignment) {
    assignment = safeItem.assignment;
  }

  var plannable = {};

  if (safeItem.plannable) {
    plannable = safeItem.plannable;
  }

  var courseId = '';

  if (safeItem.course_id) {
    courseId = safeItem.course_id;
  } else if (safeItem.context_id) {
    courseId = safeItem.context_id;
  } else if (assignment.course_id) {
    courseId = assignment.course_id;
  } else if (plannable.course_id) {
    courseId = plannable.course_id;
  }

  if (courseId === '') {
    return '';
  }

  return String(courseId);
}

function getCanvasPlanAssignmentId(item) {
  var safeItem = {};

  if (item) {
    safeItem = item;
  }

  var assignment = {};

  if (safeItem.assignment) {
    assignment = safeItem.assignment;
  }

  var plannable = {};

  if (safeItem.plannable) {
    plannable = safeItem.plannable;
  }

  var assignmentId = '';

  if (safeItem.assignment_id) {
    assignmentId = safeItem.assignment_id;
  } else if (assignment.id) {
    assignmentId = assignment.id;
  }

  var safePlannableType = '';

  if (safeItem.plannable_type) {
    safePlannableType = safeItem.plannable_type;
  }

  if (assignmentId === '') {
    if (String(safePlannableType).toLowerCase() === 'assignment') {
      if (plannable.id) {
        assignmentId = plannable.id;
      }
    }
  }

  if (assignmentId === '') {
    return '';
  }

  return String(assignmentId);
}

function toFiniteNumber(value) {
  var parsed = Number(value);

  if (Number.isFinite(parsed)) {
    return parsed;
  }

  return null;
}

function normalizeTeacherComments(submission) {
  var safeSubmission = {};

  if (submission) {
    safeSubmission = submission;
  }

  var safeComments = [];

  if (Array.isArray(safeSubmission.submission_comments)) {
    safeComments = safeSubmission.submission_comments;
  }

  var rawUserId = '';

  if (safeSubmission.user_id) {
    rawUserId = safeSubmission.user_id;
  }

  var currentUserId = String(rawUserId);
  return safeComments.filter(function (comment) {
    var safeComment = {};

    if (comment) {
      safeComment = comment;
    }

    var rawCommentText = '';

    if (safeComment.comment) {
      rawCommentText = safeComment.comment;
    }

    var commentText = String(rawCommentText).trim();

    if (commentText === '') {
      return false;
    }

    if (currentUserId === '') {
      return true;
    }

    var rawAuthorId = '';

    if (safeComment.author_id) {
      rawAuthorId = safeComment.author_id;
    }

    var authorId = String(rawAuthorId);

    if (authorId === currentUserId) {
      return false;
    }

    return true;
  }).map(function (comment, index) {
    var safeComment = {};

    if (comment) {
      safeComment = comment;
    }

    var commentId = 'comment-' + String(index);

    if (safeComment.id) {
      commentId = String(safeComment.id);
    }

    var authorName = 'Teacher';

    if (safeComment.author_name) {
      authorName = String(safeComment.author_name);
    }

    var commentText = '';

    if (safeComment.comment) {
      commentText = String(safeComment.comment).trim();
    }

    var createdAt = '';

    if (safeComment.created_at) {
      createdAt = String(safeComment.created_at);
    }

    return {
      id: commentId,
      authorName: authorName,
      comment: commentText,
      createdAt: createdAt
    };
  });
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
    courseId: getCanvasPlanCourseId(safeItem),
    assignmentId: getCanvasPlanAssignmentId(safeItem),
    type: getCanvasPlanType(safeItem),
    date: date,
    timestampMs: sortTs,
    htmlUrl: buildAbsoluteCanvasUrl(baseUrl, safeItem.html_url || plannable.html_url || assignment.html_url || ''),
    isCompleted: completed,
    score: null,
    pointsPossible: null,
    teacherComments: [],
    sortTs: sortTs
  };
}

function fetchCanvasSubmissionDetailsForCourse(baseUrl, token, courseId, assignmentIds) {
  var safeAssignmentIds, params, path;
  return regeneratorRuntime.async(function fetchCanvasSubmissionDetailsForCourse$(_context5) {
    while (1) {
      switch (_context5.prev = _context5.next) {
        case 0:
          safeAssignmentIds = [];

          if (Array.isArray(assignmentIds)) {
            safeAssignmentIds = assignmentIds.map(function (assignmentId) {
              var safeAssignmentId = '';

              if (assignmentId) {
                safeAssignmentId = assignmentId;
              }

              return String(safeAssignmentId).trim();
            }).filter(Boolean);
          }

          if (!(courseId === '' || courseId === null || courseId === undefined)) {
            _context5.next = 4;
            break;
          }

          return _context5.abrupt("return", []);

        case 4:
          if (!(safeAssignmentIds.length === 0)) {
            _context5.next = 6;
            break;
          }

          return _context5.abrupt("return", []);

        case 6:
          params = new URLSearchParams();
          params.append('student_ids[]', 'self');
          safeAssignmentIds.forEach(function (assignmentId) {
            params.append('assignment_ids[]', assignmentId);
          });
          params.append('include[]', 'submission_comments');
          params.append('include[]', 'assignment');
          params.append('per_page', String(Math.max(50, safeAssignmentIds.length)));
          path = '/api/v1/courses/' + encodeURIComponent(courseId) + '/students/submissions?' + params.toString();
          return _context5.abrupt("return", fetchCanvasPaged(baseUrl, token, path));

        case 14:
        case "end":
          return _context5.stop();
      }
    }
  });
}

function enrichPlanItemsWithSubmissionDetails(baseUrl, token, items) {
  var safeItems, assignmentIdsByCourse, submissionByKey;
  return regeneratorRuntime.async(function enrichPlanItemsWithSubmissionDetails$(_context7) {
    while (1) {
      switch (_context7.prev = _context7.next) {
        case 0:
          safeItems = [];

          if (Array.isArray(items)) {
            safeItems = items.slice();
          }

          assignmentIdsByCourse = {};
          safeItems.forEach(function (item) {
            var safeItem = item || {};

            if (safeItem.source !== 'canvas') {
              return;
            }

            if (!safeItem.courseId) {
              return;
            }

            if (!safeItem.assignmentId) {
              return;
            }

            if (!assignmentIdsByCourse[safeItem.courseId]) {
              assignmentIdsByCourse[safeItem.courseId] = new Set();
            }

            assignmentIdsByCourse[safeItem.courseId].add(String(safeItem.assignmentId));
          });
          submissionByKey = {};
          _context7.next = 7;
          return regeneratorRuntime.awrap(Promise.all(Object.entries(assignmentIdsByCourse).map(function _callee(_ref2) {
            var _ref3, courseId, assignmentIdsSet, details, safeDetails;

            return regeneratorRuntime.async(function _callee$(_context6) {
              while (1) {
                switch (_context6.prev = _context6.next) {
                  case 0:
                    _ref3 = _slicedToArray(_ref2, 2), courseId = _ref3[0], assignmentIdsSet = _ref3[1];
                    _context6.prev = 1;
                    _context6.next = 4;
                    return regeneratorRuntime.awrap(fetchCanvasSubmissionDetailsForCourse(baseUrl, token, courseId, Array.from(assignmentIdsSet)));

                  case 4:
                    details = _context6.sent;
                    safeDetails = [];

                    if (Array.isArray(details)) {
                      safeDetails = details;
                    }

                    safeDetails.forEach(function (detail) {
                      var safeDetail = detail || {};
                      var rawAssignmentId = '';

                      if (safeDetail.assignment_id) {
                        rawAssignmentId = safeDetail.assignment_id;
                      } else if (safeDetail.assignment) {
                        if (safeDetail.assignment.id) {
                          rawAssignmentId = safeDetail.assignment.id;
                        }
                      }

                      var assignmentId = String(rawAssignmentId);

                      if (assignmentId === '') {
                        return;
                      }

                      submissionByKey[String(courseId) + ':' + assignmentId] = safeDetail;
                    });
                    _context6.next = 13;
                    break;

                  case 10:
                    _context6.prev = 10;
                    _context6.t0 = _context6["catch"](1);
                    console.error('[BE] /home/plan submission detail error:', _context6.t0);

                  case 13:
                  case "end":
                    return _context6.stop();
                }
              }
            }, null, null, [[1, 10]]);
          })));

        case 7:
          return _context7.abrupt("return", safeItems.map(function (item) {
            var safeItem = item || {};

            if (safeItem.source !== 'canvas') {
              return safeItem;
            }

            if (!safeItem.courseId) {
              return safeItem;
            }

            if (!safeItem.assignmentId) {
              return safeItem;
            }

            var detailKey = String(safeItem.courseId) + ':' + String(safeItem.assignmentId);
            var detail = submissionByKey[detailKey];

            if (!detail) {
              return safeItem;
            }

            var assignment = detail.assignment || {};
            var score = toFiniteNumber(detail.score);
            var pointsPossible = toFiniteNumber(assignment.points_possible);

            if (pointsPossible === null) {
              pointsPossible = toFiniteNumber(detail.points_possible);
            }

            return _objectSpread({}, safeItem, {
              score: score,
              pointsPossible: pointsPossible,
              teacherComments: normalizeTeacherComments(detail)
            });
          }));

        case 8:
        case "end":
          return _context7.stop();
      }
    }
  });
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
  return regeneratorRuntime.async(function getStreakDays$(_context8) {
    while (1) {
      switch (_context8.prev = _context8.next) {
        case 0:
          _context8.next = 2;
          return regeneratorRuntime.awrap(db.query("\n    WITH ordered AS (\n      SELECT checkin_date,\n             ROW_NUMBER() OVER (ORDER BY checkin_date DESC) AS rn\n      FROM app_checkins\n      WHERE clerk_user_id = $1 AND checkin_date <= $2\n    ),\n    grouped AS (\n      SELECT checkin_date,\n             (checkin_date + rn * INTERVAL '1 day')::date AS grp\n      FROM ordered\n    )\n    SELECT COUNT(*)::int AS streak\n    FROM grouped\n    WHERE grp = (SELECT grp FROM grouped ORDER BY checkin_date DESC LIMIT 1)\n    ", [userId, today]));

        case 2:
          r = _context8.sent;
          firstRow = null;

          if (r.rows && r.rows.length > 0) {
            firstRow = r.rows[0];
          }

          if (!(firstRow && firstRow.streak != null)) {
            _context8.next = 7;
            break;
          }

          return _context8.abrupt("return", firstRow.streak);

        case 7:
          return _context8.abrupt("return", 0);

        case 8:
        case "end":
          return _context8.stop();
      }
    }
  });
}

function getMakeupCardStatus(db, userId, today) {
  var yesterday, userResult, makeupCards, yesterdayCheckinResult, yesterdayCheckedIn, canUse;
  return regeneratorRuntime.async(function getMakeupCardStatus$(_context9) {
    while (1) {
      switch (_context9.prev = _context9.next) {
        case 0:
          yesterday = getDateTextWithOffset(today, -1);

          if (yesterday) {
            _context9.next = 3;
            break;
          }

          throw new Error('Cannot resolve yesterday date');

        case 3:
          _context9.next = 5;
          return regeneratorRuntime.awrap(db.query("\n    SELECT COALESCE(makeup_cards, 0)::int AS makeup_cards\n    FROM app_users\n    WHERE clerk_user_id = $1\n    LIMIT 1\n    ", [userId]));

        case 5:
          userResult = _context9.sent;
          makeupCards = 0;

          if (userResult.rows && userResult.rows.length > 0) {
            if (userResult.rows[0] && userResult.rows[0].makeup_cards != null) {
              makeupCards = Number(userResult.rows[0].makeup_cards) || 0;
            }
          }

          _context9.next = 10;
          return regeneratorRuntime.awrap(db.query("\n    SELECT id\n    FROM app_checkins\n    WHERE clerk_user_id = $1 AND checkin_date = $2\n    LIMIT 1\n    ", [userId, yesterday]));

        case 10:
          yesterdayCheckinResult = _context9.sent;
          yesterdayCheckedIn = false;

          if (yesterdayCheckinResult.rows && yesterdayCheckinResult.rows.length > 0) {
            yesterdayCheckedIn = true;
          }

          canUse = false;

          if (makeupCards > 0) {
            if (!yesterdayCheckedIn) {
              canUse = true;
            }
          }

          return _context9.abrupt("return", {
            today: today,
            yesterday: yesterday,
            makeupCards: makeupCards,
            yesterdayCheckedIn: yesterdayCheckedIn,
            canUse: canUse
          });

        case 16:
        case "end":
          return _context9.stop();
      }
    }
  });
}

function getCheckinRewardPoints(streakDays) {
  var safeStreakDays = Number(streakDays);

  if (!Number.isFinite(safeStreakDays)) {
    safeStreakDays = 0;
  }

  if (safeStreakDays >= 1 && safeStreakDays <= NEW_USER_FIRST_WEEK_REWARDS.length) {
    return NEW_USER_FIRST_WEEK_REWARDS[safeStreakDays - 1];
  }

  return CHECKIN_POINTS;
}

function initDb() {
  return regeneratorRuntime.async(function initDb$(_context10) {
    while (1) {
      switch (_context10.prev = _context10.next) {
        case 0:
          _context10.next = 2;
          return regeneratorRuntime.awrap(_db.pool.query("\n    CREATE TABLE IF NOT EXISTS app_users (\n      clerk_user_id TEXT PRIMARY KEY,\n      email TEXT,\n      full_name TEXT,\n      avatar_url TEXT,\n      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),\n      last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()\n    );\n\n    ALTER TABLE app_users\n      ADD COLUMN IF NOT EXISTS points INT NOT NULL DEFAULT 0;\n\n    ALTER TABLE app_users\n      ADD COLUMN IF NOT EXISTS makeup_cards INT NOT NULL DEFAULT 0;\n\n    CREATE TABLE IF NOT EXISTS app_checkins (\n      id BIGSERIAL PRIMARY KEY,\n      clerk_user_id TEXT NOT NULL,\n      checkin_date DATE NOT NULL,\n      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),\n      UNIQUE (clerk_user_id, checkin_date)\n    );\n\n    ALTER TABLE app_checkins\n      ADD COLUMN IF NOT EXISTS next_day_note TEXT;\n\n    ALTER TABLE app_checkins\n      ADD COLUMN IF NOT EXISTS next_day_note_updated_at TIMESTAMPTZ;\n\n    CREATE TABLE IF NOT EXISTS app_canvas_credentials (\n      clerk_user_id TEXT PRIMARY KEY REFERENCES app_users (clerk_user_id) ON DELETE CASCADE,\n      canvas_school TEXT NOT NULL DEFAULT '',\n      canvas_token_ciphertext TEXT,\n      canvas_token_iv TEXT,\n      canvas_token_tag TEXT,\n      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()\n    );\n\n    CREATE TABLE IF NOT EXISTS app_rewards (\n      id BIGSERIAL PRIMARY KEY,\n      title TEXT NOT NULL,\n      points_cost INT NOT NULL CHECK (points_cost > 0),\n      category TEXT NOT NULL DEFAULT 'coupon',\n      image_url TEXT,\n      is_active BOOLEAN NOT NULL DEFAULT TRUE,\n      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()\n    );\n\n    CREATE UNIQUE INDEX IF NOT EXISTS idx_app_rewards_title_unique\n      ON app_rewards (title);\n\n    CREATE TABLE IF NOT EXISTS app_reward_orders (\n      id BIGSERIAL PRIMARY KEY,\n      clerk_user_id TEXT NOT NULL REFERENCES app_users (clerk_user_id) ON DELETE CASCADE,\n      reward_id BIGINT NOT NULL REFERENCES app_rewards (id),\n      points_cost INT NOT NULL CHECK (points_cost > 0),\n      status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('pending', 'completed')),\n      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()\n    );\n\n    CREATE INDEX IF NOT EXISTS idx_app_reward_orders_user_created_at\n      ON app_reward_orders (clerk_user_id, created_at DESC);\n\n    CREATE TABLE IF NOT EXISTS app_custom_tasks (\n      id BIGSERIAL PRIMARY KEY,\n      clerk_user_id TEXT NOT NULL REFERENCES app_users (clerk_user_id) ON DELETE CASCADE,\n      title TEXT NOT NULL,\n      task_date DATE NOT NULL,\n      timing_mode TEXT NOT NULL DEFAULT 'deadline'\n        CHECK (timing_mode IN ('deadline', 'range')),\n      due_time TIME,\n      start_time TIME,\n      end_time TIME,\n      is_completed BOOLEAN NOT NULL DEFAULT FALSE,\n      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),\n      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()\n    );\n\n    CREATE INDEX IF NOT EXISTS idx_app_custom_tasks_user_date\n      ON app_custom_tasks (clerk_user_id, task_date ASC, created_at ASC);\n  "));

        case 2:
          _context10.next = 4;
          return regeneratorRuntime.awrap(_db.pool.query("\n    INSERT INTO app_rewards (title, points_cost, category, image_url, is_active)\n    VALUES\n      ('Make-up Card', 100, 'makeup_card', '', TRUE),\n      ('Coffee Coupon', 120, 'drinks', '', TRUE),\n      ('Latte Coupon', 160, 'drinks', '', TRUE),\n      ('Discount Coupon', 200, 'coupon', '', TRUE),\n      ('Big Discount Coupon', 260, 'coupon', '', TRUE)\n    ON CONFLICT (title) DO NOTHING;\n    "));

        case 4:
        case "end":
          return _context10.stop();
      }
    }
  });
}

initDb()["catch"](function (e) {
  console.error('[DB] init failed:', e); // On hosted platforms, keep the service alive so /health can still report DB problems.
});
app.get('/health', function _callee2(_req, res) {
  return regeneratorRuntime.async(function _callee2$(_context11) {
    while (1) {
      switch (_context11.prev = _context11.next) {
        case 0:
          _context11.prev = 0;
          _context11.next = 3;
          return regeneratorRuntime.awrap(_db.pool.query('SELECT 1'));

        case 3:
          res.json({
            ok: true
          });
          _context11.next = 9;
          break;

        case 6:
          _context11.prev = 6;
          _context11.t0 = _context11["catch"](0);
          res.status(500).json({
            ok: false,
            error: 'DB not reachable'
          });

        case 9:
        case "end":
          return _context11.stop();
      }
    }
  }, null, null, [[0, 6]]);
}); // 用英国当天日期，避免时区跨天问题
// Use the London calendar date so daily features do not drift across time zones.

function getLondonToday() {
  var r;
  return regeneratorRuntime.async(function getLondonToday$(_context12) {
    while (1) {
      switch (_context12.prev = _context12.next) {
        case 0:
          _context12.next = 2;
          return regeneratorRuntime.awrap(_db.pool.query("SELECT (NOW() AT TIME ZONE 'Europe/London')::date AS today"));

        case 2:
          r = _context12.sent;
          return _context12.abrupt("return", r.rows[0].today);

        case 4:
        case "end":
          return _context12.stop();
      }
    }
  });
} // Make sure app_users always has one row for the current Clerk user.


function ensureUserRow(userId) {
  return regeneratorRuntime.async(function ensureUserRow$(_context13) {
    while (1) {
      switch (_context13.prev = _context13.next) {
        case 0:
          _context13.next = 2;
          return regeneratorRuntime.awrap(_db.pool.query("\n    INSERT INTO app_users (clerk_user_id, last_seen_at)\n    VALUES ($1, NOW())\n    ON CONFLICT (clerk_user_id) DO UPDATE SET last_seen_at = NOW();\n    ", [userId]));

        case 2:
        case "end":
          return _context13.stop();
      }
    }
  });
} // Frontend calls this after sign-in so the backend can sync the current Clerk user into Neon.
// Reference: Clerk Express getAuth(req) and Clerk backend users.getUser(userId).


app.post('/users/sync', function _callee3(req, res) {
  var _getAuth, userId, sessionId, user, primaryEmail, firstEmail, email, fullName, avatarUrl;

  return regeneratorRuntime.async(function _callee3$(_context14) {
    while (1) {
      switch (_context14.prev = _context14.next) {
        case 0:
          _context14.prev = 0;
          _getAuth = (0, _express2.getAuth)(req), userId = _getAuth.userId, sessionId = _getAuth.sessionId;

          if (userId) {
            _context14.next = 4;
            break;
          }

          return _context14.abrupt("return", res.status(401).json({
            error: 'Unauthenticated'
          }));

        case 4:
          _context14.next = 6;
          return regeneratorRuntime.awrap(_express2.clerkClient.users.getUser(userId));

        case 6:
          user = _context14.sent;
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
          _context14.next = 16;
          return regeneratorRuntime.awrap(_db.pool.query("\n      INSERT INTO app_users (clerk_user_id, email, full_name, avatar_url, last_seen_at)\n      VALUES ($1, $2, $3, $4, NOW())\n      ON CONFLICT (clerk_user_id)\n      DO UPDATE SET\n        email = EXCLUDED.email,\n        full_name = EXCLUDED.full_name,\n        avatar_url = EXCLUDED.avatar_url,\n        last_seen_at = NOW();\n      ", [userId, email, fullName, avatarUrl]));

        case 16:
          return _context14.abrupt("return", res.json({
            ok: true,
            userId: userId,
            sessionId: sessionId
          }));

        case 19:
          _context14.prev = 19;
          _context14.t0 = _context14["catch"](0);
          console.error('[BE] /users/sync error:', _context14.t0);
          return _context14.abrupt("return", res.status(500).json({
            error: 'Internal server error'
          }));

        case 23:
        case "end":
          return _context14.stop();
      }
    }
  }, null, null, [[0, 19]]);
});
/**
 * GET /canvas/credentials
 * Return the current user's saved Canvas school+token.
 */

app.get('/canvas/credentials', function _callee4(req, res) {
  var _getAuth2, userId, stored;

  return regeneratorRuntime.async(function _callee4$(_context15) {
    while (1) {
      switch (_context15.prev = _context15.next) {
        case 0:
          _context15.prev = 0;
          _getAuth2 = (0, _express2.getAuth)(req), userId = _getAuth2.userId;

          if (userId) {
            _context15.next = 4;
            break;
          }

          return _context15.abrupt("return", res.status(401).json({
            error: 'Unauthenticated'
          }));

        case 4:
          _context15.prev = 4;
          _context15.next = 7;
          return regeneratorRuntime.awrap(getStoredCanvasCredentials(userId));

        case 7:
          stored = _context15.sent;
          _context15.next = 14;
          break;

        case 10:
          _context15.prev = 10;
          _context15.t0 = _context15["catch"](4);
          console.error('[BE] /canvas/credentials decrypt error:', _context15.t0);
          return _context15.abrupt("return", res.status(500).json({
            error: 'Saved Canvas token cannot be decrypted. Check CANVAS_TOKEN_SECRET is set and unchanged.'
          }));

        case 14:
          return _context15.abrupt("return", res.json({
            ok: true,
            school: stored.school,
            token: stored.token
          }));

        case 17:
          _context15.prev = 17;
          _context15.t1 = _context15["catch"](0);
          console.error('[BE] /canvas/credentials error:', _context15.t1);
          return _context15.abrupt("return", res.status(500).json({
            error: 'Internal server error'
          }));

        case 21:
        case "end":
          return _context15.stop();
      }
    }
  }, null, null, [[0, 17], [4, 10]]);
});
/**
 * PUT /canvas/credentials
 * Save/update the current user's Canvas school+token.
 */

app.put('/canvas/credentials', function _callee5(req, res) {
  var _getAuth3, userId, safeBody, schoolRaw, tokenRaw, safeSchoolRaw, safeTokenRaw, school, token, encrypted;

  return regeneratorRuntime.async(function _callee5$(_context16) {
    while (1) {
      switch (_context16.prev = _context16.next) {
        case 0:
          _context16.prev = 0;
          _getAuth3 = (0, _express2.getAuth)(req), userId = _getAuth3.userId;

          if (userId) {
            _context16.next = 4;
            break;
          }

          return _context16.abrupt("return", res.status(401).json({
            error: 'Unauthenticated'
          }));

        case 4:
          if (CANVAS_TOKEN_SECRET) {
            _context16.next = 6;
            break;
          }

          return _context16.abrupt("return", res.status(500).json({
            error: 'Missing CANVAS_TOKEN_SECRET on server'
          }));

        case 6:
          _context16.next = 8;
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
            _context16.next = 19;
            break;
          }

          return _context16.abrupt("return", res.status(400).json({
            error: 'School is too long'
          }));

        case 19:
          if (!(token.length > 8192)) {
            _context16.next = 21;
            break;
          }

          return _context16.abrupt("return", res.status(400).json({
            error: 'Token is too long'
          }));

        case 21:
          encrypted = encryptCanvasToken(token);
          _context16.next = 24;
          return regeneratorRuntime.awrap(_db.pool.query("\n      INSERT INTO app_canvas_credentials (\n        clerk_user_id,\n        canvas_school,\n        canvas_token_ciphertext,\n        canvas_token_iv,\n        canvas_token_tag,\n        updated_at\n      )\n      VALUES ($1, $2, $3, $4, $5, NOW())\n      ON CONFLICT (clerk_user_id)\n      DO UPDATE SET\n        canvas_school = EXCLUDED.canvas_school,\n        canvas_token_ciphertext = EXCLUDED.canvas_token_ciphertext,\n        canvas_token_iv = EXCLUDED.canvas_token_iv,\n        canvas_token_tag = EXCLUDED.canvas_token_tag,\n        updated_at = NOW()\n      ", [userId, school, encrypted.cipherText, encrypted.iv, encrypted.authTag]));

        case 24:
          return _context16.abrupt("return", res.json({
            ok: true
          }));

        case 27:
          _context16.prev = 27;
          _context16.t0 = _context16["catch"](0);
          console.error('[BE] /canvas/credentials PUT error:', _context16.t0);
          return _context16.abrupt("return", res.status(500).json({
            error: 'Internal server error'
          }));

        case 31:
        case "end":
          return _context16.stop();
      }
    }
  }, null, null, [[0, 27]]);
});
/**
 * DELETE /canvas/credentials
 * Remove saved Canvas school+token for the current user.
 */

app["delete"]('/canvas/credentials', function _callee6(req, res) {
  var _getAuth4, userId;

  return regeneratorRuntime.async(function _callee6$(_context17) {
    while (1) {
      switch (_context17.prev = _context17.next) {
        case 0:
          _context17.prev = 0;
          _getAuth4 = (0, _express2.getAuth)(req), userId = _getAuth4.userId;

          if (userId) {
            _context17.next = 4;
            break;
          }

          return _context17.abrupt("return", res.status(401).json({
            error: 'Unauthenticated'
          }));

        case 4:
          _context17.next = 6;
          return regeneratorRuntime.awrap(_db.pool.query("DELETE FROM app_canvas_credentials WHERE clerk_user_id = $1", [userId]));

        case 6:
          return _context17.abrupt("return", res.json({
            ok: true
          }));

        case 9:
          _context17.prev = 9;
          _context17.t0 = _context17["catch"](0);
          console.error('[BE] /canvas/credentials DELETE error:', _context17.t0);
          return _context17.abrupt("return", res.status(500).json({
            error: 'Internal server error'
          }));

        case 13:
        case "end":
          return _context17.stop();
      }
    }
  }, null, null, [[0, 9]]);
});
/**
 * GET /home/plan
 * Return the current user's next N days and previous M days of custom tasks + Canvas items.
 */

app.get('/home/plan', function _callee7(req, res) {
  var _getAuth5, userId, safeQuery, rawDays, rawRecentDays, days, recentDays, nowTs, futureEndTs, pastStartTs, upcomingTaskResult, recentTaskResult, customUpcomingItems, customRecentItems, canvasUpcomingItems, canvasRecentItems, canvasConnected, canvasError, stored, baseUrl, futureStartIso, futureEndIso, recentStartIso, recentEndIso, _ref4, _ref5, rawCourses, rawUpcomingCanvasItems, rawRecentCompletedCanvasItems, rawRecentIncompleteCanvasItems, safeCourses, courseNameById, safeUpcomingCanvasItems, safeRecentCompletedCanvasItems, safeRecentIncompleteCanvasItems, recentCompletedCanvasItems, recentIncompleteCanvasItems, recentCanvasItemMap, normalizedCanvasError, upcomingItems, recentItems, recentSummary;

  return regeneratorRuntime.async(function _callee7$(_context18) {
    while (1) {
      switch (_context18.prev = _context18.next) {
        case 0:
          _context18.prev = 0;
          _getAuth5 = (0, _express2.getAuth)(req), userId = _getAuth5.userId;

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
          safeQuery = req.query || {};
          rawDays = Number(safeQuery.days);
          rawRecentDays = Number(safeQuery.recentDays);
          days = 7;

          if (Number.isInteger(rawDays)) {
            days = Math.min(Math.max(rawDays, 1), 30);
          }

          recentDays = days;

          if (Number.isInteger(rawRecentDays)) {
            recentDays = Math.min(Math.max(rawRecentDays, 1), 365);
          }

          nowTs = Date.now();
          futureEndTs = nowTs + days * 24 * 60 * 60 * 1000;
          pastStartTs = nowTs - recentDays * 24 * 60 * 60 * 1000;
          _context18.next = 18;
          return regeneratorRuntime.awrap(_db.pool.query("\n      SELECT\n        id,\n        title,\n        task_date,\n        timing_mode,\n        due_time,\n        start_time,\n        end_time,\n        is_completed,\n        created_at,\n        updated_at\n      FROM app_custom_tasks\n      WHERE clerk_user_id = $1\n        AND is_completed = FALSE\n        AND task_date >= (NOW() AT TIME ZONE 'Europe/London')::date\n        AND task_date < ((NOW() AT TIME ZONE 'Europe/London')::date + $2::int)\n      ORDER BY task_date ASC, COALESCE(start_time, due_time) ASC NULLS LAST, created_at ASC\n      ", [userId, days]));

        case 18:
          upcomingTaskResult = _context18.sent;
          _context18.next = 21;
          return regeneratorRuntime.awrap(_db.pool.query("\n      SELECT\n        id,\n        title,\n        task_date,\n        timing_mode,\n        due_time,\n        start_time,\n        end_time,\n        is_completed,\n        created_at,\n        updated_at\n      FROM app_custom_tasks\n      WHERE clerk_user_id = $1\n        AND task_date >= ((NOW() AT TIME ZONE 'Europe/London')::date - $2::int)\n        AND task_date < (NOW() AT TIME ZONE 'Europe/London')::date\n      ORDER BY task_date DESC, COALESCE(start_time, due_time) DESC NULLS LAST, created_at DESC\n      ", [userId, recentDays]));

        case 21:
          recentTaskResult = _context18.sent;
          customUpcomingItems = upcomingTaskResult.rows.map(mapCustomTaskRow).map(mapCustomTaskToPlanItem);
          customRecentItems = recentTaskResult.rows.map(mapCustomTaskRow).map(mapCustomTaskToPlanItem);
          canvasUpcomingItems = [];
          canvasRecentItems = [];
          canvasConnected = false;
          canvasError = '';
          _context18.prev = 28;
          _context18.next = 31;
          return regeneratorRuntime.awrap(getStoredCanvasCredentials(userId));

        case 31:
          stored = _context18.sent;
          canvasConnected = Boolean(stored.school && stored.token);

          if (!canvasConnected) {
            _context18.next = 65;
            break;
          }

          baseUrl = buildCanvasBaseUrl(stored.school);
          futureStartIso = new Date(nowTs).toISOString();
          futureEndIso = new Date(futureEndTs).toISOString();
          recentStartIso = new Date(pastStartTs).toISOString();
          recentEndIso = new Date(nowTs).toISOString();
          _context18.next = 41;
          return regeneratorRuntime.awrap(Promise.all([fetchCanvasPaged(baseUrl, stored.token, '/api/v1/courses?enrollment_type=student&enrollment_state=active&per_page=100'), fetchCanvasPaged(baseUrl, stored.token, '/api/v1/planner/items?start_date=' + encodeURIComponent(futureStartIso) + '&end_date=' + encodeURIComponent(futureEndIso) + '&filter=incomplete_items&per_page=50'), fetchCanvasPaged(baseUrl, stored.token, '/api/v1/planner/items?start_date=' + encodeURIComponent(recentStartIso) + '&end_date=' + encodeURIComponent(recentEndIso) + '&filter=complete_items&per_page=50'), fetchCanvasPaged(baseUrl, stored.token, '/api/v1/planner/items?start_date=' + encodeURIComponent(recentStartIso) + '&end_date=' + encodeURIComponent(recentEndIso) + '&filter=incomplete_items&per_page=50')]));

        case 41:
          _ref4 = _context18.sent;
          _ref5 = _slicedToArray(_ref4, 4);
          rawCourses = _ref5[0];
          rawUpcomingCanvasItems = _ref5[1];
          rawRecentCompletedCanvasItems = _ref5[2];
          rawRecentIncompleteCanvasItems = _ref5[3];
          safeCourses = [];

          if (Array.isArray(rawCourses)) {
            safeCourses = rawCourses;
          }

          courseNameById = safeCourses.reduce(function (acc, course) {
            var safeCourse = {};

            if (course) {
              safeCourse = course;
            }

            var rawCourseId = '';

            if (safeCourse.id) {
              rawCourseId = safeCourse.id;
            }

            var courseId = String(rawCourseId);

            if (courseId) {
              var courseName = 'Course ' + courseId;

              if (safeCourse.name) {
                courseName = safeCourse.name;
              } else if (safeCourse.course_code) {
                courseName = safeCourse.course_code;
              }

              acc[courseId] = courseName;
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
            if (!item) {
              return false;
            }

            if (item.sortTs < nowTs) {
              return false;
            }

            if (item.sortTs > futureEndTs) {
              return false;
            }

            return true;
          });
          recentCompletedCanvasItems = safeRecentCompletedCanvasItems.map(function (item, index) {
            return mapCanvasEventToPlanItem(item, index, {
              baseUrl: baseUrl,
              courseNameById: courseNameById,
              isCompleted: true
            });
          }).filter(function (item) {
            if (!item) {
              return false;
            }

            if (item.sortTs < pastStartTs) {
              return false;
            }

            if (item.sortTs > nowTs) {
              return false;
            }

            return true;
          });
          recentIncompleteCanvasItems = safeRecentIncompleteCanvasItems.map(function (item, index) {
            return mapCanvasEventToPlanItem(item, index, {
              baseUrl: baseUrl,
              courseNameById: courseNameById,
              isCompleted: false
            });
          }).filter(function (item) {
            if (!item) {
              return false;
            }

            if (item.sortTs < pastStartTs) {
              return false;
            }

            if (item.sortTs > nowTs) {
              return false;
            }

            return true;
          });
          recentCanvasItemMap = {};
          recentCompletedCanvasItems.forEach(function (item) {
            if (item) {
              if (item.id) {
                recentCanvasItemMap[item.id] = item;
              }
            }
          });
          recentIncompleteCanvasItems.forEach(function (item) {
            if (item) {
              if (item.id) {
                if (!recentCanvasItemMap[item.id]) {
                  recentCanvasItemMap[item.id] = item;
                }
              }
            }
          });
          _context18.next = 64;
          return regeneratorRuntime.awrap(enrichPlanItemsWithSubmissionDetails(baseUrl, stored.token, Object.values(recentCanvasItemMap)));

        case 64:
          canvasRecentItems = _context18.sent;

        case 65:
          _context18.next = 73;
          break;

        case 67:
          _context18.prev = 67;
          _context18.t0 = _context18["catch"](28);

          if (_context18.t0 instanceof Error) {
            canvasError = _context18.t0.message;
          } else {
            canvasError = 'Failed to load Canvas items';
          }

          normalizedCanvasError = String(canvasError || '').toLowerCase();

          if (normalizedCanvasError.includes('401') && normalizedCanvasError.includes('invalid access token')) {
            canvasConnected = false;
          }

          console.error('[BE] /home/plan canvas error:', _context18.t0);

        case 73:
          upcomingItems = sortPlanItemsAscending(customUpcomingItems.concat(canvasUpcomingItems));
          recentItems = sortPlanItemsDescending(customRecentItems.concat(canvasRecentItems));
          recentSummary = buildReviewSummary(recentItems);
          return _context18.abrupt("return", res.json({
            ok: true,
            days: days,
            recentDays: recentDays,
            canvasConnected: canvasConnected,
            canvasError: canvasError,
            items: stripPlanSortTs(upcomingItems),
            recentItems: stripPlanSortTs(recentItems),
            recentSummary: recentSummary
          }));

        case 79:
          _context18.prev = 79;
          _context18.t1 = _context18["catch"](0);
          console.error('[BE] /home/plan error:', _context18.t1);
          return _context18.abrupt("return", res.status(500).json({
            error: 'Internal server error'
          }));

        case 83:
        case "end":
          return _context18.stop();
      }
    }
  }, null, null, [[0, 79], [28, 67]]);
});
/**
 * GET /tasks
 * Return the current user's custom tasks.
 */

app.get('/tasks', function _callee8(req, res) {
  var _getAuth6, userId, result;

  return regeneratorRuntime.async(function _callee8$(_context19) {
    while (1) {
      switch (_context19.prev = _context19.next) {
        case 0:
          _context19.prev = 0;
          _getAuth6 = (0, _express2.getAuth)(req), userId = _getAuth6.userId;

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
          return regeneratorRuntime.awrap(_db.pool.query("\n      SELECT\n        id,\n        title,\n        task_date,\n        timing_mode,\n        due_time,\n        start_time,\n        end_time,\n        is_completed,\n        created_at,\n        updated_at\n      FROM app_custom_tasks\n      WHERE clerk_user_id = $1\n      ORDER BY task_date ASC, COALESCE(start_time, due_time) ASC NULLS LAST, created_at ASC\n      ", [userId]));

        case 8:
          result = _context19.sent;
          return _context19.abrupt("return", res.json({
            ok: true,
            items: result.rows.map(mapCustomTaskRow)
          }));

        case 12:
          _context19.prev = 12;
          _context19.t0 = _context19["catch"](0);
          console.error('[BE] /tasks GET error:', _context19.t0);
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
 * POST /tasks
 * Create one custom task for the current user.
 */

app.post('/tasks', function _callee9(req, res) {
  var _getAuth7, userId, normalized, result;

  return regeneratorRuntime.async(function _callee9$(_context20) {
    while (1) {
      switch (_context20.prev = _context20.next) {
        case 0:
          _context20.prev = 0;
          _getAuth7 = (0, _express2.getAuth)(req), userId = _getAuth7.userId;

          if (userId) {
            _context20.next = 4;
            break;
          }

          return _context20.abrupt("return", res.status(401).json({
            error: 'Unauthenticated'
          }));

        case 4:
          _context20.next = 6;
          return regeneratorRuntime.awrap(ensureUserRow(userId));

        case 6:
          normalized = normalizeTaskPayload(req.body);

          if (!normalized.error) {
            _context20.next = 9;
            break;
          }

          return _context20.abrupt("return", res.status(400).json({
            error: normalized.error
          }));

        case 9:
          _context20.next = 11;
          return regeneratorRuntime.awrap(_db.pool.query("\n      INSERT INTO app_custom_tasks (\n        clerk_user_id,\n        title,\n        task_date,\n        timing_mode,\n        due_time,\n        start_time,\n        end_time,\n        is_completed,\n        created_at,\n        updated_at\n      )\n      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())\n      RETURNING\n        id,\n        title,\n        task_date,\n        timing_mode,\n        due_time,\n        start_time,\n        end_time,\n        is_completed,\n        created_at,\n        updated_at\n      ", [userId, normalized.title, normalized.taskDate, normalized.timingMode, normalized.dueTime || null, normalized.startTime || null, normalized.endTime || null, normalized.isCompleted]));

        case 11:
          result = _context20.sent;
          return _context20.abrupt("return", res.status(201).json({
            ok: true,
            item: mapCustomTaskRow(result.rows[0])
          }));

        case 15:
          _context20.prev = 15;
          _context20.t0 = _context20["catch"](0);
          console.error('[BE] /tasks POST error:', _context20.t0);
          return _context20.abrupt("return", res.status(500).json({
            error: 'Internal server error'
          }));

        case 19:
        case "end":
          return _context20.stop();
      }
    }
  }, null, null, [[0, 15]]);
});
/**
 * PUT /tasks/:id
 * Update one custom task.
 */

app.put('/tasks/:id', function _callee10(req, res) {
  var _getAuth8, userId, safeParams, taskId, normalized, result;

  return regeneratorRuntime.async(function _callee10$(_context21) {
    while (1) {
      switch (_context21.prev = _context21.next) {
        case 0:
          _context21.prev = 0;
          _getAuth8 = (0, _express2.getAuth)(req), userId = _getAuth8.userId;

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
          safeParams = req.params || {};
          taskId = Number(safeParams.id);

          if (!(!Number.isInteger(taskId) || taskId <= 0)) {
            _context21.next = 10;
            break;
          }

          return _context21.abrupt("return", res.status(400).json({
            error: 'Invalid task id'
          }));

        case 10:
          normalized = normalizeTaskPayload(req.body);

          if (!normalized.error) {
            _context21.next = 13;
            break;
          }

          return _context21.abrupt("return", res.status(400).json({
            error: normalized.error
          }));

        case 13:
          _context21.next = 15;
          return regeneratorRuntime.awrap(_db.pool.query("\n      UPDATE app_custom_tasks\n      SET\n        title = $3,\n        task_date = $4,\n        timing_mode = $5,\n        due_time = $6,\n        start_time = $7,\n        end_time = $8,\n        is_completed = $9,\n        updated_at = NOW()\n      WHERE id = $1 AND clerk_user_id = $2\n      RETURNING\n        id,\n        title,\n        task_date,\n        timing_mode,\n        due_time,\n        start_time,\n        end_time,\n        is_completed,\n        created_at,\n        updated_at\n      ", [taskId, userId, normalized.title, normalized.taskDate, normalized.timingMode, normalized.dueTime || null, normalized.startTime || null, normalized.endTime || null, normalized.isCompleted]));

        case 15:
          result = _context21.sent;

          if (!(result.rowCount === 0)) {
            _context21.next = 18;
            break;
          }

          return _context21.abrupt("return", res.status(404).json({
            error: 'Task not found'
          }));

        case 18:
          return _context21.abrupt("return", res.json({
            ok: true,
            item: mapCustomTaskRow(result.rows[0])
          }));

        case 21:
          _context21.prev = 21;
          _context21.t0 = _context21["catch"](0);
          console.error('[BE] /tasks PUT error:', _context21.t0);
          return _context21.abrupt("return", res.status(500).json({
            error: 'Internal server error'
          }));

        case 25:
        case "end":
          return _context21.stop();
      }
    }
  }, null, null, [[0, 21]]);
});
/**
 * DELETE /tasks/:id
 * Remove one custom task.
 */

app["delete"]('/tasks/:id', function _callee11(req, res) {
  var _getAuth9, userId, safeParams, taskId, result;

  return regeneratorRuntime.async(function _callee11$(_context22) {
    while (1) {
      switch (_context22.prev = _context22.next) {
        case 0:
          _context22.prev = 0;
          _getAuth9 = (0, _express2.getAuth)(req), userId = _getAuth9.userId;

          if (userId) {
            _context22.next = 4;
            break;
          }

          return _context22.abrupt("return", res.status(401).json({
            error: 'Unauthenticated'
          }));

        case 4:
          safeParams = req.params || {};
          taskId = Number(safeParams.id);

          if (!(!Number.isInteger(taskId) || taskId <= 0)) {
            _context22.next = 8;
            break;
          }

          return _context22.abrupt("return", res.status(400).json({
            error: 'Invalid task id'
          }));

        case 8:
          _context22.next = 10;
          return regeneratorRuntime.awrap(_db.pool.query("\n      DELETE FROM app_custom_tasks\n      WHERE id = $1 AND clerk_user_id = $2\n      RETURNING id\n      ", [taskId, userId]));

        case 10:
          result = _context22.sent;

          if (!(result.rowCount === 0)) {
            _context22.next = 13;
            break;
          }

          return _context22.abrupt("return", res.status(404).json({
            error: 'Task not found'
          }));

        case 13:
          return _context22.abrupt("return", res.json({
            ok: true
          }));

        case 16:
          _context22.prev = 16;
          _context22.t0 = _context22["catch"](0);
          console.error('[BE] /tasks DELETE error:', _context22.t0);
          return _context22.abrupt("return", res.status(500).json({
            error: 'Internal server error'
          }));

        case 20:
        case "end":
          return _context22.stop();
      }
    }
  }, null, null, [[0, 16]]);
});
/**
 * GET /checkins/status
 * 返回：points、totalDays、checkedInToday
 */

app.get('/checkins/status', function _callee12(req, res) {
  var _getAuth10, userId, today, todayCheckin, total, points, currentPoints, checkedInToday, todayNote;

  return regeneratorRuntime.async(function _callee12$(_context23) {
    while (1) {
      switch (_context23.prev = _context23.next) {
        case 0:
          _context23.prev = 0;
          _getAuth10 = (0, _express2.getAuth)(req), userId = _getAuth10.userId;

          if (userId) {
            _context23.next = 4;
            break;
          }

          return _context23.abrupt("return", res.status(401).json({
            error: 'Unauthenticated'
          }));

        case 4:
          _context23.next = 6;
          return regeneratorRuntime.awrap(ensureUserRow(userId));

        case 6:
          _context23.next = 8;
          return regeneratorRuntime.awrap(getLondonToday());

        case 8:
          today = _context23.sent;
          _context23.next = 11;
          return regeneratorRuntime.awrap(_db.pool.query("\n      SELECT next_day_note\n      FROM app_checkins\n      WHERE clerk_user_id=$1 AND checkin_date=$2\n      LIMIT 1\n      ", [userId, today]));

        case 11:
          todayCheckin = _context23.sent;
          _context23.next = 14;
          return regeneratorRuntime.awrap(_db.pool.query("SELECT COUNT(*)::int AS total_days FROM app_checkins WHERE clerk_user_id=$1", [userId]));

        case 14:
          total = _context23.sent;
          _context23.next = 17;
          return regeneratorRuntime.awrap(_db.pool.query("SELECT points FROM app_users WHERE clerk_user_id=$1", [userId]));

        case 17:
          points = _context23.sent;
          currentPoints = 0;

          if (points.rows && points.rows.length > 0 && points.rows[0] && points.rows[0].points != null) {
            currentPoints = points.rows[0].points;
          }

          checkedInToday = false;
          todayNote = '';

          if (todayCheckin.rows && todayCheckin.rows.length > 0) {
            checkedInToday = true;

            if (todayCheckin.rows[0] && todayCheckin.rows[0].next_day_note !== null && todayCheckin.rows[0].next_day_note !== undefined) {
              todayNote = String(todayCheckin.rows[0].next_day_note);
            }
          }

          _context23.t0 = res;
          _context23.t1 = today;
          _context23.t2 = checkedInToday;
          _context23.t3 = total.rows[0].total_days;
          _context23.next = 29;
          return regeneratorRuntime.awrap(getStreakDays(_db.pool, userId, today));

        case 29:
          _context23.t4 = _context23.sent;
          _context23.t5 = currentPoints;
          _context23.t6 = todayNote;
          _context23.t7 = {
            ok: true,
            today: _context23.t1,
            checkedInToday: _context23.t2,
            totalDays: _context23.t3,
            streakDays: _context23.t4,
            points: _context23.t5,
            todayNote: _context23.t6
          };
          return _context23.abrupt("return", _context23.t0.json.call(_context23.t0, _context23.t7));

        case 36:
          _context23.prev = 36;
          _context23.t8 = _context23["catch"](0);
          console.error('[BE] /checkins/status error:', _context23.t8);
          return _context23.abrupt("return", res.status(500).json({
            error: 'Internal server error'
          }));

        case 40:
        case "end":
          return _context23.stop();
      }
    }
  }, null, null, [[0, 36]]);
});
/**
 * GET /checkins/dates
 * Return all check-in dates for the current user.
 */

app.get('/checkins/dates', function _callee13(req, res) {
  var _getAuth11, userId, result;

  return regeneratorRuntime.async(function _callee13$(_context24) {
    while (1) {
      switch (_context24.prev = _context24.next) {
        case 0:
          _context24.prev = 0;
          _getAuth11 = (0, _express2.getAuth)(req), userId = _getAuth11.userId;

          if (userId) {
            _context24.next = 4;
            break;
          }

          return _context24.abrupt("return", res.status(401).json({
            error: 'Unauthenticated'
          }));

        case 4:
          _context24.next = 6;
          return regeneratorRuntime.awrap(ensureUserRow(userId));

        case 6:
          _context24.next = 8;
          return regeneratorRuntime.awrap(_db.pool.query("\n      SELECT checkin_date::text AS checkin_date\n      FROM app_checkins\n      WHERE clerk_user_id = $1\n      ORDER BY checkin_date ASC\n      ", [userId]));

        case 8:
          result = _context24.sent;
          return _context24.abrupt("return", res.json({
            ok: true,
            items: result.rows.map(function (row) {
              var checkinDate = '';

              if (row.checkin_date) {
                checkinDate = row.checkin_date;
              }

              return String(checkinDate);
            })
          }));

        case 12:
          _context24.prev = 12;
          _context24.t0 = _context24["catch"](0);
          console.error('[BE] /checkins/dates error:', _context24.t0);
          return _context24.abrupt("return", res.status(500).json({
            error: 'Internal server error'
          }));

        case 16:
        case "end":
          return _context24.stop();
      }
    }
  }, null, null, [[0, 12]]);
});
/**
 * PUT /checkins/today-note
 * Save or update the current user's note for tomorrow on today's check-in record.
 */

app.put('/checkins/today-note', function _callee14(req, res) {
  var _getAuth12, userId, today, safeBody, nextDayNote, result, savedNote;

  return regeneratorRuntime.async(function _callee14$(_context25) {
    while (1) {
      switch (_context25.prev = _context25.next) {
        case 0:
          _context25.prev = 0;
          _getAuth12 = (0, _express2.getAuth)(req), userId = _getAuth12.userId;

          if (userId) {
            _context25.next = 4;
            break;
          }

          return _context25.abrupt("return", res.status(401).json({
            error: 'Unauthenticated'
          }));

        case 4:
          _context25.next = 6;
          return regeneratorRuntime.awrap(ensureUserRow(userId));

        case 6:
          _context25.next = 8;
          return regeneratorRuntime.awrap(getLondonToday());

        case 8:
          today = _context25.sent;
          safeBody = req.body || {};
          nextDayNote = normalizeNextDayNote(safeBody.note);
          _context25.next = 13;
          return regeneratorRuntime.awrap(_db.pool.query("\n      UPDATE app_checkins\n      SET\n        next_day_note = $3,\n        next_day_note_updated_at = NOW()\n      WHERE clerk_user_id = $1 AND checkin_date = $2\n      RETURNING next_day_note\n      ", [userId, today, nextDayNote || null]));

        case 13:
          result = _context25.sent;

          if (!(result.rowCount === 0)) {
            _context25.next = 16;
            break;
          }

          return _context25.abrupt("return", res.status(400).json({
            error: 'Check in today before saving a note.'
          }));

        case 16:
          savedNote = '';

          if (result.rows && result.rows.length > 0 && result.rows[0] && result.rows[0].next_day_note !== null && result.rows[0].next_day_note !== undefined) {
            savedNote = String(result.rows[0].next_day_note);
          }

          return _context25.abrupt("return", res.json({
            ok: true,
            today: today,
            todayNote: savedNote
          }));

        case 21:
          _context25.prev = 21;
          _context25.t0 = _context25["catch"](0);
          console.error('[BE] /checkins/today-note error:', _context25.t0);
          return _context25.abrupt("return", res.status(500).json({
            error: 'Internal server error'
          }));

        case 25:
        case "end":
          return _context25.stop();
      }
    }
  }, null, null, [[0, 21]]);
});
/**
 * GET /makeup-card/status
 * Return the current user's make-up card inventory and whether yesterday can be repaired.
 */

app.get('/makeup-card/status', function _callee15(req, res) {
  var _getAuth13, userId, today, status;

  return regeneratorRuntime.async(function _callee15$(_context26) {
    while (1) {
      switch (_context26.prev = _context26.next) {
        case 0:
          _context26.prev = 0;
          _getAuth13 = (0, _express2.getAuth)(req), userId = _getAuth13.userId;

          if (userId) {
            _context26.next = 4;
            break;
          }

          return _context26.abrupt("return", res.status(401).json({
            error: 'Unauthenticated'
          }));

        case 4:
          _context26.next = 6;
          return regeneratorRuntime.awrap(ensureMakeupCardUserColumn(_db.pool));

        case 6:
          _context26.next = 8;
          return regeneratorRuntime.awrap(ensureUserRow(userId));

        case 8:
          _context26.next = 10;
          return regeneratorRuntime.awrap(getLondonToday());

        case 10:
          today = _context26.sent;
          _context26.next = 13;
          return regeneratorRuntime.awrap(getMakeupCardStatus(_db.pool, userId, today));

        case 13:
          status = _context26.sent;
          return _context26.abrupt("return", res.json({
            ok: true,
            makeupCards: status.makeupCards,
            yesterdayMissed: !status.yesterdayCheckedIn,
            canUse: status.canUse
          }));

        case 17:
          _context26.prev = 17;
          _context26.t0 = _context26["catch"](0);
          console.error('[BE] /makeup-card/status error:', _context26.t0);
          return _context26.abrupt("return", res.status(500).json({
            error: 'Internal server error'
          }));

        case 21:
        case "end":
          return _context26.stop();
      }
    }
  }, null, null, [[0, 17]]);
});
/**
 * POST /makeup-card/use
 * Spend one make-up card to create yesterday's check-in without normal daily points.
 */

app.post('/makeup-card/use', function _callee16(req, res) {
  var client, _getAuth14, userId, today, status, inserted, updatedUser, totalResult, makeupCards, totalDays;

  return regeneratorRuntime.async(function _callee16$(_context27) {
    while (1) {
      switch (_context27.prev = _context27.next) {
        case 0:
          _context27.next = 2;
          return regeneratorRuntime.awrap(_db.pool.connect());

        case 2:
          client = _context27.sent;
          _context27.prev = 3;
          _getAuth14 = (0, _express2.getAuth)(req), userId = _getAuth14.userId;

          if (userId) {
            _context27.next = 7;
            break;
          }

          return _context27.abrupt("return", res.status(401).json({
            error: 'Unauthenticated'
          }));

        case 7:
          _context27.next = 9;
          return regeneratorRuntime.awrap(ensureMakeupCardUserColumn(client));

        case 9:
          _context27.next = 11;
          return regeneratorRuntime.awrap(ensureUserRow(userId));

        case 11:
          _context27.next = 13;
          return regeneratorRuntime.awrap(getLondonToday());

        case 13:
          today = _context27.sent;
          _context27.next = 16;
          return regeneratorRuntime.awrap(client.query('BEGIN'));

        case 16:
          _context27.next = 18;
          return regeneratorRuntime.awrap(getMakeupCardStatus(client, userId, today));

        case 18:
          status = _context27.sent;

          if (!(status.makeupCards <= 0)) {
            _context27.next = 23;
            break;
          }

          _context27.next = 22;
          return regeneratorRuntime.awrap(client.query('ROLLBACK'));

        case 22:
          return _context27.abrupt("return", res.status(409).json({
            error: 'No make-up cards available.'
          }));

        case 23:
          if (!status.yesterdayCheckedIn) {
            _context27.next = 27;
            break;
          }

          _context27.next = 26;
          return regeneratorRuntime.awrap(client.query('ROLLBACK'));

        case 26:
          return _context27.abrupt("return", res.status(409).json({
            error: 'Yesterday is already checked in.'
          }));

        case 27:
          _context27.next = 29;
          return regeneratorRuntime.awrap(client.query("\n      INSERT INTO app_checkins (clerk_user_id, checkin_date)\n      VALUES ($1, $2)\n      ON CONFLICT (clerk_user_id, checkin_date) DO NOTHING\n      RETURNING id\n      ", [userId, status.yesterday]));

        case 29:
          inserted = _context27.sent;

          if (!(inserted.rowCount === 0)) {
            _context27.next = 34;
            break;
          }

          _context27.next = 33;
          return regeneratorRuntime.awrap(client.query('ROLLBACK'));

        case 33:
          return _context27.abrupt("return", res.status(409).json({
            error: 'Yesterday is already checked in.'
          }));

        case 34:
          _context27.next = 36;
          return regeneratorRuntime.awrap(client.query("\n      UPDATE app_users\n      SET makeup_cards = makeup_cards - 1, last_seen_at = NOW()\n      WHERE clerk_user_id = $1 AND makeup_cards > 0\n      RETURNING points, makeup_cards\n      ", [userId]));

        case 36:
          updatedUser = _context27.sent;

          if (!(updatedUser.rowCount === 0)) {
            _context27.next = 41;
            break;
          }

          _context27.next = 40;
          return regeneratorRuntime.awrap(client.query('ROLLBACK'));

        case 40:
          return _context27.abrupt("return", res.status(409).json({
            error: 'No make-up cards available.'
          }));

        case 41:
          _context27.next = 43;
          return regeneratorRuntime.awrap(client.query("\n      SELECT COUNT(*)::int AS total_days\n      FROM app_checkins\n      WHERE clerk_user_id = $1\n      ", [userId]));

        case 43:
          totalResult = _context27.sent;
          _context27.next = 46;
          return regeneratorRuntime.awrap(client.query('COMMIT'));

        case 46:
          makeupCards = 0;

          if (updatedUser.rows && updatedUser.rows.length > 0) {
            if (updatedUser.rows[0]) {
              if (updatedUser.rows[0].makeup_cards != null) {
                makeupCards = Number(updatedUser.rows[0].makeup_cards) || 0;
              }
            }
          }

          totalDays = 0;

          if (totalResult.rows && totalResult.rows.length > 0) {
            if (totalResult.rows[0] && totalResult.rows[0].total_days != null) {
              totalDays = Number(totalResult.rows[0].total_days) || 0;
            }
          }

          return _context27.abrupt("return", res.json({
            ok: true,
            makeupCards: makeupCards,
            totalDays: totalDays
          }));

        case 53:
          _context27.prev = 53;
          _context27.t0 = _context27["catch"](3);
          _context27.prev = 55;
          _context27.next = 58;
          return regeneratorRuntime.awrap(client.query('ROLLBACK'));

        case 58:
          _context27.next = 62;
          break;

        case 60:
          _context27.prev = 60;
          _context27.t1 = _context27["catch"](55);

        case 62:
          console.error('[BE] /makeup-card/use error:', _context27.t0);
          return _context27.abrupt("return", res.status(500).json({
            error: 'Internal server error'
          }));

        case 64:
          _context27.prev = 64;
          client.release();
          return _context27.finish(64);

        case 67:
        case "end":
          return _context27.stop();
      }
    }
  }, null, null, [[3, 53, 64, 67], [55, 60]]);
});
/**
 * GET /rewards/catalog
 * Return all active rewards.
 */

app.get('/rewards/catalog', function _callee17(req, res) {
  var _getAuth15, userId, rewards;

  return regeneratorRuntime.async(function _callee17$(_context28) {
    while (1) {
      switch (_context28.prev = _context28.next) {
        case 0:
          _context28.prev = 0;
          _getAuth15 = (0, _express2.getAuth)(req), userId = _getAuth15.userId;

          if (userId) {
            _context28.next = 4;
            break;
          }

          return _context28.abrupt("return", res.status(401).json({
            error: 'Unauthenticated'
          }));

        case 4:
          _context28.next = 6;
          return regeneratorRuntime.awrap(ensureUserRow(userId));

        case 6:
          _context28.next = 8;
          return regeneratorRuntime.awrap(_db.pool.query("\n      SELECT id, title, points_cost, category, image_url, is_active\n      FROM app_rewards\n      WHERE is_active = TRUE\n      ORDER BY points_cost ASC, id ASC\n      "));

        case 8:
          rewards = _context28.sent;
          return _context28.abrupt("return", res.json({
            ok: true,
            items: rewards.rows.map(mapRewardRow)
          }));

        case 12:
          _context28.prev = 12;
          _context28.t0 = _context28["catch"](0);
          console.error('[BE] /rewards/catalog error:', _context28.t0);
          return _context28.abrupt("return", res.status(500).json({
            error: 'Internal server error'
          }));

        case 16:
        case "end":
          return _context28.stop();
      }
    }
  }, null, null, [[0, 12]]);
});
/**
 * POST /rewards/redeem
 * Redeem one reward and deduct points in a DB transaction.
 */

app.post('/rewards/redeem', function _callee18(req, res) {
  var client, _getAuth16, userId, safeBody, rewardId, rewardResult, reward, makeupCardReward, pointsResult, currentPoints, updatedUser, orderResult, order, remainingPoints, makeupCards;

  return regeneratorRuntime.async(function _callee18$(_context29) {
    while (1) {
      switch (_context29.prev = _context29.next) {
        case 0:
          _context29.next = 2;
          return regeneratorRuntime.awrap(_db.pool.connect());

        case 2:
          client = _context29.sent;
          _context29.prev = 3;
          _getAuth16 = (0, _express2.getAuth)(req), userId = _getAuth16.userId;

          if (userId) {
            _context29.next = 7;
            break;
          }

          return _context29.abrupt("return", res.status(401).json({
            error: 'Unauthenticated'
          }));

        case 7:
          _context29.next = 9;
          return regeneratorRuntime.awrap(ensureMakeupCardUserColumn(client));

        case 9:
          _context29.next = 11;
          return regeneratorRuntime.awrap(ensureUserRow(userId));

        case 11:
          safeBody = req.body || {};
          rewardId = Number(safeBody.rewardId);

          if (!(!Number.isInteger(rewardId) || rewardId <= 0)) {
            _context29.next = 15;
            break;
          }

          return _context29.abrupt("return", res.status(400).json({
            error: 'Invalid rewardId'
          }));

        case 15:
          _context29.next = 17;
          return regeneratorRuntime.awrap(client.query('BEGIN'));

        case 17:
          _context29.next = 19;
          return regeneratorRuntime.awrap(client.query("\n      SELECT id, title, points_cost, category, image_url, is_active\n      FROM app_rewards\n      WHERE id = $1\n      FOR UPDATE\n      ", [rewardId]));

        case 19:
          rewardResult = _context29.sent;

          if (!(rewardResult.rowCount === 0)) {
            _context29.next = 24;
            break;
          }

          _context29.next = 23;
          return regeneratorRuntime.awrap(client.query('ROLLBACK'));

        case 23:
          return _context29.abrupt("return", res.status(404).json({
            error: 'Reward not found'
          }));

        case 24:
          reward = mapRewardRow(rewardResult.rows[0]);

          if (reward.isActive) {
            _context29.next = 29;
            break;
          }

          _context29.next = 28;
          return regeneratorRuntime.awrap(client.query('ROLLBACK'));

        case 28:
          return _context29.abrupt("return", res.status(400).json({
            error: 'Reward is not active'
          }));

        case 29:
          makeupCardReward = isMakeupCardReward(reward);
          _context29.next = 32;
          return regeneratorRuntime.awrap(client.query("\n      SELECT points\n      FROM app_users\n      WHERE clerk_user_id = $1\n      FOR UPDATE\n      ", [userId]));

        case 32:
          pointsResult = _context29.sent;
          currentPoints = 0;

          if (pointsResult.rows && pointsResult.rows.length > 0 && pointsResult.rows[0]) {
            currentPoints = Number(pointsResult.rows[0].points) || 0;
          }

          if (!(currentPoints < reward.pointsCost)) {
            _context29.next = 39;
            break;
          }

          _context29.next = 38;
          return regeneratorRuntime.awrap(client.query('ROLLBACK'));

        case 38:
          return _context29.abrupt("return", res.status(409).json({
            error: 'INSUFFICIENT_POINTS',
            currentPoints: currentPoints,
            requiredPoints: reward.pointsCost
          }));

        case 39:
          updatedUser = null;

          if (!makeupCardReward) {
            _context29.next = 46;
            break;
          }

          _context29.next = 43;
          return regeneratorRuntime.awrap(client.query("\n        UPDATE app_users\n        SET points = points - $2, makeup_cards = makeup_cards + 1, last_seen_at = NOW()\n        WHERE clerk_user_id = $1\n        RETURNING points, makeup_cards\n        ", [userId, reward.pointsCost]));

        case 43:
          updatedUser = _context29.sent;
          _context29.next = 49;
          break;

        case 46:
          _context29.next = 48;
          return regeneratorRuntime.awrap(client.query("\n        UPDATE app_users\n        SET points = points - $2, last_seen_at = NOW()\n        WHERE clerk_user_id = $1\n        RETURNING points, makeup_cards\n        ", [userId, reward.pointsCost]));

        case 48:
          updatedUser = _context29.sent;

        case 49:
          _context29.next = 51;
          return regeneratorRuntime.awrap(client.query("\n      INSERT INTO app_reward_orders (clerk_user_id, reward_id, points_cost, status, created_at)\n      VALUES ($1, $2, $3, 'completed', NOW())\n      RETURNING id, status, created_at\n      ", [userId, reward.id, reward.pointsCost]));

        case 51:
          orderResult = _context29.sent;
          _context29.next = 54;
          return regeneratorRuntime.awrap(client.query('COMMIT'));

        case 54:
          order = orderResult.rows[0];
          remainingPoints = 0;
          makeupCards = 0;

          if (updatedUser.rows && updatedUser.rows.length > 0 && updatedUser.rows[0]) {
            remainingPoints = Number(updatedUser.rows[0].points) || 0;

            if (updatedUser.rows[0].makeup_cards != null) {
              makeupCards = Number(updatedUser.rows[0].makeup_cards) || 0;
            }
          }

          return _context29.abrupt("return", res.json({
            ok: true,
            remainingPoints: remainingPoints,
            makeupCards: makeupCards,
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

        case 61:
          _context29.prev = 61;
          _context29.t0 = _context29["catch"](3);
          _context29.prev = 63;
          _context29.next = 66;
          return regeneratorRuntime.awrap(client.query('ROLLBACK'));

        case 66:
          _context29.next = 70;
          break;

        case 68:
          _context29.prev = 68;
          _context29.t1 = _context29["catch"](63);

        case 70:
          console.error('[BE] /rewards/redeem error:', _context29.t0);
          return _context29.abrupt("return", res.status(500).json({
            error: 'Internal server error'
          }));

        case 72:
          _context29.prev = 72;
          client.release();
          return _context29.finish(72);

        case 75:
        case "end":
          return _context29.stop();
      }
    }
  }, null, null, [[3, 61, 72, 75], [63, 68]]);
});
/**
 * GET /rewards/orders
 * Return current user's redemption orders.
 */

app.get('/rewards/orders', function _callee19(req, res) {
  var _getAuth17, userId, orders;

  return regeneratorRuntime.async(function _callee19$(_context30) {
    while (1) {
      switch (_context30.prev = _context30.next) {
        case 0:
          _context30.prev = 0;
          _getAuth17 = (0, _express2.getAuth)(req), userId = _getAuth17.userId;

          if (userId) {
            _context30.next = 4;
            break;
          }

          return _context30.abrupt("return", res.status(401).json({
            error: 'Unauthenticated'
          }));

        case 4:
          _context30.next = 6;
          return regeneratorRuntime.awrap(ensureUserRow(userId));

        case 6:
          _context30.next = 8;
          return regeneratorRuntime.awrap(_db.pool.query("\n      SELECT\n        o.id,\n        o.reward_id,\n        o.points_cost,\n        o.status,\n        o.created_at,\n        r.title,\n        r.category,\n        r.image_url\n      FROM app_reward_orders o\n      JOIN app_rewards r ON r.id = o.reward_id\n      WHERE o.clerk_user_id = $1\n      ORDER BY o.created_at DESC\n      LIMIT 200\n      ", [userId]));

        case 8:
          orders = _context30.sent;
          return _context30.abrupt("return", res.json({
            ok: true,
            items: orders.rows.map(function (row) {
              var imageUrl = '';

              if (row.image_url) {
                imageUrl = row.image_url;
              }

              return {
                id: row.id,
                rewardId: row.reward_id,
                title: row.title,
                category: row.category,
                imageUrl: imageUrl,
                pointsCost: row.points_cost,
                status: row.status,
                createdAt: row.created_at
              };
            })
          }));

        case 12:
          _context30.prev = 12;
          _context30.t0 = _context30["catch"](0);
          console.error('[BE] /rewards/orders error:', _context30.t0);
          return _context30.abrupt("return", res.status(500).json({
            error: 'Internal server error'
          }));

        case 16:
        case "end":
          return _context30.stop();
      }
    }
  }, null, null, [[0, 12]]);
});
/**
 * POST /checkins/today
 * 规则：同一天重复点不会重复加分
 * 返回：points、totalDays、checkedInToday、gainedPoints
 */

app.post('/checkins/today', function _callee20(req, res) {
  var client, _getAuth18, userId, today, ins, didInsert, streakDays, gainedPoints, totalDays, yesterdayNote, todayNote, totalAfterInsert, yesterdayNoteResult, totalExisting, currentNoteResult, points, returnedGainedPoints, currentPoints;

  return regeneratorRuntime.async(function _callee20$(_context31) {
    while (1) {
      switch (_context31.prev = _context31.next) {
        case 0:
          _context31.next = 2;
          return regeneratorRuntime.awrap(_db.pool.connect());

        case 2:
          client = _context31.sent;
          _context31.prev = 3;
          _getAuth18 = (0, _express2.getAuth)(req), userId = _getAuth18.userId;

          if (userId) {
            _context31.next = 7;
            break;
          }

          return _context31.abrupt("return", res.status(401).json({
            error: 'Unauthenticated'
          }));

        case 7:
          _context31.next = 9;
          return regeneratorRuntime.awrap(ensureUserRow(userId));

        case 9:
          _context31.next = 11;
          return regeneratorRuntime.awrap(getLondonToday());

        case 11:
          today = _context31.sent;
          _context31.next = 14;
          return regeneratorRuntime.awrap(client.query('BEGIN'));

        case 14:
          _context31.next = 16;
          return regeneratorRuntime.awrap(client.query("\n      INSERT INTO app_checkins (clerk_user_id, checkin_date)\n      VALUES ($1, $2)\n      ON CONFLICT (clerk_user_id, checkin_date) DO NOTHING\n      RETURNING id\n      ", [userId, today]));

        case 16:
          ins = _context31.sent;
          didInsert = ins.rowCount === 1;
          streakDays = 0;
          gainedPoints = 0;
          totalDays = 0;
          yesterdayNote = '';
          todayNote = ''; // Only the first check-in for the current day should grant points.

          if (!didInsert) {
            _context31.next = 40;
            break;
          }

          _context31.next = 26;
          return regeneratorRuntime.awrap(client.query("SELECT COUNT(*)::int AS total_days FROM app_checkins WHERE clerk_user_id=$1", [userId]));

        case 26:
          totalAfterInsert = _context31.sent;

          if (totalAfterInsert.rows && totalAfterInsert.rows.length > 0 && totalAfterInsert.rows[0] && totalAfterInsert.rows[0].total_days != null) {
            totalDays = Number(totalAfterInsert.rows[0].total_days) || 0;
          }

          _context31.next = 30;
          return regeneratorRuntime.awrap(getStreakDays(client, userId, today));

        case 30:
          streakDays = _context31.sent;
          gainedPoints = getCheckinRewardPoints(streakDays);
          _context31.next = 34;
          return regeneratorRuntime.awrap(client.query("\n        SELECT next_day_note\n        FROM app_checkins\n        WHERE clerk_user_id = $1 AND checkin_date = ($2::date - INTERVAL '1 day')::date\n        LIMIT 1\n        ", [userId, today]));

        case 34:
          yesterdayNoteResult = _context31.sent;

          if (yesterdayNoteResult.rows && yesterdayNoteResult.rows.length > 0 && yesterdayNoteResult.rows[0] && yesterdayNoteResult.rows[0].next_day_note !== null && yesterdayNoteResult.rows[0].next_day_note !== undefined) {
            yesterdayNote = String(yesterdayNoteResult.rows[0].next_day_note);
          }

          _context31.next = 38;
          return regeneratorRuntime.awrap(client.query("UPDATE app_users SET points = points + $2, last_seen_at = NOW() WHERE clerk_user_id = $1", [userId, gainedPoints]));

        case 38:
          _context31.next = 51;
          break;

        case 40:
          _context31.next = 42;
          return regeneratorRuntime.awrap(getStreakDays(client, userId, today));

        case 42:
          streakDays = _context31.sent;
          _context31.next = 45;
          return regeneratorRuntime.awrap(client.query("SELECT COUNT(*)::int AS total_days FROM app_checkins WHERE clerk_user_id=$1", [userId]));

        case 45:
          totalExisting = _context31.sent;

          if (totalExisting.rows && totalExisting.rows.length > 0 && totalExisting.rows[0] && totalExisting.rows[0].total_days != null) {
            totalDays = Number(totalExisting.rows[0].total_days) || 0;
          }

          _context31.next = 49;
          return regeneratorRuntime.awrap(client.query("\n        SELECT next_day_note\n        FROM app_checkins\n        WHERE clerk_user_id = $1 AND checkin_date = $2\n        LIMIT 1\n        ", [userId, today]));

        case 49:
          currentNoteResult = _context31.sent;

          if (currentNoteResult.rows && currentNoteResult.rows.length > 0 && currentNoteResult.rows[0] && currentNoteResult.rows[0].next_day_note !== null && currentNoteResult.rows[0].next_day_note !== undefined) {
            todayNote = String(currentNoteResult.rows[0].next_day_note);
          }

        case 51:
          _context31.next = 53;
          return regeneratorRuntime.awrap(client.query("SELECT points FROM app_users WHERE clerk_user_id=$1", [userId]));

        case 53:
          points = _context31.sent;
          _context31.next = 56;
          return regeneratorRuntime.awrap(client.query('COMMIT'));

        case 56:
          returnedGainedPoints = 0;

          if (didInsert) {
            returnedGainedPoints = gainedPoints;
          }

          currentPoints = 0;

          if (points.rows && points.rows.length > 0 && points.rows[0] && points.rows[0].points != null) {
            currentPoints = points.rows[0].points;
          }

          return _context31.abrupt("return", res.json({
            ok: true,
            today: today,
            checkedInToday: true,
            gainedPoints: returnedGainedPoints,
            totalDays: totalDays,
            streakDays: streakDays,
            points: currentPoints,
            yesterdayNote: yesterdayNote,
            todayNote: todayNote
          }));

        case 63:
          _context31.prev = 63;
          _context31.t0 = _context31["catch"](3);
          _context31.next = 67;
          return regeneratorRuntime.awrap(client.query('ROLLBACK'));

        case 67:
          console.error('[BE] /checkins/today error:', _context31.t0);
          return _context31.abrupt("return", res.status(500).json({
            error: 'Internal server error'
          }));

        case 69:
          _context31.prev = 69;
          client.release();
          return _context31.finish(69);

        case 72:
        case "end":
          return _context31.stop();
      }
    }
  }, null, null, [[3, 63, 69, 72]]);
}); // Render 必须：绑定 0.0.0.0，并监听 PORT

app.listen(port, '0.0.0.0', function () {
  console.log('Backend listening on port ' + String(port));
});
//# sourceMappingURL=index.dev.js.map
