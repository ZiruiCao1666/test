import React from 'react';
import {
  View,
  Text,
  Image,
  ScrollView,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useUser, useAuth } from '@clerk/clerk-expo';
import { useFocusEffect } from '@react-navigation/native';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL;

const FALLBACK_CATALOG = [
  { id: 1, title: 'Coffee Coupon', pointsCost: 120, category: 'drinks', imageUrl: '', isActive: true },
  { id: 2, title: 'Latte Coupon', pointsCost: 160, category: 'drinks', imageUrl: '', isActive: true },
  { id: 3, title: 'Discount Coupon', pointsCost: 200, category: 'coupon', imageUrl: '', isActive: true },
  { id: 4, title: 'Big Discount Coupon', pointsCost: 260, category: 'coupon', imageUrl: '', isActive: true },
];

const CATEGORY_LABELS = {
  drinks: 'drinks',
  coupon: 'discount coupon',
};

function normalizeCatalog(items) {
  if (!Array.isArray(items)) return [];
  return items
    .map((raw, index) => {
      const pointsCost = Number(raw?.pointsCost ?? raw?.points_cost ?? raw?.points);
      return {
        id: raw?.id ?? `fallback-${index}`,
        title: String(raw?.title ?? 'reward'),
        pointsCost: Number.isFinite(pointsCost) ? pointsCost : 0,
        category: String(raw?.category ?? 'coupon'),
        imageUrl: String(raw?.imageUrl ?? raw?.image_url ?? ''),
        isActive: raw?.isActive ?? raw?.is_active ?? true,
      };
    })
    .filter((it) => it.isActive);
}

function groupByCategory(items) {
  return items.reduce((acc, item) => {
    const key = item.category || 'coupon';
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});
}

export default function RewardsScreen() {
  const router = useRouter();
  const { user } = useUser();
  const { isLoaded: authLoaded, isSignedIn, getToken } = useAuth();
  const { profile } = useUserProfile();
  const avatarUrl = profile?.avatarUrl || user?.imageUrl || null;
  const avatarInitial = getProfileInitial(profile?.displayName || user?.fullName || user?.firstName);
  const getTokenRef = React.useRef(getToken);

  React.useEffect(() => {
    getTokenRef.current = getToken;
  }, [getToken]);

  const [points, setPoints] = React.useState(0);
  const [catalog, setCatalog] = React.useState(FALLBACK_CATALOG);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);
  const [redeemingId, setRedeemingId] = React.useState(null);

  const fetchWithTimeout = React.useCallback(async (url, options = {}, timeoutMs = 20000) => {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } finally {
      clearTimeout(id);
    }
  }, []);

  const loadRewards = React.useCallback(async () => {
    if (!authLoaded || !isSignedIn) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const token = await getTokenRef.current?.();
      if (!token) throw new Error('No session token');

      if (!API_BASE_URL) {
        setCatalog(FALLBACK_CATALOG);
        setError('Missing EXPO_PUBLIC_API_URL, using local rewards list.');
        return;
      }

      const [statusRes, catalogRes] = await Promise.all([
        fetchWithTimeout(`${API_BASE_URL}/checkins/status`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetchWithTimeout(`${API_BASE_URL}/rewards/catalog`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      const statusData = await statusRes.json().catch(() => ({}));
      if (statusRes.ok) {
        setPoints(Number(statusData?.points) || 0);
      } else {
        throw new Error(statusData?.error || 'Failed to load points');
      }

      if (catalogRes.ok) {
        const catalogData = await catalogRes.json().catch(() => ({}));
        const normalized = normalizeCatalog(catalogData?.items);
        setCatalog(normalized.length ? normalized : FALLBACK_CATALOG);
      } else {
        setCatalog(FALLBACK_CATALOG);
      }
    } catch (e) {
      setCatalog(FALLBACK_CATALOG);
      setError(e?.name === 'AbortError' ? 'Request timeout, please retry.' : (e?.message || 'Failed to load rewards'));
    } finally {
      setLoading(false);
    }
  }, [authLoaded, isSignedIn, fetchWithTimeout]);

  useFocusEffect(
    React.useCallback(() => {
      loadRewards();
    }, [loadRewards]),
  );

  const onRedeem = async (item) => {
    if (redeemingId) return;

    if (points < item.pointsCost) {
      Alert.alert('Insufficient points', 'You do not have enough points for this reward.');
      return;
    }

    try {
      setRedeemingId(item.id);

      if (!API_BASE_URL) {
        setPoints((prev) => Math.max(0, prev - item.pointsCost));
        Alert.alert('Redeemed', `${item.title} redeemed (local mode).`);
        return;
      }

      const token = await getTokenRef.current?.();
      if (!token) throw new Error('No session token');

      const res = await fetchWithTimeout(`${API_BASE_URL}/rewards/redeem`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ rewardId: item.id }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (res.status === 409) {
          Alert.alert('Insufficient points', data?.error || 'Not enough points for this reward.');
          return;
        }
        throw new Error(data?.error || 'Redeem failed');
      }

      if (data?.remainingPoints !== undefined) {
        setPoints(Number(data.remainingPoints) || 0);
      } else {
        setPoints((prev) => Math.max(0, prev - item.pointsCost));
      }

      Alert.alert('Redeemed', `${item.title} redeemed successfully.`);
      loadRewards();
    } catch (e) {
      Alert.alert('Error', e?.name === 'AbortError' ? 'Request timeout, please retry.' : (e?.message || 'Redeem failed'));
    } finally {
      setRedeemingId(null);
    }
  };

  const sections = groupByCategory(catalog);
  const sectionKeys = Object.keys(sections);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerRow}>
          <Text style={styles.headerTitle}>rewards point shop</Text>

          <View style={styles.headerRight}>
            <Pressable
              onPress={() => router.push('/orders')}
              style={({ pressed }) => [
                styles.ordersBtn,
                pressed ? { opacity: 0.7 } : null,
              ]}
            >
              <Text style={styles.ordersText}>my orders</Text>
            </Pressable>

            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarFallback]}>
                <Text style={styles.avatarFallbackText}>{avatarInitial}</Text>
              </View>
            )}
          </View>
        </View>

        <View style={styles.pointsCard}>
          <View>
            <Text style={styles.pointsLabel}>my points</Text>
            <Text style={styles.pointsValue}>
              {loading ? '...' : points}
            </Text>
          </View>
          <Pressable
            onPress={loadRewards}
            disabled={loading}
            style={({ pressed }) => [
              styles.refreshBtn,
              loading ? { opacity: 0.6 } : null,
              pressed ? { opacity: 0.7 } : null,
            ]}
          >
            <Text style={styles.refreshText}>{loading ? 'loading' : 'refresh'}</Text>
          </Pressable>
        </View>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator />
          </View>
        ) : null}

        {sectionKeys.map((key, idx) => (
          <View key={key} style={idx > 0 ? { marginTop: 18 } : null}>
            <Text style={styles.sectionTitle}>{CATEGORY_LABELS[key] || key}</Text>
            <View style={styles.grid}>
              {sections[key].map((item) => {
                const disabled = redeemingId === item.id;
                return (
                  <View key={String(item.id)} style={styles.card}>
                    <View style={styles.cardImageSlot}>
                      {item.imageUrl ? (
                        <Image source={{ uri: item.imageUrl }} style={styles.cardImage} />
                      ) : (
                        <Text style={styles.cardImageHint}>image</Text>
                      )}
                    </View>
                    <Text style={styles.cardTitle}>{item.title}</Text>
                    <Text style={styles.cardPoints}>{item.pointsCost} points</Text>

                    <Pressable
                      onPress={() => onRedeem(item)}
                      disabled={disabled}
                      style={({ pressed }) => [
                        styles.redeemBtn,
                        disabled ? { opacity: 0.65 } : null,
                        pressed ? { opacity: 0.8 } : null,
                      ]}
                    >
                      <Text style={styles.redeemText}>{disabled ? 'redeeming...' : 'redeem'}</Text>
                    </Pressable>
                  </View>
                );
              })}
            </View>
          </View>
        ))}

        {!loading && sectionKeys.length === 0 ? (
          <Text style={styles.emptyText}>No rewards available now.</Text>
        ) : null}

        <View style={{ height: 90 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  container: { paddingHorizontal: 18, paddingTop: 12 },

  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  ordersBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: '#f3f4f6',
  },
  ordersText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#111827',
  },
  avatar: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#f3f4f6' },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  avatarFallbackText: { fontSize: 12, fontWeight: '800', color: '#111827' },

  pointsCard: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    backgroundColor: '#ffffff',
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pointsLabel: {
    fontSize: 12,
    color: '#6b7280',
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  pointsValue: {
    marginTop: 4,
    fontSize: 24,
    fontWeight: '900',
    color: '#111827',
  },
  refreshBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#111827',
  },
  refreshText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  errorText: {
    marginBottom: 12,
    color: '#b91c1c',
    fontSize: 12,
    fontWeight: '600',
  },
  loadingWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
  },

  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#6b7280',
    marginBottom: 10,
    marginLeft: 2,
    textTransform: 'lowercase',
  },

  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 14,
  },

  card: {
    width: '48%',
    minHeight: 190,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#fff',
    padding: 12,
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  cardImageSlot: {
    height: 72,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#f9fafb',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
    overflow: 'hidden',
  },
  cardImage: {
    width: '100%',
    height: '100%',
  },
  cardImageHint: {
    fontSize: 11,
    fontWeight: '700',
    color: '#9ca3af',
    textTransform: 'uppercase',
  },
  cardTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#111827',
  },
  cardPoints: {
    marginTop: 6,
    marginBottom: 12,
    fontSize: 11,
    color: '#6b7280',
  },
  redeemBtn: {
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#111827',
    alignItems: 'center',
  },
  redeemText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  emptyText: {
    marginTop: 12,
    color: '#6b7280',
    fontSize: 13,
  },
});
