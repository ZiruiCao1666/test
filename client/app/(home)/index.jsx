import React from 'react';
import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  Image,
  ScrollView,
  Pressable,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useUser, useAuth } from '@clerk/clerk-expo';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL;

export default function HomeScreen() {
  const { user, isLoaded: userLoaded } = useUser();
  const { isLoaded: authLoaded, isSignedIn, getToken } = useAuth();

  const username =
    user?.firstName ||
    user?.fullName ||
    user?.primaryEmailAddress?.emailAddress ||
    'Student';

  const avatarUrl = user?.imageUrl || null;

  const [totalSignedDays, setTotalSignedDays] = React.useState(0);
  const [checkedInToday, setCheckedInToday] = React.useState(false);
  const [points, setPoints] = React.useState(0);

  const [loadingSummary, setLoadingSummary] = React.useState(true);
  const [summaryError, setSummaryError] = React.useState(null);
  const [checkingIn, setCheckingIn] = React.useState(false);

  const getTokenRef = React.useRef(getToken);
  React.useEffect(() => {
    getTokenRef.current = getToken;
  }, [getToken]);

  const fetchWithTimeout = React.useCallback(async (url, options = {}, timeoutMs = 10000) => {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);

    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } finally {
      clearTimeout(id);
    }
  }, []);

  const loadSummary = React.useCallback(async (options = {}) => {
    const { silent = false } = options;
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

      // 从 /me/summary 改成 /checkins/status
      const res = await fetchWithTimeout(`${API_BASE_URL}/checkins/status`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Failed to load summary');

      // 对齐后端返回字段
      setTotalSignedDays(Number(data.totalDays) || 0);
      setCheckedInToday(Boolean(data.checkedInToday));
      setPoints(Number(data.points) || 0);
    } catch (e) {
      setSummaryError(e?.message || 'Failed to load summary');
      console.log('[Home] loadSummary error:', e?.message || e);
      console.log('[Home] API_BASE_URL =', API_BASE_URL);
      console.log('[Home] URL =', `${API_BASE_URL}/checkins/status`);
    } finally {
      if (!silent) {
        setLoadingSummary(false);
      }
    }
  }, [fetchWithTimeout, authLoaded, isSignedIn, userLoaded, user?.id]);

  React.useEffect(() => {
    if (!authLoaded || !isSignedIn || !userLoaded || !user?.id) return;
    loadSummary();
  }, [loadSummary, authLoaded, isSignedIn, userLoaded, user?.id]);

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
      setCheckedInToday(true);
      if (data?.totalDays !== undefined) {
        setTotalSignedDays(Number(data.totalDays) || 0);
      }
      if (data?.points !== undefined) {
        setPoints(Number(data.points) || 0);
      }

      // 对齐后端返回 gainedPoints
      const gained = Number(data.gainedPoints) || 0;
      Alert.alert('Check-in', gained > 0 ? `Checked in for today (+${gained} points)` : 'Already checked in today');
    } catch (e) {
      Alert.alert('Error', e?.message || 'Something went wrong');
    } finally {
      setCheckingIn(false);
    }
  };

  // 现在先把 lastingDays 简化为 totalSignedDays（你后续如果要“连续天数 streak”，我们再加）
  const lastingDays = totalSignedDays;

  const todoItems = [
    { id: '1', daysLeft: 3, title: 'Finish weekly study plan' },
    { id: '2', daysLeft: 5, title: 'Review notes and summarize' },
    { id: '3', daysLeft: 7, title: 'Prepare assignment draft' },
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
                <Text style={styles.avatarFallbackText}>U</Text>
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
            {loadingSummary ? (
              <ActivityIndicator />
            ) : (
              <Text style={styles.cardBig}>
                {summaryError ? '--' : lastingDays}
                <Text style={styles.cardBigUnit}> days</Text>
              </Text>
            )}
            <Text style={styles.cardHint}>Continuous sign-in builds habits</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardLabel}>points</Text>
            <View style={{ height: 6 }} />
            {loadingSummary ? (
              <ActivityIndicator />
            ) : (
              <Text style={styles.cardBig}>{summaryError ? '--' : points}</Text>
            )}
            <Text style={styles.cardHint}>Earn points by daily check-in</Text>
          </View>
        </View>

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
            <Text style={styles.star}>☆</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.infoTitle}>
                Signed in for a total of {loadingSummary ? '...' : (summaryError ? '--' : totalSignedDays)} days
              </Text>
              <Text style={styles.infoSub}>
                {summaryError ? 'summary failed to load' : (checkedInToday ? 'today: checked' : 'today: not yet')}
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
                  <Text style={styles.avatarFallbackText}>U</Text>
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
