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

const getItemTimestamp = (item) => {
  const direct = Number(item?.timestampMs);
  if (Number.isFinite(direct)) return direct;

  const parsed = new Date(item?.date || '').getTime();
  return Number.isFinite(parsed) ? parsed : null;
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
  const timestamp = getItemTimestamp(item);
  if (timestamp === null) {
    return item?.date ? String(item.date) : 'Time not synced';
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
  if (item?.source === 'canvas') {
    const parts = [item?.course, item?.type].filter(Boolean);
    return parts.length > 0 ? parts.join(' | ') : 'Canvas item';
  }
  const parts = [item?.type].filter(Boolean);
  return parts.length > 0 ? parts.join(' | ') : 'Custom task';
};

const groupPlanItems = (items) => {
  const nowTs = Date.now();
  const sections = [
    { key: '24h', title: 'Within 24 hours', items: [] },
    { key: '3d', title: 'Within 3 days', items: [] },
    { key: '7d', title: 'Within 7 days', items: [] },
  ];

  (Array.isArray(items) ? items : []).forEach((item) => {
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

  const username =
    user?.firstName ||
    user?.fullName ||
    user?.primaryEmailAddress?.emailAddress ||
    'Student';
  const avatarUrl = user?.imageUrl || null;
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
    if (!user?.id) return null;
    return `${SUMMARY_CACHE_PREFIX}:${user.id}`;
  }, [user?.id]);

  const applySummaryData = React.useCallback((data = {}) => {
    const nextTotal = Number(data?.totalDays) || 0;
    const nextStreak = data?.streakDays !== undefined
      ? Number(data?.streakDays) || 0
      : nextTotal;

    setTotalSignedDays(nextTotal);
    setStreakDays(nextStreak);
    setCheckedInToday(Boolean(data?.checkedInToday));
    setPoints(Number(data?.points) || 0);
    setSummaryReady(true);
  }, []);

  const persistSummaryToCache = React.useCallback(async (data = {}) => {
    if (!summaryCacheKey) return;

    try {
      const payload = {
        totalDays: Number(data?.totalDays) || 0,
        streakDays: data?.streakDays !== undefined ? Number(data?.streakDays) || 0 : undefined,
        checkedInToday: Boolean(data?.checkedInToday),
        points: Number(data?.points) || 0,
        updatedAt: Date.now(),
      };

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
      const token = await getTokenRef.current?.();
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

      if (!authLoaded || !isSignedIn || !userLoaded || !user?.id) return;

      const token = await getSessionToken();
      if (!token) return;

      const res = await fetchWithTimeout(`${API_BASE_URL}/checkins/status`, {
        headers: { Authorization: `Bearer ${token}` },
      }, timeoutMs);

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Failed to load summary');

      applySummaryData(data);
      persistSummaryToCache(data);
      summaryRetryRef.current = 0;
    } catch (e) {
      if (e?.name === 'AbortError') {
        setSummaryError('Network is slow. Retrying in background...');
      } else {
        setSummaryError(e?.message || 'Failed to load summary');
      }

      if (summaryRetryRef.current < 2) {
        summaryRetryRef.current += 1;
        setTimeout(() => {
          loadSummary({ silent: true, timeoutMs: 25000 });
        }, 1500);
      }

      console.log('[Home] loadSummary error:', e?.message || e);
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
    user?.id,
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

      if (!authLoaded || !isSignedIn || !userLoaded || !user?.id) return;

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
      if (!res.ok) throw new Error(data?.error || 'Failed to load seven-day plan');

      setHomePlanItems(Array.isArray(data?.items) ? data.items : []);
      setCanvasPlanWarning(String(data?.canvasError || '').trim());
    } catch (e) {
      setHomePlanItems([]);
      setCanvasPlanWarning('');
      setHomePlanError(e?.message || 'Failed to load seven-day plan');
      console.log('[Home] loadHomePlan error:', e?.message || e);
    } finally {
      if (!silent) {
        setLoadingHomePlan(false);
      }
    }
  }, [fetchWithTimeout, authLoaded, isSignedIn, userLoaded, user?.id, getSessionToken]);

  useFocusEffect(
    React.useCallback(() => {
      if (!authLoaded || !isSignedIn || !userLoaded || !user?.id) return undefined;

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
      user?.id,
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
      if (!res.ok) throw new Error(data?.error || 'Check-in failed');

      setSummaryError(null);
      applySummaryData(data);
      persistSummaryToCache(data);

      const gained = Number(data.gainedPoints) || 0;
      Alert.alert('Check-in', gained > 0 ? `Checked in for today (+${gained} points)` : 'Already checked in today');
    } catch (e) {
      Alert.alert('Error', e?.message || 'Something went wrong');
    } finally {
      setCheckingIn(false);
    }
  };

  const lastingDays = streakDays || totalSignedDays;
  const groupedHomePlan = React.useMemo(() => groupPlanItems(homePlanItems), [homePlanItems]);
  const openPlanItem = React.useCallback(async (item) => {
    if (!item?.htmlUrl) return;
    try {
      await Linking.openURL(item.htmlUrl);
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
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarFallback]}>
                <Text style={styles.avatarFallbackText}>{avatarInitial}</Text>
              </View>
            )}
          </View>
        </View>

        <Text style={styles.greeting}>
          hi <Text style={styles.greetingBold}>{username}</Text>, how are you today?
        </Text>

        <View style={styles.statsRow}>
          <View style={styles.card}>
            <Text style={styles.cardLabel}>Lasting days</Text>
            <View style={{ height: 6 }} />
            {!summaryReady ? (
              <ActivityIndicator />
            ) : (
              <>
                <Text style={styles.cardBig}>
                  {lastingDays}
                  <Text style={styles.cardBigUnit}> days</Text>
                </Text>
                {loadingSummary ? <ActivityIndicator size="small" style={{ marginTop: 6 }} /> : null}
              </>
            )}
            <Text style={styles.cardHint}>Continuous sign-in builds habits</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardLabel}>points</Text>
            <View style={{ height: 6 }} />
            {!summaryReady ? (
              <ActivityIndicator />
            ) : (
              <>
                <Text style={styles.cardBig}>{points}</Text>
                {loadingSummary ? <ActivityIndicator size="small" style={{ marginTop: 6 }} /> : null}
              </>
            )}
            <Text style={styles.cardHint}>Earn points by daily check-in</Text>
          </View>
        </View>

        {summaryError ? (
          <Text style={{ marginBottom: 10, fontSize: 12, color: '#b91c1c' }}>
            {summaryError}
          </Text>
        ) : null}

        <View style={styles.centerBlock}>
          <Pressable
            onPress={onCheckIn}
            disabled={checkingIn || checkedInToday}
            style={({ pressed }) => [
              styles.circle,
              (checkingIn || checkedInToday) ? { opacity: 0.6 } : null,
              pressed ? { opacity: 0.85, transform: [{ scale: 0.99 }] } : null,
            ]}
          >
            {checkingIn ? (
              <ActivityIndicator />
            ) : (
              <Text style={styles.circleText}>
                {checkedInToday ? 'Checked in\ntoday' : 'Click to\ncheck in'}
              </Text>
            )}
          </Pressable>

          <View style={styles.infoRow}>
            <Text style={styles.star}>*</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.infoTitle}>
                Signed in for a total of {summaryReady ? totalSignedDays : '...'} days
              </Text>
              <Text style={styles.infoSub}>
                {summaryError ? 'summary sync delayed' : (checkedInToday ? 'today: checked' : 'today: not yet')}
              </Text>
              <View style={styles.progressLine} />
            </View>
          </View>
        </View>

        <View style={styles.todoCard}>
          <Text style={styles.todoTitle}>Things to be done within seven days</Text>
          {loadingHomePlan ? <ActivityIndicator style={{ marginVertical: 10 }} /> : null}
          {homePlanError ? <Text style={styles.todoError}>{homePlanError}</Text> : null}
          {canvasPlanWarning ? <Text style={styles.todoWarning}>{canvasPlanWarning}</Text> : null}

          {!loadingHomePlan && !homePlanError && groupedHomePlan.length === 0 ? (
            <Text style={styles.todoEmpty}>No Canvas or custom tasks in the next seven days.</Text>
          ) : null}

          {groupedHomePlan.map((section) => (
            <View key={section.key} style={styles.todoSection}>
              <Text style={styles.todoSectionTitle}>
                {section.title} ({section.items.length})
              </Text>

              {section.items.map((item) => {
                const Row = item?.htmlUrl ? Pressable : View;
                const rowProps = item?.htmlUrl
                  ? {
                      onPress: () => openPlanItem(item),
                      style: ({ pressed }) => [
                        styles.todoRow,
                        styles.todoRowClickable,
                        pressed ? { opacity: 0.75 } : null,
                      ],
                    }
                  : {
                      style: styles.todoRow,
                    };

                return (
                  <Row key={item.id} {...rowProps}>
                    {avatarUrl ? (
                      <Image source={{ uri: avatarUrl }} style={styles.todoAvatar} />
                    ) : (
                      <View style={[styles.todoAvatar, styles.avatarFallback]}>
                        <Text style={styles.avatarFallbackText}>{avatarInitial}</Text>
                      </View>
                    )}

                    <View style={{ flex: 1 }}>
                      <View style={styles.todoTopRow}>
                        <Text style={styles.todoTop}>{formatDaysLeft(item)}</Text>
                        <View
                          style={[
                            styles.todoSourceBadge,
                            item?.source === 'custom'
                              ? styles.todoSourceBadgeCustom
                              : styles.todoSourceBadgeCanvas,
                          ]}
                        >
                          <Text style={styles.todoSourceBadgeText}>
                            {item?.source === 'custom' ? 'Custom' : 'Canvas'}
                          </Text>
                        </View>
                      </View>
                      <Text style={styles.todoText}>{item?.title || 'Untitled task'}</Text>
                      <Text style={styles.todoMeta}>{getPlanDetail(item)}</Text>
                      <Text style={styles.todoMetaStrong}>{formatPlanDateTime(item)}</Text>
                      {item?.htmlUrl ? <Text style={styles.todoLinkHint}>Open in Canvas</Text> : null}
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
