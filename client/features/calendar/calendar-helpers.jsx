export const PAGE_SIZE = 50;
export const ONE_DAY_MS = 24 * 60 * 60 * 1000;
export const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL;
export const SAVE_DEBOUNCE_MS = 450;

export const normalizeBaseUrl = (value) => {
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

export const buildBaseUrl = (value) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }
  if (trimmed.includes('.') || /^https?:\/\//i.test(trimmed)) {
    return normalizeBaseUrl(trimmed);
  }
  return 'https://' + trimmed + '.instructure.com';
};

export const formatDateTime = (isoString) => {
  if (!isoString) {
    return 'No due date';
  }
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) {
    return isoString;
  }
  return date.toLocaleString();
};

export const formatPercent = (value) => {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 'N/A';
  }
  return String(Math.round(value * 100)) + '%';
};

export const parseNumber = (value) => {
  const parsed = Number(value);
  if (Number.isFinite(parsed)) {
    return parsed;
  }
  return null;
};

export const formatScoreValue = (score, pointsPossible) => {
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

export const parseLinkHeader = (header) => {
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

export const sortByDueAt = (a, b) => {
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

export const isDueWithinWindow = (assignment, nowTs) => {
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

export const isNewlyPublished = (assignment, nowTs) => {
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

export const partitionAssignments = (assignments, nowTs) => {
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

export const getSubmissionOrderKey = (submission) => {
  const safeSubmission = submission || {};
  const attempt = Number(safeSubmission.attempt || 0);
  const updated = new Date(
    safeSubmission.graded_at || safeSubmission.submitted_at || safeSubmission.updated_at || 0
  ).getTime();
  return { attempt, updated };
};

export const pickLatestSubmissions = (submissions) => {
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

export const getErrorMessage = (error, fallbackMessage) => {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallbackMessage;
};

export const readJsonSafely = async (response) => {
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

export const getApiErrorMessage = (data, fallbackMessage) => {
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

export const isSubmissionSubmitted = (submission) => {
  const safeSubmission = submission || {};
  return Boolean(safeSubmission.submitted_at);
};

export const isSubmissionOnTime = (submission) => {
  const safeSubmission = submission || {};
  return Boolean(safeSubmission.submitted_at) && !safeSubmission.late;
};

export const normalizeUpcomingEvent = (item, index) => {
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

export const getAccentColor = (item, key, fallback) => {
  const safeItem = item || {};
  const accent = safeItem.accent || {};
  return accent[key] || fallback;
};

export const getCalendarDetailTypeLabel = (item) => {
  const safeItem = item || {};
  if (safeItem.source === 'customTask') {
    return 'Custom task';
  }
  return safeItem.type || 'Calendar item';
};

export const formatCalendarDetailSchedule = (item) => {
  const safeItem = item || {};
  if (safeItem.source === 'customTask') {
    return formatTaskSchedule(safeItem);
  }
  return formatShortDate(safeItem.date) + ' | ' + formatClockTime(safeItem.date);
};

export const getCalendarDetailConfirmLabel = (item) => {
  const safeItem = item || {};
  if (safeItem.htmlUrl) {
    return 'Open in Canvas';
  }
  return 'Done';
};

export const getStyleWhen = (condition, style) => {
  if (condition) {
    return style;
  }
  return null;
};

export const getTextWhen = (condition, trueText, falseText) => {
  if (condition) {
    return trueText;
  }
  return falseText;
};

export const getCanvasConnectButtonText = (isConnected) => {
  if (isConnected) {
    return 'Resync Canvas';
  }
  return 'Connect Canvas';
};

export const getCanvasStorageHelperText = (canPersistToBackend) => {
  if (canPersistToBackend) {
    return 'Token is saved to your backend account storage and auto-loaded when you open the app.';
  }
  return 'Backend token storage is unavailable. Set EXPO_PUBLIC_API_URL and sign in first.';
};

export const getPreviewEyebrowText = (isConnected) => {
  if (isConnected) {
    return 'SYNCED CALENDAR';
  }
  return 'TASK PLANNER';
};

export const getPreviewTitleText = (isConnected) => {
  if (isConnected) {
    return 'Canvas planner';
  }
  return 'Personal planner';
};

export const getPreviewSubtitleText = (isConnected) => {
  if (isConnected) {
    return 'Calendar shows your schedule. Overview holds profile, grades, due soon, assignments, and your own tasks.';
  }
  return 'Calendar now shows your own tasks even without an active Canvas sync.';
};

export const getNextUpcomingLabel = (nextUpcomingItem) => {
  if (nextUpcomingItem && nextUpcomingItem.title) {
    return 'Next: ' + String(nextUpcomingItem.title);
  }
  return 'Next: No synced task yet';
};

export const getTaskSaveButtonText = (editingTaskId) => {
  if (editingTaskId) {
    return 'Save changes';
  }
  return 'Add task';
};

export const getSubmissionStatusText = (submission) => {
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

export const getSubmissionDetailButtonText = (detailState) => {
  const safeDetailState = detailState || {};
  if (safeDetailState.loading) {
    return 'Loading detail...';
  }
  if (safeDetailState.expanded) {
    return 'Hide submission detail';
  }
  return 'View submission detail';
};

export const getDetailFallbackText = (detailState) => {
  const safeDetailState = detailState || {};
  if (safeDetailState.loading) {
    return 'Loading detail...';
  }
  return 'No detail loaded yet.';
};

export const getCollapseAssignmentsText = (isExpanded, count) => {
  if (isExpanded) {
    return 'Collapse old or no-due assignments';
  }
  return 'Show ' + String(count) + ' old or no-due assignments';
};

export const getTimePickerTitle = (activeTimeField) => {
  if (activeTimeField === 'dueTime') {
    return 'Choose due time';
  }
  if (activeTimeField === 'startTime') {
    return 'Choose start time';
  }
  return 'Choose end time';
};

export const getYesNoText = (value) => {
  if (value) {
    return 'Yes';
  }
  return 'No';
};

export const buildAssignmentDetailKey = (courseId, assignmentId) =>
  String(courseId) + ':' + String(assignmentId);

export const WEEK_HOUR_START = 7;
export const WEEK_HOUR_END = 17;
export const TIME_SLOTS = Array.from(
  { length: WEEK_HOUR_END - WEEK_HOUR_START + 1 },
  (_, index) => WEEK_HOUR_START + index
);
export const MINI_CALENDAR_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
export const PREVIEW_ACCENTS = [
  { bg: '#dbeafe', border: '#60a5fa', text: '#1d4ed8' },
  { bg: '#fee2e2', border: '#f87171', text: '#b91c1c' },
  { bg: '#dcfce7', border: '#4ade80', text: '#15803d' },
  { bg: '#fef3c7', border: '#fbbf24', text: '#b45309' },
  { bg: '#ede9fe', border: '#8b5cf6', text: '#6d28d9' },
];
export const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const TIME_WHEEL_ITEM_HEIGHT = 44;
export const TIME_WHEEL_SIDE_ROWS = 2;
export const HOUR_12_OPTIONS = Array.from({ length: 12 }, (_, index) => String(index + 1));
export const MINUTE_OPTIONS = ['00', '15', '30', '45'];
export const MERIDIEM_OPTIONS = ['AM', 'PM'];

export const toSafeDate = (value) => {
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

export const startOfDay = (value) => {
  const date = toSafeDate(value);
  if (!date) {
    return null;
  }
  date.setHours(0, 0, 0, 0);
  return date;
};

export const addDays = (value, amount) => {
  const date = toSafeDate(value);
  if (!date) {
    return null;
  }
  date.setDate(date.getDate() + amount);
  return date;
};

export const addMonths = (value, amount) => {
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

export const startOfWeek = (value) => {
  const date = startOfDay(value);
  if (!date) {
    return null;
  }
  date.setDate(date.getDate() - date.getDay());
  return date;
};

export const isSameDay = (left, right) => {
  const leftDate = startOfDay(left);
  const rightDate = startOfDay(right);
  if (!leftDate || !rightDate) {
    return false;
  }
  return leftDate.getTime() === rightDate.getTime();
};

export const isSameMonth = (left, right) => {
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

export const buildDateKey = (value) => {
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

export const formatMonthYear = (value) => {
  const date = toSafeDate(value);
  if (!date) {
    return '';
  }
  return date.toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });
};

export const formatShortDate = (value) => {
  const date = toSafeDate(value);
  if (!date) {
    return '';
  }
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
};

export const formatDayMonth = (value) => {
  const date = toSafeDate(value);
  if (!date) {
    return '';
  }
  return date.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
  });
};

export const formatWeekday = (value) => {
  const date = toSafeDate(value);
  if (!date) {
    return '';
  }
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
  }).toUpperCase();
};

export const formatClockTime = (value) => {
  const date = toSafeDate(value);
  if (!date) {
    return 'All day';
  }
  return date.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });
};

export const formatHourLabel = (hour) => {
  let period = 'AM';
  if (hour >= 12) {
    period = 'PM';
  }
  const normalizedHour = hour % 12 || 12;
  return String(normalizedHour) + ' ' + period;
};

export const buildMiniCalendarDays = (anchor) => {
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

export const pickPreviewAccent = (seed) => {
  const text = String(seed || 'default');
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash + text.charCodeAt(index)) % PREVIEW_ACCENTS.length;
  }
  return PREVIEW_ACCENTS[hash] || PREVIEW_ACCENTS[0];
};

export const formatInputDate = (value) => {
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

export const isValidDateInput = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || '').trim());
export const isValidTimeInput = (value) =>
  /^([01]\d|2[0-3]):([0-5]\d)$/.test(String(value || '').trim());
export const isQuarterHourTimeInput = (value) => {
  const safe = String(value || '').trim();
  return isValidTimeInput(safe) && MINUTE_OPTIONS.includes(safe.slice(3, 5));
};

export const parseDateInput = (value) => {
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

export const normalizeTaskDateInput = (value, fallback = new Date()) => {
  const normalizedDate = parseDateInput(value) || startOfDay(value) || startOfDay(fallback);
  return formatInputDate(normalizedDate || fallback);
};

export const normalizeTaskTimeInput = (value, fallback = '') => {
  const safe = String(value || '').trim();
  const match = safe.match(/^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/);
  if (!match) {
    return fallback;
  }
  return match[1] + ':' + match[2];
};

export const normalizeCustomTask = (task, fallbackDate = new Date()) => {
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

export const formatTimeOnly = (value) => {
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

export const buildTaskDateTimeIso = (task) => {
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

export const formatTaskSchedule = (task) => {
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

export const formatPickerDateLabel = (value) => {
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

export const clampDateToMonthYear = (value, year, month) => {
  const baseDate = toSafeDate(value) || new Date();
  const lastDay = new Date(year, month + 1, 0).getDate();
  const nextDate = new Date(baseDate);
  nextDate.setFullYear(year, month, Math.min(baseDate.getDate(), lastDay));
  return nextDate;
};

export const parseTimeDraft = (value) => {
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

export const formatTimeDraftToValue = (draft) => {
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

export const createEmptyTaskForm = (seedDate = new Date()) => ({
  title: '',
  taskDate: formatInputDate(seedDate),
  timingMode: 'deadline',
  dueTime: '18:00',
  startTime: '09:00',
  endTime: '10:00',
});

export const sortTasks = (items) => {
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

