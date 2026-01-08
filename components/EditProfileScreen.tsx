// components/EditProfileScreen.tsx
import React, { useState, useEffect } from 'react';
import {
  View,
  Modal,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
  Alert,
  Keyboard,
  TouchableWithoutFeedback,
  KeyboardAvoidingView,
  Platform,
  ActionSheetIOS,
} from 'react-native';
import { Text, IconButton, Menu } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../app/_layout';
import { getUserProfile, updateUserProfile, uploadImage } from '../lib/firebase';
import type { UserProfile } from '../lib/firebase';
import GlassInput from './GlassInput';
import GlassButton from './GlassButton';
import EmojiPickerModal from './EmojiPickerModal';

interface EditProfileScreenProps {
  visible: boolean;
  onClose: () => void;
  onProfileUpdate?: () => void;
}

export default function EditProfileScreen({ visible, onClose, onProfileUpdate }: EditProfileScreenProps) {
  const { user } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [backgroundColors] = useState<string[]>(['#6366f1', '#8b5cf6', '#d946ef']);
  const [emojiPickerVisible, setEmojiPickerVisible] = useState(false);
  const [pictureMenuVisible, setPictureMenuVisible] = useState(false);

  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    bio: '',
    instagram: '',
    avatar: '',
    profileEmoji: '',
    backgroundImage: '',
  });

  useEffect(() => {
    if (visible && user) {
      loadProfile();
    }
  }, [visible, user]);

  const loadProfile = async () => {
    if (!user) return;
    const userProfile = await getUserProfile(user.uid);
    if (userProfile) {
      setProfile(userProfile);
      setFormData({
        firstName: userProfile.firstName || '',
        lastName: userProfile.lastName || '',
        bio: userProfile.bio || '',
        instagram: userProfile.instagram || '',
        avatar: userProfile.avatar || user.photoURL || '',
        profileEmoji: userProfile.profileEmoji || '',
        backgroundImage: userProfile.backgroundImage || '',
      });
    }
  };

  const updateFormData = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const showProfilePictureOptions = () => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ['Cancel', 'Remove Picture', 'Use Emoji', 'Use Photo'],
          destructiveButtonIndex: 1,
          cancelButtonIndex: 0,
        },
        (buttonIndex) => {
          if (buttonIndex === 1) {
            handleRemovePicture();
          } else if (buttonIndex === 2) {
            setEmojiPickerVisible(true);
          } else if (buttonIndex === 3) {
            pickProfileImage();
          }
        }
      );
    } else {
      setPictureMenuVisible(true);
    }
  };

  const handleRemovePicture = () => {
    setFormData(prev => ({ ...prev, avatar: '', profileEmoji: '' }));
  };

  const handleSelectEmoji = (emoji: string) => {
    setFormData(prev => ({ ...prev, avatar: '', profileEmoji: emoji }));
  };

  const pickProfileImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0] && user) {
        setUploadingImage(true);
        const imagePath = `users/avatars/${user.uid}_avatar.jpg`;
        const imageUrl = await uploadImage(result.assets[0].uri, imagePath);

        if (imageUrl) {
          setFormData(prev => ({ ...prev, avatar: imageUrl, profileEmoji: '' }));
        }
        setUploadingImage(false);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to upload profile picture');
      setUploadingImage(false);
    }
  };

  const pickBackgroundImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [16, 9],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0] && user) {
        setUploadingImage(true);
        const imagePath = `users/backgrounds/${user.uid}_background.jpg`;
        const imageUrl = await uploadImage(result.assets[0].uri, imagePath);

        if (imageUrl) {
          setFormData(prev => ({ ...prev, backgroundImage: imageUrl }));
        }
        setUploadingImage(false);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to upload background image');
      setUploadingImage(false);
    }
  };

  const handleSave = async () => {
    if (!user) return;

    setLoading(true);
    try {
      const updatedProfile: Partial<UserProfile> = {
        firstName: formData.firstName.trim(),
        lastName: formData.lastName.trim(),
        bio: formData.bio.trim(),
        instagram: formData.instagram.trim().replace('@', ''), // Remove @ if user added it
        avatar: formData.avatar,
        profileEmoji: formData.profileEmoji,
        backgroundImage: formData.backgroundImage,
      };

      const result = await updateUserProfile(user.uid, updatedProfile);

      if (result.success) {
        Alert.alert('Success', 'Profile updated successfully!', [
          {
            text: 'OK',
            onPress: () => {
              if (onProfileUpdate) onProfileUpdate();
              onClose();
            },
          },
        ]);
      } else {
        Alert.alert('Error', result.error || 'Failed to update profile');
      }
    } catch (error) {
      console.error('Update profile error:', error);
      Alert.alert('Error', 'An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={styles.container}>
          {/* Gray Gradient Background */}
          <LinearGradient
            colors={[
              '#1a1a1a',
              '#2a2a2a',
              '#1f1f1f',
              '#0a0a0a'
            ]}
            locations={[0, 0.3, 0.6, 1]}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />

          {/* Background Image - Upper portion only */}
          {formData.backgroundImage && (
            <TouchableOpacity
              style={styles.profileBackgroundPreview}
              onPress={pickBackgroundImage}
              activeOpacity={0.8}
            >
              <Image source={{ uri: formData.backgroundImage }} style={styles.profileBackgroundImage} />
              <LinearGradient
                colors={[
                  'rgba(26, 26, 26, 0)',
                  'rgba(26, 26, 26, 0)',
                  'rgba(28, 28, 28, 0.15)',
                  'rgba(31, 31, 31, 0.35)',
                  'rgba(36, 36, 36, 0.55)',
                  'rgba(42, 42, 42, 0.75)',
                  'rgba(31, 31, 31, 0.9)',
                  '#1f1f1f',
                ]}
                locations={[0, 0.25, 0.4, 0.5, 0.6, 0.75, 0.9, 1]}
                style={StyleSheet.absoluteFill}
                pointerEvents="none"
              />
            </TouchableOpacity>
          )}

          <SafeAreaView style={styles.safeArea} edges={['top']}>
            {/* Header */}
            <View style={styles.header}>
              <View style={styles.headerContent}>
                <TouchableOpacity style={styles.closeButton} onPress={onClose}>
                  <BlurView intensity={40} tint="dark" style={styles.closeButtonBlur}>
                    <IconButton icon="close" size={24} iconColor="white" />
                  </BlurView>
                </TouchableOpacity>

                <Text style={styles.headerTitle}>Edit Profile</Text>

                <TouchableOpacity style={styles.backgroundButton} onPress={pickBackgroundImage} disabled={loading}>
                  <BlurView intensity={40} tint="dark" style={styles.backgroundButtonBlur}>
                    <IconButton icon="image" size={16} iconColor="white" style={{ margin: 0 }} />
                    <Text style={styles.backgroundButtonText}>Change{'\n'}Background</Text>
                  </BlurView>
                </TouchableOpacity>
              </View>
            </View>

            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
              style={styles.keyboardAvoid}
            >
              <ScrollView
                style={styles.scrollView}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                {/* Profile Picture */}
                <View style={styles.avatarSection}>
                  <TouchableOpacity
                    style={styles.avatarContainer}
                    onPress={showProfilePictureOptions}
                    disabled={uploadingImage}
                  >
                    {formData.avatar ? (
                      <Image source={{ uri: formData.avatar }} style={styles.avatarImage} />
                    ) : formData.profileEmoji ? (
                      <View style={styles.avatarPlaceholder}>
                        <Text style={styles.emojiText}>{formData.profileEmoji}</Text>
                      </View>
                    ) : (
                      <View style={styles.avatarPlaceholder}>
                        <Text style={styles.avatarText}>
                          {formData.firstName && formData.lastName
                            ? `${formData.firstName.charAt(0).toUpperCase()}${formData.lastName.charAt(0).toUpperCase()}`
                            : user?.displayName
                              ? user.displayName.charAt(0).toUpperCase()
                              : 'U'}
                        </Text>
                      </View>
                    )}
                    {uploadingImage && (
                      <View style={styles.uploadingOverlay}>
                        <Text style={styles.uploadingText}>Uploading...</Text>
                      </View>
                    )}
                  </TouchableOpacity>

                  {/* Change Picture Link */}
                  <Menu
                    visible={pictureMenuVisible}
                    onDismiss={() => setPictureMenuVisible(false)}
                    anchor={
                      <TouchableOpacity
                        onPress={showProfilePictureOptions}
                        disabled={uploadingImage}
                        style={styles.changePictureLink}
                      >
                        <Text style={styles.changePictureLinkText}>Change Picture</Text>
                      </TouchableOpacity>
                    }
                  >
                    <Menu.Item
                      onPress={() => {
                        setPictureMenuVisible(false);
                        handleRemovePicture();
                      }}
                      title="Remove Picture"
                      leadingIcon="close-circle-outline"
                    />
                    <Menu.Item
                      onPress={() => {
                        setPictureMenuVisible(false);
                        setEmojiPickerVisible(true);
                      }}
                      title="Use Emoji"
                      leadingIcon="emoticon-outline"
                    />
                    <Menu.Item
                      onPress={() => {
                        setPictureMenuVisible(false);
                        pickProfileImage();
                      }}
                      title="Use Photo"
                      leadingIcon="camera-outline"
                    />
                  </Menu>
                </View>

                {/* Form Fields */}
                <View style={styles.formContainer}>
                  <GlassInput
                    label="First Name"
                    value={formData.firstName}
                    onChangeText={(value) => updateFormData('firstName', value)}
                    placeholder="Enter first name"
                  />

                  <GlassInput
                    label="Last Name"
                    value={formData.lastName}
                    onChangeText={(value) => updateFormData('lastName', value)}
                    placeholder="Enter last name"
                  />

                  <GlassInput
                    label="Bio"
                    value={formData.bio}
                    onChangeText={(value) => updateFormData('bio', value)}
                    placeholder="Tell us about yourself"
                    multiline
                    numberOfLines={3}
                    style={{ height: 80 }}
                  />

                  <GlassInput
                    label="Instagram"
                    value={formData.instagram}
                    onChangeText={(value) => updateFormData('instagram', value)}
                    placeholder="@username"
                    icon="instagram"
                  />
                </View>

                {/* Save Button */}
                <GlassButton
                  title="Save Changes"
                  onPress={handleSave}
                  loading={loading}
                  disabled={loading}
                  variant="primary"
                  isReady={true}
                />
              </ScrollView>
            </KeyboardAvoidingView>
          </SafeAreaView>
        </View>
      </TouchableWithoutFeedback>

      {/* Emoji Picker Modal */}
      <EmojiPickerModal
        visible={emojiPickerVisible}
        onClose={() => setEmojiPickerVisible(false)}
        onSelectEmoji={handleSelectEmoji}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  profileBackgroundPreview: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '35%',
    zIndex: 0,
  },
  profileBackgroundImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  safeArea: {
    flex: 1,
  },
  header: {
    paddingTop: 16,
    paddingBottom: 16,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    overflow: 'hidden',
  },
  closeButtonBlur: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 20,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: 'white',
  },
  backgroundButton: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  backgroundButtonBlur: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    gap: 4,
  },
  backgroundButtonText: {
    fontSize: 10,
    fontWeight: '600',
    color: 'white',
    textAlign: 'center',
    lineHeight: 12,
  },
  keyboardAvoid: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  avatarContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: 60,
  },
  avatarPlaceholder: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 60,
  },
  avatarText: {
    fontSize: 48,
    fontWeight: '700',
    color: 'white',
  },
  uploadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 60,
  },
  uploadingText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  emojiText: {
    fontSize: 56,
  },
  avatarSection: {
    alignItems: 'center',
    marginBottom: 24,
  },
  changePictureLink: {
    marginTop: 12,
  },
  changePictureLinkText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#60A5FA',
  },
  formContainer: {
    flex: 1,
  },
});
