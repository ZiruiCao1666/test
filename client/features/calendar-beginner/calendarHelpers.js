const normalizeBaseUrl = (value) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }
  let withProtocol = trimmed;
  if (!/^https?:\/\//i.test(trimmed)) {
    withProtocol = 'https://' + trimmed;
  }
  return withProtocol.replace(/\/+$/, '');
};

const buildBaseUrl = (value) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }
  if (trimmed.includes('.') || /^https?:\/\//i.test(trimmed)) {
    return normalizeBaseUrl(trimmed);
  }
  return 'https://' + trimmed + '.instructure.com';
};

const formatDateTime = (isoString) => {
  if (!isoString) {
    return 'No due date';
  }
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) {
    return isoString;
  }
  return date.toLocaleString();
};

const formatPercent = (value) => {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 'N/A';
  }
  return String(Math.round(value * 100)) + '%';
};

const parseNumber = (value) => {
  const parsed = Number(value);
  if (Number.isFinite(parsed)) {
    return parsed;
  }
  return null;
};

const formatScoreValue = (score, pointsPossible) => {
  const safeScore = parseNumber(score);
  const safePoints = parseNumber(pointsPossible);
  if (safeScore === null && safePoints === null) {
    return 'N/A';
  }
  if (safeScore !== null && safePoints !== null) {
    return String(safeScore) + ' / ' + String(safePoints);
  }
  if (safeScore !== null) {
    return String(safeScore) + ' / N/A';
  }
  return 'N/A / ' + String(safePoints);
};

const parseLinkHeader = (header) => {
  if (!header) {
    return {};
  }
  return header.split(',').reduce((acc, part) => {
    const match = part.match(/<([^>]+)>\s*;\s*rel="([^"]+)"/);
    if (match) {
      acc[match[2]] = match[1];
    }
    return acc;
  }, {});
};

const sortByDueAt = (a, b) => {
  const left = a || {};
  const right = b || {};
  if (!left.due_at && !right.due_at) {
    return 0;
  }
  if (!left.due_at) {
    return 1;
  }
  if (!right.due_at) {
    return -1;
  }
  return new Date(a.due_at) - new Date(b.due_at);
};

const isDueWithinWindow = (assignment, nowTs) => {
  const safeAssignment = assignment || {};
  if (!safeAssignment.due_at) {
    return false;
  }
  const dueTs = new Date(safeAssignment.due_at).getTime();
  if (Number.isNaN(dueTs)) {
    return false;
  }
  return dueTs >= nowTs - 7 * ONE_DAY_MS;
};

const isNewlyPublished = (assignment, nowTs) => {
  const safeAssignment = assignment || {};
  const publishedAt =
    safeAssignment.published_at || safeAssignment.created_at || safeAssignment.unlock_at;
  if (!publishedAt) {
    return false;
  }
  const publishedTs = new Date(publishedAt).getTime();
  if (Number.isNaN(publishedTs)) {
    return false;
  }
  return publishedTs >= nowTs - 14 * ONE_DAY_MS;
};

const partitionAssignments = (assignments, nowTs) => {
  const visibleItems = [];
  const collapsedItems = [];
  const safeAssignments = [];
  if (Array.isArray(assignments)) {
    assignments.forEach((item) => safeAssignments.push(item));
  }
  safeAssignments.forEach((assignment) => {
    if (isDueWithinWindow(assignment, nowTs) || isNewlyPublished(assignment, nowTs)) {
      visibleItems.push(assignment);
      return;
    }
    collapsedItems.push(assignment);
  });
  return { visibleItems, collapsedItems };
};

const getSubmissionOrderKey = (submission) => {
  const safeSubmission = submission || {};
  const attempt = Number(safeSubmission.attempt || 0);
  const updated = new Date(
    safeSubmission.graded_at || safeSubmission.submitted_at || safeSubmission.updated_at || 0
  ).getTime();
  return { attempt, updated };
};

const pickLatestSubmissions = (submissions) => {
  const safeSubmissions = [];
  if (Array.isArray(submissions)) {
    submissions.forEach((item) => safeSubmissions.push(item));
  }
  return safeSubmissions.reduce((acc, submission, index) => {
    const safeSubmission = submission || {};
    const assignment = safeSubmission.assignment || {};
    let assignmentId = safeSubmission.assignment_id;
    if (assignmentId === null || assignmentId === undefined || assignmentId === '') {
      assignmentId = assignment.id;
    }
    if (assignmentId === null || assignmentId === undefined || assignmentId === '') {
      assignmentId = 'idx_' + String(index);
    }
    const assignmentKey = String(assignmentId);
    const current = acc[assignmentKey];
    if (!current) {
      acc[assignmentKey] = submission;
      return acc;
    }

    const nextOrder = getSubmissionOrderKey(submission);
    const currentOrder = getSubmissionOrderKey(current);
    if (nextOrder.attempt > currentOrder.attempt) {
      acc[assignmentKey] = submission;
      return acc;
    }
    if (nextOrder.attempt === currentOrder.attempt && nextOrder.updated > currentOrder.updated) {
      acc[assignmentKey] = submission;
    }
    return acc;
  }, {});
};

const getErrorMessage = (error, fallbackMessage) => {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallbackMessage;
};

const readJsonSafely = async (response) => {
  const raw = await response.text();
  if (!raw) {
    return {};
  }
  try {
    return JSON.parse(raw);
  } catch (parseError) {
    return {};
  }
};

const getApiErrorMessage = (data, fallbackMessage) => {
  const safeData = data || {};
  const errors = [];
  if (Array.isArray(safeData.errors)) {
    safeData.errors.forEach((item) => errors.push(item));
  }
  if (errors.length > 0) {
    const firstError = errors[0] || {};
    if (firstError.message) {
      return firstError.message;
    }
  }
  if (safeData.error) {
    return safeData.error;
  }
  if (safeData.message) {
    return safeData.message;
  }
  return fallbackMessage;
};

const isSubmissionSubmitted = (submission) => {
  const safeSubmission = submission || {};
  return Boolean(safeSubmission.submitted_at);
};

const isSubmissionOnTime = (submission) => {
  const safeSubmission = submission || {};
  return Boolean(safeSubmission.submitted_at) && !safeSubmission.late;
};

const normalizeUpcomingEvent = (item, index) => {
  const safeItem = item || {};
  const assignment = safeItem.assignment || {};
  const date = safeItem.due_at || safeItem.start_at || safeItem.end_at || null;
  let rawId = safeItem.id;
  if (rawId === null || rawId === undefined || rawId === '') {
    rawId = safeItem.event_id;
  }
  if (rawId === null || rawId === undefined || rawId === '') {
    rawId = safeItem.assignment_id;
  }
  if (rawId === null || rawId === undefined || rawId === '') {
    rawId = index;
  }
  return {
    id: String(rawId),
    title: safeItem.title || safeItem.name || 'Untitled event',
    course: safeItem.context_name || assignment.course_name || '',
    type: safeItem.type || assignment.type || 'event',
    date,
    htmlUrl: safeItem.html_url || assignment.html_url || '',
  };
};

const getAccentColor = (item, key, fallback) => {
  const safeItem = item || {};
  const accent = safeItem.accent || {};
  return accent[key] || fallback;
};

const getCalendarDetailTypeLabel = (item) => {
  const safeItem = item || {};
  if (safeItem.source === 'customTask') {
    return 'Custom task';
  }
  return safeItem.type || 'Calendar item';
};

const formatCalendarDetailSchedule = (item) => {
  const safeItem = item || {};
  if (safeItem.source === 'customTask') {
    return formatTaskSchedule(safeItem);
  }
  return formatShortDate(safeItem.date) + ' | ' + formatClockTime(safeItem.date);
};

const getCalendarDetailConfirmLabel = (item) => {
  const safeItem = item || {};
  if (safeItem.htmlUrl) {
    return 'Open in Canvas';
  }
  return 'Done';
};

const getStyleWhen = (condition, style) => {
  if (condition) {
    return style;
  }
  return null;
};

const getTextWhen = (condition, trueText, falseText) => {
  if (condition) {
    return trueText;
  }
  return falseText;
};

const getCanvasConnectButtonText = (isConnected) => {
  if (isConnected) {
    return 'Resync Canvas';
  }
  return 'Connect Canvas';
};

const getCanvasStorageHelperText = (canPersistToBackend) => {
  if (canPersistToBackend) {
    return 'Token is saved to your backend account storage and auto-loaded when you open the app.';
  }
  return 'Backend token storage is unavailable. Set EXPO_PUBLIC_API_URL and sign in first.';
};

const getPreviewEyebrowText = (isConnected) => {
  if (isConnected) {
    return 'SYNCED CALENDAR';
  }
  return 'TASK PLANNER';
};

const getPreviewTitleText = (isConnected) => {
  if (isConnected) {
    return 'Canvas planner';
  }
  return 'Personal planner';
};

const getPreviewSubtitleText = (isConnected) => {
  if (isConnected) {
    return 'Calendar shows your schedule. Overview holds profile, grades, due soon, assignments, and your own tasks.';
  }
  return 'Calendar now shows your own tasks even without an active Canvas sync.';
};

const getNextUpcomingLabel = (nextUpcomingItem) => {
  if (nextUpcomingItem && nextUpcomingItem.title) {
    return 'Next: ' + String(nextUpcomingItem.title);
  }
  return 'Next: No synced task yet';
};

const getTaskSaveButtonText = (editingTaskId) => {
  if (editingTaskId) {
    return 'Save changes';
  }
  return 'Add task';
};

const getSubmissionStatusText = (submission) => {
  const safeSubmission = submission || {};
  let statusText = 'Not submitted';
  if (safeSubmission.submitted_at) {
    statusText = 'Submitted';
  }
  if (safeSubmission.late) {
    statusText = statusText + ' (Late)';
  }
  return statusText;
};

const getSubmissionDetailButtonText = (detailState) => {
  const safeDetailState = detailState || {};
  if (safeDetailState.loading) {
    return 'Loading detail...';
  }
  if (safeDetailState.expanded) {
    return 'Hide submission detail';
  }
  return 'View submission detail';
};

const getDetailFallbackText = (detailState) => {
  const safeDetailState = detailState || {};
  if (safeDetailState.loading) {
    return 'Loading detail...';
  }
  return 'No detail loaded yet.';
};

const getCollapseAssignmentsText = (isExpanded, count) => {
  if (isExpanded) {
    return 'Collapse old or no-due assignments';
  }
  return 'Show ' + String(count) + ' old or no-due assignments';
};

const getTimePickerTitle = (activeTimeField) => {
  if (activeTimeField === 'dueTime') {
    return 'Choose due time';
  }
  if (activeTimeField === 'startTime') {
    return 'Choose start time';
  }
  return 'Choose end time';
};

const getYesNoText = (value) => {
  if (value) {
    return 'Yes';
  }
  return 'No';
};

const buildAssignmentDetailKey = (courseId, assignmentId) =>
  String(courseId) + ':' + String(assignmentId);

const WEEK_HOUR_START = 7;
const WEEK_HOUR_END = 17;
const TIME_SLOTS = Array.from(
  { length: WEEK_HOUR_END - WEEK_HOUR_START + 1 },
  (_, index) => WEEK_HOUR_START + index
);
const MINI_CALENDAR_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const PREVIEW_ACCENTS = [
  { bg: '#dbeafe', border: '#60a5fa', text: '#1d4ed8' },
  { bg: '#fee2e2', border: '#f87171', text: '#b91c1c' },
  { bg: '#dcfce7', border: '#4ade80', text: '#15803d' },
  { bg: '#fef3c7', border: '#fbbf24', text: '#b45309' },
  { bg: '#ede9fe', border: '#8b5cf6', text: '#6d28d9' },
];
const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const TIME_WHEEL_ITEM_HEIGHT = 44;
const TIME_WHEEL_SIDE_ROWS = 2;
const HOUR_12_OPTIONS = Array.from({ length: 12 }, (_, index) => String(index + 1));
const MINUTE_OPTIONS = ['00', '15', '30', '45'];
const MERIDIEM_OPTIONS = ['AM', 'PM'];

const toSafeDate = (value) => {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  let date = null;
  if (value instanceof Date) {
    date = new Date(value);
  } else {
    date = new Date(value);
  }
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date;
};

const startOfDay = (value) => {
  const date = toSafeDate(value);
  if (!date) {
    return null;
  }
  date.setHours(0, 0, 0, 0);
  return date;
};

const addDays = (value, amount) => {
  const date = toSafeDate(value);
  if (!date) {
    return null;
  }
  date.setDate(date.getDate() + amount);
  return date;
};

const addMonths = (value, amount) => {
  const date = toSafeDate(value);
  if (!date) {
    return null;
  }
  const targetDay = date.getDate();
  const nextDate = new Date(date.getFullYear(), date.getMonth() + amount, 1);
  const lastDayOfTargetMonth = new Date(
    nextDate.getFullYear(),
    nextDate.getMonth() + 1,
    0
  ).getDate();
  nextDate.setDate(Math.min(targetDay, lastDayOfTargetMonth));
  return nextDate;
};

const startOfWeek = (value) => {
  const date = startOfDay(value);
  if (!date) {
    return null;
  }
  date.setDate(date.getDate() - date.getDay());
  return date;
};

const isSameDay = (left, right) => {
  const leftDate = startOfDay(left);
  const rightDate = startOfDay(right);
  if (!leftDate || !rightDate) {
    return false;
  }
  return leftDate.getTime() === rightDate.getTime();
};

const isSameMonth = (left, right) => {
  const leftDate = toSafeDate(left);
  const rightDate = toSafeDate(right);
  if (!leftDate || !rightDate) {
    return false;
  }
  return (
    leftDate.getFullYear() === rightDate.getFullYear() &&
    leftDate.getMonth() === rightDate.getMonth()
  );
};

const buildDateKey = (value) => {
  const date = startOfDay(value);
  if (!date) {
    return '';
  }
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
};

const formatMonthYear = (value) => {
  const date = toSafeDate(value);
  if (!date) {
    return '';
  }
  return date.toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });
};

const formatShortDate = (value) => {
  const date = toSafeDate(value);
  if (!date) {
    return '';
  }
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
};

const formatDayMonth = (value) => {
  const date = toSafeDate(value);
  if (!date) {
    return '';
  }
  return date.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
  });
};

const formatWeekday = (value) => {
  const date = toSafeDate(value);
  if (!date) {
    return '';
  }
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
  }).toUpperCase();
};

const formatClockTime = (value) => {
  const date = toSafeDate(value);
  if (!date) {
    return 'All day';
  }
  return date.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });
};

const formatHourLabel = (hour) => {
  let period = 'AM';
  if (hour >= 12) {
    period = 'PM';
  }
  const normalizedHour = hour % 12 || 12;
  return String(normalizedHour) + ' ' + period;
};

const buildMiniCalendarDays = (anchor) => {
  const current = toSafeDate(anchor) || new Date();
  const monthStart = new Date(current.getFullYear(), current.getMonth(), 1);
  const gridStart = addDays(monthStart, -monthStart.getDay());
  return Array.from({ length: 42 }, (_, index) => {
    const date = addDays(gridStart, index);
    return {
      key: buildDateKey(date) + '-' + String(index),
      date,
      inCurrentMonth: isSameMonth(date, current),
    };
  });
};

const pickPreviewAccent = (seed) => {
  const text = String(seed || 'default');
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash + text.charCodeAt(index)) % PREVIEW_ACCENTS.length;
  }
  return PREVIEW_ACCENTS[hash] || PREVIEW_ACCENTS[0];
};

const formatInputDate = (value) => {
  const date = startOfDay(value) || startOfDay(new Date());
  if (!date) {
    return '';
  }
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
};

const isValidDateInput = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || '').trim());
const isValidTimeInput = (value) =>
  /^([01]\d|2[0-3]):([0-5]\d)$/.test(String(value || '').trim());
const isQuarterHourTimeInput = (value) => {
  const safe = String(value || '').trim();
  return isValidTimeInput(safe) && MINUTE_OPTIONS.includes(safe.slice(3, 5));
};

const parseDateInput = (value) => {
  const safe = String(value || '').trim();
  if (!isValidDateInput(safe)) {
    return null;
  }
  const [year, month, day] = safe.split('-').map((part) => Number(part));
  const date = new Date(year, month - 1, day);
  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
};

const normalizeTaskDateInput = (value, fallback = new Date()) => {
  const normalizedDate = parseDateInput(value) || startOfDay(value) || startOfDay(fallback);
  return formatInputDate(normalizedDate || fallback);
};

const normalizeTaskTimeInput = (value, fallback = '') => {
  const safe = String(value || '').trim();
  const match = safe.match(/^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/);
  if (!match) {
    return fallback;
  }
  return match[1] + ':' + match[2];
};

const normalizeCustomTask = (task, fallbackDate = new Date()) => {
  const safeTask = task || {};
  let timingMode = 'deadline';
  if (safeTask.timingMode === 'range') {
    timingMode = 'range';
  }
  return {
    ...safeTask,
    taskDate: normalizeTaskDateInput(safeTask.taskDate, fallbackDate),
    dueTime: normalizeTaskTimeInput(safeTask.dueTime, '18:00'),
    startTime: normalizeTaskTimeInput(safeTask.startTime, '09:00'),
    endTime: normalizeTaskTimeInput(safeTask.endTime, '10:00'),
    timingMode,
  };
};

const formatTimeOnly = (value) => {
  let safe = '';
  if (value !== undefined && value !== null) {
    safe = String(value).trim();
  }

  if (!isValidTimeInput(safe)) {
    if (safe) {
      return safe;
    }
    return 'N/A';
  }

  const rawDateTime = '2000-01-01T' + safe + ':00';
  const date = toSafeDate(rawDateTime);
  if (!date) {
    return safe;
  }

  return date.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });
};

const buildTaskDateTimeIso = (task) => {
  const safeTask = task || {};
  const taskDate = String(safeTask.taskDate || '').trim();
  if (!isValidDateInput(taskDate)) {
    return '';
  }
  if (safeTask.timingMode === 'range' && isValidTimeInput(safeTask.startTime)) {
    return taskDate + 'T' + String(safeTask.startTime).trim() + ':00';
  }
  if (isValidTimeInput(safeTask.dueTime)) {
    return taskDate + 'T' + String(safeTask.dueTime).trim() + ':00';
  }
  return taskDate + 'T12:00:00';
};

const formatTaskSchedule = (task) => {
  const safeTask = task || {};
  const dateLabel = formatShortDate(safeTask.taskDate || '');
  if (safeTask.timingMode === 'range') {
    const startText = formatTimeOnly(safeTask.startTime);
    const endText = formatTimeOnly(safeTask.endTime);
    return dateLabel + ' | ' + startText + ' - ' + endText;
  }
  const dueText = formatTimeOnly(safeTask.dueTime);
  return dateLabel + ' | Due ' + dueText;
};

const formatPickerDateLabel = (value) => {
  const date = parseDateInput(value) || toSafeDate(value);
  if (!date) {
    return 'Pick a date';
  }
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
};

const clampDateToMonthYear = (value, year, month) => {
  const baseDate = toSafeDate(value) || new Date();
  const lastDay = new Date(year, month + 1, 0).getDate();
  const nextDate = new Date(baseDate);
  nextDate.setFullYear(year, month, Math.min(baseDate.getDate(), lastDay));
  return nextDate;
};

const parseTimeDraft = (value) => {
  const safe = String(value || '').trim();
  if (!isValidTimeInput(safe)) {
    return {
      hour12: '6',
      minute: '00',
      meridiem: 'PM',
    };
  }

  const [rawHour, rawMinute] = safe.split(':').map((part) => Number(part));
  let minute = '00';
  if (MINUTE_OPTIONS.includes(String(rawMinute).padStart(2, '0'))) {
    minute = String(rawMinute).padStart(2, '0');
  }
  let meridiem = 'AM';
  if (rawHour >= 12) {
    meridiem = 'PM';
  }
  return {
    hour12: String(rawHour % 12 || 12),
    minute,
    meridiem,
  };
};

const formatTimeDraftToValue = (draft) => {
  const safeDraft = draft || {};
  let hour = Number(safeDraft.hour12 || 12);
  if (!Number.isInteger(hour) || hour < 1 || hour > 12) hour = 12;

  let minute = '00';
  if (MINUTE_OPTIONS.includes(String(safeDraft.minute || ''))) {
    minute = String(safeDraft.minute);
  }
  let meridiem = 'PM';
  if (safeDraft.meridiem === 'AM') {
    meridiem = 'AM';
  }

  if (meridiem === 'AM') {
    if (hour === 12) {
      hour = 0;
    }
  } else {
    if (hour !== 12) {
      hour += 12;
    }
  }

  return String(hour).padStart(2, '0') + ':' + minute;
};


const createEmptyTaskForm = (seedDate = new Date()) => ({
  title: '',
  taskDate: formatInputDate(seedDate),
  timingMode: 'deadline',
  dueTime: '18:00',
  startTime: '09:00',
  endTime: '10:00',
});

const sortTasks = (items) => {
  let safeItems = [];
  if (Array.isArray(items)) {
    safeItems = items;
  }
  return safeItems.slice().sort((left, right) => {
    const leftDate = toSafeDate(buildTaskDateTimeIso(left));
    const rightDate = toSafeDate(buildTaskDateTimeIso(right));
    let leftTs = Number.POSITIVE_INFINITY;
    let rightTs = Number.POSITIVE_INFINITY;
    if (leftDate) {
      leftTs = leftDate.getTime();
    }
    if (rightDate) {
      rightTs = rightDate.getTime();
    }
    return leftTs - rightTs;
  });
};


export {
  normalizeBaseUrl,
  buildBaseUrl,
  formatDateTime,
  formatPercent,
  parseNumber,
  formatScoreValue,
  parseLinkHeader,
  sortByDueAt,
  isDueWithinWindow,
  isNewlyPublished,
  partitionAssignments,
  getSubmissionOrderKey,
  pickLatestSubmissions,
  getErrorMessage,
  readJsonSafely,
  getApiErrorMessage,
  isSubmissionSubmitted,
  isSubmissionOnTime,
  normalizeUpcomingEvent,
  getAccentColor,
  getCalendarDetailTypeLabel,
  formatCalendarDetailSchedule,
  getCalendarDetailConfirmLabel,
  getStyleWhen,
  getTextWhen,
  getCanvasConnectButtonText,
  getCanvasStorageHelperText,
  getPreviewEyebrowText,
  getPreviewTitleText,
  getPreviewSubtitleText,
  getNextUpcomingLabel,
  getTaskSaveButtonText,
  getSubmissionStatusText,
  getSubmissionDetailButtonText,
  getDetailFallbackText,
  getCollapseAssignmentsText,
  getTimePickerTitle,
  getYesNoText,
  buildAssignmentDetailKey,
  WEEK_HOUR_START,
  WEEK_HOUR_END,
  TIME_SLOTS,
  MINI_CALENDAR_LABELS,
  PREVIEW_ACCENTS,
  MONTH_LABELS,
  TIME_WHEEL_ITEM_HEIGHT,
  TIME_WHEEL_SIDE_ROWS,
  HOUR_12_OPTIONS,
  MINUTE_OPTIONS,
  MERIDIEM_OPTIONS,
  toSafeDate,
  startOfDay,
  addDays,
  addMonths,
  startOfWeek,
  isSameDay,
  isSameMonth,
  buildDateKey,
  formatMonthYear,
  formatShortDate,
  formatDayMonth,
  formatWeekday,
  formatClockTime,
  formatHourLabel,
  buildMiniCalendarDays,
  pickPreviewAccent,
  formatInputDate,
  isValidDateInput,
  isValidTimeInput,
  isQuarterHourTimeInput,
  parseDateInput,
  normalizeTaskDateInput,
  normalizeTaskTimeInput,
  normalizeCustomTask,
  formatTimeOnly,
  buildTaskDateTimeIso,
  formatTaskSchedule,
  formatPickerDateLabel,
  clampDateToMonthYear,
  parseTimeDraft,
  formatTimeDraftToValue,
  createEmptyTaskForm,
  sortTasks,
};
