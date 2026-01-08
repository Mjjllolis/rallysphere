// app/club/[id].tsx
import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, Alert, Image, Linking, ImageBackground, Dimensions, TouchableOpacity } from 'react-native';
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
import { router, useLocalSearchParams } from 'expo-router';
import { useAuth } from '../_layout';
import { getClub, joinClub, leaveClub, getEvents, getClubStoreItems, getUserRallyCredits, getUserProfile, isUserSubscribedToClub } from '../../lib/firebase';
import type { Club, Event, StoreItem, UserRallyCredits, UserProfile } from '../../lib/firebase';
import JoinClubModal from '../../components/JoinClubModal';
import { getFunctions, httpsCallable } from 'firebase/functions';

const { width } = Dimensions.get('window');

export default function ClubDetailScreen() {
  const theme = useTheme();
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
          console.error('Error loading profile for', userId, error);
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
      console.error('Error loading club data:', error);
      Alert.alert('Error', 'Failed to load club information');
    } finally {
      setLoading(false);
    }
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
      console.error('Error joining club:', error);
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
              console.error('Error leaving club:', error);
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
      console.error('Error subscribing to club:', error);
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
              console.error('Error canceling subscription:', error);
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
    <View style={styles.container}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Hero Header with Dark Gradient */}
        <ImageBackground
          source={club.coverImage ? { uri: club.coverImage } : undefined}
          style={styles.heroImage}
          imageStyle={{ opacity: 0.8 }}
        >
          <LinearGradient
            colors={['rgba(0,0,0,0.3)', 'rgba(0,0,0,0.9)']}
            style={styles.heroGradient}
          >
            {/* Top Controls */}
            <View style={styles.topControls}>
              <Surface style={styles.controlButton} elevation={2}>
                <IconButton
                  icon="arrow-left"
                  iconColor="#fff"
                  size={24}
                  onPress={() => router.back()}
                />
              </Surface>

              <View style={styles.rightControls}>
                {/* RallyCredits Display */}
                {user && (isJoined || isAdmin) && userCredits && (
                  <Surface style={styles.creditsChip} elevation={2}>
                    <View style={styles.creditsContent}>
                      <IconButton
                        icon="star-circle"
                        iconColor="#FFD700"
                        size={20}
                        style={{ margin: 0 }}
                      />
                      <Text variant="titleMedium" style={styles.creditsText}>
                        {userCredits.clubCredits?.[clubId] || 0}
                      </Text>
                    </View>
                  </Surface>
                )}

                {/* Admin/Owner: Direct link to dashboard */}
                {(isAdmin || isOwner) && (
                  <Surface style={styles.controlButton} elevation={2}>
                    <IconButton
                      icon="menu"
                      iconColor="#fff"
                      size={24}
                      onPress={() => router.push(`/club/${club.id}/manage`)}
                    />
                  </Surface>
                )}

                {/* Regular member: Menu with Leave option */}
                {isJoined && !isAdmin && !isOwner && (
                  <Surface style={styles.controlButton} elevation={2}>
                    <Menu
                      visible={menuVisible}
                      onDismiss={() => setMenuVisible(false)}
                      anchor={
                        <IconButton
                          icon="menu"
                          iconColor="#fff"
                          size={24}
                          onPress={() => setMenuVisible(true)}
                        />
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
                  </Surface>
                )}
              </View>
            </View>

            {/* Club Info Overlay */}
            <View style={styles.heroContent}>
              {club.logo ? (
                <Image source={{ uri: club.logo }} style={styles.heroLogo} />
              ) : (
                <View style={styles.heroLogoInitials}>
                  <Text style={styles.heroLogoInitialsText}>{getClubInitials(club.name)}</Text>
                </View>
              )}
              <View style={styles.heroTitleContainer}>
                <Text variant="displaySmall" style={styles.heroTitle}>
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
                <Chip style={styles.heroCategoryChip} textStyle={styles.heroChipText}>
                  {club.category}
                </Chip>
                <Text variant="titleSmall" style={styles.heroMembers}>
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
                        textStyle={styles.subscribedChipText}
                      >
                        Subscribed
                      </Chip>
                      <TouchableOpacity onPress={handleCancelSubscription} disabled={subscriptionLoading}>
                        <Text style={styles.cancelSubscriptionText}>
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
                        <Text style={styles.subscriptionDescription}>
                          {club.subscriptionDescription}
                        </Text>
                      )}
                    </View>
                  )}
                </View>
              )}
            </View>
          </LinearGradient>
        </ImageBackground>

        {/* Content Section */}
        <View style={[styles.content, { backgroundColor: theme.colors.background }]}>
          {/* Tab Navigation */}
          <View style={styles.tabContainer}>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'details' && styles.activeTab]}
              onPress={() => setActiveTab('details')}
            >
              <Text
                variant="titleMedium"
                style={[styles.tabText, activeTab === 'details' && styles.activeTabText]}
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
                style={[styles.tabText, activeTab === 'events' && styles.activeTabText]}
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
                style={[styles.tabText, activeTab === 'store' && styles.activeTabText]}
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
                style={[styles.tabText, activeTab === 'members' && styles.activeTabText]}
              >
                Members
              </Text>
            </TouchableOpacity>
          </View>

          {activeTab === 'members' && (
            <View style={styles.statsContainer}>
              <View style={styles.statCard}>
                <Text variant="headlineMedium" style={styles.statNumber}>
                  {club.members.length}
                </Text>
                <Text variant="bodyMedium" style={styles.statLabel}>
                  Members
                </Text>
              </View>
              <View style={styles.statCard}>
                <Text variant="headlineMedium" style={styles.statNumber}>
                  {club.admins.length}
                </Text>
                <Text variant="bodyMedium" style={styles.statLabel}>
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
                <Text variant="titleLarge" style={styles.sectionTitle}>
                  About
                </Text>
                <Text variant="bodyLarge" style={styles.description}>
                  {club.description}
                </Text>
              </View>

              {/* Details */}
              {(club.location || club.university || club.contactEmail) && (
                <View style={styles.section}>
                  <Text variant="titleLarge" style={styles.sectionTitle}>
                    Details
                  </Text>
                  {club.location && (
                    <View style={styles.detailRow}>
                      <IconButton icon="map-marker" size={20} />
                      <Text variant="bodyLarge" style={styles.detailText}>{club.location}</Text>
                    </View>
                  )}
                  {club.university && (
                    <View style={styles.detailRow}>
                      <IconButton icon="school" size={20} />
                      <Text variant="bodyLarge" style={styles.detailText}>{club.university}</Text>
                    </View>
                  )}
                  {club.contactEmail && (
                    <View style={styles.detailRow}>
                      <IconButton icon="email" size={20} />
                      <Text variant="bodyLarge" style={styles.detailText}>{club.contactEmail}</Text>
                    </View>
                  )}
                </View>
              )}

              {/* Social Links */}
              {club.socialLinks && (
                <View style={styles.section}>
                  <Text variant="titleLarge" style={styles.sectionTitle}>
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
                        icon="discord"
                        mode="contained"
                        size={28}
                        onPress={() => openSocialLink(club.socialLinks!.discord!)}
                      />
                    )}
                  </View>
                </View>
              )}

              {/* Tags */}
              {club.tags && club.tags.length > 0 && (
                <View style={styles.section}>
                  <Text variant="titleLarge" style={styles.sectionTitle}>
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
              <Text variant="titleLarge" style={styles.sectionTitle}>
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
                    <View key={userId} style={styles.memberRow}>
                      <View style={styles.memberInfo}>
                        {member?.avatar ? (
                          <Image
                            source={{ uri: member.avatar }}
                            style={styles.avatarCircle}
                          />
                        ) : (
                          <View style={styles.avatarCircle}>
                            <Text variant="labelLarge" style={styles.avatarText}>
                              {initials}
                            </Text>
                          </View>
                        )}
                        <Text variant="bodyLarge" style={styles.memberId} numberOfLines={1}>
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
                    </View>
                  );
                })}
              </View>
            </View>
          )}

          {/* Events Section */}
          {activeTab === 'events' && (
            <>
              <View style={styles.section}>
                {sortedEvents.length > 0 ? (
                  <View style={styles.eventsGrid}>
                    {sortedEvents.map((event) => {
                      const eventDate = event.startDate.toDate ? event.startDate.toDate() : new Date(event.startDate);
                      const formattedDate = eventDate.toLocaleDateString([], {
                        month: 'short',
                        day: 'numeric',
                      });
                      return (
                        <TouchableOpacity
                          key={event.id}
                          style={styles.eventTile}
                          onPress={() => router.push(`/(tabs)/event-detail?id=${event.id}`)}
                        >
                          <Card style={styles.tileCard}>
                            {event.coverImage && (
                              <Image source={{ uri: event.coverImage }} style={styles.tileImage} />
                            )}
                            <View style={styles.tileContent}>
                              <Text variant="titleSmall" style={styles.tileTitle} numberOfLines={2}>
                                {event.title}
                              </Text>
                              <Text variant="bodySmall" style={styles.tileDate}>
                                {formattedDate}
                              </Text>
                              {event.ticketPrice ? (
                                <Text variant="bodyMedium" style={styles.tilePrice}>
                                  ${event.ticketPrice}
                                </Text>
                              ) : (
                                <Text variant="bodyMedium" style={styles.tileFree}>
                                  Free
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
                    <Text variant="bodyLarge" style={styles.emptyText}>
                      No events
                    </Text>
                    {isAdmin && (
                      <Text variant="bodyMedium" style={styles.emptyHint}>
                        Create your first event to get started!
                      </Text>
                    )}
                  </View>
                )}
              </View>
            </>
          )}

          {/* Store Section */}
          {activeTab === 'store' && (
            <>
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
                  <View style={styles.eventsGrid}>
                    {storeItems.map((item: StoreItem) => {
                      const inStock = item.inventory > item.sold;
                      return (
                        <TouchableOpacity
                          key={item.id}
                          style={styles.eventTile}
                          onPress={() => router.push(`/(tabs)/store/${item.id}`)}
                        >
                          <Card style={styles.tileCard}>
                            {item.images && item.images.length > 0 ? (
                              <Image source={{ uri: item.images[0] }} style={styles.tileImage} />
                            ) : (
                              <View style={[styles.tileImage, { backgroundColor: theme.colors.surfaceVariant, justifyContent: 'center', alignItems: 'center' }]}>
                                <Text variant="bodySmall">No Image</Text>
                              </View>
                            )}
                            <View style={styles.tileContent}>
                              <Text variant="titleSmall" style={styles.tileTitle} numberOfLines={2}>
                                {item.name}
                              </Text>
                              <Text variant="bodyMedium" style={styles.tilePrice}>
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
                    <Text variant="bodyLarge" style={styles.emptyText}>
                      No store items
                    </Text>
                    {isAdmin && (
                      <Text variant="bodyMedium" style={styles.emptyHint}>
                        Add products to your club store!
                      </Text>
                    )}
                  </View>
                )}
              </View>
            </>
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
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroImage: {
    width: '100%',
    height: 400,
    backgroundColor: '#1a1a1a',
  },
  heroGradient: {
    flex: 1,
    justifyContent: 'space-between',
    paddingTop: 60,
    paddingBottom: 32,
  },
  topControls: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  rightControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  controlButton: {
    borderRadius: 25,
    width: 50,
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  creditsChip: {
    borderRadius: 25,
    paddingHorizontal: 12,
    paddingVertical: 4,
    backgroundColor: 'rgba(0,0,0,0.5)',
    flexDirection: 'row',
    alignItems: 'center',
  },
  creditsContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  creditsText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  heroContent: {
    paddingHorizontal: 24,
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
    color: '#fff',
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
    color: '#fff',
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
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  heroChipText: {
    color: '#fff',
  },
  heroMembers: {
    color: 'rgba(255,255,255,0.9)',
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
    color: '#fff',
    fontWeight: 'bold',
  },
  cancelSubscriptionText: {
    color: 'rgba(255,255,255,0.7)',
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
    color: 'rgba(255,255,255,0.8)',
    fontSize: 12,
    marginTop: 8,
    textAlign: 'center',
    maxWidth: 280,
  },
  content: {
    flexGrow: 1,
    minHeight: '100%',
    marginTop: 0,
    paddingTop: 24,
  },
  section: {
    paddingHorizontal: 20,
    marginBottom: 32,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontWeight: 'bold',
  },
  description: {
    lineHeight: 26,
    opacity: 0.9,
  },
  statsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 12,
    marginBottom: 32,
  },
  statCard: {
    flex: 1,
    padding: 16,
    borderRadius: 16,
    backgroundColor: 'rgba(100,100,100,0.1)',
    alignItems: 'center',
  },
  statNumber: {
    fontWeight: 'bold',
    marginBottom: 4,
  },
  statLabel: {
    opacity: 0.7,
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
    opacity: 0.6,
    marginBottom: 8,
  },
  emptyHint: {
    opacity: 0.4,
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
    paddingTop: 8,
    paddingBottom: 16,
    marginBottom: 15,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(128,128,128,0.2)',
  },
  tab: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
  },
  activeTab: {
    backgroundColor: '#60A5FA',
  },
  tabText: {
    fontWeight: '600',
    opacity: 0.6,
  },
  activeTabText: {
    color: '#fff',
    opacity: 1,
  },
  eventsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  eventTile: {
    width: (width - 56) / 2,
    aspectRatio: 1,
  },
  tileCard: {
    height: '100%',
    overflow: 'hidden',
  },
  tileImage: {
    width: '100%',
    height: '50%',
  },
  tileContent: {
    padding: 12,
    flex: 1,
    justifyContent: 'space-between',
  },
  tileTitle: {
    fontWeight: 'bold',
    marginBottom: 4,
  },
  tileDate: {
    opacity: 0.7,
    fontSize: 12,
  },
  tilePrice: {
    fontWeight: 'bold',
    color: '#60A5FA',
    fontSize: 16,
  },
  tileFree: {
    fontWeight: 'bold',
    color: '#4CAF50',
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
    color: '#fff',
    fontWeight: 'bold',
  },
  memberRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(128,128,128,0.2)',
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
