import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Redirect, Tabs } from 'expo-router';
import { useAuth } from '@clerk/clerk-expo';

export default function HomeLayout() {
  const { isLoaded, isSignedIn } = useAuth();

  if (!isLoaded) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!isSignedIn) {
    return <Redirect href="/sign-in" />;
  }

  return (
    <Tabs screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="index" options={{ title: 'home' }} />
      <Tabs.Screen name="calendar" options={{ title: 'calendar' }} />
      <Tabs.Screen name="rewards" options={{ title: 'rewards' }} />
      <Tabs.Screen name="my-profile" options={{ title: 'my profile' }} />

      {/* Expo 官方：href: null 可隐藏 tab 但保留路由 */}
      <Tabs.Screen name="orders" options={{ href: null }} />
    </Tabs>
  );
}
