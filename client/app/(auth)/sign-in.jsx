import React from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Link, useRouter } from 'expo-router';
import { useAuth, useSignIn, useSSO } from '@clerk/clerk-expo';
import * as Linking from 'expo-linking';






const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL || 'http://localhost:4000';

export default function SignInScreen() {
  const router = useRouter();
  const { getToken } = useAuth();
  //https://clerk.com/docs/expo/reference/hooks/use-auth
  const { signIn, setActive, isLoaded } = useSignIn();
  //https://clerk.com/docs/expo/reference/hooks/use-sign-in
  const { startSSOFlow } = useSSO();
  //https://clerk.com/docs/reference/expo/use-sso

  const [emailAddress, setEmailAddress] = React.useState('');
  
  const [password, setPassword] = React.useState('');

  const [loadingPwd, setLoadingPwd] = React.useState(false);
  const [loadingSSO, setLoadingSSO] = React.useState(null);
//https://react.dev/reference/react/useState  Separately control the loading status of the two buttons
//https://react.dev/learn/managing-state
  const syncUserToBackend = async () => {
    try {
      const token = await getToken();
      if (!token) return;
      await fetch(`${API_BASE_URL}/users/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({}),
      });
    } catch (e) {
      console.log('[FE] sync error:', e?.message || e);
    }
  };

  const goHome = async () => {
    await syncUserToBackend();
    router.replace('/');
  };

  //https://docs.expo.dev/router/basics/navigation

  const onSignInPress = async () => {
    if (!isLoaded) return;

    if (!emailAddress.trim() || !password) {
      Alert.alert('Missing info', 'Please enter your email and password.');
      return;
    }

    setLoadingPwd(true);
    try {
      const attempt = await signIn.create({
        identifier: emailAddress.trim(),
        password,
      });
      //https://clerk.com/docs/expo/getting-started/quickstart 
      // signIn.create({ identifier, password })

      if (attempt.status === 'complete') {
        await setActive({ session: attempt.createdSessionId });
        //https://clerk.com/docs/expo/reference/hooks/use-sign-in
        await goHome();
      } else {
        console.log('[sign-in] not complete:', JSON.stringify(attempt, null, 2));
        Alert.alert('Login incomplete', 'Please try again.');
      }
    } catch (err) {
      console.log('[sign-in] error:', JSON.stringify(err, null, 2));
      const msg =
        err?.errors?.[0]?.longMessage ||
        err?.errors?.[0]?.message ||
        err?.message ||
        'Unable to sign in.';
      Alert.alert('Login error', msg);
    } finally {
      setLoadingPwd(false);
    }
  };

  const onSSOPress = (strategy) => async () => {
    setLoadingSSO(strategy);
    try {
      const redirectUrl = Linking.createURL('/sso-callback'); // Hop back route
      //https://docs.expo.dev/router/basics/core-concepts
      console.log('[SSO] redirectUrl =', redirectUrl);

      const result = await startSSOFlow({ strategy, redirectUrl });
      console.log('[SSO] result =', JSON.stringify(result, null, 2));

      const { createdSessionId, setActive: setActiveFromSSO } = result;

      if (createdSessionId) {
        await setActiveFromSSO?.({ session: createdSessionId });
        await goHome();
      } else {
        Alert.alert(
          'Continue in browser',
          'Finish sign-in in the opened page, then return to the app.',
        );
      }
    } catch (err) {
      console.log('[SSO sign-in] error =', err);
      console.log('[SSO sign-in] error json =', JSON.stringify(err, null, 2));
      Alert.alert('SSO error', err?.message || 'SSO sign-in failed.');
      //https://reactnative.dev/docs/pressable
    } finally {
      setLoadingSSO(null);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.select({ ios: 'padding', android: undefined })}
      style={{ flex: 1 }}
      //https://reactnative.dev/docs/height-and-width
    >
      <View style={{ flex: 1, padding: 20, justifyContent: 'center' }}>
        {/* https://reactnative.dev/docs/view
        https://reactnative.dev/docs/flexbox(justifyContent/alignItems/flexDirection) */}
        <Text style={{ fontSize: 28, fontWeight: '800', marginBottom: 24 }}>
          Sign in
        </Text>
{/* https://reactnative.dev/docs/text */}
        <View style={{ marginBottom: 12 }}>
          <Text style={{ fontSize: 14, marginBottom: 6 }}>Email</Text>
          <TextInput
            autoCapitalize="none"
            keyboardType="email-address"
            value={emailAddress}
            onChangeText={setEmailAddress}
            placeholder="Enter email"
            style={{
              borderWidth: 1,
              borderColor: '#ddd',
              borderRadius: 8,
              padding: 12,
            }}
          />
        </View>
{/* //https://reactnative.dev/docs/scrollview */}

        <View style={{ marginBottom: 16 }}>
          <Text style={{ fontSize: 14, marginBottom: 6 }}>Password</Text>
          <TextInput
            autoCapitalize="none"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            placeholder="Enter password"
            onSubmitEditing={onSignInPress}
            style={{
              borderWidth: 1,
              borderColor: '#ddd',
              borderRadius: 8,
              padding: 12,
            }}
          />
        </View>

        <TouchableOpacity
          onPress={onSignInPress}
          disabled={loadingPwd}
          style={{
            backgroundColor: '#111827',
            height: 48,
            borderRadius: 8,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: loadingPwd ? 0.7 : 1,
            //https://react.dev/reference/react/useEffect  RN Gray the button visually
          }}
        >
          {loadingPwd ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={{ color: '#fff', fontWeight: '700' }}>Continue</Text>
          )}
        </TouchableOpacity>

        <View style={{ height: 20 }} />

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        {/* https://reactnative.dev/docs/next/layout-props */}
          <View style={{ flex: 1, height: 1, backgroundColor: '#eee' }} />
          <Text style={{ color: '#888' }}>OR</Text>
          <View style={{ flex: 1, height: 1, backgroundColor: '#eee' }} />
        </View>

        <TouchableOpacity
          onPress={onSSOPress('oauth_github')}
          disabled={loadingSSO === 'oauth_github'}
          style={{
            height: 48,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: '#ddd',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 12,
            opacity: loadingSSO === 'oauth_github' ? 0.7 : 1,
          }}
        >
          {loadingSSO === 'oauth_github' ? <ActivityIndicator /> : <Text>Continue with GitHub</Text>}
        </TouchableOpacity>

        <TouchableOpacity
          onPress={onSSOPress('oauth_google')}
          disabled={loadingSSO === 'oauth_google'}
          style={{
            height: 48,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: '#ddd',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 12,
            opacity: loadingSSO === 'oauth_google' ? 0.7 : 1,
          }}
        >
          {loadingSSO === 'oauth_google' ? <ActivityIndicator /> : <Text>Continue with Google</Text>}
        </TouchableOpacity>

        <TouchableOpacity
          onPress={onSSOPress('oauth_microsoft')}
          disabled={loadingSSO === 'oauth_microsoft'}
          style={{
            height: 48,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: '#ddd',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: loadingSSO === 'oauth_microsoft' ? 0.7 : 1,
          }}
        >
          {loadingSSO === 'oauth_microsoft' ? <ActivityIndicator /> : <Text>Continue with Microsoft</Text>}
        </TouchableOpacity>

        <View style={{ height: 16 }} />
        <Link href="/sign-up" style={{ textAlign: 'center', color: '#2563eb' }}>
          No account? Create one
        </Link>
      </View>
    </KeyboardAvoidingView>
  );
}
