import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Redirect, Tabs } from 'expo-router';
import { useAuth } from '@clerk/clerk-expo';
import { useAppTheme } from '../../lib/app-theme';

export default function HomeLayout() {
  const { isLoaded, isSignedIn } = useAuth();
  const { theme } = useAppTheme();

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
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: theme.tabBarBg,
          borderTopColor: theme.tabBarBorder,
        },
        tabBarActiveTintColor: theme.tabActive,
        tabBarInactiveTintColor: theme.tabInactive,
        sceneStyle: {
          backgroundColor: theme.screenBg,
        },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'home' }} />
      <Tabs.Screen name="calendar" options={{ title: 'calendar' }} />
      <Tabs.Screen name="rewards" options={{ title: 'rewards' }} />
      <Tabs.Screen name="my-profile" options={{ title: 'my profile' }} />

      {/* Expo 官方：href: null 可隐藏 tab 但保留路由 */}
      <Tabs.Screen name="orders" options={{ href: null }} />
      <Tabs.Screen name="order-detail" options={{ href: null }} />
    </Tabs>
  );
}
