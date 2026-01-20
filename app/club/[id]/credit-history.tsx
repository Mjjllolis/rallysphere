// app/club/[id]/credit-history.tsx - User Credit History Screen
import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import {
  Text,
  IconButton,
  ActivityIndicator,
} from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../../_layout';
import {
  getClub,
  getUserRallyCredits,
  confirmAllPendingCredits,
} from '../../../lib/firebase';
import type { Club, UserRallyCredits, RallyCreditTransaction } from '../../../lib/firebase';

const TRANSACTION_CONFIG: Record<string, { icon: string; color: string; bgColor: string }> = {
  pending: { icon: 'clock-outline', color: '#F59E0B', bgColor: 'rgba(245, 158, 11, 0.2)' },
  confirmed: { icon: 'check-circle', color: '#10B981', bgColor: 'rgba(16, 185, 129, 0.2)' },
  earned: { icon: 'plus-circle', color: '#10B981', bgColor: 'rgba(16, 185, 129, 0.2)' },
  redeemed: { icon: 'gift', color: '#8B5CF6', bgColor: 'rgba(139, 92, 246, 0.2)' },
  forfeited: { icon: 'minus-circle', color: '#EF4444', bgColor: 'rgba(239, 68, 68, 0.2)' },
  expired: { icon: 'clock-alert', color: '#6B7280', bgColor: 'rgba(107, 114, 128, 0.2)' },
};

export default function CreditHistoryScreen() {
  const { user } = useAuth();
  const { id } = useLocalSearchParams();
  const clubId = id as string;

  const [club, setClub] = useState<Club | null>(null);
  const [credits, setCredits] = useState<UserRallyCredits | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadData();
  }, [clubId, user]);

  const loadData = async () => {
    if (!user) return;

    try {
      setLoading(true);

      const clubResult = await getClub(clubId);
      if (clubResult.success && clubResult.club) {
        setClub(clubResult.club);
      }

      // Confirm any pending credits for events user has been checked into
      await confirmAllPendingCredits(user.uid);

      const creditsResult = await getUserRallyCredits(user.uid);
      if (creditsResult.success && creditsResult.credits) {
        setCredits(creditsResult.credits);
      }
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const getClubCredits = () => {
    if (!credits) return { available: 0, pending: 0 };
    return {
      available: credits.clubCredits?.[clubId] || 0,
      pending: credits.pendingClubCredits?.[clubId] || 0,
    };
  };

  const getClubTransactions = (): RallyCreditTransaction[] => {
    if (!credits?.transactions) return [];
    return credits.transactions
      .filter(t => t.clubId === clubId)
      .sort((a, b) => {
        const dateA = typeof a.createdAt === 'string' ? new Date(a.createdAt) : a.createdAt?.toDate?.() || new Date(0);
        const dateB = typeof b.createdAt === 'string' ? new Date(b.createdAt) : b.createdAt?.toDate?.() || new Date(0);
        return dateB.getTime() - dateA.getTime();
      });
  };

  const formatDate = (date: any) => {
    const d = typeof date === 'string' ? new Date(date) : date?.toDate?.() || new Date();
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const getTransactionConfig = (type: string) => {
    return TRANSACTION_CONFIG[type] || TRANSACTION_CONFIG.earned;
  };

  const clubCredits = getClubCredits();
  const transactions = getClubTransactions();

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

  return (
    <View style={styles.container}>
      <View style={StyleSheet.absoluteFill}>
        <View style={styles.blackBackground} />
      </View>

      <LinearGradient
        colors={['rgba(255, 215, 0, 0.15)', 'rgba(255, 215, 0, 0.05)', 'rgba(0, 0, 0, 0)']}
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
          <View style={styles.headerInfo}>
            <Text style={styles.headerTitle}>Rally Credits</Text>
            <Text style={styles.headerSubtitle}>{club?.name}</Text>
          </View>
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fff" />
          }
        >
          {/* Balance Card */}
          <BlurView intensity={30} tint="dark" style={styles.balanceCard}>
            <View style={styles.balanceCardInner}>
              <View style={styles.balanceHeader}>
                <IconButton icon="star" size={28} iconColor="#FFD700" />
                <Text style={styles.balanceTitle}>Your Credits</Text>
              </View>

              <View style={styles.balanceRow}>
                <View style={styles.balanceItem}>
                  <Text style={styles.balanceLabel}>Available</Text>
                  <Text style={styles.balanceValue}>{clubCredits.available}</Text>
                  <Text style={styles.balanceSubtext}>Ready to spend</Text>
                </View>

                <View style={styles.balanceDivider} />

                <View style={styles.balanceItem}>
                  <View style={styles.pendingLabelRow}>
                    <Text style={styles.balanceLabel}>Pending</Text>
                    <TouchableOpacity>
                      <IconButton icon="information-outline" size={16} iconColor="rgba(255,255,255,0.5)" />
                    </TouchableOpacity>
                  </View>
                  <Text style={styles.pendingBalance}>{clubCredits.pending}</Text>
                  <Text style={styles.balanceSubtext}>Awaiting check-in</Text>
                </View>
              </View>

              {clubCredits.pending > 0 && (
                <View style={styles.pendingInfo}>
                  <IconButton icon="information" size={18} iconColor="#F59E0B" />
                  <Text style={styles.pendingInfoText}>
                    Pending credits are awarded when you check in at events. Visit the event and get checked in by staff to unlock them!
                  </Text>
                </View>
              )}

              {/* Redeem Button */}
              {clubCredits.available > 0 && (
                <TouchableOpacity
                  style={styles.redeemButton}
                  onPress={() => router.push(`/club/${clubId}/redeem-credits`)}
                >
                  <Text style={styles.redeemButtonText}>Redeem Credits</Text>
                  <IconButton icon="arrow-right" size={18} iconColor="#000" />
                </TouchableOpacity>
              )}
            </View>
          </BlurView>

          {/* Transaction History */}
          <View style={styles.historySection}>
            <Text style={styles.sectionTitle}>Transaction History</Text>

            {transactions.length === 0 ? (
              <View style={styles.emptyState}>
                <IconButton icon="history" size={48} iconColor="rgba(255,255,255,0.3)" />
                <Text style={styles.emptyText}>No transactions yet</Text>
                <Text style={styles.emptySubtext}>Join events to earn Rally Credits!</Text>
              </View>
            ) : (
              transactions.map((transaction, index) => {
                const config = getTransactionConfig(transaction.type);
                const isPositive = transaction.amount > 0;

                return (
                  <BlurView
                    key={transaction.id || index}
                    intensity={15}
                    tint="dark"
                    style={styles.transactionCard}
                  >
                    <View style={styles.transactionCardInner}>
                      <View style={[styles.transactionIcon, { backgroundColor: config.bgColor }]}>
                        <IconButton icon={config.icon} size={20} iconColor={config.color} style={styles.transactionIconButton} />
                      </View>

                      <View style={styles.transactionInfo}>
                        <Text style={styles.transactionDescription}>{transaction.description}</Text>
                        {transaction.eventName && (
                          <Text style={styles.transactionEvent}>{transaction.eventName}</Text>
                        )}
                        <Text style={styles.transactionDate}>{formatDate(transaction.createdAt)}</Text>
                      </View>

                      <Text
                        style={[
                          styles.transactionAmount,
                          { color: isPositive ? '#10B981' : '#EF4444' },
                        ]}
                      >
                        {isPositive ? '+' : ''}{transaction.amount}
                      </Text>
                    </View>
                  </BlurView>
                );
              })
            )}
          </View>
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
  headerInfo: {
    flex: 1,
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
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  balanceCard: {
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 215, 0, 0.3)',
    marginBottom: 24,
  },
  balanceCardInner: {
    padding: 20,
  },
  balanceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  balanceTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  balanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  balanceItem: {
    flex: 1,
    alignItems: 'center',
  },
  balanceLabel: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.6)',
    marginBottom: 4,
  },
  balanceValue: {
    fontSize: 36,
    fontWeight: '700',
    color: '#FFD700',
  },
  pendingBalance: {
    fontSize: 36,
    fontWeight: '700',
    color: '#F59E0B',
  },
  balanceSubtext: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.4)',
    marginTop: 4,
  },
  balanceDivider: {
    width: 1,
    height: 60,
    backgroundColor: 'rgba(255,255,255,0.1)',
    marginHorizontal: 16,
  },
  pendingLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  pendingInfo: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    borderRadius: 12,
    padding: 12,
    marginTop: 16,
    gap: 4,
  },
  pendingInfoText: {
    flex: 1,
    fontSize: 13,
    color: 'rgba(255,255,255,0.7)',
    lineHeight: 18,
  },
  redeemButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFD700',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 20,
    marginTop: 20,
  },
  redeemButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
  },
  historySection: {
    marginTop: 8,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 16,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.3)',
    marginTop: 4,
  },
  transactionCard: {
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  transactionCardInner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    gap: 12,
  },
  transactionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  transactionIconButton: {
    margin: 0,
  },
  transactionInfo: {
    flex: 1,
  },
  transactionDescription: {
    fontSize: 14,
    fontWeight: '500',
    color: '#fff',
  },
  transactionEvent: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 2,
  },
  transactionDate: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.4)',
    marginTop: 4,
  },
  transactionAmount: {
    fontSize: 18,
    fontWeight: '700',
  },
});
