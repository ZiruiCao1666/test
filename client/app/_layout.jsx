import React from 'react';
import { ClerkProvider } from '@clerk/clerk-expo';
import { tokenCache } from '@clerk/clerk-expo/token-cache';
import { Slot } from 'expo-router';
import { UserProfileProvider } from '../providers/UserProfileProvider';

const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;

if (!publishableKey) {
  throw new Error('Missing EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY');
}
//https://clerk.com/docs/expo/getting-started/quickstart  
// if (!publishableKey) throw new Error(...) 启动即校验关键配置


export default function RootLayout() {
  return (
    // 参考 Clerk Expo Quickstart：https://clerk.com/docs/expo/getting-started/quickstart
    // 官网示例是在根布局里用 <ClerkProvider publishableKey=... tokenCache=...> 包住路由树。
    <ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache}>
      <UserProfileProvider>
        <Slot />
      </UserProfileProvider>
    </ClerkProvider>
  );
}
