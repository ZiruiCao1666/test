import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import CalendarConnectSection from './CalendarConnectSection';
import CalendarOverviewSection from './CalendarOverviewSection';
import CalendarTaskSection from './CalendarTaskSection';

export default function CalendarScreenSimple({
  title = 'Calendar + Grades',
  subtitle = 'Beginner-friendly split: one shell file, then one file per main feature area.',
  connectProps = {},
  overviewProps = {},
  taskProps = {},
}) {
  const fallbackTaskVisible =
    typeof overviewProps.selectedPanel === 'string' ? overviewProps.selectedPanel === 'overview' : true;
  const mergedTaskProps = {
    visible: fallbackTaskVisible,
    ...taskProps,
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>
        </View>

        <View style={styles.sectionStack}>
          <CalendarConnectSection {...connectProps} />
          <CalendarOverviewSection {...overviewProps} />
          <CalendarTaskSection {...mergedTaskProps} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  container: {
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 24,
  },
  header: {
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#111827',
  },
  subtitle: {
    marginTop: 6,
    fontSize: 13,
    lineHeight: 19,
    color: '#6b7280',
  },
  sectionStack: {
    gap: 16,
  },
});
