// app/(tabs)/profile.tsx
import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, TouchableOpacity, Dimensions, Image, Animated } from 'react-native';
import { Text, IconButton, useTheme } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { BlurView } from 'expo-blur';
import { useAuth, useThemeToggle } from '../_layout';
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
  const theme = useTheme();
  const { isDark } = useThemeToggle();
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
      <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
        {/* Background */}
        <View style={StyleSheet.absoluteFill}>
          <View style={[styles.blackBackground, { backgroundColor: theme.colors.background }]} />
        </View>

        {/* Subtle Gradient Overlay */}
        <LinearGradient
          colors={['rgba(99, 102, 241, 0.25)', 'rgba(139, 92, 246, 0.15)', 'rgba(217, 70, 239, 0.08)', isDark ? 'rgba(0, 0, 0, 0)' : 'rgba(248, 250, 252, 0)']}
          locations={[0, 0.3, 0.6, 1]}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />

        <SafeAreaView style={styles.safeArea} edges={['top']}>
          <View style={styles.emptyState}>
            <Text style={[styles.emptyStateTitle, { color: theme.colors.onSurface }]}>Please log in to view profile</Text>
            <TouchableOpacity
              style={styles.loginButton}
              onPress={() => router.push('/(auth)/login')}
            >
              <BlurView intensity={60} tint={isDark ? "light" : "dark"} style={[styles.loginButtonBlur, { borderColor: theme.colors.outline }]}>
                <Text style={[styles.loginButtonText, { color: theme.colors.onSurface }]}>Sign In</Text>
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
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {/* Background */}
      <View style={StyleSheet.absoluteFill}>
        <View style={[styles.blackBackground, { backgroundColor: theme.colors.background }]} />
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
          {/* Overlay for Readability - white wash in light mode, dark in dark mode */}
          <View style={[styles.backgroundOverlay, { backgroundColor: isDark ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.55)' }]} />
          {/* Fade to Background - starts earlier in light mode */}
          <LinearGradient
            colors={isDark ? ['rgba(0,0,0,0)', 'rgba(0,0,0,1)'] : ['rgba(248,250,252,0)', 'rgba(248,250,252,0.6)', 'rgba(248,250,252,1)']}
            locations={isDark ? [0.7, 1] : [0.3, 0.7, 1]}
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
            isDark ? 'rgba(0, 0, 0, 0)' : 'rgba(248, 250, 252, 0)'
          ]}
          locations={[0, 0.3, 0.6, 1]}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
      )}

      {/* Floating Header - Outside SafeAreaView */}
      <SafeAreaView style={styles.floatingHeaderContainer} edges={['top']}>
        <View style={styles.floatingHeader}>
          <Text style={[styles.floatingHeaderTitle, { color: theme.colors.onSurface }]}>Profile</Text>
          <TouchableOpacity
            style={styles.floatingSettingsButton}
            onPress={() => setSettingsVisible(true)}
          >
            <IconButton icon="menu" size={24} iconColor={theme.colors.onSurface} />
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
                <View style={[styles.avatarPlaceholder, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)' }]}>
                  <Text style={[styles.avatarText, { color: theme.colors.onSurface }]}>
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
                {profile?.firstName && profile?.lastName
                  ? `${profile.firstName} ${profile.lastName}`
                  : user.displayName || 'User'}
              </Text>
              {profile?.bio && (
                <Text style={[styles.userBio, { color: theme.colors.onSurfaceVariant }]}>{profile.bio}</Text>
              )}

              {/* User Details */}
              <View style={styles.detailsRow}>
                {profile?.university && (
                  <Text style={[styles.detailText, { color: theme.colors.onSurfaceVariant }]}>
                    🏫 {profile.university}
                  </Text>
                )}
                {profile?.location && (
                  <Text style={[styles.detailText, { color: theme.colors.onSurfaceVariant }]}>
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
                      size={16}
                      iconColor={theme.colors.onSurface}
                      style={styles.instagramIcon}
                    />
                    <Text style={[styles.detailText, { color: theme.colors.onSurfaceVariant }]}>@{profile.instagram}</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {/* Edit Profile Button */}
            <TouchableOpacity
              style={styles.editProfileButton}
              onPress={() => setEditProfileVisible(true)}
            >
              <BlurView intensity={40} tint={isDark ? "dark" : "light"} style={[styles.editProfileBlur, { borderColor: theme.colors.outline, backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)' }]}>
                <IconButton icon="pencil" size={18} iconColor={theme.colors.onSurface} style={{ margin: 0 }} />
                <Text style={[styles.editProfileText, { color: theme.colors.onSurface }]}>Edit Profile</Text>
              </BlurView>
            </TouchableOpacity>
          </View>

          {/* My Clubs Section */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>My Clubs</Text>
              <Text style={[styles.sectionCount, { color: theme.colors.onSurfaceVariant }]}>{userClubs.length} clubs</Text>
            </View>

            {userClubs.length === 0 ? (
              <View style={styles.emptySection}>
                <Text style={[styles.emptySectionText, { color: theme.colors.onSurfaceDisabled }]}>You haven't joined any clubs yet</Text>
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
                      <Image source={{ uri: club.logo }} style={[styles.clubCircleImage, { borderColor: theme.colors.outline }]} />
                    ) : (
                      <LinearGradient
                        colors={['#60A5FA', '#3B82F6']}
                        style={[styles.clubCirclePlaceholder, { borderColor: theme.colors.outline }]}
                      >
                        <Text style={[styles.clubCircleInitial, { color: theme.colors.onSurface }]}>
                          {club.name.charAt(0).toUpperCase()}
                        </Text>
                      </LinearGradient>
                    )}
                    <Text style={[styles.clubCircleName, { color: theme.colors.onSurface }]} numberOfLines={1}>{club.name}</Text>
                    <View style={[
                      styles.clubRoleBadge,
                      { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)' },
                      getUserClubRole(club) === 'Owner' && styles.clubOwnerBadge,
                      getUserClubRole(club) === 'Admin' && styles.clubAdminBadge,
                      getUserClubRole(club) === 'Subscriber' && styles.clubSubscriberBadge,
                    ]}>
                      <Text style={[styles.clubRoleText, { color: theme.colors.onSurface }]}>{getUserClubRole(club)}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

          {/* Past Events Section */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>Past Events</Text>
              <Text style={[styles.sectionCount, { color: theme.colors.onSurfaceVariant }]}>{pastEvents.length} events</Text>
            </View>

            {pastEvents.length === 0 ? (
              <View style={styles.emptySection}>
                <Text style={[styles.emptySectionText, { color: theme.colors.onSurfaceDisabled }]}>No past events yet</Text>
              </View>
            ) : (
              <View style={styles.eventsGrid}>
                {pastEvents.map((event) => (
                  <TouchableOpacity
                    key={event.id}
                    style={styles.eventGridItem}
                    onPress={() => router.push(`/event/${event.id}`)}
                  >
                    {event.coverImage ? (
                      <Image source={{ uri: event.coverImage }} style={styles.eventGridImage} />
                    ) : (
                      <LinearGradient
                        colors={isDark ? ['#1e1e1e', '#2a2a2a'] : ['#e2e8f0', '#cbd5e1']}
                        style={styles.eventGridPlaceholder}
                      >
                        <IconButton icon="calendar" size={28} iconColor={theme.colors.onSurfaceDisabled} style={{ margin: 0 }} />
                      </LinearGradient>
                    )}
                    <View style={styles.eventGridOverlay}>
                      <Text style={[styles.eventGridTitle, { color: '#fff' }]} numberOfLines={2}>{event.title}</Text>
                      <Text style={[styles.eventGridDate, { color: 'rgba(255,255,255,0.7)' }]}>
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
  },
  blackBackground: {
    flex: 1,
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
    alignItems: 'center',
  },
  loginButtonText: {
    fontSize: 17,
    fontWeight: '700',
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
  },
  avatarText: {
    fontSize: 48,
    fontWeight: '700',
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
    marginBottom: 8,
    textAlign: 'center',
  },
  userBio: {
    fontSize: 15,
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
    overflow: 'hidden',
  },
  editProfileText: {
    fontSize: 15,
    fontWeight: '600',
    marginLeft: 4,
  },
  instagramLink: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: -8,
  },
  instagramIcon: {
    margin: 0,
    padding: 0,
    marginRight: -4,
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
  },
  sectionCount: {
    fontSize: 14,
    fontWeight: '600',
  },
  emptySection: {
    paddingVertical: 24,
    alignItems: 'center',
  },
  emptySectionText: {
    fontSize: 15,
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
  },
  clubCirclePlaceholder: {
    width: CLUB_ITEM_WIDTH - 10,
    height: CLUB_ITEM_WIDTH - 10,
    borderRadius: (CLUB_ITEM_WIDTH - 10) / 2,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
  },
  clubCircleInitial: {
    fontSize: 24,
    fontWeight: '700',
  },
  clubCircleName: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 6,
    textAlign: 'center',
  },
  clubRoleBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
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
    lineHeight: 14,
  },
  eventGridDate: {
    fontSize: 9,
    marginTop: 2,
  },
});
