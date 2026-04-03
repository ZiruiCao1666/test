import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  ScrollView,
  Pressable,
  Alert,
  ActivityIndicator,
  Modal,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useUser, useAuth } from '@clerk/clerk-expo';
import { useFocusEffect } from '@react-navigation/native';
import * as SecureStore from 'expo-secure-store';
import * as Linking from 'expo-linking';
import { getDisplayNameFromUser } from '../../lib/user-display';
import { useAppTheme } from '../../lib/app-theme';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL;
const SUMMARY_CACHE_PREFIX = 'home_summary_v1';
const HOME_PLAN_CACHE_PREFIX = 'home_plan_v1';
const HOME_PLAN_RESET_PREFIX = 'home_plan_reset_v1';
const HOME_PLAN_DAYS = 7;
const HOME_REVIEW_DAYS = 365;
const HOME_PLAN_CACHE_TTL_MS = 60 * 1000;
const HOME_PLAN_DEFER_MS = 400;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const TOMORROW_NOTE_MAX_LENGTH = 50;
const DATE_INPUT_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_INPUT_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const REVIEW_RANGE_OPTIONS = [
  {
    key: '7d',
    label: '7 days',
    title: 'Review the previous 7 days',
    emptyLabel: 'the previous 7 days',
    days: 7,
  },
  {
    key: '30d',
    label: '30 days',
    title: 'Review the previous 30 days',
    emptyLabel: 'the previous 30 days',
    days: 30,
  },
  {
    key: 'semester',
    label: 'Semester',
    title: 'Review the previous semester',
    emptyLabel: 'the previous semester',
    days: 120,
  },
  {
    key: '1y',
    label: '1 year',
    title: 'Review the previous year',
    emptyLabel: 'the previous year',
    days: 365,
  },
];

const createInitialReviewExpandedState = () => {
  return {
    '7d': false,
    '30d': false,
    semester: false,
    '1y': false,
  };
};

const getErrorMessage = (error, fallback) => {
  if (error) {
    if (typeof error.message === 'string') {
      if (error.message) {
        return error.message;
      }
    }
  }
  return fallback;
};

const getApiErrorMessage = (data, fallback) => {
  if (data) {
    if (typeof data.error === 'string') {
      if (data.error) {
        return data.error;
      }
    }
  }
  return fallback;
};

const getStyleWhen = (condition, style) => {
  if (condition) {
    return style;
  }
  return null;
};

const formatShortDate = (value) => {
  let safe = '';
  if (value === undefined || value === null) {
    safe = '';
  } else {
    safe = String(value).trim();
  }

  if (!safe) {
    return 'Date not set';
  }

  if (DATE_INPUT_RE.test(safe)) {
    return safe;
  }

  return safe;
};

const formatTimeOnly = (value) => {
  let safe = '';
  if (value === undefined || value === null) {
    safe = '';
  } else {
    safe = String(value).trim();
  }

  if (!TIME_INPUT_RE.test(safe)) {
    if (safe) {
      return safe;
    }
    return '--:--';
  }

  const rawDateTime = '2000-01-01T' + safe + ':00';
  const date = new Date(rawDateTime);
  if (Number.isNaN(date.getTime())) {
    return safe;
  }

  return date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
};

const getDateFromAnyValue = (value) => {
  let safe = '';
  if (value === undefined || value === null) {
    safe = '';
  } else {
    safe = String(value).trim();
  }

  if (!safe) {
    return '';
  }

  if (DATE_INPUT_RE.test(safe)) {
    return safe;
  }

  if (/^\d{4}-\d{2}-\d{2}T/.test(safe)) {
    return safe.slice(0, 10);
  }

  const parsed = new Date(safe);
  if (Number.isNaN(parsed.getTime())) {
    return '';
  }

  return parsed.toISOString().slice(0, 10);
};

const getTimeFromAnyValue = (value) => {
  let safe = '';
  if (value === undefined || value === null) {
    safe = '';
  } else {
    safe = String(value).trim();
  }

  if (!safe) {
    return '';
  }

  if (TIME_INPUT_RE.test(safe)) {
    return safe;
  }

  const hhmmssMatch = safe.match(/^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/);
  if (hhmmssMatch) {
    const hourPart = hhmmssMatch[1];
    const minutePart = hhmmssMatch[2];
    return hourPart + ':' + minutePart;
  }

  const parsed = new Date(safe);
  if (Number.isNaN(parsed.getTime())) {
    return '';
  }

  return parsed.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
};

const getTimestampNumber = (value) => {
  if (typeof value === 'number') {
    if (Number.isFinite(value)) {
      return value;
    }
  }

  if (typeof value === 'string') {
    const safe = value.trim();
    if (!safe) {
      return null;
    }

    const parsed = Number(safe);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
};

const getCustomTaskTimestamp = (item) => {
  const safeItem = item || {};

  let taskDate = getDateFromAnyValue(safeItem.taskDate);
  if (!taskDate) {
    taskDate = getDateFromAnyValue(safeItem.date);
  }

  if (!DATE_INPUT_RE.test(taskDate)) {
    return null;
  }

  let timingMode = 'deadline';
  if (safeItem.timingMode === undefined || safeItem.timingMode === null) {
    timingMode = 'deadline';
  } else {
    timingMode = String(safeItem.timingMode).trim().toLowerCase();
  }

  let sourceTime = '';
  if (timingMode === 'range') {
    sourceTime = getTimeFromAnyValue(safeItem.startTime);
  } else {
    sourceTime = getTimeFromAnyValue(safeItem.dueTime);
  }

  if (!sourceTime) {
    sourceTime = getTimeFromAnyValue(safeItem.date);
  }

  if (!TIME_INPUT_RE.test(sourceTime)) {
    sourceTime = '12:00';
  }

  const rawDateTime = taskDate + 'T' + sourceTime + ':00';
  const parsed = new Date(rawDateTime).getTime();
  if (Number.isFinite(parsed)) {
    return parsed;
  }

  return null;
};

const getItemTimestamp = (item) => {
  const safeItem = item || {};
  const timestampMs = getTimestampNumber(safeItem.timestampMs);

  if (timestampMs !== null) {
    return timestampMs;
  }

  if (safeItem.source === 'custom') {
    const customTimestamp = getCustomTaskTimestamp(safeItem);
    if (customTimestamp !== null) {
      return customTimestamp;
    }
  }

  let rawDate = '';
  if (safeItem.date === undefined || safeItem.date === null) {
    rawDate = '';
  } else {
    rawDate = String(safeItem.date);
  }

  const parsed = new Date(rawDate).getTime();
  if (Number.isFinite(parsed)) {
    return parsed;
  }

  return null;
};

const getCustomScheduleText = (item) => {
  const safeItem = item || {};

  let taskDate = getDateFromAnyValue(safeItem.taskDate);
  if (!taskDate) {
    taskDate = getDateFromAnyValue(safeItem.date);
  }

  let timingMode = 'deadline';
  if (safeItem.timingMode === undefined || safeItem.timingMode === null) {
    timingMode = 'deadline';
  } else {
    timingMode = String(safeItem.timingMode).trim().toLowerCase();
  }

  if (DATE_INPUT_RE.test(taskDate)) {
    const dateLabel = formatShortDate(taskDate);

    if (timingMode === 'range') {
      let startTime = getTimeFromAnyValue(safeItem.startTime);
      if (!startTime) {
        startTime = getTimeFromAnyValue(safeItem.date);
      }

      const endTime = getTimeFromAnyValue(safeItem.endTime);
      const startText = formatTimeOnly(startTime);
      const endText = formatTimeOnly(endTime);
      return dateLabel + ' ' + startText + ' - ' + endText;
    }

    let dueTime = getTimeFromAnyValue(safeItem.dueTime);
    if (!dueTime) {
      dueTime = getTimeFromAnyValue(safeItem.date);
    }

    const dueText = formatTimeOnly(dueTime);
    return dateLabel + ' ' + dueText;
  }

  if (safeItem.date) {
    const fallbackDate = getDateFromAnyValue(safeItem.date);
    const fallbackTime = getTimeFromAnyValue(safeItem.date);
    if (fallbackDate) {
      if (fallbackTime) {
        return fallbackDate + ' ' + fallbackTime;
      }
    }
  }
  if (safeItem.scheduleText) {
    return String(safeItem.scheduleText);
  }
  return 'Time not synced';
};

const formatDaysLeft = (item) => {
  const timestamp = getItemTimestamp(item);
  if (timestamp === null) {
    return 'Time pending';
  }

  const diffMs = timestamp - Date.now();
  if (diffMs <= 0) {
    return 'Due now';
  }

  if (diffMs <= ONE_DAY_MS) {
    const hoursLeft = Math.max(1, Math.ceil(diffMs / (60 * 60 * 1000)));
    return String(hoursLeft) + 'h left';
  }

  const date = new Date(timestamp);
  const now = new Date(Date.now());
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfTargetDay = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate()
  ).getTime();
  const diffDays = Math.round((startOfTargetDay - startOfToday) / ONE_DAY_MS);

  if (diffDays <= 0) {
    return 'Due today';
  }

  if (diffDays === 1) {
    return '1 day left';
  }

  return String(diffDays) + ' days left';
};

const formatPlanDateTime = (item) => {
  const safeItem = item || {};

  if (safeItem.source === 'custom') {
    return getCustomScheduleText(safeItem);
  }

  const timestamp = getItemTimestamp(safeItem);
  if (timestamp === null) {
    if (safeItem.date) {
      return String(safeItem.date);
    }
    return 'Time not synced';
  }

  const date = new Date(timestamp);
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
};

const getPlanDetail = (item) => {
  const safeItem = item || {};

  if (safeItem.source === 'canvas') {
    const parts = [safeItem.course, safeItem.type].filter(Boolean);
    if (parts.length > 0) {
      return parts.join(' | ');
    }
    return 'Canvas item';
  }
  return safeItem.type || 'Custom task';
};

const getSummaryStatusText = (hasError, checkedInToday) => {
  if (hasError) {
    return 'summary sync delayed';
  }
  if (checkedInToday) {
    return 'today: checked';
  }
  return 'today: not yet';
};

const getPlanSourceLabel = (item) => {
  const safeItem = item || {};
  if (safeItem.source === 'custom') {
    return 'Custom';
  }
  return 'Canvas';
};

const getPlanSourceBadgeStyle = (item, isDarkTheme) => {
  const safeItem = item || {};
  if (safeItem.source === 'custom') {
    if (isDarkTheme) {
      return { backgroundColor: '#1F3A34' };
    }
    return styles.todoSourceBadgeCustom;
  }
  if (isDarkTheme) {
    return { backgroundColor: '#243B5B' };
  }
  return styles.todoSourceBadgeCanvas;
};

const getSummaryValueText = (summaryReady, value) => {
  if (summaryReady) {
    return value;
  }
  return '...';
};

const getCheckInButtonText = (checkedInToday) => {
  if (checkedInToday) {
    return 'Checked in\ntoday';
  }
  return 'Click to\ncheck in';
};

const normalizeTomorrowNoteInput = (value) => {
  let safeValue = '';
  if (value === undefined || value === null) {
    safeValue = '';
  } else {
    safeValue = String(value);
  }

  if (safeValue.length > TOMORROW_NOTE_MAX_LENGTH) {
    return safeValue.slice(0, TOMORROW_NOTE_MAX_LENGTH);
  }

  return safeValue;
};

const getTomorrowNoteSaveButtonText = (saving) => {
  if (saving) {
    return 'Saving...';
  }
  return 'Save for tomorrow';
};

const getPlanEmptyMessage = (canvasConnected) => {
  if (canvasConnected) {
    return 'No Canvas or custom tasks in the next seven days.';
  }
  return 'No custom tasks in the next seven days.';
};

const getReviewEmptyMessage = (label = 'the previous seven days', canvasConnected = true) => {
  if (canvasConnected) {
    return 'No Canvas or custom tasks in ' + label + '.';
  }
  return 'No custom tasks in ' + label + '.';
};

const getReviewStatusText = (item) => {
  const safeItem = item || {};
  if (safeItem.isCompleted) {
    return 'Completed';
  }
  return 'Not completed';
};

const getReviewSummaryText = (summary, items) => {
  const safeSummary = summary || {};
  let totalCount = 0;
  if (typeof safeSummary.totalCount === 'number') {
    if (Number.isFinite(safeSummary.totalCount)) {
      totalCount = safeSummary.totalCount;
    }
  } else if (Array.isArray(items)) {
    totalCount = items.length;
  }

  let completedCount = 0;
  if (typeof safeSummary.completedCount === 'number') {
    if (Number.isFinite(safeSummary.completedCount)) {
      completedCount = safeSummary.completedCount;
    }
  } else if (Array.isArray(items)) {
    items.forEach((item) => {
      const safeItem = item || {};
      if (safeItem.isCompleted) {
        completedCount += 1;
      }
    });
  }

  return 'Completed ' + String(completedCount) + ' of ' + String(totalCount) + ' tasks';
};

const filterReviewItemsByDays = (items, days) => {
  if (!Array.isArray(items)) {
    return [];
  }

  const nowTs = Date.now();
  const windowStartTs = nowTs - days * ONE_DAY_MS;

  return items.filter((item) => {
    const timestamp = getItemTimestamp(item);
    if (timestamp === null) {
      return false;
    }
    if (timestamp < windowStartTs) {
      return false;
    }
    if (timestamp > nowTs) {
      return false;
    }
    return true;
  });
};

const buildReviewSummary = (items) => {
  let completedCount = 0;
  let totalCount = 0;

  if (Array.isArray(items)) {
    totalCount = items.length;
    items.forEach((item) => {
      const safeItem = item || {};
      if (safeItem.isCompleted) {
        completedCount += 1;
      }
    });
  }

  return {
    totalCount,
    completedCount,
  };
};

const buildPlanRowProps = (item, openPlanItem) => {
  const safeItem = item || {};
  if (safeItem.htmlUrl) {
    return {
      onPress: function () {
        openPlanItem(safeItem);
      },
    };
  }
  return {};
};

const renderAvatarNode = (avatarUrl, avatarInitial, fallbackBackgroundColor, fallbackTextColor) => {
  if (avatarUrl) {
    return <Image source={{ uri: avatarUrl }} style={styles.avatar} />;
  }
  return (
    <View
      style={[
        styles.avatar,
        styles.avatarFallback,
        { backgroundColor: fallbackBackgroundColor },
      ]}
    >
      <Text style={[styles.avatarFallbackText, { color: fallbackTextColor }]}>{avatarInitial}</Text>
    </View>
  );
};

const renderTodoAvatarNode = (
  avatarUrl,
  avatarInitial,
  fallbackBackgroundColor,
  fallbackTextColor
) => {
  if (avatarUrl) {
    return <Image source={{ uri: avatarUrl }} style={styles.todoAvatar} />;
  }
  return (
    <View
      style={[
        styles.todoAvatar,
        styles.avatarFallback,
        { backgroundColor: fallbackBackgroundColor },
      ]}
    >
      <Text style={[styles.avatarFallbackText, { color: fallbackTextColor }]}>{avatarInitial}</Text>
    </View>
  );
};

const groupPlanItems = (items) => {
  const nowTs = Date.now();
  const sections = [
    { key: '24h', title: 'Within 24 hours', items: [] },
    { key: '3d', title: 'Within 3 days', items: [] },
    { key: '7d', title: 'Within 7 days', items: [] },
  ];

  let safeItems = [];
  if (Array.isArray(items)) {
    safeItems = items;
  }
  safeItems.forEach((item) => {
    const timestamp = getItemTimestamp(item);
    if (timestamp === null) {
      sections[2].items.push(item);
      return;
    }

    const diffMs = timestamp - nowTs;
    if (diffMs <= ONE_DAY_MS) {
      sections[0].items.push(item);
      return;
    }
    if (diffMs <= 3 * ONE_DAY_MS) {
      sections[1].items.push(item);
      return;
    }
    sections[2].items.push(item);
  });

  return sections.filter((section) => section.items.length > 0);
};

const countTasksDueToday = (items) => {
  if (!Array.isArray(items)) {
    return 0;
  }

  const now = new Date();
  let total = 0;

  items.forEach((item) => {
    const timestamp = getItemTimestamp(item);
    if (timestamp === null) {
      return;
    }

    const date = new Date(timestamp);
    if (date.getFullYear() !== now.getFullYear()) {
      return;
    }
    if (date.getMonth() !== now.getMonth()) {
      return;
    }
    if (date.getDate() !== now.getDate()) {
      return;
    }

    total += 1;
  });

  return total;
};

const getHomeHeroBadgeText = (dueTodayCount, totalUpcomingCount) => {
  if (dueTodayCount === 1) {
    return 'You have 1 task due today';
  }
  if (dueTodayCount > 1) {
    return 'You have ' + String(dueTodayCount) + ' tasks due today';
  }
  if (totalUpcomingCount > 0) {
    return 'Your next task is coming up';
  }
  return 'No tasks due today';
};

const getProgressBarWidth = (completedCount, totalCount) => {
  if (totalCount <= 0) {
    return '0%';
  }

  let percentNumber = (completedCount / totalCount) * 100;
  if (percentNumber < 0) {
    percentNumber = 0;
  }
  if (percentNumber > 100) {
    percentNumber = 100;
  }

  return String(percentNumber) + '%';
};

const getStreakCycleDays = (streakDays) => {
  if (streakDays <= 0) {
    return 0;
  }

  const remainder = streakDays % 7;
  if (remainder === 0) {
    return 7;
  }

  return remainder;
};

const getWeeklyProgressHintText = (completedCount, totalCount) => {
  if (totalCount <= 0) {
    return 'No completed tasks yet this week';
  }
  if (completedCount >= totalCount) {
    return 'You completed every task from the last 7 days';
  }
  return 'Stay on track for your weekly goal';
};

export default function HomeScreen() {
  const { user, isLoaded: userLoaded } = useUser();
  const { isLoaded: authLoaded, isSignedIn, getToken } = useAuth();
  const { theme } = useAppTheme();
  const safeUser = user || {};
  const userId = safeUser.id || null;

  const username = getDisplayNameFromUser(safeUser);
  const avatarUrl = safeUser.imageUrl || null;
  const avatarInitial = String(username || '').trim().charAt(0).toUpperCase() || 'U';
  const isDarkTheme = theme.mode === 'dark';

  let canvasBadgeBackgroundColor = '#DBEAFE';
  let customBadgeBackgroundColor = '#DCFCE7';
  let linkHintColor = '#2563EB';
  let warningColor = '#B45309';
  let errorColor = '#B91C1C';
  let checkInCircleBackgroundColor = theme.surfaceMuted;
  let checkInCircleTextColor = theme.textPrimary;
  let avatarFallbackBackgroundColor = theme.surfaceMuted;
  let avatarFallbackTextColor = theme.textPrimary;
  if (isDarkTheme) {
    canvasBadgeBackgroundColor = '#243B5B';
    customBadgeBackgroundColor = '#1F3A34';
    linkHintColor = '#8CB4FF';
    warningColor = '#F0B36D';
    errorColor = '#F29B96';
    checkInCircleBackgroundColor = theme.heroBg;
    checkInCircleTextColor = theme.textOnDark;
    avatarFallbackBackgroundColor = theme.secondaryBg;
    avatarFallbackTextColor = theme.secondaryText;
  }


  const [totalSignedDays, setTotalSignedDays] = React.useState(0);
  const [streakDays, setStreakDays] = React.useState(0);
  const [checkedInToday, setCheckedInToday] = React.useState(false);
  const [points, setPoints] = React.useState(0);
  const [todayNote, setTodayNote] = React.useState('');

  const [loadingSummary, setLoadingSummary] = React.useState(false);
  const [summaryError, setSummaryError] = React.useState(null);
  const [checkingIn, setCheckingIn] = React.useState(false);
  const [summaryReady, setSummaryReady] = React.useState(false);
  const [noteModalVisible, setNoteModalVisible] = React.useState(false);
  const [noteDraft, setNoteDraft] = React.useState('');
  const [yesterdayNote, setYesterdayNote] = React.useState('');
  const [noteSaving, setNoteSaving] = React.useState(false);
  const [noteError, setNoteError] = React.useState('');
  const [noteModalTitle, setNoteModalTitle] = React.useState('Note for tomorrow');
  const [noteModalSubtitle, setNoteModalSubtitle] = React.useState('');
  const [homePlanItems, setHomePlanItems] = React.useState([]);
  const [recentPlanItems, setRecentPlanItems] = React.useState([]);
  const [loadingHomePlan, setLoadingHomePlan] = React.useState(false);
  const [homePlanError, setHomePlanError] = React.useState(null);
  const [canvasPlanWarning, setCanvasPlanWarning] = React.useState('');
  const [homeCanvasConnected, setHomeCanvasConnected] = React.useState(false);
  const [expandedReviewSections, setExpandedReviewSections] = React.useState(() =>
    createInitialReviewExpandedState()
  );

  const summaryRetryRef = React.useRef(0);
  const getTokenRef = React.useRef(getToken);
  const homePlanLoadedAtRef = React.useRef(0);

  React.useEffect(() => {
    getTokenRef.current = getToken;
  }, [getToken]);

  const fetchWithTimeout = React.useCallback(async (url, options = {}, timeoutMs = 25000) => {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);

    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } finally {
      clearTimeout(id);
    }
  }, []);

  const summaryCacheKey = React.useMemo(() => {
    if (!userId) {
      return null;
    }
    return SUMMARY_CACHE_PREFIX + ':' + userId;
  }, [userId]);

  const homePlanCacheKey = React.useMemo(() => {
    if (!userId) {
      return null;
    }
    return HOME_PLAN_CACHE_PREFIX + ':' + userId;
  }, [userId]);

  const homePlanResetKey = React.useMemo(() => {
    if (!userId) {
      return null;
    }
    return HOME_PLAN_RESET_PREFIX + ':' + userId;
  }, [userId]);

  const applySummaryData = React.useCallback((data = {}) => {
    const safeData = data || {};
    const nextTotal = Number(safeData.totalDays) || 0;
    let nextStreak = nextTotal;
    if (safeData.streakDays !== undefined) {
      nextStreak = Number(safeData.streakDays) || 0;
    }

    setTotalSignedDays(nextTotal);
    setStreakDays(nextStreak);
    setCheckedInToday(Boolean(safeData.checkedInToday));
    setPoints(Number(safeData.points) || 0);
    setTodayNote(normalizeTomorrowNoteInput(safeData.todayNote));
    setSummaryReady(true);
  }, []);

  const persistSummaryToCache = React.useCallback(async (data = {}) => {
    if (!summaryCacheKey) {
      return;
    }

    try {
      const safeData = data || {};
      const payload = {
        totalDays: Number(safeData.totalDays) || 0,
        streakDays: undefined,
        checkedInToday: Boolean(safeData.checkedInToday),
        points: Number(safeData.points) || 0,
        todayNote: normalizeTomorrowNoteInput(safeData.todayNote),
        updatedAt: Date.now(),
      };
      if (safeData.streakDays !== undefined) {
        payload.streakDays = Number(safeData.streakDays) || 0;
      }

      await SecureStore.setItemAsync(summaryCacheKey, JSON.stringify(payload));
    } catch (_e) {
      // Ignore cache write errors.
    }
  }, [summaryCacheKey]);

  const hydrateSummaryFromCache = React.useCallback(async () => {
    if (!summaryCacheKey) {
      return false;
    }

    try {
      const raw = await SecureStore.getItemAsync(summaryCacheKey);
      if (!raw) {
        return false;
      }

      const cached = JSON.parse(raw);
      applySummaryData(cached);
      return true;
    } catch (_e) {
      return false;
    }
  }, [summaryCacheKey, applySummaryData]);

  const applyHomePlanData = React.useCallback((data = {}) => {
    const safeData = data || {};

    let nextItems = [];
    if (Array.isArray(safeData.items)) {
      nextItems = safeData.items;
    }

    let nextRecentItems = [];
    if (Array.isArray(safeData.recentItems)) {
      nextRecentItems = safeData.recentItems;
    }

    let nextCanvasConnected = false;
    if (safeData.canvasConnected) {
      nextCanvasConnected = true;
    }

    let nextCanvasWarning = '';
    if (nextCanvasConnected) {
      if (typeof safeData.canvasError === 'string') {
        nextCanvasWarning = safeData.canvasError.trim();
      }
    }

    setHomePlanItems(nextItems);
    setRecentPlanItems(nextRecentItems);
    setHomeCanvasConnected(nextCanvasConnected);
    setCanvasPlanWarning(nextCanvasWarning);
    setHomePlanError(null);

    if (typeof safeData.updatedAt === 'number') {
      if (Number.isFinite(safeData.updatedAt)) {
        homePlanLoadedAtRef.current = safeData.updatedAt;
        return;
      }
    }
    homePlanLoadedAtRef.current = Date.now();
  }, []);

  const persistHomePlanToCache = React.useCallback(async (data = {}) => {
    if (!homePlanCacheKey) {
      return;
    }

    try {
      const safeData = data || {};
      const payload = {
        items: [],
        recentItems: [],
        canvasConnected: Boolean(safeData.canvasConnected),
        canvasError: '',
        updatedAt: Date.now(),
      };

      if (Array.isArray(safeData.items)) {
        payload.items = safeData.items;
      }
      if (Array.isArray(safeData.recentItems)) {
        payload.recentItems = safeData.recentItems;
      }
      if (typeof safeData.canvasError === 'string') {
        payload.canvasError = safeData.canvasError.trim();
      }

      await SecureStore.setItemAsync(homePlanCacheKey, JSON.stringify(payload));
    } catch (_e) {
      // Ignore cache write errors.
    }
  }, [homePlanCacheKey]);

  const hydrateHomePlanFromCache = React.useCallback(async () => {
    if (!homePlanCacheKey) {
      return false;
    }

    try {
      const raw = await SecureStore.getItemAsync(homePlanCacheKey);
      if (!raw) {
        return false;
      }

      const cached = JSON.parse(raw);
      applyHomePlanData(cached);
      return true;
    } catch (_e) {
      return false;
    }
  }, [homePlanCacheKey, applyHomePlanData]);

  const clearHomePlanCache = React.useCallback(async () => {
    if (!homePlanCacheKey) {
      return;
    }

    try {
      await SecureStore.deleteItemAsync(homePlanCacheKey);
    } catch (_e) {
      // Ignore cache delete errors.
    }
  }, [homePlanCacheKey]);

  const consumeHomePlanResetFlag = React.useCallback(async () => {
    if (!homePlanResetKey) {
      return false;
    }

    try {
      const raw = await SecureStore.getItemAsync(homePlanResetKey);
      if (!raw) {
        return false;
      }

      await SecureStore.deleteItemAsync(homePlanResetKey);
      return true;
    } catch (_e) {
      return false;
    }
  }, [homePlanResetKey]);

  const clearCanvasItemsFromHomeState = React.useCallback(() => {
    setHomePlanItems((prev) => {
      if (!Array.isArray(prev)) {
        return [];
      }
      return prev.filter((item) => {
        const safeItem = item || {};
        return safeItem.source === 'custom';
      });
    });

    setRecentPlanItems((prev) => {
      if (!Array.isArray(prev)) {
        return [];
      }
      return prev.filter((item) => {
        const safeItem = item || {};
        return safeItem.source === 'custom';
      });
    });

    setHomeCanvasConnected(false);
    setCanvasPlanWarning('');
    setHomePlanError(null);
    homePlanLoadedAtRef.current = 0;
  }, []);

  const getSessionToken = React.useCallback(async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const tokenGetter = getTokenRef.current;
      let token = '';
      if (tokenGetter) {
        token = await tokenGetter();
      }
      if (token) {
        return token;
      }
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    return '';
  }, []);

  const loadSummary = React.useCallback(async (options = {}) => {
    const { silent = false, timeoutMs = 25000 } = options;

    try {
      if (!silent) {
        setLoadingSummary(true);
      }
      setSummaryError(null);

      if (!API_BASE_URL) {
        throw new Error('Missing EXPO_PUBLIC_API_URL. Set it to your Render URL and restart Expo.');
      }

      if (!authLoaded || !isSignedIn || !userLoaded || !userId) {
        return;
      }

      const token = await getSessionToken();
      if (!token) {
        return;
      }

      const statusUrl = API_BASE_URL + '/checkins/status';
      const res = await fetchWithTimeout(statusUrl, {
        headers: { Authorization: 'Bearer ' + token },
      }, timeoutMs);

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(getApiErrorMessage(data, 'Failed to load summary'));

      applySummaryData(data);
      persistSummaryToCache(data);
      summaryRetryRef.current = 0;
    } catch (e) {
      if (e) {
        if (e.name === 'AbortError') {
          setSummaryError('Network is slow. Retrying in background...');
        } else {
          setSummaryError(getErrorMessage(e, 'Failed to load summary'));
        }
      } else {
        setSummaryError(getErrorMessage(e, 'Failed to load summary'));
      }

      if (summaryRetryRef.current < 2) {
        summaryRetryRef.current += 1;
        setTimeout(() => {
          loadSummary({ silent: true, timeoutMs: 25000 });
        }, 1500);
      }

    } finally {
      if (!silent) {
        setLoadingSummary(false);
      }
    }
  }, [
    fetchWithTimeout,
    authLoaded,
    isSignedIn,
    userLoaded,
    userId,
    applySummaryData,
    persistSummaryToCache,
    getSessionToken,
  ]);

  const loadHomePlan = React.useCallback(async (options = {}) => {
    const { silent = false, timeoutMs = 25000 } = options;

    try {
      if (!silent) {
        setLoadingHomePlan(true);
      }
      setHomePlanError(null);
      setCanvasPlanWarning('');

      if (!API_BASE_URL) {
        throw new Error('Missing EXPO_PUBLIC_API_URL. Set it to your Render URL and restart Expo.');
      }

      if (!authLoaded || !isSignedIn || !userLoaded || !userId) {
        return;
      }

      const token = await getSessionToken();
      if (!token) {
        return;
      }

      const homePlanUrl =
        API_BASE_URL +
        '/home/plan?days=' +
        String(HOME_PLAN_DAYS) +
        '&recentDays=' +
        String(HOME_REVIEW_DAYS);
      const res = await fetchWithTimeout(
        homePlanUrl,
        {
          headers: { Authorization: 'Bearer ' + token },
        },
        timeoutMs
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(getApiErrorMessage(data, 'Failed to load seven-day plan'));

      let items = [];
      if (data) {
        if (Array.isArray(data.items)) {
          items = data.items.slice();
        }
      }

      let recentItems = [];
      if (data) {
        if (Array.isArray(data.recentItems)) {
          recentItems = data.recentItems.slice();
        }
      }

      let nextCanvasConnected = false;
      if (data) {
        nextCanvasConnected = Boolean(data.canvasConnected);
      }
      let nextCanvasError = '';
      if (data) {
        if (data.canvasConnected) {
          if (data.canvasError) {
            nextCanvasError = String(data.canvasError).trim();
          }
        }
      }

      applyHomePlanData({
        items,
        recentItems,
        canvasConnected: nextCanvasConnected,
        canvasError: nextCanvasError,
      });
      persistHomePlanToCache({
        items,
        recentItems,
        canvasConnected: nextCanvasConnected,
        canvasError: nextCanvasError,
      });
    } catch (e) {
      setHomePlanError(getErrorMessage(e, 'Failed to load seven-day plan'));
    } finally {
      if (!silent) {
        setLoadingHomePlan(false);
      }
    }
  }, [
    fetchWithTimeout,
    authLoaded,
    isSignedIn,
    userLoaded,
    userId,
    getSessionToken,
    applyHomePlanData,
    persistHomePlanToCache,
  ]);

  useFocusEffect(
    React.useCallback(() => {
      if (!authLoaded || !isSignedIn || !userLoaded || !userId) {
        return undefined;
      }

      let alive = true;
      let homePlanTimer = null;

      (async () => {
        const hasCache = await hydrateSummaryFromCache();
        const hasHomePlanReset = await consumeHomePlanResetFlag();
        if (!alive) {
          return;
        }

        if (hasHomePlanReset) {
          clearCanvasItemsFromHomeState();
          await clearHomePlanCache();
        }

        let hasHomePlanCache = false;
        if (!hasHomePlanReset) {
          hasHomePlanCache = await hydrateHomePlanFromCache();
          if (!alive) {
            return;
          }
        }

        loadSummary({ silent: hasCache, timeoutMs: 25000 });

        let shouldRefreshHomePlan = false;
        if (!hasHomePlanCache) {
          shouldRefreshHomePlan = true;
        } else if (homePlanLoadedAtRef.current <= 0) {
          shouldRefreshHomePlan = true;
        } else if (Date.now() - homePlanLoadedAtRef.current >= HOME_PLAN_CACHE_TTL_MS) {
          shouldRefreshHomePlan = true;
        }

        if (!shouldRefreshHomePlan) {
          return;
        }

        homePlanTimer = setTimeout(() => {
          if (!alive) {
            return;
          }
          loadHomePlan({ silent: hasHomePlanCache, timeoutMs: 25000 });
        }, HOME_PLAN_DEFER_MS);
      })();

      return () => {
        alive = false;
        if (homePlanTimer) {
          clearTimeout(homePlanTimer);
        }
      };
    }, [
      authLoaded,
      isSignedIn,
      userLoaded,
      userId,
      hydrateSummaryFromCache,
      consumeHomePlanResetFlag,
      clearCanvasItemsFromHomeState,
      clearHomePlanCache,
      hydrateHomePlanFromCache,
      loadSummary,
      loadHomePlan,
    ]),
  );

  const onCheckIn = async () => {
    if (checkingIn) {
      return;
    }

    if (checkedInToday) {
      openTomorrowNoteModal({
        mode: 'edit',
        todayNote,
        yesterdayNote: '',
      });
      return;
    }

    try {
      setCheckingIn(true);

      if (!API_BASE_URL) {
        throw new Error('Missing EXPO_PUBLIC_API_URL. Set it to your Render URL and restart Expo.');
      }

      if (!authLoaded || !isSignedIn) {
        throw new Error('Not signed in');
      }

      const token = await getSessionToken();
      if (!token) throw new Error('No session token');

      const checkInUrl = API_BASE_URL + '/checkins/today';
      const res = await fetch(checkInUrl, {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token },
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(getApiErrorMessage(data, 'Check-in failed'));

      setSummaryError(null);
      applySummaryData(data);
      persistSummaryToCache(data);

      const gained = Number(data.gainedPoints) || 0;
      openTomorrowNoteModal({
        mode: 'afterCheckIn',
        todayNote: data.todayNote,
        yesterdayNote: data.yesterdayNote,
        gainedPoints: gained,
      });
    } catch (e) {
      Alert.alert('Error', getErrorMessage(e, 'Something went wrong'));
    } finally {
      setCheckingIn(false);
    }
  };

  const lastingDays = streakDays || totalSignedDays;
  const groupedHomePlan = React.useMemo(() => groupPlanItems(homePlanItems), [homePlanItems]);
  const dueTodayCount = React.useMemo(() => countTasksDueToday(homePlanItems), [homePlanItems]);
  let totalUpcomingCount = 0;
  groupedHomePlan.forEach((section) => {
    const safeSection = section || {};
    if (Array.isArray(safeSection.items)) {
      totalUpcomingCount += safeSection.items.length;
    }
  });
  const heroBadgeText = getHomeHeroBadgeText(dueTodayCount, totalUpcomingCount);
  const weeklyReviewItems = React.useMemo(() => {
    return filterReviewItemsByDays(recentPlanItems, 7);
  }, [recentPlanItems]);
  const weeklyProgressSummary = React.useMemo(() => {
    return buildReviewSummary(weeklyReviewItems);
  }, [weeklyReviewItems]);
  const weeklyCompletedCount = weeklyProgressSummary.completedCount || 0;
  const weeklyTotalCount = weeklyProgressSummary.totalCount || 0;
  const weeklyProgressWidth = getProgressBarWidth(weeklyCompletedCount, weeklyTotalCount);
  const weeklyProgressHintText = getWeeklyProgressHintText(weeklyCompletedCount, weeklyTotalCount);
  const reviewSections = React.useMemo(() => {
    return REVIEW_RANGE_OPTIONS.map((range) => {
      const items = filterReviewItemsByDays(recentPlanItems, range.days);
      const summary = buildReviewSummary(items);
      return {
        key: range.key,
        title: range.title,
        emptyLabel: range.emptyLabel,
        items,
        summaryText: getReviewSummaryText(summary, items),
      };
    });
  }, [recentPlanItems]);
  const openPlanItem = React.useCallback(async (item) => {
    const safeItem = item || {};
    if (!safeItem.htmlUrl) {
      return;
    }
    try {
      await Linking.openURL(safeItem.htmlUrl);
    } catch (_error) {
      Alert.alert('Open failed', 'Cannot open this Canvas link on the current device.');
    }
  }, []);

  const toggleReviewSection = React.useCallback((sectionKey) => {
    setExpandedReviewSections((prev) => {
      const safePrev = prev || {};
      const nextValue = !safePrev[sectionKey];
      return {
        ...safePrev,
        [sectionKey]: nextValue,
      };
    });
  }, []);

  const openTomorrowNoteModal = React.useCallback((options = {}) => {
    const safeOptions = options || {};
    const nextTodayNote = normalizeTomorrowNoteInput(safeOptions.todayNote);
    const nextYesterdayNote = normalizeTomorrowNoteInput(safeOptions.yesterdayNote);
    let nextTitle = 'Note for tomorrow';
    let nextSubtitle = 'Write one short line for tomorrow.';

    if (safeOptions.mode === 'afterCheckIn') {
      nextTitle = 'Checked in today';
      const gainedPoints = Number(safeOptions.gainedPoints) || 0;
      if (gainedPoints > 0) {
        nextSubtitle = '+' + String(gainedPoints) + ' points today';
      } else {
        nextSubtitle = 'You can leave a note for tomorrow.';
      }
    }

    setNoteDraft(nextTodayNote);
    setYesterdayNote(nextYesterdayNote);
    setNoteError('');
    setNoteModalTitle(nextTitle);
    setNoteModalSubtitle(nextSubtitle);
    setNoteModalVisible(true);
  }, []);

  const closeTomorrowNoteModal = React.useCallback(() => {
    if (noteSaving) {
      return;
    }
    setNoteModalVisible(false);
    setNoteError('');
  }, [noteSaving]);

  const saveTomorrowNote = React.useCallback(async () => {
    if (noteSaving) {
      return;
    }

    try {
      setNoteSaving(true);
      setNoteError('');

      if (!API_BASE_URL) {
        throw new Error('Missing EXPO_PUBLIC_API_URL. Set it to your Render URL and restart Expo.');
      }

      if (!authLoaded || !isSignedIn) {
        throw new Error('Not signed in');
      }

      const token = await getSessionToken();
      if (!token) {
        throw new Error('No session token');
      }

      const safeNote = normalizeTomorrowNoteInput(noteDraft);
      const saveNoteUrl = API_BASE_URL + '/checkins/today-note';
      const res = await fetch(saveNoteUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + token,
        },
        body: JSON.stringify({ note: safeNote }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(getApiErrorMessage(data, 'Failed to save note for tomorrow'));
      }

      const savedNote = normalizeTomorrowNoteInput(data.todayNote);
      setTodayNote(savedNote);
      setNoteDraft(savedNote);
      persistSummaryToCache({
        totalDays: totalSignedDays,
        streakDays,
        checkedInToday,
        points,
        todayNote: savedNote,
      });
      setNoteModalVisible(false);
    } catch (error) {
      setNoteError(getErrorMessage(error, 'Failed to save note for tomorrow'));
    } finally {
      setNoteSaving(false);
    }
  }, [
    noteSaving,
    authLoaded,
    isSignedIn,
    getSessionToken,
    noteDraft,
    persistSummaryToCache,
    totalSignedDays,
    streakDays,
    checkedInToday,
    points,
  ]);

  let lastingDaysValueNode = <ActivityIndicator color={theme.primary} />;
  if (summaryReady) {
    let loadingIndicatorNode = null;
    if (loadingSummary) {
      loadingIndicatorNode = (
        <ActivityIndicator color={theme.primary} size="small" style={{ marginTop: 6 }} />
      );
    }
    lastingDaysValueNode = (
      <>
        <Text style={[styles.cardBig, { color: theme.textPrimary }]}>
          {lastingDays}
          <Text style={[styles.cardBigUnit, { color: theme.textPrimary }]}> days</Text>
        </Text>
        {loadingIndicatorNode}
      </>
    );
  }

  let pointsValueNode = <ActivityIndicator color={theme.primary} />;
  if (summaryReady) {
    let loadingIndicatorNode = null;
    if (loadingSummary) {
      loadingIndicatorNode = (
        <ActivityIndicator color={theme.primary} size="small" style={{ marginTop: 6 }} />
      );
    }
    pointsValueNode = (
      <>
        <Text style={[styles.cardBig, { color: theme.textPrimary }]}>{points}</Text>
        {loadingIndicatorNode}
      </>
    );
  }

  let summaryErrorNode = null;
  if (summaryError) {
    summaryErrorNode = (
      <Text style={{ marginBottom: 10, fontSize: 12, color: errorColor }}>
        {summaryError}
      </Text>
    );
  }

  let checkInCircleNode = (
    <Text style={[styles.circleText, { color: checkInCircleTextColor }]}>
      {getCheckInButtonText(checkedInToday)}
    </Text>
  );
  if (checkingIn) {
    checkInCircleNode = <ActivityIndicator color={theme.primary} />;
  }

  let loadingHomePlanNode = null;
  if (loadingHomePlan) {
    loadingHomePlanNode = <ActivityIndicator color={theme.primary} style={{ marginVertical: 10 }} />;
  }

  let homePlanErrorNode = null;
  if (homePlanError) {
    homePlanErrorNode = <Text style={[styles.todoError, { color: errorColor }]}>{homePlanError}</Text>;
  }

  let canvasPlanWarningNode = null;
  if (canvasPlanWarning) {
    canvasPlanWarningNode = (
      <Text style={[styles.todoWarning, { color: warningColor }]}>{canvasPlanWarning}</Text>
    );
  }

  let homePlanEmptyNode = null;
  if (!loadingHomePlan) {
    if (!homePlanError) {
      if (groupedHomePlan.length === 0) {
        homePlanEmptyNode = (
          <Text style={[styles.todoEmpty, { color: theme.textSecondary }]}>
            {getPlanEmptyMessage(homeCanvasConnected)}
          </Text>
        );
      }
    }
  }

  let streakBadgeText = String(lastingDays) + '-day streak';
  const streakCycleDays = getStreakCycleDays(lastingDays);
  let weekCountText = String(totalUpcomingCount) + ' upcoming tasks';
  if (totalUpcomingCount === 1) {
    weekCountText = '1 upcoming task';
  }
  if (totalUpcomingCount === 0) {
    weekCountText = 'No upcoming tasks';
  }

  let checkInStatusText = 'Today - not yet';
  if (checkedInToday) {
    checkInStatusText = 'Today - checked in';
  }
  const tomorrowNoteRemainingCount = TOMORROW_NOTE_MAX_LENGTH - noteDraft.length;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.screenBg }]}>
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
        contentInsetAdjustmentBehavior="always"
      >
        <View
          style={[
            styles.heroCard,
            {
              backgroundColor: theme.surface,
              borderColor: theme.border,
              shadowColor: isDarkTheme ? '#000000' : '#C9B79D',
            },
          ]}
        >
          <View style={styles.heroHeaderRow}>
            <View style={styles.heroTitleWrap}>
              <Text style={[styles.headerTitle, { color: theme.textPrimary }]}>STUDENT MOTIVATION</Text>
            </View>
            <View style={styles.heroAvatarWrap}>
              {renderAvatarNode(
                avatarUrl,
                avatarInitial,
                avatarFallbackBackgroundColor,
                avatarFallbackTextColor
              )}
            </View>
          </View>
          <View style={[styles.heroBadge, { backgroundColor: theme.surfaceMuted, borderColor: theme.borderSoft }]}>
            <Text style={[styles.heroBadgeText, { color: theme.primary }]}>{heroBadgeText}</Text>
          </View>
          <Text style={[styles.greeting, { color: theme.textPrimary }]}>
            hi <Text style={styles.greetingBold}>{username}</Text>, how are you today?
          </Text>
        </View>

        <View style={styles.statsRow}>
          <View
            style={[
              styles.summaryCard,
              {
                backgroundColor: theme.surface,
                borderColor: theme.border,
                shadowColor: isDarkTheme ? '#000000' : '#D4C0A5',
              },
            ]}
          >
            <Text style={[styles.cardLabel, { color: theme.textSecondary }]}>Current streak</Text>
            <View style={styles.summaryCardGap} />
            {lastingDaysValueNode}
            <Text style={[styles.cardHint, { color: theme.textMuted }]}>Keep your habit alive</Text>
          </View>

          <View
            style={[
              styles.summaryCard,
              {
                backgroundColor: theme.surface,
                borderColor: theme.border,
                shadowColor: isDarkTheme ? '#000000' : '#D4C0A5',
              },
            ]}
          >
            <Text style={[styles.cardLabel, { color: theme.textSecondary }]}>Points</Text>
            <View style={styles.summaryCardGap} />
            {pointsValueNode}
            <Text style={[styles.cardHint, { color: theme.textMuted }]}>Earn from check-in</Text>
          </View>
        </View>

        {summaryErrorNode}

        <View
          style={[
            styles.checkInCard,
            {
              backgroundColor: theme.surface,
              borderColor: theme.border,
              shadowColor: isDarkTheme ? '#000000' : '#D6C3A7',
            },
          ]}
        >
          <View style={styles.centerBlock}>
            <Pressable
              onPress={onCheckIn}
              disabled={checkingIn}
              style={({ pressed }) => [
                styles.circle,
                {
                  backgroundColor: checkInCircleBackgroundColor,
                  borderColor: theme.border,
                  borderWidth: 1,
                  shadowColor: isDarkTheme ? '#000000' : '#D9C7AC',
                },
                getStyleWhen(checkingIn, { opacity: 0.6 }),
                getStyleWhen(pressed, { opacity: 0.85, transform: [{ scale: 0.99 }] }),
              ]}
            >
              {checkInCircleNode}
              <Text style={[styles.checkInCircleSubtext, { color: theme.textSecondary }]}>and keep going</Text>
              <View style={[styles.circleProgressTrack, { backgroundColor: theme.border }]}>
                <View
                  style={[
                    styles.circleProgressFill,
                    {
                      backgroundColor: theme.primary,
                      width: getProgressBarWidth(streakCycleDays, 7),
                    },
                  ]}
                />
              </View>
            </Pressable>

            <View
              style={[
                styles.streakBadge,
                { backgroundColor: theme.surfaceMuted, borderColor: theme.borderSoft },
              ]}
            >
              <Text style={[styles.streakBadgeText, { color: theme.primary }]}>{streakBadgeText}</Text>
            </View>

            <View style={styles.infoRow}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.infoTitle, { color: theme.textPrimary }]}>
                  Signed in for a total of {getSummaryValueText(summaryReady, totalSignedDays)} days
                </Text>
                <Text style={[styles.infoSub, { color: theme.textSecondary }]}>{checkInStatusText}</Text>
                <View style={[styles.progressLine, { backgroundColor: theme.border }]}>
                  <View
                    style={[
                      styles.progressFill,
                      {
                        backgroundColor: theme.primary,
                        width: getProgressBarWidth(streakCycleDays, 7),
                      },
                    ]}
                  />
                </View>
              </View>
            </View>
          </View>
        </View>

        <View
          style={[
            styles.todoCard,
            {
              backgroundColor: theme.surface,
              borderColor: theme.border,
              shadowColor: isDarkTheme ? '#000000' : '#D6C3A7',
            },
          ]}
        >
          <View style={styles.sectionHeaderRow}>
            <View>
              <Text style={[styles.sectionEyebrow, { color: theme.textMuted }]}>This week</Text>
              <Text style={[styles.todoTitle, { color: theme.textPrimary }]}>Upcoming tasks</Text>
            </View>
            {totalUpcomingCount > 0 ? (
              <View
                style={[
                  styles.sectionCountBadge,
                  { backgroundColor: theme.surfaceMuted, borderColor: theme.borderSoft },
                ]}
              >
                <Text style={[styles.sectionCountText, { color: theme.primary }]}>{weekCountText}</Text>
              </View>
            ) : null}
          </View>
          {loadingHomePlanNode}
          {homePlanErrorNode}
          {canvasPlanWarningNode}
          {homePlanEmptyNode}

          {groupedHomePlan.map((section) => (
            <View key={section.key} style={styles.todoSection}>
              <Text style={[styles.todoSectionTitle, { color: theme.textSecondary }]}>
                {section.title}
              </Text>

              {section.items.map((item) => {
                const safeItem = item || {};
                let Row = View;
                if (safeItem.htmlUrl) {
                  Row = Pressable;
                }
                const rowProps = buildPlanRowProps(safeItem, openPlanItem);
                const baseRowStyle = [
                  styles.todoItemCard,
                  { backgroundColor: theme.surfaceMuted, borderColor: theme.borderSoft },
                ];
                let nextRowStyle = baseRowStyle;
                if (safeItem.htmlUrl) {
                  nextRowStyle = function ({ pressed }) {
                    return [
                      styles.todoItemCard,
                      { backgroundColor: theme.surfaceMuted, borderColor: theme.borderSoft },
                      getStyleWhen(pressed, styles.todoRowPressed),
                    ];
                  };
                }

                return (
                  <Row
                    key={safeItem.id}
                    {...rowProps}
                    style={nextRowStyle}
                  >
                    {renderTodoAvatarNode(
                      avatarUrl,
                      avatarInitial,
                      avatarFallbackBackgroundColor,
                      avatarFallbackTextColor
                    )}

                    <View style={{ flex: 1 }}>
                      <View style={styles.todoTopRow}>
                        <Text style={[styles.todoTop, { color: theme.textPrimary }]}>{formatDaysLeft(item)}</Text>
                        <View
                          style={[
                            styles.todoSourceBadge,
                            getPlanSourceBadgeStyle(safeItem, isDarkTheme),
                          ]}
                        >
                          <Text style={[styles.todoSourceBadgeText, { color: theme.textPrimary }]}>
                            {getPlanSourceLabel(safeItem)}
                          </Text>
                        </View>
                      </View>
                      <Text style={[styles.todoTaskTitle, { color: theme.textPrimary }]}>
                        {safeItem.title || 'Untitled task'}
                      </Text>
                      <Text style={[styles.todoMeta, { color: theme.textMuted }]}>{getPlanDetail(safeItem)}</Text>
                      <Text style={[styles.todoMetaStrong, { color: theme.textSecondary }]}>
                        {formatPlanDateTime(safeItem)}
                      </Text>
                      {safeItem.htmlUrl ? (
                        <View style={[styles.todoActionChip, { backgroundColor: theme.surface, borderColor: theme.borderSoft }]}>
                          <Text style={[styles.todoLinkHint, { color: linkHintColor }]}>Open task</Text>
                        </View>
                      ) : null}
                    </View>
                  </Row>
                );
              })}
            </View>
          ))}
        </View>

        <View
          style={[
            styles.progressCard,
            {
              backgroundColor: theme.surface,
              borderColor: theme.border,
              shadowColor: isDarkTheme ? '#000000' : '#D6C3A7',
            },
          ]}
        >
          <Text style={[styles.sectionEyebrow, { color: theme.textMuted }]}>Weekly progress</Text>
          <Text style={[styles.progressTitle, { color: theme.textPrimary }]}>
            {weeklyCompletedCount} of {weeklyTotalCount} tasks completed
          </Text>
          <View style={[styles.progressTrackLarge, { backgroundColor: theme.border }]}>
            <View
              style={[
                styles.progressFillLarge,
                {
                  backgroundColor: theme.primary,
                  width: weeklyProgressWidth,
                },
              ]}
            />
          </View>
          <Text style={[styles.progressCaption, { color: theme.textMuted }]}>{weeklyProgressHintText}</Text>
        </View>

        <View
          style={[
            styles.reviewCard,
            {
              backgroundColor: theme.surface,
              borderColor: theme.border,
              shadowColor: isDarkTheme ? '#000000' : '#D6C3A7',
            },
          ]}
        >
          <View style={styles.sectionHeaderRow}>
            <View>
              <Text style={[styles.sectionEyebrow, { color: theme.textMuted }]}>Review</Text>
              <Text style={[styles.todoTitle, { color: theme.textPrimary }]}>Past windows</Text>
            </View>
          </View>

          {reviewSections.map((section) => {
            let isExpanded = false;
            if (expandedReviewSections) {
              isExpanded = Boolean(expandedReviewSections[section.key]);
            }

            let toggleButtonText = 'Show';
            if (isExpanded) {
              toggleButtonText = 'Hide';
            }

            let currentReviewEmptyNode = null;
            if (isExpanded) {
              if (!loadingHomePlan) {
                if (!homePlanError) {
                  if (section.items.length === 0) {
                    currentReviewEmptyNode = (
                      <Text style={[styles.todoEmpty, { color: theme.textSecondary }]}>
                        {getReviewEmptyMessage(section.emptyLabel, homeCanvasConnected)}
                      </Text>
                    );
                  }
                }
              }
            }

            return (
              <React.Fragment key={section.key}>
                <View style={[styles.todoDivider, { backgroundColor: theme.border }]} />
                <View style={styles.todoSection}>
                  <Pressable
                    onPress={() => toggleReviewSection(section.key)}
                    style={({ pressed }) => [
                      styles.todoReviewToggle,
                      getStyleWhen(pressed, styles.todoReviewTogglePressed),
                    ]}
                  >
                    <View style={styles.todoReviewToggleTextWrap}>
                      <Text style={[styles.todoSectionTitle, { color: theme.textSecondary }]}>{section.title}</Text>
                    </View>
                    <Text style={[styles.todoReviewToggleIcon, { color: theme.primary }]}>
                      {toggleButtonText}
                    </Text>
                  </Pressable>
                  <Text style={[styles.todoReviewSummary, { color: theme.textSecondary }]}>
                    {section.summaryText}
                  </Text>
                  {currentReviewEmptyNode}

                  {isExpanded ? section.items.map((item) => {
                    const safeItem = item || {};
                    let Row = View;
                    if (safeItem.htmlUrl) {
                      Row = Pressable;
                    }
                    const rowProps = buildPlanRowProps(safeItem, openPlanItem);
                    const baseRowStyle = [
                      styles.todoItemCard,
                      { backgroundColor: theme.surfaceMuted, borderColor: theme.borderSoft },
                    ];
                    let nextRowStyle = baseRowStyle;
                    if (safeItem.htmlUrl) {
                      nextRowStyle = function ({ pressed }) {
                        return [
                          styles.todoItemCard,
                          { backgroundColor: theme.surfaceMuted, borderColor: theme.borderSoft },
                          getStyleWhen(pressed, styles.todoRowPressed),
                        ];
                      };
                    }

                    return (
                      <Row
                        key={safeItem.id}
                        {...rowProps}
                        style={nextRowStyle}
                      >
                        {renderTodoAvatarNode(
                          avatarUrl,
                          avatarInitial,
                          avatarFallbackBackgroundColor,
                          avatarFallbackTextColor
                        )}

                        <View style={{ flex: 1 }}>
                          <View style={styles.todoTopRow}>
                            <Text style={[styles.todoTop, { color: theme.textPrimary }]}>
                              {getReviewStatusText(safeItem)}
                            </Text>
                            <View
                              style={[
                                styles.todoSourceBadge,
                                getPlanSourceBadgeStyle(safeItem, isDarkTheme),
                              ]}
                            >
                              <Text style={[styles.todoSourceBadgeText, { color: theme.textPrimary }]}>
                                {getPlanSourceLabel(safeItem)}
                              </Text>
                            </View>
                          </View>
                          <Text style={[styles.todoTaskTitle, { color: theme.textPrimary }]}>
                            {safeItem.title || 'Untitled task'}
                          </Text>
                          <Text style={[styles.todoMeta, { color: theme.textMuted }]}>
                            {getPlanDetail(safeItem)}
                          </Text>
                          <Text style={[styles.todoMetaStrong, { color: theme.textSecondary }]}>
                            {formatPlanDateTime(safeItem)}
                          </Text>
                          {safeItem.htmlUrl ? (
                            <View style={[styles.todoActionChip, { backgroundColor: theme.surface, borderColor: theme.borderSoft }]}>
                              <Text style={[styles.todoLinkHint, { color: linkHintColor }]}>Open task</Text>
                            </View>
                          ) : null}
                        </View>
                      </Row>
                    );
                  }) : null}
                </View>
              </React.Fragment>
            );
          })}
        </View>

        <View style={{ height: 24 }} />
      </ScrollView>

      <Modal
        visible={noteModalVisible}
        transparent
        animationType="fade"
        onRequestClose={closeTomorrowNoteModal}
      >
        <View style={styles.noteModalOverlay}>
          <Pressable style={styles.noteModalBackdrop} onPress={closeTomorrowNoteModal} />
          <View
            style={[
              styles.noteModalCard,
              {
                backgroundColor: theme.surface,
                borderColor: theme.border,
                shadowColor: isDarkTheme ? '#000000' : '#D6C3A7',
              },
            ]}
          >
            <Text style={[styles.noteModalTitle, { color: theme.textPrimary }]}>{noteModalTitle}</Text>
            <Text style={[styles.noteModalSubtitle, { color: theme.textSecondary }]}>
              {noteModalSubtitle}
            </Text>

            {yesterdayNote ? (
              <View
                style={[
                  styles.noteMessageCard,
                  {
                    backgroundColor: theme.surfaceMuted,
                    borderColor: theme.borderSoft,
                  },
                ]}
              >
                <Text style={[styles.noteMessageLabel, { color: theme.textMuted }]}>Yesterday you said</Text>
                <Text style={[styles.noteMessageText, { color: theme.textPrimary }]}>{yesterdayNote}</Text>
              </View>
            ) : null}

            <Text style={[styles.noteInputLabel, { color: theme.textPrimary }]}>
              Write one line for tomorrow
            </Text>
            <TextInput
              value={noteDraft}
              onChangeText={(value) => {
                setNoteDraft(normalizeTomorrowNoteInput(value));
                if (noteError) {
                  setNoteError('');
                }
              }}
              placeholder="For example: Start with the hardest task first"
              placeholderTextColor={theme.textMuted}
              maxLength={TOMORROW_NOTE_MAX_LENGTH}
              multiline
              textAlignVertical="top"
              style={[
                styles.noteInput,
                {
                  backgroundColor: theme.surfaceMuted,
                  borderColor: theme.borderSoft,
                  color: theme.textPrimary,
                },
              ]}
            />
            <Text style={[styles.noteCounter, { color: theme.textMuted }]}>
              {String(tomorrowNoteRemainingCount)} characters left
            </Text>

            {noteError ? (
              <Text style={[styles.noteErrorText, { color: errorColor }]}>{noteError}</Text>
            ) : null}

            <View style={styles.noteButtonRow}>
              <Pressable
                onPress={closeTomorrowNoteModal}
                disabled={noteSaving}
                style={({ pressed }) => [
                  styles.noteSecondaryButton,
                  {
                    backgroundColor: theme.surfaceMuted,
                    borderColor: theme.borderSoft,
                  },
                  getStyleWhen(pressed, styles.noteButtonPressed),
                  getStyleWhen(noteSaving, { opacity: 0.6 }),
                ]}
              >
                <Text style={[styles.noteSecondaryButtonText, { color: theme.textPrimary }]}>Close</Text>
              </Pressable>

              <Pressable
                onPress={saveTomorrowNote}
                disabled={noteSaving}
                style={({ pressed }) => [
                  styles.notePrimaryButton,
                  { backgroundColor: theme.primary },
                  getStyleWhen(pressed, styles.noteButtonPressed),
                  getStyleWhen(noteSaving, { opacity: 0.75 }),
                ]}
              >
                <Text style={[styles.notePrimaryButtonText, { color: theme.primaryText }]}>
                  {getTomorrowNoteSaveButtonText(noteSaving)}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#ffffff' },
  container: { paddingHorizontal: 18, paddingTop: 10, paddingBottom: 32 },

  heroCard: {
    borderWidth: 1,
    borderRadius: 28,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 18,
    marginBottom: 18,
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.1,
    shadowRadius: 28,
    elevation: 4,
  },
  heroHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  heroTitleWrap: { flex: 1, alignItems: 'flex-start', justifyContent: 'center', paddingRight: 12 },
  heroAvatarWrap: { width: 54, alignItems: 'flex-end', justifyContent: 'center' },
  headerTitle: {
    textAlign: 'left',
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
    letterSpacing: 0.8,
  },
  heroBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    marginBottom: 14,
  },
  heroBadgeText: { fontSize: 12, fontWeight: '700' },

  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#f3f4f6' },
  avatarFallback: { backgroundColor: '#f3f4f6', alignItems: 'center', justifyContent: 'center' },
  avatarFallbackText: { fontSize: 12, fontWeight: '800', color: '#111827' },

  greeting: { fontSize: 16, color: '#111827', lineHeight: 24 },
  greetingBold: { fontWeight: '800' },

  statsRow: { flexDirection: 'row', gap: 12, marginBottom: 18 },
  summaryCard: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 14,
    backgroundColor: '#ffffff',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 3,
  },
  summaryCardGap: { height: 10 },
  cardLabel: { fontSize: 13, fontWeight: '700', color: '#111827' },
  cardBig: { fontSize: 30, fontWeight: '900', color: '#111827' },
  cardBigUnit: { fontSize: 16, fontWeight: '800', color: '#111827' },
  cardHint: { marginTop: 8, fontSize: 12, lineHeight: 18, color: '#6b7280' },

  checkInCard: {
    borderWidth: 1,
    borderRadius: 28,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 18,
    marginBottom: 18,
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
    elevation: 3,
  },
  centerBlock: { alignItems: 'center' },
  circle: {
    width: 230,
    height: 230,
    borderRadius: 115,
    backgroundColor: '#e5e7eb',
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.08,
    shadowRadius: 30,
    elevation: 4,
  },
  circleText: {
    fontSize: 22,
    fontWeight: '800',
    color: '#111827',
    textAlign: 'center',
    lineHeight: 28,
  },
  checkInCircleSubtext: {
    marginTop: 8,
    fontSize: 13,
    fontWeight: '600',
  },
  circleProgressTrack: {
    width: 120,
    height: 8,
    borderRadius: 999,
    marginTop: 20,
    overflow: 'hidden',
  },
  circleProgressFill: {
    height: '100%',
    borderRadius: 999,
  },
  streakBadge: {
    marginTop: 16,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
  },
  streakBadgeText: {
    fontSize: 14,
    fontWeight: '800',
  },

  infoRow: { marginTop: 18, width: '100%', alignItems: 'flex-start' },
  infoTitle: { fontSize: 16, fontWeight: '800', color: '#111827', textAlign: 'center' },
  infoSub: { marginTop: 6, fontSize: 13, fontWeight: '600', color: '#111827' },
  progressLine: {
    marginTop: 12,
    height: 8,
    borderRadius: 999,
    backgroundColor: '#e5e7eb',
    width: '100%',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
  },

  todoCard: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 24,
    padding: 18,
    backgroundColor: '#ffffff',
    marginBottom: 18,
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
    elevation: 3,
  },
  progressCard: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 24,
    padding: 18,
    backgroundColor: '#ffffff',
    marginBottom: 18,
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
    elevation: 3,
  },
  reviewCard: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 24,
    padding: 18,
    backgroundColor: '#ffffff',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
    elevation: 3,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 14,
  },
  sectionEyebrow: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 8,
    letterSpacing: 0.3,
  },
  sectionCountBadge: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
  sectionCountText: {
    fontSize: 11,
    fontWeight: '800',
  },
  todoTitle: { fontSize: 28, fontWeight: '900', color: '#111827' },
  todoSection: { marginTop: 8 },
  todoSectionTitle: { fontSize: 14, fontWeight: '800', color: '#374151', marginBottom: 10 },
  todoItemCard: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 20,
    borderWidth: 1,
    marginBottom: 10,
  },
  todoRowPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.995 }],
  },
  todoAvatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#f3f4f6', marginTop: 2 },
  todoTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  todoTop: { fontSize: 14, fontWeight: '900', color: '#111827' },
  todoSourceBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  todoSourceBadgeCanvas: { backgroundColor: '#dbeafe' },
  todoSourceBadgeCustom: { backgroundColor: '#dcfce7' },
  todoSourceBadgeText: { fontSize: 10, fontWeight: '800', color: '#111827' },
  todoTaskTitle: { marginTop: 6, fontSize: 15, fontWeight: '800', color: '#111827' },
  todoMeta: { marginTop: 4, fontSize: 12, color: '#9ca3af' },
  todoMetaStrong: { marginTop: 4, fontSize: 12, fontWeight: '700', color: '#374151' },
  todoActionChip: {
    alignSelf: 'flex-start',
    marginTop: 10,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    borderWidth: 1,
  },
  todoLinkHint: { fontSize: 11, fontWeight: '800', color: '#2563eb' },
  todoEmpty: { fontSize: 12, color: '#6b7280', marginBottom: 4 },
  todoWarning: { fontSize: 12, color: '#b45309', marginBottom: 4 },
  todoError: { fontSize: 12, color: '#b91c1c', marginBottom: 4 },
  todoReviewSummary: { fontSize: 12, color: '#6b7280', marginBottom: 10 },
  todoReviewToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingVertical: 4,
  },
  todoReviewTogglePressed: {
    opacity: 0.75,
  },
  todoReviewToggleTextWrap: {
    flex: 1,
  },
  todoReviewToggleHint: {
    marginTop: 2,
    fontSize: 10,
    color: '#9ca3af',
  },
  todoReviewToggleIcon: {
    fontSize: 12,
    fontWeight: '800',
    color: '#2563eb',
  },
  todoDivider: { marginTop: 10, marginBottom: 6, height: 1, backgroundColor: '#e5e7eb' },
  progressTitle: {
    fontSize: 18,
    fontWeight: '900',
    marginBottom: 12,
  },
  progressTrackLarge: {
    height: 10,
    borderRadius: 999,
    overflow: 'hidden',
    marginBottom: 12,
  },
  progressFillLarge: {
    height: '100%',
    borderRadius: 999,
  },
  progressCaption: {
    fontSize: 12,
    lineHeight: 18,
  },
  noteModalOverlay: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
    backgroundColor: 'rgba(17, 24, 39, 0.24)',
  },
  noteModalBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  noteModalCard: {
    borderWidth: 1,
    borderRadius: 24,
    padding: 20,
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.16,
    shadowRadius: 26,
    elevation: 6,
  },
  noteModalTitle: {
    fontSize: 24,
    fontWeight: '900',
    marginBottom: 6,
  },
  noteModalSubtitle: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 16,
  },
  noteMessageCard: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
    marginBottom: 16,
  },
  noteMessageLabel: {
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 6,
  },
  noteMessageText: {
    fontSize: 14,
    lineHeight: 21,
    fontWeight: '600',
  },
  noteInputLabel: {
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 10,
  },
  noteInput: {
    minHeight: 92,
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 8,
  },
  noteCounter: {
    fontSize: 12,
    marginBottom: 10,
  },
  noteErrorText: {
    fontSize: 12,
    marginBottom: 12,
  },
  noteButtonRow: {
    flexDirection: 'row',
    gap: 10,
  },
  noteSecondaryButton: {
    flex: 1,
    height: 48,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notePrimaryButton: {
    flex: 1.2,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noteSecondaryButtonText: {
    fontSize: 14,
    fontWeight: '800',
  },
  notePrimaryButtonText: {
    fontSize: 14,
    fontWeight: '800',
  },
  noteButtonPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.99 }],
  },
});
