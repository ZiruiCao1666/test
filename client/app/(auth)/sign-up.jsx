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

const getOpacityValue = (condition) => {
  if (condition) return 0.7;
  return 1;
};

export default function SignUpScreen() {
  const router = useRouter();
  const { getToken } = useAuth();
  const { isLoaded, signUp, setActive } = useSignUp();
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
    } catch (error) {
      console.log('[FE] sync error:', getErrorMessage(error, 'sync failed'));
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
      // Clerk 官方邮箱注册流程：create(...) 之后准备邮箱验证码，再完成 attemptEmailAddressVerification(...).
      await signUp.create({
        emailAddress: emailAddress.trim(),
        password,
      });

      await signUp.prepareEmailAddressVerification({ strategy: 'email_code' });
      setPendingVerification(true);
    } catch (error) {
      console.log('[sign-up] error:', JSON.stringify(error, null, 2));
      const message = getClerkErrorMessage(error, 'Unable to sign up.');
      Alert.alert('Sign-up error', message);
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
    } catch (error) {
      console.log('[verify] error:', JSON.stringify(error, null, 2));
      Alert.alert('Verify error', getErrorMessage(error, 'Verification failed.'));
    } finally {
      setLoadingVerify(false);
    }
  };

  const onSSOPress = (strategy) => async () => {
    setLoadingSSO(strategy);
    try {
      // Expo Linking 官方做法：用 Linking.createURL(...) 生成回跳地址，再传给 Clerk startSSOFlow。
      const redirectUrl = Linking.createURL('/sso-callback');
      const result = await startSSOFlow({ strategy, redirectUrl });
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
    } catch (error) {
      console.log('[SSO sign-up] error =', error);
      console.log('[SSO sign-up] error json =', JSON.stringify(error, null, 2));
      Alert.alert('SSO error', getErrorMessage(error, 'SSO sign-up failed.'));
    } finally {
      setLoadingSSO(null);
    }
  };

  let verifyButtonNode = <Text style={{ color: '#fff', fontWeight: '700' }}>Verify</Text>;
  if (loadingVerify) {
    verifyButtonNode = <ActivityIndicator color="#fff" />;
  }

  let submitButtonNode = <Text style={{ color: '#fff', fontWeight: '700' }}>Continue</Text>;
  if (loadingSubmit) {
    submitButtonNode = <ActivityIndicator color="#fff" />;
  }

  let githubButtonNode = <Text>Continue with GitHub</Text>;
  if (loadingSSO === 'oauth_github') {
    githubButtonNode = <ActivityIndicator />;
  }

  let googleButtonNode = <Text>Continue with Google</Text>;
  if (loadingSSO === 'oauth_google') {
    googleButtonNode = <ActivityIndicator />;
  }

  let microsoftButtonNode = <Text>Continue with Microsoft</Text>;
  if (loadingSSO === 'oauth_microsoft') {
    microsoftButtonNode = <ActivityIndicator />;
  }

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
            {verifyButtonNode}
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
          {submitButtonNode}
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
          {githubButtonNode}
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
          {googleButtonNode}
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
          {microsoftButtonNode}
        </TouchableOpacity>

        <View style={{ height: 16 }} />
        <Link href="/sign-in" style={{ textAlign: 'center', color: '#2563eb' }}>
          Already have an account? Sign in
        </Link>
      </View>
    </KeyboardAvoidingView>
  );
}
