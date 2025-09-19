// app/(tabs)/clubs.tsx
import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, Alert, RefreshControl } from 'react-native';
import { 
  Text, 
  FAB, 
  useTheme,
  Searchbar,
  Chip,
  Button,
  Card
} from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useAuth } from '../_layout';
import { getClubs, joinClub, leaveClub, subscribeToClubs } from '../../lib/firebase';
import type { Club } from '../../lib/firebase';
import ClubCard from '../../components/ClubCard';
import JoinClubModal from '../../components/JoinClubModal';

const CATEGORIES = [
  'All', 'Academic', 'Sports', 'Arts & Culture', 'Technology', 'Business',
  'Community Service', 'Hobbies', 'Religious', 'Political', 'Social'
];

export default function ClubsPage() {
  const theme = useTheme();
  const { user } = useAuth();
  
  const [activeTab, setActiveTab] = useState<'discover' | 'my-clubs'>('my-clubs');
  const [myClubs, setMyClubs] = useState<Club[]>([]);
  const [discoverClubs, setDiscoverClubs] = useState<Club[]>([]);
  const [filteredClubs, setFilteredClubs] = useState<Club[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [joinModalVisible, setJoinModalVisible] = useState(false);
  const [selectedClub, setSelectedClub] = useState<Club | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      loadClubs();
      // Set up real-time listener for user's clubs
      const unsubscribe = subscribeToClubs(user.uid, (clubs) => {
        setMyClubs(clubs);
      });
      return unsubscribe;
    }
  }, [user]);

  useEffect(() => {
    filterClubs();
  }, [discoverClubs, searchQuery, selectedCategory]);

  const loadClubs = async () => {
    if (!user) return;
    
    try {
      setLoading(true);
      
      // Load user's clubs
      const myClubsResult = await getClubs(user.uid);
      if (myClubsResult.success) {
        setMyClubs(myClubsResult.clubs);
      }
      
      // Load public clubs for discovery
      const discoverResult = await getClubs();
      if (discoverResult.success) {
        // Filter out clubs user is already a member of
        const userClubIds = myClubsResult.clubs.map(club => club.id);
        const availableClubs = discoverResult.clubs.filter(club => !userClubIds.includes(club.id));
        setDiscoverClubs(availableClubs);
      }
    } catch (error) {
      console.error('Error loading clubs:', error);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadClubs();
    setRefreshing(false);
  };

  const filterClubs = () => {
    let filtered = discoverClubs;
    
    // Filter by category
    if (selectedCategory !== 'All') {
      filtered = filtered.filter(club => club.category === selectedCategory);
    }
    
    // Filter by search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(club => 
        club.name.toLowerCase().includes(query) ||
        club.description.toLowerCase().includes(query) ||
        club.category.toLowerCase().includes(query) ||
        (club.tags && club.tags.some(tag => tag.toLowerCase().includes(query)))
      );
    }
    
    setFilteredClubs(filtered);
  };

  const handleJoinClub = async (clubId: string, message?: string) => {
    if (!user) return;
    
    setActionLoading(clubId);
    try {
      const result = await joinClub(clubId, user.uid, user.email || '', user.displayName || '', message);
      if (result.success) {
        if (result.approved) {
          Alert.alert('Success!', 'You have joined the club!');
          await loadClubs(); // Refresh clubs
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
      setActionLoading(null);
    }
  };

  const handleLeaveClub = async (clubId: string) => {
    if (!user) return;
    
    Alert.alert(
      'Leave Club',
      'Are you sure you want to leave this club?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Leave', 
          style: 'destructive',
          onPress: async () => {
            setActionLoading(clubId);
            try {
              const result = await leaveClub(clubId, user.uid);
              if (result.success) {
                Alert.alert('Success', 'You have left the club');
                await loadClubs(); // Refresh clubs
              } else {
                Alert.alert('Error', result.error || 'Failed to leave club');
              }
            } catch (error) {
              console.error('Error leaving club:', error);
              Alert.alert('Error', 'An unexpected error occurred');
            } finally {
              setActionLoading(null);
            }
          }
        }
      ]
    );
  };

  const openJoinModal = (club: Club) => {
    setSelectedClub(club);
    setJoinModalVisible(true);
  };

  const handleJoinFromModal = async (message: string) => {
    if (selectedClub) {
      await handleJoinClub(selectedClub.id, message);
    }
  };

  if (!user) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
        <View style={styles.emptyState}>
          <Text variant="headlineSmall">Please log in to view clubs</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={styles.header}>
        <Text variant="headlineMedium" style={[styles.title, { color: theme.colors.onSurface }]}>
          Clubs
        </Text>
        
        {/* Tab Switcher */}
        <View style={styles.tabContainer}>
          <Button
            mode={activeTab === 'my-clubs' ? 'contained' : 'outlined'}
            onPress={() => setActiveTab('my-clubs')}
            style={styles.tabButton}
            compact
          >
            My Clubs ({myClubs.length})
          </Button>
          <Button
            mode={activeTab === 'discover' ? 'contained' : 'outlined'}
            onPress={() => setActiveTab('discover')}
            style={styles.tabButton}
            compact
          >
            Discover
          </Button>
        </View>
      </View>

      {activeTab === 'discover' && (
        <View style={styles.filtersContainer}>
          {/* Search Bar */}
          <Searchbar
            placeholder="Search clubs..."
            onChangeText={setSearchQuery}
            value={searchQuery}
            style={styles.searchBar}
          />
          
          {/* Category Filter */}
          <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={false}
            style={styles.categoryFilter}
            contentContainerStyle={styles.categoryContent}
          >
            {CATEGORIES.map((category) => (
              <Chip
                key={category}
                selected={selectedCategory === category}
                onPress={() => setSelectedCategory(category)}
                style={styles.categoryChip}
                showSelectedOverlay
              >
                {category}
              </Chip>
            ))}
          </ScrollView>
        </View>
      )}

      <ScrollView
        style={styles.scrollView}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {activeTab === 'my-clubs' ? (
          myClubs.length > 0 ? (
            myClubs.map((club) => (
              <ClubCard
                key={club.id}
                club={club}
                isJoined={true}
                onLeave={handleLeaveClub}
                loading={actionLoading === club.id}
              />
            ))
          ) : (
            <Card style={styles.emptyCard}>
              <Card.Content style={styles.emptyContent}>
                <Text variant="titleMedium" style={styles.emptyTitle}>
                  No clubs yet
                </Text>
                <Text variant="bodyMedium" style={styles.emptyText}>
                  Join some clubs to get started!
                </Text>
                <Button
                  mode="contained"
                  onPress={() => setActiveTab('discover')}
                  style={styles.discoverButton}
                >
                  Discover Clubs
                </Button>
              </Card.Content>
            </Card>
          )
        ) : (
          filteredClubs.length > 0 ? (
            filteredClubs.map((club) => (
              <ClubCard
                key={club.id}
                club={club}
                isJoined={false}
                onJoin={(clubId) => {
                  const club = filteredClubs.find(c => c.id === clubId);
                  if (club && !club.isPublic) {
                    openJoinModal(club);
                  } else {
                    handleJoinClub(clubId);
                  }
                }}
                loading={actionLoading === club.id}
              />
            ))
          ) : (
            <Card style={styles.emptyCard}>
              <Card.Content style={styles.emptyContent}>
                <Text variant="titleMedium" style={styles.emptyTitle}>
                  No clubs found
                </Text>
                <Text variant="bodyMedium" style={styles.emptyText}>
                  Try adjusting your search or filters
                </Text>
              </Card.Content>
            </Card>
          )
        )}
      </ScrollView>

      <FAB
        icon="plus"
        style={[styles.fab, { backgroundColor: theme.colors.primary }]}
        onPress={() => router.push('/club/create')}
      />

      <JoinClubModal
        visible={joinModalVisible}
        onDismiss={() => setJoinModalVisible(false)}
        onJoin={handleJoinFromModal}
        clubName={selectedClub?.name || ''}
        requiresApproval={!selectedClub?.isPublic}
        loading={selectedClub ? actionLoading === selectedClub.id : false}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    padding: 20,
    paddingBottom: 10,
  },
  title: {
    fontWeight: 'bold',
    marginBottom: 16,
  },
  tabContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  tabButton: {
    flex: 1,
  },
  filtersContainer: {
    paddingHorizontal: 20,
    paddingBottom: 10,
  },
  searchBar: {
    marginBottom: 12,
  },
  categoryFilter: {
    marginBottom: 8,
  },
  categoryContent: {
    paddingRight: 20,
  },
  categoryChip: {
    marginRight: 8,
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
  emptyCard: {
    margin: 20,
  },
  emptyContent: {
    alignItems: 'center',
    padding: 20,
  },
  emptyTitle: {
    marginBottom: 8,
    fontWeight: 'bold',
  },
  emptyText: {
    textAlign: 'center',
    marginBottom: 16,
    opacity: 0.7,
  },
  discoverButton: {
    marginTop: 8,
  },
  fab: {
    position: 'absolute',
    bottom: 16,
    right: 16,
  },
});
