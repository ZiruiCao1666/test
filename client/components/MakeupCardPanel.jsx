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
import { apiGet, apiPost } from '../lib/api';
import { useAppTheme } from '../lib/app-theme';

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

function getStatusSummary(status) {
  const safeStatus = status || {};

  const makeupCards = Number(safeStatus.makeupCards) || 0;

  if (makeupCards === 1) {
    return 'You have 1 make-up card';
  }
  if (makeupCards > 1) {
    return 'You have ' + String(makeupCards) + ' make-up cards';
  }
  return 'You have 0 make-up cards';
}

function getYesterdayStatusText(status) {
  const safeStatus = status || {};
  if (safeStatus.yesterdayMissed) {
    return 'Yesterday missed';
  }
  return 'Yesterday covered';
}

function getUseButtonText(usingCard, status) {
  const safeStatus = status || {};

  if (usingCard) {
    return 'using...';
  }
  if ((safeStatus.makeupCards || 0) <= 0) {
    return 'No card';
  }
  if (!safeStatus.canUse) {
    return 'No repair';
  }
  return 'Use for yesterday';
}

function getRetryButtonText(loading) {
  if (loading) {
    return 'Loading...';
  }
  return 'Retry';
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

  const [status, setStatus] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [usingCard, setUsingCard] = React.useState(false);
  const [error, setError] = React.useState('');

  const getSessionToken = React.useCallback(async function () {
    const tokenGetter = getTokenRef.current;
    let token = '';
    if (typeof tokenGetter === 'function') {
      token = await tokenGetter();
    }
    if (!token) {
      throw new Error('No session token');
    }
    return token;
  }, []);

  const loadStatus = React.useCallback(async function (silent = false) {
    if (!authLoaded || !isSignedIn) {
      setStatus(null);
      setError('');
      setLoading(false);
      return;
    }

    try {
      if (!silent) {
        setLoading(true);
      }
      setError('');
      const token = await getSessionToken();
      const data = await apiGet('/makeup-card/status', token, {
        fallbackMessage: 'Failed to load make-up card status',
      });

      setStatus({
        makeupCards: Number(data.makeupCards) || 0,
        canUse: Boolean(data.canUse),
        yesterdayMissed: Boolean(data.yesterdayMissed),
      });
    } catch (error) {
      setError(getErrorMessage(error, 'Failed to load make-up card status'));
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, [authLoaded, isSignedIn, getSessionToken]);

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
      const token = await getSessionToken();
      const data = await apiPost('/makeup-card/use', token, {}, {
        fallbackMessage: 'Failed to use make-up card',
      });

      setStatus({
        makeupCards: Number(data.makeupCards) || 0,
        canUse: false,
        yesterdayMissed: false,
      });

      Alert.alert('Yesterday repaired', 'Yesterday is now checked in and your streak continues.');
    } catch (error) {
      const message = getErrorMessage(error, 'Failed to use make-up card');
      setError(message);
      Alert.alert('Use failed', message);
    } finally {
      setUsingCard(false);
    }
  }, [usingCard, getSessionToken]);

  let bodyNode = null;
  if (loading && !status) {
    bodyNode = (
      <View style={styles.loadingWrap}>
        <ActivityIndicator color={theme.primary} />
      </View>
    );
  } else if (!status) {
    bodyNode = (
      <>
        <Text style={[styles.summaryText, { color: theme.textPrimary }]}>
          Cannot load make-up card status
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

        <Pressable
          onPress={function () {
            loadStatus(false);
          }}
          disabled={loading}
          style={function ({ pressed }) {
            return [
              styles.retryButton,
              { backgroundColor: theme.surfaceMuted, borderColor: theme.borderSoft },
              getStyleWhen(loading, { opacity: 0.6 }),
              getStyleWhen(pressed, { opacity: 0.8 }),
            ];
          }}
        >
          <Text style={[styles.retryButtonText, { color: theme.textPrimary }]}>
            {getRetryButtonText(loading)}
          </Text>
        </Pressable>
      </>
    );
  } else {
    bodyNode = (
      <>
        <Text style={[styles.summaryText, { color: theme.textPrimary }]}>
          {getStatusSummary(status)}
        </Text>

        <View
          style={[
            styles.statusChip,
            {
              backgroundColor: theme.surfaceMuted,
              borderColor: theme.borderSoft,
            },
          ]}
        >
          <Text style={[styles.statusChipText, { color: theme.textSecondary }]}>
            {getYesterdayStatusText(status)}
          </Text>
        </View>

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
      <View style={styles.topRow}>
        <View style={styles.textWrap}>
          <Text style={[styles.title, { color: theme.textSecondary }]}>Make-up card</Text>
          {bodyNode}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 14,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.06,
    shadowRadius: 18,
    elevation: 2,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  textWrap: {
    flex: 1,
  },
  title: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  summaryText: {
    fontSize: 15,
    fontWeight: '800',
    lineHeight: 20,
  },
  statusChip: {
    alignSelf: 'flex-start',
    marginTop: 8,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  statusChipText: {
    fontSize: 11,
    fontWeight: '700',
  },
  useButton: {
    alignSelf: 'flex-start',
    marginTop: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
  },
  useButtonText: {
    fontSize: 12,
    fontWeight: '800',
  },
  retryButton: {
    alignSelf: 'flex-start',
    marginTop: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
  retryButtonText: {
    fontSize: 12,
    fontWeight: '700',
  },
  errorText: {
    marginTop: 8,
    fontSize: 11,
    fontWeight: '600',
  },
  loadingWrap: {
    paddingVertical: 6,
    alignItems: 'flex-start',
  },
});
