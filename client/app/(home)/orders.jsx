import React from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuth } from '@clerk/clerk-expo';
import { useFocusEffect } from '@react-navigation/native';
import { API_BASE_URL, apiGet } from '../../lib/api';
import { useAppTheme } from '../../lib/app-theme';

const REWARD_PLACEHOLDER_IMAGE = require('../../assets/photos/coffee1.png');
const DEFAULT_OFFICIAL_SITE_LABEL = "www.student motivation app's net.com";
const DEFAULT_OFFICIAL_SITE_URL = 'https://www.studentmotivationappsnet.com';

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

function toSafeText(value, fallback = '') {
  if (value === null || value === undefined) {
    return fallback;
  }
  const text = String(value).trim();
  if (!text) {
    return fallback;
  }
  return text;
}

function resolveRewardImageUrl(rawValue) {
  const value = String(rawValue || '').trim();
  if (!value) {
    return '';
  }
  if (/^https?:\/\//i.test(value)) {
    return value;
  }
  if (value.startsWith('data:')) {
    return value;
  }
  if (!API_BASE_URL) {
    return value;
  }
  if (value.startsWith('/')) {
    return API_BASE_URL + value;
  }
  return API_BASE_URL + '/' + value;
}

function formatDate(value) {
  const text = toSafeText(value, '');
  if (!text) {
    return '--';
  }
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) {
    return '--';
  }
  return date.toLocaleString();
}

function buildMerchantName(order) {
  const safeOrder = order || {};
  const category = toSafeText(safeOrder.category, '').toLowerCase();
  if (category === 'coffee') {
    return 'Bosta Coffee Partner';
  }
  if (category === 'daily_life') {
    return 'Campus Daily Life Partner';
  }
  if (category === 'gift_voucher') {
    return 'Gift Voucher Partner';
  }
  if (category === 'special') {
    return 'Student Motivation App';
  }
  return 'Student Motivation Partner';
}

function normalizeOrder(raw) {
  const safeRaw = raw || {};
  const imageUrl = resolveRewardImageUrl(toSafeText(safeRaw.imageUrl || safeRaw.image_url, ''));
  return {
    id: toSafeText(safeRaw.id, 'order-' + String(Math.random())),
    rewardId: toSafeText(safeRaw.rewardId || safeRaw.reward_id, ''),
    title: toSafeText(safeRaw.title, 'reward'),
    category: toSafeText(safeRaw.category, 'special'),
    imageUrl,
    pointsCost: Number(safeRaw.pointsCost || safeRaw.points_cost) || 0,
    status: toSafeText(safeRaw.status, 'completed'),
    createdAt: toSafeText(safeRaw.createdAt || safeRaw.created_at, ''),
    expiresAt: toSafeText(safeRaw.expiresAt || safeRaw.expires_at, ''),
    merchant: buildMerchantName(safeRaw),
    officialSiteLabel: DEFAULT_OFFICIAL_SITE_LABEL,
    officialSiteUrl: DEFAULT_OFFICIAL_SITE_URL,
    redemptionCode: '',
  };
}

function getStatusMeta(order) {
  const safeOrder = order || {};
  const status = toSafeText(safeOrder.status, '').toLowerCase();

  const expiresAt = toSafeText(safeOrder.expiresAt, '');
  if (expiresAt) {
    const expiresTs = new Date(expiresAt).getTime();
    if (!Number.isNaN(expiresTs) && expiresTs < Date.now()) {
      return { label: 'Expired', tone: 'expired' };
    }
  }

  if (status === 'used') {
    return { label: 'Used', tone: 'used' };
  }
  if (status === 'added_to_wallet' || status === 'wallet') {
    return { label: 'Added to wallet', tone: 'wallet' };
  }
  if (status === 'pending') {
    return { label: 'Active', tone: 'active' };
  }
  return { label: 'Active', tone: 'active' };
}

function getStatusBadgeColors(theme, tone) {
  if (tone === 'used') {
    return {
      backgroundColor: theme.secondaryBg,
      textColor: theme.secondaryText,
    };
  }
  if (tone === 'expired') {
    return {
      backgroundColor: theme.surfaceDanger,
      textColor: theme.dangerText,
    };
  }
  if (tone === 'wallet') {
    return {
      backgroundColor: theme.surfaceMuted,
      textColor: theme.primary,
    };
  }
  return {
    backgroundColor: theme.surfaceMuted,
    textColor: theme.primary,
  };
}

export default function OrdersScreen() {
  const router = useRouter();
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
      setLoading(true);
      setError(null);

      if (!API_BASE_URL) {
        throw new Error('Missing EXPO_PUBLIC_API_URL');
      }

      const tokenGetter = getTokenRef.current;
      let token = '';
      if (typeof tokenGetter === 'function') {
        token = await tokenGetter();
      }
      if (!token) {
        throw new Error('No session token');
      }

      const data = await apiGet('/rewards/orders', token, {
        timeoutMs: 20000,
        fallbackMessage: 'Failed to load orders',
      });

      let items = [];
      if (Array.isArray(data.items)) {
        items = data.items.map(normalizeOrder);
      }
      setOrders(items);
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

  const openOrderDetail = React.useCallback((item) => {
    const safeItem = item || {};
    router.push({
      pathname: '/order-detail',
      params: {
        id: toSafeText(safeItem.id, ''),
        rewardId: toSafeText(safeItem.rewardId, ''),
        title: toSafeText(safeItem.title, 'reward'),
        category: toSafeText(safeItem.category, 'special'),
        imageUrl: toSafeText(safeItem.imageUrl, ''),
        pointsCost: String(Number(safeItem.pointsCost) || 0),
        status: toSafeText(safeItem.status, 'completed'),
        createdAt: toSafeText(safeItem.createdAt, ''),
        expiresAt: toSafeText(safeItem.expiresAt, ''),
        merchant: toSafeText(safeItem.merchant, ''),
        officialSiteLabel: toSafeText(safeItem.officialSiteLabel, DEFAULT_OFFICIAL_SITE_LABEL),
        officialSiteUrl: toSafeText(safeItem.officialSiteUrl, DEFAULT_OFFICIAL_SITE_URL),
        redemptionCode: toSafeText(safeItem.redemptionCode, ''),
      },
    });
  }, [router]);

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
                Tap a card to open full reward pass details.
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

        {orders.map((item) => {
          const statusMeta = getStatusMeta(item);
          const statusColors = getStatusBadgeColors(theme, statusMeta.tone);
          return (
            <Pressable
              key={String(item.id)}
              onPress={() => openOrderDetail(item)}
              style={({ pressed }) => [
                styles.card,
                {
                  backgroundColor: theme.surface,
                  borderColor: theme.border,
                },
                getStyleWhen(pressed, { opacity: 0.8 }),
              ]}
            >
              <View style={styles.cardTop}>
                <View style={styles.cardImageSlot}>
                  {item.imageUrl ? (
                    <Image source={{ uri: item.imageUrl }} style={styles.cardImage} resizeMode="cover" />
                  ) : (
                    <Image source={REWARD_PLACEHOLDER_IMAGE} style={styles.cardImage} resizeMode="cover" />
                  )}
                </View>

                <View style={styles.cardMain}>
                  <View style={styles.cardTitleRow}>
                    <Text style={[styles.cardTitle, { color: theme.textPrimary }]}>{item.title}</Text>
                    <View
                      style={[
                        styles.statusBadge,
                        { backgroundColor: statusColors.backgroundColor },
                      ]}
                    >
                      <Text style={[styles.statusText, { color: statusColors.textColor }]}>
                        {statusMeta.label}
                      </Text>
                    </View>
                  </View>

                  <Text style={[styles.metaText, { color: theme.textSecondary }]}>
                    Redeemed at: {formatDate(item.createdAt)}
                  </Text>
                  <Text style={[styles.metaText, { color: theme.textSecondary }]}>
                    Points spent: {Number(item.pointsCost) || 0}
                  </Text>
                  <Text style={[styles.openHintText, { color: theme.primary }]}>
                    Open reward pass details
                  </Text>
                </View>
              </View>
            </Pressable>
          );
        })}

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
    padding: 12,
    marginBottom: 12,
    shadowColor: '#111827',
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 1,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  cardImageSlot: {
    width: 76,
    height: 76,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#f3f4f6',
  },
  cardImage: {
    width: '100%',
    height: '100%',
  },
  cardMain: {
    flex: 1,
    gap: 4,
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  cardTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: '800',
    color: '#111827',
  },
  statusBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
  },
  metaText: {
    fontSize: 12,
    color: '#6b7280',
  },
  openHintText: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '700',
  },
});
