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
} from 'react-native';
import { Text, IconButton } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../app/_layout';
import { getUserProfile, updateUserProfile, uploadImage } from '../lib/firebase';
import type { UserProfile } from '../lib/firebase';
import GlassInput from './GlassInput';
import GlassButton from './GlassButton';

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

  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    bio: '',
    instagram: '',
    avatar: '',
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
        backgroundImage: userProfile.backgroundImage || '',
      });
    }
  };

  const updateFormData = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
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
          setFormData(prev => ({ ...prev, avatar: imageUrl }));
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
          {/* Black Background */}
          <View style={StyleSheet.absoluteFill}>
            <View style={styles.blackBackground} />
          </View>

          {/* Subtle Gradient Overlay */}
          <LinearGradient
            colors={[
              `rgba(${parseInt(backgroundColors[0].slice(1, 3), 16)}, ${parseInt(backgroundColors[0].slice(3, 5), 16)}, ${parseInt(backgroundColors[0].slice(5, 7), 16)}, 0.25)`,
              `rgba(${parseInt(backgroundColors[1].slice(1, 3), 16)}, ${parseInt(backgroundColors[1].slice(3, 5), 16)}, ${parseInt(backgroundColors[1].slice(5, 7), 16)}, 0.15)`,
              `rgba(${parseInt(backgroundColors[2].slice(1, 3), 16)}, ${parseInt(backgroundColors[2].slice(3, 5), 16)}, ${parseInt(backgroundColors[2].slice(5, 7), 16)}, 0.08)`,
              'rgba(0, 0, 0, 0)'
            ]}
            locations={[0, 0.3, 0.6, 1]}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />

          <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFill} />

          <SafeAreaView style={styles.safeArea} edges={['top']}>
            {/* Header */}
            <View style={styles.header}>
              <View style={styles.dragHandle} />

              <View style={styles.headerContent}>
                <TouchableOpacity style={styles.closeButton} onPress={onClose}>
                  <BlurView intensity={40} tint="dark" style={styles.closeButtonBlur}>
                    <IconButton icon="close" size={24} iconColor="white" />
                  </BlurView>
                </TouchableOpacity>

                <Text style={styles.headerTitle}>Edit Profile</Text>

                <TouchableOpacity style={styles.backgroundButton} onPress={pickBackgroundImage} disabled={loading}>
                  <BlurView intensity={40} tint="dark" style={styles.backgroundButtonBlur}>
                    <IconButton icon="image" size={20} iconColor="white" />
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
                <TouchableOpacity
                  style={styles.avatarContainer}
                  onPress={pickProfileImage}
                  disabled={uploadingImage}
                >
                  {formData.avatar ? (
                    <Image source={{ uri: formData.avatar }} style={styles.avatarImage} />
                  ) : (
                    <View style={styles.avatarPlaceholder}>
                      <Text style={styles.avatarText}>
                        {user?.displayName ? user.displayName.charAt(0).toUpperCase() : 'U'}
                      </Text>
                    </View>
                  )}
                  {uploadingImage && (
                    <View style={styles.uploadingOverlay}>
                      <Text style={styles.uploadingText}>Uploading...</Text>
                    </View>
                  )}
                </TouchableOpacity>

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
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  blackBackground: {
    flex: 1,
    backgroundColor: '#000000',
  },
  safeArea: {
    flex: 1,
  },
  header: {
    paddingTop: 8,
    paddingBottom: 16,
  },
  dragHandle: {
    width: 36,
    height: 5,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 3,
    alignSelf: 'center',
    marginBottom: 16,
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
    width: 40,
    height: 40,
    borderRadius: 20,
    overflow: 'hidden',
  },
  backgroundButtonBlur: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 20,
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
    alignSelf: 'center',
    marginBottom: 32,
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
  formContainer: {
    flex: 1,
  },
});
