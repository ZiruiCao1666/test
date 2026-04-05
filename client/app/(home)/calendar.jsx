import React, { useEffect, useMemo, useRef, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Modal,
  Alert,
} from 'react-native';
import * as Linking from 'expo-linking';
import * as SecureStore from 'expo-secure-store';
import { useAuth } from '@clerk/clerk-expo';
import { useFocusEffect } from '@react-navigation/native';
import { useAppTheme } from '../../lib/app-theme';

const PAGE_SIZE = 50;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL;
const HOME_PLAN_CACHE_PREFIX = 'home_plan_v2';
const HOME_PLAN_RESET_PREFIX = 'home_plan_reset_v1';

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
  const hasScore = safeScore !== null;
  const hasPoints = safePoints !== null;
  if (!hasScore) {
    if (!hasPoints) {
      return 'N/A';
    }
  }
  if (hasScore) {
    if (hasPoints) {
      return String(safeScore) + ' / ' + String(safePoints);
    }
  }
  if (hasScore) {
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
  const leftMissing = !left.due_at;
  const rightMissing = !right.due_at;
  if (leftMissing) {
    if (rightMissing) {
      return 0;
    }
  }
  if (leftMissing) {
    return 1;
  }
  if (rightMissing) {
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
    if (nextOrder.attempt === currentOrder.attempt) {
      if (nextOrder.updated > currentOrder.updated) {
        acc[assignmentKey] = submission;
      }
    }
    return acc;
  }, {});
};

const getErrorMessage = (error, fallbackMessage) => {
  if (error instanceof Error) {
    if (error.message) {
      return error.message;
    }
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
  const hasSubmittedAt = Boolean(safeSubmission.submitted_at);
  if (!hasSubmittedAt) {
    return false;
  }
  if (safeSubmission.late) {
    return false;
  }
  return true;
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

const getTaskRewardNoticeText = (rewardResult) => {
  const safeRewardResult = rewardResult || {};
  if (safeRewardResult.granted) {
    const gainedPoints = Number(safeRewardResult.gainedPoints) || 0;
    if (gainedPoints === 1) {
      return '+1 point earned';
    }
    if (gainedPoints > 1) {
      return '+' + String(gainedPoints) + ' points earned';
    }
  }
  if (safeRewardResult.reason === 'daily_cap_reached') {
    return 'Daily custom-task reward limit reached';
  }
  if (safeRewardResult.reason === 'already_rewarded') {
    return 'This task reward was already claimed';
  }
  if (safeRewardResult.reason === 'deadline_passed') {
    return 'No reward for an overdue task';
  }
  return '';
};

const getTaskRewardPopupMessage = (rewardResult) => {
  const safeRewardResult = rewardResult || {};
  if (!safeRewardResult.granted) {
    return '';
  }

  let dailyCountAfterGrant = Number(safeRewardResult.dailyCountAfterGrant);
  if (!Number.isFinite(dailyCountAfterGrant) || dailyCountAfterGrant <= 0) {
    dailyCountAfterGrant = 1;
  }

  let dailyLimit = Number(safeRewardResult.dailyLimit);
  if (!Number.isFinite(dailyLimit) || dailyLimit <= 0) {
    dailyLimit = 2;
  }

  let gainedPoints = Number(safeRewardResult.gainedPoints);
  if (!Number.isFinite(gainedPoints) || gainedPoints <= 0) {
    gainedPoints = 1;
  }

  return (
    '完成每日任务 ' +
    String(dailyCountAfterGrant) +
    '/' +
    String(dailyLimit) +
    '\n积分 +' +
    String(gainedPoints)
  );
};

const getCanvasConnectButtonText = (isConnected) => {
  if (isConnected) {
    return 'Resync Canvas';
  }
  return 'Connect Canvas';
};

const getCanvasStorageHelperText = (canPersistToBackend) => {
  return '';
};

const getCanvasTokenStatusText = (hasTokenInput, canPersistToBackend) => {
  return '';
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
  if (nextUpcomingItem) {
    if (nextUpcomingItem.title) {
      return 'Next: ' + String(nextUpcomingItem.title);
    }
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
  if (leftDate.getFullYear() !== rightDate.getFullYear()) {
    return false;
  }
  if (leftDate.getMonth() !== rightDate.getMonth()) {
    return false;
  }
  return true;
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
  if (!isValidTimeInput(safe)) {
    return false;
  }
  if (!MINUTE_OPTIONS.includes(safe.slice(3, 5))) {
    return false;
  }
  return true;
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
  if (value === undefined || value === null) {
    safe = '';
  } else {
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
  if (safeTask.timingMode === 'range') {
    if (isValidTimeInput(safeTask.startTime)) {
      return taskDate + 'T' + String(safeTask.startTime).trim() + ':00';
    }
  }
  if (isValidTimeInput(safeTask.dueTime)) {
    return taskDate + 'T' + String(safeTask.dueTime).trim() + ':00';
  }
  return taskDate + 'T12:00:00';
};

const getTaskDeadlineDate = (task) => {
  const safeTask = task || {};
  const taskDate = String(safeTask.taskDate || '').trim();
  if (!isValidDateInput(taskDate)) {
    return null;
  }

  if (safeTask.timingMode === 'range') {
    if (isValidTimeInput(safeTask.endTime)) {
      return toSafeDate(taskDate + 'T' + String(safeTask.endTime).trim() + ':00');
    }
    if (isValidTimeInput(safeTask.startTime)) {
      return toSafeDate(taskDate + 'T' + String(safeTask.startTime).trim() + ':00');
    }
  }

  if (isValidTimeInput(safeTask.dueTime)) {
    return toSafeDate(taskDate + 'T' + String(safeTask.dueTime).trim() + ':00');
  }
  return toSafeDate(taskDate + 'T12:00:00');
};

const getTaskSortMeta = (task, nowTs) => {
  const safeTask = task || {};
  const deadlineDate = getTaskDeadlineDate(safeTask);
  let deadlineTs = Number.POSITIVE_INFINITY;
  if (deadlineDate) {
    deadlineTs = deadlineDate.getTime();
  }

  let completionTs = Number.POSITIVE_INFINITY;
  if (safeTask.isCompleted) {
    const completedDate = toSafeDate(safeTask.updatedAt);
    if (completedDate) {
      completionTs = completedDate.getTime();
    }
  }

  let bucket = 0;
  if (safeTask.isCompleted) {
    if (deadlineTs <= nowTs - 3 * ONE_DAY_MS) {
      bucket = 4;
    } else if (completionTs <= nowTs - ONE_DAY_MS) {
      bucket = 4;
    } else {
      bucket = 2;
    }
  } else if (deadlineTs < nowTs) {
    if (deadlineTs <= nowTs - 3 * ONE_DAY_MS) {
      bucket = 3;
    } else {
      bucket = 1;
    }
  }

  return {
    bucket,
    deadlineTs,
    completionTs,
  };
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

const PickerWheelColumn = ({
  label,
  options,
  value,
  onChange,
  scrollRef,
}) => {
  const { theme } = useAppTheme();
  const paddingHeight = TIME_WHEEL_ITEM_HEIGHT * TIME_WHEEL_SIDE_ROWS;

  const snapToOption = (index, animated = true) => {
    const safeIndex = Math.max(0, Math.min(options.length - 1, index));
    const nextValue = options[safeIndex];
    if (nextValue !== value) onChange(nextValue);
    let currentScrollRef = null;
    if (scrollRef) {
      if (scrollRef.current) {
        currentScrollRef = scrollRef.current;
      }
    }
    if (currentScrollRef) {
      if (typeof currentScrollRef.scrollTo === 'function') {
        currentScrollRef.scrollTo({
          y: safeIndex * TIME_WHEEL_ITEM_HEIGHT,
          animated,
        });
      }
    }
  };

  const handleSnap = (offsetY) => {
    const nextIndex = Math.round(offsetY / TIME_WHEEL_ITEM_HEIGHT);
    snapToOption(nextIndex, true);
  };

  return (
    <View style={styles.timeWheelGroup}>
      <Text style={[styles.timeWheelLabel, { color: theme.textSecondary }]}>{label}</Text>
      <View
        style={[
          styles.timeWheelColumn,
          { backgroundColor: theme.surface, borderColor: theme.border },
        ]}
      >
        <View
          pointerEvents="none"
          style={[styles.timeWheelGuideFrame, { borderColor: theme.borderSoft }]}
        />
        <ScrollView
          ref={scrollRef}
          bounces={false}
          decelerationRate="fast"
          showsVerticalScrollIndicator={false}
          snapToInterval={TIME_WHEEL_ITEM_HEIGHT}
          snapToAlignment="start"
          contentContainerStyle={{ paddingVertical: paddingHeight }}
          onMomentumScrollEnd={(event) => handleSnap(event.nativeEvent.contentOffset.y)}
          onScrollEndDrag={(event) => handleSnap(event.nativeEvent.contentOffset.y)}
        >
          {options.map((option, index) => {
            const active = option === value;
            return (
              <Pressable
                key={label + '-' + String(option)}
                onPress={() => snapToOption(index)}
                style={styles.timeWheelItem}
              >
                <Text
                  style={[
                    styles.timeWheelItemText,
                    { color: theme.textMuted },
                    getStyleWhen(active, styles.timeWheelItemTextActive),
                    getStyleWhen(active, { color: theme.textPrimary }),
                  ]}
                >
                  {option}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    </View>
  );
};

const MiniCalendarPanel = ({
  anchorDate,
  selectedDate,
  onSelectDate,
  onChangeMonth,
  dateMarkersByDate,
  onPressTitle,
  titleHint,
  footerHint,
}) => {
  const { theme } = useAppTheme();
  const calendarDays = useMemo(() => buildMiniCalendarDays(anchorDate), [anchorDate]);
  let titleHintNode = null;
  if (titleHint) {
    titleHintNode = <Text style={[styles.miniCalendarTitleHint, { color: theme.textMuted }]}>{titleHint}</Text>;
  }

  let titleNode = (
    <View style={styles.miniCalendarTitleBtn}>
      <Text style={styles.miniCalendarTitle}>{formatMonthYear(anchorDate)}</Text>
      {titleHintNode}
    </View>
  );
  if (onPressTitle) {
    titleNode = (
      <Pressable
        onPress={onPressTitle}
        style={({ pressed }) => [
          styles.miniCalendarTitleBtn,
          getStyleWhen(pressed, { opacity: 0.76 }),
        ]}
      >
        <Text style={styles.miniCalendarTitle}>{formatMonthYear(anchorDate)}</Text>
        {titleHintNode}
      </Pressable>
    );
  }

  let footerHintNode = null;
  if (footerHint) {
    footerHintNode = <Text style={[styles.miniCalendarHint, { color: '#CBD5E1' }]}>{footerHint}</Text>;
  }

  const legendNode = (
    <View style={styles.miniCalendarLegendRow}>
      <View style={styles.miniCalendarLegendItem}>
        <View style={[styles.miniCalendarLegendDot, styles.miniCalendarLegendDotCanvas]} />
        <Text style={[styles.miniCalendarLegendText, { color: '#E2E8F0' }]}>Canvas task</Text>
      </View>
      <View style={styles.miniCalendarLegendItem}>
        <View style={[styles.miniCalendarLegendDot, styles.miniCalendarLegendDotCustom]} />
        <Text style={[styles.miniCalendarLegendText, { color: '#E2E8F0' }]}>Custom task</Text>
      </View>
      <View style={styles.miniCalendarLegendItem}>
        <View style={[styles.miniCalendarLegendDot, styles.miniCalendarLegendDotCheckin]} />
        <Text style={[styles.miniCalendarLegendText, { color: '#E2E8F0' }]}>Checked in</Text>
      </View>
    </View>
  );

  return (
    <View style={styles.miniCalendarCard}>
      <View pointerEvents="none" style={styles.miniCalendarGlow} />
      <View style={styles.miniCalendarTopRow}>
        {titleNode}

        <View style={styles.miniCalendarNavRow}>
          <Pressable
            onPress={() => onChangeMonth(-1)}
            style={({ pressed }) => [
              styles.miniCalendarNavBtn,
              getStyleWhen(pressed, { opacity: 0.7 }),
            ]}
          >
            <Text style={styles.miniCalendarNavText}>{'<'}</Text>
          </Pressable>
          <Pressable
            onPress={() => onChangeMonth(1)}
            style={({ pressed }) => [
              styles.miniCalendarNavBtn,
              getStyleWhen(pressed, { opacity: 0.7 }),
            ]}
          >
            <Text style={styles.miniCalendarNavText}>{'>'}</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.miniCalendarWeekdays}>
        {MINI_CALENDAR_LABELS.map((label, index) => (
          <Text key={label + '-' + String(index)} style={styles.miniCalendarWeekdayText}>
            {label}
          </Text>
        ))}
      </View>

      <View style={styles.miniCalendarGrid}>
        {calendarDays.map((day) => {
          const dateKey = buildDateKey(day.date);
          let markers = {
            count: 0,
            hasCanvas: false,
            hasCustom: false,
            hasCheckin: false,
          };
          if (dateMarkersByDate) {
            const nextMarkers = dateMarkersByDate[dateKey];
            if (nextMarkers) {
              markers = nextMarkers;
            }
          }
          const isSelected = isSameDay(day.date, selectedDate);
          const isToday = isSameDay(day.date, new Date());
          const hasCheckin = Boolean(markers.hasCheckin);
          let showCheckedInBackground = false;
          if (hasCheckin) {
            if (!isSelected) {
              showCheckedInBackground = true;
            }
          }
          let showCheckedInSelected = false;
          if (hasCheckin) {
            if (isSelected) {
              showCheckedInSelected = true;
            }
          }
          let showCheckedInText = false;
          if (hasCheckin) {
            if (!isSelected) {
              showCheckedInText = true;
            }
          }
          let markersNode = null;
          if (markers.count > 0 || hasCheckin) {
            let canvasDotNode = null;
            if (markers.hasCanvas) {
              canvasDotNode = <View style={styles.miniCalendarDot} />;
            }
            let customDotNode = null;
            if (markers.hasCustom) {
              customDotNode = <View style={styles.miniCalendarDotCustom} />;
            }
            let checkinDotNode = null;
            if (hasCheckin) {
              checkinDotNode = <View style={styles.miniCalendarDotCheckin} />;
            }
            markersNode = (
              <View style={styles.miniCalendarDotRow}>
                {canvasDotNode}
                {customDotNode}
                {checkinDotNode}
              </View>
            );
          }
          return (
            <Pressable
              key={day.key}
              onPress={() => onSelectDate(day.date)}
              style={({ pressed }) => [
                styles.miniCalendarCell,
                getStyleWhen(!day.inCurrentMonth, styles.miniCalendarCellMuted),
                getStyleWhen(showCheckedInBackground, styles.miniCalendarCellCheckedIn),
                getStyleWhen(isSelected, styles.miniCalendarCellSelected),
                getStyleWhen(isToday, styles.miniCalendarCellToday),
                getStyleWhen(showCheckedInSelected, styles.miniCalendarCellCheckedInSelected),
                getStyleWhen(pressed, { opacity: 0.82 }),
              ]}
            >
              <Text
                style={[
                  styles.miniCalendarCellText,
                  getStyleWhen(!day.inCurrentMonth, styles.miniCalendarCellTextMuted),
                  getStyleWhen(showCheckedInText, styles.miniCalendarCellTextCheckedIn),
                  getStyleWhen(isSelected, styles.miniCalendarCellTextSelected),
                ]}
              >
                {day.date.getDate()}
              </Text>
              {markersNode}
            </Pressable>
          );
        })}
      </View>

      {legendNode}
      {footerHintNode}
    </View>
  );
};

const TaskSelectField = ({
  label,
  value,
  hint,
  onPress,
}) => {
  const { theme } = useAppTheme();
  let hintNode = null;
  if (hint) {
    hintNode = <Text style={[styles.taskFieldSelectHint, { color: theme.textSecondary }]}>{hint}</Text>;
  }

  return (
    <View style={styles.taskFieldBlock}>
      <Text style={[styles.taskFieldLabel, { color: theme.textSecondary }]}>{label}</Text>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          styles.taskFieldSelect,
          { backgroundColor: theme.surfaceMuted, borderColor: theme.border },
          getStyleWhen(pressed, { opacity: 0.82 }),
        ]}
      >
        <Text style={[styles.taskFieldSelectValue, { color: theme.textPrimary }]}>{value}</Text>
        {hintNode}
      </Pressable>
    </View>
  );
};

const BottomSheetPicker = ({
  visible,
  onClose,
  onConfirm,
  title,
  subtitle,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  leadingLabel = '',
  onLeadingPress,
  cardStyle,
  children,
}) => {
  const { theme } = useAppTheme();
  let leadingActionNode = <View style={styles.sheetActionSpacer} />;
  if (leadingLabel) {
    if (onLeadingPress) {
      leadingActionNode = (
        <Pressable
          onPress={onLeadingPress}
          style={({ pressed }) => [
            styles.sheetGhostAction,
            { backgroundColor: theme.secondaryBg, borderColor: theme.secondaryBorder },
            getStyleWhen(pressed, { opacity: 0.82 }),
          ]}
        >
          <Text style={[styles.sheetGhostActionText, { color: theme.secondaryText }]}>{leadingLabel}</Text>
        </Pressable>
      );
    }
  }

  let subtitleNode = null;
  if (subtitle) {
    subtitleNode = <Text style={[styles.sheetSubtitle, { color: theme.textSecondary }]}>{subtitle}</Text>;
  }

  return (
    <Modal
      transparent
      animationType="slide"
      visible={visible}
      onRequestClose={onClose}
    >
      <View style={styles.sheetOverlay}>
        <Pressable style={styles.sheetBackdrop} onPress={onClose} />
        <View
          style={[
            styles.sheetCard,
            { backgroundColor: theme.surface, borderColor: theme.border },
            cardStyle,
          ]}
        >
          <View style={[styles.sheetHandle, { backgroundColor: theme.borderSoft }]} />
          <View style={styles.sheetActionRow}>
            {leadingActionNode}

            <View style={styles.sheetActionRight}>
              <Pressable
                onPress={onClose}
                style={({ pressed }) => [
                  styles.sheetGhostAction,
                  { backgroundColor: theme.secondaryBg, borderColor: theme.secondaryBorder },
                  getStyleWhen(pressed, { opacity: 0.82 }),
                ]}
              >
                <Text style={[styles.sheetGhostActionText, { color: theme.secondaryText }]}>{cancelLabel}</Text>
              </Pressable>
              <Pressable
                onPress={onConfirm}
                style={({ pressed }) => [
                  styles.sheetPrimaryAction,
                  { backgroundColor: theme.primary },
                  getStyleWhen(pressed, { opacity: 0.82 }),
                ]}
              >
                <Text style={[styles.sheetPrimaryActionText, { color: theme.primaryText }]}>{confirmLabel}</Text>
              </Pressable>
            </View>
          </View>

          <Text style={[styles.sheetTitle, { color: theme.textPrimary }]}>{title}</Text>
          {subtitleNode}
          {children}
        </View>
      </View>
    </Modal>
  );
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
    const nowTs = Date.now();
    const leftMeta = getTaskSortMeta(left, nowTs);
    const rightMeta = getTaskSortMeta(right, nowTs);

    if (leftMeta.bucket !== rightMeta.bucket) {
      return leftMeta.bucket - rightMeta.bucket;
    }

    if (leftMeta.bucket === 2 || leftMeta.bucket === 4) {
      if (leftMeta.completionTs !== rightMeta.completionTs) {
        return rightMeta.completionTs - leftMeta.completionTs;
      }
    } else if (leftMeta.deadlineTs !== rightMeta.deadlineTs) {
      return leftMeta.deadlineTs - rightMeta.deadlineTs;
    }

    return String(left.title || '').localeCompare(String(right.title || ''));
  });
};

export default function CalendarScreen() {
  const { getToken, isLoaded: authLoaded, isSignedIn, userId } = useAuth();
  const { theme } = useAppTheme();
  const isDarkTheme = theme.mode === 'dark';
  const [schoolInput, setSchoolInput] = useState('');
  const [tokenInput, setTokenInput] = useState('');
  const [activeCanvasBaseUrl, setActiveCanvasBaseUrl] = useState('');
  const [activeCanvasToken, setActiveCanvasToken] = useState('');
  const [credentialsHydrated, setCredentialsHydrated] = useState(false);
  const [credentialLoadReady, setCredentialLoadReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const lastPersistedRef = useRef({ school: '', token: '' });
  const credentialDraftTouchedRef = useRef(false);
  const getTokenRef = useRef(getToken);

  const [profile, setProfile] = useState(null);
  const [courses, setCourses] = useState([]);
  const [events, setEvents] = useState([]);
  const [assignmentsByCourse, setAssignmentsByCourse] = useState({});
  const [expandedAssignmentsByCourse, setExpandedAssignmentsByCourse] = useState({});
  const [enrollmentsByCourse, setEnrollmentsByCourse] = useState({});
  const [submissionsByCourse, setSubmissionsByCourse] = useState({});
  const [submissionDetailsByAssignment, setSubmissionDetailsByAssignment] = useState({});
  const [lastSyncAt, setLastSyncAt] = useState(null);
  const [customTasks, setCustomTasks] = useState([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [tasksError, setTasksError] = useState('');
  const [tasksNotice, setTasksNotice] = useState('');
  const [checkinDateKeys, setCheckinDateKeys] = useState(() => new Set());
  const [checkinsError, setCheckinsError] = useState('');
  const [taskForm, setTaskForm] = useState(() => createEmptyTaskForm());
  const [taskSaving, setTaskSaving] = useState(false);
  const [taskDeletingId, setTaskDeletingId] = useState('');
  const [taskTogglingId, setTaskTogglingId] = useState('');
  const [editingTaskId, setEditingTaskId] = useState('');
  const [selectedPanel, setSelectedPanel] = useState('calendar');
  const [selectedView, setSelectedView] = useState('week');
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [selectedCalendarItem, setSelectedCalendarItem] = useState(null);
  const [calendarDetailVisible, setCalendarDetailVisible] = useState(false);
  const [taskDatePickerVisible, setTaskDatePickerVisible] = useState(false);
  const [taskDateDraft, setTaskDateDraft] = useState(() => new Date());
  const [taskDateMonthAnchor, setTaskDateMonthAnchor] = useState(() => new Date());
  const [timePickerVisible, setTimePickerVisible] = useState(false);
  const [activeTimeField, setActiveTimeField] = useState('dueTime');
  const [timeDraft, setTimeDraft] = useState(() => parseTimeDraft('18:00'));
  const [monthYearPickerVisible, setMonthYearPickerVisible] = useState(false);
  const [monthYearDraft, setMonthYearDraft] = useState(() => ({
    year: new Date().getFullYear(),
    month: new Date().getMonth(),
  }));
  const hourWheelRef = useRef(null);
  const minuteWheelRef = useRef(null);
  const meridiemWheelRef = useRef(null);

  const surfaceCardStyle = { backgroundColor: theme.surface, borderColor: theme.border };
  const softSurfaceCardStyle = { backgroundColor: theme.surfaceMuted, borderColor: theme.borderSoft };
  const secondaryButtonStyle = { backgroundColor: theme.secondaryBg, borderColor: theme.secondaryBorder };
  const secondaryButtonTextStyle = { color: theme.secondaryText };
  const primaryButtonStyle = { backgroundColor: theme.primary, borderColor: theme.primary };
  const primaryButtonTextStyle = { color: theme.primaryText };
  const heroCardStyle = { backgroundColor: theme.heroBg, borderColor: theme.heroBorder };
  const heroTitleTextStyle = { color: theme.textOnDark };
  const heroMutedTextStyle = { color: theme.textOnDarkMuted };
  const warningTextStyle = { color: isDarkTheme ? '#F0B36D' : '#B45309' };
  const errorTextStyle = { color: theme.dangerText };
  const emptyTextStyle = { color: theme.textSecondary };

  const draftBaseUrl = useMemo(() => buildBaseUrl(schoolInput), [schoolInput]);
  const isConnected = Boolean(profile) || courses.length > 0;
  let canPersistToBackend = false;
  if (API_BASE_URL) {
    if (authLoaded) {
      if (isSignedIn) {
        canPersistToBackend = true;
      }
    }
  }
  const hasTokenInput = Boolean(String(tokenInput || '').trim());
  const monthYearOptions = useMemo(() => {
    let centerYear = new Date().getFullYear();
    if (monthYearDraft) {
      centerYear = Number(monthYearDraft.year) || new Date().getFullYear();
    }
    return Array.from({ length: 9 }, (_, index) => centerYear - 4 + index);
  }, [monthYearDraft]);

  useEffect(() => {
    getTokenRef.current = getToken;
  }, [getToken]);

  useEffect(() => {
    if (!timePickerVisible) {
      return undefined;
    }

    const syncWheelPosition = (ref, options, nextValue) => {
      const index = Math.max(0, options.indexOf(nextValue));
      let currentRef = null;
      if (ref) {
        if (ref.current) {
          currentRef = ref.current;
        }
      }
      if (currentRef) {
        if (typeof currentRef.scrollTo === 'function') {
          currentRef.scrollTo({
            y: index * TIME_WHEEL_ITEM_HEIGHT,
            animated: false,
          });
        }
      }
    };

    const timer = setTimeout(() => {
      syncWheelPosition(hourWheelRef, HOUR_12_OPTIONS, timeDraft.hour12);
      syncWheelPosition(minuteWheelRef, MINUTE_OPTIONS, timeDraft.minute);
      syncWheelPosition(meridiemWheelRef, MERIDIEM_OPTIONS, timeDraft.meridiem);
    }, 0);

    return () => clearTimeout(timer);
  }, [timeDraft, timePickerVisible]);

  const getSessionToken = async () => {
    // Clerk session token may be briefly unavailable right after sign-in, so retry a few times.
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const getToken = getTokenRef.current;
      let token = '';
      if (typeof getToken === 'function') {
        token = await getToken();
      }
      if (token) {
        return token;
      }
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    return '';
  };

  const handleSchoolInputChange = (value) => {
    credentialDraftTouchedRef.current = true;
    setSchoolInput(value);
  };

  const handleTokenInputChange = (value) => {
    credentialDraftTouchedRef.current = true;
    setTokenInput(value);
  };

  const persistCredentialsToBackend = async (nextSchool, nextToken) => {
    // Keep one Canvas school/token pair per logged-in app account on our backend.
    const sessionToken = await getSessionToken();
    if (!sessionToken) {
      throw new Error('No Clerk session token available');
    }
    const response = await fetch(API_BASE_URL + '/canvas/credentials', {
      method: 'PUT',
      headers: {
        Authorization: 'Bearer ' + sessionToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        school: nextSchool,
        token: nextToken,
      }),
    });
    const data = await readJsonSafely(response);
    if (!response.ok) {
      throw new Error(
        getApiErrorMessage(data, 'Failed to save credentials (HTTP ' + String(response.status) + ')')
      );
    }
  };

  const removeSavedCanvasCredentialsFromBackend = async () => {
    if (!canPersistToBackend || !API_BASE_URL) {
      return;
    }

    const sessionToken = await getSessionToken();
    if (!sessionToken) {
      throw new Error('No Clerk session token available');
    }

    const response = await fetch(API_BASE_URL + '/canvas/credentials', {
      method: 'DELETE',
      headers: {
        Authorization: 'Bearer ' + sessionToken,
      },
    });
    const data = await readJsonSafely(response);
    if (!response.ok) {
      throw new Error(
        getApiErrorMessage(data, 'Failed to clear credentials (HTTP ' + String(response.status) + ')')
      );
    }
  };

  const clearHomePlanCacheForCurrentUser = async () => {
    if (!userId) {
      return;
    }

    const cacheKey = HOME_PLAN_CACHE_PREFIX + ':' + userId;
    const resetKey = HOME_PLAN_RESET_PREFIX + ':' + userId;

    try {
      await SecureStore.deleteItemAsync(cacheKey);
    } catch (_cacheDeleteError) {
      // Ignore cache delete errors.
    }

    try {
      await SecureStore.setItemAsync(resetKey, String(Date.now()));
    } catch (_resetWriteError) {
      // Ignore reset marker write errors.
    }
  };

  useEffect(() => {
    let mounted = true;
    setCredentialsHydrated(false);
    setCredentialLoadReady(false);

    if (!canPersistToBackend) {
      setCredentialsHydrated(true);
      return () => {
        mounted = false;
      };
    }

    (async () => {
      try {
        const sessionToken = await getSessionToken();
        if (!sessionToken) {
          throw new Error('No Clerk session token available yet');
        }
        const response = await fetch(API_BASE_URL + '/canvas/credentials', {
          headers: {
            Authorization: 'Bearer ' + sessionToken,
          },
        });
        const data = await readJsonSafely(response);
        if (!response.ok) {
          throw new Error(
            getApiErrorMessage(data, 'Failed to load saved credentials (HTTP ' + String(response.status) + ')')
          );
        }
        if (!mounted) {
          return;
        }
        const nextSchool = String(data.school || '');
        const nextToken = String(data.token || '');
        if (!credentialDraftTouchedRef.current) {
          setSchoolInput(nextSchool);
          setTokenInput(nextToken);
        }
        lastPersistedRef.current = {
          school: nextSchool.trim(),
          token: nextToken.trim(),
        };
        setError('');
      } catch (loadError) {
        if (mounted) {
          setError(
            'Failed to load saved token from backend: ' + getErrorMessage(
              loadError,
              'Unknown backend error'
            )
          );
        }
      } finally {
        if (mounted) {
          setCredentialsHydrated(true);
          setCredentialLoadReady(true);
        }
      }
    })();
    return () => {
      mounted = false;
    };
  }, [canPersistToBackend]);

  const fetchCustomTasks = async ({ silent = false } = {}) => {
    if (!canPersistToBackend || !API_BASE_URL) {
      return;
    }
    try {
      if (!silent) setTasksLoading(true);
      const sessionToken = await getSessionToken();
      if (!sessionToken) {
        throw new Error('No Clerk session token available');
      }
      const response = await fetch(API_BASE_URL + '/tasks', {
        headers: {
          Authorization: 'Bearer ' + sessionToken,
        },
      });
      const data = await readJsonSafely(response);
      if (!response.ok) {
        throw new Error(getApiErrorMessage(data, 'Failed to load tasks (HTTP ' + String(response.status) + ')'));
      }
      let items = [];
      if (Array.isArray(data.items)) {
        items = data.items;
      }
      setCustomTasks(sortTasks(items.map((item) => normalizeCustomTask(item, selectedDate))));
      setTasksError('');
    } catch (taskLoadError) {
      setTasksError(getErrorMessage(taskLoadError, 'Failed to load custom tasks.'));
    } finally {
      if (!silent) setTasksLoading(false);
    }
  };

  const fetchCheckinDates = async ({ silent = false } = {}) => {
    if (!canPersistToBackend || !API_BASE_URL) {
      return;
    }

    try {
      const sessionToken = await getSessionToken();
      if (!sessionToken) {
        throw new Error('No Clerk session token available');
      }

      const response = await fetch(API_BASE_URL + '/checkins/dates', {
        headers: {
          Authorization: 'Bearer ' + sessionToken,
        },
      });

      const data = await readJsonSafely(response);
      if (!response.ok) {
        throw new Error(
          getApiErrorMessage(
            data,
            'Failed to load check-in dates (HTTP ' + String(response.status) + ')'
          )
        );
      }

      const nextSet = new Set();
      let items = [];
      if (Array.isArray(data.items)) {
        items = data.items;
      }

      items.forEach((item) => {
        const rawText = String(item || '').trim();
        let key = '';

        if (/^\d{4}-\d{2}-\d{2}$/.test(rawText)) {
          key = rawText;
        } else if (/^\d{4}-\d{2}-\d{2}T/.test(rawText)) {
          key = rawText.slice(0, 10);
        } else {
          const parsedDate = new Date(rawText);
          if (!Number.isNaN(parsedDate.getTime())) {
            key = buildDateKey(parsedDate);
          }
        }

        if (/^\d{4}-\d{2}-\d{2}$/.test(key)) {
          nextSet.add(key);
        }
      });

      setCheckinDateKeys(nextSet);
      setCheckinsError('');
    } catch (checkinLoadError) {
      setCheckinsError(getErrorMessage(checkinLoadError, 'Failed to load check-in dates.'));
      if (!silent) {
        setCheckinDateKeys(new Set());
      }
    }
  };

  useEffect(() => {
    if (!canPersistToBackend) {
      setCustomTasks([]);
      setTasksError('');
      setCheckinDateKeys(new Set());
      setCheckinsError('');
      return;
    }
    fetchCustomTasks();
    fetchCheckinDates();
  }, [canPersistToBackend]);

  useFocusEffect(
    React.useCallback(() => {
      if (!canPersistToBackend) {
        return undefined;
      }

      fetchCustomTasks({ silent: true });
      fetchCheckinDates({ silent: true });
      return undefined;
    }, [canPersistToBackend])
  );

  const buildCanvasUrl = (pathOrUrl, resolvedBaseUrl = activeCanvasBaseUrl) => {
    if (/^https?:\/\//i.test(pathOrUrl)) {
      return pathOrUrl;
    }
    return resolvedBaseUrl + pathOrUrl;
  };

  const fetchCanvasPage = async (pathOrUrl, options = {}) => {
    const resolvedBaseUrl = options.baseUrl || activeCanvasBaseUrl;
    const resolvedToken = options.token || activeCanvasToken;
    if (!resolvedBaseUrl || !resolvedToken) {
      throw new Error('Connect Canvas first.');
    }
    const response = await fetch(buildCanvasUrl(pathOrUrl, resolvedBaseUrl), {
      headers: {
        Authorization: 'Bearer ' + resolvedToken,
        Accept: 'application/json',
      },
    });

    const data = await readJsonSafely(response);

    if (!response.ok) {
      const message = getApiErrorMessage(data, response.statusText);
      throw new Error(String(response.status) + ' ' + message);
    }

    const links = parseLinkHeader(response.headers.get('Link'));
    return { data, nextUrl: links.next || '' };
  };

  const fetchCanvasPaged = async (path, options = {}) => {
    let nextUrl = path;
    const aggregated = [];
    const visited = new Set();

    while (nextUrl) {
      if (visited.has(nextUrl)) break;
      visited.add(nextUrl);

      const { data, nextUrl: newNextUrl } = await fetchCanvasPage(nextUrl, options);
      if (!Array.isArray(data)) {
        return data;
      }

      aggregated.push(...data);
      nextUrl = newNextUrl;
    }

    return aggregated;
  };

  const fetchCanvasObject = async (path, options = {}) => {
    const { data } = await fetchCanvasPage(path, options);
    return data;
  };

  const openUrl = async (url) => {
    if (!url) {
      return;
    }
    try {
      await Linking.openURL(url);
    } catch (linkError) {
      setError('Cannot open this Canvas URL on the current device.');
    }
  };

  const clearSyncedCanvasState = (seedDate = new Date()) => {
    credentialDraftTouchedRef.current = false;
    lastPersistedRef.current = { school: '', token: '' };
    setActiveCanvasBaseUrl('');
    setActiveCanvasToken('');
    setProfile(null);
    setCourses([]);
    setEvents([]);
    setAssignmentsByCourse({});
    setExpandedAssignmentsByCourse({});
    setEnrollmentsByCourse({});
    setSubmissionsByCourse({});
    setSubmissionDetailsByAssignment({});
    setEditingTaskId('');
    setTaskDeletingId('');
    setTaskTogglingId('');
    setError('');
    setLastSyncAt(null);
    setSelectedPanel('calendar');
    setSelectedView('week');
    setSelectedDate(seedDate);
    setTaskForm(createEmptyTaskForm(seedDate));
    setTaskDateDraft(seedDate);
    setTaskDateMonthAnchor(seedDate);
    setTaskDatePickerVisible(false);
    setTimePickerVisible(false);
    setMonthYearPickerVisible(false);
    setTimeDraft(parseTimeDraft('18:00'));
    setMonthYearDraft({
      year: seedDate.getFullYear(),
      month: seedDate.getMonth(),
    });
    setSelectedCalendarItem(null);
    setCalendarDetailVisible(false);
  };

  const clearLocalCanvasState = () => {
    const today = new Date();
    clearSyncedCanvasState(today);
    setSchoolInput('');
    setTokenInput('');
  };

  const handleClear = async () => {
    try {
      if (!canPersistToBackend) {
        clearLocalCanvasState();
        return;
      }
      await removeSavedCanvasCredentialsFromBackend();
      await clearHomePlanCacheForCurrentUser();
      clearLocalCanvasState();
    } catch (clearError) {
      setError(
        'Failed to clear saved token from backend: ' + getErrorMessage(
          clearError,
          'Unknown backend error'
        )
      );
    }
  };

  const fetchSingleSubmissionDetail = async (courseId, assignmentId) => {
    const params = new URLSearchParams();
    params.append('include[]', 'submission_comments');
    params.append('include[]', 'submission_history');
    return fetchCanvasObject(
      '/api/v1/courses/' + courseId + '/assignments/' + assignmentId + '/submissions/self?' + params.toString()
    );
  };

  const handleToggleSubmissionDetail = async (courseId, assignmentId) => {
    const detailKey = buildAssignmentDetailKey(courseId, assignmentId);
    const current = submissionDetailsByAssignment[detailKey] || {};

    if (current.expanded) {
      setSubmissionDetailsByAssignment((prev) => ({
        ...prev,
        [detailKey]: {
          ...current,
          expanded: false,
        },
      }));
      return;
    }

    if (current.data) {
      if (!current.error) {
        setSubmissionDetailsByAssignment((prev) => ({
          ...prev,
          [detailKey]: {
            ...current,
            expanded: true,
          },
        }));
        return;
      }
    }

    setSubmissionDetailsByAssignment((prev) => ({
      ...prev,
      [detailKey]: {
        ...current,
        expanded: true,
        loading: true,
        error: '',
      },
    }));

    try {
      const detail = await fetchSingleSubmissionDetail(courseId, assignmentId);
      setSubmissionDetailsByAssignment((prev) => ({
        ...prev,
        [detailKey]: {
          expanded: true,
          loading: false,
          error: '',
          data: detail,
        },
      }));
    } catch (detailError) {
      let detailErrorMessage = 'Failed to load submission detail.';
      if (detailError instanceof Error) {
        detailErrorMessage = detailError.message;
      }
      setSubmissionDetailsByAssignment((prev) => ({
        ...prev,
        [detailKey]: {
          ...prev[detailKey],
          expanded: true,
          loading: false,
          error: detailErrorMessage,
        },
      }));
    }
  };

  const handleConnect = async () => {
    const nextSchool = schoolInput.trim();
    const nextToken = tokenInput.trim();
    const nextBaseUrl = buildBaseUrl(nextSchool);
    if (!nextBaseUrl || !nextToken) {
      setError('Please fill in school name and access token first.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const connectionOptions = {
        baseUrl: nextBaseUrl,
        token: nextToken,
      };
      const [profileData, coursesData, eventsData] = await Promise.all([
        fetchCanvasObject('/api/v1/users/self/profile', connectionOptions),
        fetchCanvasPaged(
          '/api/v1/courses?enrollment_type=student&enrollment_state=active&include[]=term&per_page=' + String(PAGE_SIZE),
          connectionOptions
        ),
        fetchCanvasPaged('/api/v1/users/self/upcoming_events?per_page=' + String(PAGE_SIZE), connectionOptions),
      ]);

      let safeCourses = [];
      let safeEvents = [];
      if (Array.isArray(coursesData)) {
        safeCourses = coursesData;
      }
      if (Array.isArray(eventsData)) {
        safeEvents = eventsData;
      }

      const perCoursePayload = await Promise.all(
        safeCourses.map(async (course) => {
          const courseId = String(course.id);
          try {
            const [enrollmentList, assignmentList, submissionList] = await Promise.all([
              fetchCanvasPaged(
                '/api/v1/courses/' + courseId + '/enrollments?user_id=self&type[]=StudentEnrollment&state[]=active&include[]=current_points&per_page=' + String(PAGE_SIZE),
                connectionOptions
              ),
              fetchCanvasPaged(
                '/api/v1/courses/' + courseId + '/assignments?per_page=' + String(PAGE_SIZE),
                connectionOptions
              ),
              fetchCanvasPaged(
                '/api/v1/courses/' + courseId + '/students/submissions?student_ids[]=self&include[]=assignment&per_page=' + String(PAGE_SIZE),
                connectionOptions
              ),
            ]);

            let safeEnrollments = [];
            if (Array.isArray(enrollmentList)) {
              safeEnrollments = enrollmentList;
            }
            let safeAssignments = [];
            if (Array.isArray(assignmentList)) {
              safeAssignments = assignmentList;
            }
            let safeSubmissions = [];
            if (Array.isArray(submissionList)) {
              safeSubmissions = submissionList;
            }

            return {
              courseId,
              enrollments: safeEnrollments,
              assignments: safeAssignments,
              submissions: safeSubmissions,
            };
          } catch (courseError) {
            return {
              courseId,
              enrollments: [],
              assignments: [],
              submissions: [],
            };
          }
        })
      );

      const assignmentsMap = {};
      const enrollmentsMap = {};
      const submissionsMap = {};

      perCoursePayload.forEach((entry) => {
        const courseId = entry.courseId;
        const sortedAssignments = entry.assignments.slice().sort(sortByDueAt);
        assignmentsMap[courseId] = {
          items: sortedAssignments,
        };

        const enrollment = entry.enrollments[0] || null;
        enrollmentsMap[courseId] = enrollment;

        const latestByAssignment = pickLatestSubmissions(entry.submissions);
        const latestSubmissions = Object.values(latestByAssignment);

        const assignmentCount = sortedAssignments.length;
        const submittedCount = latestSubmissions.filter((item) => isSubmissionSubmitted(item)).length;
        const onTimeCount = latestSubmissions.filter((item) => isSubmissionOnTime(item)).length;
        let completionRate = null;
        if (assignmentCount > 0) {
          completionRate = submittedCount / assignmentCount;
        }
        let onTimeRate = null;
        if (submittedCount > 0) {
          onTimeRate = onTimeCount / submittedCount;
        }

        submissionsMap[courseId] = {
          items: latestSubmissions,
          byAssignment: latestByAssignment,
          summary: {
            assignmentCount,
            submittedCount,
            completionRate,
            onTimeRate,
          },
        };
      });

      const normalizedEvents = safeEvents
        .map((item, index) => normalizeUpcomingEvent(item, index))
        .sort((a, b) => {
          const leftMissing = !a.date;
          const rightMissing = !b.date;
          if (leftMissing) {
            if (rightMissing) {
              return 0;
            }
            return 1;
          }
          if (rightMissing) {
            return -1;
          }
          const leftTime = new Date(a.date).getTime();
          const rightTime = new Date(b.date).getTime();
          if (leftTime < rightTime) {
            return -1;
          }
          if (leftTime > rightTime) {
            return 1;
          }
          return 0;
        });

      const today = new Date();
      credentialDraftTouchedRef.current = false;
      setActiveCanvasBaseUrl(nextBaseUrl);
      setActiveCanvasToken(nextToken);
      setProfile(profileData || null);
      setCourses(safeCourses);
      setEvents(normalizedEvents);
      setAssignmentsByCourse(assignmentsMap);
      setExpandedAssignmentsByCourse({});
      setEnrollmentsByCourse(enrollmentsMap);
      setSubmissionsByCourse(submissionsMap);
      setSubmissionDetailsByAssignment({});
      setLastSyncAt(new Date());
      setSelectedPanel('calendar');
      setSelectedView('week');
      setSelectedDate(today);
      setEditingTaskId('');
      setTaskForm(createEmptyTaskForm(today));
      setTaskDateDraft(today);
      setTaskDateMonthAnchor(today);
      setMonthYearDraft({
        year: today.getFullYear(),
        month: today.getMonth(),
      });
      if (canPersistToBackend) {
        try {
          await persistCredentialsToBackend(nextSchool, nextToken);
          lastPersistedRef.current = {
            school: nextSchool,
            token: nextToken,
          };
        } catch (persistError) {
          setError(
            'Connected to Canvas, but failed to save token: ' + getErrorMessage(
              persistError,
              'Unknown backend error'
            )
          );
        }
      }
    } catch (err) {
      const message = getErrorMessage(err, 'Connection failed. Check network and token.');
      const normalizedMessage = String(message || '').toLowerCase();

      if (normalizedMessage.includes('401')) {
        if (normalizedMessage.includes('invalid access token')) {
          try {
            await removeSavedCanvasCredentialsFromBackend();
          } catch (_removeError) {
            // Best effort only. Keep the original Canvas error visible.
          }
          await clearHomePlanCacheForCurrentUser();
          clearSyncedCanvasState(new Date());
          setSchoolInput(nextSchool);
          setTokenInput('');
          setError(
            'Canvas rejected this token (401 Invalid access token). The saved token was cleared. Paste a new Canvas token and try again.'
          );
        } else {
          setError('Connection failed: ' + message);
        }
      } else {
        setError('Connection failed: ' + message);
      }
    } finally {
      setLoading(false);
    }
  };

  const resetTaskComposer = (seedDate = selectedDate) => {
    setEditingTaskId('');
    setTaskForm(createEmptyTaskForm(seedDate));
    setTaskDatePickerVisible(false);
    setTimePickerVisible(false);
  };

  const handleTaskFieldChange = (field, value) => {
    setTaskForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  useEffect(() => {
    if (editingTaskId) {
      return;
    }
    const nextDate = formatInputDate(selectedDate);
    setTaskForm((prev) => {
      if (prev.taskDate === nextDate) {
        return prev;
      }
      return {
        ...prev,
        taskDate: nextDate,
      };
    });
  }, [editingTaskId, selectedDate]);

  const openTaskDatePicker = () => {
    const baseDate = parseDateInput(taskForm.taskDate) || startOfDay(selectedDate) || new Date();
    setTaskDateDraft(baseDate);
    setTaskDateMonthAnchor(baseDate);
    setTaskDatePickerVisible(true);
  };

  const confirmTaskDatePicker = () => {
    handleTaskFieldChange('taskDate', formatInputDate(taskDateDraft));
    setTaskDatePickerVisible(false);
  };

  const openTimePicker = (field) => {
    const defaults = {
      dueTime: '18:00',
      startTime: '09:00',
      endTime: '10:00',
    };
    setActiveTimeField(field);
    let currentValue = '';
    if (taskForm) {
      if (field) {
        currentValue = taskForm[field];
      }
    }
    setTimeDraft(parseTimeDraft(currentValue || defaults[field] || '18:00'));
    setTimePickerVisible(true);
  };

  const confirmTimePicker = () => {
    handleTaskFieldChange(activeTimeField, formatTimeDraftToValue(timeDraft));
    setTimePickerVisible(false);
  };

  const openMonthYearPicker = () => {
    const baseDate = toSafeDate(selectedDate) || new Date();
    setMonthYearDraft({
      year: baseDate.getFullYear(),
      month: baseDate.getMonth(),
    });
    setMonthYearPickerVisible(true);
  };

  const confirmMonthYearPicker = () => {
    setSelectedDate(clampDateToMonthYear(selectedDate, monthYearDraft.year, monthYearDraft.month));
    setMonthYearPickerVisible(false);
  };

  const buildTaskPayload = () => {
    const payload = {
      title: taskForm.title.trim(),
      taskDate: taskForm.taskDate.trim(),
      timingMode: taskForm.timingMode,
      dueTime: taskForm.dueTime.trim(),
      startTime: taskForm.startTime.trim(),
      endTime: taskForm.endTime.trim(),
      isCompleted: false,
    };

    if (!payload.title) {
      throw new Error('Task title is required');
    }
    if (!isValidDateInput(payload.taskDate)) {
      throw new Error('Choose a task date');
    }
    if (payload.timingMode === 'deadline') {
      if (!isQuarterHourTimeInput(payload.dueTime)) {
        throw new Error('Choose a due time using 00, 15, 30, or 45 minutes');
      }
      return {
        ...payload,
        startTime: '',
        endTime: '',
      };
    }
    if (!isQuarterHourTimeInput(payload.startTime) || !isQuarterHourTimeInput(payload.endTime)) {
      throw new Error('Choose start and end times using 00, 15, 30, or 45 minutes');
    }
    if (payload.endTime <= payload.startTime) {
      throw new Error('End time must be later than start time');
    }
    return {
      ...payload,
      dueTime: '',
    };
  };

  const saveTaskToBackend = async (taskId, payload) => {
    const sessionToken = await getSessionToken();
    if (!sessionToken) {
      throw new Error('No Clerk session token available');
    }
    let requestUrl = API_BASE_URL + '/tasks';
    if (taskId) {
      requestUrl = API_BASE_URL + '/tasks/' + String(taskId);
    }
    let requestMethod = 'POST';
    if (taskId) {
      requestMethod = 'PUT';
    }
    const response = await fetch(
      requestUrl,
      {
        method: requestMethod,
        headers: {
          Authorization: 'Bearer ' + sessionToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      }
    );
    const data = await readJsonSafely(response);
    if (!response.ok) {
      throw new Error(getApiErrorMessage(data, 'Failed to save task (HTTP ' + String(response.status) + ')'));
    }
    return data;
  };

  const handleSubmitTask = async () => {
    if (!canPersistToBackend || !API_BASE_URL) {
      setTasksError('Task storage requires backend auth and EXPO_PUBLIC_API_URL.');
      return;
    }

    try {
      setTaskSaving(true);
      const payload = buildTaskPayload();
      const existingTask = customTasks.find((item) => String(item.id) === String(editingTaskId));
      let existingTaskCompleted = false;
      if (existingTask) {
        existingTaskCompleted = existingTask.isCompleted;
      }
      const saveResponse = await saveTaskToBackend(editingTaskId, {
        ...payload,
        isCompleted: existingTaskCompleted,
      });
      const savedTask = saveResponse.item || null;
      let normalizedSavedTask = null;
      if (savedTask) {
        normalizedSavedTask = normalizeCustomTask(savedTask, selectedDate);
      }
      await clearHomePlanCacheForCurrentUser();
      await fetchCustomTasks({ silent: true });
      setTasksError('');
      setTasksNotice('');
      let resetDate = selectedDate;
      if (normalizedSavedTask) {
        if (normalizedSavedTask.taskDate) {
          resetDate = parseDateInput(normalizedSavedTask.taskDate) || selectedDate;
        }
      }
      resetTaskComposer(
        resetDate
      );
      setSelectedPanel('calendar');
      setSelectedView('week');
      if (normalizedSavedTask) {
        if (normalizedSavedTask.taskDate) {
          const nextSelectedDate = toSafeDate(buildTaskDateTimeIso(normalizedSavedTask));
          if (nextSelectedDate) setSelectedDate(nextSelectedDate);
        }
      }
    } catch (taskSaveError) {
      if (taskSaveError instanceof Error) {
        setTasksError(taskSaveError.message);
      } else {
        setTasksError('Failed to save task.');
      }
    } finally {
      setTaskSaving(false);
    }
  };

  const handleEditTask = (task) => {
    const safeTask = task || {};
    const normalizedTask = normalizeCustomTask(task, selectedDate);
    setEditingTaskId(String(safeTask.id || ''));
    setTaskForm({
      title: String(normalizedTask.title || ''),
      taskDate: normalizedTask.taskDate,
      timingMode: normalizedTask.timingMode,
      dueTime: normalizedTask.dueTime,
      startTime: normalizedTask.startTime,
      endTime: normalizedTask.endTime,
    });
    setTasksError('');
    setTasksNotice('');
  };

  const handleToggleTaskCompletion = async (task) => {
    const safeTask = task || {};
    if (!safeTask.id) {
      return;
    }

    try {
      setTaskTogglingId(String(safeTask.id));
      let timingMode = 'deadline';
      if (safeTask.timingMode === 'range') {
        timingMode = 'range';
      }
      const payload = {
        title: String(safeTask.title || '').trim(),
        taskDate: String(safeTask.taskDate || '').trim(),
        timingMode,
        dueTime: String(safeTask.dueTime || '').trim(),
        startTime: String(safeTask.startTime || '').trim(),
        endTime: String(safeTask.endTime || '').trim(),
        isCompleted: !safeTask.isCompleted,
      };
      const saveResponse = await saveTaskToBackend(safeTask.id, payload);
      await clearHomePlanCacheForCurrentUser();
      await fetchCustomTasks({ silent: true });
      setTasksError('');
      if (payload.isCompleted) {
        const rewardPopupMessage = getTaskRewardPopupMessage(saveResponse.rewardResult);
        if (rewardPopupMessage) {
          setTasksNotice('');
          Alert.alert('Task reward', rewardPopupMessage);
        } else {
          setTasksNotice(getTaskRewardNoticeText(saveResponse.rewardResult));
        }
      } else {
        setTasksNotice('');
      }
    } catch (toggleError) {
      if (toggleError instanceof Error) {
        setTasksError(toggleError.message);
      } else {
        setTasksError('Failed to update task.');
      }
    } finally {
      setTaskTogglingId('');
    }
  };

  const handleDeleteTask = async (taskId) => {
    if (!taskId) {
      return;
    }
    try {
      setTaskDeletingId(String(taskId));
      const sessionToken = await getSessionToken();
      if (!sessionToken) {
        throw new Error('No Clerk session token available');
      }
      const response = await fetch(API_BASE_URL + '/tasks/' + String(taskId), {
        method: 'DELETE',
        headers: {
          Authorization: 'Bearer ' + sessionToken,
        },
      });
      const data = await readJsonSafely(response);
      if (!response.ok) {
        throw new Error(getApiErrorMessage(data, 'Failed to delete task (HTTP ' + String(response.status) + ')'));
      }
      await clearHomePlanCacheForCurrentUser();
      setCustomTasks((prev) => prev.filter((item) => String(item.id) !== String(taskId)));
      if (String(editingTaskId) === String(taskId)) {
        resetTaskComposer(selectedDate);
      }
      setTasksError('');
      setTasksNotice('');
    } catch (deleteError) {
      if (deleteError instanceof Error) {
        setTasksError(deleteError.message);
      } else {
        setTasksError('Failed to delete task.');
      }
    } finally {
      setTaskDeletingId('');
    }
  };

  const calendarFeed = useMemo(() => {
    // Merge Canvas items and custom tasks into one timeline for day/week/month views.
    const merged = [];
    const seen = new Set();

    const pushItem = (item) => {
      const safeItem = item || {};
      const date = toSafeDate(safeItem.date);
      if (!date) {
        return;
      }
      const dedupeKey = [
        String(safeItem.htmlUrl || ''),
        String(safeItem.title || ''),
        String(safeItem.course || ''),
        date.toISOString(),
      ].join('|');
      if (seen.has(dedupeKey)) {
        return;
      }
      seen.add(dedupeKey);
      merged.push({
        ...safeItem,
        date: date.toISOString(),
      });
    };

    events.forEach((event) => {
      const safeEvent = event || {};
      pushItem({
        id: 'event-' + String(safeEvent.id || ''),
        title: safeEvent.title || 'Untitled event',
        course: safeEvent.course || '',
        source: 'event',
        type: safeEvent.type || 'event',
        status: 'Calendar item',
        htmlUrl: safeEvent.htmlUrl || '',
        date: safeEvent.date,
        accent: pickPreviewAccent(safeEvent.course || safeEvent.type || safeEvent.id),
      });
    });

    courses.forEach((course) => {
      const safeCourse = course || {};
      const courseId = String(safeCourse.id || '');
      const courseName = safeCourse.name || safeCourse.course_code || 'Untitled course';
      const assignmentEntry = assignmentsByCourse[courseId] || {};
      const submissionEntry = submissionsByCourse[courseId] || {};
      let assignments = [];
      if (Array.isArray(assignmentEntry.items)) {
        assignments = assignmentEntry.items;
      }
      const submissionLookup = submissionEntry.byAssignment || {};

      assignments.forEach((assignment) => {
        const safeAssignment = assignment || {};
        const submission = submissionLookup[String(safeAssignment.id)] || null;
        const safeSubmission = submission || {};
        let submissionStatus = 'To do';
        if (safeSubmission.submitted_at) {
          submissionStatus = 'Submitted';
        }
        pushItem({
          id: 'assignment-' + courseId + '-' + String(safeAssignment.id || ''),
          title: safeAssignment.name || 'Untitled assignment',
          course: courseName,
          source: 'assignment',
          courseId,
          assignmentId: String(safeAssignment.id || ''),
          type: 'assignment',
          status: submissionStatus,
          htmlUrl: safeAssignment.html_url || '',
          date: safeAssignment.due_at,
          accent: pickPreviewAccent(courseId || courseName),
          score: safeSubmission.score,
          pointsPossible: safeAssignment.points_possible,
          submittedAt: safeSubmission.submitted_at || '',
          late: Boolean(safeSubmission.late),
        });
      });
    });

    customTasks.forEach((task) => {
      const safeTask = task || {};
      let taskType = 'deadline';
      if (safeTask.timingMode === 'range') {
        taskType = 'time range';
      }
      let taskStatus = 'To do';
      if (safeTask.isCompleted) {
        taskStatus = 'Completed';
      }
      let normalizedTimingMode = 'deadline';
      if (safeTask.timingMode === 'range') {
        normalizedTimingMode = 'range';
      }
      pushItem({
        id: 'custom-task-' + String(safeTask.id || ''),
        title: safeTask.title || 'Untitled task',
        course: 'My task',
        source: 'customTask',
        taskId: String(safeTask.id || ''),
        type: taskType,
        status: taskStatus,
        htmlUrl: '',
        date: buildTaskDateTimeIso(safeTask),
        accent: pickPreviewAccent('custom-' + String(safeTask.timingMode || 'deadline')),
        completed: Boolean(safeTask.isCompleted),
        taskDate: String(safeTask.taskDate || ''),
        dueTime: String(safeTask.dueTime || ''),
        startTime: String(safeTask.startTime || ''),
        endTime: String(safeTask.endTime || ''),
        timingMode: normalizedTimingMode,
      });
    });

    return merged.sort((left, right) => new Date(left.date) - new Date(right.date));
  }, [events, courses, assignmentsByCourse, submissionsByCourse, customTasks]);

  const dateMarkersByDate = useMemo(() => {
    const base = calendarFeed.reduce((acc, item) => {
      const key = buildDateKey(item.date);
      if (!key) {
        return acc;
      }

      const current = acc[key] || {
        count: 0,
        hasCanvas: false,
        hasCustom: false,
        hasCheckin: false,
      };

      current.count += 1;
      if (item) {
        if (item.source === 'customTask') {
          current.hasCustom = true;
        } else {
          current.hasCanvas = true;
        }
      }

      acc[key] = current;
      return acc;
    }, {});

    checkinDateKeys.forEach((key) => {
      const current = base[key] || {
        count: 0,
        hasCanvas: false,
        hasCustom: false,
        hasCheckin: false,
      };
      current.hasCheckin = true;
      base[key] = current;
    });

    return base;
  }, [calendarFeed, checkinDateKeys]);

  const selectedDayItems = useMemo(
    () => calendarFeed.filter((item) => isSameDay(item.date, selectedDate)),
    [calendarFeed, selectedDate]
  );

  const weekStart = useMemo(() => startOfWeek(selectedDate) || startOfWeek(new Date()), [selectedDate]);
  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)),
    [weekStart]
  );

  const monthItems = useMemo(
    () =>
      calendarFeed.filter((item) => {
        const date = toSafeDate(item.date);
        if (!date) {
          return false;
        }
        if (date.getFullYear() !== selectedDate.getFullYear()) {
          return false;
        }
        if (date.getMonth() !== selectedDate.getMonth()) {
          return false;
        }
        return true;
      }),
    [calendarFeed, selectedDate]
  );

  const weekGridItems = useMemo(() => {
    const grid = {};
    const weekEnd = addDays(weekStart, 7);

    calendarFeed.forEach((item) => {
      const date = toSafeDate(item.date);
      if (!date || !weekStart || !weekEnd) {
        return;
      }
      if (date < weekStart || date >= weekEnd) {
        return;
      }

      const hour = Math.min(Math.max(date.getHours(), WEEK_HOUR_START), WEEK_HOUR_END);
      const key = String(date.getDay()) + '-' + String(hour);
      if (!grid[key]) grid[key] = [];
      grid[key].push(item);
    });

    Object.keys(grid).forEach((key) => {
      grid[key].sort((left, right) => new Date(left.date) - new Date(right.date));
    });

    return grid;
  }, [calendarFeed, weekStart]);

  const nextUpcomingItem = useMemo(() => {
    const now = Date.now();
    return (
      calendarFeed.find(
        (item) => {
          const safeItem = item || {};
          if (safeItem.completed) {
            return false;
          }
          const itemTime = new Date(safeItem.date).getTime();
          if (itemTime < now) {
            return false;
          }
          return true;
        }
      ) || null
    );
  }, [calendarFeed]);

  const safeSelectedCalendarItem = selectedCalendarItem || null;
  let selectedCalendarDetailKey = '';
  if (safeSelectedCalendarItem) {
    if (safeSelectedCalendarItem.source === 'assignment') {
      if (safeSelectedCalendarItem.courseId) {
        if (safeSelectedCalendarItem.assignmentId) {
          selectedCalendarDetailKey = buildAssignmentDetailKey(
            safeSelectedCalendarItem.courseId,
            safeSelectedCalendarItem.assignmentId
          );
        }
      }
    }
  }
  let selectedCalendarDetailState = {};
  if (selectedCalendarDetailKey) {
    selectedCalendarDetailState = submissionDetailsByAssignment[selectedCalendarDetailKey] || {};
  }
  const selectedCalendarDetailData = selectedCalendarDetailState.data || null;
  let lastSyncNode = null;
  if (lastSyncAt) {
    lastSyncNode = (
      <Text style={[styles.sync, { color: theme.textSecondary }]}>
        Last sync:
        {' '}
        {lastSyncAt.toLocaleString()}
      </Text>
    );
  }
  const selectedCalendarTeacherComments = useMemo(() => {
    if (!selectedCalendarDetailData) {
      return [];
    }
    let detailComments = [];
    if (Array.isArray(selectedCalendarDetailData.submission_comments)) {
      detailComments = selectedCalendarDetailData.submission_comments;
    }
    const safeProfile = profile || {};
    let currentUserId = '';
    if (safeProfile.id === null || safeProfile.id === undefined) {
      currentUserId = '';
    } else {
      currentUserId = String(safeProfile.id);
    }
    return detailComments.filter(
      (comment) => {
        const safeComment = comment || {};
        let authorId = '';
        if (safeComment.author_id !== undefined) {
          authorId = safeComment.author_id;
        }
        return (
          !currentUserId ||
          String(authorId) !== currentUserId
        );
      }
    );
  }, [profile, selectedCalendarDetailData]);
  let selectedCalendarDetailNode = null;
  if (safeSelectedCalendarItem) {
    let assignmentDetailSectionNode = null;
    if (safeSelectedCalendarItem.source === 'assignment') {
      let teacherCommentsNode = null;
      if (selectedCalendarDetailState.loading) {
        teacherCommentsNode = (
          <Text style={styles.detailMuted}>Loading submission detail...</Text>
        );
      } else if (selectedCalendarDetailState.error) {
        teacherCommentsNode = (
          <Text style={styles.detailError}>
            Failed to load detail: {selectedCalendarDetailState.error}
          </Text>
        );
      } else if (selectedCalendarTeacherComments.length === 0) {
        teacherCommentsNode = (
          <Text style={styles.detailMuted}>No teacher comments yet.</Text>
        );
      } else {
        teacherCommentsNode = selectedCalendarTeacherComments.map((comment, index) => (
          <View
            key={'calendar-detail-comment-' + String((comment || {}).id || index)}
            style={styles.detailRow}
          >
            <Text style={styles.detailMeta}>
              {formatDateTime((comment || {}).created_at)}
            </Text>
            <Text style={styles.detailText}>
              {(comment || {}).comment || 'No comment text'}
            </Text>
          </View>
        ));
      }

      assignmentDetailSectionNode = (
        <>
          <View style={styles.detailRow}>
            <Text style={styles.detailMeta}>Score</Text>
            <Text style={styles.detailText}>
              {formatScoreValue(
                safeSelectedCalendarItem.score,
                safeSelectedCalendarItem.pointsPossible
              )}
            </Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailMeta}>Submitted</Text>
            <Text style={styles.detailText}>
              {getTextWhen(
                safeSelectedCalendarItem.submittedAt,
                formatDateTime(safeSelectedCalendarItem.submittedAt),
                'Not submitted'
              )}
            </Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailMeta}>Late</Text>
            <Text style={styles.detailText}>
              {getYesNoText(safeSelectedCalendarItem.late)}
            </Text>
          </View>
          <Text style={styles.detailHeading}>Teacher comments</Text>
          {teacherCommentsNode}
        </>
      );
    }

    let customTaskNoteNode = null;

    selectedCalendarDetailNode = (
      <View style={styles.sheetDetailPanel}>
        <View style={styles.detailRow}>
          <Text style={styles.detailMeta}>Type</Text>
          <Text style={styles.detailText}>{getCalendarDetailTypeLabel(safeSelectedCalendarItem)}</Text>
        </View>

        <View style={styles.detailRow}>
          <Text style={styles.detailMeta}>Course</Text>
          <Text style={styles.detailText}>{safeSelectedCalendarItem.course || 'Canvas'}</Text>
        </View>

        <View style={styles.detailRow}>
          <Text style={styles.detailMeta}>Status</Text>
          <Text style={styles.detailText}>{safeSelectedCalendarItem.status || 'N/A'}</Text>
        </View>

        <View style={styles.detailRow}>
          <Text style={styles.detailMeta}>Schedule</Text>
          <Text style={styles.detailText}>{formatCalendarDetailSchedule(safeSelectedCalendarItem)}</Text>
        </View>

        {assignmentDetailSectionNode}
        {customTaskNoteNode}
      </View>
    );
  }

  const changeCalendarWindow = (direction) => {
    const offsetByView = {
      day: 1,
      week: 7,
      month: 30,
    };
    const nextDate = addDays(selectedDate, direction * (offsetByView[selectedView] || 7));
    if (nextDate) setSelectedDate(nextDate);
  };

  const changeMiniCalendarMonth = (direction) => {
    const nextDate = addMonths(selectedDate, direction);
    if (nextDate) setSelectedDate(nextDate);
  };
  const showTaskSection = selectedPanel === 'overview';
  const safeProfile = profile || {};
  let currentProfileId = '';
  if (safeProfile.id === null || safeProfile.id === undefined) {
    currentProfileId = '';
  } else {
    currentProfileId = String(safeProfile.id);
  }
  let selectedCalendarDetailSubtitle = '';
  if (safeSelectedCalendarItem) {
    selectedCalendarDetailSubtitle = formatDateTime(safeSelectedCalendarItem.date);
  }
  let selectedCalendarDetailTitle = 'Task detail';
  if (safeSelectedCalendarItem) {
    if (safeSelectedCalendarItem.title) {
      selectedCalendarDetailTitle = safeSelectedCalendarItem.title;
    }
  }

  const openCalendarItemDetail = async (item) => {
    const safeItem = item || null;
    setSelectedCalendarItem(safeItem);
    setCalendarDetailVisible(true);

    if (
      !safeItem ||
      safeItem.source !== 'assignment' ||
      !safeItem.courseId ||
      !safeItem.assignmentId
    ) {
      return;
    }

    const detailKey = buildAssignmentDetailKey(safeItem.courseId, safeItem.assignmentId);
    const current = submissionDetailsByAssignment[detailKey] || {};
    if (current.data || current.loading) {
      return;
    }

    setSubmissionDetailsByAssignment((prev) => ({
      ...prev,
      [detailKey]: {
        ...current,
        expanded: false,
        loading: true,
        error: '',
      },
    }));

    try {
      const detail = await fetchSingleSubmissionDetail(safeItem.courseId, safeItem.assignmentId);
      setSubmissionDetailsByAssignment((prev) => ({
        ...prev,
        [detailKey]: {
          ...prev[detailKey],
          loading: false,
          error: '',
          data: detail,
        },
      }));
    } catch (detailError) {
      let detailErrorMessage = 'Failed to load submission detail.';
      if (detailError instanceof Error) {
        detailErrorMessage = detailError.message;
      }
      setSubmissionDetailsByAssignment((prev) => ({
        ...prev,
        [detailKey]: {
          ...prev[detailKey],
          loading: false,
          error: detailErrorMessage,
        },
      }));
    }
  };

  let connectButtonContentNode = (
    <Text style={[styles.primaryBtnText, primaryButtonTextStyle]}>
      {getCanvasConnectButtonText(isConnected)}
    </Text>
  );
  if (loading) {
    connectButtonContentNode = <ActivityIndicator color={theme.primaryText} />;
  }

  let cardErrorNode = null;
  if (error) {
    cardErrorNode = <Text style={[styles.error, errorTextStyle]}>{error}</Text>;
  }

  let tokenStatusNode = null;
  let canvasTokenStatusText = getCanvasTokenStatusText(hasTokenInput, canPersistToBackend);
  if (canvasTokenStatusText) {
    tokenStatusNode = <Text style={[styles.helperMuted, { color: theme.textMuted }]}>{canvasTokenStatusText}</Text>;
  }

  let canvasStorageHelperNode = null;
  let canvasStorageHelperText = getCanvasStorageHelperText(canPersistToBackend);
  if (canvasStorageHelperText) {
    canvasStorageHelperNode = <Text style={[styles.helper, { color: theme.textMuted }]}>{canvasStorageHelperText}</Text>;
  }

  let profileOverviewNode = <Text style={[styles.empty, emptyTextStyle]}>No profile synced yet.</Text>;
  if (profile) {
    let profileEmailNode = null;
    if (safeProfile.primary_email || safeProfile.login_id) {
      profileEmailNode = (
        <Text style={[styles.profileMeta, { color: theme.textSecondary }]}>
          Email/Login:
          {' '}
          {safeProfile.primary_email || safeProfile.login_id}
        </Text>
      );
    }

    let profileTimeZoneNode = null;
    if (safeProfile.time_zone) {
      profileTimeZoneNode = (
        <Text style={[styles.profileMeta, { color: theme.textSecondary }]}>
          Time zone:
          {' '}
          {safeProfile.time_zone}
        </Text>
      );
    }

    profileOverviewNode = (
      <View style={[styles.profileCard, surfaceCardStyle]}>
        <Text style={[styles.profileName, { color: theme.textPrimary }]}>{safeProfile.name || 'Unknown user'}</Text>
        {profileEmailNode}
        {profileTimeZoneNode}
      </View>
    );
  }

  let courseGradesOverviewNode = <Text style={[styles.empty, emptyTextStyle]}>No courses synced.</Text>;
  if (courses.length > 0) {
    courseGradesOverviewNode = (
      <View style={styles.events}>
        {courses.map((course, courseIndex) => {
          const safeCourse = course || {};
          const courseId = String(safeCourse.id || '');
          const enrollment = enrollmentsByCourse[courseId];
          const safeEnrollment = enrollment || {};
          const grades = safeEnrollment.grades || {};
          const submissionEntry = submissionsByCourse[courseId] || {};
          const submissionSummary = submissionEntry.summary || {};
          const courseTerm = safeCourse.term || {};
          const termName = courseTerm.name || 'No term';
          const completionText = formatPercent(submissionSummary.completionRate);
          const onTimeText = formatPercent(submissionSummary.onTimeRate);
          let gradeLinkNode = null;
          if (grades.html_url) {
            gradeLinkNode = (
              <Pressable
                onPress={() => openUrl(grades.html_url)}
                style={({ pressed }) => [
                  styles.inlineLinkBtn,
                  secondaryButtonStyle,
                  getStyleWhen(pressed, { opacity: 0.7 }),
                ]}
              >
                <Text style={[styles.inlineLinkText, secondaryButtonTextStyle]}>Open grade page</Text>
              </Pressable>
            );
          }

          return (
            <View key={courseId + '-grade-' + String(courseIndex)} style={[styles.gradeCard, surfaceCardStyle]}>
              <Text style={[styles.gradeCourseName, { color: theme.textPrimary }]}>
                {safeCourse.name || safeCourse.course_code || 'Untitled course'}
              </Text>
              <Text style={[styles.gradeMeta, { color: theme.textSecondary }]}>Term: {termName}</Text>
              <Text style={[styles.gradeMeta, { color: theme.textSecondary }]}>Completion: {completionText}</Text>
              <Text style={[styles.gradeMeta, { color: theme.textSecondary }]}>On-time: {onTimeText}</Text>
              {gradeLinkNode}
            </View>
          );
        })}
      </View>
    );
  }

  let dueSoonOverviewNode = <Text style={[styles.empty, emptyTextStyle]}>No upcoming events.</Text>;
  if (events.length > 0) {
    dueSoonOverviewNode = (
      <View style={styles.events}>
        {events.map((event, eventIndex) => {
          let eventCourseNode = null;
          if (event.course) {
            eventCourseNode = <Text style={[styles.eventCourse, { color: theme.textSecondary }]}>{event.course}</Text>;
          }
          let eventLinkNode = null;
          if (event.htmlUrl) {
            eventLinkNode = <Text style={[styles.eventLink, { color: theme.primary }]}>Open in Canvas</Text>;
          }
          return (
            <Pressable
              key={String(event.id) + '-event-' + String(eventIndex)}
              onPress={() => openUrl(event.htmlUrl)}
              style={({ pressed }) => [
                styles.eventItem,
                surfaceCardStyle,
                getStyleWhen(event.htmlUrl, { borderColor: theme.primary }),
                getStyleWhen(pressed, { opacity: 0.7 }),
              ]}
            >
              <View style={[styles.eventTag, softSurfaceCardStyle]}>
                <Text style={[styles.eventTagText, { color: theme.textSecondary }]}>{event.type}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.eventTitle, { color: theme.textPrimary }]}>{event.title}</Text>
                {eventCourseNode}
                <Text style={[styles.eventDate, { color: theme.textPrimary }]}>{formatDateTime(event.date)}</Text>
                {eventLinkNode}
              </View>
            </Pressable>
          );
        })}
      </View>
    );
  }

  let assignmentsOverviewNode = <Text style={[styles.empty, emptyTextStyle]}>No assignment data yet.</Text>;
  if (courses.length > 0) {
    assignmentsOverviewNode = courses.map((course, courseIndex) => {
      const safeCourse = course || {};
      const courseId = String(safeCourse.id);
      const assignmentEntry = assignmentsByCourse[courseId];
      let assignments = [];
      if (assignmentEntry) {
        if (Array.isArray(assignmentEntry.items)) {
          assignments = assignmentEntry.items;
        }
      }
      const submissionEntry = submissionsByCourse[courseId] || {};
      const submissionLookup = submissionEntry.byAssignment || {};
      const nowTs = Date.now();
      const partitionedAssignments = partitionAssignments(assignments, nowTs);
      const visibleItems = partitionedAssignments.visibleItems;
      const collapsedItems = partitionedAssignments.collapsedItems;
      const isExpanded = Boolean(expandedAssignmentsByCourse[courseId]);
      let displayItems = visibleItems;
      if (isExpanded) {
        displayItems = visibleItems.concat(collapsedItems);
      }

      let assignmentsContentNode = null;
      if (assignments.length === 0) {
        assignmentsContentNode = (
          <Text style={styles.empty}>No assignments in this course.</Text>
        );
      } else {
        let assignmentHintNode = null;
        if (displayItems.length === 0) {
          assignmentHintNode = (
            <Text style={[styles.assignmentHint, { color: theme.textSecondary }]}>
              No assignments in current window. Expand to see all.
            </Text>
          );
        }

        let assignmentCardsNode = displayItems.map((assignment, assignmentIndex) => {
          const safeAssignment = assignment || {};
          const submission = submissionLookup[String(safeAssignment.id)] || null;
          const safeSubmission = submission || {};
          const scoreText = formatScoreValue(
            safeSubmission.score,
            safeAssignment.points_possible
          );
          const detailKey = buildAssignmentDetailKey(courseId, safeAssignment.id);
          const detailState = submissionDetailsByAssignment[detailKey] || {};
          const detailData = detailState.data || null;
          let teacherComments = [];
          if (detailData) {
            if (Array.isArray(detailData.submission_comments)) {
              teacherComments = detailData.submission_comments.filter((comment) => {
                const safeComment = comment || {};
                let authorId = '';
                if (safeComment.author_id !== undefined) {
                  authorId = safeComment.author_id;
                }
                if (!currentProfileId) {
                  return true;
                }
                return String(authorId) !== currentProfileId;
              });
            }
          }
          let detailHistory = [];
          if (detailData) {
            if (Array.isArray(detailData.submission_history)) {
              detailHistory = detailData.submission_history;
            }
          }

          let assignmentDetailNode = (
            <Text style={styles.detailMuted}>
              {getDetailFallbackText(detailState)}
            </Text>
          );
          if (detailData) {
            let teacherCommentsNode = null;
            if (teacherComments.length === 0) {
              teacherCommentsNode = (
                <Text style={styles.detailMuted}>No teacher comments yet.</Text>
              );
            } else {
              teacherCommentsNode = teacherComments.map((comment, index) => {
                const safeComment = comment || {};
                return (
                  <View
                    key={courseId + '-assignment-' + String(safeAssignment.id) + '-comment-' + String(safeComment.id || 'x') + '-' + String(index)}
                    style={[styles.detailRow, softSurfaceCardStyle]}
                  >
                    <Text style={[styles.detailMeta, { color: theme.textSecondary }]}>
                      {safeComment.author_name || 'Instructor'}
                      {' | '}
                      {formatDateTime(safeComment.created_at)}
                    </Text>
                    <Text style={[styles.detailText, { color: theme.textPrimary }]}>
                      {safeComment.comment || '-'}
                    </Text>
                  </View>
                );
              });
            }

            let detailHistoryNode = null;
            if (detailHistory.length === 0) {
              detailHistoryNode = (
                <Text style={styles.detailMuted}>No attempt history.</Text>
              );
            } else {
              detailHistoryNode = detailHistory.map((attempt, index) => {
                const safeAttempt = attempt || {};
                return (
                  <View
                    key={courseId + '-assignment-' + String(safeAssignment.id) + '-attempt-' + String(safeAttempt.id || safeAttempt.attempt || 'x') + '-' + String(index)}
                    style={[styles.detailRow, softSurfaceCardStyle]}
                  >
                    <Text style={[styles.detailMeta, { color: theme.textSecondary }]}>
                      Attempt {safeAttempt.attempt || index + 1}
                    </Text>
                    <Text style={[styles.detailText, { color: theme.textPrimary }]}>
                      Submitted: {formatDateTime(safeAttempt.submitted_at)}
                    </Text>
                    <Text style={[styles.detailText, { color: theme.textPrimary }]}>
                      Late: {getYesNoText(safeAttempt.late)}
                    </Text>
                    <Text style={[styles.detailText, { color: theme.textPrimary }]}>
                      Score:
                      {' '}
                      {formatScoreValue(
                        safeAttempt.score,
                        safeAttempt.points_possible || safeAssignment.points_possible
                      )}
                    </Text>
                  </View>
                );
              });
            }

            assignmentDetailNode = (
              <>
                <Text style={[styles.detailMeta, { color: theme.textSecondary }]}>
                  Late: {getYesNoText(detailData.late)}
                </Text>
                <Text style={[styles.detailMeta, { color: theme.textSecondary }]}>
                  Submitted at: {formatDateTime(detailData.submitted_at)}
                </Text>
                <Text style={[styles.detailHeading, { color: theme.textPrimary }]}>Teacher comments</Text>
                {teacherCommentsNode}
                <Text style={[styles.detailHeading, { color: theme.textPrimary }]}>Attempt history</Text>
                {detailHistoryNode}
              </>
            );
          }

          let detailPanelNode = null;
          if (detailState.expanded) {
            let detailErrorNode = null;
            if (detailState.error) {
              detailErrorNode = (
                <Text style={[styles.detailError, errorTextStyle]}>
                  Failed to load detail: {detailState.error}
                </Text>
              );
            }
            detailPanelNode = (
              <View style={[styles.detailPanel, surfaceCardStyle]}>
                {detailErrorNode}
                {assignmentDetailNode}
              </View>
            );
          }

          let openAssignmentNode = null;
          if (safeAssignment.html_url) {
            openAssignmentNode = (
              <Pressable
                onPress={() => openUrl(safeAssignment.html_url)}
                style={({ pressed }) => [
                  styles.inlineLinkBtn,
                  secondaryButtonStyle,
                  getStyleWhen(pressed, { opacity: 0.7 }),
                ]}
              >
                <Text style={[styles.inlineLinkText, secondaryButtonTextStyle]}>Open assignment</Text>
              </Pressable>
            );
          }

          return (
            <View
              key={courseId + '-assignment-' + String(safeAssignment.id) + '-' + String(assignmentIndex)}
              style={[
                styles.assignmentItem,
                softSurfaceCardStyle,
                getStyleWhen(safeAssignment.html_url, { borderColor: theme.primary }),
              ]}
            >
              <Text style={[styles.assignmentTitle, { color: theme.textPrimary }]}>
                {safeAssignment.name || 'Untitled assignment'}
              </Text>
              <Text style={[styles.assignmentMeta, { color: theme.textSecondary }]}>
                Due:
                {' '}
                {formatDateTime(safeAssignment.due_at)}
              </Text>
              <Text style={[styles.assignmentMeta, { color: theme.textSecondary }]}>
                Score: {scoreText}
              </Text>
              <Text style={[styles.assignmentMeta, { color: theme.textSecondary }]}>
                Status:
                {' '}
                {getSubmissionStatusText(safeSubmission)}
              </Text>
              <Pressable
                onPress={() => handleToggleSubmissionDetail(courseId, safeAssignment.id)}
                style={({ pressed }) => [
                  styles.detailBtn,
                  secondaryButtonStyle,
                  getStyleWhen(pressed, { opacity: 0.7 }),
                ]}
              >
                <Text style={[styles.detailBtnText, secondaryButtonTextStyle]}>
                  {getSubmissionDetailButtonText(detailState)}
                </Text>
              </Pressable>
              {detailPanelNode}
              {openAssignmentNode}
            </View>
          );
        });

        let collapseAssignmentsNode = null;
        if (collapsedItems.length > 0) {
          collapseAssignmentsNode = (
            <Pressable
              onPress={() =>
                setExpandedAssignmentsByCourse((prev) => ({
                  ...prev,
                  [courseId]: !isExpanded,
                }))
              }
              style={({ pressed }) => [
                styles.collapseBtn,
                secondaryButtonStyle,
                getStyleWhen(pressed, { opacity: 0.7 }),
              ]}
            >
              <Text style={[styles.collapseBtnText, secondaryButtonTextStyle]}>
                {getCollapseAssignmentsText(isExpanded, collapsedItems.length)}
              </Text>
            </Pressable>
          );
        }

        assignmentsContentNode = (
          <View style={styles.assignments}>
            {assignmentHintNode}
            {assignmentCardsNode}
            {collapseAssignmentsNode}
          </View>
        );
      }

      return (
        <View
          key={courseId + '-assignment-group-' + String(courseIndex)}
          style={[styles.assignmentGroup, surfaceCardStyle]}
        >
          <Text style={[styles.assignmentCourseName, { color: theme.textPrimary }]}>
            {safeCourse.name || safeCourse.course_code || 'Untitled course'}
          </Text>
          {assignmentsContentNode}
        </View>
      );
    });
  }

  let overviewPanelNode = null;
  let dayViewNode = null;
  let weekViewNode = null;
  let monthViewNode = null;
  let calendarPanelNode = null;
  if (isConnected) {
    if (selectedPanel === 'overview') {
      overviewPanelNode = (
        <>
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>Profile</Text>
            {profileOverviewNode}
          </View>

          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>Course Grades</Text>
            {courseGradesOverviewNode}
          </View>

          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>Due Soon</Text>
            {dueSoonOverviewNode}
          </View>

          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>Assignments + Scores</Text>
            {assignmentsOverviewNode}
          </View>

          <View style={{ height: 90 }} />
        </>
      );
    }
  }

  if (selectedView === 'day') {
    let dayContentNode = <Text style={[styles.empty, emptyTextStyle]}>No synced tasks on this day.</Text>;
    if (selectedDayItems.length > 0) {
      dayContentNode = selectedDayItems.map((item, index) => (
        <Pressable
          key={String(item.id) + '-day-' + String(index)}
          onPress={() => openCalendarItemDetail(item)}
          style={({ pressed }) => [
            styles.agendaCard,
            softSurfaceCardStyle,
            getStyleWhen(pressed, { opacity: 0.8 }),
          ]}
        >
          <View
            style={[
              styles.agendaAccent,
              { backgroundColor: getAccentColor(item, 'border', '#111827') },
            ]}
          />
          <View style={{ flex: 1 }}>
            <Text style={[styles.agendaTime, { color: theme.primary }]}>{formatClockTime(item.date)}</Text>
            <Text style={[styles.agendaTitle, { color: theme.textPrimary }]}>{item.title}</Text>
            <Text style={[styles.agendaMeta, { color: theme.textSecondary }]}>
              {item.course || 'Canvas'} | {item.status}
            </Text>
          </View>
        </Pressable>
      ));
    }

    dayViewNode = <View style={styles.agendaList}>{dayContentNode}</View>;
  }

  if (selectedView === 'week') {
    weekViewNode = (
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View>
          <View style={[styles.weekHeaderRow, { borderBottomColor: theme.borderSoft }]}>
            <View style={styles.weekTimeHeader} />
            {weekDays.map((day) => {
              const active = isSameDay(day, selectedDate);
              return (
                <Pressable
                  key={buildDateKey(day)}
                  onPress={() => setSelectedDate(day)}
                  style={[
                    styles.weekDayHeader,
                    getStyleWhen(active, { backgroundColor: theme.surfaceMuted }),
                    { borderLeftColor: theme.borderSoft },
                  ]}
                >
                  <Text
                    style={[
                      styles.weekDayName,
                      { color: theme.textMuted },
                      getStyleWhen(active, { color: theme.primary }),
                    ]}
                  >
                    {formatWeekday(day)}
                  </Text>
                  <Text
                    style={[
                      styles.weekDayNumber,
                      { color: theme.textPrimary },
                      getStyleWhen(active, { color: theme.primary }),
                    ]}
                  >
                    {day.getDate()}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {TIME_SLOTS.map((hour) => (
            <View key={'hour-' + String(hour)} style={styles.weekGridRow}>
              <View style={styles.weekTimeCell}>
                <Text style={[styles.weekTimeText, { color: theme.textMuted }]}>{formatHourLabel(hour)}</Text>
              </View>

              {weekDays.map((day) => {
                const cellItems = weekGridItems[String(day.getDay()) + '-' + String(hour)] || [];
                let moreItemsNode = null;
                if (cellItems.length > 2) {
                  moreItemsNode = (
                    <Text style={styles.weekMoreText}>+{cellItems.length - 2} more</Text>
                  );
                }
                return (
                  <Pressable
                    key={buildDateKey(day) + '-' + String(hour)}
                    onPress={() => setSelectedDate(day)}
                    style={[
                      styles.weekGridCell,
                      { borderLeftColor: theme.borderSoft, borderBottomColor: theme.borderSoft },
                      getStyleWhen(isSameDay(day, selectedDate), { backgroundColor: theme.surfaceMuted }),
                      getStyleWhen(isSameDay(day, new Date()), { backgroundColor: isDarkTheme ? '#1A2437' : '#FFF9F5' }),
                    ]}
                  >
                    {cellItems.slice(0, 2).map((item, itemIndex) => (
                      <Pressable
                        key={String(item.id) + '-week-' + String(itemIndex)}
                        onPress={() => openCalendarItemDetail(item)}
                        style={({ pressed }) => [
                          styles.weekEventCard,
                          {
                            backgroundColor: getAccentColor(item, 'bg', '#eff6ff'),
                            borderLeftColor: getAccentColor(item, 'border', '#60a5fa'),
                          },
                          getStyleWhen(pressed, { opacity: 0.8 }),
                        ]}
                      >
                        <Text
                          style={[
                            styles.weekEventTime,
                            { color: getAccentColor(item, 'text', '#1d4ed8') },
                          ]}
                        >
                          {formatClockTime(item.date)}
                        </Text>
                        <Text numberOfLines={1} style={[styles.weekEventTitle, { color: theme.textPrimary }]}>
                          {item.title}
                        </Text>
                      </Pressable>
                    ))}
                    {moreItemsNode}
                  </Pressable>
                );
              })}
            </View>
          ))}
        </View>
      </ScrollView>
    );
  }

  if (selectedView === 'month') {
    let monthContentNode = <Text style={[styles.empty, emptyTextStyle]}>No synced tasks in this month.</Text>;
    if (monthItems.length > 0) {
      monthContentNode = monthItems.slice(0, 12).map((item, index) => (
        <Pressable
          key={String(item.id) + '-month-' + String(index)}
          onPress={() => openCalendarItemDetail(item)}
          style={({ pressed }) => [
            styles.agendaCard,
            softSurfaceCardStyle,
            getStyleWhen(pressed, { opacity: 0.8 }),
          ]}
        >
          <View
            style={[
              styles.agendaAccent,
              { backgroundColor: getAccentColor(item, 'border', '#111827') },
            ]}
          />
          <View style={{ flex: 1 }}>
            <Text style={[styles.agendaTime, { color: theme.primary }]}>
              {formatShortDate(item.date)} | {formatClockTime(item.date)}
            </Text>
            <Text style={[styles.agendaTitle, { color: theme.textPrimary }]}>{item.title}</Text>
            <Text style={[styles.agendaMeta, { color: theme.textSecondary }]}>
              {item.course || 'Canvas'} | {item.status}
            </Text>
          </View>
        </Pressable>
      ));
    }

    monthViewNode = <View style={styles.agendaList}>{monthContentNode}</View>;
  }

  if (selectedPanel === 'calendar') {
    let plannerFooterHint = '';
    if (checkinsError) {
      plannerFooterHint = checkinsError;
    }

    calendarPanelNode = (
      <>
        <View style={styles.previewFocusRow}>
          <View style={[styles.focusTodayCard, heroCardStyle]}>
            <Text style={[styles.focusTodayLabel, heroMutedTextStyle]}>TODAY</Text>
            <Text style={[styles.focusTodayDate, heroTitleTextStyle]}>{formatDayMonth(new Date())}</Text>
            <Text style={[styles.focusTodayMeta, heroMutedTextStyle]}>
              {getNextUpcomingLabel(nextUpcomingItem)}
            </Text>
          </View>

          <MiniCalendarPanel
            anchorDate={selectedDate}
            selectedDate={selectedDate}
            onSelectDate={(nextDate) => {
              setSelectedDate(nextDate);
              setSelectedView('week');
            }}
            onChangeMonth={changeMiniCalendarMonth}
            dateMarkersByDate={dateMarkersByDate}
            onPressTitle={openMonthYearPicker}
            titleHint=""
            footerHint={plannerFooterHint}
          />
        </View>

        <View style={[styles.plannerShell, surfaceCardStyle]}>
          <View style={styles.plannerToolbar}>
            <View style={styles.plannerArrowRow}>
              <Pressable
                onPress={() => changeCalendarWindow(-1)}
                style={({ pressed }) => [
                  styles.plannerArrowBtn,
                  secondaryButtonStyle,
                  getStyleWhen(pressed, { opacity: 0.7 }),
                ]}
              >
                <Text style={[styles.plannerArrowText, secondaryButtonTextStyle]}>{'<'}</Text>
              </Pressable>
              <Pressable
                onPress={() => setSelectedDate(new Date())}
                style={({ pressed }) => [
                  styles.plannerTodayBtn,
                  secondaryButtonStyle,
                  getStyleWhen(pressed, { opacity: 0.85 }),
                ]}
              >
                <Text style={[styles.plannerTodayBtnText, secondaryButtonTextStyle]}>Today</Text>
              </Pressable>
              <Pressable
                onPress={() => changeCalendarWindow(1)}
                style={({ pressed }) => [
                  styles.plannerArrowBtn,
                  secondaryButtonStyle,
                  getStyleWhen(pressed, { opacity: 0.7 }),
                ]}
              >
                <Text style={[styles.plannerArrowText, secondaryButtonTextStyle]}>{'>'}</Text>
              </Pressable>
            </View>

            <View style={styles.plannerViewSwitch}>
              {['day', 'week', 'month'].map((viewKey) => {
                const active = selectedView === viewKey;
                return (
                  <Pressable
                    key={viewKey}
                    onPress={() => setSelectedView(viewKey)}
                    style={({ pressed }) => [
                      styles.plannerViewBtn,
                      secondaryButtonStyle,
                      getStyleWhen(active, primaryButtonStyle),
                      getStyleWhen(pressed, { opacity: 0.82 }),
                    ]}
                  >
                    <Text
                      style={[
                        styles.plannerViewBtnText,
                        secondaryButtonTextStyle,
                        getStyleWhen(active, primaryButtonTextStyle),
                      ]}
                    >
                      {viewKey}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {dayViewNode}
          {weekViewNode}
          {monthViewNode}
        </View>
      </>
    );
  }

  let taskTimeFieldsNode = (
    <>
      <TaskSelectField
        label="Start"
        value={formatTimeOnly(taskForm.startTime)}
        hint="00 / 15 / 30 / 45"
        onPress={() => openTimePicker('startTime')}
      />
      <TaskSelectField
        label="End"
        value={formatTimeOnly(taskForm.endTime)}
        hint="00 / 15 / 30 / 45"
        onPress={() => openTimePicker('endTime')}
      />
    </>
  );
  if (taskForm.timingMode === 'deadline') {
    taskTimeFieldsNode = (
      <TaskSelectField
        label="Due time"
        value={formatTimeOnly(taskForm.dueTime)}
        hint="00 / 15 / 30 / 45"
        onPress={() => openTimePicker('dueTime')}
      />
    );
  }

  let taskSaveButtonNode = (
    <Text style={[styles.taskSaveBtnText, primaryButtonTextStyle]}>
      {getTaskSaveButtonText(editingTaskId)}
    </Text>
  );
  if (taskSaving) {
    taskSaveButtonNode = <ActivityIndicator color={theme.primaryText} size="small" />;
  }

  let taskCancelNode = null;
  if (editingTaskId) {
    taskCancelNode = (
      <Pressable
        onPress={() => resetTaskComposer(selectedDate)}
        style={({ pressed }) => [
          styles.taskCancelBtn,
          secondaryButtonStyle,
          getStyleWhen(pressed, { opacity: 0.82 }),
        ]}
      >
        <Text style={[styles.taskCancelBtnText, secondaryButtonTextStyle]}>Cancel</Text>
      </Pressable>
    );
  }

  let tasksErrorNode = null;
  if (tasksError) {
    tasksErrorNode = <Text style={[styles.taskErrorText, errorTextStyle]}>{tasksError}</Text>;
  }

  let tasksNoticeNode = null;
  if (tasksNotice) {
    tasksNoticeNode = <Text style={[styles.taskNoticeText, { color: theme.primary }]}>{tasksNotice}</Text>;
  }

  let customTaskListNode = null;
  if (tasksLoading) {
    customTaskListNode = (
      <View style={styles.taskLoadingWrap}>
        <ActivityIndicator color={theme.primary} />
      </View>
    );
  } else if (customTasks.length === 0) {
    customTaskListNode = <Text style={[styles.empty, emptyTextStyle]}>No custom tasks yet.</Text>;
  } else {
    customTaskListNode = (
      <View style={styles.taskList}>
        {customTasks.map((task) => {
          const isDeleting = taskDeletingId === String(task.id);
          const isToggling = taskTogglingId === String(task.id);
          return (
            <View key={'task-' + String(task.id)} style={[styles.taskItemCard, surfaceCardStyle]}>
              <Pressable
                onPress={() => handleToggleTaskCompletion(task)}
                disabled={isToggling}
                style={({ pressed }) => [
                  styles.taskCheckBtn,
                  secondaryButtonStyle,
                  getStyleWhen(task.isCompleted, styles.taskCheckBtnActive),
                  getStyleWhen(task.isCompleted, primaryButtonStyle),
                  getStyleWhen(isToggling, { opacity: 0.6 }),
                  getStyleWhen(pressed, { opacity: 0.82 }),
                ]}
              >
                {isToggling ? (
                  <ActivityIndicator
                    size="small"
                    color={task.isCompleted ? theme.primaryText : theme.primary}
                  />
                ) : (
                  <Text
                    style={[
                      styles.taskCheckBtnText,
                      secondaryButtonTextStyle,
                      getStyleWhen(task.isCompleted, styles.taskCheckBtnTextActive),
                      getStyleWhen(task.isCompleted, primaryButtonTextStyle),
                    ]}
                  >
                    {getTextWhen(task.isCompleted, '\u2713', '')}
                  </Text>
                )}
              </Pressable>

              <View style={styles.taskItemBody}>
                <Text
                  style={[
                    styles.taskItemTitle,
                    { color: theme.textPrimary },
                    getStyleWhen(task.isCompleted, styles.taskItemTitleDone),
                    getStyleWhen(task.isCompleted, { color: theme.textMuted }),
                  ]}
                >
                  {task.title}
                </Text>
                <Text style={[styles.taskItemMeta, { color: theme.textSecondary }]}>{formatTaskSchedule(task)}</Text>
              </View>

              <View style={styles.taskItemActions}>
                <Pressable
                  onPress={() => handleEditTask(task)}
                  style={({ pressed }) => [
                    styles.taskActionBtn,
                    secondaryButtonStyle,
                    getStyleWhen(pressed, { opacity: 0.82 }),
                  ]}
                >
                  <Text style={[styles.taskActionBtnText, secondaryButtonTextStyle]}>Edit</Text>
                </Pressable>
                <Pressable
                  onPress={() => handleDeleteTask(task.id)}
                  disabled={isDeleting}
                  style={({ pressed }) => [
                    styles.taskActionBtn,
                    secondaryButtonStyle,
                    getStyleWhen(isDeleting, { opacity: 0.6 }),
                    getStyleWhen(pressed, { opacity: 0.82 }),
                  ]}
                >
                  <Text style={[styles.taskDeleteBtnText, errorTextStyle]}>
                    {getTextWhen(isDeleting, '...', 'Delete')}
                  </Text>
                </Pressable>
              </View>
            </View>
          );
        })}
      </View>
    );
  }

  let taskSectionNode = null;
  if (showTaskSection) {
    taskSectionNode = (
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>My Tasks</Text>
        <View style={[styles.taskComposerCard, surfaceCardStyle]}>
          <TextInput
            value={taskForm.title}
            onChangeText={(value) => handleTaskFieldChange('title', value)}
            placeholder="Task name"
            placeholderTextColor={theme.textMuted}
            style={[
              styles.taskTitleInput,
              { backgroundColor: theme.surfaceMuted, borderColor: theme.border, color: theme.textPrimary },
            ]}
          />

          <View style={styles.taskModeRow}>
            {[
              { id: 'deadline', label: 'Due time' },
              { id: 'range', label: 'Time range' },
            ].map((mode) => {
              const active = taskForm.timingMode === mode.id;
              return (
                <Pressable
                  key={mode.id}
                  onPress={() => handleTaskFieldChange('timingMode', mode.id)}
                  style={({ pressed }) => [
                    styles.taskModeChip,
                    secondaryButtonStyle,
                    getStyleWhen(active, primaryButtonStyle),
                    getStyleWhen(pressed, { opacity: 0.82 }),
                  ]}
                >
                  <Text
                    style={[
                      styles.taskModeChipText,
                      secondaryButtonTextStyle,
                      getStyleWhen(active, primaryButtonTextStyle),
                    ]}
                  >
                    {mode.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.taskFieldsWrap}>
            <TaskSelectField
              label="Date"
              value={formatPickerDateLabel(taskForm.taskDate)}
              hint=""
              onPress={openTaskDatePicker}
            />

            {taskTimeFieldsNode}
          </View>

          <View style={styles.taskComposerActions}>
            <Pressable
              onPress={handleSubmitTask}
              disabled={taskSaving}
              style={({ pressed }) => [
                styles.taskSaveBtn,
                primaryButtonStyle,
                getStyleWhen(taskSaving, { opacity: 0.6 }),
                getStyleWhen(pressed, { opacity: 0.82 }),
              ]}
            >
              {taskSaveButtonNode}
            </Pressable>

            {taskCancelNode}
          </View>

          {tasksErrorNode}
          {tasksNoticeNode}
        </View>

        {customTaskListNode}
      </View>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.screenBg }]}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: theme.textPrimary }]}>Calendar + Grades</Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
            Enter a school short name for standard Canvas sites, or a full Canvas host for custom domains.
            {' '}
            <Text style={[styles.subtitleStrong, { color: theme.textPrimary }]}>Example: ox or canvas.hull.ac.uk</Text>
            .
          </Text>
        </View>

        <View style={[styles.card, surfaceCardStyle]}>
          <Text style={[styles.label, { color: theme.textSecondary }]}>School name</Text>
          <TextInput
            value={schoolInput}
            onChangeText={handleSchoolInputChange}
            placeholder="Example: ox / canvas.hull.ac.uk"
            autoCapitalize="none"
            autoCorrect={false}
            placeholderTextColor={theme.textMuted}
            style={[styles.input, { backgroundColor: theme.surfaceMuted, borderColor: theme.border, color: theme.textPrimary }]}
          />
          <Text style={[styles.inputHint, { color: theme.textSecondary }]}>
            Resolved URL:
            {' '}
            {draftBaseUrl || 'https://school-name.instructure.com'}
          </Text>

          <Text style={[styles.label, { marginTop: 12, color: theme.textSecondary }]}>Access Token</Text>
          <TextInput
            value={tokenInput}
            onChangeText={handleTokenInputChange}
            placeholder="Canvas Access Token"
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
            placeholderTextColor={theme.textMuted}
            style={[styles.input, { backgroundColor: theme.surfaceMuted, borderColor: theme.border, color: theme.textPrimary }]}
          />

          <View style={styles.buttonRow}>
            <Pressable
              onPress={handleConnect}
              disabled={loading}
              style={({ pressed }) => [
                styles.primaryBtn,
                primaryButtonStyle,
                getStyleWhen(pressed, { opacity: 0.7 }),
              ]}
            >
              {connectButtonContentNode}
            </Pressable>

            <Pressable
              onPress={handleClear}
              style={({ pressed }) => [
                styles.ghostBtn,
                secondaryButtonStyle,
                getStyleWhen(pressed, { opacity: 0.7 }),
              ]}
            >
              <Text style={[styles.ghostBtnText, secondaryButtonTextStyle]}>Clear</Text>
            </Pressable>
          </View>

          {canvasStorageHelperNode}
          {tokenStatusNode}
          {cardErrorNode}
          {lastSyncNode}
        </View>

        <View style={[styles.previewSection, softSurfaceCardStyle]}>
          <View style={styles.previewHeaderRow}>
            <View style={styles.previewHeaderTextWrap}>
              <Text style={[styles.previewEyebrow, { color: theme.textSecondary }]}>
                {getPreviewEyebrowText(isConnected)}
              </Text>
              <Text style={[styles.previewTitle, { color: theme.textPrimary }]}>
                {getPreviewTitleText(isConnected)}
              </Text>
              <Text style={[styles.previewSubtitle, { color: theme.textSecondary }]}>
                {getPreviewSubtitleText(isConnected)}
              </Text>
            </View>

            <View style={styles.previewTabRow}>
              <Pressable
                onPress={() => setSelectedPanel('calendar')}
                style={({ pressed }) => [
                  styles.previewTab,
                  secondaryButtonStyle,
                  getStyleWhen(selectedPanel === 'calendar', primaryButtonStyle),
                  getStyleWhen(pressed, { opacity: 0.85 }),
                ]}
              >
                <Text
                  style={[
                    styles.previewTabText,
                    secondaryButtonTextStyle,
                    getStyleWhen(selectedPanel === 'calendar', primaryButtonTextStyle),
                  ]}
                >
                  calendar
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setSelectedPanel('overview')}
                style={({ pressed }) => [
                  styles.previewTab,
                  secondaryButtonStyle,
                  getStyleWhen(selectedPanel === 'overview', primaryButtonStyle),
                  getStyleWhen(pressed, { opacity: 0.85 }),
                ]}
              >
                <Text
                  style={[
                    styles.previewTabText,
                    secondaryButtonTextStyle,
                    getStyleWhen(selectedPanel === 'overview', primaryButtonTextStyle),
                  ]}
                >
                  overview
                </Text>
              </Pressable>
            </View>
          </View>

          {calendarPanelNode}
          {taskSectionNode}
          {overviewPanelNode}
        </View>
      </ScrollView>

      <BottomSheetPicker
        visible={taskDatePickerVisible}
        onClose={() => setTaskDatePickerVisible(false)}
        onConfirm={confirmTaskDatePicker}
        title="Choose date"
        subtitle={formatPickerDateLabel(taskDateDraft)}
        leadingLabel="Today"
        onLeadingPress={() => {
          const today = new Date();
          setTaskDateDraft(today);
          setTaskDateMonthAnchor(today);
        }}
      >
        <View style={styles.sheetMiniCalendarWrap}>
          <MiniCalendarPanel
            anchorDate={taskDateMonthAnchor}
            selectedDate={taskDateDraft}
            onSelectDate={(nextDate) => {
              setTaskDateDraft(nextDate);
              setTaskDateMonthAnchor(nextDate);
            }}
            onChangeMonth={(direction) => {
              const nextDate = addMonths(taskDateMonthAnchor, direction);
              if (nextDate) setTaskDateMonthAnchor(nextDate);
            }}
            dateMarkersByDate={dateMarkersByDate}
            footerHint=""
          />
        </View>
      </BottomSheetPicker>

      <BottomSheetPicker
        visible={timePickerVisible}
        onClose={() => setTimePickerVisible(false)}
        onConfirm={confirmTimePicker}
        title={getTimePickerTitle(activeTimeField)}
        subtitle={formatTimeOnly(formatTimeDraftToValue(timeDraft))}
      >
        <View style={styles.timeWheelRow}>
          <PickerWheelColumn
            label="Hour"
            options={HOUR_12_OPTIONS}
            value={timeDraft.hour12}
            onChange={(hour12) => setTimeDraft((prev) => ({ ...prev, hour12 }))}
            scrollRef={hourWheelRef}
          />
          <PickerWheelColumn
            label="Minute"
            options={MINUTE_OPTIONS}
            value={timeDraft.minute}
            onChange={(minute) => setTimeDraft((prev) => ({ ...prev, minute }))}
            scrollRef={minuteWheelRef}
          />
          <PickerWheelColumn
            label="AM / PM"
            options={MERIDIEM_OPTIONS}
            value={timeDraft.meridiem}
            onChange={(meridiem) => setTimeDraft((prev) => ({ ...prev, meridiem }))}
            scrollRef={meridiemWheelRef}
          />
        </View>
      </BottomSheetPicker>

      <BottomSheetPicker
        visible={monthYearPickerVisible}
        onClose={() => setMonthYearPickerVisible(false)}
        onConfirm={confirmMonthYearPicker}
        title="Choose month"
        subtitle={MONTH_LABELS[monthYearDraft.month] + ' ' + String(monthYearDraft.year)}
      >
        <Text style={[styles.monthYearSectionTitle, { color: theme.textSecondary }]}>Year</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.monthYearYearRow}
        >
          {monthYearOptions.map((year) => {
            const active = year === monthYearDraft.year;
            return (
              <Pressable
                key={'year-' + String(year)}
                onPress={() => setMonthYearDraft((prev) => ({ ...prev, year }))}
                style={({ pressed }) => [
                  styles.monthYearYearChip,
                  secondaryButtonStyle,
                  getStyleWhen(active, primaryButtonStyle),
                  getStyleWhen(pressed, { opacity: 0.82 }),
                ]}
              >
                <Text
                  style={[
                    styles.monthYearYearChipText,
                    secondaryButtonTextStyle,
                    getStyleWhen(active, primaryButtonTextStyle),
                  ]}
                >
                  {year}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <Text style={[styles.monthYearSectionTitle, { color: theme.textSecondary }]}>Month</Text>
        <View style={styles.monthYearGrid}>
          {MONTH_LABELS.map((label, index) => {
            const active = index === monthYearDraft.month;
            return (
              <Pressable
                key={'month-' + String(label)}
                onPress={() => setMonthYearDraft((prev) => ({ ...prev, month: index }))}
                style={({ pressed }) => [
                  styles.monthYearCell,
                  secondaryButtonStyle,
                  getStyleWhen(active, primaryButtonStyle),
                  getStyleWhen(pressed, { opacity: 0.82 }),
                ]}
              >
                <Text
                  style={[
                    styles.monthYearCellText,
                    secondaryButtonTextStyle,
                    getStyleWhen(active, primaryButtonTextStyle),
                  ]}
                >
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </BottomSheetPicker>

      <BottomSheetPicker
        visible={calendarDetailVisible}
        onClose={() => {
          setCalendarDetailVisible(false);
          setSelectedCalendarItem(null);
        }}
        onConfirm={() => {
          if (safeSelectedCalendarItem) {
            if (safeSelectedCalendarItem.htmlUrl) {
              setCalendarDetailVisible(false);
              setSelectedCalendarItem(null);
              openUrl(safeSelectedCalendarItem.htmlUrl);
              return;
            }
          }
          setCalendarDetailVisible(false);
          setSelectedCalendarItem(null);
        }}
        title={selectedCalendarDetailTitle}
        subtitle={selectedCalendarDetailSubtitle}
        confirmLabel={getCalendarDetailConfirmLabel(safeSelectedCalendarItem)}
      >
        {selectedCalendarDetailNode}
      </BottomSheetPicker>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  container: { paddingHorizontal: 18, paddingTop: 12 },

  header: { marginBottom: 16 },
  title: { fontSize: 22, fontWeight: '800', color: '#111827' },
  subtitle: { marginTop: 6, fontSize: 12, color: '#6b7280' },
  subtitleStrong: { color: '#111827', fontWeight: '700' },

  card: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 14,
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  label: { fontSize: 12, fontWeight: '700', color: '#374151' },
  input: {
    marginTop: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    color: '#111827',
    backgroundColor: '#f9fafb',
  },
  inputHint: {
    marginTop: 6,
    fontSize: 11,
    color: '#6b7280',
  },
  buttonRow: {
    marginTop: 14,
    flexDirection: 'row',
    gap: 10,
  },
  primaryBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#111827',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  ghostBtn: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ghostBtnText: { color: '#111827', fontWeight: '700', fontSize: 13 },
  helper: { marginTop: 10, fontSize: 11, color: '#9ca3af' },
  error: { marginTop: 8, fontSize: 12, color: '#ef4444' },
  sync: { marginTop: 8, fontSize: 11, color: '#6b7280' },

  previewSection: {
    marginTop: 18,
    borderRadius: 28,
    backgroundColor: '#f7f4ef',
    padding: 16,
    borderWidth: 1,
    borderColor: '#ece6dc',
  },
  previewFocusRow: {
    marginTop: 16,
    flexDirection: 'column',
    gap: 14,
    alignItems: 'stretch',
  },
  focusTodayCard: {
    width: '100%',
    borderRadius: 28,
    backgroundColor: '#111827',
    paddingHorizontal: 22,
    paddingVertical: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    shadowColor: '#0f172a',
    shadowOpacity: 0.14,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  focusTodayLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: '#f9fafb',
    opacity: 0.72,
    letterSpacing: 1,
  },
  focusTodayDate: {
    marginTop: 10,
    fontSize: 28,
    fontWeight: '900',
    color: '#fff',
  },
  focusTodayMeta: {
    marginTop: 10,
    fontSize: 14,
    lineHeight: 20,
    color: '#d1d5db',
  },
  previewHeaderRow: {
    gap: 12,
  },
  previewHeaderTextWrap: {
    gap: 4,
  },
  previewEyebrow: {
    fontSize: 11,
    letterSpacing: 1.1,
    fontWeight: '800',
    color: '#8a7963',
  },
  previewTitle: {
    fontSize: 23,
    lineHeight: 28,
    fontWeight: '900',
    color: '#1f2937',
  },
  previewSubtitle: {
    fontSize: 12,
    lineHeight: 18,
    color: '#6b7280',
  },
  previewTabRow: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    gap: 10,
  },
  previewTab: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd6ca',
  },
  previewTabActive: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#111827',
  },
  previewTabActiveText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#fff',
    textTransform: 'capitalize',
  },
  previewTabText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#1f2937',
    textTransform: 'capitalize',
  },
  miniCalendarCard: {
    width: '100%',
    borderRadius: 28,
    backgroundColor: '#161C2B',
    paddingHorizontal: 22,
    paddingTop: 20,
    paddingBottom: 18,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.18)',
    shadowColor: '#0f172a',
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 12 },
    elevation: 5,
    overflow: 'hidden',
    position: 'relative',
  },
  miniCalendarGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 110,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
  },
  miniCalendarTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  miniCalendarTitleBtn: {
    flex: 1,
    paddingRight: 12,
  },
  miniCalendarTitle: {
    fontSize: 20,
    lineHeight: 24,
    fontWeight: '900',
    color: '#F8FAFC',
  },
  miniCalendarTitleHint: {
    marginTop: 4,
    fontSize: 10,
    fontWeight: '700',
    color: '#9ca3af',
  },
  miniCalendarNavRow: {
    flexDirection: 'row',
    gap: 8,
  },
  miniCalendarNavBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  miniCalendarNavText: {
    fontSize: 22,
    fontWeight: '800',
    color: '#F8FAFC',
  },
  miniCalendarWeekdays: {
    marginTop: 16,
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  miniCalendarWeekdayText: {
    width: '14.2857%',
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '700',
    color: '#94A3B8',
  },
  miniCalendarGrid: {
    marginTop: 10,
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  miniCalendarCell: {
    width: '14.2857%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    borderRadius: 12,
    minHeight: 40,
  },
  miniCalendarCellMuted: {
    backgroundColor: 'transparent',
  },
  miniCalendarCellCheckedIn: {
    backgroundColor: '#F8E8B0',
    borderWidth: 1,
    borderColor: 'rgba(217, 164, 65, 0.45)',
  },
  miniCalendarCellCheckedInSelected: {
    borderWidth: 2,
    borderColor: '#D9A441',
  },
  miniCalendarCellSelected: {
    backgroundColor: '#4F7DFF',
  },
  miniCalendarCellToday: {
    borderWidth: 1,
    borderColor: 'rgba(203, 213, 225, 0.55)',
  },
  miniCalendarCellText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#F8FAFC',
  },
  miniCalendarCellTextMuted: {
    color: '#64748B',
  },
  miniCalendarCellTextCheckedIn: {
    color: '#6B4F1D',
  },
  miniCalendarCellTextSelected: {
    color: '#FFFFFF',
  },
  miniCalendarDot: {
    marginTop: 4,
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#E56B6F',
  },
  miniCalendarDotRow: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  miniCalendarDotCustom: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#9FE3C1',
  },
  miniCalendarDotCheckin: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#E7B94C',
    borderWidth: 1,
    borderColor: 'rgba(255, 248, 220, 0.8)',
  },
  miniCalendarLegendRow: {
    marginTop: 14,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 10,
  },
  miniCalendarLegendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  miniCalendarLegendDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  miniCalendarLegendDotCanvas: {
    backgroundColor: '#E56B6F',
  },
  miniCalendarLegendDotCustom: {
    backgroundColor: '#9FE3C1',
  },
  miniCalendarLegendDotCheckin: {
    backgroundColor: '#E7B94C',
  },
  miniCalendarLegendText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#CBD5E1',
  },
  miniCalendarHint: {
    marginTop: 14,
    fontSize: 11,
    lineHeight: 16,
    color: '#9ca3af',
  },
  plannerShell: {
    marginTop: 14,
    borderRadius: 24,
    padding: 14,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ebe4d9',
  },
  plannerToolbar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
    marginBottom: 14,
    flexWrap: 'wrap',
  },
  plannerArrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  plannerArrowBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  plannerArrowText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
  },
  plannerTodayBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#f4efe7',
  },
  plannerTodayBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#111827',
  },
  plannerViewSwitch: {
    flexDirection: 'row',
    gap: 8,
  },
  plannerViewBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#f9fafb',
  },
  plannerViewBtnActive: {
    backgroundColor: '#ef4444',
  },
  plannerViewBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#6b7280',
    textTransform: 'capitalize',
  },
  plannerViewBtnTextActive: {
    color: '#fff',
  },
  weekHeaderRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  weekTimeHeader: {
    width: 62,
  },
  weekDayHeader: {
    width: 92,
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: 'center',
    borderLeftWidth: 1,
    borderLeftColor: '#f3f4f6',
  },
  weekDayHeaderActive: {
    backgroundColor: '#fff7ed',
  },
  weekDayName: {
    fontSize: 10,
    fontWeight: '700',
    color: '#9ca3af',
  },
  weekDayNameActive: {
    color: '#ef4444',
  },
  weekDayNumber: {
    marginTop: 4,
    fontSize: 18,
    fontWeight: '900',
    color: '#111827',
  },
  weekDayNumberActive: {
    color: '#ef4444',
  },
  weekGridRow: {
    flexDirection: 'row',
  },
  weekTimeCell: {
    width: 62,
    minHeight: 72,
    paddingTop: 10,
    paddingRight: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
    alignItems: 'flex-end',
  },
  weekTimeText: {
    fontSize: 10,
    color: '#9ca3af',
    fontWeight: '700',
  },
  weekGridCell: {
    width: 92,
    minHeight: 72,
    padding: 6,
    borderLeftWidth: 1,
    borderBottomWidth: 1,
    borderLeftColor: '#f3f4f6',
    borderBottomColor: '#f3f4f6',
    backgroundColor: '#fff',
  },
  weekGridCellSelected: {
    backgroundColor: '#fcfbf7',
  },
  weekGridCellToday: {
    backgroundColor: '#fff9f5',
  },
  weekEventCard: {
    borderLeftWidth: 3,
    borderRadius: 10,
    paddingVertical: 6,
    paddingHorizontal: 7,
    marginBottom: 4,
  },
  weekEventTime: {
    fontSize: 9,
    fontWeight: '800',
  },
  weekEventTitle: {
    marginTop: 3,
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '700',
    color: '#111827',
  },
  weekMoreText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#9ca3af',
  },
  agendaList: {
    gap: 10,
  },
  agendaCard: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'stretch',
    borderRadius: 16,
    padding: 12,
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#eef2f7',
  },
  agendaAccent: {
    width: 5,
    borderRadius: 999,
  },
  agendaTime: {
    fontSize: 11,
    fontWeight: '800',
    color: '#ef4444',
  },
  agendaTitle: {
    marginTop: 5,
    fontSize: 14,
    fontWeight: '800',
    color: '#111827',
  },
  agendaMeta: {
    marginTop: 4,
    fontSize: 12,
    color: '#6b7280',
  },

  taskComposerCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#e7e5e4',
    backgroundColor: '#fff',
    padding: 14,
  },
  taskTitleInput: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#fcfcfd',
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  taskModeRow: {
    marginTop: 12,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  taskModeChip: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#fff',
  },
  taskModeChipActive: {
    backgroundColor: '#111827',
    borderColor: '#111827',
  },
  taskModeChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4b5563',
  },
  taskModeChipTextActive: {
    color: '#fff',
  },
  taskFieldsWrap: {
    marginTop: 14,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  taskFieldBlock: {
    minWidth: 104,
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
  },
  taskFieldLabel: {
    marginBottom: 6,
    fontSize: 11,
    fontWeight: '700',
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  taskFieldSelect: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#fcfcfd',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  taskFieldSelectValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
  },
  taskFieldSelectHint: {
    marginTop: 4,
    fontSize: 12,
    color: '#6b7280',
  },
  sheetOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(15, 23, 42, 0.28)',
  },
  sheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  sheetCard: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: '#fffdf9',
    borderWidth: 1,
    borderColor: '#ebe4d9',
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 24,
    maxHeight: '90%',
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 86,
    height: 6,
    borderRadius: 999,
    backgroundColor: '#d6d3d1',
    marginBottom: 12,
  },
  sheetActionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  },
  sheetActionSpacer: {
    minWidth: 78,
  },
  sheetActionRight: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  sheetGhostAction: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#e5ddd1',
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetGhostActionText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#111827',
  },
  sheetPrimaryAction: {
    borderRadius: 999,
    backgroundColor: '#111827',
    paddingHorizontal: 18,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetPrimaryActionText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#fff',
  },
  sheetTitle: {
    marginTop: 16,
    fontSize: 18,
    fontWeight: '900',
    color: '#111827',
  },
  sheetSubtitle: {
    marginTop: 6,
    fontSize: 13,
    color: '#6b7280',
  },
  sheetMiniCalendarWrap: {
    marginTop: 14,
  },
  sheetDetailPanel: {
    marginTop: 14,
    gap: 8,
  },
  sheetDetailNote: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 18,
    color: '#6b7280',
  },
  timeWheelRow: {
    marginTop: 14,
    flexDirection: 'row',
    gap: 10,
  },
  timeWheelGroup: {
    flex: 1,
  },
  timeWheelLabel: {
    marginBottom: 8,
    fontSize: 11,
    fontWeight: '700',
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    textAlign: 'center',
  },
  timeWheelColumn: {
    position: 'relative',
    height: TIME_WHEEL_ITEM_HEIGHT * (TIME_WHEEL_SIDE_ROWS * 2 + 1),
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#fff',
    overflow: 'hidden',
  },
  timeWheelGuideFrame: {
    position: 'absolute',
    left: 10,
    right: 10,
    top: TIME_WHEEL_ITEM_HEIGHT * TIME_WHEEL_SIDE_ROWS,
    height: TIME_WHEEL_ITEM_HEIGHT,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#d1d5db',
    zIndex: 2,
  },
  timeWheelItem: {
    height: TIME_WHEEL_ITEM_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timeWheelItemText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#9ca3af',
  },
  timeWheelItemTextActive: {
    color: '#111827',
    fontWeight: '800',
  },
  monthYearSectionTitle: {
    marginTop: 16,
    marginBottom: 10,
    fontSize: 11,
    fontWeight: '700',
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  monthYearYearRow: {
    gap: 10,
    paddingRight: 8,
  },
  monthYearYearChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#fff',
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  monthYearYearChipActive: {
    borderColor: '#111827',
  },
  monthYearYearChipText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#6b7280',
  },
  monthYearYearChipTextActive: {
    color: '#111827',
  },
  monthYearGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  monthYearCell: {
    width: '22%',
    minWidth: 74,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#fff',
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthYearCellActive: {
    borderColor: '#111827',
    backgroundColor: '#111827',
  },
  monthYearCellText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#111827',
  },
  monthYearCellTextActive: {
    color: '#fff',
  },
  taskComposerActions: {
    marginTop: 14,
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  taskSaveBtn: {
    minWidth: 118,
    borderRadius: 14,
    backgroundColor: '#d97706',
    paddingHorizontal: 16,
    paddingVertical: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  taskSaveBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#fff',
  },
  taskCancelBtn: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  taskCancelBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#111827',
  },
  taskErrorText: {
    marginTop: 10,
    fontSize: 12,
    color: '#b91c1c',
  },
  taskNoticeText: {
    marginTop: 10,
    fontSize: 12,
    fontWeight: '700',
  },
  taskLoadingWrap: {
    paddingVertical: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  taskList: {
    gap: 10,
  },
  taskItemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  taskCheckBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: '#d1d5db',
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  taskCheckBtnActive: {
    borderColor: '#2563eb',
    backgroundColor: '#2563eb',
  },
  taskCheckBtnText: {
    fontSize: 12,
    fontWeight: '900',
    color: 'transparent',
  },
  taskCheckBtnTextActive: {
    color: '#fff',
  },
  taskItemBody: {
    flex: 1,
  },
  taskItemTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
  },
  taskItemTitleDone: {
    color: '#9ca3af',
    textDecorationLine: 'line-through',
  },
  taskItemMeta: {
    marginTop: 5,
    fontSize: 12,
    color: '#6b7280',
  },
  taskItemActions: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  taskActionBtn: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#fff',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  taskActionBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#111827',
  },
  taskDeleteBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#b91c1c',
  },

  section: { marginTop: 20 },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#374151',
    marginBottom: 10,
  },
  empty: { fontSize: 12, color: '#9ca3af' },

  profileCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#fff',
    padding: 12,
  },
  profileName: { fontSize: 14, fontWeight: '800', color: '#111827' },
  profileMeta: { marginTop: 5, fontSize: 12, color: '#4b5563' },

  events: { gap: 10 },
  gradeCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#fff',
    padding: 12,
  },
  gradeCourseName: { fontSize: 13, fontWeight: '700', color: '#111827' },
  gradeMeta: { marginTop: 6, fontSize: 11, color: '#374151' },
  inlineLinkBtn: {
    marginTop: 8,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    alignSelf: 'flex-start',
  },
  inlineLinkText: { fontSize: 11, fontWeight: '700', color: '#111827' },

  eventItem: {
    flexDirection: 'row',
    gap: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#fff',
  },
  eventClickable: { borderColor: '#111827' },
  eventTag: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: '#f3f4f6',
    alignSelf: 'flex-start',
  },
  eventTagText: { fontSize: 10, fontWeight: '700', color: '#374151' },
  eventTitle: { fontSize: 13, fontWeight: '700', color: '#111827' },
  eventCourse: { marginTop: 4, fontSize: 11, color: '#6b7280' },
  eventDate: { marginTop: 6, fontSize: 11, color: '#111827' },
  eventLink: { marginTop: 5, fontSize: 10, color: '#4b5563' },

  assignmentGroup: {
    marginBottom: 16,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#fff',
  },
  assignmentCourseName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 8,
  },
  assignments: { gap: 10 },
  assignmentItem: {
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#f9fafb',
  },
  assignmentTitle: { fontSize: 12, fontWeight: '700', color: '#111827' },
  assignmentMeta: { marginTop: 4, fontSize: 11, color: '#374151' },
  detailBtn: {
    marginTop: 8,
    alignSelf: 'flex-start',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    paddingVertical: 6,
    paddingHorizontal: 8,
    backgroundColor: '#fff',
  },
  detailBtnText: { fontSize: 11, fontWeight: '700', color: '#111827' },
  detailPanel: {
    marginTop: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#fff',
    padding: 8,
    gap: 6,
  },
  detailHeading: { fontSize: 11, fontWeight: '700', color: '#111827', marginTop: 2 },
  detailRow: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#f3f4f6',
    padding: 6,
    backgroundColor: '#f9fafb',
  },
  detailMeta: { fontSize: 10, color: '#4b5563' },
  detailText: { marginTop: 3, fontSize: 11, color: '#111827' },
  detailMuted: { fontSize: 11, color: '#6b7280' },
  detailError: { fontSize: 11, color: '#ef4444' },
  assignmentHint: { fontSize: 11, color: '#6b7280' },
  collapseBtn: {
    marginTop: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#fff',
    paddingVertical: 8,
    paddingHorizontal: 10,
    alignItems: 'center',
  },
  collapseBtnText: { fontSize: 11, fontWeight: '700', color: '#111827' },
});


