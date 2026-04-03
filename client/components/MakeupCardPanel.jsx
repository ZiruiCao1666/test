import React from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '@clerk/clerk-expo';
import { useAppTheme } from '../lib/app-theme';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL;

function getErrorMessage(error, fallbackMessage) {
  if (error instanceof Error) {
    if (error.message) {
      return error.message;
    }
  }
  return fallbackMessage;
}

function getStyleWhen(condition, style) {
  if (condition) {
    return style;
  }
  return null;
}

async function readJsonSafely(response) {
  const raw = await response.text();
  if (!raw) {
    return {};
  }

  try {
    return JSON.parse(raw);
  } catch (_error) {
    return {};
  }
}

function getStatusSummary(status) {
  const safeStatus = status || {};

  if ((safeStatus.makeupCards || 0) <= 0) {
    return 'Redeem a make-up card here, then use it to repair yesterday without normal check-in points.';
  }
  if (safeStatus.canUse) {
    return 'You missed yesterday. Use 1 card to repair that day and keep your streak moving.';
  }
  if (safeStatus.yesterdayCheckedIn) {
    return 'Yesterday is already checked in. Save your card for the next missed day.';
  }
  return 'No missed day needs repair right now.';
}

function getUseButtonText(usingCard, status) {
  const safeStatus = status || {};

  if (usingCard) {
    return 'using...';
  }
  if ((safeStatus.makeupCards || 0) <= 0) {
    return 'Redeem a card first';
  }
  if (!safeStatus.canUse) {
    return 'Yesterday is already covered';
  }
  return 'Use 1 card for yesterday';
}

function getYesterdayValue(status) {
  const safeStatus = status || {};
  if (safeStatus.yesterdayCheckedIn) {
    return 'Covered';
  }
  return 'Missed';
}

export default function MakeupCardPanel(props) {
  const safeProps = props || {};
  const points = safeProps.points;
  const { isLoaded: authLoaded, isSignedIn, getToken } = useAuth();
  const { theme } = useAppTheme();
  const isDarkTheme = theme.mode === 'dark';

  const getTokenRef = React.useRef(getToken);

  React.useEffect(function () {
    getTokenRef.current = getToken;
  }, [getToken]);

  const [status, setStatus] = React.useState({
    makeupCards: 0,
    canUse: false,
    yesterday: '',
    yesterdayCheckedIn: false,
    streakDays: 0,
  });
  const [loading, setLoading] = React.useState(true);
  const [usingCard, setUsingCard] = React.useState(false);
  const [error, setError] = React.useState('');

  const fetchWithTimeout = React.useCallback(async function (url, options = {}, timeoutMs = 20000) {
    const controller = new AbortController();
    const id = setTimeout(function () {
      controller.abort();
    }, timeoutMs);

    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } finally {
      clearTimeout(id);
    }
  }, []);

  const loadStatus = React.useCallback(async function (silent = false) {
    if (!authLoaded || !isSignedIn) {
      setLoading(false);
      return;
    }

    try {
      if (!silent) {
        setLoading(true);
      }
      setError('');

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

      const response = await fetchWithTimeout(API_BASE_URL + '/makeup-card/status', {
        headers: { Authorization: 'Bearer ' + token },
      });
      const data = await readJsonSafely(response);

      if (!response.ok) {
        throw new Error(data.error || 'Failed to load make-up card status');
      }

      setStatus({
        makeupCards: Number(data.makeupCards) || 0,
        canUse: Boolean(data.canUse),
        yesterday: data.yesterday || '',
        yesterdayCheckedIn: Boolean(data.yesterdayCheckedIn),
        streakDays: Number(data.streakDays) || 0,
      });
    } catch (error) {
      setError(getErrorMessage(error, 'Failed to load make-up card status'));
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, [authLoaded, isSignedIn, fetchWithTimeout]);

  useFocusEffect(
    React.useCallback(function () {
      loadStatus(false);
    }, [loadStatus]),
  );

  React.useEffect(function () {
    if (!authLoaded || !isSignedIn) {
      return;
    }
    loadStatus(true);
  }, [points, authLoaded, isSignedIn, loadStatus]);

  const onUseCard = React.useCallback(async function () {
    if (usingCard) {
      return;
    }

    try {
      setUsingCard(true);
      setError('');

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

      const response = await fetchWithTimeout(API_BASE_URL + '/makeup-card/use', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token },
      });
      const data = await readJsonSafely(response);

      if (!response.ok) {
        throw new Error(data.error || 'Failed to use make-up card');
      }

      setStatus({
        makeupCards: Number(data.makeupCards) || 0,
        canUse: false,
        yesterday: data.repairedDate || '',
        yesterdayCheckedIn: true,
        streakDays: Number(data.streakDays) || 0,
      });

      Alert.alert(
        'Yesterday repaired',
        '1 make-up card was used. Your streak now shows ' + String(Number(data.streakDays) || 0) + ' days.'
      );
    } catch (error) {
      const message = getErrorMessage(error, 'Failed to use make-up card');
      setError(message);
      Alert.alert('Use failed', message);
    } finally {
      setUsingCard(false);
    }
  }, [usingCard, fetchWithTimeout]);

  let bodyNode = null;
  if (loading) {
    bodyNode = (
      <View style={styles.loadingWrap}>
        <ActivityIndicator color={theme.primary} />
      </View>
    );
  } else {
    bodyNode = (
      <>
        <Text style={[styles.summaryText, { color: theme.textSecondary }]}>
          {getStatusSummary(status)}
        </Text>

        <View style={styles.statRow}>
          <View
            style={[
              styles.statChip,
              {
                backgroundColor: theme.surfaceMuted,
                borderColor: theme.borderSoft,
              },
            ]}
          >
            <Text style={[styles.statChipLabel, { color: theme.textMuted }]}>Cards</Text>
            <Text style={[styles.statChipValue, { color: theme.textPrimary }]}>
              {status.makeupCards}
            </Text>
          </View>

          <View
            style={[
              styles.statChip,
              {
                backgroundColor: theme.surfaceMuted,
                borderColor: theme.borderSoft,
              },
            ]}
          >
            <Text style={[styles.statChipLabel, { color: theme.textMuted }]}>Yesterday</Text>
            <Text style={[styles.statChipValue, { color: theme.textPrimary }]}>
              {getYesterdayValue(status)}
            </Text>
          </View>
        </View>

        <Text style={[styles.streakText, { color: theme.textMuted }]}>
          Current streak: {status.streakDays} days
        </Text>

        <Pressable
          onPress={onUseCard}
          disabled={usingCard || !status.canUse}
          style={function ({ pressed }) {
            return [
              styles.useButton,
              { backgroundColor: theme.primary },
              getStyleWhen(usingCard || !status.canUse, { opacity: 0.55 }),
              getStyleWhen(pressed, { opacity: 0.8 }),
            ];
          }}
        >
          <Text style={[styles.useButtonText, { color: theme.primaryText }]}>
            {getUseButtonText(usingCard, status)}
          </Text>
        </Pressable>

        <Text style={[styles.footerNote, { color: theme.textMuted }]}>
          Repairs yesterday only. It protects your streak but does not add normal daily check-in points.
        </Text>

        {error ? (
          <Text
            style={[
              styles.errorText,
              { color: isDarkTheme ? '#F29B96' : '#B91C1C' },
            ]}
          >
            {error}
          </Text>
        ) : null}
      </>
    );
  }

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.surface,
          borderColor: theme.border,
          shadowColor: isDarkTheme ? '#000000' : '#D6C3A7',
        },
      ]}
    >
      <Text style={[styles.eyebrow, { color: theme.textSecondary }]}>Protection</Text>
      <Text style={[styles.title, { color: theme.textPrimary }]}>Make-up card</Text>
      {bodyNode}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 24,
    padding: 18,
    marginBottom: 18,
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
    elevation: 3,
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: '900',
    marginBottom: 12,
  },
  summaryText: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 14,
  },
  statRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  statChip: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  statChipLabel: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  statChipValue: {
    fontSize: 18,
    fontWeight: '800',
  },
  streakText: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 14,
  },
  useButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    marginBottom: 12,
  },
  useButtonText: {
    fontSize: 12,
    fontWeight: '800',
  },
  footerNote: {
    fontSize: 12,
    lineHeight: 18,
  },
  errorText: {
    marginTop: 10,
    fontSize: 12,
    fontWeight: '600',
  },
  loadingWrap: {
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
