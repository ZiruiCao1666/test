// app/(home)/_layout.jsx
import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Redirect, Tabs } from 'expo-router';
import { useAuth } from '@clerk/clerk-expo';
import { Ionicons } from '@expo/vector-icons';

export default function HomeLayout() {
  const { isLoaded, isSignedIn } = useAuth();

  if (!isLoaded) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  // Expo Router 官方推荐：在 layout 里用 Redirect 做 protected routes
  if (!isSignedIn) {
    return <Redirect href="/sign-in" />;
  }

  // Expo Router 官方 Tabs：import { Tabs } from 'expo-router'
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarHideOnKeyboard: true,
        tabBarStyle: {
          height: 64,
          paddingTop: 8,
          paddingBottom: 10,
          borderTopWidth: 1,
          borderTopColor: '#e5e7eb',
        },
        tabBarActiveTintColor: '#111827',
        tabBarInactiveTintColor: '#9ca3af',
        tabBarLabelStyle: { fontSize: 12 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: '',
          tabBarLabel: '',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? 'home' : 'home-outline'}
              size={size ?? 22}
              color={color}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="calendar"
        options={{ title: 'calendar', tabBarLabel: 'calendar' }}
      />

      <Tabs.Screen
        name="rewards"
        options={{ title: 'rewards', tabBarLabel: 'rewards' }}
      />

      <Tabs.Screen
        name="my-profile"
        options={{ title: 'my profile', tabBarLabel: 'my profile' }}
      />

      {/* Expo Router 官方：href: null 可以隐藏一个 tab，但路由仍然存在 */}
      <Tabs.Screen
        name="orders"
        options={{
          href: null,
        }}
      />
    </Tabs>
  );
}
