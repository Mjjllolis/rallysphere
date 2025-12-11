// app/(tabs)/clubs.tsx
import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, Alert, RefreshControl, TouchableOpacity } from 'react-native';
import {
  Text,
  Searchbar,
  IconButton
} from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
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
      <View style={styles.container}>
        {/* Black Background */}
        <View style={StyleSheet.absoluteFill}>
          <View style={styles.blackBackground} />
        </View>

        {/* Subtle Gradient Overlay */}
        <LinearGradient
          colors={['rgba(27, 54, 93, 0.3)', 'rgba(96, 165, 250, 0.1)', 'rgba(0, 0, 0, 0)']}
          locations={[0, 0.3, 1]}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />

        <SafeAreaView style={styles.safeArea} edges={['top']}>
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>Please log in to view clubs</Text>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Black Background */}
      <View style={StyleSheet.absoluteFill}>
        <View style={styles.blackBackground} />
      </View>

      {/* Subtle Gradient Overlay */}
      <LinearGradient
        colors={['rgba(27, 54, 93, 0.3)', 'rgba(96, 165, 250, 0.1)', 'rgba(0, 0, 0, 0)']}
        locations={[0, 0.3, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      <SafeAreaView style={styles.safeArea} edges={['top']}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Clubs</Text>

          {/* Tab Switcher with Create Button */}
          <View style={styles.tabContainer}>
            <View style={styles.tabsWrapper}>
              <TouchableOpacity
                style={[styles.tab, activeTab === 'my-clubs' && styles.tabActive]}
                onPress={() => setActiveTab('my-clubs')}
              >
                <IconButton
                  icon={activeTab === 'my-clubs' ? 'account-group' : 'account-group-outline'}
                  iconColor={activeTab === 'my-clubs' ? '#fff' : 'rgba(255,255,255,0.6)'}
                  size={18}
                  style={{ margin: 0 }}
                />
                <Text style={[styles.tabText, activeTab === 'my-clubs' && styles.tabTextActive]}>
                  My Clubs
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.tab, activeTab === 'discover' && styles.tabActive]}
                onPress={() => setActiveTab('discover')}
              >
                <IconButton
                  icon={activeTab === 'discover' ? 'compass' : 'compass-outline'}
                  iconColor={activeTab === 'discover' ? '#fff' : 'rgba(255,255,255,0.6)'}
                  size={18}
                  style={{ margin: 0 }}
                />
                <Text style={[styles.tabText, activeTab === 'discover' && styles.tabTextActive]}>
                  Discover
                </Text>
              </TouchableOpacity>
            </View>

            {/* Create Button */}
            <TouchableOpacity
              onPress={() => router.push('/(tabs)/create?type=club')}
              activeOpacity={0.7}
            >
              <BlurView intensity={20} tint="dark" style={styles.createButton}>
                <IconButton icon="plus" iconColor="#60A5FA" size={18} style={{ margin: 0 }} />
              </BlurView>
            </TouchableOpacity>
          </View>
        </View>

        {activeTab === 'discover' && (
          <View style={styles.filtersContainer}>
            {/* Search Bar */}
            <BlurView intensity={20} tint="dark" style={styles.searchBarContainer}>
              <Searchbar
                placeholder="Search clubs..."
                onChangeText={setSearchQuery}
                value={searchQuery}
                style={styles.searchBar}
                iconColor="rgba(255,255,255,0.7)"
                placeholderTextColor="rgba(255,255,255,0.5)"
                inputStyle={{ color: '#fff' }}
              />
            </BlurView>

            {/* Category Filter */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.categoryFilter}
              contentContainerStyle={styles.categoryContent}
            >
              {CATEGORIES.map((category) => (
                <TouchableOpacity
                  key={category}
                  onPress={() => setSelectedCategory(category)}
                  activeOpacity={0.7}
                >
                  <BlurView
                    intensity={selectedCategory === category ? 30 : 15}
                    tint="dark"
                    style={[
                      styles.categoryChip,
                      selectedCategory === category && styles.categoryChipSelected
                    ]}
                  >
                    <Text
                      style={[
                        styles.categoryText,
                        selectedCategory === category && styles.categoryTextSelected
                      ]}
                    >
                      {category}
                    </Text>
                  </BlurView>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fff" />
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
                  compact
                />
              ))
            ) : (
              <BlurView intensity={20} tint="dark" style={styles.emptyCard}>
                <View style={styles.emptyContent}>
                  <IconButton icon="account-group-outline" size={64} iconColor="rgba(255,255,255,0.5)" />
                  <Text style={styles.emptyTitle}>No clubs yet</Text>
                  <Text style={styles.emptyText}>
                    Join some clubs to get started!
                  </Text>
                  <TouchableOpacity
                    onPress={() => setActiveTab('discover')}
                    activeOpacity={0.7}
                  >
                    <BlurView intensity={30} tint="dark" style={styles.discoverButton}>
                      <View style={styles.discoverButtonInner}>
                        <IconButton icon="compass" iconColor="#60A5FA" size={20} style={{ margin: 0 }} />
                        <Text style={styles.discoverButtonText}>Discover Clubs</Text>
                      </View>
                    </BlurView>
                  </TouchableOpacity>
                </View>
              </BlurView>
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
                  compact
                />
              ))
            ) : (
              <BlurView intensity={20} tint="dark" style={styles.emptyCard}>
                <View style={styles.emptyContent}>
                  <IconButton icon="magnify" size={64} iconColor="rgba(255,255,255,0.5)" />
                  <Text style={styles.emptyTitle}>No clubs found</Text>
                  <Text style={styles.emptyText}>
                    Try adjusting your search or filters
                  </Text>
                </View>
              </BlurView>
            )
          )}
        </ScrollView>
      </SafeAreaView>



      <JoinClubModal
        visible={joinModalVisible}
        onDismiss={() => setJoinModalVisible(false)}
        onJoin={handleJoinFromModal}
        clubName={selectedClub?.name || ''}
        requiresApproval={!selectedClub?.isPublic}
        loading={selectedClub ? actionLoading === selectedClub.id : false}
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
    backgroundColor: '#000000',
  },
  safeArea: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 4,
  },
  tabContainer: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  tabsWrapper: {
    flex: 1,
    flexDirection: 'row',
    gap: 8,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    gap: 6,
  },
  tabActive: {
    backgroundColor: '#60A5FA',
    borderColor: '#60A5FA',
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.6)',
  },
  tabTextActive: {
    color: '#ffffff',
  },
  createButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  filtersContainer: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 12,
  },
  searchBarContainer: {
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  searchBar: {
    backgroundColor: 'transparent',
    elevation: 0,
  },
  categoryFilter: {
    flexGrow: 0,
  },
  categoryContent: {
    gap: 8,
    paddingRight: 16,
  },
  categoryChip: {
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden',
  },
  categoryChipSelected: {
    borderColor: '#60A5FA',
  },
  categoryText: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.7)',
  },
  categoryTextSelected: {
    color: '#ffffff',
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
    padding: 20,
  },
  emptyCard: {
    margin: 20,
    marginTop: 40,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  emptyContent: {
    alignItems: 'center',
    padding: 32,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#ffffff',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
    color: 'rgba(255,255,255,0.6)',
    marginBottom: 24,
  },
  discoverButton: {
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  discoverButtonInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 20,
    gap: 8,
  },
  discoverButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#60A5FA',
  },
});
