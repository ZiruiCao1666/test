import React from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

const getStyleWhen = (condition, style) => {
  if (!condition) {
    return null;
  }
  return style;
};

export default function CalendarConnectSection({
  schoolInput = '',
  tokenInput = '',
  baseUrl = '',
  loading = false,
  error = '',
  helperText = '',
  lastSyncLabel = '',
  connectLabel = 'Connect Canvas',
  clearLabel = 'Clear',
  onChangeSchool,
  onChangeToken,
  onConnect,
  onClear,
}) {
  return (
    <View style={styles.card}>
      <Text style={styles.sectionTitle}>1. Connect</Text>

      <Text style={styles.label}>School name</Text>
      <TextInput
        value={schoolInput}
        onChangeText={onChangeSchool}
        placeholder="Example: hull / ox"
        autoCapitalize="none"
        autoCorrect={false}
        style={styles.input}
      />

      <Text style={styles.inputHint}>Resolved URL: {baseUrl || 'https://school-name.instructure.com'}</Text>

      <Text style={[styles.label, styles.spacedLabel]}>Access Token</Text>
      <TextInput
        value={tokenInput}
        onChangeText={onChangeToken}
        placeholder="Canvas Access Token"
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry
        style={styles.input}
      />

      <View style={styles.buttonRow}>
        <Pressable
          onPress={onConnect}
          disabled={loading}
          style={({ pressed }) => [
            styles.primaryButton,
            getStyleWhen(loading, styles.primaryButtonDisabled),
            getStyleWhen(pressed, styles.pressed),
          ]}
        >
          <Text style={styles.primaryButtonText}>{loading ? 'Connecting...' : connectLabel}</Text>
        </Pressable>

        <Pressable
          onPress={onClear}
          style={({ pressed }) => [styles.secondaryButton, getStyleWhen(pressed, styles.pressed)]}
        >
          <Text style={styles.secondaryButtonText}>{clearLabel}</Text>
        </Pressable>
      </View>

      {helperText ? <Text style={styles.helper}>{helperText}</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {lastSyncLabel ? <Text style={styles.lastSync}>{lastSyncLabel}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 14,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  spacedLabel: {
    marginTop: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#111827',
    backgroundColor: '#ffffff',
  },
  inputHint: {
    marginTop: 8,
    fontSize: 12,
    color: '#6b7280',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  primaryButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    backgroundColor: '#2563eb',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonDisabled: {
    opacity: 0.65,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  secondaryButton: {
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#d1d5db',
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
  },
  secondaryButtonText: {
    color: '#374151',
    fontSize: 14,
    fontWeight: '600',
  },
  helper: {
    marginTop: 12,
    fontSize: 12,
    lineHeight: 18,
    color: '#6b7280',
  },
  error: {
    marginTop: 12,
    fontSize: 13,
    lineHeight: 18,
    color: '#b91c1c',
  },
  lastSync: {
    marginTop: 10,
    fontSize: 12,
    color: '#047857',
  },
  pressed: {
    opacity: 0.85,
  },
});
