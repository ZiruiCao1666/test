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

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL;
const SUMMARY_CACHE_PREFIX = 'home_summary_v1';

export default function HomeScreen() {
  const { user, isLoaded: userLoaded } = useUser();
  const { isLoaded: authLoaded, isSignedIn, getToken } = useAuth();
  const { profile } = useUserProfile();

  const username =
    profile?.displayName ||
    user?.firstName ||
    user?.fullName ||
    user?.primaryEmailAddress?.emailAddress ||
    'Student';

  const avatarUrl = profile?.avatarUrl || user?.imageUrl || null;
  const avatarInitial = getProfileInitial(username);

  const [totalSignedDays, setTotalSignedDays] = React.useState(0);
  const [streakDays, setStreakDays] = React.useState(0);
  const [checkedInToday, setCheckedInToday] = React.useState(false);
  const [points, setPoints] = React.useState(0);

  const [loadingSummary, setLoadingSummary] = React.useState(false);
  const [summaryError, setSummaryError] = React.useState(null);
  const [checkingIn, setCheckingIn] = React.useState(false);
  const [hasCachedSummary, setHasCachedSummary] = React.useState(false);
  const [summaryReady, setSummaryReady] = React.useState(false);

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

      const token = await getTokenRef.current?.();
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
  }, [fetchWithTimeout, authLoaded, isSignedIn, userLoaded, user?.id, applySummaryData, persistSummaryToCache]);

  useFocusEffect(
    React.useCallback(() => {
      if (!authLoaded || !isSignedIn || !userLoaded || !user?.id) return undefined;

      let alive = true;

      (async () => {
        const hasCache = await hydrateSummaryFromCache();
        if (!alive) return;
        await loadSummary({ silent: hasCache, timeoutMs: 25000 });
      })();

      return () => {
        alive = false;
      };
    }, [authLoaded, isSignedIn, userLoaded, user?.id, hydrateSummaryFromCache, loadSummary]),
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

      const token = await getToken();
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

  const todoItems = [
    { id: '1', daysLeft: 3, title: 'No tasks have been synchronized or added yet.' },
    { id: '2', daysLeft: 5, title: 'No tasks have been synchronized or added yet.' },
    { id: '3', daysLeft: 7, title: 'No tasks have been synchronized or added yet.' },
  ];

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

          {todoItems.map((item) => (
            <View key={item.id} style={styles.todoRow}>
              {avatarUrl ? (
                <Image source={{ uri: avatarUrl }} style={styles.todoAvatar} />
              ) : (
                <View style={[styles.todoAvatar, styles.avatarFallback]}>
                  <Text style={styles.avatarFallbackText}>{avatarInitial}</Text>
                </View>
              )}

              <View style={{ flex: 1 }}>
                <Text style={styles.todoTop}>{item.daysLeft} days left</Text>
                <Text style={styles.todoText}>{item.title}</Text>
                <View style={styles.todoLine} />
              </View>
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
  todoRow: { flexDirection: 'row', gap: 10, paddingVertical: 10 },
  todoAvatar: { width: 26, height: 26, borderRadius: 13, backgroundColor: '#f3f4f6', marginTop: 2 },
  todoTop: { fontSize: 12, fontWeight: '800', color: '#111827' },
  todoText: { marginTop: 4, fontSize: 13, color: '#6b7280' },
  todoLine: { marginTop: 8, height: 3, borderRadius: 2, backgroundColor: '#e5e7eb', width: '88%' },
});
