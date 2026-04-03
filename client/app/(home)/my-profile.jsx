import React from 'react';
import {
  SafeAreaView,
} from 'react-native-safe-area-context';
import {
  View,
  Text,
  Pressable,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Image,
} from 'react-native';
import { useClerk, useUser } from '@clerk/clerk-expo';
import * as ImagePicker from 'expo-image-picker';
import { getCustomDisplayNameFromUser, getDisplayNameFromUser } from '../../lib/user-display';

const MAX_NAME_LENGTH = 40;

export default function MyProfileScreen() {
  const { signOut } = useClerk();
  const { user, isLoaded } = useUser();
  const safeUser = user || {};
  const currentDisplayName = getDisplayNameFromUser(safeUser);
  const currentCustomDisplayName = getCustomDisplayNameFromUser(safeUser);
  const hasCustomAvatar = Boolean(safeUser.hasImage);
  let avatarUrl = '';
  if (safeUser.imageUrl) {
    avatarUrl = String(safeUser.imageUrl);
  }

  const [nameInput, setNameInput] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [avatarSaving, setAvatarSaving] = React.useState(false);

  React.useEffect(() => {
    if (!isLoaded) {
      return;
    }

    setNameInput(currentDisplayName);
  }, [isLoaded, currentDisplayName]);

  const saveDisplayName = async () => {
    if (!user) {
      return;
    }

    const nextName = String(nameInput || '').trim();
    if (!nextName) {
      Alert.alert('Name required', 'Please enter a name before saving.');
      return;
    }

    if (nextName.length > MAX_NAME_LENGTH) {
      Alert.alert('Name too long', 'Please keep your name within 40 characters.');
      return;
    }

    try {
      setSaving(true);

      let unsafeMetadata = {};
      if (safeUser.unsafeMetadata) {
        unsafeMetadata = safeUser.unsafeMetadata;
      }

      await user.update({
        unsafeMetadata: {
          ...unsafeMetadata,
          displayName: nextName,
        },
      });

      setNameInput(nextName);
      Alert.alert('Saved', 'Your display name has been updated.');
    } catch (error) {
      let message = 'Failed to update your display name.';
      if (error instanceof Error) {
        if (error.message) {
          message = error.message;
        }
      }
      Alert.alert('Update failed', message);
    } finally {
      setSaving(false);
    }
  };

  const resetDisplayName = async () => {
    if (!user) {
      return;
    }

    try {
      setSaving(true);

      let unsafeMetadata = {};
      if (safeUser.unsafeMetadata) {
        unsafeMetadata = safeUser.unsafeMetadata;
      }

      await user.update({
        unsafeMetadata: {
          ...unsafeMetadata,
          displayName: '',
        },
      });

      const fallbackName = getDisplayNameFromUser({
        ...safeUser,
        unsafeMetadata: {
          ...unsafeMetadata,
          displayName: '',
        },
      });

      setNameInput(fallbackName);
      Alert.alert('Reset', 'Your app display name has been reset.');
    } catch (error) {
      let message = 'Failed to reset your display name.';
      if (error instanceof Error) {
        if (error.message) {
          message = error.message;
        }
      }
      Alert.alert('Reset failed', message);
    } finally {
      setSaving(false);
    }
  };

  const pickAvatar = async () => {
    if (!user) {
      return;
    }

    try {
      setAvatarSaving(true);

      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissionResult.granted) {
        Alert.alert('Permission required', 'Please allow photo library access to choose an avatar.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: 'images',
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (result.canceled) {
        return;
      }

      let selectedAsset = null;
      if (Array.isArray(result.assets)) {
        if (result.assets.length > 0) {
          selectedAsset = result.assets[0];
        }
      }

      if (!selectedAsset) {
        return;
      }

      let imageUri = '';
      if (selectedAsset.uri) {
        imageUri = String(selectedAsset.uri);
      }

      if (!imageUri) {
        Alert.alert('Image missing', 'The selected image could not be read.');
        return;
      }

      const imageResponse = await fetch(imageUri);
      const imageBlob = await imageResponse.blob();
      await user.setProfileImage({ file: imageBlob });
      await user.reload();

      Alert.alert('Saved', 'Your avatar has been updated.');
    } catch (error) {
      let message = 'Failed to update your avatar.';
      if (error instanceof Error) {
        if (error.message) {
          message = error.message;
        }
      }
      Alert.alert('Update failed', message);
    } finally {
      setAvatarSaving(false);
    }
  };

  const removeAvatar = async () => {
    if (!user) {
      return;
    }

    Alert.alert(
      'Remove avatar',
      'Do you want to remove your custom avatar and go back to the default profile image?',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              setAvatarSaving(true);
              await user.setProfileImage({ file: null });
              await user.reload();
              Alert.alert('Removed', 'Your custom avatar has been removed.');
            } catch (error) {
              let message = 'Failed to remove your avatar.';
              if (error instanceof Error) {
                if (error.message) {
                  message = error.message;
                }
              }
              Alert.alert('Remove failed', message);
            } finally {
              setAvatarSaving(false);
            }
          },
        },
      ]
    );
  };

  if (!isLoaded) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.loadingWrap}>
          <ActivityIndicator />
        </View>
      </SafeAreaView>
    );
  }

  let resetButtonNode = null;
  if (currentCustomDisplayName) {
    resetButtonNode = (
      <Pressable
        onPress={resetDisplayName}
        disabled={saving}
        style={({ pressed }) => [
          styles.secondaryButton,
          pressed ? styles.buttonPressed : null,
          saving ? styles.buttonDisabled : null,
        ]}
      >
        <Text style={styles.secondaryButtonText}>Reset name</Text>
      </Pressable>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <Text style={styles.title}>my profile</Text>

        <View style={styles.card}>
          <Text style={styles.sectionLabel}>Profile photo</Text>

          <View style={styles.avatarWrap}>
            <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
          </View>

          <Text style={styles.helperText}>
            This photo is stored in Clerk and is used anywhere the app shows your account avatar.
          </Text>

          <Pressable
            onPress={pickAvatar}
            disabled={avatarSaving}
            style={({ pressed }) => [
              styles.primaryButton,
              pressed ? styles.buttonPressed : null,
              avatarSaving ? styles.buttonDisabled : null,
            ]}
          >
            <Text style={styles.primaryButtonText}>
              {avatarSaving ? 'Saving...' : 'Change avatar'}
            </Text>
          </Pressable>

          {hasCustomAvatar ? (
            <Pressable
              onPress={removeAvatar}
              disabled={avatarSaving}
              style={({ pressed }) => [
                styles.secondaryButton,
                pressed ? styles.buttonPressed : null,
                avatarSaving ? styles.buttonDisabled : null,
              ]}
            >
              <Text style={styles.secondaryButtonText}>Remove avatar</Text>
            </Pressable>
          ) : null}
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionLabel}>Current name</Text>
          <Text style={styles.currentName}>{currentDisplayName}</Text>
          <Text style={styles.helperText}>
            This name will be used in the app greeting and profile pages.
          </Text>

          <Text style={styles.inputLabel}>Custom display name</Text>
          <TextInput
            value={nameInput}
            onChangeText={setNameInput}
            maxLength={MAX_NAME_LENGTH}
            placeholder="Enter the name you want to show"
            autoCapitalize="words"
            autoCorrect={false}
            editable={!saving}
            style={styles.input}
          />

          <Pressable
            onPress={saveDisplayName}
            disabled={saving}
            style={({ pressed }) => [
              styles.primaryButton,
              pressed ? styles.buttonPressed : null,
              saving ? styles.buttonDisabled : null,
            ]}
          >
            <Text style={styles.primaryButtonText}>
              {saving ? 'Saving...' : 'Save name'}
            </Text>
          </Pressable>

          {resetButtonNode}
        </View>

        <Pressable
          onPress={() => signOut()}
          style={({ pressed }) => [
            styles.signOutButton,
            pressed ? styles.buttonPressed : null,
          ]}
        >
          <Text style={styles.signOutButtonText}>sign out</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  container: {
    padding: 18,
    gap: 14,
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: '#111827',
  },
  card: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 14,
    backgroundColor: '#ffffff',
    padding: 14,
    gap: 10,
  },
  avatarWrap: {
    width: 96,
    height: 96,
    borderRadius: 48,
    overflow: 'hidden',
    backgroundColor: '#f3f4f6',
    alignSelf: 'center',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6b7280',
    textTransform: 'uppercase',
  },
  currentName: {
    fontSize: 22,
    fontWeight: '800',
    color: '#111827',
  },
  helperText: {
    fontSize: 12,
    lineHeight: 18,
    color: '#6b7280',
  },
  inputLabel: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: '700',
    color: '#111827',
  },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 15,
    color: '#111827',
    backgroundColor: '#ffffff',
  },
  primaryButton: {
    marginTop: 4,
    borderRadius: 12,
    backgroundColor: '#111827',
    paddingVertical: 11,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  secondaryButton: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#d1d5db',
    backgroundColor: '#ffffff',
    paddingVertical: 11,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: '#111827',
    fontSize: 14,
    fontWeight: '700',
  },
  signOutButton: {
    borderRadius: 12,
    backgroundColor: '#111827',
    paddingVertical: 11,
    alignItems: 'center',
  },
  signOutButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  buttonPressed: {
    opacity: 0.75,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});
