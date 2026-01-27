// app/(home)/_layout.jsx
import React from 'react';
import { Stack, Redirect } from 'expo-router';
import { useAuth } from '@clerk/clerk-expo';
import { View, Text, ActivityIndicator } from "react-native";


export default function HomeLayout() {
  const { isSignedIn, isLoaded } = useAuth();

  if (!isLoaded) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator />
        <Text style={{ marginTop: 8 }}>Loading...</Text>
      </View>
    );
  }


  //export default function HomeLayout() { return <Stack screenOptions={{ headerShown: false }} />; }

  // 未登录，访问 (home) 这组页面时转到 /sign-in 在嵌套 layout 里做 redirect guard 
  // https://docs.expo.dev/router/advanced/authentication/
  if (!isSignedIn) {
    return <Redirect href="/sign-in" />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
  // 已登录，正常渲染 (home) 里的页面 
  // https://docs.expo.dev/router/advanced/stack/

//(home)/_layout 和 (auth)/_layout 分流形成闭环，未登录只能在auth组，已登录只能在home组，用路由组做权限分区