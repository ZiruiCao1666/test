import React from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { View, Text, Pressable } from 'react-native';
import { useClerk, useUser } from '@clerk/clerk-expo';

export default function MyProfileScreen() {
  const { signOut } = useClerk();
  const { user } = useUser();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
      <View style={{ padding: 18, gap: 12 }}>
        <Text style={{ fontSize: 20, fontWeight: '800' }}>my profile</Text>
        <Text>{user?.fullName || user?.firstName || 'Student'}</Text>

        <Pressable
          onPress={() => signOut()}
          style={{ padding: 10, borderRadius: 10, backgroundColor: '#111827' }}
        >
          <Text style={{ color: '#fff', fontWeight: '700' }}>sign out</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
