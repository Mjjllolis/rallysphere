// app/club/[id]/redeem-credits.tsx
import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  StatusBar,
  RefreshControl,
} from 'react-native';
import {
  Text,
  ActivityIndicator,
  Portal,
  Modal,
  IconButton,
} from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { useAuth } from '../../_layout';
import {
  getClubRedemptions,
  getUserRallyCredits,
  redeemRallyCredits,
  getClub,
  confirmAllPendingCredits,
} from '../../../lib/firebase';
import type { RallyCreditRedemption, UserRallyCredits, Club, RallyCreditTransaction } from '../../../lib/firebase';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

export default function RedeemCreditsScreen() {
  const { user } = useAuth();
  const { id } = useLocalSearchParams();
  const clubId = id as string;

  const [club, setClub] = useState<Club | null>(null);
  const [redemptions, setRedemptions] = useState<RallyCreditRedemption[]>([]);
  const [userCredits, setUserCredits] = useState<UserRallyCredits | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedRedemption, setSelectedRedemption] = useState<RallyCreditRedemption | null>(null);
  const [confirmModalVisible, setConfirmModalVisible] = useState(false);
  const [historyModalVisible, setHistoryModalVisible] = useState(false);
  const [redeeming, setRedeeming] = useState(false);

  useEffect(() => {
    if (clubId && user) {
      loadData();
    }
  }, [clubId, user]);

  const loadData = async () => {
    try {
      setLoading(true);

      // Load club details
      const clubResult = await getClub(clubId);
      if (clubResult.success && clubResult.club) {
        setClub(clubResult.club);
      }

      // Load redemptions
      const redemptionsResult = await getClubRedemptions(clubId);
      if (redemptionsResult.success) {
        setRedemptions(redemptionsResult.redemptions);
      }

      // Load user credits
      if (user) {
        // First confirm any pending credits
        await confirmAllPendingCredits(user.uid);

        const creditsResult = await getUserRallyCredits(user.uid);
        if (creditsResult.success && creditsResult.credits) {
          setUserCredits(creditsResult.credits);
        }
      }
    } catch (error) {
      console.error('Error loading redemption data:', error);
      Alert.alert('Error', 'Failed to load redemption options');
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const getAvailableCredits = () => {
    if (!userCredits || !clubId) return 0;
    return userCredits.clubCredits?.[clubId] || 0;
  };

  const getPendingCredits = () => {
    if (!userCredits || !clubId) return 0;
    return userCredits.pendingClubCredits?.[clubId] || 0;
  };

  const openConfirmModal = (redemption: RallyCreditRedemption) => {
    setSelectedRedemption(redemption);
    setConfirmModalVisible(true);
  };

  const handleRedeem = async () => {
    if (!selectedRedemption || !user || !club) return;

    try {
      setRedeeming(true);

      const result = await redeemRallyCredits(
        user.uid,
        selectedRedemption.id,
        clubId,
        club.name
      );

      if (result.success) {
        Alert.alert(
          'Success!',
          `You've redeemed ${selectedRedemption.name}!`,
          [
            {
              text: 'OK',
              onPress: () => {
                setConfirmModalVisible(false);
                setSelectedRedemption(null);
                loadData(); // Refresh data
              },
            },
          ]
        );
      } else {
        Alert.alert('Error', result.error || 'Failed to redeem');
      }
    } catch (error: any) {
      console.error('Error redeeming credits:', error);
      Alert.alert('Error', error.message || 'Failed to redeem');
    } finally {
      setRedeeming(false);
    }
  };

  const getIconForType = (type: string) => {
    switch (type) {
      case 'store_discount':
        return 'tag-outline';
      case 'event_discount':
        return 'ticket-outline';
      case 'free_item':
        return 'gift';
      case 'event_free_admission':
        return 'ticket';
      case 'custom':
        return 'star';
      default:
        return 'star-outline';
    }
  };

  const getColorForType = (type: string) => {
    switch (type) {
      case 'store_discount':
        return '#60A5FA';
      case 'event_discount':
        return '#A78BFA';
      case 'free_item':
        return '#F59E0B';
      case 'event_free_admission':
        return '#10B981';
      case 'custom':
        return '#EC4899';
      default:
        return '#60A5FA';
    }
  };

  const canAfford = (creditsRequired: number) => {
    return getAvailableCredits() >= creditsRequired;
  };

  const getClubTransactions = (): RallyCreditTransaction[] => {
    if (!userCredits?.transactions) return [];
    return userCredits.transactions
      .filter((t: RallyCreditTransaction) => t.clubId === clubId)
      .sort((a: RallyCreditTransaction, b: RallyCreditTransaction) => {
        const dateA = typeof a.createdAt === 'string' ? new Date(a.createdAt) : (a.createdAt as any)?.toDate?.() || new Date(0);
        const dateB = typeof b.createdAt === 'string' ? new Date(b.createdAt) : (b.createdAt as any)?.toDate?.() || new Date(0);
        return dateB.getTime() - dateA.getTime();
      });
  };

  const formatDate = (date: any) => {
    const d = typeof date === 'string' ? new Date(date) : date?.toDate?.() || new Date();
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const getTransactionIcon = (type: string) => {
    switch (type) {
      case 'pending': return 'time-outline';
      case 'confirmed': return 'checkmark-circle';
      case 'earned': return 'add-circle';
      case 'redeemed': return 'gift';
      case 'spent': return 'cart';
      case 'forfeited': return 'close-circle';
      case 'forfeited_pending': return 'close-circle-outline';
      case 'expired': return 'alert-circle';
      default: return 'ellipse';
    }
  };

  const getTransactionColor = (type: string) => {
    switch (type) {
      case 'pending': return '#F59E0B';
      case 'confirmed': return '#10B981';
      case 'earned': return '#10B981';
      case 'redeemed': return '#8B5CF6';
      case 'spent': return '#8B5CF6';
      case 'forfeited': return '#EF4444';
      case 'forfeited_pending': return '#EF4444';
      case 'expired': return '#6B7280';
      default: return '#60A5FA';
    }
  };

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

  const availableCredits = getAvailableCredits();
  const pendingCredits = getPendingCredits();

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
            <Text style={styles.headerTitle}>Redeem Rewards</Text>
            <Text style={styles.headerSubtitle}>{club?.name}</Text>
          </View>

          <View style={styles.headerSpacer} />
        </View>

        {/* Credits Balance Card - Clickable to show history */}
        <TouchableOpacity
          style={styles.balanceCardContainer}
          onPress={() => setHistoryModalVisible(true)}
          activeOpacity={0.8}
        >
          <BlurView intensity={30} tint="dark" style={styles.balanceCard}>
            <View style={styles.balanceContent}>
              <Ionicons name="star" size={32} color="#FFD700" />
              <View style={styles.balanceTextContainer}>
                <Text style={styles.balanceLabel}>Available to Spend</Text>
                <View style={styles.balanceAmountRow}>
                  <Text style={styles.balanceAmount}>{availableCredits.toLocaleString()}</Text>
                  <Text style={styles.balanceValue}>= ${(availableCredits * 0.01).toFixed(2)}</Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.5)" />
            </View>
            {pendingCredits > 0 && (
              <View style={styles.pendingRow}>
                <Ionicons name="time-outline" size={16} color="#F59E0B" />
                <Text style={styles.pendingText}>
                  {pendingCredits} pending (check-in required)
                </Text>
              </View>
            )}
            <View style={styles.tapHintRow}>
              <Text style={styles.tapHintText}>Tap to view history</Text>
            </View>
          </BlurView>
        </TouchableOpacity>

        {/* Pending Credits Info Banner */}
        {pendingCredits > 0 && (
          <View style={styles.pendingBanner}>
            <Ionicons name="information-circle" size={18} color="#F59E0B" />
            <Text style={styles.pendingBannerText}>
              Pending credits become available after you check in at events
            </Text>
          </View>
        )}

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
          {redemptions.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="gift-outline" size={64} color="rgba(255,255,255,0.3)" />
              <Text style={styles.emptyText}>No rewards available yet</Text>
              <Text style={styles.emptySubtext}>
                Check back later for exciting redemption options!
              </Text>
            </View>
          ) : (
            <View style={styles.redemptionsGrid}>
              {redemptions.map((redemption) => {
                const affordable = canAfford(redemption.creditsRequired);
                const iconColor = getColorForType(redemption.type);

                return (
                  <TouchableOpacity
                    key={redemption.id}
                    style={styles.redemptionCardWrapper}
                    onPress={() => openConfirmModal(redemption)}
                    activeOpacity={0.7}
                    disabled={!affordable}
                  >
                    <BlurView
                      intensity={affordable ? 30 : 15}
                      tint="dark"
                      style={[
                        styles.redemptionCard,
                        !affordable && styles.redemptionCardDisabled,
                      ]}
                    >
                      {/* Icon */}
                      <View
                        style={[
                          styles.redemptionIcon,
                          { backgroundColor: `${iconColor}20` },
                        ]}
                      >
                        <Ionicons
                          name={getIconForType(redemption.type) as any}
                          size={28}
                          color={iconColor}
                        />
                      </View>

                      {/* Content */}
                      <View style={styles.redemptionContent}>
                        <Text
                          style={[
                            styles.redemptionName,
                            !affordable && styles.redemptionNameDisabled,
                          ]}
                          numberOfLines={2}
                        >
                          {redemption.name}
                        </Text>

                        {redemption.description && (
                          <Text
                            style={styles.redemptionDescription}
                            numberOfLines={2}
                          >
                            {redemption.description}
                          </Text>
                        )}

                        {/* Price Badge */}
                        <View style={styles.priceBadgeContainer}>
                          <View
                            style={[
                              styles.priceBadge,
                              affordable
                                ? styles.priceBadgeAffordable
                                : styles.priceBadgeExpensive,
                            ]}
                          >
                            <Ionicons
                              name="star"
                              size={14}
                              color={affordable ? '#FFD700' : 'rgba(255,255,255,0.4)'}
                            />
                            <Text
                              style={[
                                styles.priceText,
                                affordable
                                  ? styles.priceTextAffordable
                                  : styles.priceTextExpensive,
                              ]}
                            >
                              {redemption.creditsRequired.toLocaleString()}
                            </Text>
                          </View>

                          {!affordable && (
                            <Text style={styles.insufficientText}>
                              Need {(redemption.creditsRequired - availableCredits).toLocaleString()} more
                            </Text>
                          )}
                        </View>
                      </View>
                    </BlurView>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          <View style={styles.bottomSpacer} />
        </ScrollView>
      </SafeAreaView>

      {/* Confirmation Modal */}
      <Portal>
        <Modal
          visible={confirmModalVisible}
          onDismiss={() => setConfirmModalVisible(false)}
          contentContainerStyle={styles.modalContent}
        >
          <View style={styles.modalBlur}>
            {/* Header */}
            <View style={styles.modalHeader}>
              <Text style={styles.modalHeaderText}>Confirm Redemption</Text>
              <TouchableOpacity onPress={() => setConfirmModalVisible(false)}>
                <IconButton icon="close" iconColor="white" size={24} style={{ margin: 0 }} />
              </TouchableOpacity>
            </View>

            {selectedRedemption && (
              <View style={styles.modalBody}>
                {/* Icon */}
                <View
                  style={[
                    styles.modalIcon,
                    {
                      backgroundColor: `${getColorForType(selectedRedemption.type)}20`,
                    },
                  ]}
                >
                  <Ionicons
                    name={getIconForType(selectedRedemption.type) as any}
                    size={48}
                    color={getColorForType(selectedRedemption.type)}
                  />
                </View>

                {/* Details */}
                <Text style={styles.modalRewardName}>{selectedRedemption.name}</Text>

                {selectedRedemption.description && (
                  <Text style={styles.modalRewardDescription}>
                    {selectedRedemption.description}
                  </Text>
                )}

                <View style={styles.modalDivider} />

                {/* Cost */}
                <View style={styles.modalCostRow}>
                  <Text style={styles.modalCostLabel}>Cost</Text>
                  <View style={styles.modalCostValue}>
                    <Ionicons name="star" size={20} color="#FFD700" />
                    <Text style={styles.modalCostText}>
                      {selectedRedemption.creditsRequired.toLocaleString()} credits
                    </Text>
                  </View>
                </View>

                {/* Balance After */}
                <View style={styles.modalCostRow}>
                  <Text style={styles.modalCostLabel}>Balance After</Text>
                  <View style={styles.modalCostValue}>
                    <Ionicons name="star" size={20} color="#60A5FA" />
                    <Text style={styles.modalCostText}>
                      {(availableCredits - selectedRedemption.creditsRequired).toLocaleString()} credits
                    </Text>
                  </View>
                </View>

                <View style={styles.modalDivider} />

                {/* Info */}
                <View style={styles.infoBox}>
                  <Ionicons name="information-circle" size={20} color="#60A5FA" />
                  <Text style={styles.infoText}>
                    This redemption will be recorded and your credits will be deducted immediately.
                  </Text>
                </View>
              </View>
            )}

            {/* Footer */}
            <View style={styles.modalFooter}>
              <TouchableOpacity
                onPress={() => setConfirmModalVisible(false)}
                disabled={redeeming}
                style={styles.modalCancelButton}
                activeOpacity={0.7}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleRedeem}
                disabled={redeeming}
                style={styles.modalRedeemButton}
                activeOpacity={0.7}
              >
                <LinearGradient
                  colors={['#60A5FA', '#3B82F6']}
                  style={styles.modalRedeemButtonGradient}
                >
                  {redeeming ? (
                    <ActivityIndicator color="white" size="small" />
                  ) : (
                    <Text style={styles.modalRedeemText}>Redeem Now</Text>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* History Modal */}
        <Modal
          visible={historyModalVisible}
          onDismiss={() => setHistoryModalVisible(false)}
          contentContainerStyle={styles.historyModalContent}
        >
          <View style={styles.historyModalBlur}>
            {/* Header */}
            <View style={styles.historyModalHeader}>
              <Text style={styles.historyModalTitle}>Credit History</Text>
              <TouchableOpacity onPress={() => setHistoryModalVisible(false)}>
                <IconButton icon="close" iconColor="white" size={24} style={{ margin: 0 }} />
              </TouchableOpacity>
            </View>

            {/* Balance Summary */}
            <View style={styles.historyBalanceSummary}>
              <View style={styles.historyBalanceItem}>
                <Ionicons name="star" size={20} color="#FFD700" />
                <Text style={styles.historyBalanceLabel}>Available</Text>
                <Text style={styles.historyBalanceValue}>{availableCredits}</Text>
              </View>
              <View style={styles.historyBalanceDivider} />
              <View style={styles.historyBalanceItem}>
                <Ionicons name="time-outline" size={20} color="#F59E0B" />
                <Text style={styles.historyBalanceLabel}>Pending</Text>
                <Text style={[styles.historyBalanceValue, { color: '#F59E0B' }]}>{pendingCredits}</Text>
              </View>
            </View>

            {/* Credit Value Info */}
            <View style={styles.creditValueInfo}>
              <Ionicons name="information-circle" size={16} color="#60A5FA" />
              <Text style={styles.creditValueText}>1 Rally Credit = $0.01</Text>
            </View>

            {/* Transaction List */}
            <ScrollView style={styles.historyScrollView} showsVerticalScrollIndicator={false}>
              {getClubTransactions().length === 0 ? (
                <View style={styles.historyEmptyState}>
                  <Ionicons name="receipt-outline" size={48} color="rgba(255,255,255,0.3)" />
                  <Text style={styles.historyEmptyText}>No transactions yet</Text>
                </View>
              ) : (
                getClubTransactions().map((transaction, index) => (
                  <View key={transaction.id || index} style={styles.historyTransactionItem}>
                    <View style={[styles.historyTransactionIcon, { backgroundColor: `${getTransactionColor(transaction.type)}20` }]}>
                      <Ionicons
                        name={getTransactionIcon(transaction.type) as any}
                        size={18}
                        color={getTransactionColor(transaction.type)}
                      />
                    </View>
                    <View style={styles.historyTransactionInfo}>
                      <Text style={styles.historyTransactionDesc} numberOfLines={1}>
                        {transaction.description || transaction.eventName || 'Transaction'}
                      </Text>
                      <Text style={styles.historyTransactionDate}>{formatDate(transaction.createdAt)}</Text>
                    </View>
                    <Text style={[
                      styles.historyTransactionAmount,
                      { color: transaction.amount > 0 ? '#10B981' : '#EF4444' }
                    ]}>
                      {transaction.amount > 0 ? '+' : ''}{transaction.amount}
                    </Text>
                  </View>
                ))
              )}
            </ScrollView>
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
  balanceCardContainer: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 16,
    borderRadius: 16,
    overflow: 'hidden',
  },
  balanceCard: {
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden',
  },
  balanceContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  balanceTextContainer: {
    flex: 1,
    gap: 4,
  },
  balanceLabel: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.7)',
    fontWeight: '500',
  },
  balanceAmountRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  balanceAmount: {
    fontSize: 28,
    fontWeight: '800',
    color: '#ffffff',
  },
  balanceValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#60A5FA',
  },
  tapHintRow: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
  },
  tapHintText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.4)',
  },
  pendingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  pendingText: {
    fontSize: 14,
    color: '#F59E0B',
    fontWeight: '500',
  },
  pendingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 12,
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.2)',
  },
  pendingBannerText: {
    flex: 1,
    fontSize: 13,
    color: 'rgba(255,255,255,0.7)',
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
  emptySubtext: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center',
    paddingHorizontal: 40,
  },
  redemptionsGrid: {
    gap: 16,
  },
  redemptionCardWrapper: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  redemptionCard: {
    flexDirection: 'row',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden',
    gap: 16,
  },
  redemptionCardDisabled: {
    opacity: 0.5,
  },
  redemptionIcon: {
    width: 56,
    height: 56,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  redemptionContent: {
    flex: 1,
    gap: 8,
  },
  redemptionName: {
    fontSize: 17,
    fontWeight: '700',
    color: '#ffffff',
  },
  redemptionNameDisabled: {
    color: 'rgba(255,255,255,0.5)',
  },
  redemptionDescription: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.7)',
    lineHeight: 20,
  },
  priceBadgeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 4,
  },
  priceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  priceBadgeAffordable: {
    backgroundColor: 'rgba(255, 215, 0, 0.15)',
  },
  priceBadgeExpensive: {
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  priceText: {
    fontSize: 14,
    fontWeight: '700',
  },
  priceTextAffordable: {
    color: '#FFD700',
  },
  priceTextExpensive: {
    color: 'rgba(255,255,255,0.4)',
  },
  insufficientText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
    fontStyle: 'italic',
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
    alignItems: 'center',
  },
  modalIcon: {
    width: 80,
    height: 80,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalRewardName: {
    fontSize: 20,
    fontWeight: '700',
    color: '#ffffff',
    textAlign: 'center',
    marginBottom: 8,
  },
  modalRewardDescription: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
    lineHeight: 22,
  },
  modalDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignSelf: 'stretch',
    marginVertical: 20,
  },
  modalCostRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    alignSelf: 'stretch',
    marginBottom: 12,
  },
  modalCostLabel: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.7)',
    fontWeight: '500',
  },
  modalCostValue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  modalCostText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ffffff',
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: 'rgba(96, 165, 250, 0.1)',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(96, 165, 250, 0.2)',
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    color: 'rgba(255,255,255,0.8)',
    lineHeight: 19,
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
  modalRedeemButton: {
    flex: 1,
    borderRadius: 12,
    overflow: 'hidden',
  },
  modalRedeemButtonGradient: {
    paddingVertical: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalRedeemText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#ffffff',
  },
  // History Modal Styles
  historyModalContent: {
    margin: 16,
    borderRadius: 20,
    maxWidth: 500,
    alignSelf: 'center',
    width: '94%',
    maxHeight: '90%',
    overflow: 'hidden',
  },
  historyModalBlur: {
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: 'rgba(20, 20, 20, 0.98)',
  },
  historyModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
  },
  historyModalTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#ffffff',
  },
  historyBalanceSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 20,
    padding: 16,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
  },
  historyBalanceItem: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  historyBalanceLabel: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.6)',
  },
  historyBalanceValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFD700',
  },
  historyBalanceDivider: {
    width: 1,
    height: 40,
    backgroundColor: 'rgba(255,255,255,0.1)',
    marginHorizontal: 16,
  },
  creditValueInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginHorizontal: 20,
    marginTop: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(96, 165, 250, 0.1)',
    borderRadius: 8,
  },
  creditValueText: {
    fontSize: 12,
    color: '#60A5FA',
    fontWeight: '500',
  },
  historyScrollView: {
    flex: 1,
    maxHeight: 500,
    marginTop: 16,
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  historyEmptyState: {
    alignItems: 'center',
    paddingVertical: 40,
    gap: 12,
  },
  historyEmptyText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.5)',
  },
  historyTransactionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
    gap: 12,
  },
  historyTransactionIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  historyTransactionInfo: {
    flex: 1,
  },
  historyTransactionDesc: {
    fontSize: 14,
    fontWeight: '500',
    color: '#ffffff',
  },
  historyTransactionDate: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.4)',
    marginTop: 2,
  },
  historyTransactionAmount: {
    fontSize: 16,
    fontWeight: '700',
  },
  bottomSpacer: {
    height: 40,
  },
});
