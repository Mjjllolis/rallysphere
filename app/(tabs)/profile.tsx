// app/(tabs)/profile.tsx
import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, TouchableOpacity, Dimensions, Animated, RefreshControl } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
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

// Cycles through `length` items: holds on each for `holdMs`, then crossfades
// (via `fade`) to the next over `fadeMs` in each direction. `startDelayMs`
// offsets the first hold so multiple cards can be staggered instead of
// fading in lockstep.
function useCyclingIndex(length: number, holdMs: number, fadeMs: number, startDelayMs = 0) {
  const [index, setIndex] = useState(0);
  const fade = useRef(new Animated.Value(1)).current;

  // Snap back if the list shrinks (e.g. a refresh removes an event) and the
  // current index no longer points at anything.
  useEffect(() => {
    if (index >= length) setIndex(0);
  }, [length, index]);

  useEffect(() => {
    if (length <= 1) return;

    let interval: ReturnType<typeof setInterval> | undefined;
    const startTimeout = setTimeout(() => {
      interval = setInterval(() => {
        Animated.timing(fade, { toValue: 0, duration: fadeMs, useNativeDriver: true }).start(() => {
          setIndex(i => (i + 1) % length);
          Animated.timing(fade, { toValue: 1, duration: fadeMs, useNativeDriver: true }).start();
        });
      }, holdMs + fadeMs * 2);
    }, startDelayMs);

    return () => {
      clearTimeout(startTimeout);
      if (interval) clearInterval(interval);
    };
  }, [length, holdMs, fadeMs, startDelayMs, fade]);

  return { index, fade };
}

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
  const [upcomingEvents, setUpcomingEvents] = useState<Event[]>([]);
  const [pastEvents, setPastEvents] = useState<Event[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [bioExpanded, setBioExpanded] = useState(false);
  const [bioTruncated, setBioTruncated] = useState(false);
  const [clubsCollapsed, setClubsCollapsed] = useState(false);

  // Staggered so the two preview cards don't crossfade in lockstep.
  const upcomingCycle = useCyclingIndex(upcomingEvents.length, 10000, 800, 0);
  const pastCycle = useCyclingIndex(pastEvents.length, 10000, 800, 5800);

  const handleBioTextLayout = (e: { nativeEvent: { lines: any[] } }) => {
    if (!bioExpanded && e.nativeEvent.lines.length > 2) {
      setBioTruncated(true);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loadProfile(), loadRallyCredits(), loadUserClubs(), loadEvents()]);
    setRefreshing(false);
  };

  useEffect(() => {
    if (user) {
      loadProfile();
      loadRallyCredits();
      loadUserClubs();
      loadEvents();
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

  const loadEvents = async () => {
    if (!user) return;

    const result = await getAllEvents();
    if (result.success) {
      const now = new Date();
      const attending = result.events.filter(event => event.attendees.includes(user.uid));

      // Split on start date to match the Tickets screen's Upcoming/Attended
      // filters these cards link to.
      const upcoming = attending.filter(event => event.startDate.toDate() >= now);
      upcoming.sort((a, b) => a.startDate.toDate().getTime() - b.startDate.toDate().getTime());
      setUpcomingEvents(upcoming);

      const past = attending.filter(event => event.startDate.toDate() < now);
      past.sort((a, b) => b.startDate.toDate().getTime() - a.startDate.toDate().getTime());
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

  const chipBackground = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)';

  // Subtle parallax effect for background image
  const backgroundTranslateY = scrollY.interpolate({
    inputRange: [0, 300],
    outputRange: [0, -50], // Gentle parallax - slower than scroll
    extrapolate: 'clamp',
  });

  const renderClubsHeader = () => (
    <TouchableOpacity style={styles.sectionHeader} onPress={() => setClubsCollapsed(prev => !prev)} activeOpacity={0.7}>
      <Text style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>My Clubs</Text>
      <View style={styles.sectionHeaderRight}>
        <Text style={[styles.sectionCount, { color: theme.colors.onSurfaceVariant }]}>{userClubs.length} clubs</Text>
        <IconButton
          icon={clubsCollapsed ? 'chevron-down' : 'chevron-up'}
          size={20}
          iconColor={theme.colors.onSurfaceVariant}
          style={styles.sectionChevron}
        />
      </View>
    </TouchableOpacity>
  );

  // Shared by the Upcoming/Past preview cards - shows the event at
  // cycle.index and crossfades to the next one as the cycle advances.
  const renderEventPreviewCard = (
    events: Event[],
    dateField: 'startDate' | 'endDate',
    cycle: { index: number; fade: Animated.Value },
    statusParam: string,
    noneLabel: string,
    noneSubtitle: string,
    fallbackGradient: [string, string]
  ) => {
    // Clamp: after a refresh shrinks the list, the cycle's index can point past
    // the end for one render before useCyclingIndex's reset effect runs.
    const index = events.length > 0 ? cycle.index % events.length : 0;
    const current = events[index];
    return (
      <TouchableOpacity
        style={styles.upcomingPreviewCard}
        activeOpacity={0.8}
        onPress={() => router.push({ pathname: '/profile/tickets', params: { status: statusParam } })}
      >
        <BlurView intensity={20} tint={isDark ? 'dark' : 'light'} style={[styles.upcomingPreviewBlur, { borderColor: theme.colors.outline }]}>
          <Animated.View style={[styles.upcomingPreviewImage, { opacity: cycle.fade }]}>
            {current?.coverImage ? (
              <ExpoImage
                source={{ uri: current.coverImage }}
                style={styles.upcomingPreviewImageFill}
                contentFit="cover"
                transition={400}
                cachePolicy="memory-disk"
              />
            ) : (
              <LinearGradient
                colors={events.length > 0 ? fallbackGradient : (isDark ? ['#1e1e1e', '#2a2a2a'] : ['#e2e8f0', '#cbd5e1'])}
                style={styles.upcomingPreviewImageFill}
              >
                <IconButton icon="calendar" size={22} iconColor={events.length > 0 ? '#fff' : theme.colors.onSurfaceDisabled} style={{ margin: 0 }} />
              </LinearGradient>
            )}
          </Animated.View>

          <Animated.View style={[styles.upcomingPreviewText, { opacity: cycle.fade }]}>
            <Text style={[styles.upcomingPreviewTitle, { color: theme.colors.onSurface }]} numberOfLines={1}>
              {events.length === 0 ? noneLabel : current.title}
            </Text>
            <Text style={[styles.upcomingPreviewSubtitle, { color: theme.colors.onSurfaceVariant }]} numberOfLines={1}>
              {events.length === 0
                ? noneSubtitle
                : `${index + 1} of ${events.length} · ${current[dateField].toDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
            </Text>
          </Animated.View>

          <IconButton icon="chevron-right" size={22} iconColor={theme.colors.onSurfaceVariant} style={{ margin: 0 }} />
        </BlurView>
      </TouchableOpacity>
    );
  };

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
          <ExpoImage
            source={{ uri: profile.backgroundImage }}
            style={styles.backgroundImage}
            contentFit="cover"
            transition={200}
            cachePolicy="memory-disk"
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

      <SafeAreaView style={styles.safeArea} edges={['top']}>
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
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={theme.colors.onSurface}
            />
          }
        >
          {/* Profile Header */}
          <View style={styles.profileHeader}>
            {/* Avatar */}
            <View style={styles.avatarContainer}>
              {profile?.avatar || user.photoURL ? (
                <ExpoImage
                  source={{ uri: profile?.avatar || user.photoURL || undefined }}
                  style={styles.avatarImage}
                  transition={200}
                  cachePolicy="memory-disk"
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
                <View style={styles.bioWrap}>
                  <Text
                    style={[styles.userBio, { color: theme.colors.onSurfaceVariant }]}
                    numberOfLines={bioExpanded ? undefined : 2}
                    onTextLayout={handleBioTextLayout}
                  >
                    {profile.bio}
                  </Text>
                  {bioTruncated && !bioExpanded && (
                    <BlurView intensity={25} tint={isDark ? 'dark' : 'light'} style={styles.bioFade} pointerEvents="none" />
                  )}
                  {bioTruncated && (
                    <TouchableOpacity onPress={() => setBioExpanded(prev => !prev)} activeOpacity={0.7}>
                      <Text style={styles.bioViewMoreText}>{bioExpanded ? 'View less' : 'View more'}</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}

              {/* User Details */}
              <View style={styles.detailsRow}>
                {profile?.university && (
                  <View style={[styles.detailChip, { backgroundColor: chipBackground, borderColor: theme.colors.outline }]}>
                    <Text style={styles.detailChipIcon}>🏫</Text>
                    <Text style={[styles.detailChipText, { color: theme.colors.onSurfaceVariant }]}>{profile.university}</Text>
                  </View>
                )}
                {profile?.location && (
                  <View style={[styles.detailChip, { backgroundColor: chipBackground, borderColor: theme.colors.outline }]}>
                    <Text style={styles.detailChipIcon}>📍</Text>
                    <Text style={[styles.detailChipText, { color: theme.colors.onSurfaceVariant }]}>{profile.location}</Text>
                  </View>
                )}
                {profile?.instagram && (
                  <TouchableOpacity
                    onPress={() => {
                      const instagramUrl = `https://instagram.com/${profile.instagram}`;
                      router.push(instagramUrl as any);
                    }}
                    style={[styles.detailChip, { backgroundColor: chipBackground, borderColor: theme.colors.outline }]}
                  >
                    <IconButton
                      icon="instagram"
                      size={14}
                      iconColor={theme.colors.onSurfaceVariant}
                      style={styles.instagramIcon}
                    />
                    <Text style={[styles.detailChipText, { color: theme.colors.onSurfaceVariant }]}>@{profile.instagram}</Text>
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
            {renderClubsHeader()}

            {!clubsCollapsed && (
              userClubs.length === 0 ? (
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
                        <ExpoImage source={{ uri: club.logo }} style={[styles.clubCircleImage, { borderColor: theme.colors.outline }]} transition={200} cachePolicy="memory-disk" />
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
              )
            )}
          </View>

          {/* Upcoming Events Preview - links out to the full list on the Tickets page rather than listing every event here */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>Upcoming Events</Text>
            </View>
            {renderEventPreviewCard(
              upcomingEvents,
              'startDate',
              upcomingCycle,
              'Upcoming',
              'No upcoming events',
              'Your next events will show up here',
              ['#60A5FA', '#3B82F6']
            )}
          </View>

          {/* Past Events Preview - same card style, staggered crossfade */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>Past Events</Text>
            </View>
            {renderEventPreviewCard(
              pastEvents,
              'endDate',
              pastCycle,
              'Attended',
              'No past events yet',
              'Events you attend will show up here',
              ['#A855F7', '#7C3AED']
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
    paddingBottom: 120, // Ensure content clears the tab bar
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
    paddingBottom: 20,
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
  bioWrap: {
    marginBottom: 12,
    alignItems: 'center',
  },
  userBio: {
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 20,
  },
  bioFade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 20,
    overflow: 'hidden',
  },
  bioViewMoreText: {
    color: '#60A5FA',
    fontWeight: '600',
    fontSize: 13,
    marginTop: 4,
  },
  detailsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  detailChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 14,
    borderWidth: 1,
  },
  detailChipIcon: {
    fontSize: 12,
  },
  detailChipText: {
    fontSize: 13,
    fontWeight: '600',
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
  instagramIcon: {
    margin: 0,
    padding: 0,
    width: 14,
    height: 14,
  },
  section: {
    paddingHorizontal: 20,
    marginBottom: 18,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: '700',
  },
  sectionCount: {
    fontSize: 14,
    fontWeight: '600',
  },
  sectionHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sectionChevron: {
    margin: 0,
    marginLeft: -4,
  },
  emptySection: {
    paddingVertical: 24,
    alignItems: 'center',
  },
  emptySectionText: {
    fontSize: 15,
  },
  // Upcoming events preview card
  upcomingPreviewCard: {
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 3,
  },
  upcomingPreviewBlur: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 10,
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  upcomingPreviewImage: {
    width: 52,
    height: 52,
    borderRadius: 12,
    overflow: 'hidden',
  },
  upcomingPreviewImageFill: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  upcomingPreviewText: {
    flex: 1,
  },
  upcomingPreviewTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  upcomingPreviewSubtitle: {
    fontSize: 13,
    marginTop: 2,
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
});
