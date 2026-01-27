import React from 'react';
import { ActivityIndicator, View, Text } from 'react-native';
import { useAuth } from '@clerk/clerk-expo';
import { useRouter } from 'expo-router';

export default function SsoCallback() {
  const { isLoaded, isSignedIn } = useAuth();
  const router = useRouter();

  React.useEffect(() => {
    if (!isLoaded) return;
    router.replace(isSignedIn ? '/' : '/sign-in');
  }, [isLoaded, isSignedIn, router]);

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
      <ActivityIndicator />
      <Text>Completing sign-in...</Text>
    </View>
  );
}
