// app/(home)/calendar.jsx
import React from 'react';
import { SafeAreaView, Text, View } from 'react-native';

export default function CalendarScreen() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
      <View style={{ padding: 18 }}>
        <Text style={{ fontSize: 20, fontWeight: '800', color: '#111827' }}>
          calendar
        </Text>

        <View style={{ height: 12 }} />

        <Text style={{ color: '#6b7280' }}>
          后面这里接 Canvas 作业/截止日期与提醒。
        </Text>
      </View>
    </SafeAreaView>
  );
}
