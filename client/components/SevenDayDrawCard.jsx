import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
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

function getSummaryText(streakDays, state) {
  const safeState = state || {};
  const milestoneDraws = Number(safeState.milestoneDraws) || 0;
  const drawTickets = Number(safeState.drawTickets) || 0;

  if (milestoneDraws > 0) {
    if (milestoneDraws === 1) {
      return '1 streak draw is ready.';
    }
    return String(milestoneDraws) + ' streak draws are ready.';
  }

  if (drawTickets > 0) {
    if (drawTickets === 1) {
      return '1 extra draw ticket is ready.';
    }
    return String(drawTickets) + ' extra draw tickets are ready.';
  }

  let safeStreakDays = Number(streakDays) || 0;
  if (safeStreakDays < 0) {
    safeStreakDays = 0;
  }
  let nextTarget = 7;
  if (safeStreakDays >= 7) {
    nextTarget = (Math.floor(safeStreakDays / 7) + 1) * 7;
  }
  return 'Reach ' + String(nextTarget) + ' days to unlock the next draw.';
}

function getAcceptMessage(acceptedReward) {
  const safeReward = acceptedReward || {};
  const title = String(safeReward.title || '').trim();
  const pointsGranted = Number(safeReward.pointsGranted) || 0;

  if (pointsGranted > 0) {
    return title + '\n+' + String(pointsGranted) + ' points';
  }
  return title || 'Reward accepted';
}

function getActiveBuffLabels(state) {
  const safeState = state || {};
  const labels = [];

  const nextCheckinMultiplier = Number(safeState.nextCheckinMultiplier) || 1;
  if (nextCheckinMultiplier > 1) {
    labels.push('Next check-in x' + String(nextCheckinMultiplier));
  }

  const nextTaskBonusPoints = Number(safeState.nextTaskBonusPoints) || 0;
  if (nextTaskBonusPoints > 0) {
    labels.push('Next task +' + String(nextTaskBonusPoints));
  }

  const bonusCheckinsRemaining = Number(safeState.bonusCheckinsRemaining) || 0;
  const bonusPerCheckin = Number(safeState.bonusPerCheckin) || 0;
  if (bonusCheckinsRemaining > 0 && bonusPerCheckin > 0) {
    labels.push(
      'Next ' +
        String(bonusCheckinsRemaining) +
        ' check-ins +' +
        String(bonusPerCheckin),
    );
  }

  const weeklyCustomBonusPerTask = Number(safeState.weeklyCustomBonusPerTask) || 0;
  if (weeklyCustomBonusPerTask > 0) {
    labels.push('This week custom +' + String(weeklyCustomBonusPerTask));
  }

  return labels;
}

export default function SevenDayDrawCard(props) {
  const safeProps = props || {};
  const streakDays = Number(safeProps.streakDays) || 0;
  const onPointsUpdated = safeProps.onPointsUpdated;
  const { isLoaded: authLoaded, isSignedIn, getToken } = useAuth();
  const { theme } = useAppTheme();
  const isDarkTheme = theme.mode === 'dark';

  const [state, setState] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const [workingAction, setWorkingAction] = React.useState('');

  const getTokenRef = React.useRef(getToken);

  React.useEffect(function () {
    getTokenRef.current = getToken;
  }, [getToken]);

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

  const loadState = React.useCallback(async function (silent = false) {
    if (!authLoaded || !isSignedIn) {
      setState(null);
      setError('');
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

      const response = await fetchWithTimeout(API_BASE_URL + '/streak-draw/state', {
        headers: { Authorization: 'Bearer ' + token },
      });
      const data = await readJsonSafely(response);

      if (!response.ok) {
        throw new Error(data.error || 'Failed to load streak draw state');
      }

      setState(data.state || null);
    } catch (loadError) {
      setError(getErrorMessage(loadError, 'Failed to load streak draw state'));
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, [authLoaded, isSignedIn, fetchWithTimeout]);

  useFocusEffect(
    React.useCallback(function () {
      loadState(false);
    }, [loadState]),
  );

  React.useEffect(function () {
    if (!authLoaded || !isSignedIn) {
      return;
    }
    loadState(true);
  }, [streakDays, authLoaded, isSignedIn, loadState]);

  const callAction = React.useCallback(async function (path, body, fallbackMessage) {
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

    const response = await fetchWithTimeout(API_BASE_URL + path, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body || {}),
    });
    const data = await readJsonSafely(response);

    if (!response.ok) {
      throw new Error(data.error || fallbackMessage);
    }

    return data;
  }, [fetchWithTimeout]);

  const openDraw = React.useCallback(async function (source) {
    if (workingAction) {
      return;
    }

    try {
      setWorkingAction(source === 'ticket' ? 'ticket' : 'milestone');
      setError('');
      const data = await callAction(
        '/streak-draw/open',
        { source },
        'Failed to open streak draw',
      );
      setState(data.state || null);
    } catch (openError) {
      const message = getErrorMessage(openError, 'Failed to open streak draw');
      setError(message);
      Alert.alert('Draw failed', message);
    } finally {
      setWorkingAction('');
    }
  }, [workingAction, callAction]);

  const rerollDraw = React.useCallback(async function () {
    if (workingAction) {
      return;
    }

    try {
      setWorkingAction('reroll');
      setError('');
      const data = await callAction('/streak-draw/reroll', {}, 'Failed to reroll draw');
      setState(data.state || null);
    } catch (rerollError) {
      const message = getErrorMessage(rerollError, 'Failed to reroll draw');
      setError(message);
      Alert.alert('Reroll failed', message);
    } finally {
      setWorkingAction('');
    }
  }, [workingAction, callAction]);

  const acceptDraw = React.useCallback(async function () {
    if (workingAction) {
      return;
    }

    try {
      setWorkingAction('accept');
      setError('');
      const data = await callAction('/streak-draw/accept', {}, 'Failed to accept reward');
      setState(data.state || null);

      if (typeof onPointsUpdated === 'function') {
        onPointsUpdated(Number(data.totalPoints) || 0);
      }

      Alert.alert('Reward accepted', getAcceptMessage(data.acceptedReward));
    } catch (acceptError) {
      const message = getErrorMessage(acceptError, 'Failed to accept reward');
      setError(message);
      Alert.alert('Accept failed', message);
    } finally {
      setWorkingAction('');
    }
  }, [workingAction, callAction, onPointsUpdated]);

  if (!authLoaded || !isSignedIn) {
    return null;
  }

  const activeBuffLabels = getActiveBuffLabels(state);

  let bodyNode = null;
  if (loading && !state) {
    bodyNode = (
      <View style={styles.loadingWrap}>
        <ActivityIndicator color={theme.primary} />
      </View>
    );
  } else if (!state) {
    bodyNode = (
      <View style={styles.blockWrap}>
        <Text style={[styles.summaryText, { color: theme.textPrimary }]}>
          Cannot load streak draw state
        </Text>
        {error ? (
          <Text style={[styles.errorText, { color: isDarkTheme ? '#F29B96' : '#B91C1C' }]}>
            {error}
          </Text>
        ) : null}
        <Pressable
          onPress={function () {
            loadState(false);
          }}
          disabled={loading}
          style={({ pressed }) => [
            styles.secondaryButton,
            { backgroundColor: theme.secondaryBg, borderColor: theme.secondaryBorder },
            getStyleWhen(pressed, { opacity: 0.82 }),
          ]}
        >
          <Text style={[styles.secondaryButtonText, { color: theme.secondaryText }]}>
            Retry
          </Text>
        </Pressable>
      </View>
    );
  } else {
    const milestoneDraws = Number(state.milestoneDraws) || 0;
    const drawTickets = Number(state.drawTickets) || 0;
    const rerollTickets = Number(state.rerollTickets) || 0;
    const makeupCards = Number(state.makeupCards) || 0;
    const pendingReward = state.pendingReward || null;

    bodyNode = (
      <View style={styles.blockWrap}>
        <Text style={[styles.summaryText, { color: theme.textPrimary }]}>
          {getSummaryText(streakDays, state)}
        </Text>

        <View style={styles.inventoryRow}>
          <View style={[styles.inventoryChip, { backgroundColor: theme.surfaceMuted, borderColor: theme.borderSoft }]}>
            <Text style={[styles.inventoryValue, { color: theme.textPrimary }]}>{milestoneDraws}</Text>
            <Text style={[styles.inventoryLabel, { color: theme.textSecondary }]}>Milestone</Text>
          </View>
          <View style={[styles.inventoryChip, { backgroundColor: theme.surfaceMuted, borderColor: theme.borderSoft }]}>
            <Text style={[styles.inventoryValue, { color: theme.textPrimary }]}>{drawTickets}</Text>
            <Text style={[styles.inventoryLabel, { color: theme.textSecondary }]}>Tickets</Text>
          </View>
          <View style={[styles.inventoryChip, { backgroundColor: theme.surfaceMuted, borderColor: theme.borderSoft }]}>
            <Text style={[styles.inventoryValue, { color: theme.textPrimary }]}>{rerollTickets}</Text>
            <Text style={[styles.inventoryLabel, { color: theme.textSecondary }]}>Reroll</Text>
          </View>
          <View style={[styles.inventoryChip, { backgroundColor: theme.surfaceMuted, borderColor: theme.borderSoft }]}>
            <Text style={[styles.inventoryValue, { color: theme.textPrimary }]}>{makeupCards}</Text>
            <Text style={[styles.inventoryLabel, { color: theme.textSecondary }]}>Make-up</Text>
          </View>
        </View>

        {pendingReward ? (
          <View style={[styles.pendingCard, { backgroundColor: theme.surfaceMuted, borderColor: theme.borderSoft }]}>
            <Text style={[styles.pendingEyebrow, { color: theme.textMuted }]}>Current draw</Text>
            <Text style={[styles.pendingTitle, { color: theme.textPrimary }]}>{pendingReward.title}</Text>
            <Text style={[styles.pendingDescription, { color: theme.textSecondary }]}>
              {pendingReward.description}
            </Text>

            <View style={styles.actionRow}>
              <Pressable
                onPress={acceptDraw}
                disabled={workingAction !== ''}
                style={({ pressed }) => [
                  styles.primaryButton,
                  { backgroundColor: theme.primary },
                  getStyleWhen(pressed, { opacity: 0.82 }),
                  getStyleWhen(workingAction !== '', { opacity: 0.6 }),
                ]}
              >
                <Text style={[styles.primaryButtonText, { color: theme.primaryText }]}>
                  {workingAction === 'accept' ? 'Accepting...' : 'Accept'}
                </Text>
              </Pressable>

              <Pressable
                onPress={rerollDraw}
                disabled={workingAction !== '' || rerollTickets <= 0}
                style={({ pressed }) => [
                  styles.secondaryButton,
                  { backgroundColor: theme.secondaryBg, borderColor: theme.secondaryBorder },
                  getStyleWhen(pressed, { opacity: 0.82 }),
                  getStyleWhen(workingAction !== '' || rerollTickets <= 0, { opacity: 0.6 }),
                ]}
              >
                <Text style={[styles.secondaryButtonText, { color: theme.secondaryText }]}>
                  {workingAction === 'reroll' ? 'Rerolling...' : 'Reroll'}
                </Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <View style={styles.actionRow}>
            <Pressable
              onPress={function () {
                openDraw('milestone');
              }}
              disabled={workingAction !== '' || milestoneDraws <= 0}
              style={({ pressed }) => [
                styles.primaryButton,
                { backgroundColor: theme.primary },
                getStyleWhen(pressed, { opacity: 0.82 }),
                getStyleWhen(workingAction !== '' || milestoneDraws <= 0, { opacity: 0.6 }),
              ]}
            >
              <Text style={[styles.primaryButtonText, { color: theme.primaryText }]}>
                {workingAction === 'milestone' ? 'Drawing...' : 'Draw reward'}
              </Text>
            </Pressable>

            <Pressable
              onPress={function () {
                openDraw('ticket');
              }}
              disabled={workingAction !== '' || drawTickets <= 0}
              style={({ pressed }) => [
                styles.secondaryButton,
                { backgroundColor: theme.secondaryBg, borderColor: theme.secondaryBorder },
                getStyleWhen(pressed, { opacity: 0.82 }),
                getStyleWhen(workingAction !== '' || drawTickets <= 0, { opacity: 0.6 }),
              ]}
            >
              <Text style={[styles.secondaryButtonText, { color: theme.secondaryText }]}>
                {workingAction === 'ticket' ? 'Using...' : 'Use ticket'}
              </Text>
            </Pressable>
          </View>
        )}

        {activeBuffLabels.length > 0 ? (
          <View style={styles.buffWrap}>
            {activeBuffLabels.map(function (label) {
              return (
                <View
                  key={label}
                  style={[
                    styles.buffChip,
                    { backgroundColor: theme.surface, borderColor: theme.borderSoft },
                  ]}
                >
                  <Text style={[styles.buffText, { color: theme.primary }]}>{label}</Text>
                </View>
              );
            })}
          </View>
        ) : null}

        {error ? (
          <Text style={[styles.errorText, { color: isDarkTheme ? '#F29B96' : '#B91C1C' }]}>
            {error}
          </Text>
        ) : null}
      </View>
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
      <Text style={[styles.eyebrow, { color: theme.textMuted }]}>7-day draw</Text>
      <Text style={[styles.title, { color: theme.textPrimary }]}>Streak reward</Text>
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
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 8,
    letterSpacing: 0.3,
  },
  title: {
    fontSize: 24,
    fontWeight: '900',
    marginBottom: 14,
  },
  blockWrap: {
    gap: 14,
  },
  loadingWrap: {
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryText: {
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
  },
  inventoryRow: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
  },
  inventoryChip: {
    minWidth: 72,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    alignItems: 'center',
  },
  inventoryValue: {
    fontSize: 18,
    fontWeight: '900',
  },
  inventoryLabel: {
    marginTop: 4,
    fontSize: 11,
    fontWeight: '700',
  },
  pendingCard: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
  },
  pendingEyebrow: {
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  pendingTitle: {
    fontSize: 20,
    fontWeight: '900',
    marginBottom: 8,
  },
  pendingDescription: {
    fontSize: 13,
    lineHeight: 19,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
    marginTop: 2,
  },
  primaryButton: {
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 11,
    minWidth: 124,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    fontSize: 13,
    fontWeight: '800',
  },
  secondaryButton: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 11,
    minWidth: 124,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    fontSize: 13,
    fontWeight: '800',
  },
  buffWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  buffChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  buffText: {
    fontSize: 11,
    fontWeight: '800',
  },
  errorText: {
    fontSize: 12,
    lineHeight: 18,
  },
});
