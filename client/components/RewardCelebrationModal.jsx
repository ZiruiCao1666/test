import React from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Pressable,
} from 'react-native';
import { useAppTheme } from '../lib/app-theme';

function getStyleWhen(condition, style) {
  if (condition) {
    return style;
  }
  return null;
}

export default function RewardCelebrationModal(props) {
  const safeProps = props || {};
  const visible = Boolean(safeProps.visible);
  const eyebrow = String(safeProps.eyebrow || 'Reward unlocked').trim();
  const value = String(safeProps.value || '').trim();
  const label = String(safeProps.label || '').trim();
  const title = String(safeProps.title || '').trim();
  const message = String(safeProps.message || '').trim();
  const badges = Array.isArray(safeProps.badges) ? safeProps.badges : [];
  const primaryLabel = String(safeProps.primaryLabel || 'Continue').trim() || 'Continue';
  const onPrimary = typeof safeProps.onPrimary === 'function' ? safeProps.onPrimary : null;
  const onRequestClose =
    typeof safeProps.onRequestClose === 'function' ? safeProps.onRequestClose : onPrimary;

  const { theme } = useAppTheme();
  const accentColor =
    String(safeProps.accentColor || '').trim() ||
    (theme.mode === 'dark' ? '#FBBF24' : '#F59E0B');

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onRequestClose || undefined}
    >
      <Pressable style={styles.overlay} onPress={onRequestClose || undefined}>
        <Pressable
          onPress={() => {}}
          style={[
            styles.card,
            {
              backgroundColor: theme.surface,
              borderColor: theme.border,
              shadowColor: theme.mode === 'dark' ? '#000000' : '#D6C3A7',
            },
          ]}
        >
          <Text style={[styles.eyebrow, { color: accentColor }]}>{eyebrow}</Text>

          <View style={[styles.ring, { borderColor: accentColor }]}>
            <View style={[styles.ringBadge, { backgroundColor: accentColor, shadowColor: accentColor }]} />
            <Text style={[styles.valueText, { color: accentColor }]}>{value}</Text>
            {label ? <Text style={[styles.labelText, { color: accentColor }]}>{label}</Text> : null}
          </View>

          {badges.length > 0 ? (
            <View style={styles.badgesRow}>
              {badges.map(function (badge, index) {
                const badgeText = String(badge || '').trim();
                return (
                  <View
                    key={badgeText + '-' + String(index)}
                    style={[styles.badgeCircle, { borderColor: accentColor }]}
                  >
                    <Text style={[styles.badgeText, { color: accentColor }]}>{badgeText}</Text>
                  </View>
                );
              })}
            </View>
          ) : null}

          {title ? <Text style={[styles.title, { color: theme.textPrimary }]}>{title}</Text> : null}
          {message ? <Text style={[styles.message, { color: theme.textSecondary }]}>{message}</Text> : null}

          <Pressable
            onPress={onPrimary || undefined}
            style={({ pressed }) => [
              styles.primaryButton,
              { backgroundColor: theme.primary },
              getStyleWhen(pressed, { opacity: 0.82 }),
            ]}
          >
            <Text style={[styles.primaryButtonText, { color: theme.primaryText }]}>{primaryLabel}</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 32,
    backgroundColor: 'rgba(15, 23, 42, 0.28)',
  },
  card: {
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
    borderWidth: 1,
    borderRadius: 28,
    paddingHorizontal: 22,
    paddingTop: 22,
    paddingBottom: 20,
    alignItems: 'center',
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.1,
    shadowRadius: 28,
    elevation: 5,
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  ring: {
    width: 180,
    height: 180,
    borderRadius: 90,
    borderWidth: 10,
    marginTop: 18,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  ringBadge: {
    position: 'absolute',
    right: 6,
    bottom: 6,
    width: 34,
    height: 34,
    borderRadius: 17,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.24,
    shadowRadius: 14,
    elevation: 4,
  },
  valueText: {
    fontSize: 52,
    fontWeight: '900',
    lineHeight: 56,
  },
  labelText: {
    marginTop: 4,
    fontSize: 18,
    fontWeight: '800',
    lineHeight: 24,
  },
  badgesRow: {
    marginTop: 18,
    flexDirection: 'row',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 10,
  },
  badgeCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '800',
  },
  title: {
    marginTop: 20,
    fontSize: 28,
    fontWeight: '900',
    textAlign: 'center',
  },
  message: {
    marginTop: 12,
    fontSize: 16,
    lineHeight: 24,
    textAlign: 'center',
  },
  primaryButton: {
    width: '100%',
    minHeight: 48,
    marginTop: 26,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  primaryButtonText: {
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
});
