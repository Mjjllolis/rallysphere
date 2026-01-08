// app/(tabs)/profile.tsx
import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, TouchableOpacity, Dimensions, Image, Animated } from 'react-native';
import { Text, IconButton } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { BlurView } from 'expo-blur';
import { useAuth } from '../_layout';
import { getUserProfile, getUserRallyCredits, getClubs, getAllEvents } from '../../lib/firebase';
import type { UserProfile, UserRallyCredits, Club, Event } from '../../lib/firebase';
import SettingsScreen from '../../components/SettingsScreen';
import EditProfileScreen from '../../components/EditProfileScreen';
import { LinearGradient } from 'expo-linear-gradient';

const SCREEN_WIDTH = Dimensions.get('window').width;
const SECTION_PADDING = 20;
const CLUB_COLUMNS = 4;
const CLUB_GAP = 12;
const CLUB_ITEM_WIDTH = (SCREEN_WIDTH - (SECTION_PADDING * 2) - (CLUB_GAP * (CLUB_COLUMNS - 1))) / CLUB_COLUMNS;

const EVENT_COLUMNS = 3;
const EVENT_GAP = 1;
const EVENT_ITEM_WIDTH = (SCREEN_WIDTH / EVENT_COLUMNS) - (EVENT_GAP * 2 / 3);

export default function ProfilePage() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [editProfileVisible, setEditProfileVisible] = useState(false);
  const [backgroundColors, setBackgroundColors] = useState<string[]>(['#6366f1', '#8b5cf6', '#d946ef']);
  const scrollY = useRef(new Animated.Value(0)).current;
  const [rallyCredits, setRallyCredits] = useState<UserRallyCredits | null>(null);
  const [userClubs, setUserClubs] = useState<Club[]>([]);
  const [pastEvents, setPastEvents] = useState<Event[]>([]);

  useEffect(() => {
    if (user) {
      loadProfile();
      loadRallyCredits();
      loadUserClubs();
      loadPastEvents();
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

  const loadPastEvents = async () => {
    if (!user) return;

    const result = await getAllEvents();
    if (result.success) {
      const now = new Date();
      // Filter events where user attended and event has ended
      const past = result.events.filter(event => {
        const endDate = event.endDate.toDate();
        return event.attendees.includes(user.uid) && endDate < now;
      });
      // Sort by most recent first
      past.sort((a, b) => b.endDate.toDate().getTime() - a.endDate.toDate().getTime());
      setPastEvents(past);
    }
  };

  const getUserClubRole = (club: Club): string => {
    if (!user) return 'Member';
    if (club.owner === user.uid || club.createdBy === user.uid) return 'Owner';
    if (club.admins.includes(user.uid)) return 'Admin';
    if (club.subscribers?.includes(user.uid)) return 'Subscriber';
    return 'Member';
  };

  if (!user) {
    return (
      <View style={styles.container}>
        {/* Black Background */}
        <View style={StyleSheet.absoluteFill}>
          <View style={styles.blackBackground} />
        </View>

        {/* Subtle Gradient Overlay */}
        <LinearGradient
          colors={['rgba(99, 102, 241, 0.25)', 'rgba(139, 92, 246, 0.15)', 'rgba(217, 70, 239, 0.08)', 'rgba(0, 0, 0, 0)']}
          locations={[0, 0.3, 0.6, 1]}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />

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

  // Subtle parallax effect for background image
  const backgroundTranslateY = scrollY.interpolate({
    inputRange: [0, 300],
    outputRange: [0, -50], // Gentle parallax - slower than scroll
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

      {/* Subtle Gradient Overlay */}
      {!profile?.backgroundImage && (
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
      )}

      {/* Floating Header - Outside SafeAreaView */}
      <SafeAreaView style={styles.floatingHeaderContainer} edges={['top']}>
        <View style={styles.floatingHeader}>
          <Text style={styles.floatingHeaderTitle}>Profile</Text>
          <TouchableOpacity
            style={styles.floatingSettingsButton}
            onPress={() => setSettingsVisible(true)}
          >
            <IconButton icon="menu" size={24} iconColor="white" />
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <Animated.ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          bounces={true}
          alwaysBounceVertical={true}
          onScroll={Animated.event(
            [{ nativeEvent: { contentOffset: { y: scrollY } } }],
            { useNativeDriver: true }
          )}
          scrollEventThrottle={16}
        >
          {/* Profile Header */}
          <View style={styles.profileHeader}>
            {/* Avatar */}
            <View style={styles.avatarContainer}>
              {profile?.avatar || user.photoURL ? (
                <Image
                  source={{ uri: profile?.avatar || user.photoURL || undefined }}
                  style={styles.avatarImage}
                />
              ) : profile?.profileEmoji ? (
                <View style={styles.avatarPlaceholder}>
                  <Text style={styles.emojiText}>{profile.profileEmoji}</Text>
                </View>
              ) : (
                <View style={styles.avatarPlaceholder}>
                  <Text style={styles.avatarText}>
                    {profile?.firstName && profile?.lastName
                      ? `${profile.firstName.charAt(0).toUpperCase()}${profile.lastName.charAt(0).toUpperCase()}`
                      : user.displayName
                        ? user.displayName.charAt(0).toUpperCase()
                        : 'U'}
                  </Text>
                </View>
              )}
            </View>

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

          {/* My Clubs Section */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>My Clubs</Text>
              <Text style={styles.sectionCount}>{userClubs.length} clubs</Text>
            </View>

            {userClubs.length === 0 ? (
              <View style={styles.emptySection}>
                <Text style={styles.emptySectionText}>You haven't joined any clubs yet</Text>
              </View>
            ) : (
              <View style={styles.clubCirclesContainer}>
                {userClubs.map((club) => (
                  <TouchableOpacity
                    key={club.id}
                    style={styles.clubCircleItem}
                    onPress={() => router.push(`/club/${club.id}`)}
                  >
                    {club.logo ? (
                      <Image source={{ uri: club.logo }} style={styles.clubCircleImage} />
                    ) : (
                      <LinearGradient
                        colors={['#60A5FA', '#3B82F6']}
                        style={styles.clubCirclePlaceholder}
                      >
                        <Text style={styles.clubCircleInitial}>
                          {club.name.charAt(0).toUpperCase()}
                        </Text>
                      </LinearGradient>
                    )}
                    <Text style={styles.clubCircleName} numberOfLines={1}>{club.name}</Text>
                    <View style={[
                      styles.clubRoleBadge,
                      getUserClubRole(club) === 'Owner' && styles.clubOwnerBadge,
                      getUserClubRole(club) === 'Admin' && styles.clubAdminBadge,
                      getUserClubRole(club) === 'Subscriber' && styles.clubSubscriberBadge,
                    ]}>
                      <Text style={styles.clubRoleText}>{getUserClubRole(club)}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

          {/* Past Events Section */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Past Events</Text>
              <Text style={styles.sectionCount}>{pastEvents.length} events</Text>
            </View>

            {pastEvents.length === 0 ? (
              <View style={styles.emptySection}>
                <Text style={styles.emptySectionText}>No past events yet</Text>
              </View>
            ) : (
              <View style={styles.eventsGrid}>
                {pastEvents.map((event) => (
                  <TouchableOpacity
                    key={event.id}
                    style={styles.eventGridItem}
                    onPress={() => router.push(`/(tabs)/event-detail?id=${event.id}`)}
                  >
                    {event.coverImage ? (
                      <Image source={{ uri: event.coverImage }} style={styles.eventGridImage} />
                    ) : (
                      <LinearGradient
                        colors={['#1e1e1e', '#2a2a2a']}
                        style={styles.eventGridPlaceholder}
                      >
                        <IconButton icon="calendar" size={28} iconColor="rgba(255,255,255,0.4)" style={{ margin: 0 }} />
                      </LinearGradient>
                    )}
                    <View style={styles.eventGridOverlay}>
                      <Text style={styles.eventGridTitle} numberOfLines={2}>{event.title}</Text>
                      <Text style={styles.eventGridDate}>
                        {event.endDate.toDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            )}
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
    height: '40%',
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
  floatingHeaderContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    elevation: 100,
    pointerEvents: 'box-none',
  },
  floatingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  floatingHeaderTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: 'white',
  },
  floatingSettingsButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: 80, // Push content down below the floating header
    paddingBottom: 40,
    minHeight: Dimensions.get('window').height * 0.9, // Ensure scrollable area even when empty
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
  emojiText: {
    fontSize: 56,
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
  section: {
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: 'white',
  },
  sectionCount: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.6)',
  },
  emptySection: {
    paddingVertical: 24,
    alignItems: 'center',
  },
  emptySectionText: {
    fontSize: 15,
    color: 'rgba(255, 255, 255, 0.5)',
  },
  // Club circles styles
  clubCirclesContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: CLUB_GAP,
  },
  clubCircleItem: {
    alignItems: 'center',
    width: CLUB_ITEM_WIDTH,
  },
  clubCircleImage: {
    width: CLUB_ITEM_WIDTH - 10,
    height: CLUB_ITEM_WIDTH - 10,
    borderRadius: (CLUB_ITEM_WIDTH - 10) / 2,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  clubCirclePlaceholder: {
    width: CLUB_ITEM_WIDTH - 10,
    height: CLUB_ITEM_WIDTH - 10,
    borderRadius: (CLUB_ITEM_WIDTH - 10) / 2,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  clubCircleInitial: {
    fontSize: 24,
    fontWeight: '700',
    color: 'white',
  },
  clubCircleName: {
    fontSize: 11,
    fontWeight: '600',
    color: 'white',
    marginTop: 6,
    textAlign: 'center',
  },
  clubRoleBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    marginTop: 4,
  },
  clubOwnerBadge: {
    backgroundColor: 'rgba(255, 215, 0, 0.4)',
  },
  clubAdminBadge: {
    backgroundColor: 'rgba(96, 165, 250, 0.3)',
  },
  clubSubscriberBadge: {
    backgroundColor: 'rgba(76, 175, 80, 0.3)',
  },
  clubRoleText: {
    fontSize: 9,
    fontWeight: '600',
    color: 'white',
  },
  // Events grid styles (Instagram-like)
  eventsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -SECTION_PADDING,
    gap: EVENT_GAP,
  },
  eventGridItem: {
    width: EVENT_ITEM_WIDTH,
    height: EVENT_ITEM_WIDTH,
    position: 'relative',
  },
  eventGridImage: {
    width: '100%',
    height: '100%',
  },
  eventGridPlaceholder: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  eventGridOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 6,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  eventGridTitle: {
    fontSize: 11,
    fontWeight: '600',
    color: 'white',
    lineHeight: 14,
  },
  eventGridDate: {
    fontSize: 9,
    color: 'rgba(255, 255, 255, 0.7)',
    marginTop: 2,
  },
});
