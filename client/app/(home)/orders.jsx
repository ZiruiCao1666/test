import React from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { View, Text } from 'react-native';

export default function OrdersScreen() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
      <View style={{ padding: 18 }}>
        <Text style={{ fontSize: 20, fontWeight: '800' }}>my orders</Text>
      </View>
    </SafeAreaView>
  );
}
