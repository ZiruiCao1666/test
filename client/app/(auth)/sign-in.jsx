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

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL;

const getErrorMessage = (error, fallbackMessage) => {
  if (error instanceof Error && error.message) return error.message;
  return fallbackMessage;
};

const getClerkErrorMessage = (error, fallbackMessage) => {
  const safeError = error || {};
  let errors = [];
  if (Array.isArray(safeError.errors)) {
    errors = safeError.errors;
  }
  if (errors.length > 0) {
    const firstError = errors[0] || {};
    if (firstError.longMessage) return firstError.longMessage;
    if (firstError.message) return firstError.message;
  }
  return getErrorMessage(error, fallbackMessage);
};

const renderNodeWhenElse = (condition, trueNode, falseNode) => {
  if (condition) return trueNode;
  return falseNode;
};

const getOpacityValue = (condition) => {
  if (condition) return 0.7;
  return 1;
};


export default function SignInScreen() {
  const router = useRouter();
  // Clerk: get the current session token before calling our backend.
  const { getToken } = useAuth();
  // Clerk: email/password sign-in flow.
  const { signIn, setActive, isLoaded } = useSignIn();
  // Clerk: browser-based SSO flow.
  const { startSSOFlow } = useSSO();

  const [emailAddress, setEmailAddress] = React.useState('');
  const [password, setPassword] = React.useState('');

  const [loadingPwd, setLoadingPwd] = React.useState(false);
  const [loadingSSO, setLoadingSSO] = React.useState(null);
  const syncUserToBackend = async () => {
    try {
      if (!API_BASE_URL) {
        throw new Error('Missing EXPO_PUBLIC_API_URL. Set it to your Render URL and restart Expo.');
      }
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
      console.log('[FE] sync error:', getErrorMessage(e, 'sync failed'));
    }
  };

  const goHome = async () => {
    await syncUserToBackend();
    router.replace('/');
  };

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
      // 参考 Clerk Quickstart：https://clerk.com/docs/expo/getting-started/quickstart
      // 当前项目依赖还是 @clerk/clerk-expo；这里沿用该版本可用的 signIn.create(...) + setActive(...)。

      if (attempt.status === 'complete') {
        await setActive({ session: attempt.createdSessionId });
        await goHome();
      } else {
        console.log('[sign-in] not complete:', JSON.stringify(attempt, null, 2));
        Alert.alert('Login incomplete', 'Please try again.');
      }
    } catch (err) {
      console.log('[sign-in] error:', JSON.stringify(err, null, 2));
      const msg = getClerkErrorMessage(err, 'Unable to sign in.');
      Alert.alert('Login error', msg);
    } finally {
      setLoadingPwd(false);
    }
  };

  const onSSOPress = (strategy) => async () => {
    setLoadingSSO(strategy);
    try {
      // 参考 Expo Linking：https://docs.expo.dev/versions/latest/sdk/linking/
      // 参考 Clerk SSO：https://clerk.com/docs/reference/expo/use-sso
      // 官方做法是用 Linking.createURL(...) 生成回跳地址，再传给 startSSOFlow。
      const redirectUrl = Linking.createURL('/sso-callback');
      console.log('[SSO] redirectUrl =', redirectUrl);

      const result = await startSSOFlow({ strategy, redirectUrl });
      console.log('[SSO] result =', JSON.stringify(result, null, 2));

      const { createdSessionId, setActive: setActiveFromSSO } = result;

      if (createdSessionId) {
        if (typeof setActiveFromSSO === 'function') {
          await setActiveFromSSO({ session: createdSessionId });
        }
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
      Alert.alert('SSO error', getErrorMessage(err, 'SSO sign-in failed.'));
    } finally {
      setLoadingSSO(null);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.select({ ios: 'padding', android: undefined })}
      style={{ flex: 1 }}
    >
      <View style={{ flex: 1, padding: 20, justifyContent: 'center' }}>
        <Text style={{ fontSize: 28, fontWeight: '800', marginBottom: 24 }}>
          Sign in
        </Text>
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
            opacity: getOpacityValue(loadingPwd),
            //https://react.dev/reference/react/useEffect  RN Gray the button visually
          }}
        >
          {renderNodeWhenElse(loadingPwd, (
            <ActivityIndicator color="#fff" />
          ), (
            <Text style={{ color: '#fff', fontWeight: '700' }}>Continue</Text>
          ))}
        </TouchableOpacity>

        <View style={{ height: 20 }} />

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
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
            opacity: getOpacityValue(loadingSSO === 'oauth_github'),
          }}
        >
          {renderNodeWhenElse(
            loadingSSO === 'oauth_github',
            <ActivityIndicator />,
            <Text>Continue with GitHub</Text>
          )}
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
            opacity: getOpacityValue(loadingSSO === 'oauth_google'),
          }}
        >
          {renderNodeWhenElse(
            loadingSSO === 'oauth_google',
            <ActivityIndicator />,
            <Text>Continue with Google</Text>
          )}
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
            opacity: getOpacityValue(loadingSSO === 'oauth_microsoft'),
          }}
        >
          {renderNodeWhenElse(
            loadingSSO === 'oauth_microsoft',
            <ActivityIndicator />,
            <Text>Continue with Microsoft</Text>
          )}
        </TouchableOpacity>

        <View style={{ height: 16 }} />
        <Link href="/sign-up" style={{ textAlign: 'center', color: '#2563eb' }}>
          No account? Create one
        </Link>
      </View>
    </KeyboardAvoidingView>
  );
}
