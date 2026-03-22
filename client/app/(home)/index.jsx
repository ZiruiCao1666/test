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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useUser, useAuth } from '@clerk/clerk-expo';
import { useFocusEffect } from '@react-navigation/native';
import * as SecureStore from 'expo-secure-store';
import * as Linking from 'expo-linking';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL;
const SUMMARY_CACHE_PREFIX = 'home_summary_v1';
const HOME_PLAN_DAYS = 7;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const DATE_INPUT_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_INPUT_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

const getErrorMessage = (error, fallback) => {
  if (error && typeof error.message === 'string' && error.message) {
    return error.message;
  }
  return fallback;
};

const getApiErrorMessage = (data, fallback) => {
  if (data && typeof data.error === 'string' && data.error) {
    return data.error;
  }
  return fallback;
};

const getStyleWhen = (condition, style) => {
  if (condition) return style;
  return null;
};

const renderNodeWhen = (condition, node) => {
  if (!condition) return null;
  return node;
};

const renderNodeWhenElse = (condition, trueNode, falseNode) => {
  if (condition) return trueNode;
  return falseNode;
};

const formatShortDate = (value) => {
  const safe = String(value || '').trim();
  if (!DATE_INPUT_RE.test(safe)) return safe || 'Date not set';
  const date = new Date(`${safe}T00:00:00`);
  if (Number.isNaN(date.getTime())) return safe;
  return date.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
  });
};

const formatTimeOnly = (value) => {
  const safe = String(value || '').trim();
  if (!TIME_INPUT_RE.test(safe)) return safe || '--:--';
  const date = new Date(`2000-01-01T${safe}:00`);
  if (Number.isNaN(date.getTime())) return safe;
  return date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
};

const getCustomTaskTimestamp = (item) => {
  const safeItem = item || {};
  const taskDate = String(safeItem.taskDate || '').trim();
  if (!DATE_INPUT_RE.test(taskDate)) return null;

  let sourceTime = String(safeItem.dueTime || '').trim();
  if (safeItem.timingMode === 'range') {
    sourceTime = String(safeItem.startTime || '').trim();
  }
  let safeTime = '12:00';
  if (TIME_INPUT_RE.test(sourceTime)) {
    safeTime = sourceTime;
  }
  const parsed = new Date(`${taskDate}T${safeTime}:00`).getTime();
  if (Number.isFinite(parsed)) {
    return parsed;
  }
  return null;
};

const getItemTimestamp = (item) => {
  const safeItem = item || {};

  if (safeItem.source === 'custom') {
    const customTimestamp = getCustomTaskTimestamp(safeItem);
    if (customTimestamp !== null) return customTimestamp;
  }

  if (typeof safeItem.timestampMs === 'number' && Number.isFinite(safeItem.timestampMs)) {
    return safeItem.timestampMs;
  }

  if (typeof safeItem.timestampMs === 'string' && safeItem.timestampMs.trim() !== '') {
    const direct = Number(safeItem.timestampMs);
    if (Number.isFinite(direct)) return direct;
  }

  const parsed = new Date(safeItem.date || '').getTime();
  if (Number.isFinite(parsed)) {
    return parsed;
  }
  return null;
};

const formatDaysLeft = (item) => {
  const timestamp = getItemTimestamp(item);
  if (timestamp === null) return 'Time pending';

  const diffMs = timestamp - Date.now();
  if (diffMs <= 0) return 'Due now';
  if (diffMs <= ONE_DAY_MS) {
    const hoursLeft = Math.max(1, Math.ceil(diffMs / (60 * 60 * 1000)));
    return `${hoursLeft}h left`;
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

  if (diffDays <= 0) return 'Due today';
  if (diffDays === 1) return '1 day left';
  return `${diffDays} days left`;
};

const formatPlanDateTime = (item) => {
  const safeItem = item || {};

  if (safeItem.source === 'custom') {
    if (safeItem.scheduleText) return String(safeItem.scheduleText);

    const dateLabel = formatShortDate(safeItem.taskDate || '');
    if (safeItem.timingMode === 'range') {
      return `${dateLabel} | ${formatTimeOnly(safeItem.startTime)} - ${formatTimeOnly(safeItem.endTime)}`;
    }
    return `${dateLabel} | Due ${formatTimeOnly(safeItem.dueTime)}`;
  }

  const timestamp = getItemTimestamp(safeItem);
  if (timestamp === null) {
    if (safeItem.date) return String(safeItem.date);
    return 'Time not synced';
  }

  return new Date(timestamp).toLocaleString(undefined, {
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
  if (hasError) return 'summary sync delayed';
  if (checkedInToday) return 'today: checked';
  return 'today: not yet';
};

const getPlanSourceLabel = (item) => {
  const safeItem = item || {};
  if (safeItem.source === 'custom') {
    return 'Custom';
  }
  return 'Canvas';
};

const getPlanSourceBadgeStyle = (item) => {
  const safeItem = item || {};
  if (safeItem.source === 'custom') {
    return styles.todoSourceBadgeCustom;
  }
  return styles.todoSourceBadgeCanvas;
};

const getPrimaryEmail = (safeUser) => {
  if (safeUser.primaryEmailAddress && safeUser.primaryEmailAddress.emailAddress) {
    return safeUser.primaryEmailAddress.emailAddress;
  }
  return '';
};

const getUserDisplayName = (safeUser, primaryEmail) => {
  if (safeUser.firstName) return safeUser.firstName;
  if (safeUser.fullName) return safeUser.fullName;
  if (primaryEmail) return primaryEmail;
  return 'Student';
};

const getSummaryValueText = (summaryReady, value) => {
  if (summaryReady) return value;
  return '...';
};

const getCheckInButtonText = (checkedInToday) => {
  if (checkedInToday) return 'Checked in\ntoday';
  return 'Click to\ncheck in';
};

const getCheckInAlertText = (gained) => {
  if (gained > 0) return `Checked in for today (+${gained} points)`;
  return 'Already checked in today';
};

const getPlanEmptyMessage = () => 'No Canvas or custom tasks in the next seven days.';

const buildPlanRowProps = (item, openPlanItem) => {
  const safeItem = item || {};
  if (safeItem.htmlUrl) {
    return {
      onPress: () => openPlanItem(safeItem),
      style: ({ pressed }) => [
        styles.todoRow,
        styles.todoRowClickable,
        getStyleWhen(pressed, { opacity: 0.75 }),
      ],
    };
  }
  return {
    style: styles.todoRow,
  };
};

const renderAvatarNode = (avatarUrl, avatarInitial) => {
  if (avatarUrl) {
    return <Image source={{ uri: avatarUrl }} style={styles.avatar} />;
  }
  return (
    <View style={[styles.avatar, styles.avatarFallback]}>
      <Text style={styles.avatarFallbackText}>{avatarInitial}</Text>
    </View>
  );
};

const renderTodoAvatarNode = (avatarUrl, avatarInitial) => {
  if (avatarUrl) {
    return <Image source={{ uri: avatarUrl }} style={styles.todoAvatar} />;
  }
  return (
    <View style={[styles.todoAvatar, styles.avatarFallback]}>
      <Text style={styles.avatarFallbackText}>{avatarInitial}</Text>
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

export default function HomeScreen() {
  const { user, isLoaded: userLoaded } = useUser();
  const { isLoaded: authLoaded, isSignedIn, getToken } = useAuth();
  const safeUser = user || {};
  const primaryEmail = getPrimaryEmail(safeUser);
  const userId = safeUser.id || null;

  const username = getUserDisplayName(safeUser, primaryEmail);
  const avatarUrl = safeUser.imageUrl || null;
  const avatarInitial = String(username || '').trim().charAt(0).toUpperCase() || 'U';


  const [totalSignedDays, setTotalSignedDays] = React.useState(0);
  const [streakDays, setStreakDays] = React.useState(0);
  const [checkedInToday, setCheckedInToday] = React.useState(false);
  const [points, setPoints] = React.useState(0);

  const [loadingSummary, setLoadingSummary] = React.useState(false);
  const [summaryError, setSummaryError] = React.useState(null);
  const [checkingIn, setCheckingIn] = React.useState(false);
  const [hasCachedSummary, setHasCachedSummary] = React.useState(false);
  const [summaryReady, setSummaryReady] = React.useState(false);
  const [homePlanItems, setHomePlanItems] = React.useState([]);
  const [loadingHomePlan, setLoadingHomePlan] = React.useState(false);
  const [homePlanError, setHomePlanError] = React.useState(null);
  const [canvasPlanWarning, setCanvasPlanWarning] = React.useState('');

  const summaryRetryRef = React.useRef(0);
  const getTokenRef = React.useRef(getToken);

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
    if (!userId) return null;
    return `${SUMMARY_CACHE_PREFIX}:${userId}`;
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
    setSummaryReady(true);
  }, []);

  const persistSummaryToCache = React.useCallback(async (data = {}) => {
    if (!summaryCacheKey) return;

    try {
      const safeData = data || {};
      const payload = {
        totalDays: Number(safeData.totalDays) || 0,
        streakDays: undefined,
        checkedInToday: Boolean(safeData.checkedInToday),
        points: Number(safeData.points) || 0,
        updatedAt: Date.now(),
      };
      if (safeData.streakDays !== undefined) {
        payload.streakDays = Number(safeData.streakDays) || 0;
      }

      await SecureStore.setItemAsync(summaryCacheKey, JSON.stringify(payload));
      setHasCachedSummary(true);
    } catch (_e) {
      // Ignore cache write errors.
    }
  }, [summaryCacheKey]);

  const hydrateSummaryFromCache = React.useCallback(async () => {
    if (!summaryCacheKey) return false;

    try {
      const raw = await SecureStore.getItemAsync(summaryCacheKey);
      if (!raw) {
        setHasCachedSummary(false);
        return false;
      }

      const cached = JSON.parse(raw);
      applySummaryData(cached);
      setHasCachedSummary(true);
      return true;
    } catch (_e) {
      setHasCachedSummary(false);
      return false;
    }
  }, [summaryCacheKey, applySummaryData]);

  const getSessionToken = React.useCallback(async () => {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const tokenGetter = getTokenRef.current;
      let token = '';
      if (tokenGetter) {
        token = await tokenGetter();
      }
      if (token) return token;
      await new Promise((resolve) => setTimeout(resolve, 300));
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

      if (!authLoaded || !isSignedIn || !userLoaded || !userId) return;

      const token = await getSessionToken();
      if (!token) return;

      const res = await fetchWithTimeout(`${API_BASE_URL}/checkins/status`, {
        headers: { Authorization: `Bearer ${token}` },
      }, timeoutMs);

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(getApiErrorMessage(data, 'Failed to load summary'));

      applySummaryData(data);
      persistSummaryToCache(data);
      summaryRetryRef.current = 0;
    } catch (e) {
      if (e && e.name === 'AbortError') {
        setSummaryError('Network is slow. Retrying in background...');
      } else {
        setSummaryError(getErrorMessage(e, 'Failed to load summary'));
      }

      if (summaryRetryRef.current < 2) {
        summaryRetryRef.current += 1;
        setTimeout(() => {
          loadSummary({ silent: true, timeoutMs: 25000 });
        }, 1500);
      }

      console.log('[Home] loadSummary error:', getErrorMessage(e, 'Unknown error'));
      console.log('[Home] API_BASE_URL =', API_BASE_URL);
      console.log('[Home] URL =', `${API_BASE_URL}/checkins/status`);
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

      if (!authLoaded || !isSignedIn || !userLoaded || !userId) return;

      const token = await getSessionToken();
      if (!token) return;

      const res = await fetchWithTimeout(
        `${API_BASE_URL}/home/plan?days=${HOME_PLAN_DAYS}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
        timeoutMs
      );

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(getApiErrorMessage(data, 'Failed to load seven-day plan'));

      if (data && Array.isArray(data.items)) {
        setHomePlanItems(data.items);
      } else {
        setHomePlanItems([]);
      }
      if (data && data.canvasError) {
        setCanvasPlanWarning(String(data.canvasError).trim());
      } else {
        setCanvasPlanWarning('');
      }
    } catch (e) {
      setHomePlanItems([]);
      setCanvasPlanWarning('');
      setHomePlanError(getErrorMessage(e, 'Failed to load seven-day plan'));
      console.log('[Home] loadHomePlan error:', getErrorMessage(e, 'Unknown error'));
    } finally {
      if (!silent) {
        setLoadingHomePlan(false);
      }
    }
  }, [fetchWithTimeout, authLoaded, isSignedIn, userLoaded, userId, getSessionToken]);

  useFocusEffect(
    React.useCallback(() => {
      if (!authLoaded || !isSignedIn || !userLoaded || !userId) return undefined;

      let alive = true;

      (async () => {
        const hasCache = await hydrateSummaryFromCache();
        if (!alive) return;
        await Promise.allSettled([
          loadSummary({ silent: hasCache, timeoutMs: 25000 }),
          loadHomePlan({ timeoutMs: 25000 }),
        ]);
      })();

      return () => {
        alive = false;
      };
    }, [
      authLoaded,
      isSignedIn,
      userLoaded,
      userId,
      hydrateSummaryFromCache,
      loadSummary,
      loadHomePlan,
    ]),
  );

  const onCheckIn = async () => {
    if (checkingIn) return;

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

      const res = await fetch(`${API_BASE_URL}/checkins/today`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(getApiErrorMessage(data, 'Check-in failed'));

      setSummaryError(null);
      applySummaryData(data);
      persistSummaryToCache(data);

      const gained = Number(data.gainedPoints) || 0;
      Alert.alert('Check-in', getCheckInAlertText(gained));
    } catch (e) {
      Alert.alert('Error', getErrorMessage(e, 'Something went wrong'));
    } finally {
      setCheckingIn(false);
    }
  };

  const lastingDays = streakDays || totalSignedDays;
  const groupedHomePlan = React.useMemo(() => groupPlanItems(homePlanItems), [homePlanItems]);
  const openPlanItem = React.useCallback(async (item) => {
    const safeItem = item || {};
    if (!safeItem.htmlUrl) return;
    try {
      await Linking.openURL(safeItem.htmlUrl);
    } catch (_error) {
      Alert.alert('Open failed', 'Cannot open this Canvas link on the current device.');
    }
  }, []);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.headerRow}>
          <View style={styles.headerSide} />
          <Text style={styles.headerTitle}>STUDENT MOTIVATION</Text>

          <View style={styles.headerSideRight}>
            {renderAvatarNode(avatarUrl, avatarInitial)}
          </View>
        </View>

        <Text style={styles.greeting}>
          hi <Text style={styles.greetingBold}>{username}</Text>, how are you today?
        </Text>

        <View style={styles.statsRow}>
          <View style={styles.card}>
            <Text style={styles.cardLabel}>Lasting days</Text>
            <View style={{ height: 6 }} />
            {renderNodeWhenElse(
              !summaryReady,
              <ActivityIndicator />,
              <>
                <Text style={styles.cardBig}>
                  {lastingDays}
                  <Text style={styles.cardBigUnit}> days</Text>
                </Text>
                {renderNodeWhen(
                  loadingSummary,
                  <ActivityIndicator size="small" style={{ marginTop: 6 }} />
                )}
              </>
            )}
            <Text style={styles.cardHint}>Continuous sign-in builds habits</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardLabel}>points</Text>
            <View style={{ height: 6 }} />
            {renderNodeWhenElse(
              !summaryReady,
              <ActivityIndicator />,
              <>
                <Text style={styles.cardBig}>{points}</Text>
                {renderNodeWhen(
                  loadingSummary,
                  <ActivityIndicator size="small" style={{ marginTop: 6 }} />
                )}
              </>
            )}
            <Text style={styles.cardHint}>Earn points by daily check-in</Text>
          </View>
        </View>

        {renderNodeWhen(summaryError, (
          <Text style={{ marginBottom: 10, fontSize: 12, color: '#b91c1c' }}>
            {summaryError}
          </Text>
        ))}

        <View style={styles.centerBlock}>
          <Pressable
            onPress={onCheckIn}
            disabled={checkingIn || checkedInToday}
            style={({ pressed }) => [
              styles.circle,
              getStyleWhen((checkingIn || checkedInToday), { opacity: 0.6 }),
              getStyleWhen(pressed, { opacity: 0.85, transform: [{ scale: 0.99 }] }),
            ]}
          >
            {renderNodeWhenElse(checkingIn, (
              <ActivityIndicator />
            ), (
              <Text style={styles.circleText}>
                {getCheckInButtonText(checkedInToday)}
              </Text>
            ))}
          </Pressable>

          <View style={styles.infoRow}>
            <Text style={styles.star}>*</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.infoTitle}>
                Signed in for a total of {getSummaryValueText(summaryReady, totalSignedDays)} days
              </Text>
              <Text style={styles.infoSub}>
                {getSummaryStatusText(Boolean(summaryError), checkedInToday)}
              </Text>
              <View style={styles.progressLine} />
            </View>
          </View>
        </View>

        <View style={styles.todoCard}>
          <Text style={styles.todoTitle}>Things to be done within seven days</Text>
          {renderNodeWhen(loadingHomePlan, <ActivityIndicator style={{ marginVertical: 10 }} />)}
          {renderNodeWhen(homePlanError, <Text style={styles.todoError}>{homePlanError}</Text>)}
          {renderNodeWhen(canvasPlanWarning, <Text style={styles.todoWarning}>{canvasPlanWarning}</Text>)}

          {renderNodeWhen(
            !loadingHomePlan && !homePlanError && groupedHomePlan.length === 0,
            <Text style={styles.todoEmpty}>{getPlanEmptyMessage()}</Text>
          )}

          {groupedHomePlan.map((section) => (
            <View key={section.key} style={styles.todoSection}>
              <Text style={styles.todoSectionTitle}>
                {section.title} ({section.items.length})
              </Text>

              {section.items.map((item) => {
                const safeItem = item || {};
                let Row = View;
                if (safeItem.htmlUrl) {
                  Row = Pressable;
                }
                const rowProps = buildPlanRowProps(safeItem, openPlanItem);

                return (
                  <Row key={safeItem.id} {...rowProps}>
                    {renderTodoAvatarNode(avatarUrl, avatarInitial)}

                    <View style={{ flex: 1 }}>
                      <View style={styles.todoTopRow}>
                        <Text style={styles.todoTop}>{formatDaysLeft(item)}</Text>
                      <View
                        style={[
                          styles.todoSourceBadge,
                          getPlanSourceBadgeStyle(safeItem),
                        ]}
                      >
                        <Text style={styles.todoSourceBadgeText}>
                          {getPlanSourceLabel(safeItem)}
                        </Text>
                      </View>
                      </View>
                      <Text style={styles.todoText}>{safeItem.title || 'Untitled task'}</Text>
                      <Text style={styles.todoMeta}>{getPlanDetail(safeItem)}</Text>
                      <Text style={styles.todoMetaStrong}>{formatPlanDateTime(safeItem)}</Text>
                      {renderNodeWhen(safeItem.htmlUrl, <Text style={styles.todoLinkHint}>Open in Canvas</Text>)}
                      <View style={styles.todoLine} />
                    </View>
                  </Row>
                );
              })}
            </View>
          ))}
        </View>

        <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#ffffff' },
  container: { paddingHorizontal: 18, paddingTop: 10 },

  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  headerSide: { width: 34, height: 34 },
  headerSideRight: { width: 34, height: 34, alignItems: 'flex-end', justifyContent: 'center' },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
    letterSpacing: 0.3,
  },

  avatar: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#f3f4f6' },
  avatarFallback: { backgroundColor: '#f3f4f6', alignItems: 'center', justifyContent: 'center' },
  avatarFallbackText: { fontSize: 12, fontWeight: '800', color: '#111827' },

  greeting: { fontSize: 14, color: '#111827', marginBottom: 14 },
  greetingBold: { fontWeight: '800' },

  statsRow: { flexDirection: 'row', gap: 12, marginBottom: 18 },
  card: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 14,
    padding: 12,
    backgroundColor: '#ffffff',
  },
  cardLabel: { fontSize: 13, fontWeight: '700', color: '#111827' },
  cardBig: { fontSize: 28, fontWeight: '900', color: '#111827' },
  cardBigUnit: { fontSize: 16, fontWeight: '800', color: '#111827' },
  cardHint: { marginTop: 6, fontSize: 12, color: '#6b7280' },

  centerBlock: { alignItems: 'center', marginBottom: 18 },
  circle: {
    width: 230,
    height: 230,
    borderRadius: 115,
    backgroundColor: '#e5e7eb',
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleText: {
    fontSize: 22,
    fontWeight: '800',
    color: '#111827',
    textAlign: 'center',
    lineHeight: 28,
  },

  infoRow: { marginTop: 14, width: '100%', flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  star: { fontSize: 26, color: '#9ca3af', marginTop: 1 },
  infoTitle: { fontSize: 14, fontWeight: '800', color: '#111827' },
  infoSub: { marginTop: 6, fontSize: 12, fontWeight: '700', color: '#111827' },
  progressLine: { marginTop: 10, height: 3, borderRadius: 2, backgroundColor: '#e5e7eb', width: '85%' },

  todoCard: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 14, padding: 12, backgroundColor: '#ffffff' },
  todoTitle: { fontSize: 14, fontWeight: '800', color: '#111827', marginBottom: 10 },
  todoSection: { marginTop: 8 },
  todoSectionTitle: { fontSize: 12, fontWeight: '800', color: '#374151', marginBottom: 6 },
  todoRow: { flexDirection: 'row', gap: 10, paddingVertical: 10 },
  todoRowClickable: { borderRadius: 10 },
  todoAvatar: { width: 26, height: 26, borderRadius: 13, backgroundColor: '#f3f4f6', marginTop: 2 },
  todoTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  todoTop: { fontSize: 12, fontWeight: '800', color: '#111827' },
  todoSourceBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  todoSourceBadgeCanvas: { backgroundColor: '#dbeafe' },
  todoSourceBadgeCustom: { backgroundColor: '#dcfce7' },
  todoSourceBadgeText: { fontSize: 10, fontWeight: '800', color: '#111827' },
  todoText: { marginTop: 4, fontSize: 13, color: '#6b7280' },
  todoMeta: { marginTop: 4, fontSize: 11, color: '#9ca3af' },
  todoMetaStrong: { marginTop: 3, fontSize: 11, fontWeight: '700', color: '#374151' },
  todoLinkHint: { marginTop: 4, fontSize: 10, fontWeight: '700', color: '#2563eb' },
  todoEmpty: { fontSize: 12, color: '#6b7280', marginBottom: 4 },
  todoWarning: { fontSize: 12, color: '#b45309', marginBottom: 4 },
  todoError: { fontSize: 12, color: '#b91c1c', marginBottom: 4 },
  todoLine: { marginTop: 8, height: 3, borderRadius: 2, backgroundColor: '#e5e7eb', width: '88%' },
});
