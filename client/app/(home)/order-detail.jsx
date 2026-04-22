import React from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  Image,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import { useAppTheme } from '../../lib/app-theme';
import { API_BASE_URL } from '../../lib/api';

const REWARD_PLACEHOLDER_IMAGE = require('../../assets/photos/coffee1.png');
const DEFAULT_OFFICIAL_SITE_LABEL = "www.student motivation app's net.com";
const DEFAULT_OFFICIAL_SITE_URL = 'https://www.studentmotivationappsnet.com';

function getStyleWhen(condition, style) {
  if (condition) {
    return style;
  }
  return null;
}

function getParamText(value, fallback = '') {
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return fallback;
    }
    return getParamText(value[0], fallback);
  }
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
  const text = getParamText(value, '');
  if (!text) {
    return '--';
  }
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) {
    return '--';
  }
  return date.toLocaleString();
}

function buildMerchantName(category, rawMerchant) {
  const explicitMerchant = getParamText(rawMerchant, '');
  if (explicitMerchant) {
    return explicitMerchant;
  }
  const safeCategory = getParamText(category, '').toLowerCase();
  if (safeCategory === 'coffee') {
    return 'Bosta Coffee Partner';
  }
  if (safeCategory === 'daily_life') {
    return 'Campus Daily Life Partner';
  }
  if (safeCategory === 'gift_voucher') {
    return 'Gift Voucher Partner';
  }
  if (safeCategory === 'special') {
    return 'Student Motivation App';
  }
  return 'Student Motivation Partner';
}

function getStatusMeta(status, expiresAt) {
  const safeStatus = getParamText(status, '').toLowerCase();
  const safeExpiresAt = getParamText(expiresAt, '');
  if (safeExpiresAt) {
    const expiresTs = new Date(safeExpiresAt).getTime();
    if (!Number.isNaN(expiresTs) && expiresTs < Date.now()) {
      return { label: 'Expired', tone: 'expired' };
    }
  }
  if (safeStatus === 'used') {
    return { label: 'Used', tone: 'used' };
  }
  if (safeStatus === 'added_to_wallet' || safeStatus === 'wallet') {
    return { label: 'Added to wallet', tone: 'wallet' };
  }
  return { label: 'Active', tone: 'active' };
}

function getStatusColors(theme, tone) {
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

export default function OrderDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { theme } = useAppTheme();

  const title = getParamText(params.title, 'Reward');
  const status = getParamText(params.status, 'completed');
  const category = getParamText(params.category, 'special');
  const imageUrl = resolveRewardImageUrl(getParamText(params.imageUrl, ''));
  const pointsCost = Number(getParamText(params.pointsCost, '0')) || 0;
  const redeemedAt = getParamText(params.createdAt, '');
  const expiresAt = getParamText(params.expiresAt, '');
  const merchant = buildMerchantName(category, params.merchant);
  const officialSiteLabel = getParamText(params.officialSiteLabel, DEFAULT_OFFICIAL_SITE_LABEL);
  const officialSiteUrl = getParamText(params.officialSiteUrl, DEFAULT_OFFICIAL_SITE_URL);
  const redemptionCode = getParamText(params.redemptionCode, '');

  const statusMeta = getStatusMeta(status, expiresAt);
  const statusColors = getStatusColors(theme, statusMeta.tone);
  const hasRedemptionCode = Boolean(redemptionCode);

  const openOfficialSite = React.useCallback(async () => {
    const url = getParamText(officialSiteUrl, DEFAULT_OFFICIAL_SITE_URL);
    try {
      await Linking.openURL(url);
    } catch (_error) {
      Alert.alert('Open failed', 'Cannot open the official site on this device.');
    }
  }, [officialSiteUrl]);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.screenBg }]}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.topRow}>
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [
              styles.backBtn,
              {
                backgroundColor: theme.secondaryBg,
                borderColor: theme.secondaryBorder,
              },
              getStyleWhen(pressed, { opacity: 0.75 }),
            ]}
          >
            <Text style={[styles.backBtnText, { color: theme.secondaryText }]}>Back</Text>
          </Pressable>
        </View>

        <View
          style={[
            styles.passCard,
            {
              backgroundColor: theme.surface,
              borderColor: theme.border,
            },
          ]}
        >
          <View style={styles.passTop}>
            <View style={styles.imageWrap}>
              {imageUrl ? (
                <Image source={{ uri: imageUrl }} style={styles.image} resizeMode="cover" />
              ) : (
                <Image source={REWARD_PLACEHOLDER_IMAGE} style={styles.image} resizeMode="cover" />
              )}
            </View>
            <View style={styles.topMain}>
              <Text style={[styles.passTitle, { color: theme.textPrimary }]}>{title}</Text>
              <View style={[styles.statusBadge, { backgroundColor: statusColors.backgroundColor }]}>
                <Text style={[styles.statusText, { color: statusColors.textColor }]}>
                  {statusMeta.label}
                </Text>
              </View>
            </View>
          </View>
        </View>

        <View
          style={[
            styles.sectionCard,
            {
              backgroundColor: theme.surface,
              borderColor: theme.border,
            },
          ]}
        >
          <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Core info</Text>
          <View style={styles.infoRow}>
            <Text style={[styles.infoLabel, { color: theme.textSecondary }]}>Points spent</Text>
            <Text style={[styles.infoValue, { color: theme.textPrimary }]}>{pointsCost}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={[styles.infoLabel, { color: theme.textSecondary }]}>Redeemed at</Text>
            <Text style={[styles.infoValue, { color: theme.textPrimary }]}>{formatDate(redeemedAt)}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={[styles.infoLabel, { color: theme.textSecondary }]}>Expires at</Text>
            <Text style={[styles.infoValue, { color: theme.textPrimary }]}>
              {expiresAt ? formatDate(expiresAt) : '--'}
            </Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={[styles.infoLabel, { color: theme.textSecondary }]}>Merchant</Text>
            <Text style={[styles.infoValue, { color: theme.textPrimary }]}>{merchant}</Text>
          </View>
        </View>

        <View
          style={[
            styles.sectionCard,
            {
              backgroundColor: theme.surface,
              borderColor: theme.border,
            },
          ]}
        >
          <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Redemption code</Text>
          {hasRedemptionCode ? (
            <Text style={[styles.codeText, { color: theme.textPrimary }]}>{redemptionCode}</Text>
          ) : (
            <>
              <Text style={[styles.codeText, { color: theme.textPrimary }]}>Redemption code: Pending</Text>
              <Text style={[styles.codeHint, { color: theme.textSecondary }]}>
                Code will appear here once a real merchant code is connected.
              </Text>
            </>
          )}
        </View>

        <View
          style={[
            styles.sectionCard,
            {
              backgroundColor: theme.surface,
              borderColor: theme.border,
            },
          ]}
        >
          <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Official site</Text>
          <Text style={[styles.infoValue, { color: theme.textSecondary }]}>{officialSiteLabel}</Text>
          <Pressable
            onPress={openOfficialSite}
            style={({ pressed }) => [
              styles.openSiteBtn,
              { backgroundColor: theme.primary },
              getStyleWhen(pressed, { opacity: 0.8 }),
            ]}
          >
            <Text style={[styles.openSiteBtnText, { color: theme.primaryText }]}>Open official site</Text>
          </Pressable>
        </View>

        <View
          style={[
            styles.sectionCard,
            {
              backgroundColor: theme.surface,
              borderColor: theme.border,
            },
          ]}
        >
          <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>How to use</Text>
          <Text style={[styles.bodyText, { color: theme.textSecondary }]}>
            Show this reward pass to the merchant and confirm eligibility before payment.
          </Text>

          <Text style={[styles.sectionSubTitle, { color: theme.textPrimary }]}>Terms</Text>
          <Text style={[styles.bodyText, { color: theme.textSecondary }]}>
            This pass is for demonstration in Student Motivation App and may require partner verification.
          </Text>

          <Text style={[styles.sectionSubTitle, { color: theme.textPrimary }]}>Notes</Text>
          <Text style={[styles.bodyText, { color: theme.textSecondary }]}>
            Keep your app signed in to view latest status, expiration updates, and future redemption code sync.
          </Text>
        </View>

        <View style={{ height: 28 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#f7f3ec',
  },
  container: {
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 24,
    gap: 12,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
  },
  backBtn: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  backBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  passCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 14,
  },
  passTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  imageWrap: {
    width: 86,
    height: 86,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#f3f4f6',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  topMain: {
    flex: 1,
    gap: 8,
  },
  passTitle: {
    fontSize: 18,
    fontWeight: '900',
    lineHeight: 24,
  },
  statusBadge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '800',
  },
  sectionCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 14,
    gap: 8,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '900',
    marginBottom: 2,
  },
  sectionSubTitle: {
    marginTop: 6,
    fontSize: 13,
    fontWeight: '800',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  },
  infoLabel: {
    fontSize: 12,
    fontWeight: '700',
  },
  infoValue: {
    flex: 1,
    textAlign: 'right',
    fontSize: 12,
    fontWeight: '600',
  },
  codeText: {
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 0.6,
  },
  codeHint: {
    fontSize: 12,
    lineHeight: 18,
  },
  openSiteBtn: {
    marginTop: 4,
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  openSiteBtnText: {
    fontSize: 12,
    fontWeight: '800',
  },
  bodyText: {
    fontSize: 12,
    lineHeight: 18,
  },
});
