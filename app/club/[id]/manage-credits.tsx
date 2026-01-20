// app/club/[id]/manage-credits.tsx
import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  StatusBar,
  TextInput as RNTextInput,
  RefreshControl,
  Image,
} from 'react-native';
import {
  Text,
  ActivityIndicator,
  Portal,
  Modal,
  IconButton,
  TextInput,
} from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { useAuth } from '../../_layout';
import {
  getClub,
  getUserProfile,
  getUserRallyCredits,
  adminAddRallyCredits,
  adminRemoveRallyCredits,
  adminSetRallyCredits,
} from '../../../lib/firebase';
import type { Club, UserProfile, UserRallyCredits } from '../../../lib/firebase';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

interface MemberWithCredits {
  userId: string;
  profile: UserProfile;
  credits: number;
}

export default function ManageCreditsScreen() {
  const { user } = useAuth();
  const { id } = useLocalSearchParams();
  const clubId = id as string;

  const [club, setClub] = useState<Club | null>(null);
  const [members, setMembers] = useState<MemberWithCredits[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Modal state
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedMember, setSelectedMember] = useState<MemberWithCredits | null>(null);
  const [action, setAction] = useState<'add' | 'remove' | 'set'>('add');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    if (clubId && user) {
      loadData();
    }
  }, [clubId, user]);

  const loadData = async () => {
    try {
      setLoading(true);

      // Load club
      const clubResult = await getClub(clubId);
      if (clubResult.success && clubResult.club) {
        setClub(clubResult.club);

        // Check admin access
        if (user && !clubResult.club.admins.includes(user.uid) && clubResult.club.owner !== user.uid) {
          Alert.alert('Access Denied', 'You must be an admin to manage credits.');
          router.back();
          return;
        }

        // Load all members with their credits
        const membersWithCredits: MemberWithCredits[] = [];
        for (const memberId of clubResult.club.members) {
          try {
            const profile = await getUserProfile(memberId);
            const creditsResult = await getUserRallyCredits(memberId);

            if (profile) {
              const credits = creditsResult.success && creditsResult.credits
                ? creditsResult.credits.clubCredits?.[clubId] || 0
                : 0;

              membersWithCredits.push({
                userId: memberId,
                profile,
                credits,
              });
            }
          } catch (error) {
            console.error('Error loading member data:', error);
          }
        }

        // Sort by credits (highest first)
        membersWithCredits.sort((a, b) => b.credits - a.credits);
        setMembers(membersWithCredits);
      } else {
        Alert.alert('Error', 'Club not found');
        router.back();
      }
    } catch (error) {
      console.error('Error loading data:', error);
      Alert.alert('Error', 'Failed to load member credits');
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const openModal = (member: MemberWithCredits, actionType: 'add' | 'remove' | 'set') => {
    setSelectedMember(member);
    setAction(actionType);
    setAmount('');
    setReason('');
    setModalVisible(true);
  };

  const handleSubmit = async () => {
    if (!selectedMember || !user || !club) return;

    const amountNum = parseInt(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid positive number');
      return;
    }

    if (!reason.trim()) {
      Alert.alert('Missing Reason', 'Please provide a reason for this adjustment');
      return;
    }

    try {
      setProcessing(true);

      let result;
      if (action === 'add') {
        result = await adminAddRallyCredits(
          user.uid,
          selectedMember.userId,
          clubId,
          club.name,
          amountNum,
          reason
        );
      } else if (action === 'remove') {
        result = await adminRemoveRallyCredits(
          user.uid,
          selectedMember.userId,
          clubId,
          club.name,
          amountNum,
          reason
        );
      } else {
        result = await adminSetRallyCredits(
          user.uid,
          selectedMember.userId,
          clubId,
          club.name,
          amountNum,
          reason
        );
      }

      if (result.success) {
        Alert.alert(
          'Success',
          `Successfully ${action === 'add' ? 'added' : action === 'remove' ? 'removed' : 'set'} credits`,
          [
            {
              text: 'OK',
              onPress: () => {
                setModalVisible(false);
                setSelectedMember(null);
                loadData();
              },
            },
          ]
        );
      } else {
        Alert.alert('Error', result.error || 'Failed to update credits');
      }
    } catch (error: any) {
      console.error('Error updating credits:', error);
      Alert.alert('Error', error.message || 'Failed to update credits');
    } finally {
      setProcessing(false);
    }
  };

  const filteredMembers = members.filter((member) => {
    const query = searchQuery.toLowerCase();
    return (
      member.profile.displayName?.toLowerCase().includes(query) ||
      member.profile.email?.toLowerCase().includes(query)
    );
  });

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={StyleSheet.absoluteFill}>
          <View style={styles.blackBackground} />
        </View>

        <LinearGradient
          colors={['rgba(96, 165, 250, 0.3)', 'rgba(139, 92, 246, 0.1)', 'rgba(0, 0, 0, 0)']}
          locations={[0, 0.3, 1]}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />

        <SafeAreaView style={styles.safeArea} edges={['top']}>
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#60A5FA" />
          </View>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* Black Background */}
      <View style={StyleSheet.absoluteFill}>
        <View style={styles.blackBackground} />
      </View>

      <LinearGradient
        colors={['rgba(96, 165, 250, 0.3)', 'rgba(139, 92, 246, 0.1)', 'rgba(0, 0, 0, 0)']}
        locations={[0, 0.3, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      <SafeAreaView style={styles.safeArea} edges={['top']}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => router.back()}
            activeOpacity={0.7}
            style={styles.headerButtonWrapper}
          >
            <BlurView intensity={40} tint="dark" style={styles.headerButton}>
              <IconButton icon="arrow-left" iconColor="white" size={24} style={{ margin: 0 }} />
            </BlurView>
          </TouchableOpacity>

          <View style={styles.headerTitleContainer}>
            <Text style={styles.headerTitle}>Manage Credits</Text>
            <Text style={styles.headerSubtitle}>{club?.name}</Text>
          </View>

          <View style={styles.headerSpacer} />
        </View>

        {/* Search Bar */}
        <View style={styles.searchContainer}>
          <BlurView intensity={20} tint="dark" style={styles.searchBlur}>
            <Ionicons name="search" size={20} color="rgba(255,255,255,0.5)" />
            <RNTextInput
              style={styles.searchInput}
              placeholder="Search members..."
              placeholderTextColor="rgba(255,255,255,0.5)"
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Ionicons name="close-circle" size={20} color="rgba(255,255,255,0.5)" />
              </TouchableOpacity>
            )}
          </BlurView>
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#60A5FA"
            />
          }
        >
          {filteredMembers.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="people-outline" size={64} color="rgba(255,255,255,0.3)" />
              <Text style={styles.emptyText}>
                {searchQuery ? 'No members found' : 'No members yet'}
              </Text>
            </View>
          ) : (
            <View style={styles.membersList}>
              {filteredMembers.map((member) => (
                <View key={member.userId} style={styles.memberCardWrapper}>
                  <BlurView intensity={20} tint="dark" style={styles.memberCard}>
                    {/* Member Info */}
                    <View style={styles.memberInfo}>
                      <View style={styles.memberAvatar}>
                        {member.profile.photoURL ? (
                          <Image
                            source={{ uri: member.profile.photoURL }}
                            style={styles.avatarImage}
                          />
                        ) : (
                          <View style={styles.avatarPlaceholder}>
                            <Text style={styles.avatarText}>
                              {member.profile.displayName?.charAt(0).toUpperCase() || 'M'}
                            </Text>
                          </View>
                        )}
                      </View>

                      <View style={styles.memberDetails}>
                        <Text style={styles.memberName}>{member.profile.displayName || 'Member'}</Text>
                        <Text style={styles.memberEmail}>{member.profile.email}</Text>
                      </View>

                      <View style={styles.creditsDisplay}>
                        <Ionicons name="star" size={20} color="#FFD700" />
                        <Text style={styles.creditsAmount}>{member.credits}</Text>
                      </View>
                    </View>

                    {/* Action Buttons */}
                    <View style={styles.actionButtons}>
                      <TouchableOpacity
                        style={[styles.actionButton, styles.addButton]}
                        onPress={() => openModal(member, 'add')}
                        activeOpacity={0.7}
                      >
                        <Ionicons name="add-circle" size={20} color="#22C55E" />
                        <Text style={[styles.actionButtonText, { color: '#22C55E' }]}>Add</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[styles.actionButton, styles.removeButton]}
                        onPress={() => openModal(member, 'remove')}
                        activeOpacity={0.7}
                      >
                        <Ionicons name="remove-circle" size={20} color="#EF4444" />
                        <Text style={[styles.actionButtonText, { color: '#EF4444' }]}>Remove</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[styles.actionButton, styles.setButton]}
                        onPress={() => openModal(member, 'set')}
                        activeOpacity={0.7}
                      >
                        <Ionicons name="create" size={20} color="#60A5FA" />
                        <Text style={[styles.actionButtonText, { color: '#60A5FA' }]}>Set</Text>
                      </TouchableOpacity>
                    </View>
                  </BlurView>
                </View>
              ))}
            </View>
          )}

          <View style={styles.bottomSpacer} />
        </ScrollView>
      </SafeAreaView>

      {/* Action Modal */}
      <Portal>
        <Modal
          visible={modalVisible}
          onDismiss={() => setModalVisible(false)}
          contentContainerStyle={styles.modalContent}
        >
          <View style={styles.modalBlur}>
            {/* Header */}
            <View style={styles.modalHeader}>
              <Text style={styles.modalHeaderText}>
                {action === 'add' ? 'Add Credits' : action === 'remove' ? 'Remove Credits' : 'Set Credits'}
              </Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <IconButton icon="close" iconColor="white" size={24} style={{ margin: 0 }} />
              </TouchableOpacity>
            </View>

            {selectedMember && (
              <View style={styles.modalBody}>
                {/* Member Info */}
                <View style={styles.modalMemberInfo}>
                  <Text style={styles.modalMemberName}>{selectedMember.profile.displayName}</Text>
                  <Text style={styles.modalCurrentCredits}>
                    Current: {selectedMember.credits} credits
                  </Text>
                </View>

                <View style={styles.modalDivider} />

                {/* Amount Input */}
                <View style={styles.inputContainer}>
                  <Text style={styles.inputLabel}>Amount</Text>
                  <TextInput
                    mode="outlined"
                    value={amount}
                    onChangeText={setAmount}
                    keyboardType="number-pad"
                    placeholder="Enter amount"
                    style={styles.input}
                    theme={{
                      colors: {
                        primary: '#60A5FA',
                        text: '#ffffff',
                        placeholder: 'rgba(255,255,255,0.5)',
                        background: 'rgba(255,255,255,0.05)',
                      },
                    }}
                  />
                </View>

                {/* Reason Input */}
                <View style={styles.inputContainer}>
                  <Text style={styles.inputLabel}>Reason</Text>
                  <TextInput
                    mode="outlined"
                    value={reason}
                    onChangeText={setReason}
                    placeholder="e.g., Bonus for event participation"
                    multiline
                    numberOfLines={3}
                    style={[styles.input, { height: 80 }]}
                    theme={{
                      colors: {
                        primary: '#60A5FA',
                        text: '#ffffff',
                        placeholder: 'rgba(255,255,255,0.5)',
                        background: 'rgba(255,255,255,0.05)',
                      },
                    }}
                  />
                </View>

                {action === 'set' && amount && (
                  <View style={styles.previewBox}>
                    <Ionicons name="information-circle" size={20} color="#60A5FA" />
                    <Text style={styles.previewText}>
                      Will set credits to {amount} ({parseInt(amount) - selectedMember.credits >= 0 ? '+' : ''}
                      {parseInt(amount) - selectedMember.credits})
                    </Text>
                  </View>
                )}
              </View>
            )}

            {/* Footer */}
            <View style={styles.modalFooter}>
              <TouchableOpacity
                onPress={() => setModalVisible(false)}
                disabled={processing}
                style={styles.modalCancelButton}
                activeOpacity={0.7}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleSubmit}
                disabled={processing}
                style={styles.modalSubmitButton}
                activeOpacity={0.7}
              >
                <LinearGradient
                  colors={action === 'add' ? ['#22C55E', '#16A34A'] : action === 'remove' ? ['#EF4444', '#DC2626'] : ['#60A5FA', '#3B82F6']}
                  style={styles.modalSubmitButtonGradient}
                >
                  {processing ? (
                    <ActivityIndicator color="white" size="small" />
                  ) : (
                    <Text style={styles.modalSubmitText}>Confirm</Text>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </Portal>
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerButtonWrapper: {
    borderRadius: 20,
    overflow: 'hidden',
  },
  headerButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden',
  },
  headerTitleContainer: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#ffffff',
  },
  headerSubtitle: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.6)',
    marginTop: 2,
  },
  headerSpacer: {
    width: 40,
  },
  searchContainer: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 16,
    borderRadius: 12,
    overflow: 'hidden',
  },
  searchBlur: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    gap: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden',
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#ffffff',
    padding: 0,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
    gap: 12,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.8)',
    marginTop: 8,
  },
  membersList: {
    gap: 12,
  },
  memberCardWrapper: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  memberCard: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden',
    gap: 12,
  },
  memberInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  memberAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarPlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: '#60A5FA',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#ffffff',
  },
  memberDetails: {
    flex: 1,
  },
  memberName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
  memberEmail: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.6)',
    marginTop: 2,
  },
  creditsDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255, 215, 0, 0.15)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  creditsAmount: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFD700',
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  addButton: {
    backgroundColor: 'rgba(34, 197, 94, 0.1)',
    borderColor: 'rgba(34, 197, 94, 0.3)',
  },
  removeButton: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  setButton: {
    backgroundColor: 'rgba(96, 165, 250, 0.1)',
    borderColor: 'rgba(96, 165, 250, 0.3)',
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  modalContent: {
    margin: 20,
    borderRadius: 20,
    maxWidth: 500,
    alignSelf: 'center',
    width: '90%',
    overflow: 'hidden',
  },
  modalBlur: {
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: 'rgba(20, 20, 20, 0.98)',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
  },
  modalHeaderText: {
    fontSize: 22,
    fontWeight: '700',
    color: '#ffffff',
  },
  modalBody: {
    padding: 24,
  },
  modalMemberInfo: {
    alignItems: 'center',
    marginBottom: 8,
  },
  modalMemberName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 4,
  },
  modalCurrentCredits: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.7)',
  },
  modalDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
    marginVertical: 20,
  },
  inputContainer: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.8)',
    marginBottom: 8,
  },
  input: {
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  previewBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(96, 165, 250, 0.1)',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(96, 165, 250, 0.2)',
    marginTop: 8,
  },
  previewText: {
    flex: 1,
    fontSize: 13,
    color: 'rgba(255,255,255,0.8)',
  },
  modalFooter: {
    flexDirection: 'row',
    gap: 12,
    padding: 20,
  },
  modalCancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCancelText: {
    fontSize: 15,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.8)',
  },
  modalSubmitButton: {
    flex: 1,
    borderRadius: 12,
    overflow: 'hidden',
  },
  modalSubmitButtonGradient: {
    paddingVertical: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalSubmitText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#ffffff',
  },
  bottomSpacer: {
    height: 40,
  },
});
