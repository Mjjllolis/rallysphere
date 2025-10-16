// app/(tabs)/profile.tsx
import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, Alert, Image } from 'react-native';
import { 
  Text, 
  Button, 
  Card,
  Avatar,
  Divider,
  List,
  Switch,
  useTheme,
  IconButton,
  Chip
} from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useAuth, useThemeToggle } from '../_layout';
import { logout, getUserProfile, updateUserProfile, uploadImage } from '../../lib/firebase';
import type { UserProfile } from '../../lib/firebase';
import { ThemeToggle } from '../../components/ThemeToggle';

export default function ProfilePage() {
  const theme = useTheme();
  const { user } = useAuth();
  const { isDark, toggleTheme } = useThemeToggle();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);

  useEffect(() => {
    if (user) {
      loadProfile();
    }
  }, [user]);

  const loadProfile = async () => {
    if (!user) return;
    
    const userProfile = await getUserProfile(user.uid);
    setProfile(userProfile);
  };

  const handleSignOut = async () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Sign Out', 
          style: 'destructive',
          onPress: async () => {
            setLoading(true);
            try {
              const result = await logout();
              if (result.success) {
                router.replace('/(auth)/welcome-simple');
              } else {
                Alert.alert('Error', 'Failed to sign out');
              }
            } catch (error) {
              console.error('Sign out error:', error);
              Alert.alert('Error', 'An unexpected error occurred');
            } finally {
              setLoading(false);
            }
          }
        }
      ]
    );
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
        
        if (imageUrl && profile) {
          const updatedProfile = { ...profile, avatar: imageUrl };
          const updateResult = await updateUserProfile(user.uid, updatedProfile);
          
          if (updateResult.success) {
            setProfile(updatedProfile);
            Alert.alert('Success', 'Profile picture updated!');
          } else {
            Alert.alert('Error', 'Failed to update profile picture');
          }
        }
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to update profile picture');
    } finally {
      setUploadingImage(false);
    }
  };

  if (!user) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
        <View style={styles.emptyState}>
          <Text variant="headlineSmall">Please log in to view profile</Text>
          <Button 
            mode="contained" 
            onPress={() => router.push('/(auth)/login')}
            style={styles.loginButton}
          >
            Sign In
          </Button>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Profile Header */}
        <Card style={styles.profileCard}>
          <Card.Content style={styles.profileContent}>
            <View style={styles.avatarSection}>
              <View style={styles.avatarContainer}>
                {profile?.avatar || user.photoURL ? (
                  <Avatar.Image 
                    size={80} 
                    source={{ uri: profile?.avatar || user.photoURL || undefined }} 
                  />
                ) : (
                  <Avatar.Text 
                    size={80} 
                    label={user.displayName ? user.displayName.charAt(0).toUpperCase() : 'U'} 
                  />
                )}
                <IconButton
                  icon="camera"
                  mode="contained"
                  size={20}
                  onPress={pickProfileImage}
                  loading={uploadingImage}
                  style={styles.cameraButton}
                />
              </View>
              
              <View style={styles.userInfo}>
                <Text variant="headlineSmall" style={styles.userName}>
                  {user.displayName || `${profile?.firstName} ${profile?.lastName}` || 'User'}
                </Text>
                <Text variant="bodyMedium" style={[styles.userEmail, { color: theme.colors.onSurfaceVariant }]}>
                  {user.email}
                </Text>
                
                {profile?.bio && (
                  <Text variant="bodyMedium" style={styles.userBio}>
                    {profile.bio}
                  </Text>
                )}
              </View>
            </View>

            {/* User Details */}
            {(profile?.university || profile?.location) && (
              <View style={styles.detailsSection}>
                {profile.university && (
                  <View style={styles.detailRow}>
                    <Text variant="bodyMedium" style={[styles.detailText, { color: theme.colors.onSurfaceVariant }]}>
                      🏫 {profile.university}
                      {profile.year && ` • ${profile.year}`}
                      {profile.major && ` • ${profile.major}`}
                    </Text>
                  </View>
                )}
                {profile.location && (
                  <View style={styles.detailRow}>
                    <Text variant="bodyMedium" style={[styles.detailText, { color: theme.colors.onSurfaceVariant }]}>
                      📍 {profile.location}
                    </Text>
                  </View>
                )}
              </View>
            )}

            {/* Interests */}
            {profile?.interests && profile.interests.length > 0 && (
              <>
                <Divider style={styles.divider} />
                <View style={styles.interestsSection}>
                  <Text variant="titleMedium" style={styles.sectionTitle}>
                    Interests
                  </Text>
                  <View style={styles.interestsContainer}>
                    {profile.interests.map((interest) => (
                      <Chip key={interest} style={styles.interestChip}>
                        {interest}
                      </Chip>
                    ))}
                  </View>
                </View>
              </>
            )}

            <Button
              mode="outlined"
              onPress={() => router.push('/profile/edit')}
              style={styles.editButton}
              icon="pencil"
            >
              Edit Profile
            </Button>
          </Card.Content>
        </Card>

        {/* Settings Section */}
        <Card style={styles.settingsCard}>
          <Card.Content style={styles.settingsContent}>
            <Text variant="titleLarge" style={styles.settingsTitle}>
              Settings
            </Text>

            <List.Item
              title="Dark Mode"
              description="Toggle between light and dark theme"
              left={props => <List.Icon {...props} icon="theme-light-dark" />}
              right={() => (
                <Switch
                  value={isDark}
                  onValueChange={toggleTheme}
                />
              )}
            />

            <Divider />

            <List.Item
              title="Notifications"
              description="Manage your notification preferences"
              left={props => <List.Icon {...props} icon="bell" />}
              right={props => <List.Icon {...props} icon="chevron-right" />}
              onPress={() => Alert.alert('Coming Soon', 'Notification settings will be available soon!')}
            />

            <List.Item
              title="Privacy"
              description="Control your privacy settings"
              left={props => <List.Icon {...props} icon="shield-account" />}
              right={props => <List.Icon {...props} icon="chevron-right" />}
              onPress={() => Alert.alert('Coming Soon', 'Privacy settings will be available soon!')}
            />

            <List.Item
              title="Help & Support"
              description="Get help and contact support"
              left={props => <List.Icon {...props} icon="help-circle" />}
              right={props => <List.Icon {...props} icon="chevron-right" />}
              onPress={() => Alert.alert('Coming Soon', 'Help & support will be available soon!')}
            />

            <Divider />

            <List.Item
              title="About"
              description="App version and information"
              left={props => <List.Icon {...props} icon="information" />}
              right={props => <List.Icon {...props} icon="chevron-right" />}
              onPress={() => Alert.alert('RallySphere', 'Version 1.0.0\n\nBuilt with React Native and Firebase')}
            />
          </Card.Content>
        </Card>

        {/* Legal Section */}
        <Card style={styles.settingsCard}>
          <Card.Content style={styles.settingsContent}>
            <Text variant="titleLarge" style={styles.settingsTitle}>
              Legal
            </Text>

            <List.Item
              title="Terms and Conditions"
              description="Review our terms of service"
              left={props => <List.Icon {...props} icon="file-document-outline" />}
              right={props => <List.Icon {...props} icon="chevron-right" />}
              onPress={() => router.push('/legal/terms')}
            />

            <Divider />

            <List.Item
              title="Privacy Policy"
              description="How we handle your data"
              left={props => <List.Icon {...props} icon="shield-lock-outline" />}
              right={props => <List.Icon {...props} icon="chevron-right" />}
              onPress={() => router.push('/legal/privacy')}
            />

            <Divider />

            <List.Item
              title="Cookie Policy"
              description="Our use of cookies and tracking"
              left={props => <List.Icon {...props} icon="cookie-outline" />}
              right={props => <List.Icon {...props} icon="chevron-right" />}
              onPress={() => router.push('/legal/cookies')}
            />
          </Card.Content>
        </Card>

        {/* Sign Out Button */}
        <Card style={styles.signOutCard}>
          <Card.Content style={styles.signOutContent}>
            <Button
              mode="contained"
              onPress={handleSignOut}
              loading={loading}
              disabled={loading}
              buttonColor={theme.colors.error}
              textColor={theme.colors.onError}
              icon="logout"
            >
              Sign Out
            </Button>
          </Card.Content>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loginButton: {
    marginTop: 16,
  },
  profileCard: {
    margin: 16,
    marginBottom: 8,
  },
  profileContent: {
    padding: 20,
  },
  avatarSection: {
    alignItems: 'center',
    marginBottom: 16,
  },
  avatarContainer: {
    position: 'relative',
    marginBottom: 12,
  },
  cameraButton: {
    position: 'absolute',
    bottom: -5,
    right: -5,
  },
  userInfo: {
    alignItems: 'center',
  },
  userName: {
    fontWeight: 'bold',
    marginBottom: 4,
  },
  userEmail: {
    marginBottom: 8,
  },
  userBio: {
    textAlign: 'center',
    fontStyle: 'italic',
  },
  detailsSection: {
    marginBottom: 16,
  },
  detailRow: {
    marginBottom: 4,
  },
  detailText: {
    textAlign: 'center',
  },
  divider: {
    marginVertical: 16,
  },
  interestsSection: {
    marginBottom: 16,
  },
  sectionTitle: {
    marginBottom: 8,
    fontWeight: 'bold',
  },
  interestsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  interestChip: {
    margin: 4,
  },
  editButton: {
    marginTop: 8,
  },
  settingsCard: {
    margin: 16,
    marginTop: 8,
    marginBottom: 8,
  },
  settingsContent: {
    padding: 16,
  },
  settingsTitle: {
    fontWeight: 'bold',
    marginBottom: 8,
  },
  signOutCard: {
    margin: 16,
    marginTop: 8,
    marginBottom: 32,
  },
  signOutContent: {
    padding: 16,
  },
});
