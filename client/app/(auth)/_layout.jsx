import React from "react";
import { Redirect, Stack } from "expo-router";
import { useAuth } from "@clerk/clerk-expo";
import { View, Text, ActivityIndicator } from "react-native";

// 参考 Clerk Expo Quickstart：https://clerk.com/docs/expo/getting-started/quickstart
// 参考 Expo Router Layout：https://docs.expo.dev/router/basics/layout/#root-layout
// 这里按官网常见做法：未登录显示 auth 组，已登录就 Redirect 到首页。
export default function AuthLayout() {
  const { isSignedIn, isLoaded } = useAuth();

  // 参考 Clerk useAuth：https://clerk.com/docs/reference/expo/use-auth
  // isLoaded 为 false 时先不要判断登录态，避免 Clerk 还没初始化完成就误跳转。
  if (!isLoaded) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator />
        <Text style={{ marginTop: 8 }}>Loading...</Text>
      </View>
    );
  }

  if (isSignedIn) {
    return <Redirect href="/" />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
