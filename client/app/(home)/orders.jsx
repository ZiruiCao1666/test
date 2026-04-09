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
import { API_BASE_URL, apiGet } from '../../lib/api';
import { useAppTheme } from '../../lib/app-theme';

function getErrorMessage(error, fallbackMessage) {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallbackMessage;
}

function isAbortError(error) {
  return error instanceof Error && error.name === 'AbortError';
}

function getStyleWhen(condition, style) {
  if (condition) {
    return style;
  }
  return null;
}

function renderNodeWhen(condition, node) {
  if (!condition) {
    return null;
  }
  return node;
}

function getRefreshText(loading) {
  if (loading) {
    return 'loading';
  }
  return 'refresh';
}

function formatDate(dateValue) {
  if (!dateValue) return '--';
  const d = new Date(dateValue);
  if (Number.isNaN(d.getTime())) return '--';
  return d.toLocaleString();
}

export default function OrdersScreen() {
  const { isLoaded: authLoaded, isSignedIn, getToken } = useAuth();
  const { theme } = useAppTheme();
  const getTokenRef = React.useRef(getToken);

  React.useEffect(() => {
    getTokenRef.current = getToken;
  }, [getToken]);

  const [orders, setOrders] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);

  const loadOrders = React.useCallback(async () => {
    if (!authLoaded || !isSignedIn) {
      setLoading(false);
      return;
    }

    try {
      // Orders are account data, so every request stays behind the current Clerk session token.
      setLoading(true);
      setError(null);

      if (!API_BASE_URL) {
        throw new Error('Missing EXPO_PUBLIC_API_URL');
      }

      const getToken = getTokenRef.current;
      let token = '';
      if (typeof getToken === 'function') {
        token = await getToken();
      }
      if (!token) {
        throw new Error('No session token');
      }

      const data = await apiGet('/rewards/orders', token, {
        timeoutMs: 20000,
        fallbackMessage: 'Failed to load orders',
      });

      if (Array.isArray(data.items)) {
        setOrders(data.items);
      } else {
        setOrders([]);
      }
    } catch (e) {
      if (isAbortError(e)) {
        setError('Request timeout. Please retry.');
      } else {
        setError(getErrorMessage(e, 'Failed to load orders'));
      }
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, [authLoaded, isSignedIn]);

  useFocusEffect(
    React.useCallback(() => {
      loadOrders();
    }, [loadOrders]),
  );

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.screenBg }]}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <View
          style={[
            styles.heroCard,
            {
              backgroundColor: theme.surface,
              borderColor: theme.border,
            },
          ]}
        >
          <View style={styles.headerRow}>
            <View style={styles.headerTextBlock}>
              <Text style={[styles.headerEyebrow, { color: theme.textSecondary }]}>Orders</Text>
              <Text style={[styles.headerTitle, { color: theme.textPrimary }]}>My Redemptions</Text>
              <Text style={[styles.headerSubtitle, { color: theme.textSecondary }]}>
                Review the rewards you have already redeemed.
              </Text>
            </View>

            <Pressable
              onPress={loadOrders}
              disabled={loading}
              style={({ pressed }) => [
                styles.refreshBtn,
                { backgroundColor: theme.primary },
                getStyleWhen(loading, { opacity: 0.6 }),
                getStyleWhen(pressed, { opacity: 0.7 }),
              ]}
            >
              <Text style={[styles.refreshText, { color: theme.primaryText }]}>{getRefreshText(loading)}</Text>
            </Pressable>
          </View>
        </View>

        {renderNodeWhen(error, <Text style={styles.errorText}>{error}</Text>)}

        {renderNodeWhen(loading, (
          <View style={styles.loadingWrap}>
            <ActivityIndicator />
          </View>
        ))}

        {renderNodeWhen(!loading && orders.length === 0, (
          <Text style={styles.emptyText}>No redemption records yet.</Text>
        ))}

        {orders.map((item) => (
          <View
            key={String(item.id)}
            style={[
              styles.card,
              {
                backgroundColor: theme.surface,
                borderColor: theme.border,
              },
            ]}
          >
            <View style={styles.cardTop}>
              <Text style={[styles.cardTitle, { color: theme.textPrimary }]}>{item.title || 'reward'}</Text>
              <View
                style={[
                  styles.statusBadge,
                  {
                    backgroundColor: theme.surfaceMuted,
                  },
                ]}
              >
                <Text style={[styles.statusText, { color: theme.textSecondary }]}>
                  {item.status || 'completed'}
                </Text>
              </View>
            </View>

            <View style={styles.metaGroup}>
              <Text style={[styles.metaText, { color: theme.textSecondary }]}>
                {Number(item.pointsCost) || 0} points
              </Text>
              <Text style={[styles.metaText, { color: theme.textSecondary }]}>{formatDate(item.createdAt)}</Text>
            </View>
          </View>
        ))}

        <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f7f3ec' },
  container: { padding: 18, paddingBottom: 24 },
  heroCard: {
    borderRadius: 24,
    backgroundColor: '#fffdf9',
    borderWidth: 1,
    borderColor: '#ebe6dc',
    padding: 18,
    marginBottom: 12,
    shadowColor: '#111827',
    shadowOpacity: 0.06,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  headerTextBlock: {
    flex: 1,
    gap: 4,
  },
  headerEyebrow: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  headerTitle: {
    fontSize: 28,
    lineHeight: 32,
    fontWeight: '900',
    color: '#111827',
  },
  headerSubtitle: {
    fontSize: 14,
    lineHeight: 20,
    color: '#6b7280',
  },
  refreshBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
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
    borderColor: '#ebe6dc',
    borderRadius: 18,
    backgroundColor: '#fffdf9',
    padding: 14,
    marginBottom: 12,
    shadowColor: '#111827',
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 1,
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
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  statusText: {
    color: '#374151',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'lowercase',
  },
  metaGroup: {
    gap: 4,
  },
  metaText: {
    color: '#6b7280',
    fontSize: 12,
  },
});
