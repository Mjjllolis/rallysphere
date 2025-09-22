// app/club/[id].tsx
import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, Alert, Image, Linking } from 'react-native';
import { 
  Text, 
  Button, 
  Card,
  Chip,
  IconButton,
  Divider,
  useTheme,
  Appbar
} from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { useAuth } from '../_layout';
import { getClub, joinClub, leaveClub, getEvents } from '../../lib/firebase';
import type { Club, Event } from '../../lib/firebase';
import EventCard from '../../components/EventCard';
import JoinClubModal from '../../components/JoinClubModal';

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

  useEffect(() => {
    if (clubId) {
      loadClubData();
    }
  }, [clubId]);

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

  const openSocialLink = (url: string) => {
    if (url.startsWith('http')) {
      Linking.openURL(url);
    } else {
      Linking.openURL(`https://${url}`);
    }
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
  const upcomingEvents = events.filter(event => {
    const eventDate = event.startDate.toDate ? event.startDate.toDate() : new Date(event.startDate);
    return eventDate > new Date();
  });

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {/* App Bar with Back Button */}
      <Appbar.Header>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title={club.name} titleStyle={{ fontSize: 18 }} />
      </Appbar.Header>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Cover Image */}
        {club.coverImage && (
          <Image source={{ uri: club.coverImage }} style={styles.coverImage} />
        )}

        {/* Club Header */}
        <Card style={styles.headerCard}>
          <Card.Content style={styles.headerContent}>
            <View style={styles.clubHeader}>
              <View style={styles.clubInfo}>
                {club.logo && (
                  <Image source={{ uri: club.logo }} style={styles.logo} />
                )}
                <View style={styles.titleSection}>
                  <Text variant="headlineMedium" style={styles.clubName}>
                    {club.name}
                  </Text>
                  <Chip style={styles.categoryChip}>
                    {club.category}
                  </Chip>
                </View>
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
                  style={styles.joinButton}
                >
                  Join Club
                </Button>
              )}
              
              {isJoined && (
                <Button
                  mode="outlined"
                  onPress={handleLeaveClub}
                  loading={actionLoading}
                  style={styles.leaveButton}
                >
                  Leave Club
                </Button>
              )}
              
              {isAdmin && (
                <Button
                  mode="contained-tonal"
                  onPress={() => router.push(`/club/edit/${club.id}`)}
                  style={styles.editButton}
                  icon="pencil"
                >
                  Edit Club
                </Button>
              )}
            </View>

            <Text variant="bodyLarge" style={styles.description}>
              {club.description}
            </Text>

            {/* Club Stats */}
            <View style={styles.statsSection}>
              <View style={styles.stat}>
                <Text variant="titleMedium" style={styles.statNumber}>
                  {club.members.length}
                </Text>
                <Text variant="bodySmall" style={styles.statLabel}>
                  Members
                </Text>
              </View>
              <View style={styles.stat}>
                <Text variant="titleMedium" style={styles.statNumber}>
                  {events.length}
                </Text>
                <Text variant="bodySmall" style={styles.statLabel}>
                  Events
                </Text>
              </View>
            </View>

            {/* Club Details */}
            <Divider style={styles.divider} />
            
            {(club.location || club.university || club.contactEmail) && (
              <View style={styles.detailsSection}>
                {club.location && (
                  <View style={styles.detailRow}>
                    <Text variant="bodyMedium">📍 {club.location}</Text>
                  </View>
                )}
                {club.university && (
                  <View style={styles.detailRow}>
                    <Text variant="bodyMedium">🏫 {club.university}</Text>
                  </View>
                )}
                {club.contactEmail && (
                  <View style={styles.detailRow}>
                    <Text variant="bodyMedium">✉️ {club.contactEmail}</Text>
                  </View>
                )}
              </View>
            )}

            {/* Social Links */}
            {club.socialLinks && (
              <View style={styles.socialSection}>
                {club.socialLinks.website && (
                  <IconButton
                    icon="web"
                    mode="contained-tonal"
                    onPress={() => openSocialLink(club.socialLinks!.website!)}
                  />
                )}
                {club.socialLinks.instagram && (
                  <IconButton
                    icon="instagram"
                    mode="contained-tonal"
                    onPress={() => openSocialLink(`https://instagram.com/${club.socialLinks!.instagram!.replace('@', '')}`)}
                  />
                )}
                {club.socialLinks.twitter && (
                  <IconButton
                    icon="twitter"
                    mode="contained-tonal"
                    onPress={() => openSocialLink(`https://twitter.com/${club.socialLinks!.twitter!.replace('@', '')}`)}
                  />
                )}
                {club.socialLinks.discord && (
                  <IconButton
                    icon="discord"
                    mode="contained-tonal"
                    onPress={() => openSocialLink(club.socialLinks!.discord!)}
                  />
                )}
              </View>
            )}

            {/* Tags */}
            {club.tags && club.tags.length > 0 && (
              <>
                <Divider style={styles.divider} />
                <View style={styles.tagsSection}>
                  <Text variant="titleMedium" style={styles.sectionTitle}>
                    Tags
                  </Text>
                  <View style={styles.tags}>
                    {club.tags.map((tag) => (
                      <Chip key={tag} style={styles.tag}>
                        {tag}
                      </Chip>
                    ))}
                  </View>
                </View>
              </>
            )}
          </Card.Content>
        </Card>

        {/* Upcoming Events */}
        {upcomingEvents.length > 0 && (
          <Card style={styles.eventsCard}>
            <Card.Content style={styles.eventsContent}>
              <View style={styles.eventsHeader}>
                <Text variant="titleLarge" style={styles.eventsTitle}>
                  Upcoming Events
                </Text>
                {isAdmin && (
                  <Button
                    mode="contained"
                    onPress={() => router.push(`/event/create?clubId=${club.id}`)}
                    icon="plus"
                    compact
                  >
                    Create Event
                  </Button>
                )}
              </View>
              {upcomingEvents.length > 0 ? (
                <>
                  {upcomingEvents.slice(0, 3).map((event) => (
                    <EventCard
                      key={event.id}
                      event={event}
                      isAttending={user ? event.attendees.includes(user.uid) : false}
                      isWaitlisted={user ? event.waitlist.includes(user.uid) : false}
                    />
                  ))}
                  {upcomingEvents.length > 3 && (
                    <Button
                      mode="outlined"
                      onPress={() => router.push('/(tabs)/events')}
                      style={styles.viewAllButton}
                    >
                      View All Events
                    </Button>
                  )}
                </>
              ) : (
                <View style={styles.noEventsContainer}>
                  <Text variant="bodyMedium" style={styles.noEventsText}>
                    No upcoming events yet
                  </Text>
                  {isAdmin && (
                    <Text variant="bodySmall" style={styles.noEventsHint}>
                      Create your first event to get started!
                    </Text>
                  )}
                </View>
              )}
            </Card.Content>
          </Card>
        )}
      </ScrollView>



      <JoinClubModal
        visible={joinModalVisible}
        onDismiss={() => setJoinModalVisible(false)}
        onJoin={handleJoinClub}
        clubName={club.name}
        requiresApproval={!club.isPublic}
        loading={actionLoading}
      />
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  coverImage: {
    width: '100%',
    height: 200,
  },
  headerCard: {
    margin: 16,
    marginTop: club => club.coverImage ? -40 : 16,
    zIndex: 1,
  },
  headerContent: {
    padding: 20,
  },
  clubHeader: {
    marginBottom: 16,
  },
  clubInfo: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  logo: {
    width: 60,
    height: 60,
    borderRadius: 30,
    marginRight: 16,
  },
  titleSection: {
    flex: 1,
  },
  clubName: {
    fontWeight: 'bold',
    marginBottom: 8,
  },
  categoryChip: {
    alignSelf: 'flex-start',
  },
  joinButton: {
    alignSelf: 'flex-start',
  },
  leaveButton: {
    alignSelf: 'flex-start',
  },
  editButton: {
    alignSelf: 'flex-start',
    marginTop: 8,
  },
  description: {
    marginBottom: 16,
    lineHeight: 24,
  },
  statsSection: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 16,
  },
  stat: {
    alignItems: 'center',
  },
  statNumber: {
    fontWeight: 'bold',
  },
  statLabel: {
    opacity: 0.7,
  },
  divider: {
    marginVertical: 16,
  },
  detailsSection: {
    marginBottom: 16,
  },
  detailRow: {
    marginBottom: 8,
  },
  socialSection: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 16,
  },
  tagsSection: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontWeight: 'bold',
    marginBottom: 8,
  },
  tags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  tag: {
    marginRight: 8,
    marginBottom: 8,
  },
  eventsCard: {
    margin: 16,
    marginTop: 8,
  },
  eventsContent: {
    padding: 20,
  },
  eventsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  eventsTitle: {
    fontWeight: 'bold',
    flex: 1,
  },
  noEventsContainer: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  noEventsText: {
    marginBottom: 8,
    opacity: 0.7,
  },
  noEventsHint: {
    opacity: 0.5,
    textAlign: 'center',
  },
  viewAllButton: {
    marginTop: 16,
  },

});
