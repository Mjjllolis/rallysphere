// app/(tabs)/profile.tsx
import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, Alert, TouchableOpacity, Dimensions, Image, Animated } from 'react-native';
import { Text, IconButton } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { BlurView } from 'expo-blur';
import Svg, { Defs, RadialGradient, Stop, Rect } from 'react-native-svg';
import { useAuth } from '../_layout';
import { getUserProfile, updateUserProfile, uploadImage, getUserRallyCredits, getClubs } from '../../lib/firebase';
import type { UserProfile, UserRallyCredits, Club } from '../../lib/firebase';
import SettingsScreen from '../../components/SettingsScreen';
import GlassMemoryCard from '../../components/GlassMemoryCard';
import EditProfileScreen from '../../components/EditProfileScreen';
import { LinearGradient } from 'expo-linear-gradient';

const SCREEN_WIDTH = Dimensions.get('window').width;

// Mock data for memories - will be replaced with real data from Firebase
const MOCK_MEMORIES: any[] = [];

export default function ProfilePage() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [editProfileVisible, setEditProfileVisible] = useState(false);
  const [backgroundColors, setBackgroundColors] = useState<string[]>(['#6366f1', '#8b5cf6', '#d946ef']);
  const scrollY = useRef(new Animated.Value(0)).current;
  const [rallyCredits, setRallyCredits] = useState<UserRallyCredits | null>(null);
  const [userClubs, setUserClubs] = useState<Club[]>([]);

  useEffect(() => {
    if (user) {
      loadProfile();
      loadRallyCredits();
      loadUserClubs();
    }
  }, [user]);

  const loadProfile = async () => {
    if (!user) return;

    const userProfile = await getUserProfile(user.uid);
    setProfile(userProfile);
  };

  const loadRallyCredits = async () => {
    if (!user) return;

    const result = await getUserRallyCredits(user.uid);
    if (result.success && result.credits) {
      setRallyCredits(result.credits);
    }
  };

  const loadUserClubs = async () => {
    if (!user) return;

    const result = await getClubs();
    if (result.success) {
      // Filter clubs where user is a member or admin
      const clubs = result.clubs.filter(club =>
        club.members.includes(user.uid) || club.admins.includes(user.uid)
      );
      setUserClubs(clubs);
    }
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

  const handleMemoryPress = (memoryId: string) => {
    // TODO: Navigate to memory detail page
    Alert.alert('Memory', `View memory ${memoryId}`);
  };

  const handleMemoryLike = (memoryId: string) => {
    // TODO: Implement like functionality
    console.log('Like memory:', memoryId);
  };

  if (!user) {
    return (
      <View style={styles.container}>
        {/* Black Background */}
        <View style={StyleSheet.absoluteFill}>
          <View style={styles.blackBackground} />
        </View>

        {/* Subtle Radial Gradient Overlay */}
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
            <Defs>
              <RadialGradient id="loginGradient" cx="50%" cy="40%">
                <Stop offset="0%" stopColor="#6366f1" stopOpacity="0.25" />
                <Stop offset="30%" stopColor="#8b5cf6" stopOpacity="0.15" />
                <Stop offset="60%" stopColor="#d946ef" stopOpacity="0.08" />
                <Stop offset="100%" stopColor="#000000" stopOpacity="0" />
              </RadialGradient>
            </Defs>
            <Rect x="0" y="0" width="100%" height="100%" fill="url(#loginGradient)" />
          </Svg>
        </View>

        <SafeAreaView style={styles.safeArea} edges={['top']}>
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateTitle}>Please log in to view profile</Text>
            <TouchableOpacity
              style={styles.loginButton}
              onPress={() => router.push('/(auth)/login')}
            >
              <BlurView intensity={60} tint="light" style={styles.loginButtonBlur}>
                <Text style={styles.loginButtonText}>Sign In</Text>
              </BlurView>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  // Parallax transform for background image
  const backgroundTranslateY = scrollY.interpolate({
    inputRange: [0, 300],
    outputRange: [0, -100], // Slower scroll for depth effect
    extrapolate: 'clamp',
  });

  return (
    <View style={styles.container}>
      {/* Black Background */}
      <View style={StyleSheet.absoluteFill}>
        <View style={styles.blackBackground} />
      </View>

      {/* Background Image - Upper Third Only with Parallax */}
      {profile?.backgroundImage && (
        <Animated.View
          style={[
            styles.backgroundImageContainer,
            { transform: [{ translateY: backgroundTranslateY }] }
          ]}
          pointerEvents="none"
        >
          <Image
            source={{ uri: profile.backgroundImage }}
            style={styles.backgroundImage}
            resizeMode="cover"
          />
          {/* Dark Overlay for Readability */}
          <View style={[styles.backgroundOverlay]} />
          {/* Fade to Black */}
          <LinearGradient
            colors={['rgba(0,0,0,0)', 'rgba(0,0,0,1)']}
            locations={[0.7, 1]}
            style={styles.backgroundFade}
            pointerEvents="none"
          />
        </Animated.View>
      )}

      {/* Subtle Radial Gradient Overlay */}
      {!profile?.backgroundImage && (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
            <Defs>
              <RadialGradient id="profileGradient" cx="50%" cy="20%">
                <Stop offset="0%" stopColor={backgroundColors[0]} stopOpacity="0.25" />
                <Stop offset="30%" stopColor={backgroundColors[1]} stopOpacity="0.15" />
                <Stop offset="60%" stopColor={backgroundColors[2]} stopOpacity="0.08" />
                <Stop offset="100%" stopColor="#000000" stopOpacity="0" />
              </RadialGradient>
            </Defs>
            <Rect x="0" y="0" width="100%" height="100%" fill="url(#profileGradient)" />
          </Svg>
        </View>
      )}

      <SafeAreaView style={styles.safeArea} edges={['top']}>
        {/* Header with Settings Button */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Profile</Text>
          <TouchableOpacity
            style={styles.settingsButton}
            onPress={() => setSettingsVisible(true)}
          >
            <BlurView intensity={40} tint="dark" style={styles.settingsButtonBlur}>
              <IconButton icon="menu" size={24} iconColor="white" />
            </BlurView>
          </TouchableOpacity>
        </View>

        <Animated.ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          onScroll={Animated.event(
            [{ nativeEvent: { contentOffset: { y: scrollY } } }],
            { useNativeDriver: true }
          )}
          scrollEventThrottle={16}
        >
          {/* Profile Header */}
          <View style={styles.profileHeader}>
            {/* Avatar */}
            <TouchableOpacity
              style={styles.avatarContainer}
              onPress={pickProfileImage}
              disabled={uploadingImage}
            >
              {profile?.avatar || user.photoURL ? (
                <Image
                  source={{ uri: profile?.avatar || user.photoURL || undefined }}
                  style={styles.avatarImage}
                />
              ) : (
                <View style={styles.avatarPlaceholder}>
                  <Text style={styles.avatarText}>
                    {user.displayName ? user.displayName.charAt(0).toUpperCase() : 'U'}
                  </Text>
                </View>
              )}
            </TouchableOpacity>

            {/* User Info */}
            <View style={styles.userInfo}>
              <Text style={styles.userName}>
                {user.displayName || `${profile?.firstName} ${profile?.lastName}` || 'User'}
              </Text>
              {profile?.bio && (
                <Text style={styles.userBio}>{profile.bio}</Text>
              )}

              {/* User Details */}
              <View style={styles.detailsRow}>
                {profile?.university && (
                  <Text style={styles.detailText}>
                    🏫 {profile.university}
                  </Text>
                )}
                {profile?.location && (
                  <Text style={styles.detailText}>
                    📍 {profile.location}
                  </Text>
                )}
                {profile?.instagram && (
                  <TouchableOpacity
                    onPress={() => {
                      const instagramUrl = `https://instagram.com/${profile.instagram}`;
                      router.push(instagramUrl as any);
                    }}
                    style={styles.instagramLink}
                  >
                    <IconButton
                      icon="instagram"
                      size={18}
                      iconColor="white"
                      style={styles.instagramIcon}
                    />
                    <Text style={styles.detailText}>@{profile.instagram}</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {/* Edit Profile Button */}
            <TouchableOpacity
              style={styles.editProfileButton}
              onPress={() => setEditProfileVisible(true)}
            >
              <BlurView intensity={40} tint="dark" style={styles.editProfileBlur}>
                <IconButton icon="pencil" size={18} iconColor="white" style={{ margin: 0 }} />
                <Text style={styles.editProfileText}>Edit Profile</Text>
              </BlurView>
            </TouchableOpacity>
          </View>

          {/* Memories Section */}
          <View style={styles.memoriesSection}>
            <View style={styles.memoriesHeader}>
              <Text style={styles.sectionTitle}>Memories</Text>
              <Text style={styles.memoriesCount}>{MOCK_MEMORIES.length} posts</Text>
            </View>

            {/* Memories Grid */}
            <View style={styles.memoriesGrid}>
              {MOCK_MEMORIES.map((memory, index) => (
                <GlassMemoryCard
                  key={memory.id}
                  imageUri={memory.imageUri}
                  title={memory.title}
                  eventName={memory.eventName}
                  date={memory.date}
                  likes={memory.likes}
                  comments={memory.comments}
                  isLiked={memory.isLiked}
                  onPress={() => handleMemoryPress(memory.id)}
                  onLike={() => handleMemoryLike(memory.id)}
                />
              ))}
            </View>
          </View>
        </Animated.ScrollView>
      </SafeAreaView>

      {/* Settings Screen */}
      <SettingsScreen
        visible={settingsVisible}
        onClose={() => setSettingsVisible(false)}
      />

      {/* Edit Profile Screen */}
      <EditProfileScreen
        visible={editProfileVisible}
        onClose={() => setEditProfileVisible(false)}
        onProfileUpdate={loadProfile}
      />
    </View>
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
  backgroundImageContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '40%', // Upper third plus fade area
    overflow: 'hidden',
    zIndex: 0,
  },
  backgroundImage: {
    width: '100%',
    height: '100%',
  },
  backgroundOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  backgroundFade: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '50%',
  },
  safeArea: {
    flex: 1,
    zIndex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: 'white',
  },
  settingsButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    overflow: 'hidden',
  },
  settingsButtonBlur: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 20,
    overflow: 'hidden',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyStateTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: 'white',
    marginBottom: 24,
    textAlign: 'center',
  },
  loginButton: {
    borderRadius: 16,
    overflow: 'hidden',
    minWidth: 150,
  },
  loginButtonBlur: {
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    alignItems: 'center',
  },
  loginButtonText: {
    fontSize: 17,
    fontWeight: '700',
    color: 'white',
  },
  profileHeader: {
    alignItems: 'center',
    paddingTop: 20,
    paddingBottom: 32,
    paddingHorizontal: 20,
    position: 'relative',
    zIndex: 50,
    elevation: 50,
  },
  avatarContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    overflow: 'hidden',
    marginBottom: 20,
    zIndex: 100,
    elevation: 100,
    position: 'relative',
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
  },
  avatarText: {
    fontSize: 48,
    fontWeight: '700',
    color: 'white',
  },
  userInfo: {
    alignItems: 'center',
    marginBottom: 20,
    zIndex: 90,
    elevation: 90,
    position: 'relative',
  },
  userNameContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  userNameContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  userName: {
    fontWeight: 'bold',
  },
  userProChip: {
    backgroundColor: '#FFD700',
    height: 24,
  },
  userProChipText: {
    color: '#000',
    fontWeight: 'bold',
    fontSize: 11,
  },
  userEmail: {
    fontSize: 24,
    fontWeight: '700',
    color: 'white',
    marginBottom: 8,
    textAlign: 'center',
  },
  userBio: {
    fontSize: 15,
    color: 'rgba(255, 255, 255, 0.8)',
    textAlign: 'center',
    marginBottom: 12,
    lineHeight: 20,
  },
  detailsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 12,
  },
  detailText: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.7)',
  },
  editProfileButton: {
    borderRadius: 16,
    overflow: 'visible',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 95,
    zIndex: 95,
    position: 'relative',
  },
  editProfileBlur: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 20,
    paddingLeft: 14,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.25)',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    overflow: 'hidden',
  },
  editProfileText: {
    fontSize: 15,
    fontWeight: '600',
    color: 'white',
    marginLeft: 4,
  },
  instagramLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  instagramIcon: {
    margin: 0,
    padding: 0,
  },
  memoriesSection: {
    flex: 1,
    paddingHorizontal: 20,
  },
  memoriesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: 'white',
  },
  memoriesCount: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.6)',
  },
  memoriesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  rallyCreditsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  rallyCreditsIcon: {
    marginRight: 8,
  },
  creditsStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingTop: 8,
  },
  creditsStat: {
    alignItems: 'center',
  },
});
