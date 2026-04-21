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
  ScrollView,
} from 'react-native';
import { useClerk, useUser } from '@clerk/clerk-expo';
import * as ImagePicker from 'expo-image-picker';
import { getCustomDisplayNameFromUser, getDisplayNameFromUser } from '../../lib/user-display';
import { useAppTheme } from '../../lib/app-theme';

const MAX_NAME_LENGTH = 14;

export default function MyProfileScreen() {
  const { signOut } = useClerk();
  const { user, isLoaded } = useUser();
  const { themeMode, theme, setThemeMode } = useAppTheme();
  const safeUser = user || {};
  const currentDisplayName = getDisplayNameFromUser(safeUser);
  const currentCustomDisplayName = getCustomDisplayNameFromUser(safeUser);
  const hasCustomAvatar = Boolean(safeUser.hasImage);
  let avatarUrl = '';
  if (safeUser.imageUrl) {
    avatarUrl = String(safeUser.imageUrl);
  }
  let avatarInitial = 'U';
  const safeName = String(currentDisplayName || '').trim();
  if (safeName) {
    avatarInitial = safeName.charAt(0).toUpperCase();
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
      Alert.alert('Name too long', 'Please keep your name within 14 characters.');
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

      let imageType = 'image/jpeg';
      if (selectedAsset.mimeType) {
        const nextType = String(selectedAsset.mimeType).trim().toLowerCase();
        if (nextType.startsWith('image/')) {
          imageType = nextType;
        }
      }

      let imageName = 'avatar.jpg';
      if (selectedAsset.fileName) {
        imageName = String(selectedAsset.fileName);
      } else if (imageType === 'image/png') {
        imageName = 'avatar.png';
      } else if (imageType === 'image/heic') {
        imageName = 'avatar.heic';
      } else if (imageType === 'image/heif') {
        imageName = 'avatar.heif';
      }

      const uploadFile = {
        uri: imageUri,
        name: imageName,
        type: imageType,
      };

      await user.setProfileImage({ file: uploadFile });
      await user.reload();
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
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.screenBg }]}>
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
          {
            backgroundColor: theme.secondaryBg,
            borderColor: theme.secondaryBorder,
          },
          pressed ? styles.buttonPressed : null,
          saving ? styles.buttonDisabled : null,
        ]}
      >
        <Text style={[styles.secondaryButtonText, { color: theme.secondaryText }]}>Reset name</Text>
      </Pressable>
    );
  }

  let avatarNode = null;
  if (avatarUrl) {
    avatarNode = <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />;
  } else {
    avatarNode = (
      <View style={styles.avatarFallback}>
        <Text style={styles.avatarFallbackText}>{avatarInitial}</Text>
      </View>
    );
  }

  let removeAvatarNode = null;
  if (hasCustomAvatar) {
    removeAvatarNode = (
      <Pressable
        onPress={removeAvatar}
        disabled={avatarSaving}
        style={({ pressed }) => [
          styles.headerSecondaryButton,
          {
            backgroundColor: theme.secondaryBg,
            borderColor: theme.secondaryBorder,
          },
          pressed ? styles.buttonPressed : null,
          avatarSaving ? styles.buttonDisabled : null,
        ]}
      >
        <Text style={[styles.headerSecondaryButtonText, { color: theme.secondaryText }]}>Remove avatar</Text>
      </Pressable>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.screenBg }]}>
      <ScrollView contentContainerStyle={styles.container}>
        <View
          style={[
            styles.headerCard,
            {
              backgroundColor: theme.heroBg,
              borderColor: theme.heroBorder,
            },
          ]}
        >
          <View style={styles.headerTopRow}>
            <Text style={[styles.headerEyebrow, { color: theme.heroMuted }]}>Profile</Text>
          </View>

          <View style={styles.avatarHeroWrap}>
            <View style={styles.avatarHeroRing}>
              <View style={styles.avatarWrap}>
                {avatarNode}
              </View>
            </View>
          </View>

          <Text style={styles.headerName}>{currentDisplayName}</Text>
          <Text style={[styles.headerSubtitle, { color: theme.textOnDarkMuted }]}>
            Student Motivation account
          </Text>

          <View style={styles.headerButtonColumn}>
            <Pressable
              onPress={pickAvatar}
              disabled={avatarSaving}
              style={({ pressed }) => [
                styles.headerPrimaryButton,
                { backgroundColor: theme.primary },
                pressed ? styles.buttonPressed : null,
                avatarSaving ? styles.buttonDisabled : null,
              ]}
            >
              <Text style={[styles.headerPrimaryButtonText, { color: theme.primaryText }]}>
                {avatarSaving ? 'Saving...' : 'Change avatar'}
              </Text>
            </Pressable>

            {removeAvatarNode}
          </View>
        </View>

        <View
          style={[
            styles.card,
            {
              backgroundColor: theme.surface,
              borderColor: theme.border,
            },
          ]}
        >
          <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>Display name</Text>
          <Text style={[styles.currentName, { color: theme.textPrimary }]}>{currentDisplayName}</Text>

          <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Custom display name</Text>
          <TextInput
            value={nameInput}
            onChangeText={setNameInput}
            maxLength={MAX_NAME_LENGTH}
            placeholder="Enter the name you want to show"
            placeholderTextColor={theme.textMuted}
            autoCapitalize="words"
            autoCorrect={false}
            editable={!saving}
            style={[
              styles.input,
              {
                backgroundColor: theme.surfaceMuted,
                borderColor: theme.borderSoft,
                color: theme.textPrimary,
              },
            ]}
          />

          <View style={styles.nameActionRow}>
            <Pressable
              onPress={saveDisplayName}
              disabled={saving}
              style={({ pressed }) => [
                styles.primaryButton,
                styles.nameActionPrimary,
                { backgroundColor: theme.primary },
                pressed ? styles.buttonPressed : null,
                saving ? styles.buttonDisabled : null,
              ]}
            >
              <Text style={[styles.primaryButtonText, { color: theme.primaryText }]}>
                {saving ? 'Saving...' : 'Save name'}
              </Text>
            </Pressable>

            {resetButtonNode}
          </View>
        </View>

        <View
          style={[
            styles.card,
            {
              backgroundColor: theme.surface,
              borderColor: theme.border,
            },
          ]}
        >
          <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>Appearance</Text>
          <View style={styles.themeControl}>
            <Pressable
              onPress={() => setThemeMode('light')}
              style={({ pressed }) => [
                styles.themeOption,
                {
                  backgroundColor: themeMode === 'light' ? '#FFFFFF' : theme.surfaceMuted,
                  borderColor: themeMode === 'light' ? theme.primary : theme.borderSoft,
                },
                pressed ? styles.buttonPressed : null,
              ]}
            >
              <Text
                style={[
                  styles.themeOptionTitle,
                  {
                    color: themeMode === 'light' ? theme.textPrimary : theme.textSecondary,
                  },
                ]}
              >
                Day mode
              </Text>
              <Text style={[styles.themeOptionSubtitle, { color: theme.textMuted }]}>
                Bright background and lighter surfaces
              </Text>
            </Pressable>

            <Pressable
              onPress={() => setThemeMode('dark')}
              style={({ pressed }) => [
                styles.themeOption,
                {
                  backgroundColor: themeMode === 'dark' ? theme.heroBg : theme.surfaceMuted,
                  borderColor: themeMode === 'dark' ? theme.primary : theme.borderSoft,
                },
                pressed ? styles.buttonPressed : null,
              ]}
            >
              <Text
                style={[
                  styles.themeOptionTitle,
                  {
                    color: themeMode === 'dark' ? theme.textOnDark : theme.textSecondary,
                  },
                ]}
              >
                Dark mode
              </Text>
              <Text style={[styles.themeOptionSubtitle, { color: theme.textMuted }]}>
                Darker app chrome with softer contrast
              </Text>
            </Pressable>
          </View>
        </View>

        <View
          style={[
            styles.dangerCard,
            {
              backgroundColor: theme.surfaceDanger,
              borderColor: theme.borderDanger,
            },
          ]}
        >
          <Pressable
            onPress={() => signOut()}
            style={({ pressed }) => [
              styles.signOutButton,
              {
                backgroundColor: theme.surface,
                borderColor: theme.dangerBorder,
              },
              pressed ? styles.buttonPressed : null,
            ]}
          >
            <Text style={[styles.signOutButtonText, { color: theme.dangerText }]}>Sign out</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#F7F4EE',
  },
  container: {
    paddingHorizontal: 20,
    paddingTop: 14,
    gap: 18,
    paddingBottom: 30,
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCard: {
    borderRadius: 28,
    backgroundColor: '#182033',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    paddingHorizontal: 22,
    paddingTop: 18,
    paddingBottom: 24,
    gap: 12,
    overflow: 'hidden',
    position: 'relative',
    shadowColor: '#0f172a',
    shadowOpacity: 0.14,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 12 },
    elevation: 4,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  headerEyebrow: {
    fontSize: 12,
    fontWeight: '800',
    color: '#D6DDE9',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  avatarHeroWrap: {
    alignItems: 'center',
    marginTop: 8,
  },
  avatarHeroRing: {
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
    shadowColor: '#0f172a',
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
  },
  card: {
    borderWidth: 1,
    borderColor: '#E7E0D4',
    borderRadius: 24,
    backgroundColor: '#FFFDF8',
    padding: 18,
    gap: 12,
    shadowColor: '#111827',
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },
  avatarWrap: {
    width: 118,
    height: 118,
    borderRadius: 59,
    overflow: 'hidden',
    backgroundColor: '#f3f4f6',
    alignSelf: 'center',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#7c3aed',
  },
  avatarFallbackText: {
    fontSize: 44,
    fontWeight: '800',
    color: '#ffffff',
  },
  headerName: {
    marginTop: 10,
    fontSize: 34,
    fontWeight: '800',
    color: '#ffffff',
    textAlign: 'center',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#BFC9D9',
    textAlign: 'center',
  },
  headerButtonColumn: {
    marginTop: 12,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 10,
  },
  headerPrimaryButton: {
    borderRadius: 999,
    backgroundColor: '#4F7DFF',
    paddingVertical: 12,
    paddingHorizontal: 18,
    alignItems: 'center',
    minWidth: 150,
  },
  headerPrimaryButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  headerSecondaryButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    backgroundColor: 'rgba(255,255,255,0.06)',
    paddingVertical: 12,
    paddingHorizontal: 18,
    alignItems: 'center',
    minWidth: 150,
  },
  headerSecondaryButtonText: {
    color: '#E8EEF7',
    fontSize: 14,
    fontWeight: '700',
  },
  themeControl: {
    gap: 10,
  },
  themeOption: {
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 4,
  },
  themeOptionTitle: {
    fontSize: 15,
    fontWeight: '800',
  },
  themeOptionSubtitle: {
    fontSize: 12,
    lineHeight: 17,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.7,
  },
  currentName: {
    fontSize: 24,
    fontWeight: '800',
    color: '#111827',
  },
  inputLabel: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: '700',
    color: '#4B5563',
  },
  input: {
    borderWidth: 1,
    borderColor: '#DDD8CD',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: '#111827',
    backgroundColor: '#FCFAF5',
  },
  nameActionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  nameActionPrimary: {
    flex: 1,
  },
  primaryButton: {
    marginTop: 4,
    borderRadius: 16,
    backgroundColor: '#4F7DFF',
    paddingVertical: 12,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  secondaryButton: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#DDD8CD',
    backgroundColor: '#ffffff',
    paddingVertical: 12,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: '#354052',
    fontSize: 14,
    fontWeight: '700',
  },
  dangerCard: {
    borderRadius: 24,
    backgroundColor: '#FFF8F7',
    borderWidth: 1,
    borderColor: '#EBD9D5',
    padding: 18,
  },
  signOutButton: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E3C8C4',
    backgroundColor: '#FFFFFF',
    paddingVertical: 13,
    alignItems: 'center',
  },
  signOutButtonText: {
    color: '#C8423A',
    fontSize: 16,
    fontWeight: '700',
  },
  buttonPressed: {
    opacity: 0.75,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});
