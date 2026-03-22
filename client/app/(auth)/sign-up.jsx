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
import { useAuth, useSignUp, useSSO } from '@clerk/clerk-expo';
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

export default function SignUpScreen() {
  const router = useRouter();
  // Clerk: get the current session token before calling our backend.
  const { getToken } = useAuth();
  // Clerk: email/password sign-up flow.
  const { isLoaded, signUp, setActive } = useSignUp();
  // Clerk: browser-based SSO flow.
  const { startSSOFlow } = useSSO();

  const [emailAddress, setEmailAddress] = React.useState('');
  const [password, setPassword] = React.useState('');

  const [pendingVerification, setPendingVerification] = React.useState(false);
  const [code, setCode] = React.useState('');

  const [loadingSubmit, setLoadingSubmit] = React.useState(false);
  const [loadingVerify, setLoadingVerify] = React.useState(false);
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

  const onSignUpPress = async () => {
    if (!isLoaded) return;

    if (!emailAddress.trim() || !password) {
      Alert.alert('Missing info', 'Please enter your email and password.');
      return;
    }

    setLoadingSubmit(true);
    try {
      // 参考 Clerk Quickstart：https://clerk.com/docs/expo/getting-started/quickstart
      // 官方邮箱注册流程是 create -> prepareEmailAddressVerification -> attemptEmailAddressVerification。
      await signUp.create({
        emailAddress: emailAddress.trim(),
        password,
      });

      await signUp.prepareEmailAddressVerification({ strategy: 'email_code' });
      setPendingVerification(true);
    } catch (err) {
      console.log('[sign-up] error:', JSON.stringify(err, null, 2));
      const msg = getClerkErrorMessage(err, 'Unable to sign up.');
      Alert.alert('Sign-up error', msg);
    } finally {
      setLoadingSubmit(false);
    }
  };

  const onVerifyPress = async () => {
    if (!isLoaded) return;

    if (!code.trim()) {
      Alert.alert('Missing code', 'Please enter the verification code.');
      return;
    }

    setLoadingVerify(true);
    try {
      const attempt = await signUp.attemptEmailAddressVerification({
        code: code.trim(),
      });

      if (attempt.status === 'complete') {
        await setActive({ session: attempt.createdSessionId });
        await goHome();
      } else {
        console.log('[verify] not complete:', JSON.stringify(attempt, null, 2));
        Alert.alert('Verification incomplete', 'Please try again.');
      }
    } catch (err) {
      console.log('[verify] error:', JSON.stringify(err, null, 2));
      Alert.alert('Verify error', getErrorMessage(err, 'Verification failed.'));
    } finally {
      setLoadingVerify(false);
    }
  };

  const onSSOPress = (strategy) => async () => {
    setLoadingSSO(strategy);
    try {
      // 参考 Expo Linking：https://docs.expo.dev/versions/latest/sdk/linking/
      // 参考 Clerk SSO：https://clerk.com/docs/reference/expo/use-sso
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
          'Finish sign-up in the opened page, then return to the app.',
        );
      }
    } catch (err) {
      console.log('[SSO sign-up] error =', err);
      console.log('[SSO sign-up] error json =', JSON.stringify(err, null, 2));
      Alert.alert('SSO error', getErrorMessage(err, 'SSO sign-up failed.'));
    } finally {
      setLoadingSSO(null);
    }
  };

  if (pendingVerification) {
    return (
      <KeyboardAvoidingView
        behavior={Platform.select({ ios: 'padding', android: undefined })}
        style={{ flex: 1 }}
      >
        <View style={{ flex: 1, padding: 20, justifyContent: 'center' }}>
          <Text style={{ fontSize: 28, fontWeight: '800', marginBottom: 12 }}>
            Verify your email
          </Text>

          <TextInput
            value={code}
            placeholder="Enter verification code"
            onChangeText={setCode}
            keyboardType="number-pad"
            style={{
              borderWidth: 1,
              borderColor: '#ddd',
              borderRadius: 8,
              padding: 12,
              marginBottom: 16,
            }}
          />

          <TouchableOpacity
            onPress={onVerifyPress}
            disabled={loadingVerify}
            style={{
              backgroundColor: '#111827',
              height: 48,
              borderRadius: 8,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: getOpacityValue(loadingVerify),
          }}
        >
            {renderNodeWhenElse(loadingVerify, (
              <ActivityIndicator color="#fff" />
            ), (
              <Text style={{ color: '#fff', fontWeight: '700' }}>Verify</Text>
            ))}
          </TouchableOpacity>

          <View style={{ height: 16 }} />
          <Link href="/sign-in" style={{ textAlign: 'center', color: '#2563eb' }}>
            Back to sign in
          </Link>
        </View>
      </KeyboardAvoidingView>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.select({ ios: 'padding', android: undefined })}
      style={{ flex: 1 }}
    >
      <View style={{ flex: 1, padding: 20, justifyContent: 'center' }}>
        <Text style={{ fontSize: 28, fontWeight: '800', marginBottom: 24 }}>
          Sign up
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
            onSubmitEditing={onSignUpPress}
            style={{
              borderWidth: 1,
              borderColor: '#ddd',
              borderRadius: 8,
              padding: 12,
            }}
          />
        </View>

        <TouchableOpacity
          onPress={onSignUpPress}
          disabled={loadingSubmit}
          style={{
            backgroundColor: '#111827',
            height: 48,
            borderRadius: 8,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: getOpacityValue(loadingSubmit),
          }}
        >
          {renderNodeWhenElse(loadingSubmit, (
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
            <Text>Continue with microsoft</Text>
          )}
        </TouchableOpacity>

        <View style={{ height: 16 }} />
        <Link href="/sign-in" style={{ textAlign: 'center', color: '#2563eb' }}>
          Already have an account? Sign in
        </Link>
      </View>
    </KeyboardAvoidingView>
  );
}
