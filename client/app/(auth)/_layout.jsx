import React from "react";
import { Redirect, Stack } from "expo-router";
import { useAuth } from "@clerk/clerk-expo";
import { View, Text, ActivityIndicator } from "react-native";

//https://clerk.com/docs/expo/getting-started/quickstart
// Redirect + Stack 来做鉴权分流 Authorization Diversion via Redirect and Stack Mechanism

//useAuth 读登录态


//https://docs.expo.dev/router/basics/layouts 
// 用目录和 layout 组织导航/权限控制”

export default function AuthLayout() {
  const { isSignedIn, isLoaded } = useAuth();
//isLoaded 避免 Clerk 未初始化时误判 signed-out 状态 
// https://clerk.com/docs/expo/reference/hooks/use-auth

if (!isLoaded) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator />
        <Text style={{ marginTop: 8 }}>Loading...</Text>
      </View>
    );
  }

//如果已登录就把 auth 页面重定向到主页 
// https://clerk.com/docs/expo/getting-started/quickstart

 if (isSignedIn) {
    return <Redirect href="/" />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}

//https://docs.expo.dev/router/advanced/stack/ 
// Expo Router Stack
