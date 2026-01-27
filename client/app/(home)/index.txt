// import React from 'react';
// import { View, Text } from 'react-native';
// import { useUser } from '@clerk/clerk-expo';
// import SignOutButton from '../../components/SignOutButton';

// export default function HomeScreen() {
//   const { user } = useUser();

//   const email =
//     user?.primaryEmailAddress?.emailAddress ||
//     user?.emailAddresses?.[0]?.emailAddress ||
//     'Student';

//   return (
//     <View style={{ flex: 1, padding: 20, justifyContent: 'center', gap: 10 }}>
//       <Text style={{ fontSize: 26, fontWeight: '800' }}>
//         Student Motivation
//       </Text>

//       <Text style={{ fontSize: 16 }}>
//         Welcome, {user?.firstName || email}
//       </Text>

//       <View style={{ height: 16 }} />
//       <SignOutButton />
//     </View>
//   );
// }


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

const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL || 'http://localhost:4000';

export default function HomeScreen() {
  const { user } = useUser();
  const { getToken } = useAuth();

  const username =
    user?.firstName ||
    user?.fullName ||
    user?.primaryEmailAddress?.emailAddress ||
    'Student';

  const avatarUrl = user?.imageUrl || null;

  const [totalSignedDays, setTotalSignedDays] = React.useState(0);
  const [checkedInToday, setCheckedInToday] = React.useState(false);
  const [loadingSummary, setLoadingSummary] = React.useState(true);
  const [checkingIn, setCheckingIn] = React.useState(false);

  const loadSummary = React.useCallback(async () => {
    try {
      setLoadingSummary(true);

      const token = await getToken();
      if (!token) return;

      const res = await fetch(`${API_BASE_URL}/me/summary`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Failed to load summary');

      setTotalSignedDays(Number(data.totalDays) || 0);
      setCheckedInToday(Boolean(data.checkedInToday));
    } catch (e) {
      console.log('[Home] loadSummary error:', e?.message || e);
    } finally {
      setLoadingSummary(false);
    }
  }, [getToken]);

  React.useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  const onCheckIn = async () => {
    if (checkingIn) return;

    try {
      setCheckingIn(true);

      const token = await getToken();
      if (!token) throw new Error('No session token');

      const res = await fetch(`${API_BASE_URL}/checkins/today`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Check-in failed');

      await loadSummary();

      Alert.alert(
        'Check-in',
        data.inserted ? 'Checked in for today' : 'Already checked in today'
      );
    } catch (e) {
      Alert.alert('Error', e?.message || 'Something went wrong');
    } finally {
      setCheckingIn(false);
    }
  };

  // 先把 lastingDays 简化成等于 totalSignedDays（你只要求“从第 1 天开始能加天数”）
  const lastingDays = totalSignedDays;

  // points 暂时用 0 占位（你后面要再算学习分钟数再接）
  const points = 0;

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
                {lastingDays}
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
              <Text style={styles.cardBig}>{points}</Text>
            )}
            <Text style={styles.cardHint}>This will connect later</Text>
          </View>
        </View>

        <View style={styles.centerBlock}>
          <Pressable
            onPress={onCheckIn}
            style={({ pressed }) => [
              styles.circle,
              pressed ? { opacity: 0.85, transform: [{ scale: 0.99 }] } : null,
            ]}
          >
            {checkingIn ? (
              <ActivityIndicator />
            ) : (
              <Text style={styles.circleText}>Click to{'\n'}check in</Text>
            )}
          </Pressable>

          <View style={styles.infoRow}>
            <Text style={styles.star}>☆</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.infoTitle}>
                Signed in for a total of {loadingSummary ? '...' : totalSignedDays} days
              </Text>
              <Text style={styles.infoSub}>
                {checkedInToday ? 'today: checked' : 'today: not yet'}
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
