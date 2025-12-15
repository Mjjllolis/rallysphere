// app/club/[id]/manage-members.tsx - Member Management
import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Alert,
  TouchableOpacity,
  RefreshControl,
  Dimensions,
  TextInput,
} from 'react-native';
import {
  Text,
  IconButton,
  ActivityIndicator,
  Button,
  Menu,
} from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../../_layout';
import {
  getClub,
  getClubJoinRequests,
  approveJoinRequest,
  rejectJoinRequest,
  removeMember,
  promoteToAdmin,
  demoteAdmin,
} from '../../../lib/firebase';
import type { Club, ClubJoinRequest } from '../../../lib/firebase';

const SCREEN_WIDTH = Dimensions.get('window').width;

export default function ManageMembersScreen() {
  const { user } = useAuth();
  const { id } = useLocalSearchParams();
  const clubId = id as string;

  const [club, setClub] = useState<Club | null>(null);
  const [joinRequests, setJoinRequests] = useState<ClubJoinRequest[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTab, setSelectedTab] = useState<'members' | 'requests'>('members');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [menuVisible, setMenuVisible] = useState<{ [key: string]: boolean }>({});
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    loadData();
  }, [clubId]);

  const loadData = async () => {
    try {
      setLoading(true);

      const clubResult = await getClub(clubId);
      if (clubResult.success && clubResult.club) {
        setClub(clubResult.club);

        if (user && !clubResult.club.admins.includes(user.uid)) {
          Alert.alert('Access Denied', 'You must be an admin to view this page.');
          router.back();
          return;
        }
      } else {
        router.back();
        return;
      }

      const requestsResult = await getClubJoinRequests(clubId, 'pending');
      if (requestsResult.success) {
        setJoinRequests(requestsResult.requests);
      }
    } catch (error) {
      console.error('Error loading members data:', error);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const toggleMenu = (memberId: string) => {
    setMenuVisible((prev) => ({ ...prev, [memberId]: !prev[memberId] }));
  };

  const closeMenu = (memberId: string) => {
    setMenuVisible((prev) => ({ ...prev, [memberId]: false }));
  };

  const handlePromoteToAdmin = async (userId: string) => {
    closeMenu(userId);
    Alert.alert('Promote to Admin', `Grant admin privileges to ${userId}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Promote',
        onPress: async () => {
          setActionLoading(true);
          const result = await promoteToAdmin(clubId, userId);
          setActionLoading(false);

          if (result.success) {
            Alert.alert('Success', 'Member promoted to admin');
            await loadData();
          } else {
            Alert.alert('Error', result.error || 'Failed to promote member');
          }
        },
      },
    ]);
  };

  const handleDemoteAdmin = async (userId: string) => {
    closeMenu(userId);
    Alert.alert('Demote Admin', `Remove admin privileges from ${userId}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Demote',
        style: 'destructive',
        onPress: async () => {
          setActionLoading(true);
          const result = await demoteAdmin(clubId, userId);
          setActionLoading(false);

          if (result.success) {
            Alert.alert('Success', 'Admin demoted to member');
            await loadData();
          } else {
            Alert.alert('Error', result.error || 'Failed to demote admin');
          }
        },
      },
    ]);
  };

  const handleRemoveMember = async (userId: string) => {
    closeMenu(userId);
    Alert.alert('Remove Member', `Remove ${userId} from the club? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          setActionLoading(true);
          const result = await removeMember(clubId, userId);
          setActionLoading(false);

          if (result.success) {
            Alert.alert('Success', 'Member removed from club');
            await loadData();
          } else {
            Alert.alert('Error', result.error || 'Failed to remove member');
          }
        },
      },
    ]);
  };

  const handleApproveRequest = async (request: ClubJoinRequest) => {
    if (!user) return;

    setActionLoading(true);
    const result = await approveJoinRequest(request.id, clubId, request.userId, user.uid);
    setActionLoading(false);

    if (result.success) {
      Alert.alert('Success', `${request.userName} has been added to the club`);
      await loadData();
    } else {
      Alert.alert('Error', result.error || 'Failed to approve request');
    }
  };

  const handleRejectRequest = async (request: ClubJoinRequest) => {
    if (!user) return;

    Alert.alert('Reject Request', `Reject join request from ${request.userName}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Reject',
        style: 'destructive',
        onPress: async () => {
          setActionLoading(true);
          const result = await rejectJoinRequest(request.id, user.uid);
          setActionLoading(false);

          if (result.success) {
            Alert.alert('Success', 'Join request rejected');
            await loadData();
          } else {
            Alert.alert('Error', result.error || 'Failed to reject request');
          }
        },
      },
    ]);
  };

  const formatDate = (timestamp: any) => {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const filteredMembers = club?.members.filter((memberId) =>
    memberId.toLowerCase().includes(searchQuery.toLowerCase())
  ) || [];

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={StyleSheet.absoluteFill}>
          <View style={styles.blackBackground} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#fff" />
        </View>
      </View>
    );
  }

  if (!club) {
    return null;
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
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <BlurView intensity={40} tint="dark" style={styles.backButtonBlur}>
              <IconButton icon="arrow-left" size={24} iconColor="#fff" />
            </BlurView>
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Manage Members</Text>
            <Text style={styles.headerSubtitle}>{club.name}</Text>
          </View>
        </View>

        {/* Tab Navigation */}
        <View style={styles.tabContainer}>
          <TouchableOpacity
            style={[styles.tab, selectedTab === 'members' && styles.tabActive]}
            onPress={() => setSelectedTab('members')}
          >
            <Text style={[styles.tabText, selectedTab === 'members' && styles.tabTextActive]}>
              Members ({club.members.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tab, selectedTab === 'requests' && styles.tabActive]}
            onPress={() => setSelectedTab('requests')}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={[styles.tabText, selectedTab === 'requests' && styles.tabTextActive]}>
                Join Requests
              </Text>
              {joinRequests.length > 0 && (
                <View style={styles.tabBadge}>
                  <Text style={styles.tabBadgeText}>{joinRequests.length}</Text>
                </View>
              )}
            </View>
          </TouchableOpacity>
        </View>

        {/* Search Bar */}
        {selectedTab === 'members' && (
          <View style={styles.searchContainer}>
            <BlurView intensity={20} tint="dark" style={styles.searchBar}>
              <IconButton icon="magnify" size={20} iconColor="rgba(255,255,255,0.5)" />
              <TextInput
                placeholder="Search members..."
                value={searchQuery}
                onChangeText={setSearchQuery}
                style={styles.searchInput}
                placeholderTextColor="rgba(255,255,255,0.5)"
              />
            </BlurView>
          </View>
        )}

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fff" />}
        >
          {/* Members Tab */}
          {selectedTab === 'members' && (
            <>
              {filteredMembers.length === 0 ? (
                <View style={styles.emptyContainer}>
                  <Text style={styles.emptyText}>No members found</Text>
                </View>
              ) : (
                filteredMembers.map((memberId) => {
                  const isAdmin = club.admins.includes(memberId);
                  const isCreator = memberId === club.createdBy;

                  return (
                    <BlurView key={memberId} intensity={20} tint="dark" style={styles.memberCard}>
                      <View style={styles.memberCardInner}>
                        <View style={styles.avatar}>
                          <Text style={styles.avatarText}>
                            {memberId.substring(0, 2).toUpperCase()}
                          </Text>
                        </View>

                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <Text style={styles.memberName}>{memberId}</Text>
                            {isAdmin && (
                              <View style={styles.adminBadge}>
                                <Text style={styles.adminBadgeText}>Admin</Text>
                              </View>
                            )}
                          </View>
                          {isCreator && (
                            <Text style={styles.memberRole}>Club Creator</Text>
                          )}
                        </View>

                        {!isCreator && memberId !== user?.uid && (
                          <Menu
                            visible={menuVisible[memberId] || false}
                            onDismiss={() => closeMenu(memberId)}
                            anchor={
                              <IconButton
                                icon="dots-vertical"
                                onPress={() => toggleMenu(memberId)}
                                iconColor="#fff"
                              />
                            }
                            contentStyle={{ backgroundColor: '#1F2937' }}
                          >
                            {!isAdmin ? (
                              <Menu.Item
                                onPress={() => handlePromoteToAdmin(memberId)}
                                title="Promote to Admin"
                                leadingIcon="crown"
                                titleStyle={{ color: '#fff' }}
                              />
                            ) : (
                              <Menu.Item
                                onPress={() => handleDemoteAdmin(memberId)}
                                title="Demote to Member"
                                leadingIcon="account-minus"
                                titleStyle={{ color: '#fff' }}
                              />
                            )}
                            <Menu.Item
                              onPress={() => handleRemoveMember(memberId)}
                              title="Remove from Club"
                              leadingIcon="delete"
                              titleStyle={{ color: '#EF4444' }}
                            />
                          </Menu>
                        )}
                      </View>
                    </BlurView>
                  );
                })
              )}
            </>
          )}

          {/* Join Requests Tab */}
          {selectedTab === 'requests' && (
            <>
              {joinRequests.length === 0 ? (
                <View style={styles.emptyContainer}>
                  <IconButton icon="check-circle" size={64} iconColor="#10B981" />
                  <Text style={styles.emptyTitle}>All caught up!</Text>
                  <Text style={styles.emptyText}>No pending join requests</Text>
                </View>
              ) : (
                joinRequests.map((request) => (
                  <BlurView key={request.id} intensity={20} tint="dark" style={styles.requestCard}>
                    <View style={styles.requestCardInner}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.requestName}>{request.userName}</Text>
                        <Text style={styles.requestEmail}>{request.userEmail}</Text>
                        <Text style={styles.requestDate}>{formatDate(request.createdAt)}</Text>
                      </View>

                      {request.message && (
                        <View style={styles.messageContainer}>
                          <Text style={styles.messageLabel}>Message:</Text>
                          <Text style={styles.messageText}>{request.message}</Text>
                        </View>
                      )}

                      <View style={styles.requestActions}>
                        <TouchableOpacity
                          style={[styles.actionButton, styles.rejectButton]}
                          onPress={() => handleRejectRequest(request)}
                          disabled={actionLoading}
                        >
                          <Text style={styles.rejectButtonText}>Reject</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.actionButton, styles.approveButton]}
                          onPress={() => handleApproveRequest(request)}
                          disabled={actionLoading}
                        >
                          <Text style={styles.approveButtonText}>Approve</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </BlurView>
                ))
              )}
            </>
          )}
        </ScrollView>
      </SafeAreaView>
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  backButton: {
    borderRadius: 20,
    overflow: 'hidden',
  },
  backButtonBlur: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#ffffff',
  },
  headerSubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 2,
  },
  tabContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 8,
    marginTop: 16,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'rgba(255,255,255,0.2)',
  },
  tabActive: {
    borderBottomColor: '#60A5FA',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.6)',
  },
  tabTextActive: {
    color: '#60A5FA',
  },
  tabBadge: {
    backgroundColor: '#EF4444',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    minWidth: 20,
    alignItems: 'center',
  },
  tabBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  searchContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  searchInput: {
    flex: 1,
    color: '#fff',
    fontSize: 15,
    paddingRight: 16,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 48,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
    marginTop: 16,
  },
  emptyText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.6)',
    marginTop: 8,
  },
  memberCard: {
    borderRadius: 16,
    marginBottom: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  memberCardInner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(96,165,250,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#60A5FA',
  },
  memberName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  memberRole: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.6)',
    marginTop: 2,
  },
  adminBadge: {
    backgroundColor: '#FFD700',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  adminBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#000',
  },
  requestCard: {
    borderRadius: 16,
    marginBottom: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  requestCardInner: {
    padding: 16,
  },
  requestName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  requestEmail: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 2,
  },
  requestDate: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 4,
  },
  messageContainer: {
    marginTop: 12,
    padding: 12,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 8,
  },
  messageLabel: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.6)',
    marginBottom: 4,
  },
  messageText: {
    fontSize: 14,
    color: '#fff',
  },
  requestActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  actionButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  rejectButton: {
    backgroundColor: 'rgba(239,68,68,0.2)',
    borderWidth: 1,
    borderColor: '#EF4444',
  },
  rejectButtonText: {
    color: '#EF4444',
    fontSize: 15,
    fontWeight: '600',
  },
  approveButton: {
    backgroundColor: '#60A5FA',
  },
  approveButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
});
