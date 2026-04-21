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
import { API_BASE_URL, ApiRequestError, apiGet, apiPost } from '../../lib/api';
import { getDisplayNameFromUser } from '../../lib/user-display';
import { useAppTheme } from '../../lib/app-theme';
import MakeupCardPanel from '../../components/MakeupCardPanel';

const REWARD_PLACEHOLDER_IMAGE = require('../../assets/photos/coffee1.png');

const FALLBACK_CATALOG = [
  { id: 1, title: 'Bosta Coffee 25% Off', pointsCost: 120, category: 'coffee', imageUrl: '', isActive: true },
  { id: 2, title: 'Bosta Coffee 50% Off', pointsCost: 220, category: 'coffee', imageUrl: '', isActive: true },
  { id: 3, title: 'Free Bosta Coffee', pointsCost: 360, category: 'coffee', imageUrl: '', isActive: true },
  { id: 4, title: 'School Cafeteria 25% Off', pointsCost: 150, category: 'daily_life', imageUrl: '', isActive: true },
  { id: 5, title: 'School Cafeteria \u00A32 Off \u00A310', pointsCost: 180, category: 'daily_life', imageUrl: '', isActive: true },
  { id: 6, title: 'School Cafeteria \u00A35 Off \u00A320', pointsCost: 340, category: 'daily_life', imageUrl: '', isActive: true },
  { id: 7, title: 'Besco \u00A32 Off \u00A310', pointsCost: 180, category: 'daily_life', imageUrl: '', isActive: true },
  { id: 8, title: 'Besco \u00A35 Off \u00A320', pointsCost: 340, category: 'daily_life', imageUrl: '', isActive: true },
  { id: 9, title: 'Laundry 50% Off', pointsCost: 200, category: 'daily_life', imageUrl: '', isActive: true },
  { id: 10, title: 'Campus Store 25% Off \u00A35', pointsCost: 100, category: 'daily_life', imageUrl: '', isActive: true },
  { id: 11, title: 'Campus Store 25% Off \u00A310', pointsCost: 190, category: 'daily_life', imageUrl: '', isActive: true },
  { id: 12, title: '\u00A33 Gift Voucher', pointsCost: 280, category: 'gift_voucher', imageUrl: '', isActive: true },
  { id: 13, title: '\u00A35 Gift Voucher', pointsCost: 420, category: 'gift_voucher', imageUrl: '', isActive: true },
  { id: 14, title: 'Make-up Card', pointsCost: 300, category: 'special', imageUrl: '', isActive: true },
  { id: 15, title: 'Extra Draw Ticket', pointsCost: 100, category: 'special', imageUrl: '', isActive: true },
  { id: 16, title: 'Reroll Ticket', pointsCost: 60, category: 'special', imageUrl: '', isActive: true },
];

const CATEGORY_LABELS = {
  coffee: 'Coffee',
  daily_life: 'Daily Life',
  gift_voucher: 'Gift Vouchers',
  special: 'Special',
};

const CATEGORY_ORDER = ['coffee', 'daily_life', 'gift_voucher', 'special'];

function getErrorMessage(error, fallbackMessage) {
  if (error instanceof Error) {
    if (error.message) {
      return error.message;
    }
  }
  return fallbackMessage;
}

function isAbortError(error) {
  if (!(error instanceof Error)) {
    return false;
  }
  if (error.name !== 'AbortError') {
    return false;
  }
  return true;
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

function renderNodeWhenElse(condition, trueNode, falseNode) {
  if (condition) {
    return trueNode;
  }
  return falseNode;
}

function getRefreshText(loading) {
  if (loading) {
    return 'loading';
  }
  return 'refresh';
}

function getRedeemButtonText(redeeming, canRedeemByBackend) {
  if (redeeming) {
    return 'redeeming...';
  }
  if (!canRedeemByBackend) {
    return 'backend only';
  }
  return 'redeem';
}

function getPointsText(loading, points) {
  if (loading) {
    return '...';
  }
  return points;
}

function renderAvatarNode(avatarUrl, avatarInitial) {
  if (avatarUrl) {
    return <Image source={{ uri: avatarUrl }} style={styles.avatar} />;
  }
  return (
    <View style={[styles.avatar, styles.avatarFallback]}>
      <Text style={styles.avatarFallbackText}>{avatarInitial}</Text>
    </View>
  );
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

function renderRewardImage(item) {
  const safeItem = item || {};
  const imageUrl = String(safeItem.imageUrl || '').trim();
  if (imageUrl) {
    return <Image source={{ uri: imageUrl }} style={styles.cardImage} resizeMode="cover" />;
  }
  return <Image source={REWARD_PLACEHOLDER_IMAGE} style={styles.cardImage} resizeMode="cover" />;
}

function normalizeCatalog(items) {
  if (!Array.isArray(items)) return [];
  return items
    .map((raw, index) => {
      // Normalize backend field names once so the UI can read one stable shape.
      const safeRaw = raw || {};
      let pointsValue = safeRaw.pointsCost;
      if (pointsValue === null || pointsValue === undefined || pointsValue === '') {
        pointsValue = safeRaw.points_cost;
      }
      if (pointsValue === null || pointsValue === undefined || pointsValue === '') {
        pointsValue = safeRaw.points;
      }
      const pointsCost = Number(pointsValue);
      let rewardId = safeRaw.id;
      if (rewardId === null || rewardId === undefined || rewardId === '') {
        rewardId = 'fallback-' + String(index);
      }
      let title = safeRaw.title;
      if (title === null || title === undefined || title === '') {
        title = 'reward';
      }
      let category = safeRaw.category;
      if (category === null || category === undefined || category === '') {
        category = 'special';
      }
      let imageUrl = safeRaw.imageUrl;
      if (imageUrl === null || imageUrl === undefined || imageUrl === '') {
        imageUrl = safeRaw.image_url;
      }
      if (imageUrl === null || imageUrl === undefined) {
        imageUrl = '';
      }
      imageUrl = resolveRewardImageUrl(imageUrl);
      let isActive = safeRaw.isActive;
      if (isActive === null || isActive === undefined) {
        isActive = safeRaw.is_active;
      }
      if (isActive === null || isActive === undefined) {
        isActive = true;
      }
      if (Number.isFinite(pointsCost)) {
        return {
          id: rewardId,
          title: String(title),
          pointsCost,
          category: String(category),
          imageUrl: String(imageUrl),
          isActive,
        };
      }
      return {
        id: rewardId,
        title: String(title),
        pointsCost: 0,
        category: String(category),
        imageUrl: String(imageUrl),
        isActive,
      };
    })
    .filter((it) => it.isActive);
}

function groupByCategory(items) {
  return items.reduce((acc, item) => {
    const key = item.category || 'special';
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});
}

export default function RewardsScreen() {
  const router = useRouter();
  const { user } = useUser();
  const { isLoaded: authLoaded, isSignedIn, getToken } = useAuth();
  const { theme } = useAppTheme();
  const safeUser = user || {};
  const username = getDisplayNameFromUser(safeUser);
  const avatarUrl = safeUser.imageUrl || null;
  const avatarInitial = String(username || '').trim().charAt(0).toUpperCase() || 'U';

  const getTokenRef = React.useRef(getToken);

  React.useEffect(() => {
    getTokenRef.current = getToken;
  }, [getToken]);

  const [points, setPoints] = React.useState(0);
  const [catalog, setCatalog] = React.useState(FALLBACK_CATALOG);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);
  const [redeemingId, setRedeemingId] = React.useState(null);
  const canRedeemByBackend = Boolean(API_BASE_URL && authLoaded && isSignedIn);

  const loadRewards = React.useCallback(async () => {
    if (!authLoaded || !isSignedIn) {
      setLoading(false);
      return;
    }

    try {
      // Rewards also stay behind the current Clerk session token.
      setLoading(true);
      setError(null);

      const getTokenFromRef = getTokenRef.current;
      let token = '';
      if (typeof getTokenFromRef === 'function') {
        token = await getTokenFromRef();
      }
      if (!token) {
        throw new Error('No session token');
      }

      if (!API_BASE_URL) {
        setCatalog(FALLBACK_CATALOG);
        setError('Missing EXPO_PUBLIC_API_URL. Rewards redemption is disabled until backend is configured.');
        return;
      }

      const [statusResult, catalogResult] = await Promise.allSettled([
        apiGet('/checkins/status', token, {
          timeoutMs: 20000,
          fallbackMessage: 'Failed to load points',
        }),
        apiGet('/rewards/catalog', token, {
          timeoutMs: 20000,
          fallbackMessage: 'Failed to load rewards catalog',
        }),
      ]);

      if (statusResult.status === 'rejected') {
        throw statusResult.reason;
      }
      setPoints(Number(statusResult.value.points) || 0);

      if (catalogResult.status === 'fulfilled') {
        const normalized = normalizeCatalog(catalogResult.value.items);
        if (normalized.length > 0) {
          setCatalog(normalized);
        } else {
          setCatalog(FALLBACK_CATALOG);
        }
      } else {
        setCatalog(FALLBACK_CATALOG);
      }
    } catch (e) {
      setCatalog(FALLBACK_CATALOG);
      if (isAbortError(e)) {
        setError('Request timeout, please retry.');
      } else {
        setError(getErrorMessage(e, 'Failed to load rewards'));
      }
    } finally {
      setLoading(false);
    }
  }, [authLoaded, isSignedIn]);

  useFocusEffect(
    React.useCallback(() => {
      loadRewards();
    }, [loadRewards]),
  );

  const onRedeem = React.useCallback(async (item) => {
    if (redeemingId) {
      return;
    }

    if (!canRedeemByBackend) {
      Alert.alert(
        'Backend required',
        'Rewards redemption uses server-side Neon records only. Configure EXPO_PUBLIC_API_URL and sign in.',
      );
      return;
    }

    if (points < item.pointsCost) {
      Alert.alert('Insufficient points', 'You do not have enough points for this reward.');
      return;
    }

    try {
      setRedeemingId(item.id);

      const getTokenFromRef = getTokenRef.current;
      let token = '';
      if (typeof getTokenFromRef === 'function') {
        token = await getTokenFromRef();
      }
      if (!token) {
        throw new Error('No session token');
      }

      const data = await apiPost('/rewards/redeem', token, { rewardId: item.id }, {
        timeoutMs: 20000,
        fallbackMessage: 'Redeem failed',
      });

      if (data.remainingPoints !== undefined) {
        setPoints(Number(data.remainingPoints) || 0);
      }

      Alert.alert('Redeemed', String(item.title) + ' redeemed successfully.');
      loadRewards();
    } catch (e) {
      if (e instanceof ApiRequestError && e.status === 409) {
        const message = getErrorMessage(e, 'Not enough points for this reward.');
        Alert.alert('Insufficient points', message);
      } else if (isAbortError(e)) {
        Alert.alert('Error', 'Request timeout, please retry.');
      } else {
        Alert.alert('Error', getErrorMessage(e, 'Redeem failed'));
      }
    } finally {
      setRedeemingId(null);
    }
  }, [redeemingId, points, canRedeemByBackend, loadRewards]);

  const sections = groupByCategory(catalog);
  const sectionKeys = Object.keys(sections).sort((left, right) => {
    const leftIndex = CATEGORY_ORDER.indexOf(left);
    const rightIndex = CATEGORY_ORDER.indexOf(right);
    const safeLeftIndex = leftIndex === -1 ? CATEGORY_ORDER.length : leftIndex;
    const safeRightIndex = rightIndex === -1 ? CATEGORY_ORDER.length : rightIndex;
    if (safeLeftIndex !== safeRightIndex) {
      return safeLeftIndex - safeRightIndex;
    }
    return String(left).localeCompare(String(right));
  });

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.screenBg }]}>
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        <View
          style={[
            styles.heroCard,
            {
              backgroundColor: theme.surface,
              borderColor: theme.border,
            },
          ]}
        >
          <View style={styles.heroTopRow}>
            <View style={styles.heroTitleBlock}>
              <Text style={[styles.heroEyebrow, { color: theme.textSecondary }]}>Rewards</Text>
              <Text style={[styles.heroTitle, { color: theme.textPrimary }]}>Point Shop</Text>
              <Text style={[styles.heroSubtitle, { color: theme.textSecondary }]}>
                Use your points for simple rewards.
              </Text>
            </View>

            <View style={styles.heroRight}>
              <Pressable
                onPress={() => router.push('/orders')}
                style={({ pressed }) => [
                styles.ordersBtn,
                {
                  backgroundColor: theme.secondaryBg,
                  borderColor: theme.borderSoft,
                },
                getStyleWhen(pressed, { opacity: 0.7 }),
              ]}
            >
                <Text style={[styles.ordersText, { color: theme.textPrimary }]}>My orders</Text>
              </Pressable>

              {renderAvatarNode(avatarUrl, avatarInitial)}
            </View>
          </View>

          <View
            style={[
              styles.pointsCard,
              {
                backgroundColor: theme.surfaceMuted,
                borderColor: theme.border,
              },
            ]}
          >
            <View>
              <Text style={[styles.pointsLabel, { color: theme.textSecondary }]}>Your points</Text>
              <Text style={[styles.pointsValue, { color: theme.textPrimary }]}>
                {getPointsText(loading, points)}
              </Text>
            </View>
            <Pressable
              onPress={loadRewards}
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

        <MakeupCardPanel points={points} />

        {renderNodeWhen(error, <Text style={styles.errorText}>{error}</Text>)}

        {renderNodeWhen(loading, (
          <View style={styles.loadingWrap}>
            <ActivityIndicator />
          </View>
        ))}

        {sectionKeys.map((key, idx) => (
          <View key={key} style={getStyleWhen(idx > 0, { marginTop: 18 })}>
            <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>
              {CATEGORY_LABELS[key] || key}
            </Text>
            <View style={styles.grid}>
              {sections[key].map((item) => {
                const redeeming = redeemingId === item.id;
                const disabled = redeeming || !canRedeemByBackend;
                return (
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
                    <View
                      style={[
                        styles.cardImageSlot,
                        {
                          backgroundColor: theme.surfaceMuted,
                          borderColor: theme.border,
                        },
                      ]}
                    >
                      {renderRewardImage(item)}
                    </View>

                    <View style={styles.cardBody}>
                      <Text style={[styles.cardTitle, { color: theme.textPrimary }]}>{item.title}</Text>
                      <Text style={[styles.cardPoints, { color: theme.textSecondary }]}>
                        {item.pointsCost} points
                      </Text>

                      <Pressable
                        onPress={() => onRedeem(item)}
                        disabled={disabled}
                        style={({ pressed }) => [
                          styles.redeemBtn,
                          { backgroundColor: theme.primary },
                          getStyleWhen(disabled, { opacity: 0.65 }),
                          getStyleWhen(pressed, { opacity: 0.8 }),
                        ]}
                      >
                        <Text style={[styles.redeemText, { color: theme.primaryText }]}>
                          {getRedeemButtonText(redeeming, canRedeemByBackend)}
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                );
              })}
            </View>
          </View>
        ))}

        {renderNodeWhen((() => {
          if (loading) {
            return false;
          }
          if (sectionKeys.length !== 0) {
            return false;
          }
          return true;
        })(), (
          <Text style={[styles.emptyText, { color: theme.textSecondary }]}>No rewards available now.</Text>
        ))}

        <View style={{ height: 90 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f7f3ec' },
  container: { paddingHorizontal: 18, paddingTop: 12, paddingBottom: 24 },

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
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  heroTitleBlock: {
    flex: 1,
    gap: 4,
  },
  heroEyebrow: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    color: '#6b7280',
    textTransform: 'uppercase',
  },
  heroTitle: {
    fontSize: 28,
    lineHeight: 32,
    fontWeight: '900',
    color: '#111827',
  },
  heroSubtitle: {
    fontSize: 14,
    lineHeight: 20,
    color: '#6b7280',
  },
  heroRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  ordersBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  ordersText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#111827',
  },
  avatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#f3f4f6' },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  avatarFallbackText: { fontSize: 12, fontWeight: '800', color: '#111827' },

  pointsCard: {
    borderWidth: 1,
    borderColor: '#ebe6dc',
    borderRadius: 20,
    backgroundColor: '#f9f6f0',
    paddingHorizontal: 16,
    paddingVertical: 16,
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pointsLabel: {
    fontSize: 12,
    color: '#6b7280',
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  pointsValue: {
    marginTop: 4,
    fontSize: 36,
    fontWeight: '900',
    color: '#111827',
  },
  refreshBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
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
    fontSize: 13,
    fontWeight: '700',
    color: '#6b7280',
    marginBottom: 10,
    marginLeft: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },

  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 14,
  },

  card: {
    width: '48%',
    minHeight: 204,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#ebe6dc',
    backgroundColor: '#fffdf9',
    padding: 12,
    justifyContent: 'space-between',
    shadowColor: '#111827',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  cardImageSlot: {
    height: 78,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#ece7dd',
    backgroundColor: '#f5f2eb',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
    overflow: 'hidden',
  },
  cardImageFallback: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e6e8ec',
  },
  cardImage: {
    width: '100%',
    height: '100%',
  },
  cardImageHint: {
    fontSize: 10,
    fontWeight: '700',
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  cardBody: {
    gap: 6,
  },
  cardTitle: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '800',
    color: '#111827',
  },
  cardPoints: {
    fontSize: 12,
    color: '#6b7280',
  },
  redeemBtn: {
    marginTop: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
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
