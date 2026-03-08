import React from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@clerk/clerk-expo';
import { useFocusEffect } from '@react-navigation/native';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL;

function formatDate(dateValue) {
  if (!dateValue) return '--';
  const d = new Date(dateValue);
  if (Number.isNaN(d.getTime())) return '--';
  return d.toLocaleString();
}

export default function OrdersScreen() {
  const { isLoaded: authLoaded, isSignedIn, getToken } = useAuth();
  const getTokenRef = React.useRef(getToken);

  React.useEffect(() => {
    getTokenRef.current = getToken;
  }, [getToken]);

  const [orders, setOrders] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);

  const fetchWithTimeout = React.useCallback(async (url, options = {}, timeoutMs = 20000) => {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } finally {
      clearTimeout(id);
    }
  }, []);

  const loadOrders = React.useCallback(async () => {
    if (!authLoaded || !isSignedIn) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      if (!API_BASE_URL) {
        throw new Error('Missing EXPO_PUBLIC_API_URL');
      }

      const token = await getTokenRef.current?.();
      if (!token) throw new Error('No session token');

      const res = await fetchWithTimeout(`${API_BASE_URL}/rewards/orders`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Failed to load orders');

      setOrders(Array.isArray(data?.items) ? data.items : []);
    } catch (e) {
      setError(e?.name === 'AbortError' ? 'Request timeout. Please retry.' : (e?.message || 'Failed to load orders'));
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, [authLoaded, isSignedIn, fetchWithTimeout]);

  useFocusEffect(
    React.useCallback(() => {
      loadOrders();
    }, [loadOrders]),
  );

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.headerRow}>
          <Text style={styles.headerTitle}>my orders</Text>
          <Pressable
            onPress={loadOrders}
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

        {!loading && orders.length === 0 ? (
          <Text style={styles.emptyText}>No redemption records yet.</Text>
        ) : null}

        {orders.map((item) => (
          <View key={String(item.id)} style={styles.card}>
            <View style={styles.cardTop}>
              <Text style={styles.cardTitle}>{item.title || 'reward'}</Text>
              <View style={styles.statusBadge}>
                <Text style={styles.statusText}>{item.status || 'completed'}</Text>
              </View>
            </View>

            <Text style={styles.metaText}>{Number(item.pointsCost) || 0} points</Text>
            <Text style={styles.metaText}>{formatDate(item.createdAt)}</Text>
          </View>
        ))}

        <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  container: { padding: 18 },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#111827',
  },
  refreshBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#111827',
  },
  refreshText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  errorText: {
    color: '#b91c1c',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 10,
  },
  loadingWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  emptyText: {
    color: '#6b7280',
    fontSize: 13,
  },
  card: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    backgroundColor: '#fff',
    padding: 12,
    marginBottom: 10,
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#111827',
    flex: 1,
    marginRight: 8,
  },
  statusBadge: {
    backgroundColor: '#f3f4f6',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  statusText: {
    color: '#111827',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'lowercase',
  },
  metaText: {
    color: '#6b7280',
    fontSize: 12,
    marginBottom: 2,
  },
});
