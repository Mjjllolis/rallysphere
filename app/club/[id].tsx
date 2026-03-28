// app/club/[id].tsx
import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, ScrollView, Alert, Image, Linking, ImageBackground, Dimensions, TouchableOpacity, RefreshControl, Platform } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import {
  Text,
  Button,
  Card,
  Chip,
  IconButton,
  useTheme,
  Menu,
  Surface
} from 'react-native-paper';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { router, useLocalSearchParams, useFocusEffect, Stack } from 'expo-router';
import { useAuth, useThemeToggle } from '../_layout';
import { getClub, joinClub, leaveClub, getEvents, getClubStoreItems, getUserRallyCredits, getUserProfile, isUserSubscribedToClub } from '../../lib/firebase';
import type { Club, Event, StoreItem, UserRallyCredits, UserProfile } from '../../lib/firebase';
import JoinClubModal from '../../components/JoinClubModal';
import { getFunctions, httpsCallable } from 'firebase/functions';

const { width } = Dimensions.get('window');

export default function ClubDetailScreen() {
  const theme = useTheme();
  const { isDark } = useThemeToggle();
  const { user } = useAuth();
  const { id } = useLocalSearchParams();
  const clubId = id as string;

  const [club, setClub] = useState<Club | null>(null);
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [joinModalVisible, setJoinModalVisible] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const [activeTab, setActiveTab] = useState<'events' | 'members' | 'details' | 'store'>('details');
  const [storeItems, setStoreItems] = useState<any[]>([]);
  const [userCredits, setUserCredits] = useState<UserRallyCredits | null>(null);
  const [membersData, setMembersData] = useState<Map<string, UserProfile>>(new Map());
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [subscriptionLoading, setSubscriptionLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (clubId) {
      loadClubData();
    }
  }, [clubId]);

  useEffect(() => {
    if (club?.members?.length) {
      loadMembersData(club.members);
    }
  }, [club?.members]);

  // Refresh credits when screen comes into focus (e.g., returning from event page)
  useFocusEffect(
    useCallback(() => {
      const refreshCredits = async () => {
        if (user && clubId) {
          // console.log('[ClubDetail] Refreshing credits for user:', user.uid, 'club:', clubId);
          const creditsResult = await getUserRallyCredits(user.uid);
          // console.log('[ClubDetail] Credits result:', creditsResult);
          if (creditsResult.success && creditsResult.credits) {
            // console.log('[ClubDetail] Current clubId:', clubId);
            // console.log('[ClubDetail] All club credits:', creditsResult.credits.clubCredits);
            // console.log('[ClubDetail] Credits for THIS club:', creditsResult.credits.clubCredits?.[clubId]);
            setUserCredits(creditsResult.credits);
          }
        }
      };
      refreshCredits();
    }, [user, clubId])
  );

  const loadMembersData = async (memberIds: string[]) => {
    const newData = new Map<string, UserProfile>();
    await Promise.all(
      memberIds.map(async (userId) => {
        try {
          const profile = await getUserProfile(userId);
          if (profile) {
            newData.set(userId, profile);
          }
        } catch (error) {
          // console.error('Error loading profile for', userId, error);
        }
      })
    );
    setMembersData(newData);
  };

  const loadClubData = async () => {
    try {
      setLoading(true);
      
      // Load club details
      const clubResult = await getClub(clubId);
      if (clubResult.success && clubResult.club) {
        setClub(clubResult.club);
      } else {
        Alert.alert('Error', 'Club not found');
        router.back();
        return;
      }
      
      // Load club events
      const eventsResult = await getEvents(clubId);
      if (eventsResult.success) {
        setEvents(eventsResult.events);
      }

      // Load club store items
      const storeResult = await getClubStoreItems(clubId, true);
      if (storeResult.success) {
        setStoreItems(storeResult.items);
      }

      // Load user's RallyCredits if logged in
      if (user) {
        const creditsResult = await getUserRallyCredits(user.uid);
        if (creditsResult.success && creditsResult.credits) {
          setUserCredits(creditsResult.credits);
        }

        // Check if user is subscribed to this club
        const subResult = await isUserSubscribedToClub(user.uid, clubId);
        setIsSubscribed(subResult.isSubscribed);
      }
    } catch (error) {
      // console.error('Error loading club data:', error);
      Alert.alert('Error', 'Failed to load club information');
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadClubData();
    setRefreshing(false);
  };

  const handleJoinClub = async (message?: string) => {
    if (!user || !club) return;
    
    setActionLoading(true);
    try {
      const result = await joinClub(club.id, user.uid, user.email || '', user.displayName || '', message);
      if (result.success) {
        if (result.approved) {
          Alert.alert('Success!', 'You have joined the club!');
          await loadClubData(); // Refresh club data
        } else {
          Alert.alert('Request Sent!', 'Your join request has been sent to the club admins.');
        }
      } else {
        Alert.alert('Error', result.error || 'Failed to join club');
      }
    } catch (error) {
      // console.error('Error joining club:', error);
      Alert.alert('Error', 'An unexpected error occurred');
    } finally {
      setActionLoading(false);
    }
  };

  const handleLeaveClub = async () => {
    if (!user || !club) return;
    
    Alert.alert(
      'Leave Club',
      'Are you sure you want to leave this club?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Leave', 
          style: 'destructive',
          onPress: async () => {
            setActionLoading(true);
            try {
              const result = await leaveClub(club.id, user.uid);
              if (result.success) {
                Alert.alert('Success', 'You have left the club');
                await loadClubData(); // Refresh club data
              } else {
                Alert.alert('Error', result.error || 'Failed to leave club');
              }
            } catch (error) {
              // console.error('Error leaving club:', error);
              Alert.alert('Error', 'An unexpected error occurred');
            } finally {
              setActionLoading(false);
            }
          }
        }
      ]
    );
  };

  const handleSubscribe = async () => {
    if (!user || !club) return;
    if (!club.subscriptionEnabled || !club.subscriptionPrice) {
      Alert.alert('Unavailable', 'This club does not have subscriptions enabled.');
      return;
    }

    setSubscriptionLoading(true);
    try {
      const functions = getFunctions();
      const createClubSubscription = httpsCallable(functions, 'createClubSubscription');
      const result = await createClubSubscription({ clubId: club.id });
      const data = result.data as any;

      if (data.url) {
        // Open Stripe checkout in browser
        Linking.openURL(data.url);
      } else {
        Alert.alert('Error', 'Failed to start subscription process');
      }
    } catch (error: any) {
      // console.error('Error subscribing to club:', error);
      Alert.alert('Error', error.message || 'Failed to subscribe to club');
    } finally {
      setSubscriptionLoading(false);
    }
  };

  const handleCancelSubscription = async () => {
    if (!user || !club) return;

    Alert.alert(
      'Cancel Subscription',
      'Are you sure you want to cancel your subscription to this club?',
      [
        { text: 'Keep Subscription', style: 'cancel' },
        {
          text: 'Cancel',
          style: 'destructive',
          onPress: async () => {
            setSubscriptionLoading(true);
            try {
              const functions = getFunctions();
              const cancelClubSubscription = httpsCallable(functions, 'cancelClubSubscription');
              const result = await cancelClubSubscription({ clubId: club.id });
              const data = result.data as any;

              if (data.success) {
                Alert.alert('Subscription Canceled', 'Your subscription will end at the end of the current billing period.');
                setIsSubscribed(false);
                await loadClubData();
              } else {
                Alert.alert('Error', 'Failed to cancel subscription');
              }
            } catch (error: any) {
              // console.error('Error canceling subscription:', error);
              Alert.alert('Error', error.message || 'Failed to cancel subscription');
            } finally {
              setSubscriptionLoading(false);
            }
          }
        }
      ]
    );
  };

  const openSocialLink = (url: string) => {
    if (url.startsWith('http')) {
      Linking.openURL(url);
    } else {
      Linking.openURL(`https://${url}`);
    }
  };

  // Generate initials from club name (e.g., "Pickle Ball Club" -> "PBC", "Pickle" -> "P")
  const getClubInitials = (name: string): string => {
    const words = name.trim().split(/\s+/);
    if (words.length === 1) {
      return words[0].charAt(0).toUpperCase();
    }
    return words.map(word => word.charAt(0).toUpperCase()).join('').slice(0, 3);
  };

  if (loading || !club) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
        {/* set slide animation here too so it applies even before data loads */}
        <Stack.Screen options={{ headerShown: false, animation: 'slide_from_right', gestureEnabled: true, gestureDirection: 'horizontal' }} />
        <View style={styles.loadingContainer}>
          <Text variant="bodyLarge">Loading...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const isJoined = user ? club.members.includes(user.uid) : false;
  const isAdmin = user ? club.admins.includes(user.uid) : false;
  const isOwner = user ? (club.owner === user.uid || club.createdBy === user.uid) : false;
  const isSubscriber = user ? (club.subscribers?.includes(user.uid) || false) : false;

  // Debug logging for credits display
  // console.log('[ClubDetail] Display conditions:', {
  //   hasUser: !!user,
  //   isJoined,
  //   isAdmin,
  //   isOwner,
  //   hasUserCredits: !!userCredits,
  //   shouldShow: !!(user && (isJoined || isAdmin || isOwner) && userCredits),
  //   creditsValue: userCredits?.clubCredits?.[clubId]
  // });

  const sortedEvents = [...events].sort((a, b) => {
    const dateA = a.startDate.toDate ? a.startDate.toDate() : new Date(a.startDate);
    const dateB = b.startDate.toDate ? b.startDate.toDate() : new Date(b.startDate);
    const now = new Date();

    const aIsUpcoming = dateA > now;
    const bIsUpcoming = dateB > now;

    // Upcoming events first
    if (aIsUpcoming && !bIsUpcoming) return -1;
    if (!aIsUpcoming && bIsUpcoming) return 1;

    // Within upcoming: earliest first
    if (aIsUpcoming && bIsUpcoming) return dateA.getTime() - dateB.getTime();

    // Within past: most recent first
    return dateB.getTime() - dateA.getTime();
  });

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {/* slide in from right, swipe to go back */}
      <Stack.Screen options={{ headerShown: false, animation: 'slide_from_right', gestureEnabled: true, gestureDirection: 'horizontal' }} />
      {/* Full-screen blurred background image */}
      {club.coverImage ? (
        <ExpoImage
          source={{ uri: club.coverImage }}
          style={styles.backgroundImage}
          blurRadius={80}
          transition={200}
          cachePolicy="memory-disk"
        />
      ) : (
        <View style={styles.backgroundImage} />
      )}
      {/* Gradient overlay for better readability */}
      <LinearGradient
        colors={isDark ? ['rgba(15,15,35,0.3)', 'rgba(15,15,35,0.85)', 'rgba(10,10,25,0.95)'] : ['rgba(255,255,255,0.3)', 'rgba(255,255,255,0.85)', 'rgba(245,245,245,0.95)']}
        style={styles.backgroundOverlay}
      />

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.onSurface} />}>
        {/* Hero Header with Dark Gradient */}
        <View style={styles.heroSection}>
          {club.coverImage ? (
            <ExpoImage
              source={{ uri: club.coverImage }}
              style={styles.coverImage}
              contentFit="cover"
              transition={200}
              cachePolicy="memory-disk"
            />
          ) : (
            <Image
              source={require('../../assets/Background.png')}
              style={styles.coverImage}
              resizeMode="cover"
            />
          )}

          {/* Gradient overlay for text readability */}
          <LinearGradient
            colors={isDark ? ['transparent', 'transparent', 'rgba(15,15,35,0.6)', 'rgba(15,15,35,0.95)'] : ['transparent', 'transparent', 'rgba(255,255,255,0.6)', 'rgba(255,255,255,0.95)']}
            locations={[0, 0.5, 0.8, 1]}
            style={styles.heroUnifiedGradient}
          >
            {/* Top Controls */}
            <View style={styles.topControls}>
              <BlurView intensity={40} tint={isDark ? "dark" : "light"} style={styles.controlButtonBlur}>
                <IconButton
                  icon="arrow-left"
                  iconColor={theme.colors.onSurface}
                  size={24}
                  onPress={() => router.back()}
                />
              </BlurView>

              <View style={styles.rightControls}>
                {/* RallyCredits Display */}
                {user && (isJoined || isAdmin || isOwner) && userCredits && (
                  <TouchableOpacity
                    onPress={() => router.push(`/club/${club.id}/redeem-credits`)}
                    activeOpacity={0.7}
                  >
                    <BlurView intensity={40} tint={isDark ? "dark" : "light"} style={styles.creditsChip}>
                      <View style={styles.creditsContent}>
                        <IconButton
                          icon="star-circle"
                          iconColor="#FFD700"
                          size={20}
                          style={{ margin: 0 }}
                        />
                        <Text variant="titleMedium" style={[styles.creditsText, { color: theme.colors.onSurface }]}>
                          {userCredits.clubCredits?.[clubId] || 0}
                        </Text>
                      </View>
                    </BlurView>
                  </TouchableOpacity>
                )}

                {/* Admin/Owner: Direct link to dashboard */}
                {(isAdmin || isOwner) && (
                  <BlurView intensity={40} tint={isDark ? "dark" : "light"} style={styles.controlButtonBlur}>
                    <IconButton
                      icon="menu"
                      iconColor={theme.colors.onSurface}
                      size={24}
                      onPress={() => router.push(`/club/${club.id}/manage`)}
                    />
                  </BlurView>
                )}

                {/* Regular member: Menu with Leave option */}
                {isJoined && !isAdmin && !isOwner && (
                  <Menu
                    visible={menuVisible}
                    onDismiss={() => setMenuVisible(false)}
                    anchor={
                      <BlurView intensity={40} tint={isDark ? "dark" : "light"} style={styles.controlButtonBlur}>
                        <IconButton
                          icon="menu"
                          iconColor={theme.colors.onSurface}
                          size={24}
                          onPress={() => setMenuVisible(true)}
                        />
                      </BlurView>
                    }
                  >
                    <Menu.Item
                      onPress={() => {
                        setMenuVisible(false);
                        handleLeaveClub();
                      }}
                      title="Leave Club"
                      leadingIcon="exit-to-app"
                    />
                  </Menu>
                )}
              </View>
            </View>

            {/* Club Info Overlay */}
            <View style={styles.heroContent}>
              {club.logo ? (
                <ExpoImage source={{ uri: club.logo }} style={styles.heroLogo} transition={200} cachePolicy="memory-disk" />
              ) : (
                <View style={styles.heroLogoInitials}>
                  <Text style={[styles.heroLogoInitialsText, { color: theme.colors.onSurface }]}>{getClubInitials(club.name)}</Text>
                </View>
              )}
              <View style={styles.heroTitleContainer}>
                <Text variant="displaySmall" style={[styles.heroTitle, { color: theme.colors.onSurface }]}>
                  {club.name}
                </Text>
                {club.isPro && (
                  <Chip
                    icon="crown"
                    style={styles.proChip}
                    textStyle={styles.proChipText}
                    mode="flat"
                  >
                    PRO
                  </Chip>
                )}
              </View>
              <View style={styles.heroMeta}>
                <Chip style={[styles.heroCategoryChip, { backgroundColor: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.1)' }]} textStyle={[styles.heroChipText, { color: theme.colors.onSurface }]}>
                  {club.category}
                </Chip>
                <Text variant="titleSmall" style={[styles.heroMembers, { color: theme.colors.onSurfaceVariant }]}>
                  {club.members.length} Members
                </Text>
              </View>

              {user && !isJoined && (
                <Button
                  mode="contained"
                  onPress={() => {
                    if (!club.isPublic) {
                      setJoinModalVisible(true);
                    } else {
                      handleJoinClub();
                    }
                  }}
                  loading={actionLoading}
                  style={styles.heroJoinButton}
                  contentStyle={styles.heroJoinButtonContent}
                  labelStyle={styles.heroJoinButtonLabel}
                >
                  Join Club
                </Button>
              )}

              {/* Subscription Buttons */}
              {user && isJoined && club.subscriptionEnabled && club.subscriptionPrice && (
                <View style={styles.subscriptionSection}>
                  {isSubscribed ? (
                    <View style={styles.subscribedContainer}>
                      <Chip
                        icon="check-circle"
                        style={styles.subscribedChip}
                        textStyle={[styles.subscribedChipText, { color: theme.colors.onSurface }]}
                      >
                        Subscribed
                      </Chip>
                      <TouchableOpacity onPress={handleCancelSubscription} disabled={subscriptionLoading}>
                        <Text style={[styles.cancelSubscriptionText, { color: theme.colors.onSurfaceVariant }]}>
                          {subscriptionLoading ? 'Processing...' : 'Cancel'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <View style={styles.subscribeContainer}>
                      <Button
                        mode="contained"
                        onPress={handleSubscribe}
                        loading={subscriptionLoading}
                        style={styles.subscribeButton}
                        contentStyle={styles.heroJoinButtonContent}
                        labelStyle={styles.heroJoinButtonLabel}
                        icon="star"
                      >
                        Subscribe - ${club.subscriptionPrice}/mo
                      </Button>
                      {club.subscriptionDescription && (
                        <Text style={[styles.subscriptionDescription, { color: theme.colors.onSurfaceVariant }]}>
                          {club.subscriptionDescription}
                        </Text>
                      )}
                    </View>
                  )}
                </View>
              )}
            </View>
          </LinearGradient>

        </View>

        {/* Content Section */}
        <View style={styles.content}>
          {/* Tab Navigation */}
          <View style={[styles.tabContainer, { borderBottomColor: theme.colors.outline }]}>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'details' && styles.activeTab]}
              onPress={() => setActiveTab('details')}
            >
              <Text
                variant="titleMedium"
                style={[styles.tabText, { color: theme.colors.onSurfaceVariant }, activeTab === 'details' && [styles.activeTabText, { color: theme.colors.onSurface }]]}
              >
                Details
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'events' && styles.activeTab]}
              onPress={() => setActiveTab('events')}
            >
              <Text
                variant="titleMedium"
                style={[styles.tabText, { color: theme.colors.onSurfaceVariant }, activeTab === 'events' && [styles.activeTabText, { color: theme.colors.onSurface }]]}
              >
                Events
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'store' && styles.activeTab]}
              onPress={() => setActiveTab('store')}
            >
              <Text
                variant="titleMedium"
                style={[styles.tabText, { color: theme.colors.onSurfaceVariant }, activeTab === 'store' && [styles.activeTabText, { color: theme.colors.onSurface }]]}
              >
                Store
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'members' && styles.activeTab]}
              onPress={() => setActiveTab('members')}
            >
              <Text
                variant="titleMedium"
                style={[styles.tabText, { color: theme.colors.onSurfaceVariant }, activeTab === 'members' && [styles.activeTabText, { color: theme.colors.onSurface }]]}
              >
                Members
              </Text>
            </TouchableOpacity>
          </View>

          {activeTab === 'members' && (
            <View style={styles.statsContainer}>
              <View style={styles.statCard}>
                <Text variant="headlineMedium" style={[styles.statNumber, { color: theme.colors.onSurface }]}>
                  {club.members.length}
                </Text>
                <Text variant="bodyMedium" style={[styles.statLabel, { color: theme.colors.onSurfaceVariant }]}>
                  Members
                </Text>
              </View>
              <View style={styles.statCard}>
                <Text variant="headlineMedium" style={[styles.statNumber, { color: theme.colors.onSurface }]}>
                  {club.admins.length}
                </Text>
                <Text variant="bodyMedium" style={[styles.statLabel, { color: theme.colors.onSurfaceVariant }]}>
                  Admins
                </Text>
              </View>
            </View>
          )}

          {/* Details Tab */}
          {activeTab === 'details' && (
            <>
              {/* Description */}
              <View style={styles.section}>
                <Text variant="titleLarge" style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>
                  About
                </Text>
                <Text variant="bodyLarge" style={[styles.description, { color: theme.colors.onSurfaceVariant }]}>
                  {club.description}
                </Text>
              </View>
              <View style={[styles.divider, { backgroundColor: theme.colors.outline }]} />

              {/* Details */}
              {(club.location || club.university || club.contactEmail) && (
                <>
                  <View style={styles.section}>
                    <Text variant="titleLarge" style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>
                      Details
                    </Text>
                    {club.location && (
                      <TouchableOpacity
                        style={styles.detailRow}
                        onPress={() => {
                          const encoded = encodeURIComponent(club.location!);
                          const url = Platform.OS === 'ios'
                            ? `maps:?q=${encoded}`
                            : `geo:0,0?q=${encoded}`;
                          Linking.openURL(url);
                        }}
                      >
                        <IconButton icon="map-marker" size={20} iconColor="#60A5FA" />
                        <Text variant="bodyLarge" style={[styles.detailText, { color: '#60A5FA' }]}>{club.location}</Text>
                        <IconButton icon="open-in-new" size={14} iconColor="#60A5FA" style={{ margin: 0 }} />
                      </TouchableOpacity>
                    )}
                    {club.university && (
                      <View style={styles.detailRow}>
                        <IconButton icon="school" size={20} iconColor={theme.colors.onSurface} />
                        <Text variant="bodyLarge" style={[styles.detailText, { color: theme.colors.onSurfaceVariant }]}>{club.university}</Text>
                      </View>
                    )}
                    {club.contactEmail && (
                      <View style={styles.detailRow}>
                        <IconButton icon="email" size={20} iconColor={theme.colors.onSurface} />
                        <Text variant="bodyLarge" style={[styles.detailText, { color: theme.colors.onSurfaceVariant }]}>{club.contactEmail}</Text>
                      </View>
                    )}
                  </View>
                  <View style={[styles.divider, { backgroundColor: theme.colors.outline }]} />
                </>
              )}

              {/* Social Links */}
              {club.socialLinks && (
                <>
                  <View style={styles.section}>
                    <Text variant="titleLarge" style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>
                      Connect
                    </Text>
                    <View style={styles.socialLinks}>
                      {club.socialLinks.website && (
                        <IconButton
                          icon="web"
                          mode="contained"
                          size={28}
                          onPress={() => openSocialLink(club.socialLinks!.website!)}
                        />
                      )}
                      {club.socialLinks.instagram && (
                        <IconButton
                          icon="instagram"
                          mode="contained"
                          size={28}
                          onPress={() => openSocialLink(`https://instagram.com/${club.socialLinks!.instagram!.replace('@', '')}`)}
                        />
                      )}
                      {club.socialLinks.twitter && (
                        <IconButton
                          icon="twitter"
                          mode="contained"
                          size={28}
                          onPress={() => openSocialLink(`https://twitter.com/${club.socialLinks!.twitter!.replace('@', '')}`)}
                        />
                      )}
                      {club.socialLinks.facebook && (
                        <IconButton
                          icon="facebook"
                          mode="contained"
                          size={28}
                          onPress={() => openSocialLink(club.socialLinks!.facebook!.startsWith('http') ? club.socialLinks!.facebook! : `https://facebook.com/${club.socialLinks!.facebook!}`)}
                        />
                      )}
                      {club.socialLinks.tiktok && (
                        <IconButton
                          icon="music-note"
                          mode="contained"
                          size={28}
                          onPress={() => openSocialLink(`https://tiktok.com/@${club.socialLinks!.tiktok!.replace('@', '')}`)}
                        />
                      )}
                      {club.socialLinks.discord && (
                        <IconButton
                          icon="forum"
                          mode="contained"
                          size={28}
                          onPress={() => openSocialLink(club.socialLinks!.discord!)}
                        />
                      )}
                    </View>
                  </View>
                  <View style={[styles.divider, { backgroundColor: theme.colors.outline }]} />
                </>
              )}

              {/* Tags */}
              {club.tags && club.tags.length > 0 && (
                <View style={styles.section}>
                  <Text variant="titleLarge" style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>
                    Topics
                  </Text>
                  <View style={styles.tagsGrid}>
                    {club.tags.map((tag) => (
                      <Chip key={tag} style={styles.topicChip} mode="flat">
                        {tag}
                      </Chip>
                    ))}
                  </View>
                </View>
              )}
            </>
          )}

          {/* Members List */}
          {activeTab === 'members' && club.members.length > 0 && (
            <View style={styles.section}>
              <Text variant="titleLarge" style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>
                All Members
              </Text>
              <View style={styles.membersList}>
                {club.members.map((userId) => {
                  const member = membersData.get(userId);
                  const displayName = member
                    ? `${member.firstName || ''} ${member.lastName || ''}`.trim() || member.email || 'User'
                    : 'Loading...';
                  const initials = member
                    ? `${member.firstName?.[0] || ''}${member.lastName?.[0] || ''}`.toUpperCase() || '?'
                    : '?';

                  return (
                    <TouchableOpacity
                      key={userId}
                      style={[styles.memberRow, { borderBottomColor: theme.colors.outline }]}
                      onPress={() => router.push(`/user/${userId}`)}
                      activeOpacity={0.7}
                    >
                      <View style={styles.memberInfo}>
                        {member?.avatar ? (
                          <ExpoImage
                            source={{ uri: member.avatar }}
                            style={styles.avatarCircle}
                            transition={200}
                            cachePolicy="memory-disk"
                          />
                        ) : (
                          <View style={styles.avatarCircle}>
                            <Text variant="labelLarge" style={[styles.avatarText, { color: theme.colors.onSurface }]}>
                              {initials}
                            </Text>
                          </View>
                        )}
                        <Text variant="bodyLarge" style={[styles.memberId, { color: theme.colors.onSurfaceVariant }]} numberOfLines={1}>
                          {displayName}
                        </Text>
                      </View>
                      <View style={styles.memberBadges}>
                        {(club.owner === userId || club.createdBy === userId) ? (
                          <Chip icon="crown" style={styles.ownerChip}>
                            Owner
                          </Chip>
                        ) : club.admins.includes(userId) ? (
                          <Chip icon="shield-account" style={styles.adminChip}>
                            Admin
                          </Chip>
                        ) : club.subscribers?.includes(userId) ? (
                          <Chip icon="star" style={styles.subscriberChip}>
                            Subscriber
                          </Chip>
                        ) : null}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          {/* Events Section */}
          {activeTab === 'events' && (
            <View style={styles.section}>
              {sortedEvents.length > 0 ? (
                <View style={styles.eventsList}>
                  {sortedEvents.map((event) => {
                    const eventDate = event.startDate?.toDate ? event.startDate.toDate() : new Date(event.startDate);
                    const isPast = eventDate < new Date();
                    const formattedDate = eventDate.toLocaleDateString([], { month: 'short', day: 'numeric' });
                    const formattedTime = eventDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
                    return (
                      <View key={event.id} style={styles.eventCardWrapper}>
                        <TouchableOpacity
                          activeOpacity={0.9}
                          onPress={() => router.push(`/event/${event.id}`)}
                          style={[styles.eventCard, { backgroundColor: isDark ? theme.colors.surface : '#fff' }]}
                        >
                          {/* Cover Image */}
                          <View style={styles.eventCardImageContainer}>
                            {event.coverImage ? (
                              <ExpoImage source={{ uri: event.coverImage }} style={styles.eventCardImage} contentFit="cover" transition={200} cachePolicy="memory-disk" />
                            ) : (
                              <View style={[styles.eventCardImage, { backgroundColor: theme.colors.surfaceVariant, justifyContent: 'center', alignItems: 'center' }]}>
                                <Text variant="headlineLarge" style={{ color: theme.colors.onSurfaceVariant }}>{event.title.charAt(0)}</Text>
                              </View>
                            )}
                            <LinearGradient
                              colors={['transparent', 'rgba(0,0,0,0.7)']}
                              style={styles.eventCardGradient}
                            />
                            {/* Overlay info on image */}
                            <View style={styles.eventCardOverlay}>
                              <Text variant="titleMedium" style={styles.eventCardTitle} numberOfLines={1}>
                                {event.title}
                              </Text>
                              <View style={styles.eventCardMeta}>
                                <Text style={styles.eventCardDate}>{formattedDate} · {formattedTime}</Text>
                                {event.ticketPrice ? (
                                  <Text style={styles.eventCardPrice}>${event.ticketPrice}</Text>
                                ) : (
                                  <Text style={styles.eventCardFree}>Free</Text>
                                )}
                              </View>
                            </View>
                            {isPast && (
                              <View style={styles.eventCardPastBadge}>
                                <Text style={styles.eventCardPastText}>Past</Text>
                              </View>
                            )}
                          </View>
                        </TouchableOpacity>

                        {/* Event details always visible */}
                        <View style={[styles.eventCardDropdown, { backgroundColor: isDark ? theme.colors.surface : '#f8fafc', borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)' }]}>
                          {event.location && (
                            <View style={styles.eventCardDetailRow}>
                              <IconButton icon="map-marker" size={16} iconColor={theme.colors.onSurfaceVariant} style={{ margin: 0 }} />
                              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, flex: 1 }} numberOfLines={2}>{event.location}</Text>
                            </View>
                          )}
                          <View style={styles.eventCardDetailRow}>
                            <IconButton icon="account-group" size={16} iconColor={theme.colors.onSurfaceVariant} style={{ margin: 0 }} />
                            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                              {event.attendees?.length || 0}{event.maxAttendees ? `/${event.maxAttendees}` : ''} attending
                            </Text>
                          </View>
                        </View>
                      </View>
                    );
                  })}
                </View>
              ) : (
                <View style={styles.emptyEvents}>
                  <Text variant="bodyLarge" style={[styles.emptyText, { color: theme.colors.onSurfaceVariant }]}>
                    No events
                  </Text>
                  {isAdmin && (
                    <Text variant="bodyMedium" style={[styles.emptyHint, { color: theme.colors.onSurfaceDisabled }]}>
                      Create your first event to get started!
                    </Text>
                  )}
                </View>
              )}
            </View>
          )}

          {/* Store Section */}
          {activeTab === 'store' && (
            <View style={styles.section}>
              {isAdmin && (
                <Button
                  mode="contained"
                  icon="store"
                  onPress={() => router.push(`/club/${club.id}/manage-store`)}
                  style={{ marginBottom: 16 }}
                >
                  Manage Store
                </Button>
              )}

              {storeItems.length > 0 ? (
                  <View style={styles.storeGrid}>
                    {storeItems.map((item: StoreItem) => {
                      const inStock = item.inventory > item.sold;
                      return (
                        <TouchableOpacity
                          key={item.id}
                          style={styles.storeTile}
                          onPress={() => router.push(`/(tabs)/store/${item.id}`)}
                        >
                          <Card style={styles.storeTileCard}>
                            {item.images && item.images.length > 0 ? (
                              <ExpoImage source={{ uri: item.images[0] }} style={styles.storeTileImage} transition={200} cachePolicy="memory-disk" />
                            ) : (
                              <View style={[styles.storeTileImage, { backgroundColor: theme.colors.surfaceVariant, justifyContent: 'center', alignItems: 'center' }]}>
                                <Text variant="bodySmall">No Image</Text>
                              </View>
                            )}
                            <View style={styles.storeTileContent}>
                              <Text variant="titleSmall" style={styles.storeTileTitle} numberOfLines={2}>
                                {item.name}
                              </Text>
                              <Text variant="bodyMedium" style={styles.storeTilePrice}>
                                ${item.price.toFixed(2)}
                              </Text>
                              {!inStock && (
                                <Text variant="bodySmall" style={{ color: theme.colors.error }}>
                                  Sold Out
                                </Text>
                              )}
                            </View>
                          </Card>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
              ) : (
                <View style={styles.emptyEvents}>
                  <Text variant="bodyLarge" style={[styles.emptyText, { color: theme.colors.onSurfaceVariant }]}>
                    No store items
                  </Text>
                  {isAdmin && (
                    <Text variant="bodyMedium" style={[styles.emptyHint, { color: theme.colors.onSurfaceDisabled }]}>
                      Add products to your club store!
                    </Text>
                  )}
                </View>
              )}
            </View>
          )}
        </View>
      </ScrollView>

      <JoinClubModal
        visible={joinModalVisible}
        onDismiss={() => setJoinModalVisible(false)}
        onJoin={handleJoinClub}
        clubName={club.name}
        requiresApproval={!club.isPublic}
        loading={actionLoading}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  backgroundImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
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
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 120,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroSection: {
    height: 450,
    position: 'relative',
  },
  coverImage: {
    width: '100%',
    height: 450,
  },
  heroUnifiedGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 450,
    zIndex: 1,
  },
  topControls: {
    position: 'absolute',
    top: 60,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 10,
  },
  rightControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  controlButtonBlur: {
    borderRadius: 25,
    width: 50,
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  creditsChip: {
    borderRadius: 25,
    paddingHorizontal: 12,
    paddingVertical: 4,
    backgroundColor: 'rgba(0,0,0,0.3)',
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
  },
  creditsContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  creditsText: {
    fontWeight: 'bold',
    fontSize: 16,
  },
  heroContent: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 24,
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 2,
    alignItems: 'center',
  },
  heroLogo: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 3,
    borderColor: '#fff',
    marginBottom: 16,
  },
  heroLogoInitials: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 3,
    borderColor: '#fff',
    marginBottom: 16,
    backgroundColor: '#60A5FA',
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroLogoInitialsText: {
    fontSize: 36,
    fontWeight: 'bold',
  },
  heroTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  heroTitle: {
    fontWeight: 'bold',
    textAlign: 'center',
  },
  proChip: {
    backgroundColor: '#FFD700',
    height: 28,
  },
  proChipText: {
    color: '#000',
    fontWeight: 'bold',
    fontSize: 12,
  },
  heroMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 20,
  },
  heroCategoryChip: {
  },
  heroChipText: {
  },
  heroMembers: {
  },
  heroJoinButton: {
    minWidth: 200,
    paddingHorizontal: 40,
    borderRadius: 25,
    marginBottom: 16,
  },
  heroJoinButtonContent: {
    paddingVertical: 8,
  },
  heroJoinButtonLabel: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  subscriptionSection: {
    marginTop: 8,
    alignItems: 'center',
  },
  subscribedContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  subscribedChip: {
    backgroundColor: '#4CAF50',
  },
  subscribedChipText: {
    fontWeight: 'bold',
  },
  cancelSubscriptionText: {
    fontSize: 14,
    textDecorationLine: 'underline',
  },
  subscribeContainer: {
    alignItems: 'center',
  },
  subscribeButton: {
    minWidth: 200,
    paddingHorizontal: 20,
    borderRadius: 25,
    backgroundColor: '#FFD700',
  },
  subscriptionDescription: {
    fontSize: 12,
    marginTop: 8,
    textAlign: 'center',
    maxWidth: 280,
  },
  content: {
    flexGrow: 1,
    minHeight: '100%',
    marginTop: 0,
    paddingTop: 16,
    backgroundColor: 'transparent',
  },
  section: {
    paddingHorizontal: 20,
    paddingTop: 16,
    marginBottom: 8,
  },
  divider: {
    height: 1,
    marginHorizontal: 20,
    marginVertical: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontWeight: 'bold',
    marginBottom: 12,
  },
  description: {
    lineHeight: 26,
  },
  statsContainer: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  statCard: {
    flex: 1,
    paddingVertical: 16,
    alignItems: 'center',
  },
  statNumber: {
    fontWeight: 'bold',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  detailText: {
    flex: 1,
    marginLeft: -8,
  },
  socialLinks: {
    flexDirection: 'row',
    gap: 12,
  },
  tagsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  topicChip: {
    borderRadius: 20,
  },
  emptyEvents: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  emptyText: {
    marginBottom: 8,
  },
  emptyHint: {
    textAlign: 'center',
  },
  viewAllButton: {
    marginTop: 16,
    alignSelf: 'center',
  },
  tabContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 0,
    paddingBottom: 16,
    marginBottom: 0,
    gap: 12,
    borderBottomWidth: 1,
  },
  tab: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
  },
  activeTab: {
    backgroundColor: 'rgba(96, 165, 250, 0.4)',
  },
  tabText: {
    fontWeight: '600',
  },
  activeTabText: {
    opacity: 1,
  },
  eventsList: {
    gap: 16,
  },
  eventCardWrapper: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  eventCard: {
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
  },
  eventCardImageContainer: {
    width: '100%',
    height: 180,
    position: 'relative',
  },
  eventCardImage: {
    width: '100%',
    height: '100%',
  },
  eventCardGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '60%',
  },
  eventCardOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
  },
  eventCardTitle: {
    color: '#fff',
    fontWeight: 'bold',
    marginBottom: 4,
  },
  eventCardMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  eventCardDate: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 13,
  },
  eventCardPrice: {
    color: '#60A5FA',
    fontWeight: 'bold',
    fontSize: 15,
  },
  eventCardFree: {
    color: '#4CAF50',
    fontWeight: 'bold',
    fontSize: 15,
  },
  eventCardPastBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  eventCardPastText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    fontWeight: '600',
  },
  eventCardDropdown: {
    borderTopWidth: 1,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
    padding: 16,
    gap: 8,
  },
  eventCardDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  eventCardViewButton: {
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 4,
  },
  eventCardViewText: {
    fontWeight: 'bold',
    fontSize: 14,
  },
  storeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  storeTile: {
    width: (width - 56) / 2,
    aspectRatio: 1,
  },
  storeTileCard: {
    height: '100%',
    overflow: 'hidden',
  },
  storeTileImage: {
    width: '100%',
    height: '50%',
  },
  storeTileContent: {
    padding: 12,
    flex: 1,
    justifyContent: 'space-between',
  },
  storeTileTitle: {
    fontWeight: 'bold',
    marginBottom: 4,
  },
  storeTilePrice: {
    fontWeight: 'bold',
    color: '#60A5FA',
    fontSize: 16,
  },
  membersList: {
    gap: 0,
  },
  avatarCircle: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#60A5FA',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  },
  adminBadge: {
    position: 'absolute',
    top: -5,
    right: -5,
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: 12,
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontWeight: 'bold',
  },
  memberRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    gap: 12,
  },
  memberInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
    minWidth: 0,
  },
  memberId: {
    flex: 1,
    fontSize: 14,
  },
  memberBadges: {
    flexDirection: 'row',
    gap: 8,
  },
  ownerChip: {
    backgroundColor: 'rgba(255, 215, 0, 0.3)',
  },
  adminChip: {
    backgroundColor: 'rgba(96, 165, 250, 0.2)',
  },
  subscriberChip: {
    backgroundColor: 'rgba(76, 175, 80, 0.2)',
  },
});
