import React from 'react';
import { Text, TouchableOpacity } from 'react-native';
import { useClerk } from '@clerk/clerk-expo';

export default function SignOutButton() {
  const { signOut } = useClerk();

  return (
    <TouchableOpacity
      onPress={async () => {
        try {
          await signOut();
        } catch (err) {
          console.log('[SignOut] error:', err);
        }
      }}
      style={{
        height: 48,
        borderRadius: 8,
        backgroundColor: '#111827',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ color: '#fff', fontWeight: '700' }}>Sign out</Text>
    </TouchableOpacity>
  );
}
