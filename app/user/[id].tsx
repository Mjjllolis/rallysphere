// public profile screen - pushed when you tap an attendee in an event
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Image,
  Animated,
  Linking,
} from 'react-native';
import { Text, IconButton } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams, Stack } from 'expo-router';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { getUserProfile, getClubs, getAllEvents } from '../../lib/firebase';
import type { UserProfile, Club, Event } from '../../lib/firebase';

const SCREEN_WIDTH = Dimensions.get('window').width;
const SECTION_PADDING = 20;
const CLUB_COLUMNS = 4;
const CLUB_GAP = 12;
const CLUB_ITEM_WIDTH =
  (SCREEN_WIDTH - SECTION_PADDING * 2 - CLUB_GAP * (CLUB_COLUMNS - 1)) / CLUB_COLUMNS;
const EVENT_COLUMNS = 3;
const EVENT_GAP = 1;
const EVENT_ITEM_WIDTH = SCREEN_WIDTH / EVENT_COLUMNS - (EVENT_GAP * 2) / 3;

export default function UserProfileScreen() {
  // params for instant header render before profile loads
  const { id, firstName: paramFirst, lastName: paramLast, avatar: paramAvatar } =
    useLocalSearchParams<{ id: string; firstName?: string; lastName?: string; avatar?: string }>();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [clubs, setClubs] = useState<Club[]>([]);
  const [pastEvents, setPastEvents] = useState<Event[]>([]);
  // track when each section finishes loading so skeletons know when to hide
  const [clubsReady, setClubsReady] = useState(false);
  const [eventsReady, setEventsReady] = useState(false);
  const scrollY = useRef(new Animated.Value(0)).current;

  // fetch profile, clubs, and past events in parallel
  useEffect(() => {
    if (!id) return;
    getUserProfile(id as string).then(setProfile);
    getClubs().then((r) => {
      if (r.success)
        setClubs(r.clubs.filter((c) => c.members.includes(id as string) || c.admins.includes(id as string)));
      setClubsReady(true);
    });
    getAllEvents().then((r) => {
      if (r.success) {
        const now = new Date();
        const past = r.events
          .filter((e) => e.attendees.includes(id as string) && e.endDate.toDate() < now)
          .sort((a, b) => b.endDate.toDate().getTime() - a.endDate.toDate().getTime());
        setPastEvents(past);
      }
      setEventsReady(true);
    });
  }, [id]);

  // build display name from whatever name parts are available
  const displayName =
    profile?.firstName || profile?.lastName
      ? `${profile?.firstName || ''} ${profile?.lastName || ''}`.trim()  // loaded profile
      : paramFirst || paramLast
      ? `${paramFirst || ''} ${paramLast || ''}`.trim()                  // params from attendee row
      : profile !== null
      ? 'User'   // profile loaded but has no name
      : '';      // still loading, show nothing

  const avatarUri = profile?.avatar || paramAvatar || null;

  const initials =
    (profile?.firstName?.[0] || (paramFirst as string)?.[0] || '').toUpperCase() +
    (profile?.lastName?.[0] || (paramLast as string)?.[0] || '').toUpperCase() || '?';

  const backgroundTranslateY = scrollY.interpolate({
    inputRange: [0, 300],
    outputRange: [0, -50],
    extrapolate: 'clamp',
  });

  return (
    <View style={styles.container}>
      {/* slide in from right, swipe to go back */}
      <Stack.Screen options={{ headerShown: false, animation: 'slide_from_right', gestureEnabled: true, gestureDirection: 'horizontal' }} />

      <View style={StyleSheet.absoluteFill}>
        <View style={styles.blackBackground} />
      </View>

      {/* parallax banner */}
      {profile?.backgroundImage ? (
        <Animated.View
          style={[styles.backgroundImageContainer, { transform: [{ translateY: backgroundTranslateY }] }]}
          pointerEvents="none"
        >
          <Image source={{ uri: profile.backgroundImage }} style={styles.backgroundImage} resizeMode="cover" />
          <View style={styles.backgroundOverlay} />
          <LinearGradient colors={['rgba(0,0,0,0)', 'rgba(0,0,0,1)']} locations={[0.7, 1]} style={styles.backgroundFade} pointerEvents="none" />
        </Animated.View>
      ) : (
        <LinearGradient
          colors={['rgba(99,102,241,0.25)', 'rgba(139,92,246,0.15)', 'rgba(0,0,0,0)']}
          locations={[0, 0.4, 1]}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
      )}

      {/* back button */}
      <SafeAreaView style={styles.headerContainer} edges={['top']}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <BlurView intensity={40} tint="dark" style={styles.backButtonBlur}>
            <IconButton icon="arrow-left" size={22} iconColor="white" style={{ margin: 0 }} />
          </BlurView>
        </TouchableOpacity>
      </SafeAreaView>

      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <Animated.ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true })}
          scrollEventThrottle={16}
        >
          {/* header renders immediately using params */}
          <View style={styles.profileHeader}>
            <View style={styles.avatarContainer}>
              {avatarUri ? (
                <Image source={{ uri: avatarUri }} style={styles.avatarImage} />
              ) : profile?.profileEmoji ? (
                <View style={styles.avatarPlaceholder}>
                  <Text style={styles.emojiText}>{profile.profileEmoji}</Text>
                </View>
              ) : (
                <View style={styles.avatarPlaceholder}>
                  <Text style={styles.avatarInitialsText}>{initials}</Text>
                </View>
              )}
            </View>

            <View style={styles.userInfo}>
              <Text style={styles.userName}>{displayName}</Text>
              {profile?.bio && <Text style={styles.userBio}>{profile.bio}</Text>}
              <View style={styles.detailsRow}>
                {profile?.university && <Text style={styles.detailText}>🏫 {profile.university}</Text>}
                {profile?.location && <Text style={styles.detailText}>📍 {profile.location}</Text>}
                {profile?.instagram && (
                  <TouchableOpacity
                    style={styles.instagramLink}
                    onPress={() => Linking.openURL(`https://instagram.com/${profile.instagram}`)}
                  >
                    <IconButton icon="instagram" size={16} iconColor="white" style={styles.instagramIcon} />
                    <Text style={styles.detailText}>@{profile.instagram}</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </View>

          {/* clubs */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Clubs</Text>
              {clubsReady && <Text style={styles.sectionCount}>{clubs.length} clubs</Text>}
            </View>
            {!clubsReady ? (
              // ghost circles - same size as real ones so layout doesn't jump
              <View style={styles.clubCirclesContainer}>
                {[0, 1, 2, 3].map((i) => (
                  <View key={i} style={styles.clubCircleItem}>
                    <View style={styles.skeletonCircle} />
                    <View style={styles.skeletonLabel} />
                  </View>
                ))}
              </View>
            ) : clubs.length === 0 ? (
              <View style={styles.emptySection}>
                <Text style={styles.emptySectionText}>Not in any clubs yet</Text>
              </View>
            ) : (
              <View style={styles.clubCirclesContainer}>
                {clubs.map((club) => (
                  <TouchableOpacity key={club.id} style={styles.clubCircleItem} onPress={() => router.push(`/club/${club.id}`)}>
                    {club.logo ? (
                      <Image source={{ uri: club.logo }} style={styles.clubCircleImage} />
                    ) : (
                      <LinearGradient colors={['#60A5FA', '#3B82F6']} style={styles.clubCirclePlaceholder}>
                        <Text style={styles.clubCircleInitial}>{club.name.charAt(0).toUpperCase()}</Text>
                      </LinearGradient>
                    )}
                    <Text style={styles.clubCircleName} numberOfLines={1}>{club.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

          {/* past events */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Past Events</Text>
              {eventsReady && <Text style={styles.sectionCount}>{pastEvents.length} events</Text>}
            </View>
            {!eventsReady ? (
              // ghost grid squares - same size as real ones so layout doesn't jump
              <View style={styles.eventsGrid}>
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <View key={i} style={[styles.eventGridItem, styles.skeletonGridItem]} />
                ))}
              </View>
            ) : pastEvents.length === 0 ? (
              <View style={styles.emptySection}>
                <Text style={styles.emptySectionText}>No past events yet</Text>
              </View>
            ) : (
              <View style={styles.eventsGrid}>
                {pastEvents.map((event) => (
                  <TouchableOpacity key={event.id} style={styles.eventGridItem} onPress={() => router.push(`/event/${event.id}`)}>
                    {event.coverImage ? (
                      <Image source={{ uri: event.coverImage }} style={styles.eventGridImage} />
                    ) : (
                      <LinearGradient colors={['#1e1e1e', '#2a2a2a']} style={styles.eventGridPlaceholder}>
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  blackBackground: { flex: 1, backgroundColor: '#000' },
  backgroundImageContainer: {
    position: 'absolute', top: 0, left: 0, right: 0, height: '40%', overflow: 'hidden', zIndex: 0,
  },
  backgroundImage: { width: '100%', height: '100%' },
  backgroundOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.3)' },
  backgroundFade: { position: 'absolute', bottom: 0, left: 0, right: 0, height: '50%' },
  headerContainer: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 100, pointerEvents: 'box-none' },
  backButton: { margin: 16, alignSelf: 'flex-start' },
  backButtonBlur: {
    width: 44, height: 44, borderRadius: 22, justifyContent: 'center',
    alignItems: 'center', overflow: 'hidden', backgroundColor: 'rgba(0,0,0,0.3)',
  },
  safeArea: { flex: 1, zIndex: 1 },
  scrollView: { flex: 1 },
  scrollContent: { paddingTop: 80, paddingBottom: 40, minHeight: Dimensions.get('window').height * 0.9 },
  profileHeader: { alignItems: 'center', paddingTop: 20, paddingBottom: 32, paddingHorizontal: 20 },
  avatarContainer: { width: 120, height: 120, borderRadius: 60, overflow: 'hidden', marginBottom: 20 },
  avatarImage: { width: '100%', height: '100%' },
  avatarPlaceholder: { width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.1)' },
  avatarInitialsText: { fontSize: 48, fontWeight: '700', color: 'white' },
  emojiText: { fontSize: 56 },
  userInfo: { alignItems: 'center', marginBottom: 4 },
  userName: { fontSize: 24, fontWeight: '700', color: 'white', marginBottom: 8, textAlign: 'center' },
  userBio: { fontSize: 15, color: 'rgba(255,255,255,0.8)', textAlign: 'center', marginBottom: 12, lineHeight: 20, paddingHorizontal: 16 },
  detailsRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 12 },
  detailText: { fontSize: 14, color: 'rgba(255,255,255,0.7)' },
  instagramLink: { flexDirection: 'row', alignItems: 'center', marginLeft: -8 },
  instagramIcon: { margin: 0, padding: 0, marginRight: -4 },
  section: { paddingHorizontal: SECTION_PADDING, marginBottom: 24 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  sectionTitle: { fontSize: 22, fontWeight: '700', color: 'white' },
  sectionCount: { fontSize: 14, fontWeight: '600', color: 'rgba(255,255,255,0.6)' },
  emptySection: { paddingVertical: 24, alignItems: 'center' },
  emptySectionText: { fontSize: 15, color: 'rgba(255,255,255,0.5)' },
  // trying to match skeletons to match real item dimensions so nothing jumps
  skeletonCircle: {
    width: CLUB_ITEM_WIDTH - 10, height: CLUB_ITEM_WIDTH - 10,
    borderRadius: (CLUB_ITEM_WIDTH - 10) / 2, backgroundColor: 'rgba(255,255,255,0.07)',
  },
  skeletonLabel: {
    width: CLUB_ITEM_WIDTH - 20, height: 8, borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.05)', marginTop: 10,
  },
  skeletonGridItem: { backgroundColor: 'rgba(255,255,255,0.07)' },
  clubCirclesContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: CLUB_GAP },
  clubCircleItem: { alignItems: 'center', width: CLUB_ITEM_WIDTH },
  clubCircleImage: {
    width: CLUB_ITEM_WIDTH - 10, height: CLUB_ITEM_WIDTH - 10,
    borderRadius: (CLUB_ITEM_WIDTH - 10) / 2, borderWidth: 2, borderColor: 'rgba(255,255,255,0.2)',
  },
  clubCirclePlaceholder: {
    width: CLUB_ITEM_WIDTH - 10, height: CLUB_ITEM_WIDTH - 10,
    borderRadius: (CLUB_ITEM_WIDTH - 10) / 2, justifyContent: 'center',
    alignItems: 'center', borderWidth: 2, borderColor: 'rgba(255,255,255,0.2)',
  },
  clubCircleInitial: { fontSize: 24, fontWeight: '700', color: 'white' },
  clubCircleName: { fontSize: 11, fontWeight: '600', color: 'white', marginTop: 6, textAlign: 'center' },
  eventsGrid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -SECTION_PADDING, gap: EVENT_GAP },
  eventGridItem: { width: EVENT_ITEM_WIDTH, height: EVENT_ITEM_WIDTH, position: 'relative' },
  eventGridImage: { width: '100%', height: '100%' },
  eventGridPlaceholder: { width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center' },
  eventGridOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 6, backgroundColor: 'rgba(0,0,0,0.6)' },
  eventGridTitle: { fontSize: 11, fontWeight: '600', color: 'white', lineHeight: 14 },
  eventGridDate: { fontSize: 9, color: 'rgba(255,255,255,0.7)', marginTop: 2 },
});
